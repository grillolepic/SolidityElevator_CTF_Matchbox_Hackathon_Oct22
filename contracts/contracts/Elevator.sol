// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./SolidityElevatorCTF.sol";

abstract contract Elevator {
    SolidityElevatorCTF internal immutable SECTF;

    constructor(SolidityElevatorCTF _sectf) {
        SECTF = _sectf;
    }

    SolidityElevatorCTF.ElevatorUpdate lastUpdate;

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
