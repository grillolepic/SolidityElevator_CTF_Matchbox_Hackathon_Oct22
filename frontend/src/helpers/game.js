import { DRNG } from './DRNG.js';

const NEW_PASSENGERS_SPAWN_RATE = 5n;
const MAX_PASSENGERS_PER_ELEVATOR = 4n;
const MAX_WAITING_PASSENGERS = 100n;

const FLOOR_BUTTON_OFF = 0;
const FLOOR_BUTTON_UP = 1;
const FLOOR_BUTTON_DOWN = 2;
const FLOOR_BUTTON_BOTH = 3;


const ELEVATOR_STATUS_IDLE = 0;
const ELEVATOR_STATUS_GOING_UP = 1;
const ELEVATOR_STATUS_GOING_DOWN = 2;
const ELEVATOR_STATUS_OPENING = 3;
const ELEVATOR_STATUS_CLOSING = 4;
const ELEVATOR_STATUS_WAITING = 5;
const ELEVATOR_STATUS_UNDEFINED = 6;

class SolidityElevatorGame {
    static buildCheckpointFrom(remoteState) {
        let checkpointData = {
            turn: remoteState[0].turn,
            status: remoteState[0].status,
            indices: [],
            randomSeed: [],
            waitingPassengers: remoteState[0].waitingPassengers,
            elevators: [],
            floorPassengers: []
        };
        remoteState[0].indices.forEach((i) => checkpointData.indices.push(i));
        remoteState[0].randomSeed.forEach((s) => checkpointData.randomSeed.push(s.toString()));

        remoteState[1].forEach((elevatorData) => {
            let elevator = {
                address: elevatorData.elevator,
                score: elevatorData.score,
                balance: elevatorData.balance,
                status: elevatorData.status,
                targetFloor: elevatorData.targetFloor,
                speed: elevatorData.speed,
                light: elevatorData.light,
                data: elevatorData.data,
                y: elevatorData.y,
                floorQueue: [],
                passengers: []
            };
            elevatorData.passengers.forEach((p) => { elevator.passengers.push(p); });
            elevatorData.floorQueue.forEach((q) => { elevator.floorQueue.push(q); });
            checkpointData.elevators.push(elevator);
        });

        remoteState[2].forEach((floorData) => {
            let passengers = [];
            floorData.passengers.forEach((p) => passengers.push(p));
            checkpointData.floorPassengers.push(passengers);
        });

        return checkpointData;
    }

    //This is the key function for state-channel interaction.
    //It replicates the contract's play(uint256, uint16) function
    static async playOffChain(lastState, currentRoom, elevatorContract) {

        let nextState = { ... lastState };

        let _floorButtons = SolidityElevatorGame.#calculateFloorButtons(lastState.turn, lastState.floorPassengers);
        let _topScoreElevators = SolidityElevatorGame.#calculateTopScoreElevators(lastState.elevators);

        // First, get the elevator playing this turn
        let _currentElevatorId = lastState.indices[(lastState.turn - 1) % currentRoom.numberOfPlayers];

        // Then, calculate a new random number for this turn
        let result = DRNG.next(lastState.randomSeed);
        let _random = result.result;
        nextState.randomSeed = [result.nextSeed[0].toString(),result.nextSeed[1].toString()];

        // Now use randomness to see if a new waiting passenger needs to be created
        let newPassenger = SolidityElevatorGame.#newPassenger(_random, currentRoom.floors, lastState.waitingPassengers,
            MAX_WAITING_PASSENGERS, NEW_PASSENGERS_SPAWN_RATE);
        let _createNewPassenger = newPassenger[0];
        let _startFloor = newPassenger[1];
        let _targetFloor = newPassenger[2];
        
        // If a passenger needs to be added, push it into storage and update elevator lights
        if (_createNewPassenger) {
            nextState.floorPassengers[_startFloor].push(_targetFloor);

            if (_floorButtons[_startFloor] == FLOOR_BUTTON_OFF) {
                _floorButtons[_startFloor] = (_startFloor < _targetFloor)?FLOOR_BUTTON_UP:FLOOR_BUTTON_DOWN;
            } else if ((_floorButtons[_startFloor] != FLOOR_BUTTON_BOTH) &&
                ((_targetFloor > _startFloor && _floorButtons[_startFloor] == FLOOR_BUTTON_DOWN) ||
                (_targetFloor < _startFloor && _floorButtons[_startFloor] == FLOOR_BUTTON_UP))) {
                    _floorButtons[_startFloor] = FLOOR_BUTTON_BOTH;
            }

            nextState.waitingPassengers++;
        }

        let _elevatorInfo = SolidityElevatorGame.#buildElevatorsInfo(lastState.elevators, _currentElevatorId);

        //////////////////////////////////////////////////////
        //                 ELEVATOR CONTROL                 //
        //////////////////////////////////////////////////////

        // Call the view from the elevator's address origin (replicating their msg.sender)
        // This function receives an ElevatorUpdate struct.

        try {

            //Create the contract and make the call

            let _update = elevatorContract.playTurnOffChain(
                playTurnOffChain,
                currentRoom.numberOfPlayers,
                currentRoom.floors,
                currentRoom.scoreToWin,
                _topScoreElevators,
                lastState.turn,
                lastState.actionsSold,  //TODO: TERRIBLE! AGREGAR ACTIONS SOLD AL ESTADO
                _elevatorInfo,
                _floorButtons
            );




        } catch (err) {
            console.log("CONTRACT INTERACTION FAILED");
        }









        return null;
    }



    static #buildElevatorsInfo(elevatorsData, currentElevator) {
        let _elevatorsInfo = new Array(elevatorsData.length).fill({});

        for (let i=0; i<elevatorsData.length; i++) {
            if (i == currentElevator) {
                //For the current playing elevator, we provide the full elevator data
                _elevatorsInfo[i] = {
                    status: elevatorsData[i].status,
                    light: elevatorsData[i].light,
                    score: elevatorsData[i].score,
                    targetFloor: elevatorsData[i].targetFloor,
                    floorQueue: elevatorsData[i].floorQueue,
                    passengers: elevatorsData[i].passengers,
                    balance: elevatorsData[i].balance,
                    speed: elevatorsData[i].speed,
                    y: elevatorsData[i].y,
                    data: elevatorsData[i].data
                };
            } else {
                //For other elevators, we skip the status, the target floor, the floor queue,
                //the passengers list and the data.
                _elevatorsInfo[i] = {
                    status: ELEVATOR_STATUS_UNDEFINED,
                    light: elevatorsData[i].light,
                    score: elevatorsData[i].score,
                    targetFloor: 0,
                    floorQueue: [],
                    passengers: [],
                    balance: elevatorsData[i].balance,
                    speed: elevatorsData[i].speed,
                    y: elevatorsData[i].y,
                    data: ""
                };
            }
        }
        return _elevatorsInfo;
    }

    static #newPassenger(random, totalFloors, waitingPassengers, maxWaitingPassengers, spawnRate) {
        if (waitingPassengers >= maxWaitingPassengers) { return [false, 0, 0]; }
        if (random % spawnRate == 0) {
            random >>= 8;
            let _startFloor = random % totalFloors;
            let _targetFloor = _startFloor;
            while (_startFloor == _targetFloor) {
                random >>= 8;
                _targetFloor = random % totalFloors;
                if (random == 0) { return [false, 0, 0]; }
            }
            return [true, _startFloor, _targetFloor];
        }
        return [false, 0, 0];
    }

    static #calculateFloorButtons(turn, floorPassengerData) {
        let _floorButtons = new Array(floorPassengerData.length).fill(0);
        if (turn > 1) {
            for (let f=0; f<floorPassengerData.length; f++) {
                for (let p=0; p<floorPassengerData[f].length; p++) {
                    if (_floorButtons[f] == FLOOR_BUTTON_OFF) {
                        _floorButtons[f] = (floorPassengerData[f][p] > f)?FLOOR_BUTTON_UP:FLOOR_BUTTON_DOWN;
                    } else if ((floorPassengerData[f][p] > f && _floorButtons[f] == FLOOR_BUTTON_DOWN) ||
                        (floorPassengerData[f][p] < f && _floorButtons[f] == FLOOR_BUTTON_UP)) {
                        _floorButtons[f] = FLOOR_BUTTON_BOTH;
                        break;
        }}}}
        return _floorButtons;
    }

    static #calculateTopScoreElevators(elevatorsData) {
        let _maxScore = elevatorsData[0].score;
        let _maxScoreCount = 1;

        for (let i=1; i<elevatorsData.length; i++) {
            if (elevatorsData[i].score > _maxScore) {
                _maxScore = elevatorsData[i].score;
                _maxScoreCount = 1;
            } else if (elevatorsData[i].score == _maxScore) {
                _maxScoreCount++;
            }
        }

        let _topScores = new Array(_maxScoreCount).fill(0);
        let _idx = 0;
        for (let i=0; i<elevatorsData.length; i++) {
            if (elevatorsData[i].score == _maxScore) {
                _topScores[_idx] = i;
                _idx++;
            }
        }

        return _topScores;
    }
}

export { SolidityElevatorGame }