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

const settings = {
  fieldBase: 420,
  step: 6,
  amplitude: 22,
  baseHeight: -42,
  basePointSize: 28,
  speed: 0.6,
  fov: 52,
  cameraHeight: 82,
  cameraDistance: 320,
  maxDpr: 1.75,
  glow: 3.2,
};

let gl = null;
let program = null;
let frameId = null;
let resizeObserver = null;
let animationStart = 0;
let devicePixelRatio = 1;

let holderWidth = 1;
let holderHeight = 1;

let pointCount = 0;

const pointer = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
};

const layout = {
  xCount: 0,
  zCount: 0,
  width: 0,
  depth: 0,
  step: settings.step,
  xMin: 0,
  zMin: 0,
};

const buffers = {
  position: null,
  color: null,
};

const attributeLocations = {
  position: -1,
  color: -1,
};

const uniformLocations = {
  time: null,
  speed: null,
  size: null,
  field: null,
  projection: null,
  glow: null,
};

const matrices = {
  projection: new Float32Array(16),
  view: new Float32Array(16),
  viewProjection: new Float32Array(16),
};

const fieldUniform = new Float32Array([settings.fieldBase, settings.amplitude, settings.fieldBase]);

onMounted(() => {
  if (!canvasRef.value || !holderRef.value) return;

  initContext();
  if (!gl || !program) return;

  handleResize();

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(holderRef.value);
  }
  window.addEventListener("resize", handleResize, { passive: true });
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("touchmove", handleTouchMove, { passive: true });

  fpsMeter.start();
  animationStart = performance.now();
  frameId = requestAnimationFrame(renderFrame);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("touchmove", handleTouchMove);

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
    if (program) gl.deleteProgram(program);
  }

  gl = null;
  program = null;
});

function initContext() {
  gl =
    canvasRef.value.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
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

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("WaveField: failed to link shader program", gl.getProgramInfoLog(program));
    program = null;
    return;
  }

  gl.useProgram(program);

  attributeLocations.position = gl.getAttribLocation(program, "a_position");
  attributeLocations.color = gl.getAttribLocation(program, "a_color");

  uniformLocations.time = gl.getUniformLocation(program, "u_time");
  uniformLocations.speed = gl.getUniformLocation(program, "u_speed");
  uniformLocations.size = gl.getUniformLocation(program, "u_size");
  uniformLocations.field = gl.getUniformLocation(program, "u_field");
  uniformLocations.projection = gl.getUniformLocation(program, "u_projection");
  uniformLocations.glow = gl.getUniformLocation(program, "u_glow");

  buffers.position = gl.createBuffer();
  buffers.color = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.vertexAttribPointer(attributeLocations.position, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(attributeLocations.position);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
  gl.vertexAttribPointer(attributeLocations.color, 4, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(attributeLocations.color);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.disable(gl.DEPTH_TEST);
}

function handleResize() {
  if (!holderRef.value || !canvasRef.value || !gl) return;

  const rect = holderRef.value.getBoundingClientRect();
  holderWidth = Math.max(1, rect.width);
  holderHeight = Math.max(1, rect.height);

  devicePixelRatio = Math.min(window.devicePixelRatio || 1, settings.maxDpr);
  const canvasWidth = Math.floor(holderWidth * devicePixelRatio);
  const canvasHeight = Math.floor(holderHeight * devicePixelRatio);

  if (canvasRef.value.width !== canvasWidth || canvasRef.value.height !== canvasHeight) {
    canvasRef.value.width = canvasWidth;
    canvasRef.value.height = canvasHeight;
    canvasRef.value.style.width = `${holderWidth}px`;
    canvasRef.value.style.height = `${holderHeight}px`;
    gl.viewport(0, 0, canvasWidth, canvasHeight);
  }

  rebuildGrid();
}

function rebuildGrid(options = {}) {
  if (!gl || !program) return;

  const onlyColors = options.onlyColors ?? false;
  const aspect = holderHeight === 0 ? 1 : holderWidth / holderHeight;

  const baseWidth = settings.fieldBase * Math.max(1, aspect);
  const baseDepth = settings.fieldBase;

  const step = settings.step;
  const xSegments = Math.max(24, Math.round(baseWidth / step));
  const zSegments = Math.max(24, Math.round(baseDepth / step));

  layout.xCount = xSegments + 1;
  layout.zCount = zSegments + 1;
  layout.width = xSegments * step;
  layout.depth = zSegments * step;
  layout.step = step;
  layout.xMin = -layout.width * 0.5;
  layout.zMin = -layout.depth * 0.5;

  pointCount = layout.xCount * layout.zCount;
  fieldUniform[0] = layout.width;
  fieldUniform[1] = settings.amplitude;
  fieldUniform[2] = layout.depth;

  if (!onlyColors) {
    const positions = new Float32Array(pointCount * 3);
    let ptr = 0;
    for (let xi = 0; xi < layout.xCount; xi += 1) {
      const x = layout.xMin + xi * step;
      for (let zi = 0; zi < layout.zCount; zi += 1) {
        const z = layout.zMin + zi * step;
        positions[ptr++] = x;
        positions[ptr++] = settings.baseHeight;
        positions[ptr++] = z;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
  }

  const colors = new Float32Array(pointCount * 4);
  let cptr = 0;
  for (let xi = 0; xi < layout.xCount; xi += 1) {
    const t = layout.xCount > 1 ? xi / (layout.xCount - 1) : 0;
    for (let zi = 0; zi < layout.zCount; zi += 1) {
      const depthT = layout.zCount > 1 ? zi / (layout.zCount - 1) : 0;
      const [r, g, b, a] = samplePalette(t, depthT);
      colors[cptr++] = r;
      colors[cptr++] = g;
      colors[cptr++] = b;
      colors[cptr++] = a;
    }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
}

function renderFrame(now) {
  if (!gl || !program) return;

  pointer.x += (pointer.targetX - pointer.x) * 0.08;
  pointer.y += (pointer.targetY - pointer.y) * 0.08;

  const elapsed = (now - animationStart) * 0.001;
  const aspect = holderHeight === 0 ? 1 : holderWidth / holderHeight;
  const fov = (settings.fov * Math.PI) / 180;

  perspective(matrices.projection, fov, aspect, 0.1, 1000);

  const eyeX = pointer.x * 32;
  const eyeY = settings.cameraHeight - pointer.y * 24;
  const eyeZ = settings.cameraDistance - pointer.y * 60;
  const centerX = pointer.x * 20;
  const centerY = settings.baseHeight;
  const centerZ = 0;

  lookAt(matrices.view, [eyeX, eyeY, eyeZ], [centerX, centerY, centerZ], [0, 1, 0]);
  multiply(matrices.viewProjection, matrices.projection, matrices.view);

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.uniform1f(uniformLocations.time, elapsed);
  gl.uniform1f(uniformLocations.speed, settings.speed);
  gl.uniform1f(uniformLocations.size, settings.basePointSize * devicePixelRatio);
  gl.uniform3fv(uniformLocations.field, fieldUniform);
  gl.uniformMatrix4fv(uniformLocations.projection, false, matrices.viewProjection);
  gl.uniform1f(uniformLocations.glow, settings.glow);

  gl.drawArrays(gl.POINTS, 0, pointCount);

  fpsMeter.tick();
  frameId = requestAnimationFrame(renderFrame);
}

function handlePointerMove(event) {
  pointer.targetX = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.targetY = (event.clientY / window.innerHeight) * 2 - 1;
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
      `WaveField: shader compile error (${type === gl.VERTEX_SHADER ? "vertex" : "fragment"})`,
      gl.getShaderInfoLog(shader)
    );
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function samplePalette(positionRatio, depthRatio) {
  const clampedT = clamp01(positionRatio);
  const clampedDepth = clamp01(depthRatio);
  const wave = Math.sin((clampedT + clampedDepth * 0.65) * Math.PI * 1.5);

  const start = [0.14, 0.72, 1.0];
  const end = [1.0, 0.32, 0.95];

  const mixRatio = clamp01(0.25 + 0.55 * clampedT + 0.2 * wave);
  const fade = 0.55 + 0.35 * (1 - clampedDepth);

  const r = clamp01(lerp(start[0], end[0], mixRatio) * fade);
  const g = clamp01(lerp(start[1], end[1], mixRatio) * (0.92 + 0.08 * Math.sin(clampedDepth * 6)));
  const b = clamp01(lerp(start[2], end[2], mixRatio) * (0.85 + 0.12 * Math.cos(clampedT * 5)));
  const alpha = clamp01(0.9 + (1 - clampedDepth) * 0.1);

  return [r, g, b, alpha];
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
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
  #define M_PI 3.1415926535897932384626433832795

  attribute vec3 a_position;
  attribute vec4 a_color;

  uniform float u_time;
  uniform float u_speed;
  uniform float u_size;
  uniform vec3 u_field;
  uniform mat4 u_projection;

  varying vec4 v_color;

  void main() {
    vec3 pos = a_position;
    float waveX = cos((pos.x / u_field.x) * M_PI * 6.0 + u_time * u_speed);
    float waveZ = sin((pos.z / u_field.z) * M_PI * 6.0 + u_time * u_speed * 0.75);
    pos.y += (waveX + waveZ) * u_field.y;

    gl_Position = u_projection * vec4(pos, 1.0);
    float perspectiveSize = u_size / max(gl_Position.w, 0.25);
    gl_PointSize = clamp(perspectiveSize, 4.0, 120.0);

    v_color = a_color;
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  varying vec4 v_color;
  uniform float u_glow;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float dist = dot(uv, uv);
    if (dist > 1.0) {
      discard;
    }

    float falloff = pow(1.0 - clamp(dist, 0.0, 1.0), 2.3);
    vec3 color = v_color.rgb * (1.0 + falloff * u_glow);
    float alpha = falloff * v_color.a;

    gl_FragColor = vec4(color, alpha);
  }
`;
</script>
