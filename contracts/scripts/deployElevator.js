const hre = require("hardhat");

async function main() {
  const elevatorFactory = await ethers.getContractFactory("ExampleElevator");
  for (let i=0; i<4; i++) {
    const ELEVATOR = await elevatorFactory.deploy("0x068c8027e820A07233a644F33C5a478127D7a481");
    console.log(`ELEVATOR deployed to ${ELEVATOR.address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

//Last elevators deployed (Arbitrum Goerli Testnet):
//  Elevator_1 deployed to 0x3783Bd5c2584b45672834950D7f80f945b604898
//  Elevator_2 deployed to 0x948EA79714Fa6229C4494E3622a5161d12c840C0
//  Elevator_3 deployed to 0x82B2e50F4BDb83F8Cd46F4EE9FE9e81B6CB05dCE
//  Elevator_4 deployed to 0x31ac2fb994Df3Ca8d4866cF4D1064E8f57f0d407

//Last elevators deployed (Arbitrum Nova):