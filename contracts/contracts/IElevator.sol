// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./SolidityElevatorCTF.sol";

interface IElevator {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
    function playTurnOnChain(
        uint256 gameRoomId,
        uint8 myElevatorId,
        uint8[] memory topScoreElevators,
        uint16 turn,
        SolidityElevatorCTF.ElevatorInfo[] memory elevatorsInfo,
        SolidityElevatorCTF.FloorButtons[] memory floorButtons
    ) external;
}