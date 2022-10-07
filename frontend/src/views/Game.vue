<script setup>
    import { useSECTFStore } from '@/stores/sectf';
    import { useGameStore } from '@/stores/game';
    import { useRouter, onBeforeRouteLeave } from 'vue-router';
    import { ref, onMounted, onUnmounted, defineProps } from '@vue/runtime-core';
    import LoadingSpinner from '@/components/LoadingSpinner.vue';
  
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
    <div class="flex column flex-center" v-if="(SECTFStore.gameInternalStatus >= 0 && SECTFStore.gameInternalStatus < 6) || SECTFStore.gameBlockchainInteraction">
      <LoadingSpinner />
      <div id="loadingMessage" v-if="SECTFStore.gameBlockchainInteraction">...</div>
      <div id="loadingMessage" v-else-if="SECTFStore.gameInternalStatus == 0">Loading game data</div>
      <div id="loadingMessage" v-else-if="SECTFStore.gameInternalStatus == 1">Waiting for peers</div>
      <div id="loadingMessage" v-else-if="SECTFStore.gameInternalStatus >= 2 && SECTFStore.gameInternalStatus < 5">Syncing</div>
      <div id="loadingMessage" v-else-if="SECTFStore.gameInternalStatus == 5">Initializing</div>
    </div>

    <div class="button" @click="playOnChain(10)">Play 10 Turns</div>
</template>

<script>
</script>

<style scoped>
    #loadingMessage {
      width: 75%;
      margin-bottom: 100px;
      text-align: center;
    }
</style>