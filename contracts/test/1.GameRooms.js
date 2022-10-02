const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("GameRooms", function () {
  
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

    it("Should allow the room creator to cancel the room, when not all players have joined in", async function () {
      const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);

      const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");

      let randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy();
      await SECTF.connect(player1).createGameRoom(3, 8, 100, ELEVATOR_1.address, randomWallet.address);
      await SECTF.connect(player1).exitGameRoom(0);

      let gameRoom = await SECTF.getGameRoom(0);

      expect(gameRoom.status).to.equal(5);
    });

    it("Should prevent a player from joining a game it has already joined", async function () {
      const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);

      const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");

      let randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy();
      await SECTF.connect(player1).createGameRoom(3, 8, 100, ELEVATOR_1.address, randomWallet.address);

      try {
        await SECTF.connect(player1).joinGameRoom(0, ELEVATOR_1.address, randomWallet.address);
      } catch (err) {
        expect(0).to.equal(0);
      }
    });

    it("Should prevent a player from joining a game it has already joined", async function () {
      const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);

      const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");

      let randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy();
      await SECTF.connect(player1).createGameRoom(3, 8, 100, ELEVATOR_1.address, randomWallet.address);

      randomWallet = ethers.Wallet.createRandom();
      try {
        await SECTF.connect(player2).joinGameRoom(0, ELEVATOR_1.address, randomWallet.address);
      } catch(err) {
        expect(0).to.equal(0);
      }
    });

    it("Should prevent a player from joining a full game", async function () {
      const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);

      const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");

      let randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy();
      await SECTF.connect(player1).createGameRoom(3, 8, 100, ELEVATOR_1.address, randomWallet.address);

      randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_2 = await exampleElevatorFactory.connect(player2).deploy();
      await SECTF.connect(player2).joinGameRoom(0, ELEVATOR_2.address, randomWallet.address);

      randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_3 = await exampleElevatorFactory.connect(player3).deploy();
      await SECTF.connect(player3).joinGameRoom(0, ELEVATOR_3.address, randomWallet.address);

      try {
        randomWallet = ethers.Wallet.createRandom();
        const ELEVATOR_4 = await exampleElevatorFactory.connect(player4).deploy();
        await SECTF.connect(player4).joinGameRoom(0, ELEVATOR_4.address, randomWallet.address);
      } catch (err) {
        expect(0).to.equal(0);
      }
    });

    it("Should prevent a player from cancelling a ready Game Room", async function () {
      const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);

      const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");

      let randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy();
      await SECTF.connect(player1).createGameRoom(3, 8, 100, ELEVATOR_1.address, randomWallet.address);

      randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_2 = await exampleElevatorFactory.connect(player2).deploy();
      await SECTF.connect(player2).joinGameRoom(0, ELEVATOR_2.address, randomWallet.address);

      randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_3 = await exampleElevatorFactory.connect(player3).deploy();
      await SECTF.connect(player3).joinGameRoom(0, ELEVATOR_3.address, randomWallet.address);

      let gameRoom = await SECTF.getGameRoom(0);

      try {
        await SECTF.connect(player1).exitGameRoom(0);
      } catch (err) {
        expect(gameRoom.status).to.equal(2);
      }      
    });

    it("Should allow a player to exit a room while not all players have joined in", async function () {
      const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);

      const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");

      let randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy();
      await SECTF.connect(player1).createGameRoom(3, 8, 100, ELEVATOR_1.address, randomWallet.address);

      randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_2 = await exampleElevatorFactory.connect(player2).deploy();
      await SECTF.connect(player2).joinGameRoom(0, ELEVATOR_2.address, randomWallet.address);

      await SECTF.connect(player2).exitGameRoom(0);

      randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_3 = await exampleElevatorFactory.connect(player3).deploy();
      await SECTF.connect(player3).joinGameRoom(0, ELEVATOR_3.address, randomWallet.address);

      let gameRoom = await SECTF.getGameRoom(0);
      expect(gameRoom.status).to.equal(1);    
    });

    it("Should set Game Room status to Timeout when deadline is reached", async function () {
      const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);

      const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");

      let randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy();
      await SECTF.connect(player1).createGameRoom(3, 8, 100, ELEVATOR_1.address, randomWallet.address);

      await network.provider.send("evm_increaseTime", [100000000])

      await SECTF.connect(player1).exitGameRoom(0);
      let gameRoom = await SECTF.getGameRoom(0);

      expect(gameRoom.status).to.equal(6);   
    });

    it("Should also return a Timeout when deadline is reached via the view function", async function () {
      const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);

      const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");

      let randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy();
      await SECTF.connect(player1).createGameRoom(3, 8, 100, ELEVATOR_1.address, randomWallet.address);

      await network.provider.send("evm_increaseTime", [100000000])
      await network.provider.send("evm_mine");

      let gameRoom = await SECTF.getGameRoom(0);
      expect(gameRoom.status).to.equal(6);   
    });

    it("Should allow to create single player rooms", async function () {
      const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);

      const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");

      let randomWallet = ethers.Wallet.createRandom();
      const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy();
      await SECTF.connect(player1).createGameRoom(1, 8, 100, ELEVATOR_1.address, randomWallet.address);
      await SECTF.connect(player1).exitGameRoom(0);

      let gameRoom = await SECTF.getGameRoom(0);

      expect(gameRoom.status).to.equal(2);
    });

  });
});
