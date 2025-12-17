<template>
  <div ref="holderRef" class="absolute inset-0 pointer-events-none">
    <canvas ref="canvasRef" class="block w-full h-full"></canvas>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

const holderRef = ref(null);
const canvasRef = ref(null);
const fpsMeter = useFpsMeter();

let gl = null;
let program = null;
let buffer = null;
let frameId = null;
let startTime = 0;
let devicePixelRatio = 1;

const uniforms = {
  resolution: null,
  time: null,
};

const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;

  varying vec2 v_uv;
  uniform vec2 u_resolution;
  uniform float u_time;

  mat2 rotation(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
  }

  vec3 palette(float t) {
    vec3 deep = vec3(0.06, 0.12, 0.35);
    vec3 highlight = vec3(0.35, 0.20, 0.65);
    vec3 accent = vec3(0.10, 0.45, 0.75);
    return mix(mix(deep, highlight, t), accent, 0.35 + 0.25 * sin(t * 4.0));
  }

  void main() {
    vec2 uv = v_uv - 0.5;
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    uv *= aspect;

    float time = u_time * 0.06;
    vec3 accum = vec3(0.0);
    float mask = 0.0;
    vec2 flow = uv;

    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float layer = fi / 5.0;

      float swirl = 0.7 + 0.15 * fi;
      flow = rotation(time * swirl + sin(flow.y * (1.4 + 0.3 * fi))) * flow;
      flow += 0.08 * vec2(
        sin(flow.y * 3.2 + time * (1.3 + layer)),
        cos(flow.x * 2.8 - time * (0.8 + layer))
      );

      float wave = sin(flow.x * (2.4 + layer * 3.0) + time * (1.2 + layer)) +
                   cos(flow.y * (1.8 + layer * 2.4) - time * (1.0 + layer));

      float envelope = smoothstep(1.1, 0.05, length(flow));
      float energy = envelope * (0.45 + 0.55 * abs(wave));

      accum += palette(layer) * energy;
      mask += envelope * (0.6 + 0.2 * layer);

      flow = rotation(-0.45 + layer * 0.35) * flow;
      flow *= 1.1 - 0.04 * fi;
    }

    float vignette = smoothstep(0.95, 0.2, length(uv));
    vec3 base = vec3(0.015, 0.02, 0.045);
    vec3 color = base + accum * 0.2;
    float alpha = clamp(mask * 0.18 + length(accum) * 0.06, 0.0, 0.65) * vignette;

    gl_FragColor = vec4(color, alpha);
  }
`;

onMounted(() => {
  if (!holderRef.value || !canvasRef.value) return;

  initContext();
  if (!gl || !program) return;

  window.addEventListener("resize", resizeCanvas, { passive: true });

  fpsMeter.start();
  startTime = performance.now();
  resizeCanvas();
  frameId = requestAnimationFrame(renderFrame);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCanvas);

  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }

  fpsMeter.stop();

  if (gl) {
    if (buffer) {
      gl.deleteBuffer(buffer);
      buffer = null;
    }

    if (program) {
      gl.deleteProgram(program);
      program = null;
    }

    gl = null;
  }
});

function initContext() {
  devicePixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
  gl =
    canvasRef.value.getContext("webgl", {
      antialias: false,
      premultipliedAlpha: false,
      alpha: true,
      powerPreference: "high-performance",
    }) || canvasRef.value.getContext("experimental-webgl");

  if (!gl) return;

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

  if (!vertexShader || !fragmentShader) return;

  program = gl.createProgram();
  if (!program) return;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Failed to link program", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    program = null;
    return;
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  gl.useProgram(program);

  const positionLocation = gl.getAttribLocation(program, "a_position");
  buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  uniforms.resolution = gl.getUniformLocation(program, "u_resolution");
  uniforms.time = gl.getUniformLocation(program, "u_time");

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

function resizeCanvas() {
  if (!holderRef.value || !canvasRef.value || !gl || !program) return;

  const { offsetWidth, offsetHeight } = holderRef.value;
  devicePixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);

  const width = Math.max(1, Math.floor(offsetWidth * devicePixelRatio));
  const height = Math.max(1, Math.floor(offsetHeight * devicePixelRatio));

  if (canvasRef.value.width !== width || canvasRef.value.height !== height) {
    canvasRef.value.width = width;
    canvasRef.value.height = height;
    canvasRef.value.style.width = `${offsetWidth}px`;
    canvasRef.value.style.height = `${offsetHeight}px`;
  }

  gl.viewport(0, 0, width, height);
  gl.useProgram(program);
  gl.uniform2f(uniforms.resolution, width, height);
}

function renderFrame(now) {
  if (!gl || !program) return;

  const elapsed = (now - startTime) * 0.001;

  gl.useProgram(program);
  gl.uniform1f(uniforms.time, elapsed);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  fpsMeter.tick();
  frameId = requestAnimationFrame(renderFrame);
}

function compileShader(type, source) {
  if (!gl) return null;
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}
</script>
