const hre = require("hardhat");

async function main() {
    const solidityElevatorCtfFactory = await ethers.getContractFactory("SolidityElevatorCTF", {
        libraries: { DRNG: "0x62A59B08dEbb165D57969F430DA9542ffF45A5b1" }
      });
    const SECTF = await solidityElevatorCtfFactory.attach("0x2f6C415b10ca281D8fD9e2f18C7835A954168e55");

    const elevatorFactory = await ethers.getContractFactory("ExampleElevator");
    const ELEVATOR_1 = await elevatorFactory.attach("0x6957275a73A1Fa49a952e3a636B7F461C2464d3E");
    const ELEVATOR_2 = await elevatorFactory.attach("0x32926b615A661F498595036798b618785609F5BE");
    
    //let randomWallet = ethers.Wallet.createRandom();
    //await SECTF.createGameRoom(1, 8, 10, ELEVATOR_1.address, randomWallet.address);
        
    //let gameRoom = await SECTF.getGameRoom(0);
    //console.log(`GameRoom's turn is now: ${gameRoom.turn}`);

    try {
        let receipt = await SECTF.play(0, 100);
        await receipt.wait();
        console.log(receipt)
    } catch(err) {}

    gameRoom = await SECTF.getGameRoom(0);
    console.log(`GameRoom's turn is now: ${gameRoom.turn} and status is ${gameRoom.status}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});