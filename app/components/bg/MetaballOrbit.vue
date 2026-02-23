<template>
  <div ref="holderRef" class="absolute inset-0 pointer-events-none holder">
    <canvas ref="canvasRef" class="block w-full h-full" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

const holderRef = ref(null);
const canvasRef = ref(null);
const fpsMeter = useFpsMeter();

// Dark background color for contrast
const _backgroundColor = { r: 0.02, g: 0.0, b: 0.05 };

let gl = null;
let program = null;
let frameId = null;
let devicePixelRatio = 1;
let startTime = 0;

// Mouse tracking with more responsive movement
const mousePosition = { x: 0.5, y: 0.5 };
const targetMousePosition = { x: 0.5, y: 0.5 };
const mouseVelocity = { x: 0, y: 0 };

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
  uniform vec2 u_mouse;
  
  varying vec2 vUv;
  
  const float PI = 3.14159265359;
  const float EPSILON = 0.001;
  const int MAX_STEPS = 64;
  
  // Smooth minimum for metaball blending
  float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
  }
  
  // Sphere SDF
  float sdSphere(vec3 p, float r) {
    return length(p) - r;
  }
  
  // Enhanced Scene SDF with better positioning
  float sceneSDF(vec3 pos) {
    float result = 1000.0;
    
    // Fixed corner spheres with better positioning
    float topLeft = sdSphere(pos - vec3(-1.3, 1.0, 0.0), 0.7);
    float bottomRight = sdSphere(pos - vec3(1.3, -1.0, 0.0), 0.8);
    
    // Additional fixed spheres for more complexity
    float midLeft = sdSphere(pos - vec3(-0.8, 0.3, 0.0), 0.35);
    float midRight = sdSphere(pos - vec3(0.8, -0.3, 0.0), 0.4);
    
    // Orbiting metaballs with more dynamic movement
    float t = u_time * 0.3;
    
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float speed = 0.5 + fi * 0.15;
      float radius = 0.2 + mod(fi, 3.0) * 0.08;
      float orbitRadius = 0.5 + mod(fi, 3.0) * 0.25;
      float phaseOffset = fi * PI * 0.35;
      
      // More complex movement patterns
      vec3 offset = vec3(
        sin(t * speed + phaseOffset) * orbitRadius,
        cos(t * speed * 0.9 + phaseOffset * 1.5) * orbitRadius * 0.7,
        sin(t * speed * 0.6 + phaseOffset) * 0.4
      );
      
      // Add mouse interaction
      vec2 mouseOffset = (u_mouse - vec2(0.5)) * 0.3;
      offset.x += mouseOffset.x;
      offset.y += mouseOffset.y;
      
      float movingSphere = sdSphere(pos - offset, radius);
      
      // Dynamic smoothness based on movement
      float blend = 0.25 + sin(t + fi) * 0.1;
      result = smin(result, movingSphere, blend);
    }
    
    // Blend all spheres with better smoothness
    result = smin(result, topLeft, 0.35);
    result = smin(result, bottomRight, 0.35);
    result = smin(result, midLeft, 0.25);
    result = smin(result, midRight, 0.25);
    
    return result;
  }
  
  // Calculate normal using gradient
  vec3 calcNormal(vec3 p) {
    float eps = 0.001;
    return normalize(vec3(
      sceneSDF(p + vec3(eps, 0, 0)) - sceneSDF(p - vec3(eps, 0, 0)),
      sceneSDF(p + vec3(0, eps, 0)) - sceneSDF(p - vec3(0, eps, 0)),
      sceneSDF(p + vec3(0, 0, eps)) - sceneSDF(p - vec3(0, 0, eps))
    ));
  }
  
  // Ambient occlusion
  float ambientOcclusion(vec3 p, vec3 n) {
    float occ = 0.0;
    float weight = 1.0;
    for (int i = 0; i < 5; i++) {
      float dist = 0.01 + 0.02 * float(i);
      float h = sceneSDF(p + n * dist);
      occ += (dist - h) * weight;
      weight *= 0.85;
    }
    return clamp(1.0 - occ, 0.0, 1.0);
  }
  
  // Soft shadows
  float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
    float result = 1.0;
    float t = mint;
    for (int i = 0; i < 16; i++) {
      if (t >= maxt) break;
      float h = sceneSDF(ro + rd * t);
      if (h < EPSILON) return 0.0;
      result = min(result, k * h / t);
      t += h;
    }
    return result;
  }
  
  // Ray marching
  float rayMarch(vec3 ro, vec3 rd) {
    float t = 0.0;
    
    for (int i = 0; i < MAX_STEPS; i++) {
      vec3 p = ro + rd * t;
      float d = sceneSDF(p);
      
      if (d < EPSILON) {
        return t;
      }
      
      if (t > 10.0) {
        break;
      }
      
      t += d * 0.9;
    }
    
    return -1.0;
  }
  
  // Enhanced lighting with Three.js style colors
  vec3 lighting(vec3 p, vec3 rd, float t) {
    if (t < 0.0) {
      return vec3(0.0);
    }
    
    vec3 normal = calcNormal(p);
    vec3 viewDir = -rd;
    
    // Deep purple-blue sphere color like the reference
    vec3 sphereColor = vec3(0.05, 0.0, 0.15);
    
    // Ambient occlusion
    float ao = ambientOcclusion(p, normal);
    
    // Vibrant purple-cyan light color like Three.js
    vec3 lightColor = vec3(0.8, 0.4, 1.0);
    
    // Enhanced ambient for deeper colors
    vec3 ambient = lightColor * 0.15 * ao;
    
    // Directional light from above
    vec3 lightDir = normalize(vec3(1.2, 1.5, 1.8));
    float diff = max(dot(normal, lightDir), 0.0);
    
    // Soft shadow
    float shadow = softShadow(p, lightDir, 0.01, 5.0, 16.0);
    
    // Enhanced diffuse for richer colors
    vec3 diffuse = lightColor * diff * 1.5 * shadow;
    
    // Stronger specular for shine effect
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 6.0);
    
    // Fresnel for edge glow
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 1.5);
    
    // Enhanced specular with purple-cyan mix
    vec3 specular = lightColor * spec * 3.0 * fresnel;
    
    // Stronger rim light with cyan tint
    vec3 rimColor = vec3(0.4, 0.7, 1.0);
    vec3 fresnelRim = rimColor * fresnel * 1.2;
    
    // Add inner glow
    float innerGlow = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
    vec3 glowColor = vec3(0.7, 0.3, 1.0) * innerGlow * 0.4;
    
    // Combine lighting for vibrant effect
    vec3 color = (sphereColor + ambient + diffuse + specular + fresnelRim + glowColor) * ao;
    
    // Enhanced contrast for pop
    color = pow(color, vec3(1.8));
    color = color / (color + vec3(0.6));
    
    // Less fog to maintain vibrant colors
    float fogAmount = 1.0 - exp(-t * 0.04);
    color = mix(color, vec3(0.02, 0.0, 0.08), fogAmount * 0.15);
    
    // Add subtle color variation
    color.r *= 1.1;
    color.b *= 1.2;
    
    return color;
  }
  
  void main() {
    // Screen coordinates
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    
    // Ray origin and direction
    vec3 ro = vec3(uv * 2.0, -2.0);
    vec3 rd = vec3(0.0, 0.0, 1.0);
    
    // Ray march
    float t = rayMarch(ro, rd);
    
    // Calculate lighting with deep colorful glow
    vec3 p = ro + rd * t;
    vec3 color = lighting(p, rd, t);
    
    // Output with enhanced edge fade
    if (t > 0.0) {
      float edgeFade = smoothstep(2.5, 0.3, length(uv));
      // Subtle vignette for dramatic effect
      float vignette = smoothstep(1.5, 0.5, length(uv * 0.8));
      gl_FragColor = vec4(color, edgeFade * 0.9 * vignette);
    } else {
      // Very subtle background glow
      vec3 bgGlow = vec3(0.02, 0.0, 0.05) * (1.0 - length(uv) * 0.3);
      gl_FragColor = vec4(bgGlow, bgGlow.r * 0.3);
    }
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
    alpha: true,
    premultipliedAlpha: false,
  });

  if (!gl) {
    console.error("WebGL not supported");
    return false;
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(
    gl.FRAGMENT_SHADER,
    fragmentShaderSource,
  );

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
    gl.STATIC_DRAW,
  );
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(positionLocation);

  // Blending for transparency
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

function onMouseMove(event) {
  const rect = canvasRef.value.getBoundingClientRect();
  const newX = (event.clientX - rect.left) / rect.width;
  const newY = 1.0 - (event.clientY - rect.top) / rect.height;

  // Calculate velocity for more dynamic response
  mouseVelocity.x = newX - targetMousePosition.x;
  mouseVelocity.y = newY - targetMousePosition.y;

  targetMousePosition.x = newX;
  targetMousePosition.y = newY;
}

function renderFrame(now) {
  if (!gl || !program) return;

  const elapsed = (now - startTime) * 0.001;

  // Enhanced mouse movement with velocity
  mousePosition.x +=
    (targetMousePosition.x - mousePosition.x) * 0.15 + mouseVelocity.x * 0.3;
  mousePosition.y +=
    (targetMousePosition.y - mousePosition.y) * 0.15 + mouseVelocity.y * 0.3;

  // Dampen velocity
  mouseVelocity.x *= 0.85;
  mouseVelocity.y *= 0.85;

  // Set uniforms
  gl.uniform1f(gl.getUniformLocation(program, "u_time"), elapsed);
  gl.uniform2f(
    gl.getUniformLocation(program, "u_resolution"),
    canvasRef.value.width,
    canvasRef.value.height,
  );
  gl.uniform2f(
    gl.getUniformLocation(program, "u_mouse"),
    mousePosition.x,
    mousePosition.y,
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
  window.addEventListener("mousemove", onMouseMove, { passive: true });

  fpsMeter.start();
  startTime = performance.now();

  frameId = requestAnimationFrame(renderFrame);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCanvas);
  window.removeEventListener("mousemove", onMouseMove);

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

.holder {
  background: rgb(2, 0, 5);
  background: radial-gradient(
    ellipse at center,
    rgba(5, 0, 10, 1) 0%,
    rgba(2, 0, 5, 1) 100%
  );
}
</style>
