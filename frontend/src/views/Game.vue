<script setup>
    import { useSECTFStore } from '@/stores/sectf';
    import { useRouter, onBeforeRouteLeave } from 'vue-router';
    import { ref, onMounted, onUnmounted } from '@vue/runtime-core';
    import LoadingSpinner from '@/components/LoadingSpinner.vue';
    import GameViewer from '@/components/GameViewer.vue';
  
    const dialog = ref(false);

    const turnsToPlayOnChain = ref(10);
  
    function showOnChainDialog(b) {
        if (!b && SECTFStore.gameBlockchainInteraction) { return; }
        dialog.value = b;
    }

    const SECTFStore = useSECTFStore();
    const router = useRouter();
    
    onMounted(async () => {
      console.log("Game.vue onMounted()");
      SECTFStore.startGame();      
      if (SECTFStore.gameInternalStatus == -1) {
        console.log("Leaving Game with status: -1");
        return await router.push({ name: "Home" });
      }
    });

    function changeTurnsToPlayOnChain(n) {
        if (canPushState()) { return; }
        if (n == 1 && turnsToPlayOnChain.value < 100) { turnsToPlayOnChain.value+= 1; }
        if (n == -1 && turnsToPlayOnChain.value > 1) { turnsToPlayOnChain.value-= 1; }
    }

    async function playOnChain(turns, finish = false) {
        if (!canPushState() && ((turns >= 1 && turns <= 100) || finish)) {
            await SECTFStore.playOnChain(turns, finish);
            dialog.value = false;
        }
    }

    function canPushState() {
        if (SECTFStore.gameLastCheckpoint != null) {
            if (!SECTFStore.gameLastCheckpoint.on_chain) {
                if (SECTFStore.gameLastCheckpoint.data.turn > SECTFStore.gameLastBlockchainTurn) {
                    if (SECTFStore.currentRoom.numberOfPlayers > 1) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    async function pushState(finish = false) {
        if (canPushState() || (finish && SECTFStore.currentRoom.numberOfPlayers > 1)) {
            await SECTFStore.pushStateToBlockchain(finish);
            dialog.value = false;
        }
    }

    async function playPause() {
        SECTFStore.toggleAutomaticTurns();
    }

    function isFinished() {
        return (SECTFStore.currentRoomStatus > 2 || (SECTFStore.gameLastCheckpoint != null && SECTFStore.gameLastCheckpoint.data.status > 2));
    }

    onBeforeRouteLeave((to, from, next) => { SECTFStore.leave(); next(); });
    onUnmounted((to, from, next) => { SECTFStore.leave(); });


    function rankingHeight() {
        return `height: ${(SECTFStore.currentRoom.numberOfPlayers * 50) + 120}px !important`;
    }

    function finishedDialogHeight() {
        if (SECTFStore.currentRoomStatus > 2) {
            return `height: ${(SECTFStore.currentRoom.numberOfPlayers * 50) + 200}px !important`;
        }
        return '';
    }

</script>

<template>

    <div id="blackout" class="flex flex-center" :class="{'showBlackout': dialog || isFinished() || (SECTFStore.gameBlockchainInteraction)}" @click="showOnChainDialog(false)" v-if="SECTFStore.currentRoomStatus >= 2"></div>

    <div id="finishedDialog" class="flex column flex-center" :class="{'showDialog': isFinished() }" v-if="(SECTFStore.currentRoomStatus > 2 || SECTFStore.gameLastCheckpoint != null && SECTFStore.gameLastCheckpoint.data.status > 2)" :style="finishedDialogHeight()">
        <div id="finishedTitle" class="flex flex-center">Game Finished!</div>
        <div class="dialogActions flex column flex-center" v-if="SECTFStore.finishedGameBlockchainInteraction">
            <LoadingSpinner />
        </div>
        <div class="dialogActions flex column flex-center" v-else-if="SECTFStore.currentRoomStatus > 2" :style="rankingHeight()">
            <div class="dialogDescription">This game has finished {{(SECTFStore.currentRoomStatus == 3)?'with a winner':'without a winner'}}.</div>
            <div v-for="w in SECTFStore.currentRoomRanking.length" :key="w">
                <div class="rankingRow flex row">
                   <div class="rankingNumber">#{{w}}</div>
                   <div class="rankingPlayerColumn flex column">
                        <div class="rankingWinnerName">ELEVATOR {{SECTFStore.currentRoomRanking[w-1].playerNumber}}</div>
                        <div class="rankingWinnerAddress">{{SECTFStore.currentRoomRanking[w-1].elevator}}</div>
                    </div>
                    <div class="rankingScore">{{SECTFStore.currentRoomRanking[w-1].score}}</div>
                </div>
            </div>
            <router-link :to="{ name: 'Home' }" id="backButton">Go Back</router-link>
        </div>
        <div class="dialogActions flex column flex-center" v-else>
            <div class="flex column flex-center" v-if="SECTFStore.currentRoom.numberOfPlayers == 1">
                <div class="dialogDescription">This is a single player game and must be fully verified on-chain be completed.</div>
                <div class="button" @click="playOnChain(1 + (SECTFStore.gameLastCheckpoint.data.turn - SECTFStore.gameLastBlockchainTurn), true)">Play {{SECTFStore.gameLastCheckpoint.data.turn - SECTFStore.gameLastBlockchainTurn}} Turns On Chain</div>
            </div>
            <div class="flex column flex-center" v-else>
                <div>This game can be verified on-chain to be complete.</div>
                <div id="pushStateButton" class="button" :class="{'disabledButton': !canPushState() }" @click="pushState(true)">Push Current State to the Blockchain</div>
            </div>
        </div>
    </div>

    <div id="onChainDialog" class="flex column flex-center" :class="{'showDialog': dialog || (SECTFStore.gameBlockchainInteraction && !SECTFStore.finishedGameBlockchainInteraction)}" v-if="SECTFStore.currentRoomStatus == 2">
        <div id="onChainTitle" class="flex flex-center">On-Chain Actions</div>
        <div class="dialogActions flex column flex-center" v-if="SECTFStore.gameBlockchainInteraction">
            <LoadingSpinner />
        </div>
        <div class="dialogActions flex column flex-center" v-else>
            <div id="turnsToPlayRow" class="flex row flex-center">
                <div class="changeNumTurnsButton noSelect" :class="{'clickable': (turnsToPlayOnChain > 1  && !canPushState())}" @click="changeTurnsToPlayOnChain(-1)">▼</div>
                <div class="turnsToPlayLabel">{{turnsToPlayOnChain}}</div>
                <div class="changeNumTurnsButton noSelect" :class="{'clickable': (turnsToPlayOnChain < 100 && !canPushState())}" @click="changeTurnsToPlayOnChain(1)">▲</div>
            </div>
            <div class="button" @click="playOnChain(turnsToPlayOnChain)" :class="{'disabledButton': canPushState() }">Play {{turnsToPlayOnChain}} Turns On Chain</div>
            <div id="pushStateButton" class="button" :class="{'disabledButton': !canPushState() }" @click="pushState()">Push Current State to the Blockchain</div>
        </div>
    </div>
    <div id="onChainDialogButton" class="containNoRepeatCenter" @click="showOnChainDialog(true)" v-if="SECTFStore.currentRoomStatus == 2"></div>

    <div id="gameOverContainer" class="flex column" v-if="SECTFStore.gameLastCheckpoint != null">
        <div id="gameContainer" class="flex column flex-center">
            <GameViewer @playPause="playPause()"/>
        </div>
    </div>

    <div class="flex column flex-center" v-else>
        <div class="flex column flex-center" v-if="(SECTFStore.gameInternalStatus >= 0 && SECTFStore.gameInternalStatus < 3) || SECTFStore.gameBlockchainInteraction">
            <LoadingSpinner />
            <div id="loadingMessage" v-if="SECTFStore.gameBlockchainInteraction">...</div>
            <div id="loadingMessage" v-else-if="SECTFStore.gameInternalStatus == 0">Loading game data</div>
            <div id="loadingMessage" v-else-if="SECTFStore.gameInternalStatus == 1">Waiting for peers</div>
            <div id="loadingMessage" v-else-if="SECTFStore.gameInternalStatus == 2">Syncing</div>
        </div>
    </div>
</template>

<script>
</script>

<style scoped>
    #blackout {
        z-index: 500;
        background-color: rgba(0, 0, 0, 0);
        transition: ease-in-out 0.5s;
        position: fixed;
        top:0px;
        left: 0px;
        width: 100vw;
        height: 100%;
        pointer-events: none;
    }

    .showBlackout {
        pointer-events: all !important;
        background-color: rgba(0, 0, 0, 0.4) !important;
    }

    #onChainDialog {
        position: fixed;
        width: 50%;
        height: 50%;
        width: 500px;
        height: 260px;
        background-color: var(--white-mute);
        transform: scale(0);
        transition: 250ms;
        box-shadow: #00000061 0px 0px 24px;
        z-index: 600;
    }

    .showDialog { transform: scale(1) !important; }

    #onChainDialogButton {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        background-color: var(--grey);
        cursor: pointer;
        background-image: url(../assets/img/chain.svg);
        z-index: 400;
    }

    #onChainDialogButton:hover { background-color: var(--dark-grey) !important; }

    #onChainTitle {
        width: 100%;
        height: 40px;
        text-align: center;
        font-size: 24px;
        font-weight: 700;
    }

    #turnsToPlayRow {
        margin-top: 15px;
        margin-bottom: 15px;
    }

    .dialogActions {
        height: 175px;
    }

    .turnsToPlayLabel {
        font-size: 48px;
        line-height: 40px;
    }

    .changeNumTurnsButton {
        width: 30px;
        height: 30px;
        font-size: 21px;
        font-weight: 500;
        text-align: center;
        color: var(--grey);
    }

    .clickable {
        cursor: pointer;
        color: var(--gradient-1);
    }

    #pushStateButton {
        margin-top: 25px;
    }

    .disabledButton { background-color: var(--grey) !important; cursor: unset; }
    .disabledButton:hover { background-color: var(--grey) !important; color: var(--white) !important;}

    #gameOverContainer {
        height: 100%;
        align-items: center;
        justify-content: center;
        margin-bottom: 50px;
    }

    #loadingMessage {
      width: 75%;
      margin-bottom: 100px;
      text-align: center;
    }

    #gameContainer {
        width: 100vw;
        height: 800px;
    }





    #finishedDialog {
        position: fixed;
        width: 50%;
        height: 50%;
        width: 500px;
        height: 260px;
        background-color: var(--white-mute);
        transform: scale(0);
        transition: 250ms;
        box-shadow: #00000061 0px 0px 24px;
        z-index: 600;
    }

    #finishedTitle {
        width: 100%;
        height: 40px;
        text-align: center;
        font-size: 24px;
        font-weight: 700;
    }

    .dialogDescription {
        width: 450px;
        text-align: center;
        margin-bottom: 30px;
    }

    #backButton {
      font-weight: 800;
      text-decoration: none;
      margin-top: 20px;
    }

    .rankingRow {
        width: 430px;
        margin-bottom: 10px;
    }

    .rankingNumber {
        font-weight: 700;
        font-size: 21px;
        color: var(--gradient-1);
    }
    .rankingPlayerColumn {
        width: 400px;
    }

    .rankingWinnerName {
        margin-left: 20px;
        font-size: 16px;
        font-weight: 700;
    }
    .rankingWinnerAddress {
        margin-left: 20px;
        font-size: 12px;
    }

    .rankingScore {
        font-weight: 700;
        font-size: 21px;
        color: var(--gradient-4);
    }
</style>