const hre = require("hardhat");

async function main() {
  const elevatorFactory = await ethers.getContractFactory("ExampleElevator");
  const ELEVATOR = await elevatorFactory.deploy("0xfF2d3e06601420E3eAD72dDe9aa354CcB4C47992");

  console.log(`ELEVATOR deployed to ${ELEVATOR.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

//Last elevators deployed (Arbitrum Goerli Testnet):
//  Elevator_1 deployed to 0x643c19Bd704bB8aEcE37e233e93544a3DcB89f14
//  Elevator_2 deployed to 0x42150F75F14607D14CE6F4bD5620023c8606D303



//Last elevators deployed (Arbitrum Nova):
//  Elevator_1 deployed to 0x6957275a73A1Fa49a952e3a636B7F461C2464d3E
//  Elevator_2 deployed to 0x32926b615A661F498595036798b618785609F5BE
