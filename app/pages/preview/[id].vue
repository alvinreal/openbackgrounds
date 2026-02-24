<template>
  <div
    class="fixed inset-0 w-full h-full overflow-hidden bg-gradient-to-b from-black to-[#1A0033]"
  >
    <component :is="bgComponent" v-if="bgComponent" />
  </div>
</template>

<script setup>
import { shallowRef } from "vue";
import { backgrounds } from "@/config/backgrounds";
import AuroraWaves from "@/components/bg/AuroraWaves.vue";
import NeuralNoise from "@/components/bg/NeuralNoise.vue";
import ParticleWaves from "@/components/bg/ParticleWaves.vue";
import CosmicAnomaly from "@/components/bg/CosmicAnomaly.vue";
import DNAHelix from "@/components/bg/DNAHelix.vue";
import RibbonFlow from "@/components/bg/RibbonFlow.vue";
import SpectrumCascade from "@/components/bg/SpectrumCascade.vue";
import SombreroDunes from "@/components/bg/SombreroDunes.vue";
import NebulaCurrents from "@/components/bg/NebulaCurrents.vue";
import FluidRipples from "@/components/bg/FluidRipples.vue";
import MetaballOrbit from "@/components/bg/MetaballOrbit.vue";

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

const route = useRoute();
const background = backgrounds.find((bg) => bg.id === route.params.id);

if (!background) {
  throw createError({ statusCode: 404, message: "Background not found" });
}

const bgComponent = shallowRef(componentMap[background.component]);

useHead({
  title: `Preview: ${background.name || background.id}`,
  bodyAttrs: {
    class: "overflow-hidden",
  },
});
</script>
