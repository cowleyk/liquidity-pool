import { expect } from "chai";
import { ethers } from "hardhat";
import { ICO, LiquidityPool, Router, SpaceCoin } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Wallet } from "ethers";
const { utils: { parseEther } } = ethers;


describe("ICO", function () {
    let ico: ICO;
    let creator: SignerWithAddress;
    let larry: SignerWithAddress;
    let jenny: SignerWithAddress;
    let addrs: SignerWithAddress[];

    beforeEach(async () => {
        [creator, larry, jenny, ...addrs] = await ethers.getSigners();
        const icoFactory = await ethers.getContractFactory("ICO");
        ico = await icoFactory.deploy([]);
        await ico.deployed();
    });

    it("Sets a transferable owner", async () => {
        expect(await ico.owner()).to.equal(creator.address);
        await ico.transferOwnership(larry.address);
        expect(await ico.owner()).to.equal(larry.address);
    });

    it("investors can purchase tokens during Phase Seed", async () => {
        await ico.connect(creator).whitelistAddress(larry.address, true);
        await ico.connect(creator).whitelistAddress(jenny.address, true);
        await ico.connect(larry).buy({ value: parseEther("500")});
        await ico.connect(larry).buy({ value: parseEther("500")});
        await ico.connect(larry).buy({ value: parseEther("500")});
        await ico.connect(jenny).buy({ value: parseEther("500")});

        expect(await ico.userContributions(larry.address)).to.equal(parseEther("1500"));
        expect(await ico.userContributions(jenny.address)).to.equal(parseEther("500"));
    });

    it("only whitelisted investors cant purchase tokens during Phase Seed", async () => {
        await expect(ico.connect(larry).buy({ value: parseEther("1500")})).to.be.revertedWith("WHITELIST");
    });

    it("owner can add addresses to whitelist", async () => {
        await ico.connect(creator).whitelistAddress(larry.address, true);
        expect(await ico.whitelist(larry.address)).to.be.true;
    });

    it("only the treasury can whitelist addresses", async () => {
        await expect(ico.connect(larry).whitelistAddress(jenny.address, true)).to.be.revertedWith("ONLY_TREASURY");
    });

    it("owner can advance phase anytime", async () => {
        expect(await ico.currentPhase()).to.equal(0);
        await ico.connect(creator).advancePhase(0);
        expect(await ico.currentPhase()).to.equal(1);
        await ico.connect(creator).advancePhase(1);
        expect(await ico.currentPhase()).to.equal(2);
        await expect(ico.connect(creator).advancePhase(2)).to.be.revertedWith("INCORRECT_PHASE");
    });

    it("owner can pause/resume campaign anytime", async () => {
        await ico.connect(creator).whitelistAddress(larry.address, true);
        expect(await ico.isPaused()).to.be.false;

        // pause ICO
        await ico.connect(creator).toggleIsPaused(true);
        expect(await ico.isPaused()).to.be.true;
        // cannot contribute while paused
        await expect(ico.connect(larry).buy({ value: parseEther("100")})).to.be.revertedWith("PAUSED_CAMPAIGN");

        // resume ICO
        await ico.connect(creator).toggleIsPaused(false);
        // can contribute after resuming
        await ico.connect(larry).buy({ value: parseEther("100")});
        expect(await ico.userContributions(larry.address)).to.equal(parseEther("100"));
    });

    it("only raises 15,000ETH during Phase Seed", async () => {
        expect(await ico.currentPhase()).to.equal(0);
        for(let i = 0; i < 10; i++) {
            await ico.connect(creator).whitelistAddress(addrs[i].address, true);
            await ico.connect(addrs[i]).buy({ value: parseEther("1490")});
        }

        expect(await ico.totalAmountRaised()).to.equal(parseEther("14900"));
        await ico.connect(creator).whitelistAddress(larry.address, true);
        
        // attempt to contribute up to 15001 ETH
        await expect(ico.connect(larry).buy({ value: parseEther("101")})).to.be.revertedWith("INSUFFICIENT_AVAILABILITY");

        await ico.connect(larry).buy({ value: parseEther("100")});
        expect(await ico.totalAmountRaised()).to.equal(parseEther("15000"));
        // Phase should automatically advance
        expect(await ico.currentPhase()).to.equal(1);
    });

    it("maximum contribution 1500ETH during Phase Seed", async () => {
        await ico.connect(creator).whitelistAddress(larry.address, true);
        await ico.connect(larry).buy({ value: parseEther("500")});
        await ico.connect(larry).buy({ value: parseEther("500")});
        await expect(ico.connect(larry).buy({ value: parseEther("501")})).to.be.revertedWith("EXCEEDS_MAX_CONTRIBUTION");
        
        await ico.connect(larry).buy({ value: parseEther("500")});
        expect(await ico.userContributions(larry.address)).to.equal(parseEther("1500"));
    });

    it("any investors can purchase tokens during Phase General", async () => {
        // advance from Seed to General
        await ico.connect(creator).advancePhase(0);
        expect(await ico.currentPhase()).to.equal(1);

        for(let i = 0; i < 5; i++) {
            // addresses are not added to white list
            await ico.connect(addrs[i]).buy({ value: parseEther("100")});
        }

        // all contributions are collected
        expect(await ico.totalAmountRaised()).to.equal(parseEther("500"));
    });

    it("raises up to 30,000ETH during Phase General", async () => {
        expect(await ico.currentPhase()).to.equal(0);

        // Raise some ETH during Phase Seed
        for(let i = 0; i < 5; i++) {
            await ico.connect(creator).whitelistAddress(addrs[i].address, true);
            await ico.connect(addrs[i]).buy({ value: parseEther("1000")});
        }
        expect(await ico.totalAmountRaised()).to.equal(parseEther("5000"));

        // Advance to Phase general
        await ico.connect(creator).advancePhase(0);
        expect(await ico.currentPhase()).to.equal(1);

        for(let i = 5; i < 30; i++) {
            await ico.connect(addrs[i]).buy({ value: parseEther("990")});
        }
        expect(await ico.totalAmountRaised()).to.equal(parseEther("5000").add(parseEther("24750")));

        // Ensure 30,000 ETH cap applies
        await expect(ico.connect(larry).buy({ value: parseEther("1000")})).to.be.revertedWith("INSUFFICIENT_AVAILABILITY");
        await ico.connect(larry).buy({ value: parseEther("250")});

        expect(await ico.totalAmountRaised()).to.equal(parseEther("30000"));
        // Automatically advances to Phase Open
        expect(await ico.currentPhase()).to.equal(2);
    });

    it("maximum contribution 1000ETH during Phase General", async () => {
        await ico.connect(creator).advancePhase(0);
        expect(await ico.currentPhase()).to.equal(1);
        await expect(ico.connect(larry).buy({ value: parseEther("1001")})).to.be.revertedWith("EXCEEDS_MAX_CONTRIBUTION");
    });

    it("any investors can purchase tokens during Phase Open", async () => {
        // Advance to Phase open
        await ico.connect(creator).advancePhase(0);
        await ico.connect(creator).advancePhase(1);
        expect(await ico.currentPhase()).to.equal(2);

        for(let i = 0; i < 5; i++) {
            // addresses are not whitelisted
            await ico.connect(addrs[i]).buy({ value: parseEther("100")});
        }

        expect(await ico.totalAmountRaised()).to.equal(parseEther("500"));
    });

    it("raises up to 30,000ETH during Phase Open", async () => {
        // collect some funds during Phase Seed
        expect(await ico.currentPhase()).to.equal(0);
        for(let i = 0; i < 5; i++) {
            await ico.connect(creator).whitelistAddress(addrs[i].address, true);
            await ico.connect(addrs[i]).buy({ value: parseEther("1000")});
        }
        expect(await ico.totalAmountRaised()).to.equal(parseEther("5000"));

        // Collect some funds during Phase General
        await ico.connect(creator).advancePhase(0);
        expect(await ico.currentPhase()).to.equal(1);
        for(let i = 5; i < 10; i++) {
            await ico.connect(addrs[i]).buy({ value: parseEther("1000")});
        }
        expect(await ico.totalAmountRaised()).to.equal(parseEther("5000").add(parseEther("5000")));

        // Collect funds during Phase Open
        await ico.connect(creator).advancePhase(1);
        expect(await ico.currentPhase()).to.equal(2);
        await ico.connect(addrs[10]).buy({ value: parseEther("19000")});

        // Ensure 30,000 ETH cap applies
        await expect(ico.connect(larry).buy({ value: parseEther("1001")})).to.be.revertedWith("INSUFFICIENT_AVAILABILITY");
        await ico.connect(larry).buy({ value: parseEther("1000")});

        expect(await ico.totalAmountRaised()).to.equal(parseEther("30000"));
        // Ensure there is no advancing to a nonexistant stage
        expect(await ico.currentPhase()).to.equal(2);
    });

    it("no maximum contribution during Phase Open", async () => {
        // Advance to Phase Open immediately
        await ico.connect(creator).advancePhase(0);
        await ico.connect(creator).advancePhase(1);
        expect(await ico.currentPhase()).to.equal(2);

        await ico.connect(larry).buy({ value: parseEther("30000")});
        expect(await ico.userContributions(larry.address)).to.equal(parseEther("30000"))
    });

    it("collect tokens in Phase Open", async () => {
        await ico.connect(creator).advancePhase(0);
        // Buy tokens during Phase General
        await ico.connect(larry).buy({ value: parseEther("1000")});
        await ico.connect(creator).advancePhase(1);
        // Buy tokens during Phase Open
        await ico.connect(jenny).buy({ value: parseEther("2000")});

        // Pull tokens during phase open
        await ico.connect(larry).collectTokens();
        await ico.connect(jenny).collectTokens();

        // 5 SPC per 1 ETH are transferrred to contributors
        const spcAddress = await ico.token();
        const spaceCoinFactory = await ethers.getContractFactory("SpaceCoin");
        const spaceCoin: SpaceCoin = spaceCoinFactory.attach(spcAddress);
        expect(await spaceCoin.balanceOf(larry.address)).to.equal(parseEther("1000").mul(5));
        expect(await spaceCoin.balanceOf(jenny.address)).to.equal(parseEther("2000").mul(5));
    });

    it("collect tokens in only Phase Open", async () => {
        await ico.connect(creator).advancePhase(0);
        await ico.connect(larry).buy({ value: parseEther("1000")});
        await expect(ico.connect(larry).collectTokens()).to.be.revertedWith("INCORRECT_PHASE");
    });

    it("prevents over collecting of tokens", async () => {
        await ico.connect(creator).advancePhase(0);
        await ico.connect(creator).advancePhase(1);
        await ico.connect(larry).buy({ value: parseEther("30000")});
        await ico.connect(larry).collectTokens();
        // cannot collect tokens twice
        await expect(ico.connect(larry).collectTokens()).to.be.revertedWith("NO_TOKENS");

        // owns expected amount of tokens
        const spcAddress = await ico.token();
        const spaceCoinFactory = await ethers.getContractFactory("SpaceCoin");
        const spaceCoin: SpaceCoin = spaceCoinFactory.attach(spcAddress);
        expect(await spaceCoin.balanceOf(larry.address)).to.equal(parseEther("30000").mul(5));
    });

    it("advances stages automatically with contributions", async () => {
        // contribute until advancing through Phase Seed
        expect(await ico.currentPhase()).to.equal(0);
        for(let i = 0; i < 10; i++) {
            await ico.connect(creator).whitelistAddress(addrs[i].address, true);
            await ico.connect(addrs[i]).buy({ value: parseEther("1500")});
        }
        expect(await ico.totalAmountRaised()).to.equal(parseEther("15000"));
        expect(await ico.currentPhase()).to.equal(1);

        // contribute until advancing through Phase General (up to 30,000 ETH cap)
        for(let i = 10; i < 25; i++) {
            await ico.connect(addrs[i]).buy({ value: parseEther("1000")});
        }
        expect(await ico.totalAmountRaised()).to.equal(parseEther("30000"));
        expect(await ico.currentPhase()).to.equal(2);

        // SpaceCoin is deployed and tokens are available
        const spcAddress = await ico.token();
        const spaceCoinFactory = await ethers.getContractFactory("SpaceCoin");
        const spaceCoin: SpaceCoin = spaceCoinFactory.attach(spcAddress);
        await ico.connect(addrs[0]).collectTokens();
        expect(await spaceCoin.balanceOf(addrs[0].address)).to.equal(parseEther("1500").mul(5));
    });

    it("treasury can withdraw contributions after the goal is reached", async () => {
        await ico.connect(creator).advancePhase(0);
        await ico.connect(creator).advancePhase(1);
        await ico.connect(larry).buy({ value: parseEther("30000")});
        await expect(await ico.connect(creator).withdrawContributions())
            .to.changeEtherBalance(creator, parseEther("30000"));
    });

    it("forces treasury to wait until the goal is reached to withdraw the contributions", async () => {
        await ico.connect(creator).advancePhase(0);
        await ico.connect(creator).advancePhase(1);
        await ico.connect(larry).buy({ value: parseEther("29999")});
        await expect(ico.connect(creator).withdrawContributions())
            .to.be.revertedWith("ICO_ACTIVE");
    });
});
