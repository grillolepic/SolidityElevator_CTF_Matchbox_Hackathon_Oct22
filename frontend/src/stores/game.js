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
    }
});