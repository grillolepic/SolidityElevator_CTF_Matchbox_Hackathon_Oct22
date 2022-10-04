<script setup>
    import { useEthereumStore } from '@/stores/ethereum';
    import ConnectButton from '@/components/ConnectButton.vue';

    const ethereumStore = useEthereumStore();
</script>

<template>
    <div class="flex row" id="Navbar">
        <router-link :to="{ name: 'Home' }">
            <div id="logo" class="size-big size-title w-700 noSelect">SolidityElevator</div>
        </router-link>
        
        <ConnectButton v-if="type!='xs'"/>
    </div>  
</template>

<style scoped>
    #logo {
        color: var(--dark-blue) !important;
    }

    #Navbar {
        position: static;
        z-index: 100;
        height: 60px;
        width: 100%;
        justify-content: space-between;
        align-items: center;
    }
</style>