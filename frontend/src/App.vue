<script setup>
  import { RouterLink, RouterView } from 'vue-router'
  import useBreakpoints from '@/helpers/useBreakpoints';
  import { useEthereumStore } from '@/stores/ethereum';
  import ConnectButton from '@/components/ConnectButton.vue';
  import NavBar from '@/components/NavBar.vue';

  const { width, type } = useBreakpoints();
  const ethereumStore = useEthereumStore();
</script>

<template>
  <NavBar v-if="ethereumStore.networkOk"/>
  <div id="routerViewContainer" class="flex flex-center column" v-if="ethereumStore.networkOk">
    <RouterView/>
  </div>
  <div v-else-if="ethereumStore.initialized" class="flex flex-center column">
    <div id="logo" class="containNoRepeatCenter noSelect"></div>
    <ConnectButton/>
  </div>
</template>

<style scoped>
  #routerViewContainer {
    height: calc(100vh - 100px);
  }


  #logo {
    background-image: url(img/logo.svg);
    margin-bottom: 20px;
    width: 300px;
    height: 300px;
  }
</style>
