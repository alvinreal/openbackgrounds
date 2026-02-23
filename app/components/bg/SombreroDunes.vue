<template>
  <div ref="holderRef" class="absolute inset-0 pointer-events-none">
    <canvas ref="canvasRef" class="block w-full h-full"></canvas>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import * as THREE from "three";

const holderRef = ref(null);
const canvasRef = ref(null);

const fpsMeter = useFpsMeter();

let renderer = null;
let scene = null;
let camera = null;
let dunesMesh = null;
let baseMesh = null;
let haloMesh = null;
let frameId = null;
const cleanupCallbacks = [];
const lookTarget = new THREE.Vector3(0, -0.4, 0);

const uniforms = {
  uTime: { value: 0 },
  uSpeed: { value: 0.16 },
  uElevation: { value: 0.2 },
  uNoiseRange: { value: 0.95 },
  uSombreroAmplitude: { value: 0.52 },
  uSombreroFrequency: { value: 4.6 },
  uLineColor: { value: new THREE.Color("#a9a0ff") },
  uGlowColor: { value: new THREE.Color("#0c001f") },
  uAccentColor: { value: new THREE.Color("#294fba") },
};

const vertexShader = `
  varying vec2 vUv;
  varying float vHeight;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uElevation;
  uniform float uNoiseRange;
  uniform float uSombreroAmplitude;
  uniform float uSombreroFrequency;

  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec4 permute(vec4 x) {
    return mod289(((x * 34.0) + 1.0) * x);
  }

  vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
  }

  float cnoise(vec3 P) {
    vec3 Pi0 = floor(P);
    vec3 Pi1 = Pi0 + vec3(1.0);
    Pi0 = mod289(Pi0);
    Pi1 = mod289(Pi1);
    vec3 Pf0 = fract(P);
    vec3 Pf1 = Pf0 - vec3(1.0);
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;

    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);

    vec4 gx0 = ixy0 * (1.0 / 7.0);
    vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);

    vec4 gx1 = ixy1 * (1.0 / 7.0);
    vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);

    vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
    vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
    vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
    vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
    vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
    vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
    vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
    vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x;
    g010 *= norm0.y;
    g100 *= norm0.z;
    g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x;
    g011 *= norm1.y;
    g101 *= norm1.z;
    g111 *= norm1.w;

    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.y, Pf0.z));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);

    vec3 fade_xyz = Pf0 * Pf0 * Pf0 * (Pf0 * (Pf0 * 6.0 - 15.0) + 10.0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    return mix(n_yz.x, n_yz.y, fade_xyz.x);
  }

  void main() {
    vUv = uv;

    float t = uTime * uSpeed;
    float gentleT = t * 0.6;
    vec2 p = position.xz;
    float primary = cnoise(vec3(p * 0.24, gentleT)) * uNoiseRange;
    float secondary = cnoise(vec3(p * 0.9, gentleT * 1.4)) * (uNoiseRange * 0.1);
    float ribbon = sin(position.x * 0.32 - 1.57079632679) * uElevation;

    vec2 centeredUv = vUv - 0.5;
    float radius = length(centeredUv);
    float sombrero = uSombreroAmplitude * sin((gentleT * 0.5 - radius * uSombreroFrequency) * 3.14159265359);

    float radialAttenuation = mix(0.65, 1.0, smoothstep(0.0, 0.28, radius));
    float height = (primary + secondary + ribbon + sombrero) * radialAttenuation;
    height = mix(height, height * 0.6, smoothstep(0.45, 0.82, abs(height)));
    vHeight = height;

    vec3 displacedPosition = vec3(position.x, position.y, height);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  varying float vHeight;

  uniform vec3 uLineColor;
  uniform vec3 uGlowColor;
  uniform vec3 uAccentColor;

  void main() {
    float verticalFade = smoothstep(0.0, 1.0, vUv.y);
    float heightGlow = smoothstep(-2.4, 1.9, vHeight);
    float rim = smoothstep(0.5, 0.18, distance(vUv, vec2(0.5)));

    vec3 base = mix(uGlowColor, uLineColor, heightGlow * 0.7);
    base = mix(base, uAccentColor, 0.06);

    float alpha = 0.06 + (1.0 - verticalFade) * 0.22;
    alpha *= rim;
    alpha = clamp(alpha, 0.0, 0.32);

    gl_FragColor = vec4(base, alpha);
  }
`;

function createScene(holder) {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x040014, 18, 52);

  const width = holder.clientWidth || window.innerWidth;
  const height = holder.clientHeight || window.innerHeight;

  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 80);
  camera.position.set(0, 3.1, 9.8);
  camera.lookAt(lookTarget);

  const hemiLight = new THREE.HemisphereLight(0x6655ff, 0x07001a, 0.45);
  scene.add(hemiLight);

  const geometry = new THREE.PlaneGeometry(40, 24, 360, 220);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    wireframe: true,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  dunesMesh = new THREE.Mesh(geometry, material);
  dunesMesh.rotation.x = -Math.PI / 2;
  dunesMesh.position.y = -0.8;
  scene.add(dunesMesh);

  const baseGeometry = new THREE.PlaneGeometry(60, 34, 1, 1);
  const baseMaterial = new THREE.MeshBasicMaterial({
    color: 0x0a0018,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });

  baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
  baseMesh.rotation.x = -Math.PI / 2;
  baseMesh.position.y = -1.4;
  scene.add(baseMesh);

  const haloGeometry = new THREE.PlaneGeometry(90, 54, 1, 1);
  const haloMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uInner: { value: new THREE.Color("#160033") },
      uOuter: { value: new THREE.Color("#010008") },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uInner;
      uniform vec3 uOuter;

      void main() {
        float dist = distance(vUv, vec2(0.5));
        float falloff = smoothstep(0.7, 0.2, dist);
        vec3 col = mix(uOuter, uInner, falloff);
        float alpha = smoothstep(1.1, 0.2, dist) * 0.5;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  haloMesh = new THREE.Mesh(haloGeometry, haloMaterial);
  haloMesh.rotation.x = -Math.PI / 2;
  haloMesh.position.y = -2.2;
  scene.add(haloMesh);
}

function handleResize() {
  if (!renderer || !camera || !holderRef.value) return;

  const holder = holderRef.value;
  const width = holder.clientWidth || window.innerWidth;
  const height = holder.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);

  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

const clock = new THREE.Clock();

function renderFrame() {
  const elapsed = clock.getElapsedTime();
  uniforms.uTime.value = elapsed;

  if (dunesMesh) {
    dunesMesh.rotation.z = Math.sin(elapsed * 0.08) * 0.06;
  }

  if (camera) {
    const orbit = Math.sin(elapsed * 0.028) * 0.24;
    camera.position.x = orbit;
    camera.lookAt(lookTarget);
  }

  if (!renderer || !scene || !camera) {
    return;
  }

  fpsMeter.tick();
  renderer.render(scene, camera);
  frameId = requestAnimationFrame(renderFrame);
}

onMounted(() => {
  const holder = holderRef.value;
  const canvas = canvasRef.value;
  if (!holder || !canvas) return;

  createScene(holder);
  handleResize();

  const resizeHandler = () => handleResize();
  window.addEventListener("resize", resizeHandler, { passive: true });
  cleanupCallbacks.push(() =>
    window.removeEventListener("resize", resizeHandler),
  );

  fpsMeter.start();
  frameId = requestAnimationFrame(renderFrame);
});

onBeforeUnmount(() => {
  cleanupCallbacks.splice(0).forEach((fn) => fn());

  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }

  fpsMeter.stop();

  if (dunesMesh) {
    dunesMesh.geometry.dispose();
    dunesMesh.material.dispose();
    dunesMesh = null;
  }

  if (baseMesh) {
    baseMesh.geometry.dispose();
    baseMesh.material.dispose();
    baseMesh = null;
  }

  if (haloMesh) {
    haloMesh.geometry.dispose();
    haloMesh.material.dispose();
    haloMesh = null;
  }

  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  scene = null;
  camera = null;
});
</script>
