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
    event GameRoomUpdated(uint256 indexed id);
    event GameRoomFinished(uint256 indexed id);

    /*//////////////////////////////////////////////////////////////
                        MISCELLANEOUS CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 public constant VERSION = 1;

    uint8 private constant MAX_ROOMS_PER_PLAYER = 10;

    uint8 private constant MAX_PLAYERS = 4;
    uint8 private constant MIN_FLOORS = 4;
    uint8 private constant MAX_FLOORS = 8;
    uint8 private constant MIN_SCORE_TO_WIN = 1;
    uint8 private constant MAX_SCORE_TO_WIN = 100;    
    
    uint16 private constant SOFT_TURN_DEADLINE = 1000;
    uint16 private constant HARD_TURN_DEADLINE = 1200;

    uint8 private constant NEW_PASSENGERS_SPAWN_RATE = 5;   //MORE IS LESS
    uint8 private constant MAX_PASSENGERS_PER_ELEVATOR = 4;
    uint8 private constant MAX_WAITING_PASSENGERS = 60;
    
    uint8 private constant ELEVATOR_MIN_SPEED = 10;
    uint8 private constant ELEVATOR_MAX_SPEED = 100;
    uint8 private constant ELEVATOR_MAX_FLOOR_QUEUE = 8;
    uint32 private constant ELEVATOR_INITIAL_BALANCE = 15000;

    uint32 private constant MAX_GAS_FOR_ON_CHAIN_TURN = 4_000_000;
    
    /*//////////////////////////////////////////////////////////////
                      ACTIONS & PRICING CONSTANTS
    //////////////////////////////////////////////////////////////*/

    enum ActionType { SPEED_UP, SLOW_DOWN }

    struct ActionSettings {
        int256 targetPrice;
        int256 perTurnDecrease;
        int256 sellPerTurn;
    }

    mapping (ActionType => ActionSettings) internal actionSettings;

    constructor() {
        actionSettings[ActionType.SPEED_UP] = ActionSettings(10e18, 0.33e18, 2e18);
        actionSettings[ActionType.SLOW_DOWN] = ActionSettings(10e18, 0.33e18, 0.2e18);
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
        IElevator elevator;
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
        uint256 amount;             // How much to purchase
        uint8 target;               // Target for the action (for SLOW_DOWN)
        bytes32 data;               // Arbitrary data to be updated;
    }

    function initialElevatorData(IElevator elevator) private pure returns (ElevatorData memory) {
        uint8[] memory _empty;
        
        return ElevatorData(
            elevator,
            ElevatorStatus.Idle,
            ElevatorLight.Off,
            0,
            0,
            _empty,
            _empty,
            ELEVATOR_INITIAL_BALANCE,
            ELEVATOR_MIN_SPEED,
            0,
            bytes32(0)
        );
    }

    /*//////////////////////////////////////////////////////////////
                    GAME ROOMS STRUCTS AND STORAGE
    //////////////////////////////////////////////////////////////*/

    enum GameRoomStatus { Uninitialized, Created, Ready, FinishedWithWinner, FinishedWithoutWinner, Cancelled }

    struct GameRoom {
        GameRoomStatus status;
        uint8 numberOfPlayers;
        uint8 floors;
        uint8 scoreToWin;
        address[] players;
        uint8[] indices;
        address[] offchainPublicKeys;
        uint16 turn;
        uint8 waitingPassengers;
        uint64[2] randomSeed;
        uint256[2] actionsSold;
    }

    uint256 public totalGameRooms;
    mapping(uint256 => GameRoom) private gameRooms;
    mapping(uint256 => ElevatorData[]) private elevatorsData;
    mapping(uint256 => FloorPassengerData[]) private floorPassengersData;

    mapping(address => uint8) private playerActiveGameRooms;
    mapping(address => uint256[]) private playerGameRoomIds;

    error NotJoined();
    error ElevatorCall();
    error WrongSettings();
    error TooManyGameRooms();
    error WrongElevatorInterface();
    error GameRoomUnavailable(uint256 id);
    error GameRoomPlayerAlreadyJoined(uint256 id, address player);
    error GameRoomElevatorAlreadyJoined(uint256 id, address elevator);
    error GameRoomPlayOnFinished(uint256 id);

    /*//////////////////////////////////////////////////////////////`
                        GAME ROOM MANAGMENT
    //////////////////////////////////////////////////////////////*/

    function getGameState(uint256 id) external view returns (GameRoom memory, ElevatorData[] memory, FloorPassengerData[] memory) {
        if (gameRooms[id].status == GameRoomStatus.Uninitialized) { revert GameRoomUnavailable(id); }

        ElevatorData[] memory _elevatorsData = elevatorsData[id];
        preventElevatorCall(_elevatorsData, msg.sender);

        return (gameRooms[id], _elevatorsData, floorPassengersData[id]);
    }

    function getPlayerActiveRooms() external view returns (uint256[] memory, GameRoom[] memory) {
        GameRoom[] memory _rooms = new GameRoom[](playerActiveGameRooms[msg.sender]);
        for (uint256 i=0; i<playerGameRoomIds[msg.sender].length; i++) {
            _rooms[i] = gameRooms[playerGameRoomIds[msg.sender][i]];
        }
        return (playerGameRoomIds[msg.sender], _rooms);
    }

    function createGameRoom(uint8 numberOfPlayers, uint8 floors, uint8 scoreToWin, IElevator elevator, address offchainPublicKey) external {
        if (numberOfPlayers == 0 || numberOfPlayers > MAX_PLAYERS) { revert WrongSettings(); }
        if (floors < MIN_FLOORS || floors > MAX_FLOORS) { revert WrongSettings(); }
        if (scoreToWin < MIN_SCORE_TO_WIN || scoreToWin > MAX_SCORE_TO_WIN) { revert WrongSettings(); }
        if (!elevator.supportsInterface(type(IElevator).interfaceId)) { revert WrongElevatorInterface(); }

        address[] memory _players = new address[](1);
        uint8[] memory _indices = new uint8[](1);
        address[] memory _offchainPublicKeys = new address[](1);
        uint256[2] memory _actionsSold;

        _players[0] = msg.sender;
        _indices[0] = 0;
        _offchainPublicKeys[0] = offchainPublicKey;

        elevatorsData[totalGameRooms].push(initialElevatorData(elevator));
        
        if (numberOfPlayers == 1) {
            uint8[] memory _passengers;
            for (uint256 i = 0; i < floors; i++) {
                floorPassengersData[totalGameRooms].push(FloorPassengerData(_passengers));
            }

            GameRoom memory _room = GameRoom(
                GameRoomStatus.Ready,
                numberOfPlayers,
                floors,
                scoreToWin,
                _players,
                _indices,
                _offchainPublicKeys,
                1, 0,
                DRNG.seed(uint64(uint256(blockhash(block.number - 1)))),
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
                _players,
                _indices,
                _offchainPublicKeys,
                1, 0,
                _emptySeed,
                _actionsSold
            );   
            gameRooms[totalGameRooms] = _room;
        }

        addToActiveGameRooms(totalGameRooms);

        emit GameRoomCreated(totalGameRooms, msg.sender);
        totalGameRooms++;
    }

    function exitGameRoom(uint256 id) external {
        GameRoom storage _room = gameRooms[id];

        if (_room.status == GameRoomStatus.Uninitialized) { revert GameRoomUnavailable(id); }
        
        if (_room.status == GameRoomStatus.Created) {
            if (_room.players[0] == msg.sender) { 
                _room.status = GameRoomStatus.Cancelled;
                emit GameRoomCancelled(id);
                for (uint8 i=0; i<_room.players.length; i++) {
                    removeFromActiveGameRooms(id, _room.players[i]);
                }
            } else {
                uint8 _playerIndex;
                for (uint8 i=1; i<_room.players.length; i++) {
                    if (_room.players[i] == msg.sender) {
                        _playerIndex = i;
                    }
                }
                if (_playerIndex == 0) { revert NotJoined(); }
                removeFromUnorderedAddressArray(_room.players, _playerIndex);
                removeFromUnorderedAddressArray(_room.offchainPublicKeys, _playerIndex);
                _room.indices.pop();
                emit GameRoomPlayerLeft(id, msg.sender);
                removeFromActiveGameRooms(id, msg.sender);
            }
        } else {
            revert GameRoomUnavailable(id);
        }
    }

    function joinGameRoom(uint256 id, IElevator elevator, address offchainPublicKey) external {
        GameRoom storage _room = gameRooms[id];
        if (_room.status != GameRoomStatus.Created) { revert GameRoomUnavailable(id); }
        if (!elevator.supportsInterface(type(IElevator).interfaceId)) { revert WrongElevatorInterface(); }

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

        addToActiveGameRooms(id);
    }

    /*//////////////////////////////////////////////////////////////
                        OFF-CHAIN STATE LOADING
    //////////////////////////////////////////////////////////////*/

    function hashCheckpoint(uint256 id, uint16 turn, uint8 status, uint8[] memory indices, uint64[2] memory randomSeed, uint256[2] memory actionsSold, uint8 waitingPassengers, ElevatorData[] memory elevData, FloorPassengerData[] memory floorData) public pure returns (bytes32) {
        return keccak256(abi.encode(id, turn, status, indices, randomSeed, actionsSold, waitingPassengers, elevData, floorData));
    }

    function loadCheckpoint(uint256 id, uint16 turn, uint8 status, uint8[] memory indices, uint64[2] memory randomSeed, uint256[2] memory actionsSold, uint8 waitingPassengers, ElevatorData[] memory elevData, FloorPassengerData[] memory floorData, bytes[] memory signature) external {
        GameRoom memory _room = gameRooms[id];
        if (_room.status != GameRoomStatus.Ready) { revert GameRoomUnavailable(id); }

        require(_room.offchainPublicKeys.length == signature.length);
        require(_room.turn < turn);

        _room.turn = turn;
        _room.status = GameRoomStatus(status);
        _room.indices = indices;
        _room.waitingPassengers = waitingPassengers;
        _room.randomSeed = randomSeed;
        _room.actionsSold = actionsSold;

        gameRooms[id] = _room;
        elevatorsData[id] = elevData;
        floorPassengersData[id] = floorData;

        if (_room.status == GameRoomStatus.Ready) {
            emit GameRoomUpdated(id);
        } else {
            emit GameRoomFinished(id);
            for (uint8 i=0; i<_room.players.length; i++) {
                removeFromActiveGameRooms(id, _room.players[i]);
            }
        }

        bytes32 hashedCheckpoint = hashCheckpoint(id, turn, status, indices, randomSeed, actionsSold, waitingPassengers, elevData, floorData);
        bytes32 hashedCheckpointMessage = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hashedCheckpoint));

        for (uint256 i=0; i<_room.offchainPublicKeys.length; i++) {
            address _recovered = recoverSigner(hashedCheckpointMessage, signature[i]);
            require (_recovered == _room.offchainPublicKeys[i]);
        }
    }

    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s,uint8 v) {
        require(sig.length == 65, "invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    /*//////////////////////////////////////////////////////////////
                              CORE GAME
    //////////////////////////////////////////////////////////////*/

    function play(uint256 gameRoomId, uint16 turnsToPlay) external {
        require(turnsToPlay > 0);

        GameRoom memory _room = gameRooms[gameRoomId];
        ElevatorData[] memory _elevatorsData = elevatorsData[gameRoomId];
    
        if (_room.status != GameRoomStatus.Ready) { revert GameRoomPlayOnFinished(gameRoomId); }

        FloorButtons[] memory _floorButtons = calculateFloorButtons(_room.turn, floorPassengersData[gameRoomId]);
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
                
                // If a passenger needs to be added, push it into storage and update floor lights
                if (_createNewPassenger) {
                    floorPassengersData[gameRoomId][_startFloor].passengers.push(_targetFloor);
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
                    _currentElevatorId,
                    _room.numberOfPlayers,
                    _room.floors,
                    _room.scoreToWin,
                    _topScoreElevators,
                    _room.turn,
                    _room.actionsSold,
                    _elevatorInfo,
                    _floorButtons
                ) {
                    // If the call was successfull, load the update from storage
                    ElevatorUpdate memory _update = _elevatorsData[_currentElevatorId].elevator.getLastUpdate();

                    // Try to purchase actions if required in the update
                    if (_update.amount > 0) {
                        uint256 _cost = getActionCost(_room.turn, _room.actionsSold[uint256(_update.action)], _update.action, _update.amount);
                        if (_elevatorsData[_currentElevatorId].balance >= _cost) {

                            //Only purchase and execute the actions if within speed limits: (0 <= speed <= ELEVATOR_MAX_SPEED)
                            if ((_update.action == ActionType.SPEED_UP) && (_elevatorsData[_currentElevatorId].speed < ELEVATOR_MAX_SPEED)) {

                                _elevatorsData[_currentElevatorId].balance -= uint32(_cost);
                                _room.actionsSold[uint256(ActionType.SPEED_UP)] += _update.amount;

                                if (_elevatorsData[_currentElevatorId].speed + _update.amount <= ELEVATOR_MAX_SPEED) {
                                    _elevatorsData[_currentElevatorId].speed += uint8(_update.amount);
                                } else {
                                    _elevatorsData[_currentElevatorId].speed = ELEVATOR_MAX_SPEED;
                                }
                            } else if ((_update.action == ActionType.SLOW_DOWN) && (_elevatorsData[_update.target].speed > ELEVATOR_MIN_SPEED)) {

                                _elevatorsData[_currentElevatorId].balance -= uint32(_cost);
                                _room.actionsSold[uint256(ActionType.SLOW_DOWN)] += _update.amount;

                                _elevatorsData[_update.target].speed = uint8(uint256(_elevatorsData[_update.target].speed) / (2 ** _update.amount));

                                if (_elevatorsData[_update.target].speed < ELEVATOR_MIN_SPEED) {
                                    _elevatorsData[_update.target].speed = ELEVATOR_MIN_SPEED;
                                }
                            }
                        }
                    }

                    //Light and data are always updated
                    _elevatorsData[_currentElevatorId].light = _update.light;
                    _elevatorsData[_currentElevatorId].data = _update.data;

                    //Floor Queue is managed in storage. It can be fully replaced or added to the current queue.
                    if (_update.replaceFloorQueue) {
                        elevatorsData[gameRoomId][_currentElevatorId].floorQueue = _update.floorQueue;
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

                //'Idle' and 'Waiting' internally execute almost the same code, but can have different meanings
                //  'Idle' is where the elevator starts: doors open, waiting for a commnad. Passengers can get in, but status
                //  won't change to 'Closing' unitil a target flor is given with the floor queue.
                //  'Waiting' is the immediate status set after an elevator reaches a target floor and opens it's doors.
                //  In this status, doors are open and passengers first get out, then get in. After all passengers have moved,
                //  it should switch to 'Idle' if there's no next floor in queue or to 'Closing' if there is.

                if (_elevatorsData[_currentElevatorId].status == ElevatorStatus.Idle ||
                    _elevatorsData[_currentElevatorId].status == ElevatorStatus.Waiting) {                   

                    uint8 _currentFloor = currentFloor(_elevatorsData[_currentElevatorId]);

                    //First check if there are passengers to get out of the elevator
                    (bool _passengersToGoOut, uint8 _targetOutgoingPassengerIndex) = findNextPassangerToGetOut(_elevatorsData[_currentElevatorId]);

                    if (_passengersToGoOut) {
                        //If a passanger got out:
                        // 1) Pop it from the elevator (storage) and update memory
                        removeFromUnorderedArray(elevatorsData[gameRoomId][_currentElevatorId].passengers, _targetOutgoingPassengerIndex);
                        _elevatorsData[_currentElevatorId].passengers = elevatorsData[gameRoomId][_currentElevatorId].passengers;

                        // 2) Add 1 to the elevator's score and check if score makes current elevator the winner
                        _elevatorsData[_currentElevatorId].score++;
                        if (_elevatorsData[_currentElevatorId].score == _room.scoreToWin) {
                            _won = true;
                        }
                        // 3) Update _topScoreElevators
                        _topScoreElevators = calculateTopScoreElevators(_elevatorsData);
                    } else {

                        //If all passengers who needed to get out got out,
                        //check if passangers are available to get into the elevator
                        (bool _passengersToGetIn, uint8 _targetPassengerIndex) = findNextPassangerForElevator(
                            _elevatorsData[_currentElevatorId],
                            _currentFloor,
                            floorPassengersData[gameRoomId][_currentFloor].passengers,
                            MAX_PASSENGERS_PER_ELEVATOR
                        );

                        if (_passengersToGetIn) {
                            //If there's a passanger available to get in:
                            // 1) Push it into the elevator (storage) and Pop it from the floor (storage)
                            elevatorsData[gameRoomId][_currentElevatorId].passengers.push(
                                floorPassengersData[gameRoomId][_currentFloor].passengers[_targetPassengerIndex]);
                            removeFromUnorderedArray(floorPassengersData[gameRoomId][_currentFloor].passengers, _targetPassengerIndex);

                            // 2) Update passengers in memory
                            _elevatorsData[_currentElevatorId].passengers = elevatorsData[gameRoomId][_currentElevatorId].passengers;

                            // 3) Update WaitingPassengers
                            _room.waitingPassengers--;

                            // 4) Recalculate Floor Buttons
                            _floorButtons = calculateFloorButtons(_room.turn, floorPassengersData[gameRoomId]);
                        } else {
                            //If there's no passenger to get in, check if there's a floor in the queue (!= from current floor)

                            bool _hasChangedTargetFloor;

                            for (uint8 i=0; i<_elevatorsData[_currentElevatorId].floorQueue.length; i++) {
                                // 1) Set the elevator's target floor
                                _elevatorsData[_currentElevatorId].targetFloor = _elevatorsData[_currentElevatorId].floorQueue[0];

                                // 2) Shift the floor queue (in storage)
                                shiftArray(elevatorsData[gameRoomId][_currentElevatorId].floorQueue);

                                // 3) Make sure target floor is different from current floor before breaking the loop
                                if (_elevatorsData[_currentElevatorId].targetFloor != _currentFloor) {
                                    _hasChangedTargetFloor = true;
                                    break;
                                }
                            }

                            // 4) Now update the memory queue:
                            _elevatorsData[_currentElevatorId].floorQueue = elevatorsData[gameRoomId][_currentElevatorId].floorQueue;
                            
                            // 5) If a new valid target floor was set change status to 'Closing', if not, to 'Idle'
                            _elevatorsData[_currentElevatorId].status = _hasChangedTargetFloor?ElevatorStatus.Closing:ElevatorStatus.Idle;
                        }
                    }
                } else if (_elevatorsData[_currentElevatorId].status == ElevatorStatus.GoingUp) {
                    //Just increase the elevator's position until it reaches the targetFloor
                    //When reached, set status to 'Opening'

                    _elevatorsData[_currentElevatorId].y += _elevatorsData[_currentElevatorId].speed;
                    if (_elevatorsData[_currentElevatorId].y >= (uint16(_elevatorsData[_currentElevatorId].targetFloor) * 100)) {
                        _elevatorsData[_currentElevatorId].y = uint16(_elevatorsData[_currentElevatorId].targetFloor) * 100;
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
                        //This should never happen
                        _elevatorsData[_currentElevatorId].status = ElevatorStatus.Opening;
                    }
                }

                //////////////////////////////////////////////////////
                //         FINISH GAME AND NEXT TURN LOGIC          //
                //////////////////////////////////////////////////////

                //After reaching SOFT_TURN_DEADLINE, the first player to reach first place (with score > second place) wins
                //This is only valid if number of players > 1
                if (!_won && _room.turn > SOFT_TURN_DEADLINE && _room.numberOfPlayers > 1) {
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
                    }

                    _room.turn++;
                    //if HARD_TURN_DEADLINE is reached, the game is probably on an infinite loop. Finish it without a winner
                    if (_room.turn > HARD_TURN_DEADLINE) {
                        //("HARD DEADLINE!");
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

            for (uint8 i=0; i<_elevatorsData.length; i++) {
                elevatorsData[gameRoomId][i].status = _elevatorsData[i].status;
                elevatorsData[gameRoomId][i].light = _elevatorsData[i].light;
                elevatorsData[gameRoomId][i].score = _elevatorsData[i].score;
                elevatorsData[gameRoomId][i].targetFloor = _elevatorsData[i].targetFloor;
                elevatorsData[gameRoomId][i].balance = _elevatorsData[i].balance;
                elevatorsData[gameRoomId][i].speed = _elevatorsData[i].speed;
                elevatorsData[gameRoomId][i].y = _elevatorsData[i].y;
                elevatorsData[gameRoomId][i].data = _elevatorsData[i].data;
            }
        }

        if (_room.status == GameRoomStatus.Ready) {
            emit GameRoomUpdated(gameRoomId);
        } else {
            emit GameRoomFinished(gameRoomId);
            for (uint8 i=0; i<_room.players.length; i++) {
                removeFromActiveGameRooms(gameRoomId, _room.players[i]);
            }
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                            ACTION PRICING
    //////////////////////////////////////////////////////////////*/

    function getActionCost(uint16 turn, uint256 actionsSold, ActionType action, uint256 amount) public view returns (uint256 sum) {
        unchecked {
            for (uint256 i = 0; i < amount; i++) {
                uint256 val = computeActionPrice(
                    actionSettings[action].targetPrice,
                    actionSettings[action].perTurnDecrease,
                   uint256(turn),
                    actionsSold + i,
                    actionSettings[action].sellPerTurn
                );
                sum += val;
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

    function preventElevatorCall(ElevatorData[] memory elevators, address sender) private pure {
        for (uint256 i=0; i<elevators.length; i++) {
            if (address(elevators[i].elevator) == sender) {
                revert ElevatorCall();
            }
        }
    }

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

    function newPassenger(uint64 random, uint8 totalFloors, uint8 waitingPassengers, uint8 maxWaitingPassengers, uint8 spawnRate) private pure returns (bool created, uint8 startFloor, uint8 targetFloor) {
        require(spawnRate > 0);
        if (waitingPassengers >= maxWaitingPassengers) { return (false, 0, 0); }
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

    function removeFromUnorderedAddressArray(address[] storage arr, uint256 idx) private {
        arr[idx] = arr[arr.length - 1];
        arr.pop();
    }

    function removeFromUnorderedArray(uint8[] storage arr, uint256 idx) private {
        arr[idx] = arr[arr.length - 1];
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

    function addToActiveGameRooms(uint256 id) private {
        if (playerActiveGameRooms[msg.sender] >= MAX_ROOMS_PER_PLAYER) {
            revert TooManyGameRooms();
        }

        if (playerActiveGameRooms[msg.sender] == 0) {
            uint256[] memory _playerGameRoomId = new uint256[](1);
            _playerGameRoomId[0] = id;
            playerGameRoomIds[msg.sender] = _playerGameRoomId;
        } else {
            playerGameRoomIds[msg.sender].push(id);
        }
        playerActiveGameRooms[msg.sender]++;
    }

    function removeFromActiveGameRooms(uint256 id, address player) private {
        for (uint256 i=0; i<playerGameRoomIds[player].length; i++) {
            if (playerGameRoomIds[player][i] == id) {
                playerGameRoomIds[player][i] = playerGameRoomIds[player][playerGameRoomIds[player].length - 1];
                playerGameRoomIds[player].pop();
                break;
            }
        }
        playerActiveGameRooms[player]--;
    }
}