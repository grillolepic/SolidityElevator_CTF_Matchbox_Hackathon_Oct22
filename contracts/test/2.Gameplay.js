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

  describe("Play complete games", function () {

    it("Should play a complete game", async function () {
        const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);
        
        const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");
    
        let randomWallet = ethers.Wallet.createRandom();
        const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy(SECTF.address);
        await SECTF.connect(player1).createGameRoom(1, 8, 10, ELEVATOR_1.address, randomWallet.address);
        
        //randomWallet = ethers.Wallet.createRandom();
        //const ELEVATOR_2 = await exampleElevatorFactory.connect(player2).deploy(SECTF.address);
        //await SECTF.connect(player2).joinGameRoom(0, ELEVATOR_2.address, randomWallet.address);
  
        let gameRoom = await SECTF.getGameRoom(0);
        console.log(`GameRoom's turn is now: ${gameRoom.turn}`);
  
        while (true) {
          try {
            let receipt = await SECTF.play(0, 50);
            await receipt.wait();
          } catch(err) {}

          gameRoom = await SECTF.getGameRoom(0);
          console.log(`GameRoom's turn is now: ${gameRoom.turn} and status is ${gameRoom.status}`);
          
          if (gameRoom.status != 2) { break; }
        }

        expect(gameRoom.status).to.gt(2);
      });
  
    });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}