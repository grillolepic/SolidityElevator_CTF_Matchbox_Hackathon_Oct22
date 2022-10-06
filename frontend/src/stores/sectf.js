import { defineStore } from 'pinia';
import { useEthereumStore } from './ethereum';
import { useGameStore } from './game';
import { solidityElevatorContractAddress } from '@/helpers/blockchainConstants';
import { Contract, Wallet, utils} from 'ethers';
import { joinRoom } from 'trystero';

import SOLIDITY_ELEVATOR_CTF_ABI from './abi/solidityElevatorCTF.json';

let _ethereumStore = null;
let _gameStore = null;
let _solidityElevatorCTFContract = null;

let _resetState = {
    loadingPreviousRooms: false,

    creatingRoom: false,
    closingRoom: false,
    joiningRoom: false,
    creatingNumberOfPlayers: 2,
    creatingFloors: 8,
    creatingScoreToWin: 10,
    elevatorContractValid: false,

    loadingRoom: false,
    currentRoomId: null,
    currentRoomJoined: null,
    currentRoomLostKeys: null,
    currentRoomStatus: null,
    currentRoom: null  
};

let _initialState = {
    contractAddress: null,
    version: '',
    activeGameRooms: [],
    ... _resetState
};

let _trysteroRoom = null;
let _sendMessage = null;
let _getMessage = null;

export const useSECTFStore = defineStore({
    id: 'SECTF',

    state: () => ({ ..._initialState }),
    
    getters: {

        localKeyGameRoom: (state) => (state.currentRoomId == null)?null:utils.solidityKeccak256(['uint160','uint160','uint256'], [state.contractAddress, _ethereumStore.address, state.currentRoomId]),
        localKeySimple: (state) => utils.solidityKeccak256(['uint160','uint160'], [state.contractAddress, _ethereumStore.address])
    },

    actions: {
        async init() {
            console.log("SECTF: init()");
            _ethereumStore = useEthereumStore();
            _gameStore = useGameStore();

            this.contractAddress = solidityElevatorContractAddress[_ethereumStore.chainId];
            _solidityElevatorCTFContract = new Contract(this.contractAddress, SOLIDITY_ELEVATOR_CTF_ABI, _ethereumStore.ethersSigner);

            let _version = (await _solidityElevatorCTFContract.VERSION()).toNumber() / 100;
            this.version = _version.toString();

            await this.loadPreviousRooms();
        },

        reset() {
            console.log("SECTF: reset()");
            this.leave();
            this.$patch({ ..._resetState });
        },

        async loadPreviousRooms() {
            console.log("SECTF: loadPreviousRooms()");
            this.loadingPreviousRooms = true;

            let gameRooms = [];
            try {
                let result = await _solidityElevatorCTFContract.getPlayerActiveRooms();
                let ts = Math.floor(Date.now() / 1000);
                for (let i=0; i<result[0].length; i++) {
                    let gameRoom = {};
                    gameRoom.id = result[0][i].toString();
                    gameRoom.turn = result[1][i].turn;
                    gameRoom.owner = (result[1][i].players[0] == utils.getAddress(_ethereumStore.address));
                    gameRoom.status = (result[1][i].deadline < ts)?6:result[1][i].status;
                    gameRooms.push(gameRoom);
                }
            } catch (err) {
                gameRooms = [];
            }

            this.$patch({
                activeGameRooms: gameRooms,
                loadingPreviousRooms: false
            });
        },

        localKeyCustomGameRoom(roomId) {
            if (_ethereumStore.address == null || this.contractAddress == null) { return null; }
            if (typeof roomId != 'string') { return null; }
            return utils.solidityKeccak256(['uint160','uint160','uint256'], [this.contractAddress, _ethereumStore.address, roomId]);
        },

        async createRoom(numberOfPlayers, floors, scoreToWin, elevatorAddress) {
            console.log(`SECTF: createRoom(${numberOfPlayers}, ${floors}, ${scoreToWin}, ${elevatorAddress})`);
            this.creatingRoom = true;

            let randomWallet = Wallet.createRandom();
            localStorage.setItem(`${this.localKeySimple}_tmp`, JSON.stringify({
                offcain_private_key: randomWallet.privateKey,
                offcain_public_key: randomWallet.publicKey,
                offcain_address: randomWallet.address
            }));

            try {
                let txReceipt = await _solidityElevatorCTFContract.createGameRoom(
                    numberOfPlayers,
                    floors,
                    scoreToWin,
                    elevatorAddress,
                    randomWallet.address
                );
                await txReceipt.wait();

                await this.loadPreviousRooms();

                let lastRoomId = -1;
                for (let i=0; i<this.activeGameRooms.length; i++) {
                    if (parseInt(this.activeGameRooms[i].id) > lastRoomId) {
                        lastRoomId = this.activeGameRooms[i].id;
                    }
                }
                if (lastRoomId < 0) {
                    this.creatingRoom = false;
                    return false;
                }

                localStorage.removeItem(`${this.localKeySimple}_tmp`);
                localStorage.setItem(`${this.localKeyCustomGameRoom(lastRoomId)}`, JSON.stringify({
                    offcain_private_key: randomWallet.privateKey,
                    offcain_public_key: randomWallet.publicKey,
                    offcain_address: randomWallet.address
                }));

                this.creatingRoom = false;
                return true;

            } catch (err) {
                this.creatingRoom = false;
                return null;
            }
        },

        async loadRoom(id) {
            console.log(`SECTF: loadRoom(${id})`);

            this.loadingRoom = true;

            try {
                let gameRoom = await _solidityElevatorCTFContract.getGameRoom(id);

                if (gameRoom.status == 1 || gameRoom.status == 2) {

                    let room = {
                        floors: gameRoom.floors,
                        deadline: gameRoom.deadline,
                        numberOfPlayers: gameRoom.numberOfPlayers,
                        offchainPublicKeys: [...gameRoom.offchainPublicKeys],
                        players: [...gameRoom.players],
                        scoreToWin: gameRoom.scoreToWin
                    };

                    let playerNumber = room.players.indexOf(_ethereumStore.address);
                    let playerJoined = (playerNumber >= 0);

                    const localData = this.getLocalStorage(id);
                    let privateKeyLost = playerJoined && ((localData == null) || !("offcain_private_key" in localData));

                    if (privateKeyLost) {
                        let playerOffchainAddress = room.offchainPublicKeys[playerNumber];
                        let creatingLocalData = localStorage.getItem(`${this.localKeySimple}_tmp`);
                        if (creatingLocalData != null) {
                            creatingLocalData = JSON.parse(creatingLocalData);
                            if ("offcain_private_key" in creatingLocalData && "offcain_public_key" in creatingLocalData && "offcain_address" in creatingLocalData) {
                                if (creatingLocalData.offcain_address == playerOffchainAddress) {
                                    localStorage.removeItem(`${this.localKeySimple}_tmp`);
                                    localStorage.setItem(`${this.localKeyCustomGameRoom(id)}`, JSON.stringify(creatingLocalData));
                                    privateKeyLost = false;
                                }
                            }
                        }
                    }

                    this.$patch({
                        loadingRoom: false,
                        currentRoomId: id,
                        currentRoomJoined: playerJoined,
                        currentRoomLostKeys: privateKeyLost,
                        currentRoomStatus: gameRoom.status,
                        currentRoom: room,
                    });

                } else {
                    this.$patch({
                        loadingRoom: false,
                        currentRoomId: id,
                        currentRoomJoined: null,
                        currentRoomLostKeys: null,
                        currentRoomStatus: gameRoom.status,
                        currentRoom: null,
                    });
                }
            } catch (err) {
                await this.loadPreviousRooms();
                this.$patch({
                    loadingRoom: false,
                    currentRoomId: null,
                    currentRoomJoined: null,
                    currentRoomLostKeys: null,
                    currentRoomStatus: null,
                    currentRoom: null
                });
            }
        },

        async exitRoom(id) {
            console.log(`SECTF: exitRoom(${id})`);
            this.closingRoom = true;

            try {
                let txReceipt = await _solidityElevatorCTFContract.exitGameRoom(id);
                await txReceipt.wait();
                await this.loadPreviousRooms();
                this.closingRoom = false;
                return true;
            } catch (err) {
                this.closingRoom = false;
                return null;
            }            
        },

        async joinRoom(id, elevatorAddress) {
            console.log(`SECTF: joinRoom(${id}, ${elevatorAddress})`);
            this.joiningRoom = true;

            let randomWallet = Wallet.createRandom();
            console.log(randomWallet);

            try {
                let txReceipt = await _solidityElevatorCTFContract.createGameRoom(
                    numberOfPlayers,
                    floors,
                    scoreToWin,
                    elevatorAddress,
                    randomWallet.address
                );
                await txReceipt.wait();
            } catch (err) {
                this.creatingRoom = false;
                return false;
            }
            
            await this.loadPreviousRooms();

            this.creatingRoom = false;
            return true;
        },

        getLocalStorage(roomId = null) {
            console.log("SECTF: getLocalStorage()");
            let storage;
            if (roomId == null) { storage = localStorage.getItem(this.localKeyGameRoom); }
            else { storage = localStorage.getItem(`${this.localKeyCustomGameRoom(roomId.toString())}`); }
            if (storage != null) { return JSON.parse(storage); }
            return null;
        },

        async leave() {
            console.log("SECTF: leave()");
            if (_trysteroRoom != null) {
                _trysteroRoom.leave();
                _trysteroRoom = null;
                this.$patch({ ..._resetState });
            }
            _sendMessage = null;
            _getMessage = null;
        }
    }
});