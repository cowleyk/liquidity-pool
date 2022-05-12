// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import * as dotenv from "dotenv";
import { formatEther, parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const addrs = await ethers.getSigners(); //get the account to deploy the contract

  console.log("Deploying contracts with the account:", addrs[0].address);

  const SpaceCoin = await ethers.getContractFactory("SpaceCoin");
  const spaceCoin = await SpaceCoin.deploy();

  const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
  const liquidityPool = await LiquidityPool.deploy(spaceCoin.address);

  const Router = await ethers.getContractFactory("Router");
  const router = await Router.deploy(liquidityPool.address, spaceCoin.address);

  await spaceCoin.deployed();
  await liquidityPool.deployed();
  await router.deployed();

  // DEV ONLY
  if(!process.env.LOCALHOST) {
    await spaceCoin.connect(addrs[0]).approve(router.address, parseEther("150000"));
    await router.connect(addrs[0]).addLiquidity(parseEther("150000"), { value: parseEther("30000")});
  }

  console.log("spaceCoin deployed to:", spaceCoin.address);
  console.log("liquidityPool deployed to:", liquidityPool.address);
  console.log("router deployed to:", router.address);

  console.log('pool SPC', formatEther(await spaceCoin.balanceOf(liquidityPool.address)));
  console.log('addrs[0] KVY', formatEther(await liquidityPool.balanceOf(addrs[0].address)));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
