// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./IElevator.sol";
import "./SolidityElevatorCTF.sol";

abstract contract Elevator is IElevator {
    SolidityElevatorCTF.ElevatorUpdate private lastUpdate;

    function getLastUpdate() public view returns (SolidityElevatorCTF.ElevatorUpdate memory) {
        return lastUpdate;
    }

    function supportsInterface(bytes4 interfaceId) public view returns (bool) {
        return interfaceId == type(IElevator).interfaceId;
    }

    function playTurnOffChain(
        uint256 gameRoomId,
        uint8 myElevatorId,
        uint8[] memory topScoreElevators,
        uint16 turn,
        SolidityElevatorCTF.ElevatorInfo[] memory elevatorsInfo,
        SolidityElevatorCTF.FloorButtons[] memory floorButtons
    ) public view virtual returns (SolidityElevatorCTF.ElevatorUpdate memory);

    function playTurnOnChain(
        uint256 gameRoomId,
        uint8 myElevatorId,
        uint8[] memory topScoreElevators,
        uint16 turn,
        SolidityElevatorCTF.ElevatorInfo[] memory elevatorsInfo,
        SolidityElevatorCTF.FloorButtons[] memory floorButtons
    ) virtual external {
        lastUpdate = playTurnOffChain(
            gameRoomId,
            myElevatorId,
            topScoreElevators,
            turn,
            elevatorsInfo,
            floorButtons
        );
    }
}
