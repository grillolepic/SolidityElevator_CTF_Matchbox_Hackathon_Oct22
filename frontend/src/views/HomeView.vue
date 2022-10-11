<script setup>
  import LoadingSpinner from '@/components/LoadingSpinner.vue';
  import { useEthereumStore } from '@/stores/ethereum';
  import { useSECTFStore } from '@/stores/sectf';

  const ethereumStore = useEthereumStore();
  const SECTFStore = useSECTFStore();

</script>

<template>
  <div class="flex column flex-center" v-if="SECTFStore.loadingPreviousRooms || SECTFStore.closingRoom">
      <LoadingSpinner />
      <div id="loadingMessage" v-if="SECTFStore.loadingPreviousRooms">Loading</div>
      <div id="loadingMessage" v-if="SECTFStore.closingRoom">Closing GameRoom</div>
  </div>

  <div id="buttonsConatinar" class="flex flex-center column" v-if="!(SECTFStore.loadingPreviousRooms || SECTFStore.closingRoom)">
    
    <div id="logo" class="containNoRepeatCenter noSelect"></div>

    <div id="continueGames" class="flex flex-center row">
      <div id="continueGameItem" v-for="gameRoom in SECTFStore.activeGameRooms" :key="gameRoom.id">
        <router-link :to="{ name: 'GameRoom', params: { roomId: gameRoom.id}}">
          <div class="button gameRoomButton">Continue<br>GameRoom #{{gameRoom.id}}</div>
        </router-link>
      </div>
    </div>

    <router-link :to="{ name: 'CreateRoom' }">
      <div class="button">Create GameRoom</div>
    </router-link>
  </div>

  <div id="contractAddress" class="flex column flex-center" v-if="!(SECTFStore.loadingPreviousRooms || SECTFStore.closingRoom)">
    <div>SolidityElevatorCTF (v{{SECTFStore.version}}) on {{ethereumStore.networkName}} by <a href="https://twitter.com/grillo_eth">@grillo_eth</a></div>
    <a :href="`${(ethereumStore.networkName == 'Arbitrum Nova')?'https://nova-explorer.arbitrum.io/address/':'https://goerli-rollup-explorer.arbitrum.io/address/'}${SECTFStore.contractAddress}`">{{SECTFStore.contractAddress}}</a>
  </div>

</template>

<style scoped>
  #buttonsConatinar {
    margin-bottom: 150px;
  }

  #continueGames {
    flex-wrap: wrap;
    width: 420px;
    margin-bottom: 30px;
  }

  #continueGames a {
    margin: 0px;
  }

  .gameRoomButton {
    background-color: var(--gradient-4);
    width: 195px;
    height: 60px;
    margin: 5px;
    padding: 10px;
    font-size: 14px;
    line-height: 20px;
    text-align: center;
  }

  .gameRoomButton:hover {
    color: var(--white);
    background-color: var(--gradient-0);
  }

  .redButton {
    background-color: var(--red);
  }

  .redButton:hover {
    background-color: var(--dark-red);
  }

  #logo {
    background-image: url(../assets/img/logoWithName.svg);
    margin-bottom: 20px;
    width: 300px;
    height: 100px;
  }

  #contractAddress {
    display: flex;
    position: absolute;
    font-size: 12px;
    bottom: 20px;
    width: 100vw;
  }

  #contractAddress a {
    text-decoration: underline;
  }

  #contractAddress a:hover {
    color: var(--gradient-4) !important;
  }

  #loadingMessage {
    width: 100%;
    margin-bottom: 100px;
    text-align: center;
    color: var(--dark-blue);
  }
</style>