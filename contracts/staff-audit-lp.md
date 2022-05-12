https://github.com/ShipyardDAO/student.cowleyk/tree/184f2133e3d5435bfff75c91dd57f94438acae84/lp

The following is a micro audit of git commit 184f2133e3d5435bfff75c91dd57f94438acae84 by Gary

# General Comments

Excellent project!   I can tell that you spent considerable time working and completing this project. Code is well written. No quality
issues except for the 1% fee feature missing in your Pool contract.  Although I would consider combining the swapEthForSpc and swapSpcForEth in LiquidityPool into one function. There is alot of
duplicate code. You would just have to keep track of whether ETH or SPC is being swapped out. 
 
 All the features are completed, and tests are comprehensive.  The amount and quality of the tests and the frontend shows that you put 
 a great amount of effort into this last project.  It is commendable. Your project shows that you have a good undertanding of the 
 Uniswap protocol and liquidity pools.   Best of luck after this camp.  You should do well!

# Design Exercise

I think you meant to refer to ERC721 and not ERC271.   For the reward ETH solution, where would the external account get the ETH?  It
 was unclear.  Also, I'm not sure what you mean by "third ECR20 token" - how will this token have value? Will it be some well-known 
 token like USDC or a token you make just for liquidity rewards? 

# Issues

**[L-1]** No minimum_liquidity minted 

There is no minimum liquidity being minted. This causes an issue in  `LiquidityPool.burn`  where you added the 
following code on line 100

                           require(_totalSupplyKvy > MINIMUM_LIQUIDITY, "MINIMUM_LIQUIDITY");

As a result, some address could be holding LP tokens that it cannot redeem for its ETH/SPC that it deposited. Here is the case: 

- Minimum Liquidity = 20 
- First Liquidity provider adds the initial liquidity and gets  100 - Minimum Liquidity which is 80  LP tokens 
- Next Liquidity provider adds additional liquidity and receives 20 LP tokens  - thus total supply is 100 
- First LP withdraws all its liquidity and the remaining supply of tokens will be 20
- Now the second LP is holding 20 tokens, and now wants to withdraw some liquidity, but will be unable to because of Line 100
  - total supply of 20 will not be greater than the minimum liquidity of 20.  Thus the second LP will be stuck with LP tokens until 
    someone else adds additional liquidity. 

I know this was your alternative to minting to address(0) like uniswap.  But as you can see, your solution caused an additional issue.
Even though you cannot mint to address(0) with Openzeppelin ERC20 contract, there are other addresses that could be minted to that are 
also not accessible.  address(1) is one of the addresses that is not accessible.  Here is a list of 6 addresses that cannot be 
accessed   from:  https://ftmscan.com/accounts/label/burn  

Quote from this site:   "Tokens are commonly considered burned after sending to an address whose private keys are impossible (or 
extremely improbable) for anyone to have access to. Another recommended method is to create a contract which immediately self 
destructs and sends to its own address." 

**[L-2]** Could mint 0 LP tokens to Liquidity Provider

In `LiquidityPool.mint`  prior to minting the LP token, consider adding code to ensure amountKvy  > 0. 
amountKvy could be zero if the initial Liquidity Provider deposits the minimum liquidity.  

                        require(amountKvy > 0, "INSUFFICIENT_LIQUIDITY_MINTED");

**[L-3]** `ICO.withdrawContributions` can only withdraw ETH funds when ICO has been fully funded

In line 206 of ICO.sol, you have the line:

`require(totalAmountRaised == 30000 ether, "ICO_ACTIVE");`

which means if there is 29_999 ETH raised, or any other value than the full amount of ETH intended to be raised, `withdrawContributions` will revert.

The only way I see to unbrick the contract in this case is for someone (probably the treasury) to call `buy` with whatever ETH is needed in order to reach `30_000` ETH in `totalAmountRaised`. This is burdensome and wastes time + gas, but luckily the contract is not bricked because of this.

A safer approach would be to remove that `require` statement, and transfer `address(this).balance` to the treasury.

**[Technical Mistake]** Unnecessary Reentrancy guard on function

`LiquidityPool.mint`  does not call any external contracts, thus no need for the reentrancy guard

**[Unfinished Feature]** LiquidityPool does not account for 1% tax.

In LiquidityPool.sol there is not logic that accounts for the 1% fee specified in the spec. Your Router's `getAmountOut` does, but your Pool contract could be called by anyone, and so they could bypass the fee logic in your Router.

You need to do a similar calculation as you do in the `quote` function, but in your Pool contract

# Score

| Reason | Score |
|-|-|
| Late                       | - |
| Unfinished features        | 2 |
| Extra features             | - |
| Vulnerability              | 3 |
| Unanswered design exercise | - |
| Insufficient tests         | - |
| Technical mistake          | 1 |

Total: 6

Good job!
