const networkNames = {
    '0x1': 'Ethereum',
    '0xa4ba': 'Arbitrum Nova',
    '0x66eed': 'Arbitrum Goerli Testnet',
};

const solidityElevatorContractAddress = {
    '0xa4ba': '0x680A96ed10fb967703c2b00DBfba85d438a2ac2A',
    '0x66eed': '0x6BcEad062664e1f5626DBFDe36f8589fb24cB33D'
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