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

import "./Elevator.sol";
import "hardhat/console.sol";

contract SolidityElevatorCTF {

    /*//////////////////////////////////////////////////////////////
                              EVENTS
    //////////////////////////////////////////////////////////////*/

    event GameRoomCreated(uint256 indexed id, address player);
    event GameRoomJoined(uint256 indexed id, address player);
    event GameRoomReady(uint256 indexed id);
    event GameRoomFinished(uint256 indexed id, address winner);

    /*//////////////////////////////////////////////////////////////
                      MISCELLANEOUS CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint8 private constant PLAYERS = 3;
    uint8 private constant FLOORS = 8;
    uint8 private constant SCORE_TO_WIN = 100;
    uint16 private constant SOFT_TURN_DEADLINE = 1000;
    uint16 private constant HARD_TURN_DEADLINE = 1500;

    uint8 private constant NEW_PASSENGERS_SPAWN_RATE = 5;   //MORE IS LESS
    uint8 private constant MAX_PASSENGERS_PER_ELEVATOR = 4;
    uint8 private constant MAX_WAITING_PASSENGERS = 100;
    
    uint8 private constant ELEVATOR_INITIAL_SPEED = 10;
    uint8 private constant ELEVATOR_MAX_SPEED = 100;
    uint16 private constant ELEVATOR_INITIAL_POSITION = 0;
    uint32 private constant ELEVATOR_INITIAL_BALANCE = 15000;

    uint32 private constant MAX_GAS_FOR_ON_CHAIN_TURN = 2_000_000;
    
    /*//////////////////////////////////////////////////////////////
                      ACTIONS & PRICING CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint8 private constant ACTIONS_TYPES = 2;

    enum ActionType { SPEED_UP, SLOW_DOWN }

    struct ActionPriceSettings {
        int256 targetPrice;
        int256 perTurnDecrease;
        int256 sellPerTurn;
    }

    mapping (ActionType => ActionPriceSettings) internal actionPriceSettings;

    constructor() {
        actionPriceSettings[ActionType.SPEED_UP] = ActionPriceSettings(10e18, 0.33e18, 2e18);
        actionPriceSettings[ActionType.SLOW_DOWN] = ActionPriceSettings(200e18, 0.33e18, 0.2e18);
    }
    
    /*//////////////////////////////////////////////////////////////
                  ELEVATOR GAME STRUCTS AND STORAGE
    //////////////////////////////////////////////////////////////*/
    
    enum ElevatorStatus { Idle, GoingUp, GoingDown, Opening, Closing, Undefined }
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

    enum GameRoomStatus { Uninitialized, Created, Ready, FinishedWithWinner, FinishedWithoutWinner, Cancelled }

    struct GameRoom {
        GameRoomStatus status;
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

    error GameRoomUnavailable(uint256 id);
    error GameRoomPlayerAlreadyJoined(uint256 id, address player);
    error GameRoomElevatorAlreadyJoined(uint256 id, address elevator);
    error GameRoomPlayOnFinished(uint256 id);

    /*//////////////////////////////////////////////////////////////`
                        GAME ROOM MANAGMENT
    //////////////////////////////////////////////////////////////*/

    //TODO: Add functions to exit room before start
    //TODO: Add function to close room (only creator) before start

    function getGameRoom(uint256 id) public view returns (GameRoom memory) {
        GameRoom memory _room = gameRooms[id];
        if (_room.status == GameRoomStatus.Uninitialized) { revert GameRoomUnavailable(id); }
        return _room;
    }
    
    function createGameRoom(Elevator elevator, address offchainPublicKey) external {

        address[] memory _players = new address[](1);
        uint8[] memory _indices = new uint8[](1);
        address[] memory _offchainPublicKeys = new address[](1);
        uint64[2] memory _randomSeed;

        _players[0] = msg.sender;
        _indices[0] = 0;
        _offchainPublicKeys[0] = offchainPublicKey;

        //TODO: Check if elevator is indeed an elevator contract
        elevatorsData[totalGameRooms].push(initialElevatorData(elevator));
        
        uint256[2] memory _startActionsSold;
        GameRoom memory _room = GameRoom(
            GameRoomStatus.Created,
            _players,
            _indices,
            _offchainPublicKeys,
            1, 0,
            _randomSeed,
            _startActionsSold
        );   
        gameRooms[totalGameRooms] = _room;

        emit GameRoomCreated(totalGameRooms, msg.sender);
        totalGameRooms++;
    }

    function joinGameRoom(uint256 id, Elevator elevator, address offchainPublicKey) external {

        GameRoom storage _room = gameRooms[id];
        if (_room.status != GameRoomStatus.Created) { revert GameRoomUnavailable(id); }
        
        ElevatorData[] storage _elevatorsData = elevatorsData[id];
        
        uint256 _newPlayerIndex = _room.players.length;

        for (uint256 i=0; i<_newPlayerIndex; i++) {
            if (_room.players[i] == msg.sender) { revert GameRoomPlayerAlreadyJoined(id, msg.sender); }
            if (_elevatorsData[i].elevator == elevator) { revert GameRoomElevatorAlreadyJoined(id, address(elevator)); }
        }

        _room.players.push(msg.sender);
        _room.indices.push(uint8(_newPlayerIndex));
        _room.offchainPublicKeys.push(offchainPublicKey);

        //TODO: Check if elevator is indeed a valid elevator contract
        //TODO: Any way to check for unique bytecode?
        elevatorsData[id].push(initialElevatorData(elevator));
        
        emit GameRoomJoined(id, msg.sender);

        if (_newPlayerIndex == (PLAYERS - 1)) {

            uint8[] memory _passengers;
            for (uint256 i = 0; i < FLOORS; i++) {
                floorPassengersData[id].push(FloorPassengerData(_passengers));
            }

            //TODO: Replace with better Entropy Generation or VRF
            uint64[2] memory _firstSeed = DRNG.seed(uint64(uint256(blockhash(block.number - 1))));
            (uint64 _firstRandom, uint64[2] memory _nextSeed) = DRNG.next(_firstSeed);

            uint8[] memory _newIndices = shuffledIndices(_firstRandom, PLAYERS);
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
                uint8 _currentElevatorId = _room.indices[(_room.turn - 1) % PLAYERS];

                // Then, calculate a new random number for this turn
                (uint64 _random, uint64[2] memory _nextSeed) = DRNG.next(_room.randomSeed);
                _room.randomSeed = _nextSeed;

                // Now use randomness to see if a new waiting passenger needs to be created
                (bool _createNewPassenger, uint8 _startFloor, uint8 _targetFloor) = newPassenger(
                    _random,
                    FLOORS,
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

                    //TODO: Process purchases 

                } catch {}

                /*
                Car[] memory allCars = cars; // Get and cache the cars.

                uint256 currentTurn = turns; // Get and cache the current turn.

                // Get the current car by moduloing the turns variable by the player count.
                Car currentTurnCar = allCars[currentTurn % PLAYERS_REQUIRED];

                // Get all car data and the current turn car's index so we can pass it via takeYourTurn.
                (CarData[] memory allCarData, uint256 yourCarIndex) = getAllCarDataAndFindCar(currentTurnCar);

                currentCar = currentTurnCar; // Set the current car temporarily.

                // Call the car to have it take its turn with a max of 2 million gas, and catch any errors that occur.
                

                delete currentCar; // Restore the current car to the zero address.

                // Loop over all of the cars and update their data.
                for (uint256 i = 0; i < PLAYERS_REQUIRED; i++) {
                    Car car = allCars[i]; // Get the car.

                    // Get a pointer to the car's data struct.
                    CarData storage carData = getCarData[car];

                    // If the car is now past the finish line after moving:
                    if ((carData.y += carData.speed) >= FINISH_DISTANCE) {
                        emit Dub(currentTurn, car); // It won.

                        state = State.DONE;

                        return; // Exit early.
                    }
                }
                */

               bool _won;

                //After reaching SOFT_TURN_DEADLINE, the first player to reach first place (with score > second place) wins
                if (!_won && _room.turn > SOFT_TURN_DEADLINE) {
                    _won = (_topScoreElevators.length == 1);
                }

                if (_won) {
                    _room.status = GameRoomStatus.FinishedWithWinner;
                    break;
                } else {

                    // Indices are shuffled every time all 3 (or more) players have finished a turn
                    if (_room.turn % PLAYERS == 0) {
                        uint8[] memory _newIndices = shuffledIndices(_random, PLAYERS);
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
                               ACTIONS
    //////////////////////////////////////////////////////////////*/

    /*
    function buySpeedUp(uint256 gameRoom, uint8 player, uint256 amount) external returns (uint256 cost) {

        cost = getAccelerateCost(amount); // Get the cost of the acceleration.

        // Get a storage pointer to the calling car's data struct.
        CarData storage car = getCarData[Car(msg.sender)];

        car.balance -= cost.safeCastTo32(); // This will underflow if we cant afford.

        unchecked {
            car.speed += uint32(amount); // Increase their speed by the amount.

            // Increase the number of accelerates sold.
            getActionsSold[ActionType.ACCELERATE] += amount;
        }

        emit Accelerated(turns, Car(msg.sender), amount, cost);
    }

    function buyShell(uint256 amount) external onlyDuringActiveGame onlyCurrentCar returns (uint256 cost) {
        require(amount != 0, "YOU_CANT_BUY_ZERO_SHELLS"); // Buying zero shells would make them free.

        cost = getShellCost(amount); // Get the cost of the shells.

        // Get a storage pointer to the calling car's data struct.
        CarData storage car = getCarData[Car(msg.sender)];

        car.balance -= cost.safeCastTo32(); // This will underflow if we cant afford.

        uint256 y = car.y; // Retrieve and cache the car's y.

        unchecked {
            // Increase the number of shells sold.
            getActionsSold[ActionType.SHELL] += amount;

            Car closestCar; // Used to determine who to shell.
            uint256 distanceFromClosestCar = type(uint256).max;

            for (uint256 i = 0; i < PLAYERS; i++) {
                CarData memory nextCar = getCarData[cars[i]];

                // If the car is behind or on us, skip it.
                if (nextCar.y <= y) continue;

                // Measure the distance from the car to us.
                uint256 distanceFromNextCar = nextCar.y - y;

                // If this car is closer than all other cars we've
                // looked at so far, we'll make it the closest one.
                if (distanceFromNextCar < distanceFromClosestCar) {
                    closestCar = nextCar.car;
                    distanceFromClosestCar = distanceFromNextCar;
                }
            }

            // If there is a closest car, shell it.
            if (address(closestCar) != address(0)) {
                // Set the speed to POST_SHELL_SPEED unless its already at that speed or below, as to not speed it up.
                if (getCarData[closestCar].speed > POST_SHELL_SPEED) getCarData[closestCar].speed = POST_SHELL_SPEED;
            }

            emit Shelled(turns, Car(msg.sender), closestCar, amount, cost);
        }
    }
    */

    /*//////////////////////////////////////////////////////////////
                            ACTION PRICING
    //////////////////////////////////////////////////////////////*/

    function getActionCost(uint256 gameRoomId, ActionType action, uint256 amount) public view returns (uint256 sum) {
        GameRoom memory _room = gameRooms[gameRoomId];
        
        unchecked {
            for (uint256 i = 0; i < amount; i++) {
                sum += computeActionPrice(
                    actionPriceSettings[action].targetPrice,
                    actionPriceSettings[action].perTurnDecrease,
                    _room.turn,
                    _room.actionsSold[uint256(action)] + i,
                    actionPriceSettings[action].sellPerTurn
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
            for (uint8 i=0; i<totalPlayers; i++) {
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
            for (uint8 i=0; i<elevData.length; i++) {
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
}