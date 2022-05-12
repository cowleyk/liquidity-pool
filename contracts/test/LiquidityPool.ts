import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { LiquidityPool, Router, SpaceCoin } from "../typechain";
import { BigNumber } from "ethers";
const { utils: { parseEther } } = ethers;

describe("LiquidityPool", function () {
    let spaceCoin: SpaceCoin;
    let liquidityPool: LiquidityPool;
    let router: Router;
    let creator: SignerWithAddress;
    let larry: SignerWithAddress;
    let jenny: SignerWithAddress;
    let addrs: SignerWithAddress[];

    beforeEach(async () => {
        [creator, larry, jenny, ...addrs] = await ethers.getSigners();
        const SpaceCoinFactory = await ethers.getContractFactory("SpaceCoin");
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        const Router = await ethers.getContractFactory("Router");

        spaceCoin = await SpaceCoinFactory.deploy();
        liquidityPool = await LiquidityPool.deploy(spaceCoin.address);
        router = await Router.deploy(liquidityPool.address, spaceCoin.address);
        await spaceCoin.deployed();
        await liquidityPool.deployed();
        await router.deployed();
    });

    it("Sets a transferable owner", async () => {
        expect(await liquidityPool.owner()).to.equal(creator.address);
        await liquidityPool.transferOwnership(larry.address);
        expect(await liquidityPool.owner()).to.equal(larry.address);
    });

    // mint
    it("initially mints KVY assuming equal value of each token deposited", async () => {
        await spaceCoin.transfer(liquidityPool.address, parseEther("50"));
        const txn = {
            to: liquidityPool.address,
            value: parseEther("50"),
        }
        await creator.sendTransaction(txn);

        await liquidityPool.mint(creator.address);
        expect(await liquidityPool.balanceOf(creator.address)).to.equal(parseEther("50").sub(BigNumber.from(1000)));
    });

    it("mints KVY when funds are available", async function () {
        const initialSpcDeposit = parseEther("50");
        await spaceCoin.approve(router.address, initialSpcDeposit);
        await router.addLiquidity(initialSpcDeposit, {value: parseEther("10")});        

        const { _reserveSpc: spcBefore } = await liquidityPool.getReserves();
        const spcDeposit = parseEther("5");
        await spaceCoin.transfer(liquidityPool.address, spcDeposit);
        await creator.sendTransaction({ to: liquidityPool.address, value: parseEther("1") });

        const totalSupplyBefore = await liquidityPool.totalSupply();
        await liquidityPool.mint(jenny.address);
        const totalSupplyAfter = await liquidityPool.totalSupply();
        expect(totalSupplyAfter.gt(totalSupplyBefore)).to.be.true;

        const calculatedKvy = spcDeposit.mul(totalSupplyBefore).div(spcBefore);
        const jennyKvy = await liquidityPool.balanceOf(jenny.address)
        expect(jennyKvy.gt(0)).to.be.true;
        expect(jennyKvy).to.equal(calculatedKvy);
    });

    it("mints the lesser of amount of liquidity based on the two tokens deposited", async () => {
        const initialSpcDeposit = parseEther("50");
        await spaceCoin.approve(router.address, initialSpcDeposit);
        await router.addLiquidity(initialSpcDeposit, {value: parseEther("10")});        

        const { _reserveSpc: spcBefore } = await liquidityPool.getReserves();
        const spcDeposit = parseEther("5");
        await spaceCoin.transfer(liquidityPool.address, spcDeposit);
        await creator.sendTransaction({ to: liquidityPool.address, value: parseEther("15") });

        const totalSupplyBefore = await liquidityPool.totalSupply();
        await liquidityPool.mint(jenny.address);
        const totalSupplyAfter = await liquidityPool.totalSupply();
        expect(totalSupplyAfter.gt(totalSupplyBefore)).to.be.true;

        const calculatedKvy = spcDeposit.mul(totalSupplyBefore).div(spcBefore);
        const jennyKvy = await liquidityPool.balanceOf(jenny.address);
        expect(jennyKvy.gt(0)).to.be.true;
        expect(jennyKvy).to.equal(calculatedKvy);

        const { _reserveEth: ethBefore } = await liquidityPool.getReserves();
        const ethDeposit = parseEther("5");
        await spaceCoin.transfer(liquidityPool.address, parseEther("500"));
        await creator.sendTransaction({ to: liquidityPool.address, value: ethDeposit });

        const totalSupplyBefore2 = await liquidityPool.totalSupply();
        await liquidityPool.mint(jenny.address);

        const calculatedKvy2 = ethDeposit.mul(totalSupplyBefore2).div(ethBefore);
        const jennyKvy2 = await liquidityPool.balanceOf(jenny.address);
        expect(jennyKvy2.gt(jennyKvy)).to.be.true;
        expect(jennyKvy2.sub(jennyKvy)).to.equal(calculatedKvy2);
    });

    it("will not mint if there is no new ETH and SPC deposited", async () => {
        const initialSpcDeposit = parseEther("50");
        await spaceCoin.approve(router.address, initialSpcDeposit);
        await router.addLiquidity(initialSpcDeposit, {value: parseEther("10")});        

        await expect(liquidityPool.mint(jenny.address)).to.be.revertedWith("UNMINTABLE");

        await creator.sendTransaction({ to: liquidityPool.address, value: parseEther("15") });

        await expect(liquidityPool.mint(jenny.address)).to.be.revertedWith("UNMINTABLE");
    });

    it("updates the accounting variables after minting KVY", async () => {
        const initialSpcDeposit = parseEther("50");
        await spaceCoin.approve(router.address, initialSpcDeposit);
        await router.addLiquidity(initialSpcDeposit, {value: parseEther("10")});      

        const { _reserveSpc: spcBefore, _reserveEth: ethBefore } = await liquidityPool.getReserves();
        const spcDeposit = parseEther("5");
        const ethDeposit = parseEther("1");
        await spaceCoin.transfer(liquidityPool.address, spcDeposit);
        await creator.sendTransaction({ to: liquidityPool.address, value: ethDeposit });
        await liquidityPool.mint(jenny.address);
        const { _reserveSpc: spcAfter, _reserveEth: ethAfter } = await liquidityPool.getReserves();

        expect(spcBefore.add(spcDeposit)).to.equal(spcAfter);
        expect(ethBefore.add(ethDeposit)).to.equal(ethAfter);
    });
    // ------------

    // burn
    it("requires the pool to be holding KVY, ETH, and SPC", async () => {
        await expect(liquidityPool.burn(jenny.address)).to.be.revertedWith("INSUFFICIENT_LIQUIDITY");

        const initialSpcDeposit = parseEther("50");
        await spaceCoin.approve(router.address, initialSpcDeposit);
        await router.addLiquidity(initialSpcDeposit, {value: parseEther("10")});        

        await expect(liquidityPool.burn(jenny.address)).to.be.revertedWith("INSUFFICIENT_LIQUIDITY");
    });

    it("returns ETH and SPC based on the ration of current KVY tokens to total tokens", async () => {
        
    });

    it("burns all the KVY held by the contract", async () => {
        const initialSpcDeposit = parseEther("50");
        const initialEthDeposit = parseEther("10");
        await spaceCoin.transfer(jenny.address, initialSpcDeposit);
        await spaceCoin.connect(jenny).approve(router.address, initialSpcDeposit);
        await router.connect(jenny).addLiquidity(initialSpcDeposit, {value: initialEthDeposit});   

        const jennyKvyBefore = await liquidityPool.balanceOf(jenny.address);
        await liquidityPool.connect(jenny).transfer(liquidityPool.address, jennyKvyBefore);

        expect(await liquidityPool.balanceOf(liquidityPool.address)).to.equal(jennyKvyBefore);
        const burnTxn = await liquidityPool.burn(jenny.address);

        await expect(burnTxn).to.changeEtherBalance(liquidityPool, initialEthDeposit.mul(-1));
        await expect(burnTxn).to.changeEtherBalance(jenny, initialEthDeposit);
        expect(await spaceCoin.balanceOf(jenny.address)).to.equal(initialSpcDeposit);
        expect(await liquidityPool.balanceOf(liquidityPool.address)).to.equal(0);
    });

    it("updates the account variables after burning KVY", async () => {
        const initialSpcDeposit = parseEther("50");
        const initialEthDeposit = parseEther("50");
        await spaceCoin.transfer(jenny.address, initialSpcDeposit);
        await spaceCoin.connect(jenny).approve(router.address, initialSpcDeposit);
        await router.connect(jenny).addLiquidity(initialSpcDeposit, {value: initialEthDeposit});

        await liquidityPool.connect(jenny).transfer(liquidityPool.address, parseEther("2"));

        const { _reserveSpc: spcBefore, _reserveEth: ethBefore } = await liquidityPool.getReserves();
        const totalKvy = await liquidityPool.totalSupply();
        await liquidityPool.burn(jenny.address);
        const { _reserveSpc: spcAfter, _reserveEth: ethAfter } = await liquidityPool.getReserves();

        const returnEth = parseEther("2").mul(ethBefore).div(totalKvy);
        const returnSpc = parseEther("2").mul(spcBefore).div(totalKvy);

        expect(ethAfter).to.equal(ethBefore.sub(returnEth));
        expect(spcAfter).to.equal(spcBefore.sub(returnSpc));
    });
    // ------------

    // swapEthforSpc
    it("sends swapper SPC", async () => {
        await spaceCoin.approve(router.address, parseEther("50"));
        await router.addLiquidity(parseEther("50"), {value: parseEther("10")});        

        // sends 1 ETH, should get a little less than 5 spc back
        const ethDeposit = parseEther("1");
        await creator.sendTransaction({ to: liquidityPool.address, value: ethDeposit });
        const expectedSpc = await router.getSwapEstimate(ethDeposit, true);
        await liquidityPool.swapEthForSpc(jenny.address, expectedSpc);

        expect(await spaceCoin.balanceOf(jenny.address)).to.equal(expectedSpc);
    });

    it("validates a fee was pulled from the ETH deposit", async () => {
        await spaceCoin.approve(router.address, parseEther("50"));
        await router.addLiquidity(parseEther("50"), {value: parseEther("10")});        

        // sends 1 ETH, should get a little less than 5 spc back
        await creator.sendTransaction({ to: liquidityPool.address, value: parseEther("1") });

        await expect(liquidityPool.swapEthForSpc(jenny.address, parseEther("5"))).to.be.revertedWith("INVALID_K");
    });

    it("Ensures there was an ETH deposit before sending SPC", async () => {
        await spaceCoin.approve(router.address, parseEther("50"));
        await router.addLiquidity(parseEther("50"), {value: parseEther("10")});        

        // sends 1 ETH, should get a little less than 5 spc back
        const expectedSpc = await router.getSwapEstimate(parseEther("1"), true);
        await expect(liquidityPool.swapEthForSpc(jenny.address, expectedSpc)).to.be.revertedWith("INSUFFICIENT_DEPOSIT");

        expect(await spaceCoin.balanceOf(jenny.address)).to.equal(0);
    });

    it("Sends the appropriate amount of ETH even when extra ETH is added", async () => {
        await spaceCoin.approve(router.address, parseEther("50"));
        await router.addLiquidity(parseEther("50"), {value: parseEther("10")});        

        const spcDeposit = parseEther("5");
        await spaceCoin.transfer(liquidityPool.address, spcDeposit);
        await creator.sendTransaction({ to: liquidityPool.address, value: parseEther("5") });
        const expectedEth = await router.getSwapEstimate(spcDeposit, false);
        const swapTxn = await liquidityPool.swapSpcForEth(jenny.address, expectedEth);

        await expect(swapTxn).to.changeEtherBalance(jenny, expectedEth);

    })

    // swapSpcforEth
    it("sends swapper ETH", async () => {
        await spaceCoin.approve(router.address, parseEther("50"));
        await router.addLiquidity(parseEther("50"), {value: parseEther("10")});        

        const spcDeposit = parseEther("5");
        await spaceCoin.transfer(liquidityPool.address, spcDeposit);
        const expectedEth = await router.getSwapEstimate(spcDeposit, false);
        const swapTxn = await liquidityPool.swapSpcForEth(jenny.address, expectedEth);

        await expect(swapTxn).to.changeEtherBalance(jenny, expectedEth);
    });

    it("validates a fee was pulled from the SPC deposit", async () => {
        await spaceCoin.approve(router.address, parseEther("50"));
        await router.addLiquidity(parseEther("50"), {value: parseEther("10")});        

        const spcDeposit = parseEther("5");
        await spaceCoin.transfer(liquidityPool.address, spcDeposit);

        await expect(liquidityPool.swapSpcForEth(jenny.address, parseEther("1"))).to.be.revertedWith("INVALID_K");
    });

    it("Ensures there was an SPC deposit before sending ETH", async () => {
        await spaceCoin.approve(router.address, parseEther("50"));
        await router.addLiquidity(parseEther("50"), {value: parseEther("10")});        

        const poolSpcBefore = await spaceCoin.balanceOf(liquidityPool.address);
        const expectedEth = await router.getSwapEstimate(parseEther("5"), false);
        const swapTxn = liquidityPool.swapSpcForEth(jenny.address, expectedEth)
        await expect(swapTxn).to.be.revertedWith("INSUFFICIENT_DEPOSIT");
        const poolSpcAfter = await spaceCoin.balanceOf(liquidityPool.address);

        expect(poolSpcBefore.sub(poolSpcAfter)).to.equal(0);
    });
});
