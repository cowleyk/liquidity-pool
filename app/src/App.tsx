import React from 'react';
import { Provider, createClient } from 'wagmi'
import { MetaMaskConnector } from 'wagmi/connectors/metaMask';
import ButtonComp from './ButtonComp';
import './App.css';

const client = createClient()

const App = () => (
  <Provider client={client}>
    <div className="App">
      <ButtonComp />
    </div>
  </Provider>
);

export default App;
