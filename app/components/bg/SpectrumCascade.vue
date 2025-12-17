<template>
  <div ref="holderRef" class="absolute inset-0 pointer-events-none overflow-hidden">
    <canvas ref="canvasRef" class="block w-full h-full"></canvas>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

const holderRef = ref(null);
const canvasRef = ref(null);

const fpsMeter = useFpsMeter();

const config = {
  maxDpr: 1.8,
  stripeCount: 18,
  minStripeWidth: 0.06,
  maxStripeWidth: 0.14,
  floatStrength: 0.1,
  pulseStrength: 0.24,
  baseSpeed: 0.16,
};

const themeSettings = {
  dark: {
    background: ["#030212", "#14052c"],
    palette: [
      "#1f2d92",
      "#123d9c",
      "#0f5894",
      "#136c8b",
      "#1e6f66",
      "#3f4f8f",
      "#5a2c82",
      "#7a2671",
    ],
    overlay: {
      center: [0.58, 0.4],
      radius: 1.08,
      inner: "rgba(42,18,74,0.22)",
      outer: "rgba(14,6,32,0)",
    },
    vignette: "rgba(4, 1, 20, 0.78)",
    edgeLight: "rgba(120, 90, 210, 0.12)",
    haze: "rgba(8, 10, 26, 0.45)",
  },
};

let ctx = null;
let width = 0;
let height = 0;
let dpr = 1;
let frameId = null;
let resizeObserver = null;
let startTime = 0;
let stripes = [];

onMounted(() => {
  if (!holderRef.value || !canvasRef.value) return;

  ctx = canvasRef.value.getContext("2d", { alpha: true });
  if (!ctx) return;

  handleResize();
  buildStripes();

  window.addEventListener("resize", handleResize, { passive: true });

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(holderRef.value);
  }

  fpsMeter.start();
  startTime = performance.now();
  frameId = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }

  fpsMeter.stop();
});

function loop(now) {
  const elapsed = (now - startTime) / 1000;
  draw(elapsed);
  fpsMeter.tick();
  frameId = requestAnimationFrame(loop);
}

function handleResize() {
  if (!holderRef.value || !canvasRef.value || !ctx) return;

  width = holderRef.value.clientWidth || window.innerWidth || 1;
  height = holderRef.value.clientHeight || window.innerHeight || 1;

  dpr = Math.min(window.devicePixelRatio || 1, config.maxDpr);
  canvasRef.value.width = Math.max(1, Math.floor(width * dpr));
  canvasRef.value.height = Math.max(1, Math.floor(height * dpr));
  canvasRef.value.style.width = `${width}px`;
  canvasRef.value.style.height = `${height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function buildStripes() {
  const theme = themeSettings.dark;
  const palette = theme.palette;
  const count = config.stripeCount;
  stripes = [];

  for (let i = 0; i < count; i += 1) {
    const spacing = 1 / count;
    const jitter = spacing * 0.45;
    const baseCenter =
      spacing * (i + 0.5) + (Math.random() - 0.5) * jitter;

    stripes.push({
      baseColor: palette[i % palette.length],
      center: clamp(baseCenter, -0.18, 1.18),
      floatAmplitude: config.floatStrength * (0.6 + Math.random() * 0.9),
      speed:
        config.baseSpeed *
        (0.7 + Math.random() * 0.8) *
        (Math.random() < 0.5 ? -1 : 1),
      pulseSpeed: config.baseSpeed * 2.1 * (0.6 + Math.random()),
      width:
        config.minStripeWidth +
        Math.random() * (config.maxStripeWidth - config.minStripeWidth),
      phase: Math.random() * Math.PI * 2,
      sheenPhase: Math.random() * Math.PI * 2,
      blurScale: 0.4 + Math.random() * 1.1,
      alpha: 0.18 + Math.random() * 0.18,
    });
  }
}

function draw(time) {
  if (!ctx || !width || !height) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);

  const theme = themeSettings.dark;
  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, theme.background[0]);
  background.addColorStop(1, theme.background[1]);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  stripes.forEach((stripe) => {
    const drift = Math.sin(time * stripe.speed + stripe.phase);
    const wave = (Math.sin(time * stripe.pulseSpeed + stripe.sheenPhase) + 1) * 0.5;

    const center =
      stripe.center + drift * stripe.floatAmplitude;
    const stripeWidth =
      width *
      stripe.width *
      (1 + (wave - 0.5) * config.pulseStrength * 2.4);

    const x = center * width;
    const gradient = ctx.createLinearGradient(
      x - stripeWidth * 0.6,
      0,
      x + stripeWidth * 0.6,
      height
    );

    gradient.addColorStop(
      0,
      adjustColor(stripe.baseColor, -0.5 + wave * -0.2)
    );
    gradient.addColorStop(0.5, adjustColor(stripe.baseColor, 0.18 + wave * 0.32));
    gradient.addColorStop(
      1,
      adjustColor(stripe.baseColor, -0.25 + wave * 0.1)
    );

    const blurAmount =
      10 + Math.max(width, height) * 0.012 * stripe.blurScale;

    ctx.save();
    ctx.globalAlpha = stripe.alpha * (0.7 + wave * 0.4);
    ctx.filter = `blur(${blurAmount.toFixed(2)}px)`;
    ctx.fillStyle = gradient;
    ctx.fillRect(
      x - stripeWidth * 0.65,
      -height * 0.2,
      stripeWidth * 1.3,
      height * 1.4
    );
    ctx.restore();
  });
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  const overlay = theme.overlay;
  const radial = ctx.createRadialGradient(
    width * overlay.center[0],
    height * overlay.center[1],
    0,
    width * overlay.center[0],
    height * overlay.center[1],
    Math.max(width, height) * overlay.radius
  );
  radial.addColorStop(0, overlay.inner);
  radial.addColorStop(1, overlay.outer);
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const beam = ctx.createLinearGradient(0, 0, width, 0);
  beam.addColorStop(0.05, "rgba(255,255,255,0)");
  beam.addColorStop(0.5, theme.edgeLight);
  beam.addColorStop(0.95, "rgba(255,255,255,0)");
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  const vignette = ctx.createRadialGradient(
    width / 2,
    height * 0.54,
    Math.max(width, height) * 0.1,
    width / 2,
    height * 0.54,
    Math.max(width, height) * 0.85
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, theme.vignette);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = theme.haze;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function adjustColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const clampAmount = clamp(Math.abs(amount), 0, 1);
  const target = amount < 0 ? 0 : 255;

  const newR = Math.round(r + (target - r) * clampAmount);
  const newG = Math.round(g + (target - g) * clampAmount);
  const newB = Math.round(b + (target - b) * clampAmount);

  return rgbToHex(newR, newG, newB);
}

function hexToRgb(hex) {
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((char) => char + char)
      .join("");
  }

  const bigint = Number.parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((value) => {
        const clamped = clamp(Math.round(value), 0, 255);
        return clamped.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
</script>
