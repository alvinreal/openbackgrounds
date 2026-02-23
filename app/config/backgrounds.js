export const backgrounds = [
  {
    id: "aurora-waves",
    component: "AuroraWaves",
    name: "Aurora Waves",
    description: "Flowing aurora-inspired bezier waves rendered on canvas.",
    category: "Canvas",
    author: {},
  },
  {
    id: "neural-noise",
    component: "NeuralNoise",
    name: "Neural Noise",
    description: "Hypnotic WebGL noise inspired by generative neural visuals.",
    category: "WebGL",
    author: {},
  },
  {
    id: "particle-waves",
    component: "ParticleWaves",
    name: "Particle Waves",
    description:
      "Animated 3D particle field with wave motion rendered in WebGL.",
    category: "WebGL",
    author: {
      name: "Boris Šehovac",
      url: "https://codepen.io/bsehovac",
    },
  },
  {
    id: "cosmic-anomaly",
    component: "CosmicAnomaly",
    name: "Cosmic Anomaly",
    description:
      "Swirling cosmic bloom of particles with interactive parallax depth.",
    category: "WebGL",
    author: {
      name: "Techartist",
      url: "https://codepen.io/VoXelo",
    },
  },
  {
    id: "sombrero-dunes",
    component: "SombreroDunes",
    name: "Sombrero Dunes",
    description:
      "Lavender wireframe dunes pulsing with layered perlin sombrero waves.",
    category: "WebGL",
    author: {},
  },
  {
    id: "dna-helix",
    component: "DNAHelix",
    name: "DNA Helix",
    description: "Glowing double helix rendered with additive WebGL particles.",
    category: "WebGL",
    author: {},
  },
  {
    id: "ribbon-flow",
    component: "RibbonFlow",
    name: "Ribbon Flow",
    description:
      "Flowing ribbon with organic wave motion and noise deformation in WebGL.",
    category: "WebGL",
    author: {
      name: "Boris Šehovac",
      url: "https://codepen.io/bsehovac",
    },
  },
  {
    id: "spectrum-cascade",
    component: "SpectrumCascade",
    name: "Spectrum Cascade",
    description:
      "Soft-focus spectral bands with cascading color gradients rendered on canvas.",
    category: "Canvas",
    author: {},
  },
  {
    id: "nebula-currents",
    component: "NebulaCurrents",
    name: "Nebula Currents",
    description:
      "Layered spectral flows that drift like nebular currents across a deep sky.",
    category: "WebGL",
    author: {
      name: "Ksenia Kondrashova",
      url: "https://codepen.io/ksenia-k",
    },
  },
  {
    id: "fluid-ripples",
    component: "FluidRipples",
    name: "Fluid Ripples",
    description:
      "Interactive fluid simulation with swirling ripples and vorticity dynamics.",
    category: "WebGL",
    author: {
      name: "Filip Zrnzevic",
      url: "https://codepen.io/filipz",
    },
  },
  {
    id: "metaball-orbit",
    component: "MetaballOrbit",
    name: "Metaball Orbit",
    description:
      "Organic metaballs with ray marching, smooth blending, and mouse interaction.",
    category: "WebGL",
    author: {
      name: "Filip Zrnzevic",
      url: "https://codepen.io/filipz",
    },
  },
];

export const getBackgroundById = (id) => {
  return backgrounds.find((bg) => bg.id === id);
};

export const getBackgroundsByCategory = (category) => {
  return backgrounds.filter((bg) => bg.category === category);
};
