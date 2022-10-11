const networkNames = {
    '0x1': 'Ethereum',
    '0xa4ba': 'Arbitrum Nova',
    '0x66eed': 'Arbitrum Goerli Testnet',
};

const solidityElevatorContractAddress = {
    '0xa4ba': '0x89904C10D46584fB2775B66Ae94057dCe7647AB3',
    '0x66eed': '0x068c8027e820A07233a644F33C5a478127D7a481'
};

const supportedChainIds = ["0xa4ba", "0x66eed"];

const defaultNetwork = {
    chainId: "0xa4ba",
    chainName: "Arbitrum Nova",
    nativeCurrency: {
      name: "ETH",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: ["https://nova.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://nova-explorer.arbitrum.io"]
};

export { networkNames, solidityElevatorContractAddress, supportedChainIds, defaultNetwork };