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

const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 vUv;

  void main() {
    vUv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0., 1.);
  }
`;

const fragmentShaderSource = `
  precision highp float;

  uniform float u_time;
  uniform vec2 u_resolution;
  
  varying vec2 vUv;
  
  const float PI = 3.14159265359;
  const int MAX_STEPS = 100;
  const float MAX_DIST = 20.0;
  const float EPSILON = 0.0001;
  
  // Rotation matrix
  mat2 rot2D(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }
  
  // 3D rotation
  mat3 rotateY(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
  }
  
  mat3 rotateX(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
  }
  
  // Hash function for pseudo-random
  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }
  
  float hash3(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }
  
  // Smooth minimum
  float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
  }
  
  // Box SDF
  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  }
  
  // Octahedron SDF
  float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    float m = p.x + p.y + p.z - s;
    vec3 q;
    if(3.0 * p.x < m) q = p.xyz;
    else if(3.0 * p.y < m) q = p.yzx;
    else if(3.0 * p.z < m) q = p.zxy;
    else return m * 0.57735027;
    
    float k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
    return length(vec3(q.x, q.y - s + k, q.z - k));
  }
  
  // Crystal structure SDF
  float crystalSDF(vec3 p) {
    vec3 op = p;
    
    // Main crystal rotation
    p *= rotateY(u_time * 0.08);
    p *= rotateX(u_time * 0.06);
    
    // Central octahedron
    float crystal = sdOctahedron(p, 1.2);
    
    // Add smaller crystals at vertices
    for(int i = 0; i < 6; i++) {
      float fi = float(i);
      float angle = fi * PI / 3.0 + u_time * 0.1;
      vec3 offset = vec3(cos(angle), sin(angle * 0.7), sin(angle)) * 1.5;
      
      float size = 0.3 + hash(fi) * 0.2;
      float smallCrystal = sdOctahedron(p - offset, size);
      crystal = smin(crystal, smallCrystal, 0.3);
    }
    
    // Internal structure - smaller crystals
    vec3 q = p;
    q = mod(q + 0.5, 1.0) - 0.5;
    float internal = sdBox(q, vec3(0.15));
    crystal = max(crystal, -internal + 0.1);
    
    return crystal;
  }
  
  // Scene SDF
  float sceneSDF(vec3 p) {
    return crystalSDF(p);
  }
  
  // Calculate normal
  vec3 calcNormal(vec3 p) {
    vec2 e = vec2(EPSILON, 0.0);
    return normalize(vec3(
      sceneSDF(p + e.xyy) - sceneSDF(p - e.xyy),
      sceneSDF(p + e.yxy) - sceneSDF(p - e.yxy),
      sceneSDF(p + e.yyx) - sceneSDF(p - e.yyx)
    ));
  }
  
  // Ray marching
  float rayMarch(vec3 ro, vec3 rd) {
    float t = 0.0;
    
    for(int i = 0; i < MAX_STEPS; i++) {
      vec3 p = ro + rd * t;
      float d = sceneSDF(p);
      
      if(d < EPSILON) return t;
      if(t > MAX_DIST) break;
      
      t += d * 0.8;
    }
    
    return -1.0;
  }
  
  // Fake refraction effect
  vec3 refract2(vec3 p, vec3 normal, vec3 rd) {
    // Sample scene at offset positions for chromatic aberration
    float ior = 1.5;
    vec3 refracted = refract(rd, normal, 1.0 / ior);
    
    // Chromatic aberration offsets
    vec3 colorR = vec3(0.0);
    vec3 colorG = vec3(0.0);
    vec3 colorB = vec3(0.0);
    
    // Sample at different depths
    float depth = 0.3;
    vec3 pR = p + refracted * depth * 0.95;
    vec3 pG = p + refracted * depth * 1.0;
    vec3 pB = p + refracted * depth * 1.05;
    
    // Create prismatic colors based on position
    colorR = vec3(0.4, 0.7, 1.0) * (0.5 + 0.5 * sin(pR.x * 3.0 + u_time * 0.5));
    colorG = vec3(0.5, 0.5, 1.0) * (0.5 + 0.5 * sin(pG.y * 3.0 + u_time * 0.5));
    colorB = vec3(0.6, 0.4, 1.0) * (0.5 + 0.5 * sin(pB.z * 3.0 + u_time * 0.5));
    
    return colorR * 0.4 + colorG * 0.4 + colorB * 0.4;
  }
  
  // Lighting
  vec3 lighting(vec3 p, vec3 rd, vec3 normal) {
    // Crystal base color - deep blue
    vec3 baseColor = vec3(0.15, 0.25, 0.45);
    
    // Light direction
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    
    // Diffuse
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = vec3(0.4, 0.6, 1.0) * diff * 0.5;
    
    // Specular
    vec3 viewDir = -rd;
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
    vec3 specular = vec3(0.8, 0.9, 1.0) * spec * 1.5;
    
    // Fresnel
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
    
    // Refraction color
    vec3 refractionColor = refract2(p, normal, rd);
    
    // Combine
    vec3 color = baseColor * 0.3 + diffuse + specular;
    color = mix(color, refractionColor, 0.6);
    color += vec3(0.5, 0.7, 1.0) * fresnel * 0.8;
    
    // Internal glow
    float internalGlow = hash3(floor(p * 4.0)) * 0.3;
    color += vec3(0.3, 0.6, 1.0) * internalGlow * 0.4;
    
    return color;
  }
  
  void main() {
    // Screen coordinates
    vec2 uv = (gl_FragCoord.xy - u_resolution.xy * 0.5) / u_resolution.y;
    
    // Camera setup
    vec3 ro = vec3(0.0, 0.0, -4.5);
    vec3 rd = normalize(vec3(uv, 1.5));
    
    // Gentle camera orbit
    float orbitAngle = u_time * 0.08;
    ro.xz *= rot2D(orbitAngle);
    rd.xz *= rot2D(orbitAngle);
    
    ro.y += sin(u_time * 0.1) * 0.3;
    
    // Ray march
    float t = rayMarch(ro, rd);
    
    vec3 color = vec3(0.0);
    
    if(t > 0.0) {
      vec3 p = ro + rd * t;
      vec3 normal = calcNormal(p);
      
      // Calculate lighting
      color = lighting(p, rd, normal);
      
      // Depth fog
      float fog = 1.0 - exp(-t * 0.15);
      color = mix(color, vec3(0.05, 0.08, 0.15), fog * 0.3);
      
      // Edge glow
      float edgeGlow = pow(1.0 - abs(dot(rd, normal)), 2.0);
      color += vec3(0.4, 0.7, 1.0) * edgeGlow * 0.3;
    }
    
    // Vignette
    float vignette = 1.0 - length(uv) * 0.4;
    vignette = smoothstep(0.3, 1.0, vignette);
    color *= vignette;
    
    // Tone mapping
    color = pow(color, vec3(0.9));
    
    // Background
    vec3 bgColor = vec3(0.02, 0.02, 0.05);
    float alpha = t > 0.0 ? 1.0 : 0.0;
    color = mix(bgColor, color, alpha * vignette);
    
    gl_FragColor = vec4(color, 1.0);
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

function renderFrame(now) {
  if (!gl || !program) return;

  const elapsed = (now - startTime) * 0.001;

  // Set uniforms
  gl.uniform1f(gl.getUniformLocation(program, "u_time"), elapsed);
  gl.uniform2f(
    gl.getUniformLocation(program, "u_resolution"),
    canvasRef.value.width,
    canvasRef.value.height
  );

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

  fpsMeter.start();
  startTime = performance.now();

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
    if (program) {
      gl.deleteProgram(program);
      program = null;
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
