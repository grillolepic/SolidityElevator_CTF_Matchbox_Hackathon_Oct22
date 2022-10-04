const hre = require("hardhat");

async function main() {
  const elevatorFactory = await ethers.getContractFactory("ExampleElevator");
  const ELEVATOR = await elevatorFactory.deploy("0x2f6C415b10ca281D8fD9e2f18C7835A954168e55");

  console.log(`ELEVATOR deployed to ${ELEVATOR.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

//Last elevators deployed (Arbitrum Goerli Testnet):

//Last elevators deployed (Arbitrum Nova):
//  Elevator_1 deployed to 0x6957275a73A1Fa49a952e3a636B7F461C2464d3E
//  Elevator_2 deployed to 0x32926b615A661F498595036798b618785609F5BE
