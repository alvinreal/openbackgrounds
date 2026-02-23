<template>
  <div ref="holderRef" class="absolute inset-0 pointer-events-none">
    <canvas ref="canvasRef" class="block w-full h-full"></canvas>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

const holderRef = ref(null);
const canvasRef = ref(null);

let animationInstance = null;

const fpsMeter = useFpsMeter();

onMounted(() => {
  if (!holderRef.value || !canvasRef.value) return;

  animationInstance = new WavesAnimation(holderRef.value, canvasRef.value, {
    fpsMeter,
  });
  animationInstance.start();
});

onBeforeUnmount(() => {
  if (animationInstance) {
    animationInstance.destroy();
    animationInstance = null;
  }
});

const TAU = Math.PI * 2;

const defaults = {
  resize: true,
  rotation: 45,
  waves: 3,
  width: 160,
  hue: [11, 24],
  amplitude: 0.5,
  background: true,
  preload: true,
  speed: [0.0035, 0.0075],
  debug: false,
};

class WavesAnimation {
  constructor(holder, canvas, options = {}) {
    this.holder = holder;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    const { fpsMeter, ...rest } = options;
    this.options = { ...defaults, ...rest };

    this.waves = [];
    this.frameId = null;
    this.scale = 1;

    this.fpsMeter = fpsMeter ?? null;

    this.hue = this.options.hue[0];
    this.hueForward = true;

    this.backgroundTop = "#080015";

    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);

    this.init(this.options.preload);
    this.resize();

    if (this.options.resize) {
      window.addEventListener("resize", this.resize, { passive: true });
    }
  }

  init(preload) {
    this.waves = [];

    for (let i = 0; i < this.options.waves; i += 1) {
      this.waves.push(new Wave(this));
    }

    if (preload) {
      this.preload();
    }
  }

  preload() {
    for (let i = 0; i < this.options.waves; i += 1) {
      this.updateColor();
      for (let j = 0; j < this.options.width; j += 1) {
        this.waves[i].update();
      }
    }
  }

  start() {
    if (this.frameId) return;
    this.fpsMeter?.start();
    this.loop();
  }

  loop() {
    this.render();
    this.fpsMeter?.tick();
    this.frameId = window.requestAnimationFrame(this.loop);
  }

  render() {
    this.updateColor();
    this.clear();

    if (this.options.background) {
      this.background();
    }

    this.ctx.save();
    this.ctx.globalCompositeOperation = "lighter";

    this.waves.forEach((wave) => {
      wave.update();
      wave.draw();
    });

    this.ctx.restore();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  background() {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, this.backgroundTop);
    gradient.addColorStop(1, this.color);

    this.ctx.save();
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.restore();
  }

  resize() {
    const width = this.holder.offsetWidth || window.innerWidth;
    const height = this.holder.offsetHeight || window.innerHeight;
    this.scale = window.devicePixelRatio || 1;

    this.width = width * this.scale;
    this.height = height * this.scale;

    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.radius = Math.sqrt(this.width ** 2 + this.height ** 2) / 2;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;

    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.lineWidth = 1.6;
  }

  updateColor() {
    this.hue += this.hueForward ? 0.01 : -0.01;

    if (this.hue > this.options.hue[1] && this.hueForward) {
      this.hue = this.options.hue[1];
      this.hueForward = false;
    } else if (this.hue < this.options.hue[0] && !this.hueForward) {
      this.hue = this.options.hue[0];
      this.hueForward = true;
    }

    const r = Math.floor(127 * Math.sin(0.3 * this.hue + 0) + 128);
    const g = Math.floor(127 * Math.sin(0.3 * this.hue + 2) + 128);
    const b = Math.floor(127 * Math.sin(0.3 * this.hue + 4) + 128);

    this.color = `rgba(${r}, ${g}, ${b}, 0.32)`;
  }

  destroy() {
    if (this.frameId) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    this.fpsMeter?.stop();

    if (this.options.resize) {
      window.removeEventListener("resize", this.resize);
    }

    this.clear();
    this.waves = [];
  }
}

class Wave {
  constructor(owner) {
    this.owner = owner;
    this.lines = [];

    const [minSpeed, maxSpeed] = owner.options.speed;

    this.angle = [random(TAU), random(TAU), random(TAU), random(TAU)];

    this.speed = [
      random(minSpeed, maxSpeed) * randomSign(),
      random(minSpeed, maxSpeed) * randomSign(),
      random(minSpeed, maxSpeed) * randomSign(),
      random(minSpeed, maxSpeed) * randomSign(),
    ];
  }

  update() {
    this.lines.push(new Line(this, this.owner.color));
    if (this.lines.length > this.owner.options.width) {
      this.lines.shift();
    }
  }

  draw() {
    const ctx = this.owner.ctx;
    const rotation = degToRad(this.owner.options.rotation);
    const amplitude = this.owner.options.amplitude;
    const radius = this.owner.radius;
    const radiusThird = radius / 3;
    const x = this.owner.centerX;
    const y = this.owner.centerY;
    const debug = this.owner.options.debug;

    this.lines.forEach((line, index) => {
      if (debug && index > 0) return;

      const angle = line.angle;

      const x1 = x - radius * Math.cos(angle[0] * amplitude + rotation);
      const y1 = y - radius * Math.sin(angle[0] * amplitude + rotation);
      const x2 = x + radius * Math.cos(angle[3] * amplitude + rotation);
      const y2 = y + radius * Math.sin(angle[3] * amplitude + rotation);
      const cpx1 = x - radiusThird * Math.cos(angle[1] * amplitude * 2);
      const cpy1 = y - radiusThird * Math.sin(angle[1] * amplitude * 2);
      const cpx2 = x + radiusThird * Math.cos(angle[2] * amplitude * 2);
      const cpy2 = y + radiusThird * Math.sin(angle[2] * amplitude * 2);

      ctx.strokeStyle = debug ? "#fff" : line.color;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, x2, y2);
      ctx.stroke();

      if (debug) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(cpx1, cpy1);
        ctx.moveTo(x2, y2);
        ctx.lineTo(cpx2, cpy2);
        ctx.stroke();
        ctx.restore();
      }
    });
  }
}

class Line {
  constructor(wave, color) {
    this.color = color;

    const angle = wave.angle;
    const speed = wave.speed;

    angle[0] += speed[0];
    angle[1] += speed[1];
    angle[2] += speed[2];
    angle[3] += speed[3];

    this.angle = [
      Math.sin(angle[0]),
      Math.sin(angle[1]),
      Math.sin(angle[2]),
      Math.sin(angle[3]),
    ];
  }
}

const random = (min, max) => {
  if (typeof max === "undefined") {
    return Math.random() * min;
  }
  return min + Math.random() * (max - min);
};

const randomSign = () => (Math.random() > 0.5 ? 1 : -1);

const degToRad = (deg) => (deg * Math.PI) / 180;
</script>

<style scoped>
canvas {
  pointer-events: none;
  width: 100%;
  height: 100%;
  display: block;
}
</style>
