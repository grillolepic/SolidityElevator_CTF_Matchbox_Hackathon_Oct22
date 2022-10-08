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
    currentRoomRanking: null,
    currentRoom: null,
    currentRoomPlayerNumber: null,

    gameInternalStatus: null,
    gameLastCheckpoint: null,
    gameTempCheckpoint: null,
    readyForNextCheckpoint: false,

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
                            this.loadRoom(id);
                        });

                        _solidityElevatorCTFContract.on(_solidityElevatorCTFContract.filters.GameRoomFinished(id, null), (id, winner) => {
                            console.log(`GameRoom #${id} finished with ${winner} as the winner`);
                            this.loadRoom(id);
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

        async playOnChain(turns) {
            console.log(`SECTF: playTurnsOnChain(${turns})`);
            if (this.currentRoomId == null || this.currentRoomStatus != 2) { return null; }

            if (this.readyForNextCheckpoint) {
                //this.playingTurnsOnChain = true;

                try {
                    let txReceipt = await _solidityElevatorCTFContract.play(this.currentRoomId, turns);
                    await txReceipt.wait();
                    
                    await this.getCheckpointFromBlockchain();

                    //this.playingTurnsOnChain = false;
                    return true;
                } catch (err) {
                    this.playingTurnsOnChain = false;
                    return null;
                }
            }
        },

        async getCheckpointFromBlockchain() {
            console.log(`SECTF: getCheckpointFromBlockchain()`);
            if (this.currentRoomId == null || this.currentRoomStatus != 2) { return null; }

            let _gameState = await _solidityElevatorCTFContract.getGameState(this.currentRoomId);

            if (this.gameLastCheckpoint == null || this.gameLastCheckpoint.data.turn < _gameState[0].turn) {

                let _checkpointFromRemote = _gameStore.buildCheckpointFrom(_gameState);
                let _checkpointHash = this.getCheckpointHash(_checkpointFromRemote);
                let _hashedCheckpointSignature = await _offchainSigner.signMessage(utils.arrayify(_checkpointHash));
                
                let _signatures = [];
                for (let i=0; i<this.currentRoom.numberOfPlayers; i++) {
                    _signatures.push(null);
                }

                let _newTempCheckpoint = {
                    data: _checkpointFromRemote,
                    hash: _checkpointHash,
                    signatures: _signatures
                };
                _newTempCheckpoint.signatures[this.currentRoomPlayerNumber] = _hashedCheckpointSignature;

                if (this.currentRoom.numberOfPlayers > 1) {
                    this.gameTempCheckpoint = _newTempCheckpoint;
                    console.log("       - Created new Temp Checkpoint");

                    if (this.gameInternalStatus >= 2) {
                        _sendMessage({type: "sync_checkpoint", data: this.gameTempCheckpoint});
                    }

                } else {
                    this.gameLastCheckpoint = _newTempCheckpoint;
                    this.readyForNextCheckpoint = true;
                    console.log("       - Created new Checkpoint");
                }
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
            
            //02. If a checkpoint was stored, validate it and load it. Delete if invalid.
            if (storedCheckpoint != null) {
                try {
                    let storedCheckpointHash = this.getCheckpointHash(storedCheckpoint.data);

                    for (let i=0; i<storedCheckpoint.signatures.length; i++) {
                        if (storedCheckpoint.signatures[i] == null) { throw new Error("Unsigned Checkpoint"); }
                        let signerAddress = utils.verifyMessage(utils.arrayify(storedCheckpointHash), storedCheckpoint.signatures[i]);
                        if (signerAddress != this.currentRoom.offchainPublicKeys[i]) { throw new Error("Wrong Signature"); }
                    }

                    this.gameLastCheckpoint = storedCheckpoint;
                    this.readyForNextCheckpoint = true;
                    console.log(" - Found valid checkpoint.");

                } catch (err) {
                    console.log(" - Found invalid checkpoint. Deleted.");
                    storedCheckpoint = null;
                    delete storedGameData.checkpoint;
                    localStorage.setItem(this.localKeyGameRoom, JSON.stringify(storedGameData));
                }
            }

            //03. Now check if th blockchain state is not further into the game (> turn)            
            await this.getCheckpointFromBlockchain();

            //04. Connect with other player via WebRTC and exchange signed ids before beginning sync
            if (this.currentRoom.numberOfPlayers > 1) {
                
                this.gameInternalStatus = 1;
                
                _trysteroRoom = joinRoom({ appId: this.contractAddress }, this.currentRoomId);

                [_sendMessage, _getMessage] = _trysteroRoom.makeAction('message');
                _getMessage((data, peer) => this.getMessage(data, peer));

                _trysteroRoom.onPeerJoin(async () => {
                    if (this.gameInternalStatus == 1) {
                        let ts = Date.now();                    
                        let hashedTimestampAddress = utils.solidityKeccak256(['uint160','uint256'], [_ethereumStore.address, ts]);
                        let signedTimestampAddress = await _offchainSigner.signMessage(utils.arrayify(hashedTimestampAddress));
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
            } else {
                if (this.readyForNextCheckpoint) {
                    this.gameInternalStatus = 3;
                } else {
                    this.gameInternalStatus = -3;
                }
            }
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
            } else if (this.gameInternalStatus > 1 && message.type == "sync_checkpoint") {
                try {

                    if (Object.keys(this.gamePeers).length == this.currentRoom.numberOfPlayers) {
                        this.gameInternalStatus = (this.readyForNextCheckpoint)?3:2;
                    } else {
                        this.gameInternalStatus = 2;
                    }

                    if (this.gameTempCheckpoint == null) {
                        console.log("NO LOCAL TEMP CHECKPOINT");
                        return this.getCheckpointFromBlockchain();
                    }

                    //01. First, check if the hash is accurate
                    let checkpointData = JSON.parse(JSON.stringify(message.data.data));
                    let checkpointHash = this.getCheckpointHash(checkpointData);

                    if (message.data.hash != checkpointHash) {
                        console.log("WRONG HASH");
                        return;
                    }

                    //02. Then, verify all provided signatures
                    let validSignatures = [];
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
                    const otherPlayerNumber = this.gamePeers[peerId].playerNumber;
                    if (!validSignatures.includes(otherPlayerNumber)) {
                        console.log("NOT SIGNED BY SENDER");
                        return;
                    }

                    console.log(`Player ${otherPlayerNumber} provided a correct hash for turn ${checkpointData.turn} with ${validSignatures.length} valid signatures`);

                    // 0. NORMAL FUNCTIONING
                    //   - Players start with no full checkpoint, only temp checkpoint with their own signature
                    //   - They send each other their temp checkpoint until they all have all signatures
                    //   - Once fully signed, the temp checkpoint is saved on local storage and 'readyForNextCheckpoint' is set to true
                    //   - A new temp checkpoint is created for turn + 1. All players calculate it separately.
                    //   - They send it partially signed and the whole process repeats

                    // Conflicts and Resolutions:
                    //   I. FULLY SIGNED, NEWER CHECKPOINT
                    //      - If newer (> tempCheckpoint), this checkpoint is saved to storage and 'readyForNextCheckpoint' is set to true
                    //      - This could happen as a result of lost storage.
                    //   II. PARTIALLY SIGNED CHECKPOINT > TEMP CHECKPOINT
                    //       - The blockchain state might have been updated, check the blockchain first
                    //       - A. If blockchain's turn >= the received turn, sign a new temp state and send it
                    //       - B. If blockchain's turn < the received turn, request a full state from other players with `sync_checkpoint_full_request`
                    //            - Other players receive this message and send their last full checkpoint
                    //   III. PARTIALLY SIGNED CHECKPOINT < TEMP CHECKPOINT
                    //       - Some player is behind. Send them the last fully signed checkpoint

                    //0. NORMAL FUNCTIONING
                    if (checkpointData.turn == this.gameTempCheckpoint.data.turn) {
                        if (checkpointHash == this.gameTempCheckpoint.hash) {

                            let addedSignatures = 0;
                            let totalValidSignatures = 0;
                            for (let i=0; i<this.gameTempCheckpoint.signatures.length; i++) {
                                if (this.gameTempCheckpoint.signatures[i] == null) {
                                    if (message.data.signatures[i] != null) {
                                        this.gameTempCheckpoint.signatures[i] = message.data.signatures[i];
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
                                        gameTempCheckpoint: null,
                                        readyForNextCheckpoint: true
                                    });
                                }
                            }
                        }
                    } else if (checkpointData.turn > this.gameTempCheckpoint.data.turn) {

                        if (validSignatures.length == this.currentRoom.numberOfPlayers) {
                            //I. FULLY SIGNED, NEWER CHECKPOINT
                            let storedGameData = this.getLocalStorage();
                            let _newGameLastCheckpoint = JSON.parse(JSON.stringify(this.gameTempCheckpoint));
                            storedGameData.checkpoint = _newGameLastCheckpoint;
                            localStorage.setItem(this.localKeyGameRoom, JSON.stringify(storedGameData));
                            this.$patch({
                                gameLastCheckpoint: _newGameLastCheckpoint,
                                gameTempCheckpoint: null,
                                readyForNextCheckpoint: true
                            });
                        } else {
                            //II. PARTIALLY SIGNED CHECKPOINT > TEMP CHECKPOINT
                            let _gameState = await _solidityElevatorCTFContract.getGameState(this.currentRoomId);

                            //A.
                            if (_gameState[0].turn >= checkpointData.turn) {
                
                                let _checkpointFromRemote = _gameStore.buildCheckpointFrom(_gameState);
                                let _checkpointHash = this.getCheckpointHash(_checkpointFromRemote);
                                let _hashedCheckpointSignature = await _offchainSigner.signMessage(utils.arrayify(_checkpointHash));
                                
                                let _signatures = [];
                                for (let i=0; i<this.currentRoom.numberOfPlayers; i++) {
                                    _signatures.push(null);
                                }
                
                                _newTempCheckpoint = {
                                    data: _checkpointFromRemote,
                                    hash: _checkpointHash,
                                    signatures: _signatures
                                };
                                _newTempCheckpoint.signatures[this.currentRoomPlayerNumber] = _hashedCheckpointSignature;
                                this.gameTempCheckpoint = _newTempCheckpoint;

                                _sendMessage({type: "sync_checkpoint", data: this.gameTempCheckpoint });
                                
                                console.log("       - Created new Temp Checkpoint from Blockchain state");
                            } else {
                                //B.
                                _sendMessage({type: "sync_checkpoint_full_request", data: null});
                            }
                        }
                    } else {
                        //III. PARTIALLY SIGNED CHECKPOINT < TEMP CHECKPOINT
                        if (this.gameLastCheckpoint != null) {
                            _sendMessage({type: "sync_checkpoint", data: this.gameLastCheckpoint});
                        }
                    }
                } catch (err) {
                    console.log(err);
                    this.gameLastCheckpoint = null;
                    this.gameTempCheckpoint = null;
                    this.gameStatus = -3;
                }

            } else if (message.type == "sync_checkpoint_full_request") {
                if (this.gameLastCheckpoint != null) {
                    _sendMessage({type: "sync_checkpoint", data: this.gameLastCheckpoint});
                }
            }
        },

        async updatePlayers() {
            console.log("SECTF: updatePlayers()");
            if (Object.keys(this.gamePeers).length == (this.currentRoom.numberOfPlayers - 1)) {
                this.gameInternalStatus = 2;
                setTimeout(() => {
                    if (this.gameLastCheckpoint == null && this.gameTempCheckpoint == null) {
                        return this.gameInternalStatus == -2;
                    }
                    _sendMessage({type: "sync_checkpoint", data: (this.gameTempCheckpoint == null)?this.gameLastCheckpoint:this.gameTempCheckpoint});
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