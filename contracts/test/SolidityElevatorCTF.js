const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("SolidityElevatorCTF", function () {
  
  async function initialize() {
    const [owner, player1, player2, player3, player4] = await ethers.getSigners();

    const drngFactory = await ethers.getContractFactory("DRNG");
    const DRNG = await drngFactory.deploy();

    const solidityElevatorCtfFactory = await ethers.getContractFactory("SolidityElevatorCTF", {
      libraries: {
        DRNG: DRNG.address
      }
    });
    const SECTF = await solidityElevatorCtfFactory.deploy();

    //console.log("");
    //console.log(`- Owner: ${owner.address}`);
    //console.log(`- Player1: ${player1.address}`);
    //console.log(`- Player2: ${player2.address}`);
    //console.log(`- Player3: ${player3.address}`);
    //console.log(`- Player4: ${player4.address}`);
    //console.log(`- SolidityElevatorCTF deployed to ${SECTF.address}\n`);

    return { SECTF, owner, player1, player2, player3, player4 };
  }

  describe("Game Room Managment", function () {

    it("Should fail to get an Uninitialized game room", async function () {
      const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);

      try {
        let gameRoom = await SECTF.getGameRoom(0);
        expect(true).to.equal(false);
      } catch (err) {
        //console.log(`- Can't get uninitialized Game Room`);
        expect(false).to.equal(false);
      }
    });


    it("Should create a Game Room and allow new players to join in until Ready", async function () {
      const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);

      const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");

      let randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy(SECTF.address);
      await SECTF.connect(player1).createGameRoom(ELEVATOR_1.address, randomWallet.address);

      let totalGameRoom = await SECTF.totalGameRooms();

      try {
        await SECTF.connect(player1).joinGameRoom(totalGameRoom-1, ELEVATOR_1.address, randomWallet.address);
      } catch (err) {
        console.log(`  - ✅ PLAYER 1 CAN'T JOIN THE GAME AGAIN`);
      }

      randomWallet = ethers.Wallet.createRandom();

      try {
        await SECTF.connect(player2).joinGameRoom(totalGameRoom-1, ELEVATOR_1.address, randomWallet.address);
      } catch(err) {
        console.log(`  - ✅ PLAYER 2 CAN'T JOIN WITH SAME ELEVATOR AS PLAYER 1`);

        const ELEVATOR_2 = await exampleElevatorFactory.connect(player2).deploy(SECTF.address);
        await SECTF.connect(player2).joinGameRoom(totalGameRoom-1, ELEVATOR_2.address, randomWallet.address);
      }

      randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_3 = await exampleElevatorFactory.connect(player3).deploy(SECTF.address);
      await SECTF.connect(player3).joinGameRoom(totalGameRoom-1, ELEVATOR_3.address, randomWallet.address);

      try {
        randomWallet = ethers.Wallet.createRandom();
        const ELEVATOR_4 = await exampleElevatorFactory.connect(player4).deploy(SECTF.address);
        await SECTF.connect(player4).joinGameRoom(totalGameRoom-1, ELEVATOR_4.address, randomWallet.address);
      } catch (err) {
        console.log(`  - ✅ PLAYER 4 CAN'T JOIN THE FULL GAME`);
      }

      let gameRoom = await SECTF.getGameRoom(totalGameRoom - 1);

      expect(gameRoom.status).to.equal(2);
    });


    it("Should progress the game state", async function () {
      const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);
      
      const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");

      console.log("");

      let randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy(SECTF.address);
      await SECTF.connect(player1).createGameRoom(ELEVATOR_1.address, randomWallet.address);
      
      randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_2 = await exampleElevatorFactory.connect(player2).deploy(SECTF.address);
      await SECTF.connect(player2).joinGameRoom(0, ELEVATOR_2.address, randomWallet.address);
      
      randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_3 = await exampleElevatorFactory.connect(player3).deploy(SECTF.address);
      await SECTF.connect(player3).joinGameRoom(0, ELEVATOR_3.address, randomWallet.address);
      
      let gameRoom = await SECTF.getGameRoom(0);
      console.log(`GameRoom's turn is now: ${gameRoom.turn}`);

      let receipt = await SECTF.play(0, 100);
      await receipt.wait();
      console.log(`Gas spent moving 100 turns forwad: ${receipt.gasLimit.toString()}`);
      
      gameRoom = await SECTF.getGameRoom(0);
      console.log(`GameRoom's turn is now: ${gameRoom.turn}`);

      receipt = await SECTF.play(0, 100);
      await receipt.wait();
      console.log(`Gas spent moving 100 turns forwad: ${receipt.gasLimit.toString()}`);

      gameRoom = await SECTF.getGameRoom(0);
      console.log(`GameRoom's turn is now: ${gameRoom.turn}`);

      receipt = await SECTF.play(0, 100);
      await receipt.wait();
      console.log(`Gas spent moving 100 turns forwad: ${receipt.gasLimit.toString()}`);

      gameRoom = await SECTF.getGameRoom(0);
      console.log(`GameRoom's turn is now: ${gameRoom.turn}`);

      expect(gameRoom.turn).to.equal(301);
    });

  });
});
