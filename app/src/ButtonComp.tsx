import React from 'react';
import { useConnect } from 'wagmi'
import { MetaMaskConnector } from 'wagmi/connectors/metaMask';

function ButtonComp() {
const { connect } = useConnect({ connector: new MetaMaskConnector });
  return (
    <button onClick={() => connect()}>Connect</button>
  );
}

export default ButtonComp;
