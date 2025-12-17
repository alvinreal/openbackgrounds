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

// Water simulation buffers
const resolution = 256;
let waterBuffers = {
  current: new Float32Array(resolution * resolution),
  previous: new Float32Array(resolution * resolution),
  velocity: new Float32Array(resolution * resolution * 2),
  vorticity: new Float32Array(resolution * resolution),
};

let waterTexture = null;

// Mouse tracking
let lastMousePosition = { x: 0, y: 0 };
let mouseThrottleTime = 0;

// Settings
const settings = {
  damping: 0.913,
  tension: 0.02,
  mouseIntensity: 1.2,
  clickIntensity: 3.0,
  rippleRadius: 8,
  splatForce: 50000,
  vorticityInfluence: 0.2,
  velocityDissipation: 0.08,
  densityDissipation: 1.0,
  waterStrength: 0.55,
  animationSpeed: 1.3,
};

// Initialize water buffers
for (let i = 0; i < resolution * resolution; i++) {
  waterBuffers.current[i] = 0.0;
  waterBuffers.previous[i] = 0.0;
  waterBuffers.velocity[i * 2] = 0.0;
  waterBuffers.velocity[i * 2 + 1] = 0.0;
  waterBuffers.vorticity[i] = 0.0;
}

const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 vUv;

  void main() {
    vUv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0., 1.);
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform vec3 u_color3;
  uniform vec3 u_background;
  uniform float u_speed;
  uniform sampler2D u_waterTexture;
  uniform float u_waterStrength;
  
  varying vec2 vUv;

  // Manual tanh approximation for WebGL 1.0
  float tanh_approx(float x) {
    float x2 = x * x;
    return clamp(x * (27.0 + x2) / (27.0 + 9.0 * x2), -1.0, 1.0);
  }

  void main() {
    vec2 r = u_resolution;
    vec2 FC = gl_FragCoord.xy;
    vec2 screenP = (FC.xy * 2.0 - r) / r.y;
    
    // Sample water texture
    vec2 wCoord = vec2(FC.x / r.x, FC.y / r.y);
    float waterHeight = texture2D(u_waterTexture, wCoord).r;
    float waterInfluence = clamp(waterHeight * u_waterStrength, -0.5, 0.5);
    
    // Create circular vignette
    float baseRadius = 0.9;
    float waterPulse = waterInfluence * 0.3;
    float circleRadius = baseRadius + waterPulse;
    
    float distFromCenter = length(screenP);
    float inCircle = smoothstep(circleRadius + 0.12, circleRadius - 0.12, distFromCenter);
    
    // Gentle edge fade to keep center bright
    float edgeFade = smoothstep(1.0, 0.2, distFromCenter);
    
    vec4 o = vec4(0.0);
    
    if (inCircle > 0.0) {
      vec2 p = screenP * 1.1;
      
      float totalWaterInfluence = clamp(waterInfluence * u_waterStrength, -0.8, 0.8);
      
      // Rotation based on distance
      float angle = length(p) * 4.0;
      mat2 R = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      p *= R;
      
      float l = length(p) - 0.7 + totalWaterInfluence * 0.5;
      float t = u_time * u_speed + totalWaterInfluence * 2.0;
      float enhancedY = p.y + totalWaterInfluence * 0.3;
      
      // Three-layer pattern for RGB channels
      float pattern1 = 0.5 + 0.5 * tanh_approx(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t));
      float pattern2 = 0.5 + 0.5 * tanh_approx(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t + 1.0));
      float pattern3 = 0.5 + 0.5 * tanh_approx(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t + 2.0));
      
      // Balanced intensity - bright center, dimmer edges
      float intensity = 0.7 + totalWaterInfluence * 0.4;
      intensity *= edgeFade;
      
      o.r = pattern1 * u_color1.r * intensity;
      o.g = pattern2 * u_color2.g * intensity;
      o.b = pattern3 * u_color3.b * intensity;
      o.a = inCircle * edgeFade;
    }
    
    vec3 bgColor = u_background;
    vec3 finalColor = mix(bgColor, o.rgb, o.a * 0.65);
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  
  return shader;
}

function initContext() {
  devicePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  gl = canvasRef.value.getContext("webgl", { 
    antialias: true, 
    alpha: false,
    premultipliedAlpha: false 
  });

  if (!gl) {
    console.error("WebGL not supported");
    return false;
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

  if (!vertexShader || !fragmentShader) return false;

  program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    return false;
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  gl.useProgram(program);

  // Setup fullscreen quad
  const positionLocation = gl.getAttribLocation(program, "a_position");
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(positionLocation);

  // Create water texture
  waterTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, waterTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Blending
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  resizeCanvas();
  return true;
}

function resizeCanvas() {
  if (!holderRef.value || !canvasRef.value || !gl) return;

  const width = holderRef.value.offsetWidth || window.innerWidth;
  const height = holderRef.value.offsetHeight || window.innerHeight;

  canvasRef.value.width = width * devicePixelRatio;
  canvasRef.value.height = height * devicePixelRatio;
  canvasRef.value.style.width = `${width}px`;
  canvasRef.value.style.height = `${height}px`;

  gl.viewport(0, 0, canvasRef.value.width, canvasRef.value.height);
}

function updateWaterSimulation() {
  const { current, previous, velocity, vorticity } = waterBuffers;
  const { damping, tension, velocityDissipation, densityDissipation, vorticityInfluence } = settings;

  // Apply velocity dissipation
  for (let i = 0; i < resolution * resolution * 2; i++) {
    velocity[i] *= 1.0 - velocityDissipation;
  }

  // Calculate vorticity
  for (let i = 1; i < resolution - 1; i++) {
    for (let j = 1; j < resolution - 1; j++) {
      const index = i * resolution + j;
      const left = velocity[(index - 1) * 2 + 1];
      const right = velocity[(index + 1) * 2 + 1];
      const bottom = velocity[(index - resolution) * 2];
      const top = velocity[(index + resolution) * 2];
      vorticity[index] = (right - left - (top - bottom)) * 0.5;
    }
  }

  // Apply vorticity forces
  if (vorticityInfluence > 0.001) {
    for (let i = 1; i < resolution - 1; i++) {
      for (let j = 1; j < resolution - 1; j++) {
        const index = i * resolution + j;
        const velIndex = index * 2;
        
        const left = Math.abs(vorticity[index - 1]);
        const right = Math.abs(vorticity[index + 1]);
        const bottom = Math.abs(vorticity[index - resolution]);
        const top = Math.abs(vorticity[index + resolution]);
        
        const gradX = (right - left) * 0.5;
        const gradY = (top - bottom) * 0.5;
        const length = Math.sqrt(gradX * gradX + gradY * gradY) + 1e-5;
        
        const safeVorticity = Math.max(-1.0, Math.min(1.0, vorticity[index]));
        const forceX = (gradY / length) * safeVorticity * vorticityInfluence * 0.1;
        const forceY = (-gradX / length) * safeVorticity * vorticityInfluence * 0.1;
        
        velocity[velIndex] += Math.max(-0.1, Math.min(0.1, forceX));
        velocity[velIndex + 1] += Math.max(-0.1, Math.min(0.1, forceY));
      }
    }
  }

  // Water wave simulation
  for (let i = 1; i < resolution - 1; i++) {
    for (let j = 1; j < resolution - 1; j++) {
      const index = i * resolution + j;
      const velIndex = index * 2;
      
      const top = previous[index - resolution];
      const bottom = previous[index + resolution];
      const left = previous[index - 1];
      const right = previous[index + 1];
      
      current[index] = (top + bottom + left + right) / 2 - current[index];
      current[index] = current[index] * damping + previous[index] * (1 - damping);
      current[index] += (0 - previous[index]) * tension;
      
      const velMagnitude = Math.sqrt(
        velocity[velIndex] * velocity[velIndex] +
        velocity[velIndex + 1] * velocity[velIndex + 1]
      );
      const safeVelInfluence = Math.min(velMagnitude * 0.01, 0.1);
      current[index] += safeVelInfluence;
      
      current[index] *= 1.0 - densityDissipation * 0.01;
      current[index] = Math.max(-2.0, Math.min(2.0, current[index]));
    }
  }

  // Zero boundary conditions
  for (let i = 0; i < resolution; i++) {
    current[i] = 0;
    current[(resolution - 1) * resolution + i] = 0;
    current[i * resolution] = 0;
    current[i * resolution + (resolution - 1)] = 0;
    
    velocity[i * 2] = 0;
    velocity[i * 2 + 1] = 0;
    velocity[((resolution - 1) * resolution + i) * 2] = 0;
    velocity[((resolution - 1) * resolution + i) * 2 + 1] = 0;
    velocity[i * resolution * 2] = 0;
    velocity[i * resolution * 2 + 1] = 0;
    velocity[(i * resolution + (resolution - 1)) * 2] = 0;
    velocity[(i * resolution + (resolution - 1)) * 2 + 1] = 0;
  }

  // Swap buffers
  [waterBuffers.current, waterBuffers.previous] = [waterBuffers.previous, waterBuffers.current];

  // Update texture
  if (gl && waterTexture) {
    gl.bindTexture(gl.TEXTURE_2D, waterTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      resolution,
      resolution,
      0,
      gl.LUMINANCE,
      gl.FLOAT,
      waterBuffers.current
    );
  }
}

function addRipple(x, y, strength = 1.0) {
  const normalizedX = x / window.innerWidth;
  const normalizedY = 1.0 - y / window.innerHeight;
  
  const texX = Math.floor(normalizedX * resolution);
  const texY = Math.floor(normalizedY * resolution);
  
  const radius = settings.rippleRadius;
  const rippleStrength = strength * (settings.splatForce / 100000);
  const radiusSquared = radius * radius;
  
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      const distanceSquared = i * i + j * j;
      
      if (distanceSquared <= radiusSquared) {
        const posX = texX + i;
        const posY = texY + j;
        
        if (posX >= 0 && posX < resolution && posY >= 0 && posY < resolution) {
          const index = posY * resolution + posX;
          const velIndex = index * 2;
          
          const distance = Math.sqrt(distanceSquared);
          const falloff = 1.0 - distance / radius;
          const rippleValue = Math.cos((distance / radius) * Math.PI * 0.5) * rippleStrength * falloff;
          
          waterBuffers.previous[index] += rippleValue;
          
          const angle = Math.atan2(j, i);
          const velocityStrength = rippleValue * 0.2;
          
          waterBuffers.velocity[velIndex] += Math.cos(angle) * velocityStrength;
          waterBuffers.velocity[velIndex + 1] += Math.sin(angle) * velocityStrength;
          
          // Add swirl
          const swirlAngle = angle + Math.PI * 0.5;
          const swirlStrength = Math.min(velocityStrength * 0.3, 0.1);
          waterBuffers.velocity[velIndex] += Math.cos(swirlAngle) * swirlStrength;
          waterBuffers.velocity[velIndex + 1] += Math.sin(swirlAngle) * swirlStrength;
        }
      }
    }
  }
}

function onMouseMove(event) {
  const rect = canvasRef.value.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  const now = performance.now();
  if (now - mouseThrottleTime < 8) return;
  mouseThrottleTime = now;
  
  const dx = x - lastMousePosition.x;
  const dy = y - lastMousePosition.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const velocity = distance / 8;
  
  if (distance > 1) {
    const velocityInfluence = Math.min(velocity / 10, 2.0);
    const baseIntensity = Math.min(distance / 20, 1.0);
    const fluidIntensity = baseIntensity * velocityInfluence * settings.mouseIntensity;
    const variation = Math.random() * 0.3 + 0.7;
    const finalIntensity = fluidIntensity * variation;
    
    const jitterX = x + (Math.random() - 0.5) * 3;
    const jitterY = y + (Math.random() - 0.5) * 3;
    
    addRipple(jitterX, jitterY, finalIntensity);
    
    lastMousePosition.x = x;
    lastMousePosition.y = y;
  }
}

function onMouseClick(event) {
  const rect = canvasRef.value.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  addRipple(x, y, settings.clickIntensity);
}

function renderFrame(now) {
  if (!gl || !program) return;

  const elapsed = (now - startTime) * 0.001;

  // Update water simulation
  updateWaterSimulation();

  // Set uniforms
  gl.uniform1f(gl.getUniformLocation(program, "u_time"), elapsed);
  gl.uniform2f(
    gl.getUniformLocation(program, "u_resolution"),
    canvasRef.value.width,
    canvasRef.value.height
  );
  gl.uniform1f(gl.getUniformLocation(program, "u_speed"), settings.animationSpeed);
  gl.uniform1f(gl.getUniformLocation(program, "u_waterStrength"), settings.waterStrength);
  
  // Ice White color preset (subtle, elegant)
  gl.uniform3f(gl.getUniformLocation(program, "u_color1"), 1.0, 1.0, 1.0);
  gl.uniform3f(gl.getUniformLocation(program, "u_color2"), 0.9, 0.95, 1.0);
  gl.uniform3f(gl.getUniformLocation(program, "u_color3"), 0.8, 0.9, 1.0);
  gl.uniform3f(gl.getUniformLocation(program, "u_background"), 0.02, 0.02, 0.05);
  
  // Bind water texture
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, waterTexture);
  gl.uniform1i(gl.getUniformLocation(program, "u_waterTexture"), 0);

  // Draw
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  fpsMeter.tick();
  frameId = requestAnimationFrame(renderFrame);
}

onMounted(() => {
  if (!holderRef.value || !canvasRef.value) return;

  if (!initContext()) {
    console.error("Failed to initialize WebGL context");
    return;
  }

  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("click", onMouseClick, { passive: true });

  fpsMeter.start();
  startTime = performance.now();
  
  // Add initial ripple
  setTimeout(() => {
    addRipple(window.innerWidth / 2, window.innerHeight / 2, 1.5);
  }, 500);

  frameId = requestAnimationFrame(renderFrame);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCanvas);
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("click", onMouseClick);

  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }

  fpsMeter.stop();

  if (gl) {
    if (program) {
      gl.deleteProgram(program);
      program = null;
    }
    if (waterTexture) {
      gl.deleteTexture(waterTexture);
      waterTexture = null;
    }
    gl = null;
  }
});
</script>

<style scoped>
canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
