import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { useEthereumStore } from '@/stores/ethereum';

import App from './App.vue';
import router from './router';
import './assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

const ethereumStore = useEthereumStore();
ethereumStore.init();