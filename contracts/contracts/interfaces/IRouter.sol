//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IRouter {
    function addLiquidity(uint256 amountSpc) external payable;

    function removeLiquidity(uint256 liquidity) external;

    function swapEthForSpc(uint256 minSpcReturn) external payable;

    function swapSpcforEth(uint256 spcDeposit, uint256 isDepositEth) external;
}
