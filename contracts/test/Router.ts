import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { SpaceCoin, Router, LiquidityPool } from "../typechain";
const { utils: { parseEther } } = ethers;

describe("Router", function () {
    let router: Router;
    let spaceCoin: SpaceCoin;
    let liquidityPool: LiquidityPool;
    let creator: SignerWithAddress;
    let larry: SignerWithAddress;
    let jenny: SignerWithAddress;
    let addrs: SignerWithAddress[];

    beforeEach(async () => {
        [creator, larry, jenny, ...addrs] = await ethers.getSigners();
        const SpaceCoinFactory = await ethers.getContractFactory("SpaceCoin");
        const LiquidityPoolFactory = await ethers.getContractFactory("LiquidityPool");
        const RouterFactory = await ethers.getContractFactory("Router");

        spaceCoin = await SpaceCoinFactory.deploy();
        liquidityPool = await LiquidityPoolFactory.deploy(spaceCoin.address);
        router = await RouterFactory.deploy(liquidityPool.address, spaceCoin.address);
        await spaceCoin.deployed();
        await liquidityPool.deployed();
        await router.deployed();
    });

    it("Sets a transferable owner", async () => {
        expect(await router.owner()).to.equal(creator.address);
        await router.transferOwnership(larry.address);
        expect(await router.owner()).to.equal(larry.address);
    });    

    it("adds initial liquidity", async function () {
        await spaceCoin.connect(creator).transfer(larry.address, parseEther("50"));
        spaceCoin.connect(larry).approve(router.address, parseEther("50"));
        await expect(await router.connect(larry).addLiquidity(parseEther("50"), {value: parseEther("10")}))
            .to.changeEtherBalance(liquidityPool, parseEther("10"));
        expect(await spaceCoin.balanceOf(liquidityPool.address)).to.equal(parseEther("50"));
        const larryKVYTokens = await liquidityPool.balanceOf(larry.address);
        expect(larryKVYTokens.gt(0)).to.be.true;
    });

    it("adds liquidy to an existing pool", async () => {
        // set up liquidity pool
        await spaceCoin.approve(router.address, parseEther("50"));
        await router.addLiquidity(parseEther("50"), {value: parseEther("10")});        
        await spaceCoin.transfer(jenny.address, parseEther("50"));

        await spaceCoin.connect(jenny).approve(router.address, parseEther("10"));
        await router.connect(jenny).addLiquidity(parseEther("10"), {value: parseEther("2")});
        expect(await spaceCoin.balanceOf(liquidityPool.address)).to.equal(parseEther("60"));
        const jennyKVYTokens = await liquidityPool.balanceOf(jenny.address);
        expect(jennyKVYTokens.gt(0)).to.be.true;
    });

    it("refunds excess ETH deposited", async () => {
        // set up liquidity pool
        await spaceCoin.approve(router.address, parseEther("50"));
        await router.addLiquidity(parseEther("50"), {value: parseEther("10")});        
        await spaceCoin.transfer(jenny.address, parseEther("50"));

        await spaceCoin.connect(jenny).approve(router.address, parseEther("10"));
        const addTxn = await router.connect(jenny).addLiquidity(parseEther("10"), {value: parseEther("10")});
        expect(await spaceCoin.balanceOf(liquidityPool.address)).to.equal(parseEther("60"));

        // jenny sent 10 ETH but got 8 ETH returned
        await expect(addTxn).to.changeEtherBalance(jenny, parseEther("2").mul(-1));
        await expect(addTxn).to.changeEtherBalance(liquidityPool, parseEther("2"));
    });

    it("does not transfer extra SPC", async () => {
        // set up liquidity pool
        await spaceCoin.approve(router.address, parseEther("50"));
        await router.addLiquidity(parseEther("50"), {value: parseEther("10")});        
        await spaceCoin.transfer(jenny.address, parseEther("500"));

        const jennySpcBefore = await spaceCoin.balanceOf(jenny.address);
        await spaceCoin.connect(jenny).approve(router.address, parseEther("100"));
        const addTxn = await router.connect(jenny).addLiquidity(parseEther("100"), {value: parseEther("1")});
        const jennySpcAfter = await spaceCoin.balanceOf(jenny.address);

        expect(await spaceCoin.balanceOf(liquidityPool.address)).to.equal(parseEther("55"));
        expect(jennySpcBefore.sub(jennySpcAfter)).to.equal(parseEther("5"));
        expect(addTxn).to.changeEtherBalance(liquidityPool, parseEther("1"));
    });

    it("rejects add liquidity when no value is provided", async () => {
        // set up liquidity pool
        await spaceCoin.approve(router.address, parseEther("50"));
        await router.addLiquidity(parseEther("50"), {value: parseEther("10")});        

        await spaceCoin.approve(router.address, parseEther("5"));
        await expect(router.addLiquidity(parseEther("0"), { value: parseEther("1") })).to.be.revertedWith("INSUFFICIENT_AMOUNT");
        await expect(router.addLiquidity(parseEther("5"), { value: parseEther("0") })).to.be.revertedWith("INSUFFICIENT_AMOUNT");
    });

    it("removes liquidity", async () => {
        // set up liquidity pool
        await spaceCoin.approve(router.address, parseEther("50"));
        await router.addLiquidity(parseEther("50"), {value: parseEther("10")});        
        await spaceCoin.transfer(jenny.address, parseEther("500"));

        // jenny earn KVY tokens
        await spaceCoin.connect(jenny).approve(router.address, parseEther("10"));
        await router.connect(jenny).addLiquidity(parseEther("10"), {value: parseEther("2")});
        const jennyKvyBefore = await liquidityPool.balanceOf(jenny.address);
        expect(jennyKvyBefore.gt(parseEther("2"))).to.be.true;

        const jennyEthBefore = await jenny.getBalance();
        const jennySpcBefore = await spaceCoin.balanceOf(jenny.address);
        await liquidityPool.connect(jenny).approve(router.address, parseEther("2"))
        await router.connect(jenny).removeLiquidity(parseEther("2"));
        const jennyKvyAfter = await liquidityPool.balanceOf(jenny.address);
        const jennyEthAfter = await jenny.getBalance();
        const jennySpcAfter = await spaceCoin.balanceOf(jenny.address);

        expect(jennyKvyBefore.sub(jennyKvyAfter)).to.equal(parseEther("2"));
        expect(jennyEthAfter.gt(jennyEthBefore)).to.be.true;
        expect(jennySpcAfter.gt(jennySpcBefore)).to.be.true;
    });

    it("rejects remove liquidity attempt when there is not sufficient reserves", async () => {
        await expect(router.removeLiquidity(parseEther("1"))).to.be.revertedWith("INSUFFICIENT_LIQUIDITY");
        
        await spaceCoin.approve(router.address, parseEther("500"));
        await router.addLiquidity(parseEther("500"), {value: parseEther("100")});
        
        await expect(router.removeLiquidity(parseEther("0"))).to.be.revertedWith("INSUFFICIENT_LIQUIDITY");

        await liquidityPool.approve(router.address, parseEther("1"));
        await router.removeLiquidity(parseEther("1"));
    });

    it("swaps ETH for SPC", async () => {
        // set up liquidity pool
        await spaceCoin.approve(router.address, parseEther("500"));
        await router.addLiquidity(parseEther("500"), {value: parseEther("100")});

        const spcEstimate = await router.getSwapEstimate(parseEther("1"), true);
        const minSpcReturn = parseEther("4.5");
        await router.connect(jenny).swapEthForSpc(minSpcReturn, { value: parseEther("1")});

        const jennySpcBalance = await spaceCoin.balanceOf(jenny.address);
        expect(jennySpcBalance.gt(minSpcReturn)).to.be.true;
        expect(jennySpcBalance.eq(spcEstimate)).to.be.true;
    });

    it("swaps SPC for ETH", async () => {
        // set up liquidity pool
        await spaceCoin.approve(router.address, parseEther("500"));
        await router.addLiquidity(parseEther("500"), {value: parseEther("100")});

        const ethEstimate = await router.getSwapEstimate(parseEther("5"), false);
        const minEthReturn = (parseEther("0.8"));
        await spaceCoin.transfer(jenny.address, parseEther("5"))
        await spaceCoin.connect(jenny).approve(router.address, parseEther("5"));
        const swap = await router.connect(jenny).swapSpcforEth(parseEther("5"), minEthReturn);

        await expect(swap).to.changeEtherBalance(jenny, ethEstimate);

        const ethEstimate_2 = await router.getSwapEstimate(parseEther("5"), false);
        const minEthReturn_2 = (parseEther("0.8"));
        await spaceCoin.transfer(jenny.address, parseEther("5"))
        await spaceCoin.connect(jenny).approve(router.address, parseEther("5"));
        const swap_2 = await router.connect(jenny).swapSpcforEth(parseEther("5"), minEthReturn_2);

        await expect(swap_2).to.changeEtherBalance(jenny, ethEstimate_2);
        expect(ethEstimate_2.lt(ethEstimate)).to.be.true;
    });

    it("includes fees in estimate for swap", async () => {
        // create initial 5:1 SPC:ETH 
        const ethDeposit = parseEther("10")
        const spcDeposit = parseEther("10").mul(5);
        await spaceCoin.approve(router.address, parseEther("500"));
        await router.addLiquidity(spcDeposit, {value: ethDeposit});

        // estimated SPC returned for depositing 1 ETH
        const ethEstimate = await router.getSwapEstimate(parseEther("1"), true);
        expect(ethEstimate < parseEther("1").mul(5)).to.be.true;
    });

    it("rejects swaps that won't return a minimum SPC", async () => {
        await spaceCoin.approve(router.address, parseEther("500"));
        await router.addLiquidity(parseEther("500"), {value: parseEther("100")});

        const minSpcReturn = parseEther("14.7");
        await expect(router.connect(jenny).swapEthForSpc(minSpcReturn, { value: parseEther("3")}))
            .to.be.revertedWith("SLIPPAGE");
    });

    it("rejects swaps that won't return a minimum ETH", async () => {
        await spaceCoin.approve(router.address, parseEther("500"));
        await router.addLiquidity(parseEther("500"), {value: parseEther("100")});

        await spaceCoin.transfer(jenny.address, parseEther("15"))
        await spaceCoin.connect(jenny).approve(router.address, parseEther("15"));

        const minEthReturn = parseEther("2.9");
        await expect(router.connect(jenny).swapSpcforEth(parseEther("15"), minEthReturn))
            .to.be.revertedWith("SLIPPAGE");
    });

    it("rejects swaps when there are no reserves in the pool", async () => {
        const minSpcReturn = parseEther("14");
        await expect(router.connect(jenny).swapEthForSpc(minSpcReturn, { value: parseEther("3")}))
            .to.be.revertedWith("INSUFFICIENT_LIQUIDITY");

        await spaceCoin.transfer(jenny.address, parseEther("15"))
        await spaceCoin.connect(jenny).approve(router.address, parseEther("15"));

        const minEthReturn = parseEther("2");
        await expect(router.connect(jenny).swapSpcforEth(parseEther("15"), minEthReturn))
            .to.be.revertedWith("INSUFFICIENT_LIQUIDITY");
    });

    it("rejects swaps that do not depoit SPC or ETH", async () => {
        await spaceCoin.approve(router.address, parseEther("500"));
        await router.addLiquidity(parseEther("500"), {value: parseEther("100")});

        await spaceCoin.transfer(jenny.address, parseEther("15"))
        await spaceCoin.connect(jenny).approve(router.address, parseEther("15"));

        const minEthReturn = parseEther("2");
        await expect(router.connect(jenny).swapSpcforEth(parseEther("0"), minEthReturn))
            .to.be.revertedWith("INSUFFICIENT_INPUT_AMOUNT");

        const minSpcReturn = parseEther("14");
        await expect(router.connect(jenny).swapEthForSpc(minSpcReturn, { value: parseEther("0")}))
            .to.be.revertedWith("INSUFFICIENT_INPUT_AMOUNT");
    });

    it("earns fees for liquidity providers", async () => {
        await spaceCoin.approve(router.address, parseEther("500"));
        await router.addLiquidity(parseEther("500"), {value: parseEther("100")});

        await spaceCoin.transfer(jenny.address, parseEther("10"));
        const intitialJennySpc = await spaceCoin.balanceOf(jenny.address);
        await spaceCoin.connect(jenny).approve(router.address, parseEther("10"));
        await router.connect(jenny).addLiquidity(parseEther("10"), {value: parseEther("2")});

        await spaceCoin.transfer(larry.address, parseEther("500"))
        await spaceCoin.connect(larry).approve(router.address, parseEther("500"));
        await router.connect(larry).swapSpcforEth(parseEther("500"), parseEther("1"));

        await liquidityPool.connect(jenny).approve(router.address, await liquidityPool.balanceOf(jenny.address));
        await router.connect(jenny).removeLiquidity(await liquidityPool.balanceOf(jenny.address));
        const jennySpcAfterBurn = await spaceCoin.balanceOf(jenny.address);
        expect(jennySpcAfterBurn.gt(intitialJennySpc)).to.be.true;
    });
});
