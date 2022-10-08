<script setup>
    import { useEthereumStore } from '@/stores/ethereum';
    import { useSECTFStore } from '@/stores/sectf';
    import { ref } from '@vue/runtime-core';
    import { useRouter } from 'vue-router';
    import { utils} from 'ethers';

    import LoadingSpinner from '@/components/LoadingSpinner.vue';

    const ethereumStore = useEthereumStore();
    const SECTFStore = useSECTFStore();
    const router = useRouter();

    const elevatorContract = ref('');
    const numberOfPlayers = ref(2);
    const floors = ref(8);
    const scoreToWin = ref(10);

    async function create() {
      if (isAddressValid()) {
        let createdId = await SECTFStore.createRoom(numberOfPlayers.value, floors.value, scoreToWin.value, elevatorContract.value);
        if (createdId != null) {
            router.push({ name: "GameRoom", params: { roomId: createdId.toString() }});
        }
      }
    }

    function isAddressValid() {
        if (elevatorContract.value.length == 42) {
            try {
                return utils.isAddress(utils.getAddress(elevatorContract.value));
            } catch (err) {}
        }
        return false;
    }

    function changeNumberOfPlayers(n) {
        if (n == 1 && numberOfPlayers.value < 4) { numberOfPlayers.value++; }
        if (n == -1 && numberOfPlayers.value > 1) { numberOfPlayers.value--; }
    }

    function changeFloors(n) {
        if (n == 1 && floors.value < 8) { floors.value++; }
        if (n == -1 && floors.value > 4) { floors.value--; }
    }

    function changeScoreToWin(n) {
        if (n == 1 && scoreToWin.value < 100) { scoreToWin.value+= 10; }
        if (n == -1 && scoreToWin.value > 10) { scoreToWin.value-= 10; }
    }

  </script>
  
  <template>
    <div class="flex column flex-center">
        <div id="loadingContainer" class="flex column flex-center" v-if="SECTFStore.creatingRoom">
            <LoadingSpinner/>
            <div id="loadingMessage">Creating GameRoom on {{ethereumStore.networkName}}</div>
        </div>
        <div id="createRoomContainer"  class="flex column flex-center" v-else>
            <div id="title" class="w-700 size-title">Create GameRoom</div>
            
            <div class="w-400 size-normal inputLabel">Elevator Contract:</div>
            <input id="elevatorContractInput" v-model="elevatorContract">

            <div id="propsRow" class="flex row flex-center">
                <div class="propColumn flex column flex-center">
                    <div class="w-400 size-normal">Players</div>
                    <div class="flex row flex-center">
                        <div class="changePropButton noSelect" :class="{'clickable': (numberOfPlayers > 1)}" @click="changeNumberOfPlayers(-1)">▼</div>
                        <div class="propValue noSelect">{{numberOfPlayers}}</div>
                        <div class="changePropButton noSelect" :class="{'clickable': (numberOfPlayers < 4)}" @click="changeNumberOfPlayers(1)">▲</div>
                    </div>
                </div>
                <div class="propColumn flex column flex-center">
                    <div class="w-400 size-normal">Score To Win</div>
                    <div class="flex row flex-center">
                        <div class="changePropButton noSelect" :class="{'clickable': (scoreToWin > 10)}" @click="changeScoreToWin(-1)">▼</div>
                        <div class="propValue noSelect">{{scoreToWin}}</div>
                        <div class="changePropButton noSelect" :class="{'clickable': (scoreToWin < 100)}" @click="changeScoreToWin(1)">▲</div>
                    </div>
                </div>
                <div class="propColumn flex column flex-center">
                    <div class="w-400 size-normal">Floors</div>
                    <div class="flex row flex-center">
                        <div class="changePropButton noSelect" :class="{'clickable': (floors > 4)}" @click="changeFloors(-1)">▼</div>
                        <div class="propValue noSelect">{{floors}}</div>
                        <div class="changePropButton noSelect" :class="{'clickable': (floors < 8)}" @click="changeFloors(1)">▲</div>
                    </div>
                </div>
            </div>
           
            <div id="createButton" class="button noSelect" :class="{'disabled': !isAddressValid() }" @click="create()">Create</div>
            <router-link :to="{ name: 'Home' }" id="backButton">Go Back</router-link>
        </div>
    </div>
  </template>
  
  <style scoped>
    #createRoomContainer {
        width: 400px;
        max-width: 80vw;
    }

    #title {
        margin-bottom: 30px;
    }
    .inputLabel {
        width: 100%;
    }

    input {
        width: 100%;
        height: 40px;
        border-radius: 0px;
        border: 1px solid var(--dark-blue);
        padding: 0px 10px;
        letter-spacing: 1.2px;
        text-align: center;
    }

    .changePropButton {
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

    #propsRow {
        width: 100%;
        justify-content: space-between;
        margin: 30px 0px;
    }

    .propValue {
        font-size: 48px;
        line-height: 40px;
        font-weight: 700;
        text-align: center;
        color: var(--dark-blue);
    }

    #backButton {
      font-weight: 800;
      text-decoration: none;
      margin-top: 20px;
    }
  
    #createButton {
        width: 100%;
    }

    .disabled {
        background-color: var(--grey) !important;
        cursor: unset;
    }

    .disabled:hover {
        color: var(--white) !important;
    }
    
    #loadingContainer {
      height: 100%;
      width: 100%;
      max-width: 380px;
      text-align: center;
    }
  
    #loadingMessage {
      width: 75%;
      margin-bottom: 100px;
    }
  </style>