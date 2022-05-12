//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IRouter.sol";
import "./interfaces/ILiquidityPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title A Router for interfacing with a liquiditiy pool
/// @author Kevin Cowley
contract Router is IRouter, Ownable {
    /// @notice Contract interface of the associated liquidity pool
    ILiquidityPool public pool;
    /// @notice Contract interface of the associated Space Coin
    IERC20 public spcToken;

    /// @notice Guard against reentrancy
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;
    modifier nonReentrant() {
        require(_status != _ENTERED, "REENTRANT_CALL");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    constructor(address _pool, address _spcToken) {
        pool = ILiquidityPool(_pool);
        spcToken = IERC20(_spcToken);
    }

    /// @notice Calculates proper amounts of SPC and ETH and add liquidity to the pool
    /// @param depositedSpc How much SPC is intended to be deposited
    function addLiquidity(uint256 depositedSpc)
        external
        payable
        override
        nonReentrant
    {
        uint256 amountEth;
        uint256 amountSpc;
        (uint256 reserveEth, uint256 reserveSpc) = pool.getReserves();

        if (reserveEth == 0 && reserveSpc == 0) {
            amountEth = msg.value;
            amountSpc = depositedSpc;
        } else {
            /// @notice calculate the value of ETH that matches the value of deposited SPC
            uint256 expectedEth = quote(depositedSpc, reserveSpc, reserveEth);
            if (expectedEth <= msg.value) {
                /// @notice the user deposited too much value ETH for the amount of SPC, refund extra ETH
                amountEth = expectedEth;
                amountSpc = depositedSpc;
                (bool success, ) = msg.sender.call{
                    value: msg.value - amountEth
                }("");
                require(success, "FAILED_ETH_REFUND");
            } else {
                /// @notice calculate the amount of SPC that can be deposited based on an ETH limit
                uint256 expectedSpc = quote(msg.value, reserveEth, reserveSpc);
                /// @dev this assert should NEVER throw
                assert(expectedSpc <= depositedSpc);
                amountEth = msg.value;
                amountSpc = expectedSpc;
            }
        }

        /// @notice send eth to pool
        (bool successEth, ) = address(pool).call{value: amountEth}("");
        require(successEth, "FAILED_ETH_TRANSFER");

        /// @notice transfer tokens to pool (assume SPC balance has already been approved)
        bool successSpc = spcToken.transferFrom(
            msg.sender,
            address(pool),
            amountSpc
        );
        require(successSpc, "FAILED_SPC_TRANSFER");

        /// @notice mint tokens for sender
        pool.mint(msg.sender);
    }

    /// @notice Transfer KVY Tokens to the pool and receive ETH + SPC back
    /// @param liquidity Amount of KVY tokens to be burned
    function removeLiquidity(uint256 liquidity) external override nonReentrant {
        (uint256 reserveEth, uint256 reserveSpc) = pool.getReserves();
        require(
            reserveEth > 0 && reserveSpc > 0 && liquidity > 0,
            "INSUFFICIENT_LIQUIDITY"
        );

        /// @notice send KVY to liquidity pool
        bool successSpc = pool.transferFrom(
            msg.sender,
            address(pool),
            liquidity
        );
        require(successSpc, "FAILED_SPC_TRANSFER");
        /// @notice burn KVY tokens and return ETH + SPC
        pool.burn(msg.sender);
    }

    /// @notice Calculate quantity of token to be deposited based on the quantity of the other token
    /// @param amountA Know quantity of a token
    /// @param reserveA Accounted for quanitity in the liquidity pool
    /// @param reserveB Accounted for quanitity in the liquidity pool
    /// @return amountB Calculated quantity of the token
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) internal pure returns (uint256 amountB) {
        require(amountA > 0, "INSUFFICIENT_AMOUNT");
        /// @dev this assert should NEVER happen, if reserveA or reserveB is zero, addLiquidity() should not call quote
        assert(reserveA > 0 && reserveB > 0);
        /// @dev base equation: x1 / y1 = x2 / y2
        amountB = (amountA * reserveB) / reserveA;
    }

    /// @notice Deposit ETH into the pool and receive equal value of SPC
    /// @param minSpcReturn minimum amount user will accept for swap. Rely on client to convert from slippage %
    function swapEthForSpc(uint256 minSpcReturn)
        external
        payable
        override
        nonReentrant
    {
        (uint256 reserveEth, uint256 reserveSpc) = pool.getReserves();

        /// @notice calculate how much SPC to return after taking out 1% fee of ETH deposit
        uint256 spcToSender = getAmountOut(msg.value, reserveEth, reserveSpc);
        require(spcToSender > minSpcReturn, "SLIPPAGE");

        /// @notice send ETH to pool
        (bool success, ) = address(pool).call{value: msg.value}("");
        require(success, "FAILED_ETH_TRANSFER");
        pool.swapEthForSpc(msg.sender, spcToSender);
    }

    /// @notice Transfer SPC to the poos and receive equal value of ETH
    /// @param minEthReturn minimum amount user will accept for swap. Rely on client to convert from slippage %
    function swapSpcforEth(uint256 spcDeposit, uint256 minEthReturn)
        external
        override
        nonReentrant
    {
        (uint256 reserveEth, uint256 reserveSpc) = pool.getReserves();

        /// @notice calculate how much ETH to return after taking out 1% fee of SPC deposit
        uint256 ethToSender = getAmountOut(spcDeposit, reserveSpc, reserveEth);
        require(ethToSender > minEthReturn, "SLIPPAGE");

        /// @notice transfer spc to pool (assumes user already approved)
        bool success = spcToken.transferFrom(
            msg.sender,
            address(pool),
            spcDeposit
        );
        require(success, "FAILED_SPC_TRANSFER");
        pool.swapSpcForEth(msg.sender, ethToSender);
    }

    /// @notice Calculate how much token should be returned after fees
    /// @param amountIn Know quantity of a token
    /// @param reserveIn Accounted for quanitity in the liquidity pool
    /// @param reserveOut Accounted for quanitity in the liquidity pool
    /// @return amountOut Calculated quantity of the token after fees
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, "INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * 99;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 100) + amountInWithFee;
        /// @dev algrebra breakdown:
        /// x1 * y1 = x2 * y2
        /// x1 * y1 = (x1 + xin)(y1 - yout)
        /// x1 * y1 = (x1 * y1) + (xin * y1) - (x1 * yout) - (xin * yout)
        /// yout = (xin * y1) / (x1 + xin)
        amountOut = numerator / denominator;
    }

    // UI helper functions
    /// @notice provide a swap estimate after fees
    /// @param deposit quantity of token to desposit
    /// @param isDepositEth true: user wants to swap ETH for SPC
    /// false: user wants to swap SPC for ETH
    function getSwapEstimate(uint256 deposit, bool isDepositEth)
        external
        view
        returns (uint256 estimate)
    {
        (uint256 reserveEth, uint256 reserveSpc) = pool.getReserves();
        if (isDepositEth) {
            estimate = getAmountOut(deposit, reserveEth, reserveSpc);
        } else {
            estimate = getAmountOut(deposit, reserveSpc, reserveEth);
        }
    }

    /// @notice Getter to return amount of ETH accounted for in the pool
    /// @dev Used to calculate a more accurate exchange rate
    /// @dev returning reserveSpc / reserveEth does not give sufficient precision
    function getReserveEth() external view returns (uint256 reserveEth) {
        (reserveEth, ) = pool.getReserves();
    }

    /// @notice Getter to return amount of SPC accounted for in the pool
    /// @dev Used to calculate a more accurate exchange rate
    /// @dev returning reserveSpc / reserveEth does not give sufficient precision
    function getReserveSpc() external view returns (uint256 reserveSpc) {
        (, reserveSpc) = pool.getReserves();
    }
}
