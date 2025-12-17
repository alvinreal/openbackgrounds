import { computed } from "vue";
import { useState } from "#imports";

interface FpsState {
  fps: number;
  active: boolean;
  lastFrame: number;
  samples: number[];
}

const SAMPLE_SIZE = 40;

export const useFpsMeter = () => {
  const state = useState<FpsState>("fps-meter", () => ({
    fps: 0,
    active: false,
    lastFrame: 0,
    samples: [],
  }));

  const reset = () => {
    state.value.fps = 0;
    state.value.lastFrame = 0;
    state.value.samples = [];
  };

  const start = () => {
    if (typeof window === "undefined") return;
    state.value.active = true;
    state.value.lastFrame = performance.now();
    state.value.samples = [];
  };

  const stop = () => {
    state.value.active = false;
    reset();
  };

  const tick = () => {
    if (typeof window === "undefined" || !state.value.active) return;

    const now = performance.now();
    if (!state.value.lastFrame) {
      state.value.lastFrame = now;
      return;
    }

    const delta = now - state.value.lastFrame;
    state.value.lastFrame = now;

    if (delta <= 0) return;

    const fps = 1000 / delta;
    state.value.samples.push(fps);
    if (state.value.samples.length > SAMPLE_SIZE) {
      state.value.samples.shift();
    }

    const average =
      state.value.samples.reduce((sum, value) => sum + value, 0) /
      state.value.samples.length;

    state.value.fps = Math.round(average);
  };

  const fps = computed(() => state.value.fps);
  const isVisible = computed(() => state.value.active && state.value.fps > 0);

  return {
    fps,
    isVisible,
    start,
    stop,
    tick,
    reset,
  };
};
