//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ILiquidityPool is IERC20 {
    function getReserves()
        external
        view
        returns (uint256 reserveEth, uint256 reserveSpc);

    function mint(address to) external;

    function burn(address burner) external;

    function swapEthForSpc(address swapper, uint256 amountSpcOut) external;

    function swapSpcForEth(address swapper, uint256 amountEthOut) external;
}
