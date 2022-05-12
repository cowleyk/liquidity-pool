import { ethers } from "ethers"
import RouterJSON from '../../artifacts/contracts/Router.sol/Router.json'
import SpacCoinJSON from '../../artifacts/contracts/SpaceCoin.sol/SpaceCoin.json'
import LiquidityPoolJSON from '../../artifacts/contracts/LiquidityPool.sol/LiquidityPool.json'
const { utils: { parseEther, formatEther } } = ethers;

const provider = new ethers.providers.Web3Provider(window.ethereum)
const signer = provider.getSigner()

const routerAddr = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
const routerContract = new ethers.Contract(routerAddr, RouterJSON.abi, provider);
const spaceCoinAddr = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const spaceCoinContract = new ethers.Contract(spaceCoinAddr, SpacCoinJSON.abi, provider);
const liquidityPoolAddr = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const liquidityPoolContract = new ethers.Contract(liquidityPoolAddr, LiquidityPoolJSON.abi, provider);

async function connectToMetamask() {
  try {
    console.log("Signed in as", await signer.getAddress())
  }
  catch(err) {
    console.log("Not signed in")
    await provider.send("eth_requestAccounts", [])
  }
}

//
// LP
//
let currentEthToSpcPrice = 5;

provider.on("block", n => {
  console.log("New block", n)
  updateExchangeRate();
})

lp_deposit.eth.addEventListener('input', e => {
  lp_deposit.spc.value = +e.target.value * currentEthToSpcPrice
})

lp_deposit.spc.addEventListener('input', e => {
  lp_deposit.eth.value = +e.target.value / currentEthToSpcPrice
});

lp_deposit.addEventListener('submit', async e => {
  e.preventDefault()
  const form = e.target
  const amountEth = form.eth.value;
  const amountSpc = form.spc.value;
  console.log("Depositing", amountEth, "eth and", amountSpc, "spc")

  await connectToMetamask();
  await spaceCoinContract.connect(signer).approve(routerAddr, parseEther(amountSpc));
  await routerContract.connect(signer).addLiquidity(parseEther(amountSpc), { value: parseEther(amountEth) });
})

lp_withdraw.addEventListener('submit', async e => {
  e.preventDefault()
  console.log("Withdrawing 100% of LP")

  await connectToMetamask()
  const kvyBalance = await liquidityPoolContract.connect(signer).balanceOf(await signer.getAddress());
  console.log('KVY Balance; ', formatEther(kvyBalance));
  
  await liquidityPoolContract.connect(signer).approve(routerAddr, kvyBalance);
  await routerContract.connect(signer).removeLiquidity(kvyBalance);
});

async function updateExchangeRate() {
    await connectToMetamask();
    const _reserveEth = await routerContract.connect(signer).getReserveEth();
    const reserveEth = parseFloat(formatEther(_reserveEth));
    const _reserveSpc = await routerContract.connect(signer).getReserveSpc();
    const reserveSpc = parseFloat(formatEther(_reserveSpc));
    const newRate = reserveSpc / reserveEth
    currentEthToSpcPrice = newRate || 5;
    console.log('New exchange rate; ', currentEthToSpcPrice);
    console.log('Pool contains', reserveEth.toFixed(4), 'eth and', reserveSpc.toFixed(4), 'spc');
};

//
// Swap
//
let swapIn = { type: 'eth', value: 0 }
let swapOut = { type: 'spc', value: 0 }
switcher.addEventListener('click', () => {
  [swapIn, swapOut] = [swapOut, swapIn]
  swap_in_label.innerText = swapIn.type.toUpperCase()
  swap.amount_in.value = swapIn.value
  updateSwapOutLabel()
});

estimate.addEventListener('click', async (e) => {
    e.preventDefault();
    const amountInValue = document.getElementById('amount_in_input').value;
    const amountIn = parseEther(amountInValue);

    await connectToMetamask();
    const swapEstimate = await routerContract.connect(signer).getSwapEstimate(amountIn, swapIn.type === 'eth');
    console.log('Estimated value; ', formatEther(swapEstimate));
    updateSwapOutLabel(formatEther(swapEstimate));
});

function calculateMinReturn(slippage, amountIn) {
    return Math.abs((slippage * amountIn) / 100 - amountIn);
}

function updateSwapOutLabel(swapEstimate) {
  swap_out_label.innerText = `${swapEstimate || 0} ${swapOut.type.toUpperCase()} (with slippage)`
}

swap.addEventListener('submit', async e => {
  e.preventDefault()
  const form = e.target
  const amountIn = parseFloat(form.amount_in.value);

  console.log("Swapping", amountIn, swapIn.type, "for", swapOut.type)
  const exchangeRate = swapIn.type == 'eth' ? currentEthToSpcPrice : 1 / currentEthToSpcPrice;
  const minReturn = calculateMinReturn(form.slippage.value, amountIn * exchangeRate);
  console.log('Minimum acceptable return; ', minReturn);
  console.log(typeof minReturn)
  console.log('amount type',typeof amountIn)

  await connectToMetamask();
  if(swapIn.type === 'eth') {
      await routerContract.connect(signer).swapEthForSpc(parseEther(minReturn.toString()), { value: parseEther(amountIn.toString()) })
  } else {
      await spaceCoinContract.connect(signer).approve(routerAddr, parseEther(amountIn.toString()));
      await routerContract.connect(signer).swapSpcforEth(parseEther(amountIn.toString()), parseEther(minReturn.toString()));
  }
})
