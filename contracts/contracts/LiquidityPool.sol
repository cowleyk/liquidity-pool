//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/ILiquidityPool.sol";
import "./libraries/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title A Liquidity pool for Space Coin and ETH
/// @author Kevin Cowley
contract LiquidityPool is ILiquidityPool, ERC20, Ownable {
    /// @notice Contract interface for the associated space coin
    IERC20 public immutable spcToken;

    /// @notice Accounting variables for last know ETH and SPC balances
    uint256 private reserveEth;
    uint256 private reserveSpc;

    /// @notice Constant used for minting and mock-destroying a minute amount of KVY
    uint256 private constant MINIMUM_LIQUIDITY = 1000;

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

    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed to, uint256 amountBurnt, uint256 amountEth, uint256 amountSpc);
    event SwapEthForSpc(address indexed to, uint256 amountOut);
    event SwapSpcForEth(address indexed to, uint256 amountOut);
    event UpdateReserves(uint256 newEth, uint256 newSpc);

    constructor(address _spcToken) ERC20("KevvySwaps Coin", "KVY") {
        spcToken = IERC20(_spcToken);
    }

    /// @notice Distribute KVY based on the last deposits of ETH and SPC
    /// @param to Address to send KVY
    function mint(address to) external override nonReentrant {
        uint256 _reserveEth = reserveEth;
        uint256 _reserveSpc = reserveSpc;

        /// @notice currentEth and currentSpc account for any transfers into the pool
        uint256 currentEth = address(this).balance;
        uint256 currentSpc = spcToken.balanceOf(address(this));
        require(currentEth > _reserveEth, "UNMINTABLE");
        require(currentSpc > _reserveSpc, "UNMINTABLE");

        /// @notice How much ETH/SPC should be used to calculate the amount of KVY to mint
        uint256 mintableEth = currentEth - _reserveEth;
        uint256 mintableSpc = currentSpc - _reserveSpc;
        uint256 _totalSupplyKvy = totalSupply();

        uint256 amountKvy;
        if (_totalSupplyKvy == 0) {
            /// @notice mock-add a minute amount of initial liquidity to the pool
            /// See require(_totalSupplyKvy > MINIMUM_LIQUIDITY) statement inside burn() for more explanation
            amountKvy =
                Math.sqrt(mintableEth * mintableSpc) -
                MINIMUM_LIQUIDITY;
        } else {
            /// @notice mint liquidity proportional to the current totalSupply or SPC or ETH
            /// @dev based on: liquidity = delta_token / previous_token * total_KVY
            uint256 liqEth = (mintableEth * _totalSupplyKvy) / _reserveEth;
            uint256 liqSpc = (mintableSpc * _totalSupplyKvy) / _reserveSpc;

            /// @notice use the minimum of the liquidity calculations
            amountKvy = liqSpc < liqEth ? liqSpc : liqEth;
        }

        _update(currentEth, currentSpc);
        /// @notice call the ERC20 mint function to create KVY
        _mint(to, amountKvy);
        emit Mint(to, amountKvy);
    }

    /// @notice Destroy KVY and return the appropriate amount of ETH and SPC
    /// @param burner Address to send the ETH and SPC to
    function burn(address burner) external override nonReentrant {
        /// @notice liquidity deposited by burner is the current balance of KVY in this contract
        uint256 liquidity = balanceOf(address(this));
        uint256 currentEth = address(this).balance;
        uint256 currentSpc = spcToken.balanceOf(address(this));
        require(
            currentEth > 0 && currentSpc > 0 && liquidity > 0,
            "INSUFFICIENT_LIQUIDITY"
        );

        uint256 _totalSupplyKvy = totalSupply();
        /// @dev Subtracting MINIMUM_LIQUIDITY from the initial minting inside _mint and this require
        /// helps prevent the minimum price of a share from rising to high as to become a barrier for small providers
        /// Mimics Uniswap's _mint(address(0), MINIMUM_LIQUIDITY)
        /// This is a workaround for the ERC20's address-zero checks
        require(_totalSupplyKvy > MINIMUM_LIQUIDITY, "MINIMUM_LIQUIDITY");

        /// @notice calculate return amounts based on the proportion of burning liquidity / total liquidity
        uint256 returnEth = (liquidity * currentEth) / _totalSupplyKvy;
        uint256 returnSpc = (liquidity * currentSpc) / _totalSupplyKvy;

        /// @notice destroy the token
        _burn(address(this), liquidity);

        _update(currentEth - returnEth, currentSpc - returnSpc);
        /// @notice send the calculated ETH and SPC to the burner's address
        (bool successEth, ) = burner.call{value: returnEth}("");
        require(successEth, "FAILED_ETH_TRANSFER");
        bool successSpc = spcToken.transfer(burner, returnSpc);
        require(successSpc, "FAILED_SPC_TRANSFER");
        emit Burn(burner, liquidity, returnEth, returnSpc);
    }

    /// @notice Exchange ETH (previously deposited) for SPC
    /// @param swapper Address to send the SPC to
    /// @param amountSpcOut Amount of SPC swapper expects to receive based on the ETH deposit
    function swapEthForSpc(address swapper, uint256 amountSpcOut)
        external
        override
        nonReentrant
    {
        uint256 _reserveEth = reserveEth;

        /// @notice currentSPC *should* equal the reserveSpc
        uint256 currentSpc = spcToken.balanceOf(address(this));
        /// @notice currentEth is the reserveEth + the ETH deposited for the swap
        uint256 currentEth = address(this).balance;

        /// @notice ensure ETH is available for the swap
        uint256 expectedEth = currentEth - _reserveEth;
        require(expectedEth > 0, "INSUFFICIENT_DEPOSIT");

        /// @notice K should stay the same or increase after the swap
        uint256 kBefore = (100 * _reserveEth) * (100 * reserveSpc);
        /// @notice K after the swap also accounts for the 1% fee taken from the ETH
        uint256 kAfter = (100 * currentEth - expectedEth) *
            (100 * (currentSpc - amountSpcOut));
        require(kAfter >= kBefore, "INVALID_K");

        _update(currentEth, currentSpc - amountSpcOut);
        /// @notice transfer the SPC to the swapper
        bool success = spcToken.transfer(swapper, amountSpcOut);
        require(success, "FAILED_SPC_TRANSFER");
        emit SwapEthForSpc(swapper, amountSpcOut);
    }

    /// @notice Exchange SPC (previously transferred) for ETH
    /// @param swapper Address to send the SPC to
    /// @param amountEthOut Amount of ETH swapper expects to receive based on the SPC transfer
    function swapSpcForEth(address swapper, uint256 amountEthOut)
        external
        override
        nonReentrant
    {
        uint256 _reserveSpc = reserveSpc;

        /// @notice currentSpc is the reserveSpc + the SPC transferred in for the swap
        uint256 currentSpc = spcToken.balanceOf(address(this));
        /// @notice currentEth *should* equal reserveEth
        uint256 currentEth = address(this).balance;

        /// @notice ensure SPC is available for the swap
        uint256 expectedSpc = currentSpc - _reserveSpc;
        require(expectedSpc > 0, "INSUFFICIENT_DEPOSIT");

        /// @notice K should stay the same or increase after the swap
        uint256 kBefore = (100 * reserveEth) * (100 * _reserveSpc);
        /// @notice K after the swap also accounts for the 1% fee taken from the SPC
        uint256 kAfter = (100 * (currentEth - amountEthOut)) *
            (100 * currentSpc - expectedSpc);
        require(kAfter >= kBefore, "INVALID_K");

        _update(currentEth - amountEthOut, currentSpc);
        /// @notice transfer the ETH to the swapper
        (bool success, ) = swapper.call{value: amountEthOut}("");
        require(success, "FAILED_ETH_TRANSFER");
        emit SwapSpcForEth(swapper, amountEthOut);
    }

    /// @notice function to expose accounted for ETH and SPC balances
    function getReserves()
        external
        view
        override
        returns (uint256 _reserveEth, uint256 _reserveSpc)
    {
        _reserveEth = reserveEth;
        _reserveSpc = reserveSpc;
    }

    /// @notice function to update the ETH and SPC accounting variables
    function _update(uint256 newEth, uint256 newSpc) internal {
        reserveEth = newEth;
        reserveSpc = newSpc;
        emit UpdateReserves(newEth, newSpc);
    }

    /// @notice function for updating the accounting variable to the correct balances of ETH and SPC
    function sync() external nonReentrant {
        _update(address(this).balance, spcToken.balanceOf(address(this)));
    }

    receive() external payable {}
}
