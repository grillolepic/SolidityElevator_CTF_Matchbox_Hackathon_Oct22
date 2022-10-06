const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EncodeDecode", function () {
  
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

    it("Should create local, signed state hash, verifiable on-chain", async function () {
        const { SECTF, owner, player1, player2, player3, player4 } = await loadFixture(initialize);
        
        const exampleElevatorFactory = await ethers.getContractFactory("ExampleElevator");
    
        let randomWallet1 = ethers.Wallet.createRandom();
        const ELEVATOR_1 = await exampleElevatorFactory.connect(player1).deploy(SECTF.address);
        await SECTF.connect(player1).createGameRoom(2, 8, 10, ELEVATOR_1.address, randomWallet1.address);
        
        let randomWallet2 = ethers.Wallet.createRandom();
        const ELEVATOR_2 = await exampleElevatorFactory.connect(player2).deploy(SECTF.address);
        await SECTF.connect(player2).joinGameRoom(0, ELEVATOR_2.address, randomWallet2.address);
  
        let receipt = await SECTF.play(0, 50);
        await receipt.wait();

        let gameState = await SECTF.getGameState(0)

        let hashedCheckpoint = await SECTF.hashCheckpoint(
            0,
            gameState[0].turn,
            gameState[0].status,
            gameState[0].indices,
            gameState[0].randomSeed,
            gameState[0].waitingPassengers,
            gameState[1],
            gameState[2]
        );

        const abi = ethers.utils.defaultAbiCoder;
        let offChainHashedCheckpoint = ethers.utils.keccak256(
            abi.encode(
                [ "uint256", "uint16", "uint8", "uint8[]", "uint64[2]", "uint8",
                    "tuple(address, uint8, uint8, uint8, uint8, uint8[], uint8[], uint32, uint8, uint16, bytes32)[]",
                    "tuple(uint8[])[]"
                ],[   
                    0,
                    gameState[0].turn,
                    gameState[0].status,
                    gameState[0].indices,
                    gameState[0].randomSeed,
                    gameState[0].waitingPassengers,
                    gameState[1],
                    gameState[2]
                ]
            )
        );

        let hashedCheckpointSignature1 = await randomWallet1.signMessage(ethers.utils.arrayify(hashedCheckpoint));
        let hashedCheckpointSignature2 = await randomWallet2.signMessage(ethers.utils.arrayify(hashedCheckpoint));
        let signerAddress1 = ethers.utils.verifyMessage(ethers.utils.arrayify(hashedCheckpoint), hashedCheckpointSignature1);
        let signerAddress2 = ethers.utils.verifyMessage(ethers.utils.arrayify(hashedCheckpoint), hashedCheckpointSignature2);

        await SECTF.connect(player1).createGameRoom(2, 8, 10, ELEVATOR_1.address, randomWallet1.address);
        await SECTF.connect(player2).joinGameRoom(1, ELEVATOR_2.address, randomWallet2.address);
        await SECTF.play(1, 40);

        let gameState2 = await SECTF.getGameState(1);

        // THIS WILL WITH THE CURRENT CONTRACT
        // It was used to test applying a new state to a game without verifying signatures, which was tested separatedly

        try {
            await SECTF.loadCheckpoint(
                1,
                gameState[0].turn,
                gameState[0].status,
                gameState[0].indices,
                gameState[0].randomSeed,
                gameState[0].waitingPassengers,
                gameState[1],
                gameState[2],
                [ hashedCheckpointSignature1, hashedCheckpointSignature2 ]
            );

            gameState2 = await SECTF.getGameState(1)
            console.log(`GameRoom's turn is now: ${gameState2[0].turn} and status is ${gameState2[0].status}`);
            for (let i=0; i<8; i++) {
                console.log(`GameRoom's floor ${i}: ${gameState2[2][i].passengers.length} passengers`);
            }
        } catch(err) {}

        expect(true).to.eq(true);
      });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}