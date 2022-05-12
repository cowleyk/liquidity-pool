# Audit for cowleyk

## Medium
### [M-1] Parentheses missing
- Line 140 is missing a parenthesis

On line 140, you have:
`uint256 kAfter = (100 * currentEth - expectedEth) *
            (100 * (currentSpc - amountSpcOut));`

This will use order of operations to perform `(100*currentEth) - expectedEth` instead of `100*(currentEth - expectedEth)`

### [M-2] Parentheses missing
- Line 174 is missing a parentheses

On line 174, you have:
`uint256 kAfter = (100 * (currentEth - amountEthOut)) *
            (100 * currentSpc - expectedSpc);`

This will use order of operations to perform `(100*currentSpc) - expectedSpc` instead of `100*(currentSpc - expectedSpc)`

### [M-3] User can use incorrect `amountSpcOut` in `swapEthForSpc`

`swapEthForSpc` is an external function that is called with an address and an `amountSpcOut`. 

The validity of `amountSpcOut` is checked on 142, when comparing the k values before and after the transfer:
`require(kAfter >= kBefore, "INVALID_K");`

It's possible for an external account to pass a value of `amountSpcOut`
that's slightly higher than the correct amount to be returned and gain
a fraction of eth.

I tried with reserveSPC = 15, reserveEth = 3, and addedEth = 1. `amountSpcOut` should be 3.72, but I tried with 3.75 and the k value check worked.

Consider calculating the `amountSpcOut` within the swap function (in the pool contract). The caller will only gain a small amount of eth, but it will likely be more than the gas costs.

### [M-4] User can use incorrect `amountEthOut` in `swapSpcForEth`

(similar to M-3 above).

## Low
### [L-1] `require(spcToSender > minSpcReturn, "SLIPPAGE")` on line 133 will revert if `spcToSender` is equal to `minSpcReturn`.

Consider adding an equals sign to the comparison.

### [L-2] `require(ethToSender > minEthReturn, "SLIPPAGE")` on line 152 will revert if `ethToSender` is equal to `minEthReturn`.

Consider adding an equals sign to the comparison.

## Nitpicks
- Curious about why you included the assert on line 62 in Router.sol if the assertion will never throw.