const networkNames = {
    '0x1': 'Ethereum',
    '0xa4ba': 'Arbitrum Nova',
    '0x66eed': 'Arbitrum Goerli Testnet',
};

const solidityElevatorContractAddress = {
    '0xa4ba': '0x2aae59f0FCaaA685b97A0cf5E0c8EA222E4Ac2e0',
    '0x66eed': '0x1FcF557A46425B628928898B0Bb0Ea39439c1d76'
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