// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./Elevator.sol";

// Elevator's data is received as an Array of ElevatorInfo structs with the following items:
//      ElevatorStatus status;
//      ElevatorLight light;
//      uint8 score;
//      uint8 targetFloor;   (only available/valid for elevInfo[myId])
//      uint8[] floorQueue;  (only available/valid for elevInfo[myId])
//      uint8[] passengers;  (only available/valid for elevInfo[myId])
//      uint32 balance;
//      uint32 speed;
//      uint32 y;
//      bytes32 data;        (only available/valid for elevInfo[myId])

// Elevator's turn is returned as an ElevatorUpdate struct with the following items:
//      ElevatorLight light;        Elevator light signals where the elevator is going (Off, Up, Down)
//                                  If left Off, passengers going down might get into the elevatro while going up
//                                  But if set correctly, you're also giving away to other elevators where you're going
//                                  Players could also try to set it incorrectly to deceive other players
//      bool replaceFloorQueue;     If set to true, the current floor queue will be completely replaced
//      uint8[] floorQueue;         if replaceFloorQueue is false, floors in this array are added to the current elevator
//                                  queue (up to 8 items). If replaceFloorQueue is true, current elevator queue is replaced
//                                  by this queue.
//      ActionType action;          What action to purchase
//      uint256 amount;             How much of that action to purchase
//      uint8 target;               Target id of player to target for SLOW_DOWN action
//      bytes32 data;               Arbitrary data to be used internally

// To calculate the price of 10 SPEED_UP Actions:
// SE.getActionCost(turn, actionsSold[uint256(SolidityElevatorCTF.ActionType.SPEED_UP)], SolidityElevatorCTF.ActionType.SPEED_UP, 10); 

contract ExampleElevator is Elevator {

    constructor(SolidityElevatorCTF _solidityElevatorCtf) Elevator(_solidityElevatorCtf) {}

    function playTurnOffChain(
        uint8 myId,
        uint8 numberOfPlayers,
        uint8 floors,
        uint8 scoreToWin,
        uint8[] memory topScoreElevators,
        uint16 turn,
        uint256[2] memory actionsSold,
        SolidityElevatorCTF.ElevatorInfo[] memory elevInfo,
        SolidityElevatorCTF.FloorButtons[] memory floorButtons
    ) override public view returns(SolidityElevatorCTF.ElevatorUpdate memory) {

        uint256 _speedUpCost = SE.getActionCost(turn, actionsSold[uint256(SolidityElevatorCTF.ActionType.SPEED_UP)], SolidityElevatorCTF.ActionType.SPEED_UP, 10);
        uint256 _slowDownCost = SE.getActionCost(turn, actionsSold[uint256(SolidityElevatorCTF.ActionType.SLOW_DOWN)], SolidityElevatorCTF.ActionType.SLOW_DOWN, 1);

        SolidityElevatorCTF.ActionType _actionType = SolidityElevatorCTF.ActionType.SPEED_UP;
        uint256 _amount;
        uint8 _target;
       
        if (elevInfo[myId].balance >= 50) {

            if (elevInfo[myId].speed < 100 && _speedUpCost <= 50) {
                _amount = 10;

            } else if (_slowDownCost <= 50) {
                bool _winning = (topScoreElevators.length == 1 && topScoreElevators[0] == myId);
                if (!_winning) {

                    _actionType = SolidityElevatorCTF.ActionType.SLOW_DOWN;
                    _amount = 1;

                    for (uint256 i=0; i<topScoreElevators.length; i++) {
                        if (topScoreElevators[i] != myId) {
                            _target = uint8(topScoreElevators[i]);
                            break;
                        }
                    }
                }
            }
        }

        if (elevInfo[myId].floorQueue.length == 0 && (
            elevInfo[myId].status == SolidityElevatorCTF.ElevatorStatus.Idle ||
            elevInfo[myId].status == SolidityElevatorCTF.ElevatorStatus.Waiting
        )) {

            uint8 _currentFloor = uint8(elevInfo[myId].y / 100);
            uint8 _nextFloor = (_currentFloor < (floors-1))?_currentFloor + 1:0;

            uint8[] memory _addToQueue = new uint8[](1);
            _addToQueue[0] = _nextFloor;

            return SolidityElevatorCTF.ElevatorUpdate(
                SolidityElevatorCTF.ElevatorLight.Off,
                false,
                _addToQueue,
                _actionType,
                _amount,
                _target,
                elevInfo[myId].data
            );
        }

        return SolidityElevatorCTF.ElevatorUpdate(
            elevInfo[myId].light,
            false,
            new uint8[](0),
            _actionType,
            _amount,
            _target,
            elevInfo[myId].data
        );
    }
}
