const hre = require("hardhat");

async function main() {
  const drngFactory = await ethers.getContractFactory("DRNG");
  const DRNG = await drngFactory.deploy();

  console.log(`DRNG deployed to ${DRNG.address}`);

  const solidityElevatorCtfFactory = await ethers.getContractFactory("SolidityElevatorCTF", {
    libraries: {
      DRNG: DRNG.address
    }
  });
  const SECTF = await solidityElevatorCtfFactory.deploy();
  console.log(`SECTF deployed to ${SECTF.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
