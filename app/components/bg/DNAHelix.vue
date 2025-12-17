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

const config = {
  segments: 160,
  strands: 2,
  pointsPerSegment: 12,
  turns: Math.PI * 7.2,
  radius: 1.05,
  length: 5.6,
  crossSection: 0.18,
  crossJitter: 0.22,
  rotationSpeed: 0.12,
  driftStrength: 0.22,
  verticalWave: 0.45,
  basePointSize: 30,
  pointScaleFactor: 200,
  maxDpr: 2,
  cameraDistance: 6.4,
  cameraHeight: 0.12,
  pointerInfluence: 0.6,
  fov: 36,
  near: 0.1,
  far: 18,
};

const palette = {
  start: [0.08, 0.24, 0.98],
  end: [0.0, 0.75, 1.0],
  accent: [0.85, 0.32, 1.0],
  alpha: [0.32, 0.68],
};

let gl = null;
let program = null;
let frameId = null;
let resizeObserver = null;

let pointCount = 0;
let pointScaleUniform = 1;
let devicePixelRatio = 1;
let startTime = 0;

const pointer = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
};

const buffers = {
  position: null,
  color: null,
  size: null,
};

const attributeLocations = {
  position: -1,
  color: -1,
  size: -1,
};

const uniformLocations = {
  viewProjection: null,
  pointScale: null,
};

const matrices = {
  projection: new Float32Array(16),
  view: new Float32Array(16),
  viewProjection: new Float32Array(16),
};

const pointMeta = [];
let positionsArray = null;
let colorsArray = null;
let sizeArray = null;

onMounted(() => {
  if (!holderRef.value || !canvasRef.value) return;

  initPoints();
  updateColors();

  if (!initContext()) return;
  initBuffers();

  handleResize();

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(holderRef.value);
  }

  window.addEventListener("resize", handleResize, { passive: true });
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("pointerleave", handlePointerLeave, { passive: true });
  window.addEventListener("touchmove", handleTouchMove, { passive: true });
  window.addEventListener("touchend", handlePointerLeave, { passive: true });

  fpsMeter.start();
  startTime = performance.now();
  frameId = requestAnimationFrame(renderFrame);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerleave", handlePointerLeave);
  window.removeEventListener("touchmove", handleTouchMove);
  window.removeEventListener("touchend", handlePointerLeave);

  if (resizeObserver && holderRef.value) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }

  fpsMeter.stop();

  if (gl) {
    if (buffers.position) gl.deleteBuffer(buffers.position);
    if (buffers.color) gl.deleteBuffer(buffers.color);
    if (buffers.size) gl.deleteBuffer(buffers.size);
    if (program) gl.deleteProgram(program);
  }

  gl = null;
  program = null;
});

function initPoints() {
  pointMeta.length = 0;
  const { segments, strands, pointsPerSegment } = config;
  pointCount = segments * strands * pointsPerSegment;

  positionsArray = new Float32Array(pointCount * 3);
  colorsArray = new Float32Array(pointCount * 4);
  sizeArray = new Float32Array(pointCount);

  let index = 0;
  for (let i = 0; i < segments; i += 1) {
    const t = segments <= 1 ? 0 : i / (segments - 1);
    for (let strand = 0; strand < strands; strand += 1) {
      const strandPhase = strand === 0 ? 0 : Math.PI;
      for (let p = 0; p < pointsPerSegment; p += 1) {
        const crossAngle = Math.random() * Math.PI * 2;
        const crossRadius =
          config.crossSection *
          (0.45 + Math.random() * 0.55 + (strand === 0 ? 0.06 : -0.06));
        const wobble = (Math.random() * 2 - 1) * config.crossJitter;
        const drift = Math.random() * Math.PI * 2;

        pointMeta.push({
          t,
          strandPhase,
          crossAngle,
          crossRadius,
          wobble,
          drift,
        });

        sizeArray[index] = config.basePointSize * (0.7 + Math.random() * 0.9);
        index += 1;
      }
    }
  }
}

function initContext() {
  gl =
    canvasRef.value.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    }) || canvasRef.value.getContext("experimental-webgl");

  if (!gl) return false;

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
  if (!vertexShader || !fragmentShader) return false;

  program = gl.createProgram();
  if (!program) return false;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("DNAHelix: program link error", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    program = null;
    return false;
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  gl.useProgram(program);

  attributeLocations.position = gl.getAttribLocation(program, "a_position");
  attributeLocations.color = gl.getAttribLocation(program, "a_color");
  attributeLocations.size = gl.getAttribLocation(program, "a_size");

  uniformLocations.viewProjection = gl.getUniformLocation(program, "u_viewProjection");
  uniformLocations.pointScale = gl.getUniformLocation(program, "u_pointScale");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.clearColor(0, 0, 0, 0);

  return true;
}

function initBuffers() {
  if (!gl || !program) return;

  buffers.position = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.bufferData(gl.ARRAY_BUFFER, positionsArray.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(attributeLocations.position);
  gl.vertexAttribPointer(attributeLocations.position, 3, gl.FLOAT, false, 0, 0);

  buffers.color = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
  gl.bufferData(gl.ARRAY_BUFFER, colorsArray, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(attributeLocations.color);
  gl.vertexAttribPointer(attributeLocations.color, 4, gl.FLOAT, false, 0, 0);

  buffers.size = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.size);
  gl.bufferData(gl.ARRAY_BUFFER, sizeArray, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(attributeLocations.size);
  gl.vertexAttribPointer(attributeLocations.size, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

function handleResize() {
  if (!gl || !holderRef.value || !canvasRef.value) return;

  const bounds = holderRef.value.getBoundingClientRect();
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);

  devicePixelRatio = Math.min(window.devicePixelRatio || 1, config.maxDpr);

  canvasRef.value.width = width * devicePixelRatio;
  canvasRef.value.height = height * devicePixelRatio;

  gl.viewport(0, 0, canvasRef.value.width, canvasRef.value.height);

  const aspect = width / height;
  const fov = (config.fov * Math.PI) / 180;
  perspective(matrices.projection, fov, aspect, config.near, config.far);

  pointScaleUniform = (height * devicePixelRatio) / config.pointScaleFactor;
}

function renderFrame(now) {
  if (!gl || !program) return;

  if (!startTime) startTime = now;
  const elapsed = (now - startTime) * 0.001;

  pointer.x += (pointer.targetX - pointer.x) * 0.08;
  pointer.y += (pointer.targetY - pointer.y) * 0.08;

  updatePositions(elapsed);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, positionsArray);

  const eyeX = pointer.x * config.pointerInfluence;
  const eyeY = config.cameraHeight + pointer.y * config.pointerInfluence * 0.6;
  const eyeZ = config.cameraDistance;
  const centerX = 0;
  const centerY = pointer.y * 0.4;
  const centerZ = 0;

  lookAt(matrices.view, [eyeX, eyeY, eyeZ], [centerX, centerY, centerZ], [0, 1, 0]);
  multiply(matrices.viewProjection, matrices.projection, matrices.view);

  gl.useProgram(program);
  gl.uniformMatrix4fv(uniformLocations.viewProjection, false, matrices.viewProjection);
  gl.uniform1f(uniformLocations.pointScale, pointScaleUniform);

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.POINTS, 0, pointCount);

  fpsMeter.tick();
  frameId = requestAnimationFrame(renderFrame);
}

function updatePositions(time) {
  const { radius, turns, length, rotationSpeed, driftStrength, verticalWave } = config;

  for (let i = 0; i < pointCount; i += 1) {
    const meta = pointMeta[i];
    const angle = meta.t * turns + meta.strandPhase + time * rotationSpeed;
    const baseRadius = radius + meta.wobble * 0.12 + Math.sin(meta.t * 8 + time * 0.4 + meta.drift) * driftStrength * 0.08;

    const centerX = Math.cos(angle) * (radius + baseRadius * 0.25);
    const centerZ = Math.sin(angle) * (radius + baseRadius * 0.25);

    const swirl = meta.crossAngle + time * 0.2;
    const crossRadius = meta.crossRadius + Math.sin(time * 0.35 + meta.drift) * 0.04;

    const offsetX = Math.cos(swirl) * crossRadius;
    const offsetZ = Math.sin(swirl) * crossRadius;
    const offsetY = Math.sin(swirl * 2.0 + meta.drift + time * 0.25) * verticalWave * 0.12;
    const band = Math.sin(meta.t * Math.PI * 2 + time * 0.35) * driftStrength * 0.18;

    positionsArray[i * 3 + 0] = centerX + offsetX + band * 0.4;
    positionsArray[i * 3 + 1] = (meta.t - 0.5) * length + offsetY + band * 0.6;
    positionsArray[i * 3 + 2] = centerZ + offsetZ;
  }
}

function updateColors() {
  for (let i = 0; i < pointCount; i += 1) {
    const meta = pointMeta[i];
    const t = meta.t;
    const eased = t * t * (3 - 2 * t);
    const base = [
      lerp(palette.start[0], palette.end[0], eased),
      lerp(palette.start[1], palette.end[1], eased),
      lerp(palette.start[2], palette.end[2], eased),
    ];

    const strandFactor = meta.strandPhase === 0 ? 0.24 : 0.48;
    base[0] = clamp01(lerp(base[0], palette.accent[0], strandFactor));
    base[1] = clamp01(lerp(base[1], palette.accent[1], strandFactor));
    base[2] = clamp01(lerp(base[2], palette.accent[2], strandFactor));

    const centerWeight = 1 - Math.abs(t - 0.5) * 1.8;
    const alpha = clamp01(
      palette.alpha[0] + (palette.alpha[1] - palette.alpha[0]) * clamp01(centerWeight + Math.sin(meta.drift) * 0.05)
    );

    colorsArray[i * 4 + 0] = base[0];
    colorsArray[i * 4 + 1] = base[1];
    colorsArray[i * 4 + 2] = base[2];
    colorsArray[i * 4 + 3] = alpha;
  }
}

function uploadColorBuffer() {
  if (!gl || !buffers.color) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, colorsArray);
}

function handlePointerMove(event) {
  pointer.targetX = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.targetY = (event.clientY / window.innerHeight) * 2 - 1;
}

function handlePointerLeave() {
  pointer.targetX = 0;
  pointer.targetY = 0;
}

function handleTouchMove(event) {
  if (!event.touches || event.touches.length === 0) return;
  const touch = event.touches[0];
  pointer.targetX = (touch.clientX / window.innerWidth) * 2 - 1;
  pointer.targetY = (touch.clientY / window.innerHeight) * 2 - 1;
}

function compileShader(type, source) {
  const shader = gl?.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(
      `DNAHelix: shader compile error (${type === gl.VERTEX_SHADER ? "vertex" : "fragment"})`,
      gl.getShaderInfoLog(shader)
    );
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function perspective(out, fovy, aspect, near, far) {
  const f = 1.0 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);

  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;

  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;

  out[8] = 0;
  out[9] = 0;
  out[10] = (far + near) * nf;
  out[11] = -1;

  out[12] = 0;
  out[13] = 0;
  out[14] = 2 * far * near * nf;
  out[15] = 0;
}

function lookAt(out, eye, center, up) {
  let x0 = 0;
  let x1 = 0;
  let x2 = 0;
  let y0 = 0;
  let y1 = 0;
  let y2 = 0;
  let z0 = eye[0] - center[0];
  let z1 = eye[1] - center[1];
  let z2 = eye[2] - center[2];

  let len = Math.hypot(z0, z1, z2);
  if (len === 0) {
    z2 = 1;
  } else {
    z0 /= len;
    z1 /= len;
    z2 /= len;
  }

  x0 = up[1] * z2 - up[2] * z1;
  x1 = up[2] * z0 - up[0] * z2;
  x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2);
  if (len === 0) {
    x0 = 0;
    x1 = 0;
    x2 = 0;
  } else {
    x0 /= len;
    x1 /= len;
    x2 /= len;
  }

  y0 = z1 * x2 - z2 * x1;
  y1 = z2 * x0 - z0 * x2;
  y2 = z0 * x1 - z1 * x0;

  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
}

function multiply(out, a, b) {
  const a00 = a[0],
    a01 = a[1],
    a02 = a[2],
    a03 = a[3];
  const a10 = a[4],
    a11 = a[5],
    a12 = a[6],
    a13 = a[7];
  const a20 = a[8],
    a21 = a[9],
    a22 = a[10],
    a23 = a[11];
  const a30 = a[12],
    a31 = a[13],
    a32 = a[14],
    a33 = a[15];

  const b00 = b[0],
    b01 = b[1],
    b02 = b[2],
    b03 = b[3];
  const b10 = b[4],
    b11 = b[5],
    b12 = b[6],
    b13 = b[7];
  const b20 = b[8],
    b21 = b[9],
    b22 = b[10],
    b23 = b[11];
  const b30 = b[12],
    b31 = b[13],
    b32 = b[14],
    b33 = b[15];

  out[0] = b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30;
  out[1] = b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31;
  out[2] = b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32;
  out[3] = b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33;
  out[4] = b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30;
  out[5] = b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31;
  out[6] = b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32;
  out[7] = b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33;
  out[8] = b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30;
  out[9] = b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31;
  out[10] = b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32;
  out[11] = b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33;
  out[12] = b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30;
  out[13] = b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31;
  out[14] = b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32;
  out[15] = b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33;
}

const vertexShaderSource = `
  precision mediump float;

  attribute vec3 a_position;
  attribute vec4 a_color;
  attribute float a_size;

  uniform mat4 u_viewProjection;
  uniform float u_pointScale;

  varying vec4 v_color;

  void main() {
    vec4 viewPosition = u_viewProjection * vec4(a_position, 1.0);
    gl_Position = viewPosition;
    gl_PointSize = max(1.0, (a_size * u_pointScale) / max(0.0001, viewPosition.w));
    v_color = a_color;
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  varying vec4 v_color;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = dot(uv, uv);
    float alpha = smoothstep(0.24, 0.0, dist);
    float rim = smoothstep(0.18, 0.0, dist);
    vec3 color = mix(v_color.rgb * 1.05, v_color.rgb, rim);
    gl_FragColor = vec4(color, v_color.a * alpha);
  }
`;
</script>
