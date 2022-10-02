// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./Elevator.sol";

contract ExampleElevator is Elevator {
    function playTurnOffChain(
        uint256 gameRoomId,
        uint8 myElevatorId,
        uint8[] memory topScoreElevators,
        uint16 turn,
        SolidityElevatorCTF.ElevatorInfo[] memory elevInfo,
        SolidityElevatorCTF.FloorButtons[] memory floorButtons
    ) override public view returns(SolidityElevatorCTF.ElevatorUpdate memory) {
        return SolidityElevatorCTF.ElevatorUpdate(
            elevInfo[myElevatorId].light,
            false,
            new uint8[](0),
            SolidityElevatorCTF.ActionType.SPEED_UP,
            0,
            0,
            elevInfo[myElevatorId].data
        );
    }
}
