require('dotenv').config();
require('hardhat-contract-sizer');
require("@nomicfoundation/hardhat-toolbox");

const { ARBITRUM_RPC, ARBITRUM_NOVA_RPC, ARBITRUM_GOERLI_RPC, DEPLOYER_KEY, ARBISCAN_API_KEY } = process.env;

module.exports = {
  solidity: {
    version: "0.8.17",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      }
    },
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
  },
  networks: {
    arbitrum: {
      url: ARBITRUM_RPC,
      accounts: [`0x${DEPLOYER_KEY}`],
    },
    arbitrum_nova: {
      url: ARBITRUM_NOVA_RPC,
      accounts: [`0x${DEPLOYER_KEY}`],
    },
    arbitrum_goerli: {
      url: ARBITRUM_GOERLI_RPC,
      accounts: [`0x${DEPLOYER_KEY}`],
    }
  },
  etherscan: {
    apiKey: {
      arbitrumOne: ARBISCAN_API_KEY,
      arbitrumTestnet: ARBISCAN_API_KEY,
    }
  }
};

//Deployer Address: 0x19ef8952cce41eb6e7d4337124bab6a708af2333