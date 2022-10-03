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
        await SECTF.connect(player1).createGameRoom(1, 8, 10, ELEVATOR_1.address, randomWallet.address);
        
        let gameRoom = await SECTF.getGameRoom(0);
        console.log(`GameRoom's turn is now: ${gameRoom.turn}`);
  
        let receipt = await SECTF.play(0, 50);
        await receipt.wait();
        console.log(`Gas spent moving 1 turns forwad: ${receipt.gasLimit.toString()}`);
        

        gameRoom = await SECTF.getGameRoom(0);
        console.log(`GameRoom's turn is now: ${gameRoom.turn}`);

        //console.log(gameRoom);

        expect(gameRoom.turn).to.equal(301);
      });
  
    });
});
