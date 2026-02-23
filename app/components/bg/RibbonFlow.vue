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
let frameId = null;
let devicePixelRatio = 1;
let startTime = 0;

const meshData = {
  vertexBuffer: null,
  indexBuffer: null,
  indexCount: 0,
  resolution: 128,
};

const state = {
  uniforms: {},
};

const vertexShaderSource = `
  precision mediump float;

  attribute vec3 a_position;

  uniform float u_time;
  uniform mat4 u_projection;
  uniform mat4 u_modelView;

  varying vec3 vEC;
  varying vec2 vUv;

  float iqhash(float n) {
    return fract(sin(n) * 43758.5453);
  }

  float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = p.x + p.y * 57.0 + 113.0 * p.z;
    return mix(mix(mix(iqhash(n), iqhash(n + 1.0), f.x),
               mix(iqhash(n + 57.0), iqhash(n + 58.0), f.x), f.y),
               mix(mix(iqhash(n + 113.0), iqhash(n + 114.0), f.x),
               mix(iqhash(n + 170.0), iqhash(n + 171.0), f.x), f.y), f.z);
  }

  float waveNoise(vec3 x, float time) {
    return cos(x.z * 4.0) * cos(x.z + time / 10.0 + x.x);
  }

  void main() {
    vec3 pos = a_position;
    vUv = (pos.xy + 1.0) * 0.5;

    vec3 v = vec3(pos.x, 0.0, pos.y);
    vec3 v2 = v;
    vec3 v3 = v;

    v.y = waveNoise(v2, u_time) / 8.0;

    v3.x -= u_time / 5.0;
    v3.x /= 4.0;
    v3.z -= u_time / 10.0;
    v3.y -= u_time / 100.0;

    v.z -= noise(v3 * 7.0) / 15.0;
    v.y -= noise(v3 * 7.0) / 15.0 + cos(v.x * 2.0 - u_time / 2.0) / 5.0 - 0.3;

    vEC = v;

    mat4 mvp = u_projection * u_modelView;
    gl_Position = mvp * vec4(v, 1.0);
  }
`;

const fragmentShaderSource = `
  #ifdef GL_OES_standard_derivatives
    #extension GL_OES_standard_derivatives : enable
  #endif

  precision mediump float;

  varying vec3 vEC;
  varying vec2 vUv;

  uniform float u_time;

  vec3 themeColor(float progress) {
    float wave = 0.5 + 0.5 * sin(progress * 3.14159 * 1.4);
    vec3 darkWarm = vec3(0.38, 0.68, 1.0);
    vec3 darkCool = vec3(0.82, 0.45, 0.96);
    return clamp(mix(darkWarm, darkCool, wave), 0.0, 1.0);
  }

  void main() {
    #ifdef GL_OES_standard_derivatives
      vec3 up = vec3(0.0, 0.0, 1.0);
      vec3 x = dFdx(vEC);
      vec3 y = dFdy(vEC);
      vec3 normal = normalize(cross(x, y));
      float c = 1.0 - dot(normal, up);
      c = (1.0 - cos(c * c)) / 3.0;
    #else
      float c = 0.35;
    #endif

    float vignette = 1.0 - length(vUv - 0.5) * 0.8;
    float alpha = clamp(c * vignette * 1.05, 0.0, 1.0);

    vec3 base = vec3(0.05, 0.08, 0.16);
    vec3 accent = themeColor(vUv.x + u_time * 0.05);
    float highlight = pow(c, 1.25);
    vec3 color = mix(base, accent, 0.86) + accent * highlight * 0.36;
    color = clamp(color, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`;

onMounted(() => {
  if (!canvasRef.value || !holderRef.value) return;

  initContext();
  if (!gl || !program) return;

  window.addEventListener("resize", handleResize, { passive: true });

  fpsMeter.start();
  startTime = performance.now();
  frameId = requestAnimationFrame(renderFrame);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);

  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }

  fpsMeter.stop();

  if (gl) {
    if (meshData.vertexBuffer) gl.deleteBuffer(meshData.vertexBuffer);
    if (meshData.indexBuffer) gl.deleteBuffer(meshData.indexBuffer);
    if (program) gl.deleteProgram(program);
  }

  gl = null;
  program = null;
});

function initContext() {
  devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  gl =
    canvasRef.value.getContext("webgl", { antialias: true, alpha: true }) ||
    canvasRef.value.getContext("experimental-webgl");

  if (!gl) return;

  const ext = gl.getExtension("OES_standard_derivatives");

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(
    gl.FRAGMENT_SHADER,
    fragmentShaderSource,
  );
  if (!vertexShader || !fragmentShader) return;

  program = gl.createProgram();
  if (!program) return;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(
      "RibbonFlow: failed to link program",
      gl.getProgramInfoLog(program),
    );
    program = null;
    return;
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  gl.useProgram(program);

  createMesh();

  state.uniforms = {
    u_time: gl.getUniformLocation(program, "u_time"),
    u_projection: gl.getUniformLocation(program, "u_projection"),
    u_modelView: gl.getUniformLocation(program, "u_modelView"),
  };

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  handleResize();
}

function createMesh() {
  const res = meshData.resolution;
  const vertices = [];
  const indices = [];

  for (let y = 0; y <= res; y++) {
    for (let x = 0; x <= res; x++) {
      const u = (x / res) * 2.0 - 1.0;
      const v = (y / res) * 2.0 - 1.0;
      vertices.push(u, v, 0);
    }
  }

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const a = y * (res + 1) + x;
      const b = a + 1;
      const c = a + (res + 1);
      const d = c + 1;

      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  meshData.vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, meshData.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

  meshData.indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshData.indexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW,
  );

  meshData.indexCount = indices.length;

  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.bindBuffer(gl.ARRAY_BUFFER, meshData.vertexBuffer);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(positionLocation);
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(
      `RibbonFlow: shader compile error (${type === gl.VERTEX_SHADER ? "vertex" : "fragment"})`,
      gl.getShaderInfoLog(shader),
    );
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function handleResize() {
  if (!gl || !canvasRef.value || !holderRef.value) return;

  const width = holderRef.value.offsetWidth || window.innerWidth;
  const height = holderRef.value.offsetHeight || window.innerHeight;

  canvasRef.value.width = width * devicePixelRatio;
  canvasRef.value.height = height * devicePixelRatio;
  canvasRef.value.style.width = `${width}px`;
  canvasRef.value.style.height = `${height}px`;

  gl.viewport(0, 0, canvasRef.value.width, canvasRef.value.height);
}

function renderFrame(now) {
  if (!gl || !program) return;

  const elapsed = (now - startTime) * 0.001;
  const aspect = canvasRef.value.width / canvasRef.value.height;

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const projectionMatrix = createPerspectiveMatrix(75, aspect, 0.1, 100);
  const modelViewMatrix = createIdentityMatrix();

  modelViewMatrix[14] = -2.0;

  const scale = aspect * 1.55;
  modelViewMatrix[0] = scale;
  modelViewMatrix[5] = 0.75;

  gl.uniformMatrix4fv(state.uniforms.u_projection, false, projectionMatrix);
  gl.uniformMatrix4fv(state.uniforms.u_modelView, false, modelViewMatrix);
  gl.uniform1f(state.uniforms.u_time, elapsed);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshData.indexBuffer);
  gl.drawElements(gl.TRIANGLES, meshData.indexCount, gl.UNSIGNED_SHORT, 0);

  fpsMeter.tick();
  frameId = requestAnimationFrame(renderFrame);
}

function createPerspectiveMatrix(fovDegrees, aspect, near, far) {
  const fov = (fovDegrees * Math.PI) / 180;
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);

  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ]);
}

function createIdentityMatrix() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
</script>

<style scoped>
canvas {
  width: 100%;
  height: 100%;
  pointer-events: none;
  display: block;
}
</style>
