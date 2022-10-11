const hre = require("hardhat");

async function main() {
  const elevatorFactory = await ethers.getContractFactory("ExampleElevator");
  for (let i=0; i<4; i++) {
    const ELEVATOR = await elevatorFactory.deploy("0x1FcF557A46425B628928898B0Bb0Ea39439c1d76");
    console.log(`ELEVATOR deployed to ${ELEVATOR.address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

//Last elevators deployed (Arbitrum Goerli Testnet):
//  Elevator_1 deployed to 0xE2A0FEa6E8E68728Cb44246Ab51Fba273D99ea87
//  Elevator_2 deployed to 0x3Af87B607Eb829764eB31604c91CEd884B57E555
//  Elevator_3 deployed to 0x69Aa8a14d8c54715e7DB59ca7562814Eab1F0D14
//  Elevator_4 deployed to 0xe8429bFF945a7C667f81F2927864A615f0134dcf

//Last elevators deployed (Arbitrum Nova):
