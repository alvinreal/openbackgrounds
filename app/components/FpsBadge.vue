<template>
  <transition name="fps-fade">
    <div
      v-if="isVisible"
      class="pointer-events-none select-none inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium backdrop-blur-md border shadow-sm bg-white/5 border-white/10 text-white/90 shadow-black/20"
    >
      <span class="uppercase tracking-wide opacity-80">FPS</span>
      <span class="text-sm font-semibold">{{ fps }}</span>
    </div>
  </transition>
</template>

<script setup>
const { fps, isVisible } = useFpsMeter();
</script>

<style scoped>
.fps-fade-enter-active,
.fps-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fps-fade-enter-from,
.fps-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
