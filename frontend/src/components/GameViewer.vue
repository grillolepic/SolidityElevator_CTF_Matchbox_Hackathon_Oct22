<script setup>
    import { useSECTFStore } from '@/stores/sectf';

    const SECTFStore = useSECTFStore();

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

    function floorNumberFontSize() { return `font-size: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 3)`; }
    function elevatorWidth() { return `width: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 3)`; }
    function lightContainerHeight() { return `height: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 0.7)`; }
    function lightStyle() { return `font-size: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 0.5); width: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 0.5);`; }
    function doorStyle() { return `height: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 2.3); width: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 1.5);`; }
    function passengerContainerStyle() { return `height: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 2.3); width: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 3);`; }
    function doorsContainerStyle() { return `height: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 2.3); width: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 3);`; }
    
    function elevatorStyle(e) {
        let style = "";
        let calcStr = `(80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 3`;

        style += `width: calc(${calcStr});`;
        style += `height: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 3);`;

        let totalHeight = SECTFStore.currentRoom.floors * 100;
        let currentPosition = SECTFStore.gameLastCheckpoint.data.elevators[e-1].y;
        let currentPct = currentPosition/totalHeight;
        let currentFloor = (currentPct * SECTFStore.currentRoom.floors)

        style += `bottom: calc((${calcStr}) * ${currentFloor});`;

        return style;
    }

    function passengerInElevatorStyle() { return `width: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 0.9);
        height: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 0.9);
        font-size: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 0.7);
        margin: calc((80vh / (4 + (${SECTFStore.currentRoom.floors}*3))) * 0.1);`; }

</script>

<template>

    <!-- LAYER: BACKGROUND COLORS-->
    <div class="floorsContainer flex column flex-center" style="z-index: 0">
        <div style="flex:2"></div>
        <div id="colorBackground" class="floor flex row flex-center" v-for="f in SECTFStore.currentRoom.floors" :key="f" :class="floorClass(f)">
        </div>
        <div style="flex:2"></div>
    </div>

    <!-- LAYER: FLOOR NUMBERS AND WAITING PASSANGERS-->
    <div class="floorsContainer limitWidth flex column flex-center" style="z-index: 1">
        <div style="flex:2"></div>
        <div id="floorNumbers" class="floor flex row flex-center" v-for="f in SECTFStore.currentRoom.floors" :key="f">
            <div class="floorNumber w-700 noSelect" :style="floorNumberFontSize()">{{(SECTFStore.currentRoom.floors+1)-f}}</div>
            <div style="flex:5">
                <TransitionGroup tag="div" name="passengers-animation" class="waitingPassengerContainer flex row" >
                    <div class="passenger flex flex-center" :style="passengerInElevatorStyle()" v-for="passenger in SECTFStore.gameLastCheckpoint.data.floorPassengers[(SECTFStore.currentRoom.floors)-f]" :key="passenger">{{passenger+1}}</div>
                </TransitionGroup>
            </div>
            <div :style="`flex:${SECTFStore.currentRoom.numberOfPlayers * 2}`"></div>
        </div>
        <div style="flex:2"></div>
    </div>

    <!-- LAYER: TOP AND BOTTOM INFO LABELS-->
    <div class="floorsContainer limitWidth flex column flex-center" style="z-index: 0">
        <div class="floor flex row flex-center" style="flex:2; align-items: flex-end;">
            <div style="flex:6"></div>
            <div class="elevatorsAddressRow flex row flex-center" :style="`flex:${SECTFStore.currentRoom.numberOfPlayers * 2}`">
                <div class="elevatorsAddressColumn flex column flex-center" v-for="p in SECTFStore.currentRoom.numberOfPlayers" :key="p">
                    <id class="displayElevatorNumber">Elevator {{p}}</id>
                    <id class="displayAddress">{{shortAddress(SECTFStore.currentRoom.players[p-1], 20)}}</id>
                </div>
            </div>
        </div>
        <div class="floor" v-for="f in SECTFStore.currentRoom.floors" :key="f"></div>
        <div style="flex:2"></div>
    </div>

    <!-- LAYER: ELEVATOR SHADOW PATHS-->
    <div class="floorsContainer limitWidth flex column flex-center" style="z-index: 2">
        <div style="flex:2"></div>
        <div class="floor flex row strech" :style="`flex:${SECTFStore.currentRoom.floors * 3}`">
            <div style="flex:6"></div>
            <div class="elevatorsAddressRow flex row strech" :style="`flex:${SECTFStore.currentRoom.numberOfPlayers * 2}`">
                <div class="flex column flex-center" v-for="p in SECTFStore.currentRoom.numberOfPlayers" :key="p">
                    <div class="elevatorShadowBg" :style="elevatorWidth()"></div>
                </div>
            </div>
        </div>
        <div style="flex:2"></div>
    </div>

    <!-- LAYER: ELEVATORS-->
    <div class="floorsContainer limitWidth flex column flex-center" style="z-index: 3">
        <div style="flex:2"></div>
        <div class="floor flex row strech" :style="`flex:${SECTFStore.currentRoom.floors * 3}`">
            <div style="flex:6"></div>
            <div class="elevatorsAddressRow flex row strech" :style="`flex:${SECTFStore.currentRoom.numberOfPlayers * 2}`">
                <div class="flex column elevatorsColumn" v-for="p in SECTFStore.currentRoom.numberOfPlayers" :key="p">
                    <div class="elevator" :style="elevatorStyle(p)">
                        <div class="elevatorLightContainer flex row flex-center" :style="lightContainerHeight()">
                            <div class="elevatorLight" :class="{'red': SECTFStore.gameLastCheckpoint.data.elevators[p-1].light == 2}" :style="lightStyle()">▼</div>
                            <div class="elevatorLight" :class="{'green': SECTFStore.gameLastCheckpoint.data.elevators[p-1].light == 1}" :style="lightStyle()">▲</div>
                        </div>
                        <TransitionGroup tag="div" name="passengers-animation" class="elevatorPassengerContainer flex row" :style="passengerContainerStyle()">
                            <div class="passenger flex flex-center" :style="passengerInElevatorStyle()" v-for="passenger in SECTFStore.gameLastCheckpoint.data.elevators[p-1].passengers" :key="passenger">{{passenger+1}}</div>
                        </TransitionGroup>
                        <div class="elevatorDoorsContainer" style="z-index:4" :style="doorsContainerStyle()">
                            <div class="door" style="left:0px;" :style="doorStyle()" :class="{'openDoors': [3,5].includes(SECTFStore.gameLastCheckpoint.data.elevators[p-1].status) }"></div>
                            <div class="door" style="right:0px" :style="doorStyle()" :class="{'openDoors': [3,5].includes(SECTFStore.gameLastCheckpoint.data.elevators[p-1].status) }"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div style="flex:2"></div>
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
    .limitWidth {
        max-width: 1340px;
    }

    .elevatorsAddressRow {
        flex: 4;
        justify-content: space-evenly;
        text-align: center;
    }

    .displayElevatorNumber {
        font-size: 18px;
        font-weight: 700;
        text-transform: uppercase;
    }

    .displayAddress {
        font-size: 10px;
        font-weight: 500;
        margin-bottom: 5px;
    }

    .floor {
        width: 100%;
        flex: 3;
    }

    .strech {
        align-items: stretch;
        align-content: stretch;
    }

    .elevatorShadowBg {
        background-color: #00000030;
        height: 100%;
    }

    .elevatorsColumn {
        justify-content: flex-end;
    }

    .elevator {
        background-color: var(--dark-blue);
        transition-duration: 1s;
    }

    .floorNumber {
        color: var(--white);
        line-height: 7.5vh;
        text-align: left;
        flex: 1;
    }

    .elevatorLightContainer {
        color: white;
        position: absolute;
        width: 100%;
        top: 0px;
    }

    .elevatorLight {
        transition-duration: 500ms;
    }

    .elevatorPassengerContainer {
        flex-wrap: wrap;
        justify-content: space-evenly;
        position: absolute;
        width: 100%;
        bottom: 1px;;
    }

    .elevatorDoorsContainer {
        position: absolute;
        width: 100%;
        bottom: 1px;;
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


    .red { color: var(--red); }
    .green { color: var(--green); }

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
</style>