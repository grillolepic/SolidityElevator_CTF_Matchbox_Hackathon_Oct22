const hre = require("hardhat");

async function main() {
  const elevatorFactory = await ethers.getContractFactory("ExampleElevator");
  for (let i=0; i<3; i++) {
    const ELEVATOR = await elevatorFactory.deploy("0x6BcEad062664e1f5626DBFDe36f8589fb24cB33D");
    console.log(`ELEVATOR deployed to ${ELEVATOR.address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

//Last elevators deployed (Arbitrum Goerli Testnet):
//  Elevator_1 deployed to 0xe9F0CdB22C71efCe4BFB7a1710AEb1bCA3A984f1
//  Elevator_2 deployed to 0xFA4349a00071941dBcb74c7eb6b144C7E7Adc41a
//  Elevator_3 deployed to 0xBcf4eE05997e3B936f8E043Fb1de62B51814A250


//Last elevators deployed (Arbitrum Nova):
//  Elevator_1 deployed to 0x6957275a73A1Fa49a952e3a636B7F461C2464d3E
//  Elevator_2 deployed to 0x32926b615A661F498595036798b618785609F5BE
