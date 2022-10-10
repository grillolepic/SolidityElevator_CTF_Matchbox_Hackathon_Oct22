<script setup>
    import { useSECTFStore } from '@/stores/sectf';
    import { defineEmits } from '@vue/runtime-core';

    const SECTFStore = useSECTFStore();

    const emit = defineEmits(['playPause']);

    function floorClass(floor) {
        let _classes = {};
        _classes[`bg-${8-floor}`] = true;
        _classes[`height-${SECTFStore.currentRoom.floors}`] = true;
        return _classes;
    }

    function shortAddress(address, len) {
      if (address.length == 0) { return ""; }
      return `${address.substring(0,Math.floor(len/2))}...${address.substring(address.length-Math.floor(len/2))}`;
    }

    //STYLE FUNCTIONS

    function elevatorStyle(e) {
        let totalHeight = (SECTFStore.currentRoom.floors - 1) * 100;
        let currentPosition = SECTFStore.gameLastCheckpoint.data.elevators[e-1].y;
        let currentPct = currentPosition/totalHeight;
        let currentBottom = (floorHeight() * (SECTFStore.currentRoom.floors-1)) * currentPct;

        return `width: ${floorHeight()}px; height: ${floorHeight()}px; bottom: ${currentBottom}px;`;
    }

    function floorHeight() {
        let gameHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--game-height'));
        let floorsProportional = SECTFStore.currentRoom.floors * 3;
        let total = floorsProportional + 4;
        let proportionDivision = 3 / total;
        return gameHeight * proportionDivision;
    }

    function gameWidth() {
        return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--game-width'));
    }

    function infoRowHeightStyle() { return `height: ${floorHeight() * (2/3)}px;`; }
    
    function floorHeightStyle() { return `height: ${floorHeight()}px;`; }
    function allFloorsHeightStyle() { return `height: ${floorHeight() * SECTFStore.currentRoom.floors}px;`; }

    function floorNumberSectionStyle() { return `font-size: ${floorHeight() * 1.1}px; line-height: ${floorHeight() * 1.1}px; width: ${gameWidth()/10}px;`; }
    function passengersSectionStyle() { return `width:${gameWidth() * (9/10) / 3}px;`; }
    function elevatorSectionStyle() { return `width:${gameWidth() * (9/10) * (2/3)}px;`; }
    function floorAndPassengersSectionStyle() { return `width: ${gameWidth()/10 + (gameWidth() * (9/10) / 3)}px;` }

    function passengerInElevatorStyle() {
        return `width: ${floorHeight() / 3.5}px; height: ${floorHeight() / 3.5}px; font-size: ${floorHeight() / 4}px; margin: ${floorHeight() / 30}px;`;
    }

    function elevatorWidth() { return `width: ${floorHeight()}px;`; }

    function lightContainerHeight() { return `height: ${floorHeight() * 0.2}px;)`; }
    function lightStyle() { return `font-size: ${floorHeight() * 0.18}px; width: ${floorHeight() / 5}px;`; }
    function passengerContainerStyle() { return `width: ${floorHeight()}px; height: ${floorHeight() * 0.8}px;`; }
    function doorsContainerStyle() { return `width: ${floorHeight()}px; height: ${floorHeight() * 0.8}px;`; }
    function doorStyle() { return `width: ${floorHeight() / 2}px; height: ${floorHeight() * 0.8}px;`; }

    function turnButtonClick() {
        if (SECTFStore.currentRoomStatus == 2 || !SECTFStore.gameBlockchainInteraction || SECTFStore.gameInternalStatus != 2) {
            emit("playPause");
        }
    }
</script>

<template>

    <!-- LAYER: BACKGROUND COLORS-->
    <div class="floorsContainer flex column flex-center" style="z-index: 0">
        <div :style="infoRowHeightStyle()"></div>
        <div :style="floorHeightStyle()" id="colorBackground" class="floor flex row flex-center" :class="floorClass(f)" v-for="f in SECTFStore.currentRoom.floors" :key="f">
        </div>
        <div :style="infoRowHeightStyle()"></div>
    </div>

    <!-- LAYER: FLOOR NUMBERS AND WAITING PASSANGERS-->
    <div class="floorsContainer limitWidth flex column flex-center" style="z-index: 1">
        <div :style="infoRowHeightStyle()"></div>
        <div :style="floorHeightStyle()" id="floorNumbers" class="floor flex row flex-center" v-for="f in SECTFStore.currentRoom.floors" :key="f">
            <div :style="floorNumberSectionStyle()" class="floorNumber w-700 noSelect">{{(SECTFStore.currentRoom.floors+1)-f}}</div>
            <div :style="passengersSectionStyle()">
                <TransitionGroup tag="div" name="passengers-animation" class="waitingPassengerContainer flex row" >
                    <div :style="passengerInElevatorStyle()" class="passenger flex flex-center"  v-for="passenger in SECTFStore.gameLastCheckpoint.data.floorPassengers[(SECTFStore.currentRoom.floors)-f]" :key="passenger">{{passenger+1}}</div>
                </TransitionGroup>
            </div>
            <div :style="elevatorSectionStyle()"></div>
        </div>
        <div :style="infoRowHeightStyle()"></div>
    </div>

    <!-- LAYER: TOP AND BOTTOM INFO LABELS-->
    <div class="floorsContainer limitWidth flex column flex-center" style="z-index: 10">
        <div :style="infoRowHeightStyle()" class="flex row flex-center" style="align-items: flex-end;">
            <div :style="floorAndPassengersSectionStyle()"> </div>
            <div :style="elevatorSectionStyle()" class="elevatorsAddressRow flex row flex-center">
                <div class="elevatorsAddressColumn flex column flex-center" v-for="p in SECTFStore.currentRoom.numberOfPlayers" :key="p">
                    <div id class="flex row flex-center">
                        <div class="onlineIndicator" :class="{'red':!SECTFStore.gamePeersOnline[p-1], 'green':SECTFStore.gamePeersOnline[p-1]}"></div>
                        <div class="displayElevatorNumber">Elevator {{p}}</div>
                        <div class="playPauseIndicator containNoRepeatCenter" :class="{ 'play': SECTFStore.gamePeersTurnMode[p-1] == 1, 'pause': SECTFStore.gamePeersTurnMode[p-1] == 0 }"></div>
                    </div>
                    <id class="displayAddress">{{shortAddress(SECTFStore.currentRoom.players[p-1], 20)}}</id>
                </div>
            </div>
        </div>
        <div :style="allFloorsHeightStyle()"></div>
        <div :style="infoRowHeightStyle()" class="flex row flex-center">
            <div :style="floorAndPassengersSectionStyle()" class="flex row">

                <div id="playPauseButton" class="containNoRepeatCenter" @click="turnButtonClick()"
                    :class="{ 'playing': SECTFStore.automaticPlaying, 'notPlaying': !SECTFStore.automaticPlaying, 'disabled': (SECTFStore.currentRoomStatus != 2 || SECTFStore.gameBlockchainInteraction || SECTFStore.gameInternalStatus != 2)}"></div>

                <div class="flex column">
                    <id class="turnNumber">TURN {{SECTFStore.gameLastCheckpoint.data.turn}}</id>
                    <id class="blockchainTurnInfo">Last Blockchain Turn: {{SECTFStore.gameLastBlockchainTurn}}</id>
                </div>
            </div>
            <div :style="elevatorSectionStyle()" class="elevatorsAddressRow flex row flex-center">
                <div class="elevatorsAddressColumn flex column flex-center" v-for="p in SECTFStore.currentRoom.numberOfPlayers" :key="p">
                    <div class="flex row flex-center">
                        <div class="scoreIcon containNoRepeatCenter"></div>
                        <id class="elevatorScore">{{SECTFStore.gameLastCheckpoint.data.elevators[p-1].score}}</id>
                    </div>
                    <div class="flex row flex-center">
                        <div class="balanceIcon containNoRepeatCenter"></div>
                        <id class="elevatorInfoDataLabel">{{SECTFStore.gameLastCheckpoint.data.elevators[p-1].balance}}</id>
                        <div class="speedIcon containNoRepeatCenter"></div>
                        <id class="elevatorInfoDataLabel">{{SECTFStore.gameLastCheckpoint.data.elevators[p-1].speed}}</id>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- LAYER: ELEVATOR SHADOW PATHS-->
    <div class="floorsContainer limitWidth flex column flex-center" style="z-index: 2">
        <div :style="infoRowHeightStyle()"></div>
        <div class="floor flex row strech" :style="`flex:${SECTFStore.currentRoom.floors * 3}`">
            <div :style="floorNumberSectionStyle()"></div>
            <div :style="passengersSectionStyle()"></div>
            <div :style="elevatorSectionStyle()" class="elevatorsAddressRow flex row strech">
                <div class="flex column flex-center" v-for="p in SECTFStore.currentRoom.numberOfPlayers" :key="p">
                    <div class="elevatorShadowBg" :style="elevatorWidth()"></div>
                </div>
            </div>
        </div>
        <div :style="infoRowHeightStyle()"></div>
    </div>

    <!-- LAYER: ELEVATORS-->
    <div class="floorsContainer limitWidth flex column flex-center" style="z-index: 3">
        <div :style="infoRowHeightStyle()"></div>
        <div :style="allFloorsHeightStyle()" class="floor flex row strech">
            <div :style="floorNumberSectionStyle()"></div>
            <div :style="passengersSectionStyle()"></div>
            <div :style="elevatorSectionStyle()" class="elevatorsAddressRow flex row strech">
                <div class="flex column elevatorsColumn" v-for="p in SECTFStore.currentRoom.numberOfPlayers" :key="p">
                    <div :style="elevatorStyle(p)" class="elevator" >
                        <div :style="lightContainerHeight()" class="elevatorLightContainer flex row flex-center" >
                            <div :style="lightStyle()" class="elevatorLight" :class="{'green': SECTFStore.gameLastCheckpoint.data.elevators[p-1].light == 1}">▲</div>
                            <div :style="lightStyle()" class="elevatorLight" :class="{'red': SECTFStore.gameLastCheckpoint.data.elevators[p-1].light == 2}">▼</div>
                        </div>
                        <TransitionGroup :style="passengerContainerStyle()" tag="div" name="passengers-animation" class="elevatorPassengerContainer flex row" >
                            <div class="passenger flex flex-center" :style="passengerInElevatorStyle()" v-for="pngr in SECTFStore.gameLastCheckpoint.data.elevators[p-1].passengers.length" :key="pngr">{{SECTFStore.gameLastCheckpoint.data.elevators[p-1].passengers[pngr-1]+1}}</div>
                        </TransitionGroup>
                        <div :style="doorsContainerStyle()" class="elevatorDoorsContainer" style="z-index:4">
                            <div :style="doorStyle()" class="door" style="left:0px;" :class="{'openDoors': [3,5].includes(SECTFStore.gameLastCheckpoint.data.elevators[p-1].status) }"></div>
                            <div :style="doorStyle()" class="door" style="right:0px" :class="{'openDoors': [3,5].includes(SECTFStore.gameLastCheckpoint.data.elevators[p-1].status) }"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div :style="infoRowHeightStyle()"></div>
    </div>




</template>

<style scoped>
    .floorsContainer {
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0px;
        justify-content: start;
    }

    .floor { width: 100%; }

    .floorNumber {
        color: var(--white);
        text-align: left;
    }

    .elevatorsAddressRow {
        justify-content: space-around;
        text-align: center;
    }

    .elevatorShadowBg {
        background-color: #00000030;
        height: 100%;
    }

    .elevatorsColumn { justify-content: flex-end; }

    .elevator {
        background-color: var(--dark-blue);
        transition-duration: 1s;
    }

    .turnNumber {
        font-size: 24px;
        line-height: 28px;
        font-weight: 700;
        margin-top: 7px;
    }
    .blockchainTurnInfo {
        font-size: 10px;
        color: var(--dark-grey);
    }

    .onlineIndicator {
        border-radius: 100px;
        width: 8px;
        height: 8px;
        margin-right: 4px;
   }

    .displayElevatorNumber {
        font-size: 18px;
        font-weight: 700;
        text-transform: uppercase;
    }

    .displayAddress {
        font-size: 10px;
        font-weight: 500;
        margin-bottom: 10px;
    }

    .playPauseIndicator {
        width: 12px;
        height: 12px;
        margin-left: 5px;
        position: relative;
        top: 0.5px;
        opacity: 0.5;
    }

    .play { background-image: url(img/play.svg);}
    .pause { background-image: url(img/pause.svg);}

    .strech {
        align-items: stretch;
        align-content: stretch;
    }

    .elevatorLightContainer {
        color: white;
        position: absolute;
        width: 100%;
        top: 0px;
    }

    .elevatorLight {
        transition-duration: 250ms;
    }

    .elevatorPassengerContainer {
        flex-wrap: wrap;
        justify-content: space-evenly;
        position: absolute;
        width: 100%;
        bottom: 0px;
    }

    .elevatorDoorsContainer {
        position: absolute;
        width: 100%;
        bottom: 0px;;
    }

    .door {
        background-color: var(--dark-blue);
        transition-duration: 1s;
        position: absolute;
    }

    .openDoors {
        width: 0px !important;
    }

    .passenger {
        background-color: var(--white-mute);
        border-radius: 100px;
        font-size: 2vh;
        font-weight: 700;
    }

    .waitingPassengerContainer {
        flex-wrap: wrap;
        align-items: center;
        justify-content: start;
        justify-items: center;
    }


    .elevatorScore {
        font-size: 24px;
        font-weight: 700;
        line-height: 26px;
    }

    .elevatorInfoDataLabel {
        font-size: 14px;
        font-weight: 400;
        color: var(--dark-grey);
    }
    .speedIcon {
        width: 20px; height: 20px;
        margin-left: 10px;
        background-image: url('img/speed.svg');
    }
    .balanceIcon {
        width: 20px; height: 20px;
        background-image: url('img/balance.svg');
    }
    .scoreIcon {
        width: 15px; height: 15px;
        margin-right: 5px;
        background-image: url('img/score.svg');
    }

    .red { background-color: var(--red); }
    .green {
        background-color: #53fd5b;
        animation: glow 1s infinite alternate;
    }

    @keyframes glow {
    from {
        box-shadow: 0 0 2px -2px #53fd5bb6;
    }
    to {
        box-shadow: 0 0 2px 2px #53fd5bb6;
    }
    }

    .bg-0 { background-color: var(--gradient-0); }
    .bg-1 { background-color: var(--gradient-1); }
    .bg-2 { background-color: var(--gradient-2); }
    .bg-3 { background-color: var(--gradient-3); }
    .bg-4 { background-color: var(--gradient-4); }
    .bg-5 { background-color: var(--gradient-5); }
    .bg-6 { background-color: var(--gradient-6); }
    .bg-7 { background-color: var(--gradient-7); }


    .passengers-animation-move,
    .passengers-animation-enter-active,
    .passengers-animation-leave-active {
    transition: all 0.5s ease;
    }

    .passengers-animation-enter-from,
    .passengers-animation-leave-to {
    opacity: 0;
    transform: scale(0);
    }

    .passengers-animation-leave-active {
    position: absolute;
    }



    #playPauseButton {
        width: 40px;
        height: 40px;
        margin: 10px 10px 0px 0px;
        cursor: pointer;
    }

    .playing {
        background-image: url(img/pause_solo.svg);
        background-color: var(--red);
    }

    .playing:hover{
        background-color: var(--dark-red);
    }

    .notPlaying {
        background-image: url(img/play_solo.svg);
        background-color: var(--play);
    }

    .notPlaying:hover{
        background-color: var(--play-hover);
    }

    .disabled {
        background-image: url(img/play_solo.svg);
        background-color: var(--dark-grey) !important;
        cursor: unset;
    }
    .disabled:hover {
        background-color: var(--dark-grey)
        !important; cursor: unset;
    }

</style>