<script setup>
    import { useSECTFStore } from '@/stores/sectf';
    import { useGameStore } from '@/stores/game';
    import { useRouter, onBeforeRouteLeave } from 'vue-router';
    import { ref, onMounted, onUnmounted, defineProps } from '@vue/runtime-core';
    import LoadingSpinner from '@/components/LoadingSpinner.vue';
    import GameViewer from '@/components/GameViewer.vue';
  
    const game = ref(null);
  
    const SECTFStore = useSECTFStore();
    const gameStore = useGameStore();
    const router = useRouter();
    
    onMounted(async () => {
      console.log("Game.vue onMounted()");
      SECTFStore.startGame();
      
      if (SECTFStore.gameInternalStatus == -1) {
        console.log("Leaving Game with status: -1");
        return await router.push({ name: "Home" });
      }
    });

    function playOnChain(turns) {
      SECTFStore.playOnChain(turns);
    }
    
    onBeforeRouteLeave((to, from, next) => { SECTFStore.leave(); next(); });
    onUnmounted((to, from, next) => { SECTFStore.leave(); });
</script>

<template>
    <div id="gameOverContainer" class="flex column" v-if="SECTFStore.gameLastCheckpoint != null">
        <div id="gameContainer" class="flex column flex-center">
            <GameViewer />
        </div>
        <div class="flex row flex-center">
            <div class="button" @click="playOnChain(10)">Play On Chain</div>
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

        <!--div class="button" @click="playOnChain(10)">Play On Chain</div-->
        <!-- This should open a modal that allow the player to play X amount of turns on-chain-->
    </div>
</template>

<script>
</script>

<style scoped>
    #gameOverContainer {
        height: calc(100vh - 150px);
    }

    #loadingMessage {
      width: 75%;
      margin-bottom: 100px;
      text-align: center;
    }

    #gameContainer {
        width: 100vw;
        height: 80vh;
    }
</style>