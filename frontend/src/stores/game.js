import { defineStore } from 'pinia';

let _initialState = {
    turn: null,
}

export const useGameStore = defineStore({
    id: 'game',
    state: () => ({ ..._initialState }),
    getters: {
    },
    actions: {
    }
});