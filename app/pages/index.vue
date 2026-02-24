<template>
  <div>
  <section
    class="flex flex-col items-center justify-between min-h-[90vh] bg-gradient-to-b from-black to-[#1A0033] text-white pb-16 text-sm relative overflow-hidden"
  >
    <Transition name="bg-fade" mode="out-in">
      <div
        v-if="selectedBackgroundComponent"
        :key="selectedBackground?.id"
        class="absolute inset-0 pointer-events-none"
      >
        <component :is="selectedBackgroundComponent" />
      </div>
    </Transition>
    <FpsBadge class="absolute bottom-6 right-6 z-20" />

    <div class="w-full flex justify-center px-4 pt-6 z-10">
      <nav
        class="flex items-center justify-between px-6 py-3 max-w-4xl w-full rounded-full bg-black/20 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/20"
      >
        <a href="/" class="flex items-center gap-2">
          <img
            ref="logoRef"
            src="/1.svg"
            alt="openbackgrounds"
            class="h-6 invert"
          />
          <span ref="logoTextRef" class="text-base font-semibold text-white"
            >openbackgrounds</span
          >
        </a>

        <div class="flex items-center gap-2">
          <a
            href="https://github.com/alvinunreal/openbackgrounds"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-gray-300 border border-white/10"
            aria-label="View on GitHub"
          >
            <Icon name="mdi:github" size="16" />
          </a>
        </div>
      </nav>
    </div>

    <div
      class="flex flex-col items-center flex-1 justify-center px-4 relative z-10"
    >
      <h1
        class="text-4xl md:text-5xl text-center font-medium max-w-3xl bg-gradient-to-r from-white to-[#748298] text-transparent bg-clip-text"
      >
        Build. Animate. Captivate. Without the complexity.
      </h1>
      <p
        class="text-slate-100 md:text-base max-md:px-2 text-center max-w-xl mt-3"
      >
        A curated collection of stunning animated backgrounds built with
        Three.js, WebGL, and Canvas that helps you ship fast and scale without
        limits.
      </p>

      <div
        class="bg-gradient-to-t from-indigo-900 to-slate-600 p-px rounded-md mt-8 relative overflow-hidden w-full max-w-xs cursor-pointer hover:opacity-90 transition-opacity"
        @click="selectNextBackground"
      >
        <div
          class="bg-black rounded-md px-6 py-3 relative flex items-center justify-between"
        >
          <div class="text-base font-medium text-white">
            {{ selectedBackground ? selectedBackground.name : "Loading..." }}
          </div>
          <Icon name="heroicons:forward" size="18" class="text-white" />
        </div>
      </div>
    </div>

    <div
      class="overflow-hidden w-full relative max-w-6xl mx-auto select-none mb-8 z-10 mask-gradient"
    >
      <div class="marquee-inner flex will-change-transform min-w-[200%]">
        <div class="flex py-4">
          <div
            v-for="(logo, index) in [...logos, ...logos]"
            :key="index"
            class="mx-14"
            v-html="logo"
          />
        </div>
      </div>
    </div>
  </section>

  <div
    class="h-16 bg-gradient-to-b from-[#1A0033] via-[#0A001A] to-[#0A001A] relative z-10"
  >
    <div
      class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"
    ></div>
  </div>

  <section
    class="bg-[#0A001A] text-white py-12 px-4 md:px-16 lg:px-24 xl:px-32"
  >
    <div class="max-w-6xl mx-auto">
      <div
        class="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4 md:gap-0"
      >
        <h2 class="text-2xl font-semibold text-white">Backgrounds</h2>

        <div class="flex gap-1 bg-slate-800/50 p-1 rounded-lg flex-wrap">
          <button
            v-for="category in categories"
            :key="category.name"
            @click="selectedCategory = category.name"
            :class="[
              'px-3 py-1.5 rounded text-sm font-medium',
              selectedCategory === category.name
                ? 'bg-slate-700 text-white'
                : 'text-gray-400 hover:text-gray-200',
            ]"
          >
            {{ category.name }}
            <span class="ml-1.5 text-xs opacity-60">
              {{ category.count }}
            </span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <div
          v-for="bg in filteredBackgrounds"
          :key="bg.id"
          class="bg-gradient-to-b from-slate-900 to-slate-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-500 group border border-slate-700 hover:shadow-lg"
          @click="selectBackground(bg)"
        >
          <div class="h-48 relative overflow-hidden bg-slate-800">
            <ClientOnly>
              <img
                v-if="bg.name"
                :key="bg.id"
                :src="`/screenshots/${bg.id}.png`"
                :alt="bg.name"
                class="w-full h-full object-cover"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center text-gray-600"
              >
                Preview
              </div>
            </ClientOnly>

            <a
              :href="`https://github.com/alvinunreal/openbackgrounds/blob/main/app/components/bg/${bg.component}.vue`"
              target="_blank"
              rel="noopener noreferrer"
              @click.stop
              class="absolute flexx top-2 right-2 p-2 rounded-lg bg-slate-900/90 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:bg-slate-800"
              title="View source code"
            >
              <Icon
                name="heroicons:code-bracket"
                size="18"
                class="text-gray-300"
              />
            </a>
          </div>
          <div class="p-4">
            <h3 class="font-medium mb-1 text-white">
              {{ bg.name }}
            </h3>
            <p class="text-xs text-slate-300 mb-2">
              {{ bg.description }}
            </p>
            <a
              v-if="bg.author && bg.author.name"
              :href="bg.author.url"
              target="_blank"
              rel="noopener noreferrer"
              @click.stop
              class="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-400"
            >
              <Icon name="heroicons:user" size="14" />
              <span>{{ bg.author.name }}</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, onMounted } from "vue";
import { backgrounds } from "~/config/backgrounds";
import FpsBadge from "~/components/FpsBadge.vue";
import AuroraWaves from "~/components/bg/AuroraWaves.vue";
import NeuralNoise from "~/components/bg/NeuralNoise.vue";
import ParticleWaves from "~/components/bg/ParticleWaves.vue";
import CosmicAnomaly from "~/components/bg/CosmicAnomaly.vue";
import DNAHelix from "~/components/bg/DNAHelix.vue";
import RibbonFlow from "~/components/bg/RibbonFlow.vue";
import SpectrumCascade from "~/components/bg/SpectrumCascade.vue";
import SombreroDunes from "~/components/bg/SombreroDunes.vue";
import NebulaCurrents from "~/components/bg/NebulaCurrents.vue";
import FluidRipples from "~/components/bg/FluidRipples.vue";
import MetaballOrbit from "~/components/bg/MetaballOrbit.vue";

import gsap from "gsap";

const route = useRoute();
const router = useRouter();

const normalizeQueryValue = (value) =>
  Array.isArray(value) ? value[0] : value;
const logoRef = ref(null);
const logoTextRef = ref(null);
const sectionHeaderRef = ref(null);

const componentMap = {
  AuroraWaves,
  NeuralNoise,
  ParticleWaves,
  CosmicAnomaly,
  DNAHelix,
  RibbonFlow,
  SpectrumCascade,
  SombreroDunes,
  NebulaCurrents,
  FluidRipples,
  MetaballOrbit,
};

const selectedBackgroundComponent = shallowRef(null);
const selectedBackground = ref(null);
const selectedCategory = ref("All");

const persistQuery = (overrides = {}) => {
  const newQuery = { ...route.query };

  if ("bg" in overrides) {
    const bgValue = overrides.bg;
    if (bgValue === null || bgValue === undefined) {
      delete newQuery.bg;
    } else {
      newQuery.bg = `${bgValue}`;
    }
  } else if (selectedBackground.value) {
    newQuery.bg = `${selectedBackground.value.id}`;
  } else {
    delete newQuery.bg;
  }

  router.replace({ query: newQuery });
};

const categories = computed(() => {
  const validBackgrounds = backgrounds.filter((bg) => bg.name && bg.category);
  const categoryMap = {};

  validBackgrounds.forEach((bg) => {
    categoryMap[bg.category] = (categoryMap[bg.category] || 0) + 1;
  });

  const result = [{ name: "All", count: validBackgrounds.length }];

  Object.entries(categoryMap).forEach(([name, count]) => {
    result.push({ name, count });
  });

  return result;
});

const filteredBackgrounds = computed(() => {
  const validBackgrounds = backgrounds.filter((bg) => bg.name);

  if (selectedCategory.value === "All") {
    return validBackgrounds;
  }

  return validBackgrounds.filter(
    (bg) => bg.category === selectedCategory.value,
  );
});

const selectableBackgrounds = computed(() =>
  backgrounds.filter((bg) => componentMap[bg.component] && bg.name),
);

const getNextBackground = () => {
  const available = selectableBackgrounds.value;
  if (available.length === 0) {
    return null;
  }

  if (!selectedBackground.value) {
    return available[0];
  }

  const currentIndex = available.findIndex(
    (bg) => bg.id === selectedBackground.value?.id,
  );
  const nextIndex =
    currentIndex === -1 ? 0 : (currentIndex + 1) % available.length;

  return available[nextIndex];
};

const selectBackground = (bg) => {
  if (!bg) return;

  const component = componentMap[bg.component];
  if (!component) return;

  selectedBackgroundComponent.value = component;
  selectedBackground.value = bg;

  persistQuery({ bg: bg.id });
};

const selectNextBackground = () => {
  const bg = getNextBackground();
  selectBackground(bg);
};

onMounted(() => {
  const available = selectableBackgrounds.value;
  if (!available.length) return;

  const initialBgParam = normalizeQueryValue(route.query.bg);
  const initialBg = initialBgParam
    ? available.find((bg) => `${bg.id}` === `${initialBgParam}`)
    : null;

  selectBackground(initialBg || available[0]);

  if (logoRef.value && logoTextRef.value) {
    gsap.fromTo(
      logoRef.value,
      { opacity: 0, scale: 0.5, rotation: -180 },
      {
        opacity: 1,
        scale: 1,
        rotation: 0,
        duration: 1.2,
        ease: "elastic.out(1, 0.5)",
      },
    );
    gsap.fromTo(
      logoTextRef.value,
      { opacity: 0, x: -20 },
      { opacity: 1, x: 0, duration: 0.8, delay: 0.3, ease: "power2.out" },
    );
  }

  if (sectionHeaderRef.value) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            gsap.fromTo(
              entry.target,
              { opacity: 0, y: 30 },
              { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" },
            );
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 },
    );
    observer.observe(sectionHeaderRef.value);
  }
});

const logos = [
  `<svg class="mx-auto" width="120" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg"><text x="0" y="28" font-family="Arial, sans-serif" font-size="24" font-weight="bold" class="fill-slate-200">Three.js</text></svg>`,
  `<svg class="mx-auto" width="100" height="40" viewBox="0 0 100 40" fill="none" xmlns="http://www.w3.org/2000/svg"><text x="0" y="28" font-family="Arial, sans-serif" font-size="24" font-weight="bold" class="fill-slate-200">WebGL</text></svg>`,
  `<svg class="mx-auto" width="110" height="40" viewBox="0 0 110 40" fill="none" xmlns="http://www.w3.org/2000/svg"><text x="0" y="28" font-family="Arial, sans-serif" font-size="24" font-weight="bold" class="fill-slate-200">Canvas</text></svg>`,
  `<svg class="mx-auto" width="100" height="40" viewBox="0 0 100 40" fill="none" xmlns="http://www.w3.org/2000/svg"><text x="0" y="28" font-family="Arial, sans-serif" font-size="24" font-weight="bold" class="fill-slate-200">P5.js</text></svg>`,
  `<svg class="mx-auto" width="110" height="40" viewBox="0 0 110 40" fill="none" xmlns="http://www.w3.org/2000/svg"><text x="0" y="28" font-family="Arial, sans-serif" font-size="24" font-weight="bold" class="fill-slate-200">GSAP</text></svg>`,
];
</script>

<style scoped>
* {
  font-family: "Poppins", sans-serif;
}

.marquee-inner {
  animation: marqueeScroll 35s linear infinite;
}

@keyframes marqueeScroll {
  0% {
    transform: translateX(0%);
  }
  100% {
    transform: translateX(-50%);
  }
}

.mask-gradient {
  -webkit-mask-image: linear-gradient(
    to right,
    transparent,
    black 10%,
    black 90%,
    transparent
  );
  mask-image: linear-gradient(
    to right,
    transparent,
    black 10%,
    black 90%,
    transparent
  );
}

.bg-fade-enter-active,
.bg-fade-leave-active {
  transition: opacity 0.3s ease;
}

.bg-fade-enter-from {
  opacity: 0;
}

.bg-fade-leave-to {
  opacity: 0;
}
</style>
