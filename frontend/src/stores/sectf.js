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
    currentRoom: null,
    currentRoomPlayerNumber: null,

    gameInternalStatus: null,
    gameLastCheckpoint: null,
    gamePeers: {},
    gameBlockchainInteraction: false,

    playingTurnsOnChain: false,
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

            await this.loadActiveRooms();
        },

        reset() {
            console.log("SECTF: reset()");
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

                if (gameState[0].status == 1 || gameState[0].status == 2) {

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

                    this.$patch({
                        loadingRoom: false,
                        currentRoomId: id,
                        currentRoomJoined: playerJoined,
                        currentRoomLostKeys: privateKeyLost,
                        currentRoomStatus: gameState[0].status,
                        currentRoom: room,
                        currentRoomPlayerNumber: playerJoined?playerNumber:null
                    });

                } else {
                    this.$patch({
                        loadingRoom: false,
                        currentRoomId: id,
                        currentRoomJoined: null,
                        currentRoomLostKeys: null,
                        currentRoomStatus: gameState[0].status,
                        currentRoom: null,
                        currentRoomPlayerNumber: null
                    });
                }
            } catch (err) {
                await this.loadActiveRooms();
                this.$patch({
                    loadingRoom: false,
                    currentRoomId: null,
                    currentRoomJoined: null,
                    currentRoomLostKeys: null,
                    currentRoomStatus: null,
                    currentRoom: null,
                    currentRoomPlayerNumber: null
                });
            }
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

        async playOnChain(turns) {
            console.log(`SECTF: playTurnsOnChain(${turns})`);
            if (this.currentRoomId == null || this.currentRoomStatus != 2) { return null; }

            this.playingTurnsOnChain = true;

            try {
                let txReceipt = await _solidityElevatorCTFContract.play(this.currentRoomId, turns);
                await txReceipt.wait();
                
                //TODO: Reload game? Create new Checkpoint?

                this.playingTurnsOnChain = false;
                return true;
            } catch (err) {
                this.playingTurnsOnChain = false;
                return null;
            }
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
                    [ "uint256", "uint16", "uint8", "uint8[]", "uint64[2]", "uint8",
                      "tuple(address, uint8, uint8, uint8, uint8, uint8[], uint8[], uint32, uint8, uint16, bytes32)[]",
                      "tuple(uint8[])[]" ],
                    [   
                        this.currentRoomId,
                        data.turn,
                        data.status,
                        data.indices,
                        data.randomSeed,
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
            
            //02. TODO: If a checkpoint was stored, validate it and load it. Delete if invalid.
            if (storedCheckpoint != null) {
                try {
                    let storedCheckpointHash = this.getCheckpointHash(storedCheckpoint.data);

                    for (let i=0; i<storedCheckpoint.signatures.length; i++) {
                        if (storedCheckpoint.signatures[i] == null) { throw new Error("Unsigned Checkpoint"); }
                        let signerAddress = utils.verifyMessage(utils.arrayify(storedCheckpointHash), storedCheckpoint.signatures[i]);
                        if (signerAddress != this.currentRoom.offchainPublicKeys[i]) { throw new Error("Wrong Signature"); }
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

            //03. TODO: Now check if th blockchain state is not further into the game (> turn)            
            let _gameState = await _solidityElevatorCTFContract.getGameState(this.currentRoomId);

            if (this.gameLastCheckpoint == null || this.gameLastCheckpoint.data.turn < _gameState[0].turn) {

                let _checkpointFromRemote = _gameStore.buildCheckpointFrom(_gameState);
                let _checkpointHash = this.getCheckpointHash(_checkpointFromRemote);
                let _hashedCheckpointSignature = await _offchainSigner.signMessage(utils.arrayify(_checkpointHash));
                
                let _signatures = [];
                for (let i=0; i<this.currentRoom.numberOfPlayers; i++) {
                    _signatures.push(null);
                }
                storedGameData.checkpoint = {
                    data: _checkpointFromRemote,
                    hash: _checkpointHash,
                    signatures: _signatures
                };
                storedGameData.checkpoint.signatures[this.currentRoomPlayerNumber] = _hashedCheckpointSignature;
                this.gameLastCheckpoint = storedGameData.checkpoint;
                
                localStorage.setItem(this.localKeyGameRoom, JSON.stringify(storedGameData));
                console.log("       - Updated Checkpoint from blockchain state");
            }

            //04. Connect with other player via WebRTC and exchange signed ids before beginning sync
            this.gameInternalStatus = 1;
            
            _trysteroRoom = joinRoom({ appId: this.contractAddress }, this.currentRoomId);

            [_sendMessage, _getMessage] = _trysteroRoom.makeAction('message');
            _getMessage((data, peer) => this.getMessage(data, peer));

            _trysteroRoom.onPeerJoin(async () => {
                if (this.gameInternalStatus == 1) {
                    let ts = Date.now();                    
                    let hashedTimestampAddress = utils.solidityKeccak256(['uint160','uint256'], [_ethereumStore.address, ts]);
                    console.log(hashedTimestampAddress, typeof hashedTimestampAddress);
                    
                    let signedTimestampAddress = await _offchainSigner.signMessage(utils.arrayify(hashedTimestampAddress));
                    console.log(signedTimestampAddress, typeof signedTimestampAddress);

                    _sendMessage({ type: "id", data: { address: _ethereumStore.address, timestamp: ts, signature: signedTimestampAddress }});
                }
            });

            _trysteroRoom.onPeerLeave((peerId) => {
                if (peerId in this.gamePeers) {
                    console.log(` > Player #${this.gamePeers[peerId].playerNumber} (${this.gamePeers[peerId].address}) left the game`);
                    let newPeers = {...this.gamePeers };
                    delete newPeers[peerId];
                    this.gamePeers = { ...newPeers };
                    this.updatePlayers();
                }
            });
        },

        async getMessage(message, peerId) {
            console.log("SECTF: getMessage()");

            if (this.gameInternalStatus == 1 && message.type == "id") {
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
                                console.log(` > Player #${playerNumber} (${receivedAddress}) joined the game`);
                                this.updatePlayers();
                            } else { console.log(` > id rejected because provided signature could not be verified`); }
                        } else { console.log(` > id rejected because address has not joined the room`); }
                    } else { console.log(` > id rejected because timestamp is too old`); }
                } catch(err) {
                    console.log(err);
                }
            } else if (this.gameInternalStatus == 2 && message.type == "sync_checkpoint") {
                try {
                    //01. First, validate the signature
                    let receivedCheckpoint = JSON.parse(JSON.stringify(message.data.data));
                    
                    const otherPlayerNumber = this.gamePeers[peerId].playerNumber;

                    






                    //02. Then, make sure that the checkpoint is equal to the user's stored checkpoint
                    if (verify.hashedData != this.gameCheckpoint.hash) {
                        
                        //03. If received checkpoint is different from the one stored, first decode the turn number
                        let _checkpoint = _gameStore.decodeCheckpoint(receivedCheckpoint);

                        //04. If the turn is equal to the local current state, verify, sign and save
                        if (_checkpoint.turn == (_gameStore.turn - 1)) {

                            let lastActionHash = this.gameActions[this.gameActions.length - 1].hash;
                            let checkpoint = _gameStore.encodeCheckpoint(lastActionHash);
                            let signedCheckpoint = TuxitCrypto.sign(checkpoint, _keyPairs[this.playerNumber]);

                            if (signedCheckpoint.hashedData == message.data.hash) {
                                message.data.signatures[this.playerNumber] = signedCheckpoint.signature;
                                this.gameCheckpoint = JSON.parse(JSON.stringify(message.data));

                                let storedGameData = this.getLocalStorage();
                                storedGameData.checkpoint = this.gameCheckpoint;
                                localStorage.setItem(this.localKeyGameRoom, JSON.stringify(storedGameData));

                                this.gameRequireCheckpoint = (_gameStore.turn - this.gameCheckpoint.turn > TURNS_FOR_CHECKPOINT);
                            } else {
                                //TODO: Consensus error!
                                this.gameStatus = -1;
                            }

                        } else if (_checkpoint.turn >= (_gameStore.turn - 1)) {

                            //TODO: If received checkpoint tun is greater than local current state:
                            //      1) Verify, sign, save and update if it has 2 signatures
                            //      2) Request a resync if it only has one

                        } else {
                            sendNewCheckpoint();
                        }

                    } else {
                        //04. If hash is the same, make sure the opponent's signature is stored
                        if (this.gameCheckpoint.signatures[otherPlayerNumber].length == 0 || 
                            this.gameCheckpoint.signatures[otherPlayerNumber][0] != message.data.signatures[otherPlayerNumber][0] ||
                            this.gameCheckpoint.signatures[otherPlayerNumber][1] != message.data.signatures[otherPlayerNumber][1]) {
                                this.gameCheckpoint.signatures[otherPlayerNumber] = message.data.signatures[otherPlayerNumber];
                                let storedGameData = this.getLocalStorage();
                                storedGameData.checkpoint = this.gameCheckpoint;
                                localStorage.setItem(this.localKeyGameRoom, JSON.stringify(storedGameData));
                    }}
                    
                    //04. Once last Checkpoint is synced, continue syncing action data
                    if (this.gameStatus == 3) {
                        this.gameStatus = 4;
                        setTimeout(() => {
                            if (this.gameCheckpoint == null) { return this.gameStatus == -3; }
                            _sendMessage({type: "sync_actions", data: this.gameActions});
                        }, 1000);
                    }
                    */
                } catch (err) {
                    console.log(err);
                    this.gameLastCheckpoint = null;
                    this.gameStatus = -2;
                }
            }
        },

        async updatePlayers() {
            console.log("SECTF: updatePlayers()");
            if (Object.keys(this.gamePeers).length == (this.currentRoom.numberOfPlayers - 1)) {
                this.gameInternalStatus = 2;
                setTimeout(() => {
                    if (this.gameLastCheckpoint == null) { return this.gameInternalStatus == -2; }
                    _sendMessage({type: "sync_checkpoint", data: this.gameLastCheckpoint});
                }, 1000);
            } else {
                this.gameInternalStatus = 1;
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
                this.$patch({ ..._resetState });
            }
            _offchainSigner = null;
            _sendMessage = null;
            _getMessage = null;
        }
    }
});