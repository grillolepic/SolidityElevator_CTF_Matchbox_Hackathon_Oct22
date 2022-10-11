import { parse } from '@vue/compiler-dom';
import { DRNG } from './DRNG.js';

const SOFT_TURN_DEADLINE = 1000;
const HARD_TURN_DEADLINE = 1200;

const NEW_PASSENGERS_SPAWN_RATE = 5n;
const MAX_PASSENGERS_PER_ELEVATOR = 4n;
const MAX_WAITING_PASSENGERS = 100n;

const ELEVATOR_MIN_SPEED = 10;
const ELEVATOR_MAX_SPEED = 100;
const ELEVATOR_MAX_FLOOR_QUEUE = 8;

const ELEVATOR_LIGHT_OFF = 0;
const ELEVATOR_LIGHT_UP = 1;
const ELEVATOR_LIGHT_DOWN = 2;

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

const SPEED_UP_ACTION = 0;
const SLOW_DOWN_ACTION = 1;

const GAME_STATUS_FINISHED_WITH_WINNER = 3;
const GAME_STATUS_FINISHED_WITHOUT_WINNER = 4;


class SolidityElevatorGame {
    static buildCheckpointFrom(remoteState) {
        let checkpointData = {
            turn: remoteState[0].turn,
            status: remoteState[0].status,
            indices: [],
            randomSeed: [],
            waitingPassengers: remoteState[0].waitingPassengers,
            elevators: [],
            floorPassengers: [],
            actionsSold: []
        };
        remoteState[0].indices.forEach((i) => checkpointData.indices.push(i));
        remoteState[0].randomSeed.forEach((s) => checkpointData.randomSeed.push(s.toString()));
        remoteState[0].actionsSold.forEach((a) => checkpointData.actionsSold.push(parseInt(a.toString())));

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
    static async playOffChain(lastState, currentRoom, elevatorContracts, sectfContract) {

        if (lastState.status != 2) { return null; }

        let nextState = JSON.parse(JSON.stringify(lastState));

        let _floorButtons = SolidityElevatorGame.#calculateFloorButtons(lastState.turn, lastState.floorPassengers);
        let _topScoreElevators = SolidityElevatorGame.#calculateTopScoreElevators(lastState.elevators);

        // First, get the elevator playing this turn
        let _currentElevatorId = lastState.indices[(lastState.turn - 1) % currentRoom.numberOfPlayers];

        // Then, calculate a new random number for this turn
        let result = DRNG.next([...lastState.randomSeed]);
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
            let _result = await elevatorContracts[_currentElevatorId].playTurnOffChain(
                _currentElevatorId,
                currentRoom.numberOfPlayers,
                currentRoom.floors,
                currentRoom.scoreToWin,
                _topScoreElevators,
                lastState.turn,
                [...lastState.actionsSold],
                [..._elevatorInfo],
                _floorButtons
            );

            if (_result.amount.toNumber() > 0) {
                let _cost = await sectfContract.getActionCost(lastState.turn, lastState.actionsSold[_result.action], _result.action, _result.amount);

                if (lastState.elevators[_currentElevatorId].balance >= _cost.toNumber()) {
                    if ((_result.action == SPEED_UP_ACTION) && (lastState.elevators[_currentElevatorId].speed < ELEVATOR_MAX_SPEED)) {

                        nextState.elevators[_currentElevatorId].balance -= _cost.toNumber();
                        nextState.actionsSold[SPEED_UP_ACTION] += _result.amount.toNumber();

                        if ((lastState.elevators[_currentElevatorId].speed + _result.amount.toNumber()) <= ELEVATOR_MAX_SPEED) {
                            nextState.elevators[_currentElevatorId].speed += _result.amount.toNumber();
                        } else {
                            nextState.elevators[_currentElevatorId].speed = ELEVATOR_MAX_SPEED;
                        }

                    } else if ((_result.action == SLOW_DOWN_ACTION) && (lastState.elevators[_currentElevatorId].speed > ELEVATOR_MIN_SPEED)) {

                        nextState.elevators[_currentElevatorId].balance -= _cost.toNumber();
                        nextState.actionsSold[SLOW_DOWN_ACTION] += _result.amount.toNumber();

                        nextState.elevators[_result.target].speed = Math.floor(lastState.elevators[_result.target].speed / (2 ** _result.amount.toNumber()));

                        if (nextState.elevators[_result.target].speed <= ELEVATOR_MIN_SPEED) {
                            nextState.elevators[_result.target].speed = ELEVATOR_MIN_SPEED;
                        }
                    }
                }
            }

            nextState.elevators[_currentElevatorId].light = _result.light;
            nextState.elevators[_currentElevatorId].data = _result.data;

            if (_result.replaceFloorQueue) {
                nextState.elevators[_currentElevatorId].floorQueue = [..._result.floorQueue];
            } else {
                for (let i=0; i<_result.floorQueue.length; i++) {
                    if (nextState.elevators[_currentElevatorId].floorQueue.length == ELEVATOR_MAX_FLOOR_QUEUE) { break; }
                    nextState.elevators[_currentElevatorId].floorQueue.push(_result.floorQueue[i]);
                }
            }
        } catch (err) {
            console.log(err);
            throw new Error("Cotract interaction failed. Retry or play on-chain");
        }

        //////////////////////////////////////////////////////
        //                    GAME LOGIC                    //
        //////////////////////////////////////////////////////

        //Now that the elevator has processed its turns, execute game logic depending on the current elevator state
        //In the process, check if the elevator has won (by achieving target score)
        let _won = false; //lastState.elevators[_currentElevatorId].score == currentRoom.scoreToWin;
        
        //'Idle' and 'Waiting' internally execute almost the same code, but can have different meanings
        //  'Idle' is where the elevator starts: doors open, waiting for a commnad. Passengers can get in, but status
        //  won't change to 'Closing' unitil a target flor is given with the floor queue.
        //  'Waiting' is the immediate status set after an elevator reaches a target floor and opens it's doors.
        //  In this status, doors are open and passengers first get out, then get in. After all passengers have moved,
        //  it should switch to 'Idle' if there's no next floor in queue or to 'Closing' if there is.

        if (lastState.elevators[_currentElevatorId].status == ELEVATOR_STATUS_IDLE ||
            lastState.elevators[_currentElevatorId].status == ELEVATOR_STATUS_WAITING) {                   

            let _currentFloor = SolidityElevatorGame.#currentFloor(lastState.elevators[_currentElevatorId]);

            //First check if there are passengers to get out of the elevator
            let _getOut = SolidityElevatorGame.#findNextPassangerToGetOut(lastState.elevators[_currentElevatorId]);
            let _passengersToGoOut = _getOut[0];
            let _targetOutgoingPassengerIndex = _getOut[1]; 

            if (_passengersToGoOut) {
                //If a passanger got out:
                // 1) Remove it
                nextState.elevators[_currentElevatorId].passengers.splice(_targetOutgoingPassengerIndex,1);
                // 2) Add 1 to the elevator's score and check if score makes current elevator the winner
                nextState.elevators[_currentElevatorId].score++;
                if (nextState.elevators[_currentElevatorId].score == currentRoom.scoreToWin) {
                    _won = true;
                }
                // 3) Update _topScoreElevators
                _topScoreElevators = SolidityElevatorGame.#calculateTopScoreElevators(nextState.elevators);
            } else {

                //If all passengers who needed to get out got out,
                //check if passangers are available to get into the elevator
                let _getIn = SolidityElevatorGame.#findNextPassangerForElevator(
                    lastState.elevators[_currentElevatorId],
                    _currentFloor,
                    lastState.floorPassengers[_currentFloor],
                    MAX_PASSENGERS_PER_ELEVATOR
                );
                let _passengersToGetIn = _getIn[0];
                let _targetPassengerIndex = _getIn[1];

                if (_passengersToGetIn) {
                    //If there's a passanger available to get in:
                    // 1) Push it into the elevator and remove it from the floor
                    nextState.elevators[_currentElevatorId].passengers.push(
                        lastState.floorPassengers[_currentFloor][_targetPassengerIndex]);

                    nextState.floorPassengers[_currentFloor].splice(_targetPassengerIndex,1);

                    nextState.waitingPassengers--;

                    // 3) Recalculate Floor Buttons
                    _floorButtons = SolidityElevatorGame.#calculateFloorButtons(lastState.turn, nextState.floorPassengers);
                } else {

                    //If there's no passenger to get in, check if there's a floor in the queue (!= from current floor)
                    let _hasChangedTargetFloor = false;

                    for (let i=0; i<nextState.elevators[_currentElevatorId].floorQueue.length; i++) {
                        // 1) Set the elevator's target floor
                        nextState.elevators[_currentElevatorId].targetFloor = nextState.elevators[_currentElevatorId].floorQueue[0];

                        // 2) Shift the floor queue
                        nextState.elevators[_currentElevatorId].floorQueue.shift();

                        // 3) Make sure target floor is different from current floor before breaking the loop
                        if (nextState.elevators[_currentElevatorId].targetFloor != _currentFloor) {
                            _hasChangedTargetFloor = true;
                            break;
                        }
                    }

                    //If a new valid target floor was set change status to 'Closing', if not, to 'Idle'
                    nextState.elevators[_currentElevatorId].status = _hasChangedTargetFloor?ELEVATOR_STATUS_CLOSING:ELEVATOR_STATUS_IDLE;
                }
            }

        } else if (lastState.elevators[_currentElevatorId].status == ELEVATOR_STATUS_GOING_UP) {
            //Just increase the elevator's position until it reaches the targetFloor
            //When reached, set status to 'Opening'

            nextState.elevators[_currentElevatorId].y += nextState.elevators[_currentElevatorId].speed;
            if (nextState.elevators[_currentElevatorId].y >= (nextState.elevators[_currentElevatorId].targetFloor * 100)) {
                nextState.elevators[_currentElevatorId].y = (nextState.elevators[_currentElevatorId].targetFloor * 100);
                nextState.elevators[_currentElevatorId].status = ELEVATOR_STATUS_OPENING;
            }

        } else if (lastState.elevators[_currentElevatorId].status == ELEVATOR_STATUS_GOING_DOWN) {
            //Just decrease the elevator's position until it reaches the targetFloor
            //(Being careful not to underflow!)
            //When reached, set status to 'Opening'
            if (nextState.elevators[_currentElevatorId].speed <= nextState.elevators[_currentElevatorId].y) {
                nextState.elevators[_currentElevatorId].y -= nextState.elevators[_currentElevatorId].speed;
            } else {
                nextState.elevators[_currentElevatorId].y = 0;
            }
            if (nextState.elevators[_currentElevatorId].y <= (nextState.elevators[_currentElevatorId].targetFloor * 100)) {
                nextState.elevators[_currentElevatorId].y = (nextState.elevators[_currentElevatorId].targetFloor * 100);
                nextState.elevators[_currentElevatorId].status = ELEVATOR_STATUS_OPENING;
            }

        } else if (lastState.elevators[_currentElevatorId].status == ELEVATOR_STATUS_OPENING) {

            //'Opening' can only lead to 'Waiting'
            nextState.elevators[_currentElevatorId].status = ELEVATOR_STATUS_WAITING;

        } else if (lastState.elevators[_currentElevatorId].status == ELEVATOR_STATUS_CLOSING) {

            //Change Status to 'GoingUp' or 'GoingDown' depending on currentFloor and targetFloor
            let _currentFloor = SolidityElevatorGame.#currentFloor(lastState.elevators[_currentElevatorId]);

            if (_currentFloor < nextState.elevators[_currentElevatorId].targetFloor) {
                nextState.elevators[_currentElevatorId].status = ELEVATOR_STATUS_GOING_UP;
            } else if (_currentFloor > nextState.elevators[_currentElevatorId].targetFloor) {
                nextState.elevators[_currentElevatorId].status = ELEVATOR_STATUS_GOING_DOWN;
            } else {
                //This should never happen
                nextState.elevators[_currentElevatorId].status = ELEVATOR_STATUS_OPENING;
            }
        }

        //////////////////////////////////////////////////////
        //         FINISH GAME AND NEXT TURN LOGIC          //
        //////////////////////////////////////////////////////

        //After reaching SOFT_TURN_DEADLINE, the first player to reach first place (with score > second place) wins
        //This is only valid if number of players > 1
        if (!_won && lastState.turn > SOFT_TURN_DEADLINE && currentRoom.numberOfPlayers > 1) {
            _won = (_topScoreElevators.length == 1);
        }

        if (_won) {
            nextState.status = GAME_STATUS_FINISHED_WITH_WINNER;
        } else {

            // Indices are shuffled every time all 3 (or more) players have finished a turn
            if (lastState.turn % currentRoom.numberOfPlayers == 0) {
                let _newIndices =  SolidityElevatorGame.#shuffledIndices(_random, currentRoom.numberOfPlayers);
                nextState.indices = [..._newIndices];
            }

            //if HARD_TURN_DEADLINE is reached, the game is probably on an infinite loop. Finish it without a winner
            if (nextState.turn > HARD_TURN_DEADLINE) {
                nextState.status = GAME_STATUS_FINISHED_WITHOUT_WINNER;
            }
        }

        nextState.turn++;
        return nextState;
    }

    static #shuffledIndices(random, totalPlayers) {
        let _result = [];
        let _nextIndex = parseInt((random % BigInt(totalPlayers)).toString());
        for (let i=0; i<totalPlayers; i++) {
            _result.push(_nextIndex);
            _nextIndex++;
            if (_nextIndex >= totalPlayers) { _nextIndex = 0; }
        }
        return _result;
    }

    static #currentFloor(elevator) {
        if (elevator.y % 100 != 0) { return null; }
        return Math.floor(elevator.y / 100);
    }

    static #findNextPassangerForElevator(elevator, currentFloor, floorPassengers, maxPassengersPerElevator) {
        if (elevator.passengers.length == maxPassengersPerElevator) { return [false, 0]; }

        let _foundPassenger = false;
        let _passangerIndex = 0;

        for (let i=0; i<floorPassengers.length; i++) {
            if (elevator.light == ELEVATOR_LIGHT_OFF) {
                _foundPassenger = true;
                _passangerIndex = i;
                break;
            } else {
                if (floorPassengers[i] > currentFloor && elevator.light == ELEVATOR_LIGHT_UP) {
                    _foundPassenger = true;
                    _passangerIndex = i;
                    break;
                } else if (floorPassengers[i] < currentFloor && elevator.light == ELEVATOR_LIGHT_DOWN) {
                    _foundPassenger = true;
                    _passangerIndex = i;
                    break;  
                }
            }
        }

        return [_foundPassenger, _passangerIndex];
    }

    static #findNextPassangerToGetOut(elevator) {
        if (elevator.passengers.length == 0) { return [false, 0]; }

        let _foundPassenger = false;
        let _passangerIndex = 0;

        for (let i=0; i<elevator.passengers.length; i++) {
            if (elevator.passengers[i] == elevator.targetFloor) {
                _foundPassenger = true;
                _passangerIndex = i;
                break;
            }
        }
        return [_foundPassenger, _passangerIndex];
    }

    static #buildElevatorsInfo(elevatorsData, currentElevator) {
        let _elevatorsInfo = new Array(elevatorsData.length).fill({});

        for (let i=0; i<elevatorsData.length; i++) {
            if (i == currentElevator) {
                //For the current playing elevator, we provide the full elevator data
                _elevatorsInfo[i] = [
                    elevatorsData[i].status,
                    elevatorsData[i].light,
                    elevatorsData[i].score,
                    elevatorsData[i].targetFloor,
                    [...elevatorsData[i].floorQueue],
                    [...elevatorsData[i].passengers],
                    elevatorsData[i].balance,
                    elevatorsData[i].speed,
                    elevatorsData[i].y,
                    elevatorsData[i].data
                ];
            } else {
                //For other elevators, we skip the status, the target floor, the floor queue,
                //the passengers list and the data.
                _elevatorsInfo[i] = [
                    ELEVATOR_STATUS_UNDEFINED,
                    elevatorsData[i].light,
                    elevatorsData[i].score,
                    0,
                    [],
                    [],
                    elevatorsData[i].balance,
                    elevatorsData[i].speed,
                    elevatorsData[i].y,
                    "0x0000000000000000000000000000000000000000000000000000000000000000"
                ];
            }
        }
        return _elevatorsInfo;
    }

    static #newPassenger(random, totalFloors, waitingPassengers, maxWaitingPassengers, spawnRate) {
        if (waitingPassengers >= maxWaitingPassengers) { return [false, 0, 0]; }
        if (random % spawnRate == 0) {
            random >>= 8n;
            let _startFloor = parseInt((random % BigInt(totalFloors)).toString());
            let _targetFloor = _startFloor;
            while (_startFloor == _targetFloor) {
                random >>= 8n;
                _targetFloor = parseInt((random % BigInt(totalFloors)).toString());
                if (random == 0n) { return [false, 0, 0]; }
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