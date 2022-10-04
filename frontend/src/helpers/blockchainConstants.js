const networkNames = {
    '0x1': 'Ethereum',
    '0xa4ba': 'Arbitrum Nova',
    '0x66eed': 'Arbitrum Goerli Testnet',
};

const solidityElevatorContractAddress = {
    '0xa4ba': '0x32926b615A661F498595036798b618785609F5BE',
    '0x66eed': '0x2f6C415b10ca281D8fD9e2f18C7835A954168e55'
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