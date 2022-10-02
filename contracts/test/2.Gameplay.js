const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("Gameplay", function () {
  
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

    it("Should progress the game state", async function () {
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
