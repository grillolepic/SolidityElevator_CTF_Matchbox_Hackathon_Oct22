// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./IElevator.sol";
import "./SolidityElevatorCTF.sol";
import "hardhat/console.sol";

abstract contract Elevator is IElevator {
    SolidityElevatorCTF internal immutable SE;
    
    constructor(SolidityElevatorCTF _solidityElevatorCtf) {
        SE = _solidityElevatorCtf;
    }

    SolidityElevatorCTF.ElevatorUpdate private lastUpdate;

    function getLastUpdate() external view returns (SolidityElevatorCTF.ElevatorUpdate memory) {
        return lastUpdate;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IElevator).interfaceId;
    }

    function playTurnOffChain(
        uint8 myId,
        uint8 numberOfPlayers,
        uint8 floors,
        uint8 scoreToWin,
        uint8[] memory topScoreElevators,
        uint16 turn,
        uint256[2] memory actionsSold,
        SolidityElevatorCTF.ElevatorInfo[] memory elevatorsInfo,
        SolidityElevatorCTF.FloorButtons[] memory floorButtons
    ) public view virtual returns (SolidityElevatorCTF.ElevatorUpdate memory);

    function playTurnOnChain(
        uint8 myId,
        uint8 numberOfPlayers,
        uint8 floors,
        uint8 scoreToWin,
        uint8[] memory topScoreElevators,
        uint16 turn,
        uint256[2] memory actionsSold,
        SolidityElevatorCTF.ElevatorInfo[] memory elevatorsInfo,
        SolidityElevatorCTF.FloorButtons[] memory floorButtons
    ) virtual external {
        lastUpdate = playTurnOffChain(
            myId,
            numberOfPlayers,
            floors,
            scoreToWin,
            topScoreElevators,
            turn,
            actionsSold,
            elevatorsInfo,
            floorButtons
        );
    }
}
