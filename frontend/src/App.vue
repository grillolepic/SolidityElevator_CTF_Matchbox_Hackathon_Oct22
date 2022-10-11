<script setup>
  import { RouterLink, RouterView } from 'vue-router'
  import useBreakpoints from '@/helpers/useBreakpoints';
  import { useEthereumStore } from '@/stores/ethereum';
  import ConnectButton from '@/components/ConnectButton.vue';
  import NavBar from '@/components/NavBar.vue';

  const { width, height, type } = useBreakpoints();
  const ethereumStore = useEthereumStore();
</script>

<template>
  <!--div id="coverAll" class="flex column flex-center" v-if="!(width >= 1300 && height >= 950)">
    <div class="oops">Oops...</div>
    <div class="message">SolidityElevatorCTF currently requires a minimum window resolution of 1400px by 1000px</div>
  </div-->

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
  #coverAll {
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0px;
    left: 0px;
    z-index: 999999;
    background-color: var(--white-mute);
  }

  #routerViewContainer {
    height: calc(100vh - 100px);
  }

  #logo {
    background-image: url(img/logo.svg);
    margin-bottom: 20px;
    width: 300px;
    height: 300px;
  }

  .oops {
    font-size: 48px;
    font-weight: 700;
    text-align: center;
  }

  .message {
    font-size: 16px;
    font-weight: 400;
    text-align: center;
    width: 500px;
    margin-top: 20px;
  }
</style>
