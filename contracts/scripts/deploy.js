const hre = require("hardhat");

async function main() {
  //const drngFactory = await ethers.getContractFactory("DRNG");
  //const DRNG = await drngFactory.deploy();
  //console.log(`DRNG deployed to ${DRNG.address}`);

  const solidityElevatorCtfFactory = await ethers.getContractFactory("SolidityElevatorCTF", {
    libraries: {
      DRNG: "0x62A59B08dEbb165D57969F430DA9542ffF45A5b1"  //DRNG.address
    }
  });
  const SECTF = await solidityElevatorCtfFactory.deploy();
  console.log(`SECTF deployed to ${SECTF.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

//Last deploy (Arbitrum Goerli Testnet):
//  DRNG deployed to 0x6957275a73A1Fa49a952e3a636B7F461C2464d3E
//  SECTF deployed to 0x068c8027e820A07233a644F33C5a478127D7a481

//Last deploy (Arbitrum Nova):
//  DRNG deployed to 0x62A59B08dEbb165D57969F430DA9542ffF45A5b1
//  SECTF deployed to 0x89904C10D46584fB2775B66Ae94057dCe7647AB3
