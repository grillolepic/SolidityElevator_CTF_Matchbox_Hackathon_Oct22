import { defineStore } from 'pinia';

let _initialState = {
    turn: null,
    indices: [],
    randomSeed: [0,0],
    waitingPassengers: 0,
    elevatorsData: [],
    floorPassengers: []
}

export const useGameStore = defineStore({
    id: 'game',

    state: () => ({ ..._initialState }),

    getters: {
    },
    
    actions: {
        buildCheckpointFrom(remoteState) {
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

    }
});