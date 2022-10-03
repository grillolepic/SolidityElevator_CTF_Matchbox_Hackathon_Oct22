// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @title Solidity Elevator CTF
/// @author grillolepic <TW: @grillo_eth>
/// @dev Note: Solidity Elevator CTF is inspired by Paradigm's 0xMonaco
/// @dev Note: and ElevatorSaga by Magnus Wolffelt and contributors
/// @dev Note: 0xMonaco: https://0xmonaco.ctf.paradigm.xyz/
/// @dev Note: ElevatorSaga: https://play.elevatorsaga.com/
/// @dev Note: Built for MatchboxDAO's October 2022 Hackathon

import "./utils/SignedWadMath.sol";
import "./utils/DRNG.sol";

import "./IElevator.sol";
import "./Elevator.sol";
import "hardhat/console.sol";

contract SolidityElevatorCTF {

    /*//////////////////////////////////////////////////////////////
                              EVENTS
    //////////////////////////////////////////////////////////////*/

    event GameRoomCreated(uint256 indexed id, address player);
    event GameRoomPlayerJoined(uint256 indexed id, address player);
    event GameRoomPlayerLeft(uint256 indexed id, address player);
    event GameRoomReady(uint256 indexed id);
    event GameRoomCancelled(uint256 indexed id);
    event GameRoomTimeout(uint256 indexed id);
    event GameRoomFinished(uint256 indexed id, address winner);

    /*//////////////////////////////////////////////////////////////
                        MISCELLANEOUS CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint8 private constant MAX_PLAYERS = 4;
    uint8 private constant MIN_FLOORS = 4;
    uint8 private constant MAX_FLOORS = 8;
    uint8 private constant MIN_SCORE_TO_WIN = 10;
    uint8 private constant MAX_SCORE_TO_WIN = 100;
    uint32 private constant MAX_ROOM_TIME = 1 hours;

    uint16 private constant SOFT_TURN_DEADLINE = 1000;
    uint16 private constant HARD_TURN_DEADLINE = (SOFT_TURN_DEADLINE * 11) / 10;

    uint8 private constant NEW_PASSENGERS_SPAWN_RATE = 5;   //MORE IS LESS
    uint8 private constant MAX_PASSENGERS_PER_ELEVATOR = 4;
    uint8 private constant MAX_WAITING_PASSENGERS = 100;
    
    uint8 private constant ELEVATOR_INITIAL_SPEED = 10;
    uint8 private constant ELEVATOR_MAX_SPEED = 100;
    uint8 private constant ELEVATOR_MAX_FLOOR_QUEUE = 8;
    uint16 private constant ELEVATOR_INITIAL_POSITION = 0;
    uint32 private constant ELEVATOR_INITIAL_BALANCE = 15000;

    uint32 private constant MAX_GAS_FOR_ON_CHAIN_TURN = 2_000_000;
    
    /*//////////////////////////////////////////////////////////////
                      ACTIONS & PRICING CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint8 private constant ACTIONS_TYPES = 2;

    enum ActionType { SPEED_UP, SLOW_DOWN }

    struct ActionSettings {
        int256 targetPrice;
        int256 perTurnDecrease;
        int256 sellPerTurn;
        uint8 value;
    }

    mapping (ActionType => ActionSettings) internal actionSettings;

    constructor() {
        actionSettings[ActionType.SPEED_UP] = ActionSettings(10e18, 0.33e18, 2e18, 10);
        actionSettings[ActionType.SLOW_DOWN] = ActionSettings(200e18, 0.33e18, 0.2e18, 5);
    }
    
    /*//////////////////////////////////////////////////////////////
                  ELEVATOR GAME STRUCTS AND STORAGE
    //////////////////////////////////////////////////////////////*/
    
    enum ElevatorStatus { Idle, GoingUp, GoingDown, Opening, Closing, Waiting, Undefined }
    enum ElevatorLight { Off, Up, Down }
    enum FloorButtons { Off, Up, Down, Both }
    
    struct FloorPassengerData {
        uint8[] passengers;     // Passengers waiting on the floor, as an array of floor numbers they are going to
    }

    //This struct is used to store the complete data for each Elevator
    struct ElevatorData {
        Elevator elevator;
        ElevatorStatus status;
        ElevatorLight light;
        uint8 score;            // Total number of passengers taken to destination
        uint8 targetFloor;      // The floor the elevetor is currently going to (if status != Idle)
        uint8[] floorQueue;     // Queue of next floors
        uint8[] passengers;     // Passengers on the elevator, as an array of floor numbers they are going to
        uint32 balance;         // Where 0 means the elevator has no money.
        uint8 speed;            // Elevator moves at constant speed (no acceleration). This value represents
                                // the speed of the elevator while moving (ie. while status != 'Idle')
        uint16 y;               // 0 is Floor 0, 100 is Floor 1 and 150 is in between both.
                                // Max value (with 8 floors) is 800.
        bytes32 data;           // Arbitrary data to be used by the player.
    }

    //This struct (almost identical to ElevatorData) is used to send partial Elevator data to the active player
    struct ElevatorInfo {
        ElevatorStatus status;
        ElevatorLight light;
        uint8 score;
        uint8 targetFloor;
        uint8[] floorQueue;
        uint8[] passengers;
        uint32 balance;
        uint32 speed;
        uint32 y;
        bytes32 data;
    }   

    //This struct is used to receive Elevator updates from the active player
    struct ElevatorUpdate {
        ElevatorLight light;        //Change in light status
        bool replaceFloorQueue;
        uint8[] floorQueue;         // Floors to be added to the queue or to replace the queue (if replaceFloorQueue == true)
        ActionType action;          // Where 0 means the elevator has no money.
        uint256 amount;             // Where 0 means the elevator is stuck and can't move.
        uint8 target;               // Target for the action (for SLOW_DOWN)
        bytes32 data;               // Arbitrary data to be updated;
    }

    function initialElevatorData(Elevator elevator) private pure returns (ElevatorData memory) {
        uint8[] memory _passengers;
        uint8[] memory _floorQueue;
        
        return ElevatorData(
            elevator,
            ElevatorStatus.Idle,
            ElevatorLight.Off,
            0,
            0,
            _floorQueue,
            _passengers,
            ELEVATOR_INITIAL_BALANCE,
            ELEVATOR_INITIAL_SPEED,
            ELEVATOR_INITIAL_POSITION,
            bytes32(0)
        );
    }

    /*//////////////////////////////////////////////////////////////
                    GAME ROOMS STRUCTS AND STORAGE
    //////////////////////////////////////////////////////////////*/

    enum GameRoomStatus { Uninitialized, Created, Ready, FinishedWithWinner, FinishedWithoutWinner, Cancelled, Timeout }

    struct GameRoom {
        GameRoomStatus status;
        uint8 numberOfPlayers;
        uint8 floors;
        uint8 scoreToWin;
        uint32 deadline;
        address[] players;
        uint8[] indices;
        address[] offchainPublicKeys;
        uint16 turn;
        uint8 waitingPassengers;
        uint64[2] randomSeed;
        uint256[ACTIONS_TYPES] actionsSold;
    }

    uint256 public totalGameRooms;
    mapping(uint256 => GameRoom) private gameRooms;
    mapping(uint256 => ElevatorData[]) private elevatorsData;
    mapping(uint256 => FloorPassengerData[]) private floorPassengersData;

    error NotJoined();
    error WrongSettings();
    error WrongElevatorInterface();
    error GameRoomUnavailable(uint256 id);
    error GameRoomPlayerAlreadyJoined(uint256 id, address player);
    error GameRoomElevatorAlreadyJoined(uint256 id, address elevator);
    error GameRoomPlayOnFinished(uint256 id);

    /*//////////////////////////////////////////////////////////////`
                        GAME ROOM MANAGMENT
    //////////////////////////////////////////////////////////////*/

    function getGameRoom(uint256 id) external view returns (GameRoom memory) {
        GameRoom memory _room = gameRooms[id];
        if (_room.status == GameRoomStatus.Uninitialized) { revert GameRoomUnavailable(id); }
        if (_room.status == GameRoomStatus.Created || _room.status != GameRoomStatus.Ready) {
            if (block.timestamp > _room.deadline) {
                _room.status = GameRoomStatus.Timeout;
            }
        }
        return _room;
    }

    function createGameRoom(uint8 numberOfPlayers, uint8 floors, uint8 scoreToWin, Elevator elevator, address offchainPublicKey) external {
        if (numberOfPlayers == 0 || numberOfPlayers > MAX_PLAYERS) { revert WrongSettings(); }
        if (floors < MIN_FLOORS || floors > MAX_FLOORS) { revert WrongSettings(); }
        if (scoreToWin < MIN_SCORE_TO_WIN || scoreToWin > MAX_SCORE_TO_WIN) { revert WrongSettings(); }
        if (!elevator.supportsInterface(type(IElevator).interfaceId)) { revert WrongElevatorInterface(); }

        address[] memory _players = new address[](1);
        uint8[] memory _indices = new uint8[](1);
        address[] memory _offchainPublicKeys = new address[](1);
        uint256[ACTIONS_TYPES] memory _actionsSold;

        _players[0] = msg.sender;
        _indices[0] = 0;
        _offchainPublicKeys[0] = offchainPublicKey;

        elevatorsData[totalGameRooms].push(initialElevatorData(elevator));
        
        if (numberOfPlayers == 1) {
            uint8[] memory _passengers;
            for (uint256 i = 0; i < floors; i++) {
                floorPassengersData[totalGameRooms].push(FloorPassengerData(_passengers));
            }

            //TODO: Replace with better Entropy Generation or VRF?
            uint64[2] memory _firstSeed = DRNG.seed(uint64(uint256(blockhash(block.number - 1))));

            GameRoom memory _room = GameRoom(
                GameRoomStatus.Ready,
                numberOfPlayers,
                floors,
                scoreToWin,
                uint32(block.timestamp) + MAX_ROOM_TIME,
                _players,
                _indices,
                _offchainPublicKeys,
                1, 0,
                _firstSeed,
                _actionsSold
            );   
            gameRooms[totalGameRooms] = _room;
        } else {
            uint64[2] memory _emptySeed;
            GameRoom memory _room = GameRoom(
                GameRoomStatus.Created,
                numberOfPlayers,
                floors,
                scoreToWin,
                uint32(block.timestamp) + MAX_ROOM_TIME,
                _players,
                _indices,
                _offchainPublicKeys,
                1, 0,
                _emptySeed,
                _actionsSold
            );   
            gameRooms[totalGameRooms] = _room;
        }

        emit GameRoomCreated(totalGameRooms, msg.sender);
        totalGameRooms++;
    }

    function exitGameRoom(uint256 id) external {
        GameRoom storage _room = gameRooms[id];

        if (_room.status == GameRoomStatus.Ready) {
            if (block.timestamp > _room.deadline) {
                _room.status = GameRoomStatus.Timeout;
                emit GameRoomTimeout(id);
            }
        } else if (_room.status == GameRoomStatus.Created) {
            if (block.timestamp > _room.deadline) {
                _room.status = GameRoomStatus.Timeout;
                emit GameRoomTimeout(id);
                return;
            }
            if (_room.players[0] == msg.sender) { 
                _room.status = GameRoomStatus.Cancelled;
                emit GameRoomCancelled(id);
            } else {
                uint8 _playerIndex;
                for (uint8 i=1; i<_room.players.length; i++) {
                    if (_room.players[i] == msg.sender) {
                        _playerIndex = i;
                    }
                }
                if (_playerIndex == 0) { revert NotJoined(); }
                _room.players[_playerIndex] = _room.players[_room.players.length-1];
                _room.players.pop();
                _room.offchainPublicKeys[_playerIndex] = _room.offchainPublicKeys[_room.players.length-1];
                _room.offchainPublicKeys.pop();
                _room.indices.pop();
                emit GameRoomPlayerLeft(id, msg.sender);
            }
        } else {
            revert GameRoomUnavailable(id);
        }
    }

    function joinGameRoom(uint256 id, Elevator elevator, address offchainPublicKey) external {

        GameRoom storage _room = gameRooms[id];
        if (_room.status != GameRoomStatus.Created) { revert GameRoomUnavailable(id); }
        if (!elevator.supportsInterface(type(IElevator).interfaceId)) { revert WrongElevatorInterface(); }

        if (block.timestamp > _room.deadline) {
            _room.status = GameRoomStatus.Timeout;
            emit GameRoomTimeout(id);
            return;
        }

        ElevatorData[] storage _elevatorsData = elevatorsData[id];
        
        uint256 _newPlayerIndex = _room.players.length;
        for (uint256 i=0; i<_newPlayerIndex; i++) {
            if (_room.players[i] == msg.sender) { revert GameRoomPlayerAlreadyJoined(id, msg.sender); }
            if (_elevatorsData[i].elevator == elevator) { revert GameRoomElevatorAlreadyJoined(id, address(elevator)); }
        }

        _room.players.push(msg.sender);
        _room.indices.push(uint8(_newPlayerIndex));
        _room.offchainPublicKeys.push(offchainPublicKey);

        elevatorsData[id].push(initialElevatorData(elevator));
        
        emit GameRoomPlayerJoined(id, msg.sender);

        if (_newPlayerIndex == (_room.numberOfPlayers - 1)) {

            uint8[] memory _passengers;
            for (uint256 i = 0; i < _room.floors; i++) {
                floorPassengersData[id].push(FloorPassengerData(_passengers));
            }

            //TODO: Replace with better Entropy Generation or VRF?
            uint64[2] memory _firstSeed = DRNG.seed(uint64(uint256(blockhash(block.number - 1))));
            (uint64 _firstRandom, uint64[2] memory _nextSeed) = DRNG.next(_firstSeed);

            uint8[] memory _newIndices = shuffledIndices(_firstRandom, _room.numberOfPlayers);
            _room.indices = _newIndices;
            _room.randomSeed = _nextSeed;

            _room.status = GameRoomStatus.Ready;
            emit GameRoomReady(id);
        }
    }

    /*//////////////////////////////////////////////////////////////
                              CORE GAME
    //////////////////////////////////////////////////////////////*/

    //TODO: Add function to load a state from signed data
    
    function play(uint256 gameRoomId, uint16 turnsToPlay) external {

        GameRoom memory _room = gameRooms[gameRoomId];
        ElevatorData[] memory _elevatorsData = elevatorsData[gameRoomId];
        FloorPassengerData[] storage _floorPassengersData = floorPassengersData[gameRoomId];
        
        if (_room.status > GameRoomStatus.Ready) { revert GameRoomPlayOnFinished(gameRoomId); }

        FloorButtons[] memory _floorButtons = calculateFloorButtons(_room.turn, _floorPassengersData);
        uint8[] memory _topScoreElevators = calculateTopScoreElevators(_elevatorsData);

        unchecked {
            for (uint16 t=0; t<turnsToPlay; t++) {

                // First, get the elevator playing this turn
                uint8 _currentElevatorId = _room.indices[(_room.turn - 1) % _room.numberOfPlayers];

                // Then, calculate a new random number for this turn
                (uint64 _random, uint64[2] memory _nextSeed) = DRNG.next(_room.randomSeed);
                _room.randomSeed = _nextSeed;

                // Now use randomness to see if a new waiting passenger needs to be created
                (bool _createNewPassenger, uint8 _startFloor, uint8 _targetFloor) = newPassenger(
                    _random,
                    _room.floors,
                    _room.waitingPassengers,
                    MAX_WAITING_PASSENGERS,
                    NEW_PASSENGERS_SPAWN_RATE
                );
                
                // If a passenger needs to be added, push it into storage and update elevator lights
                if (_createNewPassenger) {
                    _floorPassengersData[_startFloor].passengers.push(_targetFloor);
                    if (_floorButtons[_startFloor] == FloorButtons.Off) {
                        _floorButtons[_startFloor] = (_startFloor < _targetFloor)?FloorButtons.Up:FloorButtons.Down;
                    } else if ((_floorButtons[_startFloor] != FloorButtons.Both) &&
                        ((_targetFloor > _startFloor && _floorButtons[_startFloor] == FloorButtons.Down) ||
                        (_targetFloor < _startFloor && _floorButtons[_startFloor] == FloorButtons.Up))) {
                            _floorButtons[_startFloor] = FloorButtons.Both;
                    }
                    _room.waitingPassengers++;
                }

                // Next, calculate the other elevator info to send to the smart contract call
                // ElevatorInfo includes full elevator data for the current elevator, and partial data for the other ones.
                ElevatorInfo[] memory _elevatorInfo = buildElevatorsInfo(_elevatorsData, _currentElevatorId);


                //////////////////////////////////////////////////////
                //                 ELEVATOR CONTROL                 //
                //////////////////////////////////////////////////////

                // And now, call the external function to make the call.
                // This function doesn't modify this contract's state, it only updates a ElevatorUpdate struct on the
                // Elevator contract itself. This function then reads the update and updates local state following
                // the game logic
                try _elevatorsData[_currentElevatorId].elevator.playTurnOnChain{gas: MAX_GAS_FOR_ON_CHAIN_TURN}(
                    gameRoomId,
                    _currentElevatorId,
                    _topScoreElevators,
                    _room.turn,
                    _elevatorInfo,
                    _floorButtons
                ) {
                    // If the call was successfull, load the update from storage
                    ElevatorUpdate memory _update = _elevatorsData[_currentElevatorId].elevator.getLastUpdate();

                    // Try to purchase actions if required in the update
                    if (_update.amount > 0) {
                        uint256 _cost = getActionCost(gameRoomId, _update.action, _update.amount);
                        if (_elevatorsData[_currentElevatorId].balance >= _cost) {

                            uint8 _value = actionSettings[_update.action].value;

                            //Only purchase and execute the actions if within speed limits: (0 <= speed <= ELEVATOR_MAX_SPEED)

                            if ((_update.action == ActionType.SPEED_UP) && (_elevatorsData[_currentElevatorId].speed < ELEVATOR_MAX_SPEED)) {
                                _elevatorsData[_currentElevatorId].balance -= uint32(_cost);
                                if (_elevatorsData[_currentElevatorId].speed + _value <= ELEVATOR_MAX_SPEED) {
                                    _elevatorsData[_currentElevatorId].speed += _value;
                                } else {
                                    _elevatorsData[_currentElevatorId].speed = ELEVATOR_MAX_SPEED;
                                }
                            } else if ((_update.action == ActionType.SLOW_DOWN) && (_elevatorsData[_update.target].speed > 0)) {
                                _elevatorsData[_currentElevatorId].balance -= uint32(_cost);
                                if (_value >= _elevatorsData[_currentElevatorId].speed) {
                                    _elevatorsData[_currentElevatorId].speed = 0;
                                } else {
                                    _elevatorsData[_update.target].speed -= _value;
                                }
                            }
                        }
                    }

                    //Light and data are always updated
                    _elevatorsData[_currentElevatorId].light = _update.light;
                    _elevatorsData[_currentElevatorId].data = _update.data;

                    //Floor Queue is managed in storage. It can be fully replaced or added to the current queue.
                    if (_update.replaceFloorQueue) {
                        //If fully replaced, we first remove any excess items in storage
                        while (_update.floorQueue.length > elevatorsData[gameRoomId][_currentElevatorId].floorQueue.length) {
                            elevatorsData[gameRoomId][_currentElevatorId].floorQueue.pop();
                        }
                        //We then loop through the update queue and update the storage (pushing or replacing)
                        for (uint256 i=0; i<_update.floorQueue.length; i++) {
                            if (elevatorsData[gameRoomId][_currentElevatorId].floorQueue.length > i) {
                                elevatorsData[gameRoomId][_currentElevatorId].floorQueue[i] = _update.floorQueue[i];
                            } else {
                                if (elevatorsData[gameRoomId][_currentElevatorId].floorQueue.length == ELEVATOR_MAX_FLOOR_QUEUE) { break; }
                                elevatorsData[gameRoomId][_currentElevatorId].floorQueue.push(_update.floorQueue[i]);
                            }
                        }
                    } else {
                        //If update queue only asks to be added to the current queue, we just loop and push to storage
                        for (uint256 i=0; i<_update.floorQueue.length; i++) {
                            if (elevatorsData[gameRoomId][_currentElevatorId].floorQueue.length == ELEVATOR_MAX_FLOOR_QUEUE) { break; }
                            elevatorsData[gameRoomId][_currentElevatorId].floorQueue.push(_update.floorQueue[i]);
                        }
                    }
                    //We finally copy the updated storage to memory
                    _elevatorsData[_currentElevatorId].floorQueue = elevatorsData[gameRoomId][_currentElevatorId].floorQueue;

                } catch {}
               
                //////////////////////////////////////////////////////
                //                    GAME LOGIC                    //
                //////////////////////////////////////////////////////

                //Now that the elevator has processed its turns, execute game logic depending on the current elevator state
                //In the process, check if the elevator has won (by achieving target score)
                bool _won;

                //Elevator is Idle while doors are open, no floorTarget is set and no passenger is available to go in or out of the elevator
                if (_elevatorsData[_currentElevatorId].status == ElevatorStatus.Idle) {

                    uint8 _currentFloor = currentFloor(_elevatorsData[_currentElevatorId]);

                    //First check if passangers are available to get into the elevator
                    (bool _passengersToGetIn, uint8 _targetPassengerIndex) = findNextPassangerForElevator(
                        _elevatorsData[_currentElevatorId],
                        _currentFloor,
                        _floorPassengersData[_currentFloor].passengers,
                        MAX_PASSENGERS_PER_ELEVATOR
                    );

                    //If there's a passanger available to get in:
                    // 1) Push it into the elevator
                    // 2) Pop it from the floor
                    // 3) Change status to 'Waiting'
                    if (_passengersToGetIn) {
                        elevatorsData[gameRoomId][_currentElevatorId].passengers.push(_floorPassengersData[_currentFloor].passengers[_targetPassengerIndex]);
                        _floorPassengersData[_currentFloor].passengers[_targetPassengerIndex] = _floorPassengersData[_currentFloor].passengers[_floorPassengersData[_currentFloor].passengers.length - 1];
                        _floorPassengersData[_currentFloor].passengers.pop();
                        _elevatorsData[_currentElevatorId].status = ElevatorStatus.Waiting;

                        //TODO: Recalculate floor light

                    } else {
                        //If there's no passenger, check if there's a floor in the queue.
                        //If so, loop through the queue to find the next targetFloor, then:
                        // 1) Set the elevator's target floor
                        // 2) Shift the floor queue (in storage)
                        // 3) Update the memory queue
                        // 4) Change the status to 'Closing'
                            
                        for (uint8 i=0; i<_elevatorsData[_currentElevatorId].floorQueue.length; i++) {
                            _elevatorsData[_currentElevatorId].targetFloor = _elevatorsData[_currentElevatorId].floorQueue[0];
                            shiftArray(elevatorsData[gameRoomId][_currentElevatorId].floorQueue);
                            _elevatorsData[_currentElevatorId].floorQueue = elevatorsData[gameRoomId][_currentElevatorId].floorQueue;
                            _elevatorsData[_currentElevatorId].status = ElevatorStatus.Closing;
                            if (_elevatorsData[_currentElevatorId].targetFloor != _currentFloor) { break; }
                        }
                    }
                } else if (_elevatorsData[_currentElevatorId].status == ElevatorStatus.GoingUp) {

                    //Just increase the elevator's position until it reaches the targetFloor
                    //When reached, set status to 'Opening'
                    _elevatorsData[_currentElevatorId].y += _elevatorsData[_currentElevatorId].speed;
                    if (_elevatorsData[_currentElevatorId].y >= (_elevatorsData[_currentElevatorId].targetFloor * 100)) {
                        _elevatorsData[_currentElevatorId].y = _elevatorsData[_currentElevatorId].targetFloor * 100;
                        _elevatorsData[_currentElevatorId].status = ElevatorStatus.Opening;
                    }

                } else if (_elevatorsData[_currentElevatorId].status == ElevatorStatus.GoingDown) {

                    //Just decrease the elevator's position until it reaches the targetFloor
                    //(Being careful not to underflow!)
                    //When reached, set status to 'Opening'
                    if (_elevatorsData[_currentElevatorId].speed <= _elevatorsData[_currentElevatorId].y) {
                        _elevatorsData[_currentElevatorId].y -= _elevatorsData[_currentElevatorId].speed;
                    } else {
                        _elevatorsData[_currentElevatorId].y = 0;
                    }
                    if (_elevatorsData[_currentElevatorId].y <= (_elevatorsData[_currentElevatorId].targetFloor * 100)) {
                        _elevatorsData[_currentElevatorId].y = _elevatorsData[_currentElevatorId].targetFloor * 100;
                        _elevatorsData[_currentElevatorId].status = ElevatorStatus.Opening;
                    }

                } else if (_elevatorsData[_currentElevatorId].status == ElevatorStatus.Opening) {
               
                    //'Opening' can only lead to 'Waiting'
                    _elevatorsData[_currentElevatorId].status = ElevatorStatus.Waiting;

                } else if (_elevatorsData[_currentElevatorId].status == ElevatorStatus.Closing) {
                    
                    //Change Status to 'GoingUp' or 'GoingDown' depending on currentFloor and targetFloor
                    uint8 _currentFloor = currentFloor(_elevatorsData[_currentElevatorId]);
                    if (_currentFloor < _elevatorsData[_currentElevatorId].targetFloor) {
                        _elevatorsData[_currentElevatorId].status = ElevatorStatus.GoingUp;
                    } else if (_currentFloor > _elevatorsData[_currentElevatorId].targetFloor) {
                        _elevatorsData[_currentElevatorId].status = ElevatorStatus.GoingDown;
                    } else {
                        _elevatorsData[_currentElevatorId].status = ElevatorStatus.Opening;
                    }

                } else if (_elevatorsData[_currentElevatorId].status == ElevatorStatus.Waiting) {

                    uint8 _currentFloor = currentFloor(_elevatorsData[_currentElevatorId]);

                    //First check if passangers are available to get into the elevator
                    (bool _passengersToGetIn, uint8 _targetIncomingPassengerIndex) = findNextPassangerForElevator(
                        _elevatorsData[_currentElevatorId],
                        _currentFloor,
                        _floorPassengersData[_currentFloor].passengers,
                        MAX_PASSENGERS_PER_ELEVATOR
                    );

                    if (_passengersToGetIn) {

                        elevatorsData[gameRoomId][_currentElevatorId].passengers.push(_floorPassengersData[_currentFloor].passengers[_targetIncomingPassengerIndex]);
                        _floorPassengersData[_currentFloor].passengers[_targetIncomingPassengerIndex] = _floorPassengersData[_currentFloor].passengers[_floorPassengersData[_currentFloor].passengers.length - 1];
                        _floorPassengersData[_currentFloor].passengers.pop();

                        //TODO: Recalculate floor light

                    } else {

                        (bool _passengersToGoOut, uint8 _targetOutgoingPassengerIndex) = findNextPassangerToGetOut(_elevatorsData[_currentElevatorId]);

                        if (_passengersToGoOut) {

                            //TODO: Pop from elevator
                            
                            //TODO: WAdd to the score, check for win and update _topScoreElevators

                        } else {
                            //TODO: Continue to Closing or to Idle depending on queue
                        }
                    }
                }

                //////////////////////////////////////////////////////
                //         FINISH GAME AND NEXT TURN LOGIC          //
                //////////////////////////////////////////////////////

                //After reaching SOFT_TURN_DEADLINE, the first player to reach first place (with score > second place) wins
                if (!_won && _room.turn > SOFT_TURN_DEADLINE) {
                    _won = (_topScoreElevators.length == 1);
                }

                if (_won) {
                    _room.status = GameRoomStatus.FinishedWithWinner;
                    break;
                } else {

                    // Indices are shuffled every time all 3 (or more) players have finished a turn
                    if (_room.turn % _room.numberOfPlayers == 0) {
                        uint8[] memory _newIndices = shuffledIndices(_random, _room.numberOfPlayers);
                        _room.indices = _newIndices;
                        //console.log(" - Changed indices to: ", _room.indices[0], _room.indices[1], _room.indices[2]);
                    }

                    _room.turn++;
                    //if HARD_TURN_DEADLINE is reached, the game is probably on an infinite loop. Finish it without a winner
                    if (_room.turn > HARD_TURN_DEADLINE) {
                        _room.status = GameRoomStatus.FinishedWithoutWinner;
                        break;
                    }
                }
            }

            //After finishing the loop, save memory variables to storage
            gameRooms[gameRoomId].status = _room.status;
            gameRooms[gameRoomId].indices = _room.indices;
            gameRooms[gameRoomId].turn = _room.turn;
            gameRooms[gameRoomId].waitingPassengers = _room.waitingPassengers;
            gameRooms[gameRoomId].randomSeed = _room.randomSeed;
            gameRooms[gameRoomId].actionsSold = _room.actionsSold;
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                            ACTION PRICING
    //////////////////////////////////////////////////////////////*/

    function getActionCost(uint256 gameRoomId, ActionType action, uint256 amount) public view returns (uint256 sum) {
        GameRoom memory _room = gameRooms[gameRoomId];
        
        unchecked {
            for (uint256 i = 0; i < amount; i++) {
                sum += computeActionPrice(
                    actionSettings[action].targetPrice,
                    actionSettings[action].perTurnDecrease,
                    _room.turn,
                    _room.actionsSold[uint256(action)] + i,
                    actionSettings[action].sellPerTurn
                );
            }
        }
    }

    function computeActionPrice(
        int256 targetPrice,
        int256 perTurnPriceDecrease,
        uint256 turnsSinceStart,
        uint256 sold,
        int256 sellPerTurnWad
    ) internal pure returns (uint256) {
        unchecked {
            return uint256(
                wadMul(targetPrice, wadExp(unsafeWadMul(wadLn(1e18 - perTurnPriceDecrease),
                toWadUnsafe(turnsSinceStart - 1) - (wadDiv(toWadUnsafe(sold + 1), sellPerTurnWad))
            )))) / 1e18;
        }
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function shuffledIndices(uint64 random, uint8 totalPlayers) private pure returns (uint8[] memory) {
        require (totalPlayers > 0);
        unchecked {
            uint8[] memory _result = new uint8[](totalPlayers);
            uint8 _nextIndex = uint8(random % totalPlayers);
            for (uint256 i=0; i<totalPlayers; i++) {
                _result[i] = _nextIndex;
                _nextIndex += 1;
                if (_nextIndex >= totalPlayers) { _nextIndex = 0; }
            }
            return _result;
        }
    }

    function calculateFloorButtons(uint16 turn, FloorPassengerData[] memory floorPassengerData) private pure returns (FloorButtons[] memory) {
        unchecked {
            FloorButtons[] memory _floorButtons = new FloorButtons[](floorPassengerData.length);
            if (turn > 1) {
                for (uint256 f=0; f<floorPassengerData.length; f++) {
                    for (uint256 p=0; p<floorPassengerData[f].passengers.length; p++) {
                        if (_floorButtons[f] == FloorButtons.Off) {
                            _floorButtons[f] = (floorPassengerData[f].passengers[p] > f)?FloorButtons.Up:FloorButtons.Down;
                        } else if ((floorPassengerData[f].passengers[p] > f && _floorButtons[f] == FloorButtons.Down) ||
                            (floorPassengerData[f].passengers[p] < f && _floorButtons[f] == FloorButtons.Up)) {
                            _floorButtons[f] = FloorButtons.Both;
                            break;
            }}}}
            return _floorButtons;
        }
    }

    function calculateTopScoreElevators(ElevatorData[] memory elevData) private pure returns (uint8[] memory) {
        require(elevData.length > 0);

        unchecked {
            uint8 _maxScore = elevData[0].score;
            uint8 _maxScoreCount = 1;
            for (uint256 i=1; i<elevData.length; i++) {
                if (elevData[i].score > _maxScore) {
                    _maxScore = elevData[i].score;
                    _maxScoreCount = 1;
                } else if (elevData[i].score == _maxScore) {
                    _maxScoreCount++;
                }
            }

            uint8[] memory _topScores = new uint8[](_maxScoreCount);
            uint8 _idx = 0;
            for (uint8 i=0; i<elevData.length; i++) {
                if (elevData[i].score == _maxScore) {
                    _topScores[_idx] = i;
                    _idx++;
                }
            }

            return _topScores;
        }
    }

    function newPassenger(uint64 random, uint8 totalFloors, uint8 waitingPassagers, uint8 maxWaitingPassengers, uint8 spawnRate) private pure returns (bool created, uint8 startFloor, uint8 targetFloor) {
        require(spawnRate > 0);
        if (waitingPassagers >= maxWaitingPassengers) { return (false, 0, 0); }
        if (random % spawnRate == 0) {
            random >>= 8;
            uint8 _startFloor = uint8(random % totalFloors);
            uint8 _targetFloor = _startFloor;
            while (_startFloor == _targetFloor) {
                random >>= 8;
                _targetFloor = uint8(random % totalFloors);
                if (random == 0) { return (false, 0, 0); }
            }
            return (true, _startFloor, _targetFloor);
        }
        return (false, 0, 0);
    }

    function buildElevatorsInfo(ElevatorData[] memory elevData, uint8 currentElevator) private pure returns (ElevatorInfo[] memory) {
        unchecked {
            ElevatorInfo[] memory _elevatorsInfo = new ElevatorInfo[](elevData.length);
            for (uint256 i=0; i<elevData.length; i++) {
                if (i == currentElevator) {
                    //For the current playing elevator, we provide the full elevator data
                    _elevatorsInfo[i] = ElevatorInfo(
                        elevData[i].status,
                        elevData[i].light,
                        elevData[i].score,
                        elevData[i].targetFloor,
                        elevData[i].floorQueue,
                        elevData[i].passengers,
                        elevData[i].balance,
                        elevData[i].speed,
                        elevData[i].y,
                        elevData[i].data
                    );
                } else {
                    //For other elevators, we skip the status, the target floor, the floor queue,
                    //the passengers list and the data.
                    _elevatorsInfo[i] = ElevatorInfo(
                        ElevatorStatus.Undefined,
                        elevData[i].light,
                        elevData[i].score,
                        0,
                        new uint8[](0),
                        new uint8[](0),
                        elevData[i].balance,
                        elevData[i].speed,
                        elevData[i].y,
                        bytes32(0)
                    );
                }
            }
            return _elevatorsInfo;
        }
    }

    function shiftArray(uint8[] storage arr) private {
        for (uint256 i=1; i<arr.length; i++) {
            arr[i-1] = arr[i];
        }
        arr.pop();
    }

    function currentFloor(ElevatorData memory elevator) private pure returns (uint8) {
        require (elevator.y % 100 == 0);
        return uint8(elevator.y / 100);
    }

    function findNextPassangerForElevator(ElevatorData memory elevator, uint8 currFloor, uint8[] memory floorPassengers, uint8 maxPassengersPerElevator) private pure returns (bool, uint8) {
        if (elevator.passengers.length == maxPassengersPerElevator) {
            return (false, 0);
        }

        bool _foundPassenger;
        uint8 _passangerIndex;

        for (uint8 i=0; i<floorPassengers.length; i++) {
            if (elevator.light == ElevatorLight.Off) {
                _foundPassenger = true;
                _passangerIndex = i;
                break;
            } else {
                if (floorPassengers[i] > currFloor && elevator.light == ElevatorLight.Up) {
                    _foundPassenger = true;
                    _passangerIndex = i;
                    break;
                } else if (floorPassengers[i] < currFloor && elevator.light == ElevatorLight.Down) {
                    _foundPassenger = true;
                    _passangerIndex = i;
                    break;  
                }
            }
        }

        return (_foundPassenger, _passangerIndex);
    }

    function findNextPassangerToGetOut(ElevatorData memory elevator) private pure returns (bool, uint8) {
        if (elevator.passengers.length == 0) {
            return (false, 0);
        }

        bool _foundPassenger;
        uint8 _passangerIndex;

        for (uint8 i=0; i<elevator.passengers.length; i++) {
            if (elevator.passengers[i] == elevator.targetFloor) {
                _foundPassenger = true;
                _passangerIndex = i;
                break;
            }
        }

        return (_foundPassenger, _passangerIndex);
    }
}