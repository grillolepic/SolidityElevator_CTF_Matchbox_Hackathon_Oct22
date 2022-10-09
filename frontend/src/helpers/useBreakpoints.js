import { computed, onMounted, onUnmounted, ref } from "vue"

export default function () {
  let windowWidth = ref(window.innerWidth);
  let windowHeight = ref(window.innerHeight);

  const onWidthChange = () => {
    windowWidth.value = window.innerWidth;
    windowHeight.value = window.innerHeight;
  }

  onMounted(() => window.addEventListener('resize', onWidthChange))
  onUnmounted(() => window.removeEventListener('resize', onWidthChange))
  
  const type = computed(() => {
    if (windowWidth.value < 550) return 'xs'
    if (windowWidth.value >= 550 && windowWidth.value < 1280) return 'md'
    if (windowWidth.value >= 1280) return 'lg'
    return null;
  })

  const width = computed(() => windowWidth.value);
  const height = computed(() => windowHeight.value);

  return { width, height, type }    
}