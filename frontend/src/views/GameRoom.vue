<script setup>
    import { useSECTFStore } from '@/stores/sectf';
    import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router';
    import { ref, onMounted, onUnmounted, defineProps } from '@vue/runtime-core';
    import LoadingSpinner from '@/components/LoadingSpinner.vue';
    import { utils} from 'ethers';

    const props = defineProps(['roomId']);
    const SECTFStore = useSECTFStore();

    const router = useRouter();
    const route = useRoute();

    const elevatorContract = ref('');
    
    onMounted(async () => {
        console.log("GameRoom.vue onMounted()");
        SECTFStore.reset();
        await SECTFStore.loadRoom(props.roomId);

        if (SECTFStore.currentRoomId == null) {
            return await router.push({ name: "Home" });
        } else if (SECTFStore.currentRoomJoined) {
            if (SECTFStore.currentRoomStatus == 2) {
                return await router.push({ name: "Game", params: { roomId: SECTFStore.currentRoomId }});
            }
        }
    });

    function isAddressValid() {
        if (elevatorContract.value.length == 42) {
            try {
                return utils.isAddress(utils.getAddress(elevatorContract.value));
            } catch (err) {}
        }
        return false;
    }

    async function join() {
        let result = await SECTFStore.joinRoom(SECTFStore.currentRoomId, elevatorContract.value);
        if (result == true) {
            if (SECTFStore.currentRoomStatus == 2) {
                return await router.push({ name: "Game", params: { roomId: SECTFStore.currentRoomId }});
            }
        }
    }
  
    async function finish() {
        let result = await SECTFStore.exitRoom(SECTFStore.currentRoomId);
        if (result == true) { return await router.push({ name: "Home" }); }
    }

    function copyUrl() {
        const splitUrl = window.location.href.split("/");
        const text =  `${splitUrl[0]}//${splitUrl[2]}${route.fullPath}`;
        navigator.clipboard.writeText(text).then(function() {
          console.log('Async: Copying to clipboard was successful!');
          document.getElementById('copied').className = 'copiedNotificationText';
          setTimeout(()=>{ document.getElementById('copied').className = 'hide'; }, 2000);
        }, function(err) {
          console.error('Async: Could not copy text: ', err);
        });
    }
  </script>
  
  <template>
        <div class="flex column flex-center" v-if="SECTFStore.loadingRoom || SECTFStore.joiningRoom || SECTFStore.closingRoom">
            <LoadingSpinner/>
            <div id="loadingMessage" v-if="SECTFStore.closingRoom">Closing GameRoom #{{props.roomId}}</div>
            <div id="loadingMessage" v-else-if="SECTFStore.joiningRoom">Joining GameRoom #{{props.roomId}}</div>
            <div id="loadingMessage" v-else-if="SECTFStore.loadingRoom">Loading GameRoom #{{props.roomId}}</div>
        </div>

        <div class="flex column flex-center" v-else>

            <div id="gameRoomContainer" class="flex column flex-center" v-if="SECTFStore.currentRoomStatus == 1">
                <div id="title" class="w-700 size-title">GameRoom #{{SECTFStore.currentRoomId}}</div>

                <div class="w-400 size-normal description" v-if="SECTFStore.currentRoomJoined">Waiting for more players need to join the game. Start by copying and sharing the URL!</div>

                <div class="w-400 size-normal inputLabel" v-if="!SECTFStore.currentRoomJoined">Elevator Contract:</div>
                <input id="elevatorContractInput" v-model="elevatorContract" v-if="!SECTFStore.currentRoomJoined">

                <div id="propsRow" class="flex row flex-center">
                    <div class="propColumn flex column flex-center">
                        <div class="w-400 size-normal">Players</div>
                        <div class="flex row flex-center">
                            <div class="propValue noSelect">{{SECTFStore.currentRoom.players.length}}/{{SECTFStore.currentRoom.numberOfPlayers}}</div>
                        </div>
                    </div>
                    <div class="propColumn flex column flex-center">
                        <div class="w-400 size-normal">Score To Win</div>
                        <div class="flex row flex-center">
                            <div class="propValue noSelect">{{SECTFStore.currentRoom.scoreToWin}}</div>
                        </div>
                    </div>
                    <div class="propColumn flex column flex-center">
                        <div class="w-400 size-normal">Floors</div>
                        <div class="flex row flex-center">
                            <div class="propValue noSelect">{{SECTFStore.currentRoom.floors}}</div>
                        </div>
                    </div>
                </div>
                
                <div class="w-400 size-normal warning redText" v-if="SECTFStore.currentRoomLostKeys && SECTFStore.currentRoomJoined">WARNING: Private Keys for this game have been lost. State-Channels won't be available.</div>

                <div id="copyURLButton" class="button noSelect" @click="copyUrl()" v-if="SECTFStore.currentRoomJoined">Copy URL</div>
                <div id="joinButton" class="button noSelect" :class="{'disabled': !isAddressValid() }" @click="join()" v-if="!SECTFStore.currentRoomJoined">Join</div>
                <div id="leaveButton" class="button noSelect redButton" @click="finish()" v-if="SECTFStore.currentRoomJoined">Leave</div>

                <router-link :to="{ name: 'Home' }" id="backButton">Go Back</router-link>
            </div>

            <div class="flex column flex-center" v-if="SECTFStore.currentRoomStatus == 6">
                <div id="title" class="w-700 size-title">GameRoom #{{SECTFStore.currentRoomId}}</div>
                <div class="w-400 size-normal description">This GameRoom has timed out and is no longer available.</div>
                <div class="button redButton" @click="finish()">Close GameRoom</div>
                <router-link :to="{ name: 'Home' }" id="backButton">Go Back</router-link>
            </div>
            
            <div class='copiedNotification'>
                <h2 id="copied" class="hide">Copied</h2>
            </div>
        </div>
    </template>
  
  <style scoped>
    #gameRoomContainer {
        width: 400px;
        max-width: 80vw;
    }

    #title {
        margin-bottom: 20px;
    }

    .description {
        width: 100%;
        margin-bottom: 20px;
        text-align: center;
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
        margin-bottom: 30px;
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
        margin-bottom: 30px;
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
      text-align: center;
    }

    .redButton {
        background-color: var(--red);
    }

    .redButton:hover {
        color: var(--white);
        background-color: var(--dark-red);
    }

    .button {
        margin-bottom: 10px;
    }


    .warning {
        width: 100%;
        margin-bottom: 20px;
        text-align: center;
    }

    .redText {
        color: var(--red);
        font-weight: 500;
    }
  
    .copiedNotification {
      position: fixed;
      bottom: 0px;
      height: 4rem;
      overflow: hidden;
      padding: 0;
      margin-bottom: 16px;
      color: var(--gradient-0);
    }
    .copiedNotificationText {
      animation: 2s anim-lineUp ease-out infinite;
    }
  
    .hide {
      opacity: 0;
    }
  
    @keyframes anim-lineUp {
      0% {
        opacity: 0;
        transform: translateY(80%);
      }
      30% {
        opacity: 1;
        transform: translateY(0%);
      }
      80% {
        opacity: 1;
        transform: translateY(0%);
      }
      100% {
        opacity: 0;
        transform: translateY(0%);
      }
    }
  
  </style>