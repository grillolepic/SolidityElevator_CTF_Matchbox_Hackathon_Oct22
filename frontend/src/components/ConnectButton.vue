<script setup>
    import { useEthereumStore } from '@/stores/ethereum';
    import { computed, ref } from '@vue/runtime-core';

    const ethereumStore = useEthereumStore();
    const hovering = ref(false);

    const label = computed(() => {
        if (ethereumStore.networkOk) {
            if (hovering.value) { return "Disconnect"; }
            return `${ethereumStore.shortAddress(26)}`;
        } else {
            if (ethereumStore.connected) {
                return `Switch to ${ethereumStore.defaultNetworkName}`;
            } else {
                if (ethereumStore.connecting) {
                    return ". . .";
                } else {
                    return "Connect";
                }
            }
        }
    });

    function action() {
        console.log("ConnectButton.vue action()");
        if (ethereumStore.networkOk) {
            ethereumStore.logout();
        } else {
            if (ethereumStore.connected) {
                ethereumStore.switchToDefaultNetwork();
            } else {
                if (!ethereumStore.connecting) {
                    ethereumStore.connect();
                }
            }
        }
    }
</script>

<template>
    <div>
        <div id="connectButton" class="flex flex-center column noSelect button size-normal w-500" @click="action" @mouseover="hovering = true" @mouseleave="hovering = false">{{label}}<br><span class="smol" v-if="ethereumStore.networkName.length > 0 && ethereumStore.defaultNetworkName != ethereumStore.networkName">({{ethereumStore.networkName}})</span></div>
    </div>
</template>

<style scoped>
    #connectButton {
        width: 300px;
        height: 50px;
        text-align: center;
    }

    .smol {
        font-size: 8px;
    }
</style>
