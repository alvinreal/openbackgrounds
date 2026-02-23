<template>
  <div ref="holderRef" class="absolute inset-0 overflow-hidden">
    <canvas
      ref="canvasRef"
      class="block w-full h-full pointer-events-none"
    ></canvas>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const holderRef = ref(null);
const canvasRef = ref(null);

const fpsMeter = useFpsMeter();

let scene = null;
let camera = null;
let renderer = null;
let composer = null;
let controls = null;
let clock = null;
let animationId = null;

let coreSphere = null;
let orbitRings = null;
let starfield = null;
let currentHdrTexture = null;

const mouse = new THREE.Vector2(-10, -10);
const pointerTarget = new THREE.Vector2(-10, -10);

const palette = {
  sphere: [0x4360ff, 0xb38cff, 0x43c3ff, 0x3540ff],
  ringColor: (i, count, j, total) =>
    new THREE.Color().setHSL(
      0.58 + (i / count) * 0.12 + (j / total) * 0.05,
      0.65,
      0.6,
    ),
  hdr: "https://www.spacespheremaps.com/wp-content/uploads/HDR_blue_nebulae-1.hdr",
};

const pointMaterialShader = {
  vertexShader: `
    attribute float size;
    varying vec3 vColor;
    varying float vMouseEffect;
    uniform float time;
    uniform vec2 uMouse;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    void main() {
      vColor = color;

      vec3 displaced = position;
      float noiseFrequency = 0.24;
      float noiseAmplitude = 0.7;
      vec3 noiseInput = displaced * noiseFrequency + time * 0.18;
      vec3 offset = vec3(
        snoise(noiseInput),
        snoise(noiseInput + vec3(10.0)),
        snoise(noiseInput + vec3(20.0))
      );
      displaced += offset * noiseAmplitude;

      vec4 projectedVertex = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vec2 screenPos = projectedVertex.xy / projectedVertex.w;
      float mouseDist = distance(screenPos, uMouse);
      float mouseEffect = 1.0 - smoothstep(0.0, 0.4, mouseDist);
      vMouseEffect = mouseEffect;

      vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
      float pulse = sin(time * 0.3 + length(position) * 0.6) * 0.04 + 1.0;
      gl_PointSize = size * (320.0 / -mvPosition.z) * pulse * (1.0 + vMouseEffect * 0.25);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    varying float vMouseEffect;
    uniform float time;

    float rand(vec2 co) { return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }
    void main() {
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = dot(cxy, cxy);
      if (r > 1.0) discard;

    float glow = exp(-r * 3.0) + vMouseEffect * 0.2;
    float twinkle = rand(gl_PointCoord + time * 0.5) * 0.3 + 0.6;

    vec3 finalColor = vColor * (1.05 + sin(time * 0.18) * 0.08 + vMouseEffect * 0.25) * glow * twinkle;
      gl_FragColor = vec4(finalColor, smoothstep(0.0, 1.0, glow));
    }
  `,
};

const starShader = {
  vertexShader: `
    attribute float size;
    varying vec3 vColor;
    uniform float time;
    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      float twinkle = sin(time * 0.8 + position.x * 0.06 + position.y * 0.1) * 0.18 + 0.8;
      gl_PointSize = size * twinkle * (600.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    void main() {
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = dot(cxy, cxy);
      if (r > 1.0) discard;
      float glow = exp(-r * 4.0);
      gl_FragColor = vec4(vColor, glow * 0.7);
    }
  `,
};

onMounted(() => {
  if (!holderRef.value || !canvasRef.value) return;

  initScene();
  if (!scene || !renderer) return;

  applyPalette();

  fpsMeter.start();
  clock = new THREE.Clock();
  animationId = requestAnimationFrame(animate);

  window.addEventListener("resize", onWindowResize, { passive: true });
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("mouseleave", resetPointer, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onWindowResize);
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("touchmove", onTouchMove);
  window.removeEventListener("mouseleave", resetPointer);

  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  fpsMeter.stop();
  disposeScene();
});

function initScene() {
  const width = holderRef.value.offsetWidth || window.innerWidth;
  const height = holderRef.value.offsetHeight || window.innerHeight;

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02020a, 0.01);

  camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 2000);
  camera.position.set(0, 4.5, 18);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enabled = false;

  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.2,
    0.3,
    0.85,
  );
  bloomPass.threshold = 0;
  bloomPass.strength = 0.9;
  bloomPass.radius = 0.4;

  composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);

  coreSphere = createSpiralSphere(5, 32000);
  orbitRings = createOrbitRings(7.5, 8, 0.6);
  starfield = createStarfield(7000, 48000);

  const mainGroup = new THREE.Group();
  mainGroup.add(coreSphere);
  mainGroup.add(orbitRings);
  mainGroup.rotation.x = -0.22;
  scene.add(mainGroup);
  scene.userData.mainGroup = mainGroup;

  scene.add(starfield);

  loadHdrEnvironment(palette.hdr);
  onWindowResize();
}

function createSpiralSphere(radius, particleCount) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i += 1) {
    const i3 = i * 3;
    const phi = Math.acos(-1 + (2 * i) / particleCount);
    const theta = Math.sqrt(particleCount * Math.PI) * phi;

    positions[i3] = radius * Math.cos(theta) * Math.sin(phi);
    positions[i3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
    positions[i3 + 2] = radius * Math.cos(phi);

    sizes[i] = Math.random() * 0.18 + 0.1;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  const material = createPointShaderMaterial();
  return new THREE.Points(geometry, material);
}

function createOrbitRings(radius, count, thickness) {
  const group = new THREE.Group();

  for (let i = 0; i < count; i += 1) {
    const particleCount = 3200;
    const ringGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let j = 0; j < particleCount; j += 1) {
      const j3 = j * 3;
      const angle = (j / particleCount) * Math.PI * 2;
      const radiusVariation = radius + (Math.random() - 0.5) * thickness;
      positions[j3] = Math.cos(angle) * radiusVariation;
      positions[j3 + 1] = (Math.random() - 0.5) * (thickness * 0.45);
      positions[j3 + 2] = Math.sin(angle) * radiusVariation;
      sizes[j] = Math.random() * 0.12 + 0.08;
    }

    ringGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    ringGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    ringGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const ring = new THREE.Points(ringGeometry, createPointShaderMaterial());
    ring.rotation.x = Math.random() * Math.PI;
    ring.rotation.y = Math.random() * Math.PI;

    group.add(ring);
  }

  return group;
}

function createStarfield(count, spread) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const sizes = [];

  for (let i = 0; i < count; i += 1) {
    positions.push(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
    );
    const color = new THREE.Color();
    color.setHSL(0.58 + Math.random() * 0.08, 0.25, 0.4 + Math.random() * 0.4);
    colors.push(color.r, color.g, color.b);
    sizes.push(0.45 + Math.random() * 0.9);
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
    },
    vertexShader: starShader.vertexShader,
    fragmentShader: starShader.fragmentShader,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

function createPointShaderMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      uMouse: { value: mouse.clone() },
    },
    vertexShader: pointMaterialShader.vertexShader,
    fragmentShader: pointMaterialShader.fragmentShader,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function animate() {
  if (!scene || !camera || !composer || !clock) return;

  animationId = requestAnimationFrame(animate);
  const elapsedTime = clock.getElapsedTime();
  fpsMeter.tick();

  mouse.lerp(pointerTarget, 0.03);

  const mainGroup = scene.userData.mainGroup;
  if (mainGroup) {
    mainGroup.rotation.y += 0.00008;
    mainGroup.rotation.x = -0.22 + Math.sin(elapsedTime * 0.08) * 0.02;
    mainGroup.position.y = Math.sin(elapsedTime * 0.12) * 0.08;
  }

  const breathe = 1 + Math.sin(elapsedTime * 0.18) * 0.015;
  coreSphere.scale.setScalar(breathe);

  orbitRings.children.forEach((ring, index) => {
    const speed = 0.00008 * (index + 1);
    ring.rotation.z += speed;
    ring.rotation.x += speed * 0.2;
    ring.rotation.y += speed * 0.12;
    ring.scale.y = 1.0 + Math.sin(elapsedTime * 0.6 + index * 0.3) * 0.045;
  });

  coreSphere.material.uniforms.time.value = elapsedTime;
  coreSphere.material.uniforms.uMouse.value.copy(mouse);
  orbitRings.children.forEach((ring) => {
    ring.material.uniforms.time.value = elapsedTime;
    ring.material.uniforms.uMouse.value.copy(mouse);
  });
  starfield.material.uniforms.time.value = elapsedTime;

  controls.update();
  composer.render();
}

function applyPalette() {
  const colorsAttr = coreSphere.geometry.getAttribute("color");
  const sphereColors = palette.sphere.map((hex) => new THREE.Color(hex));
  const count = colorsAttr.count;
  for (let i = 0; i < count; i += 1) {
    const colorPos = (i / count) * (sphereColors.length - 1);
    const idx = Math.floor(colorPos);
    const frac = colorPos - idx;
    const c1 = sphereColors[idx];
    const c2 = sphereColors[Math.min(idx + 1, sphereColors.length - 1)];
    const blended = new THREE.Color().copy(c1).lerp(c2, frac);
    colorsAttr.setXYZ(i, blended.r, blended.g, blended.b);
  }
  colorsAttr.needsUpdate = true;

  orbitRings.children.forEach((ring, ringIndex) => {
    const ringColors = ring.geometry.getAttribute("color");
    const count = ringColors.count;
    for (let j = 0; j < count; j += 1) {
      const color = palette.ringColor(
        ringIndex,
        orbitRings.children.length,
        j,
        count,
      );
      ringColors.setXYZ(j, color.r, color.g, color.b);
    }
    ringColors.needsUpdate = true;
  });
}

function loadHdrEnvironment(url) {
  const loader = new RGBELoader();
  loader.setDataType(THREE.FloatType);
  loader.load(url, (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    currentHdrTexture?.dispose?.();
    currentHdrTexture = texture;
    scene.background = texture;
    scene.environment = texture;
  });
}

function onWindowResize() {
  if (!renderer || !camera || !composer || !holderRef.value) return;
  const width = holderRef.value.offsetWidth || window.innerWidth;
  const height = holderRef.value.offsetHeight || window.innerHeight;

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  composer.setSize(width, height);
}

function onMouseMove(event) {
  updatePointer(event.clientX, event.clientY);
}

function onTouchMove(event) {
  if (!event.touches || event.touches.length === 0) return;
  const touch = event.touches[0];
  updatePointer(touch.clientX, touch.clientY);
}

function resetPointer() {
  pointerTarget.set(-10, -10);
}

function updatePointer(clientX, clientY) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const x = ((clientX / width) * 2 - 1) * 0.35;
  const y = (-(clientY / height) * 2 + 1) * 0.35;
  pointerTarget.set(x, y);
}

function disposeScene() {
  if (scene) {
    scene.traverse((child) => {
      if (child.isMesh || child.isPoints) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat?.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      }
    });
  }

  controls?.dispose?.();
  composer?.dispose?.();
  renderer?.dispose?.();
  currentHdrTexture?.dispose?.();

  renderer = null;
  scene = null;
  camera = null;
  composer = null;
  coreSphere = null;
  orbitRings = null;
  starfield = null;
  currentHdrTexture = null;
  clock = null;
}
</script>

<style scoped></style>
