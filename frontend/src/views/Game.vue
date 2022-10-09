<script setup>
    import { useSECTFStore } from '@/stores/sectf';
    import { useRouter, onBeforeRouteLeave } from 'vue-router';
    import { ref, onMounted, onUnmounted, defineProps } from '@vue/runtime-core';
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

    async function playOnChain(turns) {
        if (!canPushState() && turns >= 1 && turns <= 100) {
            await SECTFStore.playOnChain(turns);
            dialog.value = false;
        }
    }

    function canPushState() {
        if (SECTFStore.gameLastCheckpoint != null) {
            if (!SECTFStore.gameLastCheckpoint.on_chain) {
                if (SECTFStore.gameLastCheckpoint.data.turn > SECTFStore.gameLastBlockchainTurn) {
                    return true;
                }
            }
        }
        return false;
    }

    async function pushState() {
        if (canPushState()) {
            await SECTFStore.pushState();
            dialog.value = false;
        }
    }

    onBeforeRouteLeave((to, from, next) => { SECTFStore.leave(); next(); });
    onUnmounted((to, from, next) => { SECTFStore.leave(); });
</script>

<template>

    <div id="blackout" class="flex flex-center" :class="{'showBlackout': dialog || (SECTFStore.gameBlockchainInteraction)}" @click="showOnChainDialog(false)" v-if="SECTFStore.currentRoomStatus == 2"></div>
    <div id="onChainDialog" class="flex column flex-center" :class="{'showDialog': dialog || (SECTFStore.gameBlockchainInteraction)}" v-if="SECTFStore.currentRoomStatus == 2">
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
            <GameViewer />
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
        background-image: url(img/chain.svg);
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
        margin-top: 40px;
        height: 100%;
        align-items: center;
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
</style>