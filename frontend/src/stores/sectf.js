import { defineStore } from 'pinia';
import { useEthereumStore } from './ethereum';
import { SolidityElevatorGame } from '../helpers/game';
import { solidityElevatorContractAddress } from '@/helpers/blockchainConstants';
import { Contract, Wallet, utils} from 'ethers';
import { joinRoom } from 'trystero';

import SOLIDITY_ELEVATOR_CTF_ABI from './abi/solidityElevatorCTF.json';
import ELEVATOR_INTERFACE_ABI from './abi/Elevator.json';

let _ethereumStore = null;
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
    currentRoomRanking: null,
    currentRoom: null,
    currentRoomPlayerNumber: null,

    gameInternalStatus: null,
    gameLastBlockchainTurn: null,
    gameLastCheckpoint: null,
    gameTempCheckpoint: null,

    gamePeers: {},
    gamePeersTurnMode: [],
    gamePeersOnline: [],
    gameBlockchainInteraction: false,
    finishedGameBlockchainInteraction: false
};

let _initialState = {
    contractAddress: null,
    version: '',
    activeGameRooms: [],
    ... _resetState
};

let _offchainSigner = null;
let _trysteroRoom = null;
let _sendMessage = null;
let _getMessage = null;

const AUTOMATIC_INTERVAL_TIME = 500;
let _elevatorContracts = [];
let _turnLoop = null;

export const useSECTFStore = defineStore({
    id: 'SECTF',

    state: () => ({ ..._initialState }),
    
    getters: {
        currentTurnPlayerNumber: (state) => {
            if (state.gameLastCheckpoint == null) { return null; }
            if (state.currentRoom == null) { return null; }
            return state.gameLastCheckpoint.data.indices[(state.gameLastCheckpoint.data.turn - 1) % state.currentRoom.numberOfPlayers];
        },
        automaticPlaying: (state) => {
            if (state.currentRoom == null) { return false;}
            if (state.currentRoomPlayerNumber == null) { return false; }
            if (state.currentRoomStatus != 2) { return false; }
            if (state.gamePeersTurnMode.length < state.currentRoom.numberOfPlayers) { return false; }
            return (state.gamePeersTurnMode[state.currentRoomPlayerNumber] == 1);
        },
        localKeyGameRoom: (state) => (state.currentRoomId == null)?null:utils.solidityKeccak256(['uint160','uint160','uint256'], [state.contractAddress, _ethereumStore.address, state.currentRoomId]),
        localKeySimple: (state) => utils.solidityKeccak256(['uint160','uint160'], [state.contractAddress, _ethereumStore.address])
    },

    actions: {
        async init() {
            console.log("SECTF: init()");

            _ethereumStore = useEthereumStore();

            this.contractAddress = solidityElevatorContractAddress[_ethereumStore.chainId];
            _solidityElevatorCTFContract = new Contract(this.contractAddress, SOLIDITY_ELEVATOR_CTF_ABI, _ethereumStore.ethersSigner);

            let _version = (await _solidityElevatorCTFContract.VERSION()).toNumber() / 100;
            this.version = _version.toString();

            await this.loadActiveRooms();
        },

        reset() {
            console.log("SECTF: reset()");
            _solidityElevatorCTFContract.removeAllListeners();
            this.leave();
            this.$patch({ ..._resetState });
        },

        async loadActiveRooms() {
            console.log("SECTF: loadActiveRooms()");
            this.loadingPreviousRooms = true;

            let gameRooms = [];
            try {
                let result = await _solidityElevatorCTFContract.getPlayerActiveRooms();
                for (let i=0; i<result[0].length; i++) {
                    let gameRoom = {};
                    gameRoom.id = result[0][i].toString();
                    gameRoom.turn = result[1][i].turn;
                    gameRoom.owner = (result[1][i].players[0] == utils.getAddress(_ethereumStore.address));
                    gameRoom.status = result[1][i].status;
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

                await this.loadActiveRooms();

                let lastRoomId = -1;
                for (let i=0; i<this.activeGameRooms.length; i++) {
                    if (parseInt(this.activeGameRooms[i].id) > lastRoomId) {
                        lastRoomId = parseInt(this.activeGameRooms[i].id);
                    }
                }
                if (lastRoomId < 0) {
                    this.creatingRoom = false;
                    return false;
                }

                localStorage.removeItem(`${this.localKeySimple}_tmp`);
                localStorage.setItem(`${this.localKeyCustomGameRoom(lastRoomId.toString())}`, JSON.stringify({
                    offcain_private_key: randomWallet.privateKey,
                    offcain_public_key: randomWallet.publicKey,
                    offcain_address: randomWallet.address
                }));

                this.creatingRoom = false;
                return lastRoomId;

            } catch (err) {
                this.creatingRoom = false;
                return null;
            }
        },

        async loadRoom(id) {
            console.log(`SECTF: loadRoom(${id})`);

            this.loadingRoom = true;

            try {
                let gameState = (await _solidityElevatorCTFContract.getGameState(id));

                if (gameState[0].status > 1 || gameState[0].status < 5) {

                    let room = {
                        floors: gameState[0].floors,
                        numberOfPlayers: gameState[0].numberOfPlayers,
                        offchainPublicKeys: [...gameState[0].offchainPublicKeys],
                        players: [...gameState[0].players],
                        elevators: [],
                        scoreToWin: gameState[0].scoreToWin
                    };

                    gameState[1].forEach((elevatorData) => room.elevators.push(elevatorData.elevator));

                    let playerNumber = room.players.indexOf(_ethereumStore.address);
                    let playerJoined = (playerNumber >= 0);

                    let localData = this.getLocalStorage(id);
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
                    }}}}
                    
                    localData = this.getLocalStorage(id);
                    if (playerJoined && !privateKeyLost) {
                        _offchainSigner = new Wallet(localData.offcain_private_key);
                    }

                    _solidityElevatorCTFContract.removeAllListeners();

                    if (gameState[0].status == 1) {
                        _solidityElevatorCTFContract.on(_solidityElevatorCTFContract.filters.GameRoomPlayerJoined(id, null), (id, player) => {
                            console.log(`${player} joined GameRoom #${id}`);
                            this.loadRoom(id);
                        });

                        _solidityElevatorCTFContract.on(_solidityElevatorCTFContract.filters.GameRoomPlayerLeft(id, null), (id, player) => {
                            console.log(`${player} left GameRoom #${id}`);
                            this.loadRoom(id);
                        });

                        _solidityElevatorCTFContract.on(_solidityElevatorCTFContract.filters.GameRoomReady(id), (id) => {
                            console.log(`GameRoom #${id} is ready`);
                            this.loadRoom(id);
                        });

                        _solidityElevatorCTFContract.on(_solidityElevatorCTFContract.filters.GameRoomCancelled(id), (id) => {
                            console.log(`GameRoom #${id} is cancelled`);
                            this.loadRoom(id);
                        });
                    }

                    if (gameState[0].status == 2) {
                        _solidityElevatorCTFContract.on(_solidityElevatorCTFContract.filters.GameRoomUpdated(id), (id) => {
                            console.log(`GameRoom #${id} is updated`);
                            this.getCheckpointFromBlockchain();
                        });

                        _solidityElevatorCTFContract.on(_solidityElevatorCTFContract.filters.GameRoomFinished(id), (id) => {
                            console.log(`GameRoom #${id} finished!`);
                            this.finishGame();
                        });
                    }

                    let playerRanking = [];

                    if (gameState[0].status >= 3) {
                        for (let i=0; i<gameState[1].length; i++) {
                            playerRanking.push({
                                player: gameState[0].players[i],
                                score: gameState[1][i].score
                            });
                        }
                        playerRanking.sort((a,b) => a.score - b.score);
                    }

                    return this.$patch({
                        loadingRoom: false,
                        currentRoomId: id,
                        currentRoomJoined: playerJoined,
                        currentRoomLostKeys: privateKeyLost,
                        currentRoomStatus: gameState[0].status,
                        currentRoomRanking: playerRanking,
                        currentRoom: room,
                        currentRoomPlayerNumber: playerJoined?playerNumber:null
                    });

                } else {
                    //Cancelled game
                    return this.$patch({
                        loadingRoom: false,
                        currentRoomId: id,
                        currentRoomJoined: null,
                        currentRoomLostKeys: null,
                        currentRoomStatus: gameState[0].status,
                        currentRoomRanking: null,
                        currentRoom: null,
                        currentRoomPlayerNumber: null
                    });
                }
            } catch (err) {}

            await this.loadActiveRooms();
            this.$patch({
                loadingRoom: false,
                currentRoomId: null,
                currentRoomJoined: null,
                currentRoomLostKeys: null,
                currentRoomStatus: null,
                currentRoomRanking: null,
                currentRoom: null,
                currentRoomPlayerNumber: null
            });
        },

        async exitRoom(id) {
            console.log(`SECTF: exitRoom(${id})`);
            this.closingRoom = true;

            try {
                let txReceipt = await _solidityElevatorCTFContract.exitGameRoom(id);
                await txReceipt.wait();
                await this.loadActiveRooms();
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
            localStorage.setItem(`${this.localKeySimple}_tmp`, JSON.stringify({
                offcain_private_key: randomWallet.privateKey,
                offcain_public_key: randomWallet.publicKey,
                offcain_address: randomWallet.address
            }));

            try {
                let txReceipt = await _solidityElevatorCTFContract.joinGameRoom(
                    id,
                    elevatorAddress,
                    randomWallet.address
                );
                await txReceipt.wait();

                await this.loadActiveRooms();

                localStorage.removeItem(`${this.localKeySimple}_tmp`);
                localStorage.setItem(`${this.localKeyCustomGameRoom(id)}`, JSON.stringify({
                    offcain_private_key: randomWallet.privateKey,
                    offcain_public_key: randomWallet.publicKey,
                    offcain_address: randomWallet.address
                }));

                await this.loadRoom(id);

                this.joiningRoom = false;
                return true;

            } catch (err) {
                await this.loadActiveRooms();
                this.joiningRoom = false;
                return false;
            }
        },

        async playOnChain(turns, finish) {
            console.log(`SECTF: playTurnsOnChain(${turns})`);
            if (this.currentRoomId == null || this.currentRoomStatus != 2) { return null; }

            if (finish) {
                this.finishedGameBlockchainInteraction = true;
            } else {
                this.gameBlockchainInteraction = true;
            }
            
            try {
                let txReceipt = await _solidityElevatorCTFContract.play(this.currentRoomId, turns);
                await txReceipt.wait();
                
                await this.getCheckpointFromBlockchain();

                this.finishedGameBlockchainInteraction = false;
                this.gameBlockchainInteraction = false;
                return true;
            } catch (err) {
                this.finishedGameBlockchainInteraction = false;
                this.gameBlockchainInteraction = false;
                return null;
            }
        },

        async toggleAutomaticTurns() {
            console.log(`SECTF: toggleAutomaticTurns()`);
            if (this.currentRoomId == null || this.currentRoomStatus != 2) { return null; }
            if (this.gameInternalStatus == 2) {
                this.gamePeersTurnMode[this.currentRoomPlayerNumber] = (this.gamePeersTurnMode[this.currentRoomPlayerNumber] == 0)?1:0;
                if (this.currentRoom.numberOfPlayers > 1) {
                    _sendMessage({type: "sync_turn_mode", data: this.gamePeersTurnMode[this.currentRoomPlayerNumber]});
                }
            }
        },

        async automaticLoop() {
            if (this.currentRoomId == null || this.currentRoomStatus != 2) { 
                clearInterval(_turnLoop);
                return null;    
            }
            if (this.automaticPlaying && _elevatorContracts.length == this.currentRoom.numberOfPlayers) {
                console.log(`SECTF: automaticLoop()`);
                if (this.gameTempCheckpoint == null && this.gameLastCheckpoint != null) {
                    if (this.currentTurnPlayerNumber == this.currentRoomPlayerNumber) {
                        this.createOffChainTempCheckpoint();
                    } else {
                        console.log(" - Not my turn...");
                    }
                } else if (this.gameTempCheckpoint != null) {
                    if (this.currentTurnPlayerNumber == this.currentRoomPlayerNumber && this.currentRoom.numberOfPlayers > 1) {
                        _sendMessage({type: "sync_checkpoint", data: this.gameTempCheckpoint});
                    }
                }
            }
        },

        async createOffChainTempCheckpoint(sendOnCreate = true) {
            console.log("SECTF: createOffChainTempCheckpoint()");
            if (this.gameLastCheckpoint != null) {
                try {
                    let nextState = await SolidityElevatorGame.playOffChain(
                        this.gameLastCheckpoint.data,
                        this.currentRoom,
                        _elevatorContracts,
                        _solidityElevatorCTFContract
                    );

                    if (nextState != null) {
                    
                        let _checkpointHash = this.getCheckpointHash(nextState);
                        
                        let _newCheckpoint = {
                            data: nextState,
                            hash: _checkpointHash,
                            on_chain: false,
                            signatures: new Array(this.currentRoom.numberOfPlayers).fill(null)
                        };
        
                        let checkpointSignature = await _offchainSigner.signMessage(utils.arrayify(_checkpointHash));
                        _newCheckpoint.signatures[this.currentRoomPlayerNumber] = checkpointSignature;

                        if (this.currentRoom.numberOfPlayers > 1) {
                            this.gameTempCheckpoint = _newCheckpoint;
                        } else {
                            let storedGameData = this.getLocalStorage();
                            storedGameData.checkpoint = _newCheckpoint;
                            localStorage.setItem(this.localKeyGameRoom, JSON.stringify(storedGameData));
                            this.gameLastCheckpoint = _newCheckpoint;
                        }

                        if (nextState.status > 2) {
                            this.finishGame();
                        }

                        if (sendOnCreate && this.currentRoom.numberOfPlayers > 1) {
                            _sendMessage({type: "sync_checkpoint", data: this.gameTempCheckpoint});
                        }
                    } else {
                        if (this.gameLastCheckpoint.data.status > 2) {
                            this.finishGame();
                        }
                    }
                } catch (err) {
                    console.log(err);
                }
            }
        },

        finishGame() {
            console.log("SECTF: finishGame()");
            this.loadRoom(this.currentRoomId);

            if (_turnLoop != null) {
                clearInterval(_turnLoop);
            }

            let stopAll = new Array(this.currentRoom.numberOfPlayers).fill(0);
            this.gamePeersTurnMode = stopAll;
        },

        async pushStateToBlockchain(finish) {
            console.log(`SECTF: pushStateToBlockchain()`);
            if (this.currentRoomId == null || this.currentRoomStatus != 2) { return null; }

            if (this.gameLastBlockchainTurn >= this.gameLastCheckpoint.data.turn) { return null; }

            if (finish) {
                this.finishedGameBlockchainInteraction = true;
            } else {
                this.gameBlockchainInteraction = true;
            }

            try {
                let _elevators = [];
                let _floorPassengers = [];
                for (let i=0; i<this.gameLastCheckpoint.data.elevators.length; i++) {
                    let e = this.gameLastCheckpoint.data.elevators[i];
                    _elevators.push([e.address, e.status, e.light, e.score, e.targetFloor,
                        [...e.floorQueue], [...e.passengers], e.balance, e.speed, e.y, e.data]);
                }

                for (let i=0; i<this.gameLastCheckpoint.data.floorPassengers.length; i++) {
                    _floorPassengers.push([[...this.gameLastCheckpoint.data.floorPassengers[i]]]);
                }
 
                let txReceipt = await _solidityElevatorCTFContract.loadCheckpoint(
                    this.currentRoomId,
                    this.gameLastCheckpoint.data.turn,
                    this.gameLastCheckpoint.data.status,
                    [...this.gameLastCheckpoint.data.indices],
                    [...this.gameLastCheckpoint.data.randomSeed],
                    [...this.gameLastCheckpoint.data.actionsSold],
                    this.gameLastCheckpoint.data.waitingPassengers,
                    [..._elevators],
                    [..._floorPassengers],
                    [...this.gameLastCheckpoint.signatures]
                );

                await txReceipt.wait();
                await this.getCheckpointFromBlockchain();

                this.finishedGameBlockchainInteraction = false;
                this.gameBlockchainInteraction = false;
            } catch (err) {
                console.log(err);
                this.finishedGameBlockchainInteraction = false;
                this.gameBlockchainInteraction = false;
                return null;
            }
        },

        async getCheckpointFromBlockchain() {
            console.log(`SECTF: getCheckpointFromBlockchain()`);
            if (this.currentRoomId == null || this.currentRoomStatus != 2) { return null; }

            try {
                let _gameState = await _solidityElevatorCTFContract.getGameState(this.currentRoomId);
                this.gameLastBlockchainTurn = _gameState[0].turn;

                console.log(` - Received turn: ${this.gameLastBlockchainTurn}`);
                
                if (this.gameLastCheckpoint == null || this.gameLastCheckpoint.data.turn < _gameState[0].turn ||
                    (this.gameLastCheckpoint.data.turn == _gameState[0].turn && !this.gameLastCheckpoint.on_chain)){

                    console.log(` - Last checkpoint was: ${(this.gameLastCheckpoint == null)?"null":this.gameLastCheckpoint.data.turn}`);

                    let _checkpointFromRemote = SolidityElevatorGame.buildCheckpointFrom(_gameState);
                    let _checkpointHash = this.getCheckpointHash(_checkpointFromRemote);

                    let _newCheckpoint = {
                        data: _checkpointFromRemote,
                        hash: _checkpointHash,
                        on_chain: true
                    };

                    let storedGameData = this.getLocalStorage();
                    storedGameData.checkpoint = _newCheckpoint;
                    localStorage.setItem(this.localKeyGameRoom, JSON.stringify(storedGameData));

                    if (this.currentRoom.numberOfPlayers > 1) {
                        this.$patch({
                            gameLastCheckpoint: _newCheckpoint,
                            gameTempCheckpoint: null
                        });
                        console.log("       - Created new On-Chain Checkpoint");
                        if (this.gameInternalStatus == 2) {
                            _sendMessage({type: "sync_checkpoint", data: this.gameLastCheckpoint});
                        }
                    } else {
                        this.gameLastCheckpoint = _newCheckpoint;
                        console.log("       - Created new Checkpoint");
                    }

                    if (_checkpointFromRemote.status > 2) {
                        this.finishGame();
                    }

                } else {
                    console.log(` - Local checkpoint not updated`);
                }
            } catch (err) {
                console.log("   - FAILED fetching turn from blockchain...");
                this.$patch({
                    gameInternalStatus: -1,
                    gameLastBlockchainTurn: null,
                    gameLastCheckpoint: null,
                    gameTempCheckpoint: null,
                });
                this.leave();
            }
        },

        addTempCheckpointSignatures(signatures) {
            console.log(`SECTF: addTempCheckpointSignatures()`);
            let addedSignatures = 0;
            let totalValidSignatures = 0;
            for (let i=0; i<this.gameTempCheckpoint.signatures.length; i++) {
                if (this.gameTempCheckpoint.signatures[i] == null) {
                    if (signatures[i] != null) {
                        this.gameTempCheckpoint.signatures[i] = signatures[i];
                        addedSignatures++;
                        totalValidSignatures++;
                    }
                } else {
                    totalValidSignatures++;
                }
            }

            if (addedSignatures > 0) {
                console.log(` - Added ${addedSignatures} signatures to temp checkpoint`);
                _sendMessage({type: "sync_checkpoint", data: this.gameTempCheckpoint});

                if (totalValidSignatures == this.currentRoom.numberOfPlayers) {
                    let storedGameData = this.getLocalStorage();
                    let _newGameLastCheckpoint = JSON.parse(JSON.stringify(this.gameTempCheckpoint));
                    storedGameData.checkpoint = _newGameLastCheckpoint;
                    localStorage.setItem(this.localKeyGameRoom, JSON.stringify(storedGameData));
                    this.$patch({
                        gameLastCheckpoint: _newGameLastCheckpoint,
                        gameTempCheckpoint: null
                    });
            }}
        },

        getCheckpointHash(data) {
            if (this.currentRoomId == null) {  }

            let _elevatorsArray = [];
            data.elevators.forEach((elev) => {
                _elevatorsArray.push([
                    elev.address,
                    elev.status,
                    elev.light,
                    elev.score,
                    elev.targetFloor,
                    elev.floorQueue,
                    elev.passengers,
                    elev.balance,
                    elev.speed,
                    elev.y,
                    elev.data
                ]);
            });

            let _floorsArray = [];
            data.floorPassengers.forEach((passangers) => {
                _floorsArray.push([passangers]);
            });

            return utils.keccak256(
                utils.defaultAbiCoder.encode(
                    [ "uint256", "uint16", "uint8", "uint8[]", "uint64[2]", "uint256[2]", "uint8",
                      "tuple(address, uint8, uint8, uint8, uint8, uint8[], uint8[], uint32, uint8, uint16, bytes32)[]",
                      "tuple(uint8[])[]" ],
                    [   
                        this.currentRoomId,
                        data.turn,
                        data.status,
                        data.indices,
                        data.randomSeed,
                        data.actionsSold,
                        data.waitingPassengers,
                        _elevatorsArray,
                        _floorsArray
                    ]
                )
            );
        },

        async startGame() {
            console.log("SECTF: startGame()");
            if (this.currentRoomId == null || this.currentRoomStatus != 2) { return this.gameInternalStatus = -1; }
            
            this.gameInternalStatus = 0;
            
            //01. Load the stored data. If private key data is not found, exit.
            let storedCheckpoint = null;
            let storedGameData = this.getLocalStorage();

            if (storedGameData != null) {
                if (!("offcain_private_key" in storedGameData)) { return this.currentRoomLostKeys = true; }
                try { if ("checkpoint" in storedGameData) { storedCheckpoint = {...storedGameData.checkpoint}; } } catch (err) { storedCheckpoint = null; }
            } else {
                return this.currentRoomLostKeys = true;
            }
            
            //02. If a checkpoint was stored, validate it and load it. Delete if invalid.
            if (storedCheckpoint != null) {
                try {
                    let storedCheckpointHash = this.getCheckpointHash(storedCheckpoint.data);

                    if (storedCheckpoint.on_chain) {
                        throw new Error("On-Chain turned stored locally. Reset.")
                    } else {
                        for (let i=0; i<storedCheckpoint.signatures.length; i++) {
                            if (storedCheckpoint.signatures[i] == null) { throw new Error("Unsigned Checkpoint"); }
                            let signerAddress = utils.verifyMessage(utils.arrayify(storedCheckpointHash), storedCheckpoint.signatures[i]);
                            if (signerAddress != this.currentRoom.offchainPublicKeys[i]) { throw new Error("Wrong Signature"); }
                        }
                    }

                    this.gameLastCheckpoint = storedCheckpoint;
                    console.log(" - Found valid checkpoint.");

                } catch (err) {
                    console.log(" - Found invalid checkpoint. Deleted.");
                    storedCheckpoint = null;
                    delete storedGameData.checkpoint;
                    localStorage.setItem(this.localKeyGameRoom, JSON.stringify(storedGameData));
                }
            }

            //03. Now check if th blockchain state is not further into the game            
            await this.getCheckpointFromBlockchain();

            //04. Initialize the contracts to interact with the elevators off-chain
            this.initializeElevatorContracts();

            //05. Connect with other player via WebRTC and exchange signed ids before beginning sync
            if (this.currentRoom.numberOfPlayers > 1) {
                if (this.gameLastCheckpoint != null || this.gameTempCheckpoint != null) {

                    this.gamePeersTurnMode = new Array(this.currentRoom.numberOfPlayers).fill(0);
                    this.gamePeersOnline = new Array(this.currentRoom.numberOfPlayers).fill(false);
                    this.gamePeersOnline[this.currentRoomPlayerNumber] = true;
                    this.gameInternalStatus = 1;

                    _turnLoop = setInterval(this.automaticLoop, AUTOMATIC_INTERVAL_TIME);
                    
                    _trysteroRoom = joinRoom({ appId: this.contractAddress }, this.currentRoomId);

                    console.log(_trysteroRoom);

                    [_sendMessage, _getMessage] = _trysteroRoom.makeAction('message');
                    _getMessage((data, peer) => this.getMessage(data, peer));

                    console.log(_sendMessage);
                    console.log(_getMessage);

                    _trysteroRoom.onPeerJoin(async () => this.sendIdToPeers());

                    _trysteroRoom.onPeerLeave((peerId) => {
                        if (peerId in this.gamePeers) {
                            console.log(` > Player #${this.gamePeers[peerId].playerNumber} (${this.gamePeers[peerId].address}) left the game`);
                            this.gamePeersTurnMode = new Array(this.currentRoom.numberOfPlayers).fill(0);
                            this.gamePeersOnline[this.gamePeers[peerId].playerNumber] = false;
                            delete this.gamePeers[peerId];
                            this.gameInternalStatus = 1;
                        }
                    });
                } else {
                    this.gameInternalStatus = -1;
                    this.leave();
                }
            } else {
                _turnLoop = setInterval(this.automaticLoop, AUTOMATIC_INTERVAL_TIME);
                this.$patch({
                    gamePeersTurnMode: [0],
                    gamePeersOnline: [true],
                    gameInternalStatus: 2
                });
            }
        },

        async initializeElevatorContracts() {
            console.log(`SECTF: initializeElevatorContracts()`);
            if (this.currentRoom == null) { throw new Error("No room"); }
            _elevatorContracts = [];
            for (let i=0; i<this.currentRoom.elevators.length; i++) {
                try {
                    console.log(`- Initializing Elevator ${this.currentRoom.elevators[i]}`);
                    let _contract = new Contract(this.currentRoom.elevators[i], ELEVATOR_INTERFACE_ABI, _ethereumStore.ethersSigner);
                    _elevatorContracts.push(_contract);
                } catch (err) {
                    throw new Error("Could not create Elevator contract");
                }
            }
        },

        async sendIdToPeers() {
            console.log(`SECTF: sendIdToPeers()`);
            if (this.gameInternalStatus == 1) {
                let ts = Date.now();                    
                let hashedTimestampAddress = utils.solidityKeccak256(['uint160','uint256'], [_ethereumStore.address, ts]);
                let signedTimestampAddress = await _offchainSigner.signMessage(utils.arrayify(hashedTimestampAddress));
                _sendMessage({ type: "id", data: { address: _ethereumStore.address, timestamp: ts, signature: signedTimestampAddress }});
            }
        },

        async getMessage(message, peerId) {
            console.log(`SECTF: getMessage(${message.type}, ${peerId})`);
            console.log(`gameInternalStatus: ${this.gameInternalStatus}`);

            if (this.gameInternalStatus == 1 && message.type == "id" && !(peerId in this.gamePeers)) {
                try {
                    let timeDiff = Math.abs(Date.now() - message.data.timestamp);
                    if (timeDiff < 10000) {
                        let receivedAddress = utils.getAddress(message.data.address);
                        let playerNumber = this.currentRoom.players.indexOf(receivedAddress);
                        if (playerNumber >= 0) {
                            let hashedTimestampAddress = utils.solidityKeccak256(['uint160','uint256'], [message.data.address, message.data.timestamp]);
                            let signerAddress = utils.verifyMessage(utils.arrayify(hashedTimestampAddress), message.data.signature);
                            if (signerAddress == this.currentRoom.offchainPublicKeys[playerNumber]) {

                                this.gamePeers[peerId] = {
                                    playerNumber: playerNumber,
                                    address: receivedAddress
                                }
                                this.gamePeersOnline[playerNumber] = true;
                                console.log(` > Player #${playerNumber} (${receivedAddress}) joined the game`);
                                
                                if (Object.keys(this.gamePeers).length == (this.currentRoom.numberOfPlayers - 1)) {
                                    this.gameInternalStatus = 2;
                                    
                                    setTimeout(() => {
                                        if (this.gameLastCheckpoint == null && this.gameTempCheckpoint == null) {
                                            return this.gameInternalStatus == -2;
                                        }
                                        _sendMessage({type: "sync_checkpoint", data: (this.gameTempCheckpoint == null)?this.gameLastCheckpoint:this.gameTempCheckpoint});
                                    }, 1000);
                                } else {
                                    if (this.gameLastCheckpoint != null || this.gameTempCheckpoint != null) {
                                        this.gamePeersTurnMode = new Array(this.currentRoom.numberOfPlayers).fill(0);
                                        this.gameInternalStatus = 1;
                                    } else {
                                        this.gameInternalStatus = -1;
                                        this.leave();
                                    }
                                }
                                
                                this.sendIdToPeers();

                            } else { console.log(` > id rejected because provided signature could not be verified`); }
                        } else { console.log(` > id rejected because address has not joined the room`); }
                    } else { console.log(` > id rejected because timestamp is too old`); }
                } catch(err) {
                    console.log(err);
                }
            } else if (this.gameInternalStatus == 2 && message.type == "sync_turn_mode") {

                const senderPlayerNumber = this.gamePeers[peerId].playerNumber;
                this.gamePeersTurnMode[senderPlayerNumber] = message.data;
                console.log(` - Player ${senderPlayerNumber} switch turn mode to: ${message.data}`);
                
            } else if (this.gameInternalStatus > 1 && message.type == "sync_checkpoint") {
                try {

                    if (this.gameTempCheckpoint == null && this.gameLastCheckpoint == null) {
                        console.log("NO CHECKPOINTS!");
                        this.gameInternalStatus = -1;
                        return this.leave();
                    }

                    //01. First, check if the hash is accurate
                    let checkpointData = JSON.parse(JSON.stringify(message.data.data));
                    let checkpointHash = this.getCheckpointHash(checkpointData);

                    if (message.data.hash != checkpointHash) {
                        console.log("WRONG HASH");
                        return;
                    }

                    const senderPlayerNumber = this.gamePeers[peerId].playerNumber;
                    let validSignatures = [];

                    if (!message.data.on_chain) {
                        //02. Then, verify all provided signatures
                        for (let i=0; i<message.data.signatures.length; i++) {
                            if (message.data.signatures[i] != null) {
                                let signerAddress = utils.verifyMessage(utils.arrayify(checkpointHash), message.data.signatures[i]);
                                if (signerAddress == this.currentRoom.offchainPublicKeys[i]) { 
                                    validSignatures.push(i);
                                } else {
                                    console.log("INVALID SIGNATURE");
                                    return;
                                }
                            }
                        }

                        //03. Finally, verify that whoever sent the message has signed it
                        
                        if (!validSignatures.includes(senderPlayerNumber)) {
                            console.log("NOT SIGNED BY SENDER");
                            return;
                        }

                        console.log(`Player ${senderPlayerNumber} provided a correct hash for off-chain turn ${checkpointData.turn} with ${validSignatures.length} valid signatures`);
                    } else {
                        console.log(`Player ${senderPlayerNumber} provided an unsigned supposedly on-chain turn ${checkpointData.turn} with a correct hash`);
                    }


                    // I. ON-CHAIN CHECKPOINT > MOST RECENT CHECKPOINT (OF ANY KIND)
                    //       - First, obtain the last checkpoint from the blockchain.
                    //       - A. If blockchain's turn == the received turn, finish
                    //       - B. If blockchain's turn < the received turn, ask for retry

                    // II. OFF-CHAIN, PARTIALLY SIGNED CHECKPOINT > LAST CHECKPOINT (BY EXACTLY 1) ** NORMAL STATE-CHANNEL BEHAVIOUR ** 
                    //   - Players start with no full checkpoint, only temp checkpoint with their own signature
                    //   - They send each other their temp checkpoint until they all have all signatures
                    //   - Once fully signed, the temp checkpoint is saved on local storage and 'readyForNextCheckpoint' is set to true
                    //   - A new temp checkpoint is created for turn + 1. All players calculate it separately.
                    //   - They send it partially signed and the whole process repeats

                    // Conflicts and Resolutions:
                    //   III. OFF-CHAIN PARTIALLY SIGNED CHECKPOINT > TEMP CHECKPOINT (BY MORE THAN 1)
                    //       - Request a full state from other players with `sync_checkpoint_full_request`
                    //            - Other players receive this message and send their last full checkpoint
                    //   IV. PARTIALLY SIGNED CHECKPOINT < TEMP CHECKPOINT
                    //       - Some player is behind. Send them the last fully signed checkpoint
                    //   V. FULLY SIGNED, NEWER CHECKPOINT
                    //      - If newer (> tempCheckpoint && >lastCheckpoint), this checkpoint is saved to storage and 'readyForNextCheckpoint' is set to true
                    //      - This could happen as a result of lost storage.

                    if (message.data.on_chain) {

                        if ((this.gameTempCheckpoint != null && checkpointData.turn >= this.gameTempCheckpoint.data.turn) ||
                            (this.gameTempCheckpoint == null && checkpointData.turn >= this.gameLastCheckpoint.data.turn)) {

                            await this.getCheckpointFromBlockchain();
                            
                            if (this.gameLastCheckpoint < checkpointData.turn) {
                                _sendMessage({type: "sync_checkpoint_full_request", data: null});
                            }
                        }

                    } else {

                        if (validSignatures.length < this.currentRoom.numberOfPlayers) {

                            //I. PARTIALLY SIGNED CHECKPOINT == TEMP CHECKPOINT OR EXATLY +1 FROM LAST CHECKPOINT
                            if ((this.gameTempCheckpoint != null && checkpointData.turn == this.gameTempCheckpoint.data.turn) ||
                                (checkpointData.turn == (this.gameLastCheckpoint.data.turn + 1))) {

                                console.log(" -> I. PARTIALLY SIGNED CHECKPOINT == TEMP CHECKPOINT OR EXATLY +1 FROM LAST CHECKPOINT");

                                if (this.gameTempCheckpoint == null || (this.gameTempCheckpoint != null && this.gameLastCheckpoint.data.turn == this.gameTempCheckpoint.data.turn)) {
                                    await this.createOffChainTempCheckpoint(false);
                                }

                                if (this.gameTempCheckpoint != null) {
                                    if (checkpointHash == this.gameTempCheckpoint.hash) {
                                        console.log("   - Adding signatures to my local temp checkpoint");
                                        this.addTempCheckpointSignatures(message.data.signatures);
                                    } else {
                                        console.log("CONSENSUS BROKEN... settle on chain...");
                                        console.log(this.gameTempCheckpoint.data);
                                        console.log(checkpointData);
                                        

                                    }
                                } else {
                                    console.log("CONSENSUS BROKEN... settle on chain...");
                                }

                            //NEW CASE: RECEIVED PARTIAL CHECKPOINT WHEN PLAYER HAS FULLY SIGNED CHECKPOINT
                            } else if (checkpointData.turn == this.gameLastCheckpoint.data.turn) {

                                console.log(" -> Ib. PARTIAL CHECKPOINT == LAST FULLY SIGNED CHECKPOINT");
                                _sendMessage({type: "sync_checkpoint", data: this.gameLastCheckpoint});

                            //II. PARTIALLY SIGNED CHECKPOINT > TEMP CHECKPOINT (BY MORE THAN 1)
                            } else if ((this.gameTempCheckpoint != null && checkpointData.turn > this.gameTempCheckpoint.data.turn) ||
                                    (checkpointData.turn > this.gameLastCheckpoint.data.turn)) {

                                console.log(" -> II. PARTIALLY SIGNED CHECKPOINT > TEMP CHECKPOINT (BY MORE THAN 1)");

                                await this.getCheckpointFromBlockchain();

                                console.log("   - Finished requesting turn from blockchain...");

                                if (this.gameTempCheckpoint != null) {

                                    console.log(`   My temp: ${this.gameTempCheckpoint.data.turn}, Received: ${checkpointData.turn}`);

                                    if (checkpointData.turn == this.gameTempCheckpoint.data.turn) {
                                        if (checkpointHash == this.gameTempCheckpoint.hash) {
                                            this.addTempCheckpointSignatures(message.data.signatures);
                                        }
                                    } else if (checkpointData.turn < this.gameTempCheckpoint.data.turn) {
                                        _sendMessage({type: "sync_checkpoint", data: this.gameTempCheckpoint});
                                    }
                                } else {
                                    console.log("   - Requesting full checkpoint...");
                                    _sendMessage({type: "sync_checkpoint_full_request", data: null});
                                }

                            //III. PARTIALLY SIGNED CHECKPOINT < TEMP CHECKPOINT
                            } else if ((this.gameTempCheckpoint != null && checkpointData.turn < this.gameTempCheckpoint.data.turn) ||
                                (checkpointData.turn < this.gameLastCheckpoint.data.turn)) {

                                    console.log(" -> III. PARTIALLY SIGNED CHECKPOINT < TEMP CHECKPOINT");

                                    if (this.gameLastCheckpoint != null) {
                                        _sendMessage({type: "sync_checkpoint", data: this.gameLastCheckpoint});
                                    }
                            }

                        //IV. FULLY SIGNED, NEWER CHECKPOINT
                        } else if ((validSignatures.length == this.currentRoom.numberOfPlayers) && (
                                (this.gameLastCheckpoint == null) ||
                                (this.gameTempCheckpoint != null && checkpointData.turn >= this.gameTempCheckpoint.data.turn) ||
                                (this.gameLastCheckpoint != null && checkpointData.turn > this.gameLastCheckpoint.data.turn))) {

                            console.log(" -> IV. FULLY SIGNED, NEWER CHECKPOINT");

                            let storedGameData = this.getLocalStorage();
                            let _newGameLastCheckpoint = JSON.parse(JSON.stringify(message.data));
                            storedGameData.checkpoint = _newGameLastCheckpoint;
                            localStorage.setItem(this.localKeyGameRoom, JSON.stringify(storedGameData));
                            this.gameLastCheckpoint = _newGameLastCheckpoint;
                            if (this.gameTempCheckpoint != null && (this.gameTempCheckpoint.data.turn <= this.gameLastCheckpoint.data.turn)) {
                                this.gameTempCheckpoint = null;
                            }
                        } else {
                            console.log("WTF");
                            console.log(this.gameTempCheckpoint);
                            console.log(this.gameLastCheckpoint);
                            console.log(checkpointData);
                        }
                    }

                } catch (err) {
                    console.log(err);
                    this.gameInternalStatus = -1;
                    this.leave();
                }

            } else if (message.type == "sync_checkpoint_full_request") {
                setTimeout(() => {
                    if (this.gameLastCheckpoint != null) {
                        _sendMessage({type: "sync_checkpoint", data: this.gameLastCheckpoint});
                    }
                    if (this.gameTempCheckpoint != null) {
                        _sendMessage({type: "sync_checkpoint", data: this.gameTempCheckpoint});
                    }
                }, 1000);
            }
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
                //this.$patch({ ..._resetState });
            }
            _elevatorContracts = [];
            _offchainSigner = null;
            _sendMessage = null;
            _getMessage = null;
            if (_turnLoop != null) {
                clearInterval(_turnLoop);
            }
        }
    }
});