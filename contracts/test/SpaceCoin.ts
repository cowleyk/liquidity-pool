import { expect } from "chai";
import { ethers } from "hardhat";
import { SpaceCoin } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
const { utils: { parseEther } } = ethers;


describe("SpaceCoin", function () {
    let spaceCoin: SpaceCoin;
    let creator: SignerWithAddress;
    let larry: SignerWithAddress;
    let jenny: SignerWithAddress;
    let addrs: SignerWithAddress[];

    beforeEach(async () => {
        [creator, larry, jenny, ...addrs] = await ethers.getSigners();
        const spaceCoinFactory = await ethers.getContractFactory("SpaceCoin");
        spaceCoin = await spaceCoinFactory.deploy();
        await spaceCoin.deployed();
    });

    it("Sets a transferable owner", async () => {
        expect(await spaceCoin.owner()).to.equal(creator.address);
        await spaceCoin.transferOwnership(larry.address);
        expect(await spaceCoin.owner()).to.equal(larry.address);
    });    

    it("treasury can toggle tax on and off", async () => {
        expect(await spaceCoin.collectTaxes()).to.be.false;
        await spaceCoin.toggleTax(true);
        expect(await spaceCoin.collectTaxes()).to.be.true;
        await spaceCoin.toggleTax(false);
        expect(await spaceCoin.collectTaxes()).to.be.false;
    });

    it("only treasury can toggle tax", async () => {
        await expect(spaceCoin.connect(larry).toggleTax(true)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("collects aside 2% tax on all transfers when toggled on", async () => {
        await spaceCoin.transfer(larry.address, parseEther("100"));
        const treasuryBalanceBefore = await spaceCoin.balanceOf(creator.address);

        await spaceCoin.toggleTax(true);
        await spaceCoin.connect(larry).transfer(jenny.address, parseEther("50"));
        const treasuryBalanceAfter = await spaceCoin.balanceOf(creator.address);
        const difference = treasuryBalanceAfter.sub(treasuryBalanceBefore);
        // Jenny should receive 98% of 50 SPC transfer
        expect(await spaceCoin.balanceOf(jenny.address)).to.equal(parseEther("49"));
        // Treasury received 2% of 50 SPC transfer
        expect(difference.eq(parseEther("1"))).to.be.true;
    });

    it("collects aside 2% tax on all transfers when toggled on", async () => {
        await spaceCoin.transfer(larry.address, parseEther("100"));
        const treasuryBalanceBefore = await spaceCoin.balanceOf(creator.address);

        await spaceCoin.connect(larry).transfer(jenny.address, parseEther("50"));
        const treasuryBalanceAfter = await spaceCoin.balanceOf(creator.address);
        const difference = treasuryBalanceAfter.sub(treasuryBalanceBefore);
        // Jenny should receive 100% of 50 SPC transfer
        expect(await spaceCoin.balanceOf(jenny.address)).to.equal(parseEther("50"));
        // Treasury received 0% of 50 SPC transfer
        expect(difference.eq(parseEther("0"))).to.be.true;
    });
});
