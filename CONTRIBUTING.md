# Contributing to OpenBackgrounds

Thanks for your interest in contributing to OpenBackgrounds! Whether you're adding a new animated background, fixing a bug, or improving documentation, this guide will help you get started.

## Table of Contents

- [Getting Started](#getting-started)
- [Creating a New Background](#creating-a-new-background)
- [Code Style](#code-style)
- [Pull Request Workflow](#pull-request-workflow)
- [Performance Guidelines](#performance-guidelines)
- [Issues & PR Templates](#issues--pr-templates)

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [pnpm](https://pnpm.io/) (package manager)
- [Git](https://git-scm.com/)

### Setup

1. **Fork** the repository on GitHub.

2. **Clone** your fork locally:

   ```bash
   git clone https://github.com/<your-username>/openbackgrounds.git
   cd openbackgrounds
   ```

3. **Install dependencies** with pnpm:

   ```bash
   pnpm install
   ```

4. **Start the dev server:**

   ```bash
   pnpm dev
   ```

   The app will be available at `http://localhost:3000`. Changes to components hot-reload automatically.

### Useful Scripts

| Script                | Description                                  |
| --------------------- | -------------------------------------------- |
| `pnpm dev`            | Start the Nuxt development server            |
| `pnpm build`          | Build for production                         |
| `pnpm lint`           | Run ESLint on `.ts`, `.js`, and `.vue` files |
| `pnpm prettier:check` | Check formatting with Prettier               |
| `pnpm prettier:fix`   | Auto-fix formatting with Prettier            |
| `pnpm screenshots`    | Generate screenshots for all backgrounds     |

---

## Creating a New Background

Every background is a standalone Vue Single File Component (SFC). Follow these steps to add one:

### Step 1 — Create the Component

Add a new file in `app/components/bg/` with a PascalCase name:

```
app/components/bg/YourBackgroundName.vue
```

### Step 2 — Follow the Component Pattern

Use this template as a starting point:

```vue
<template>
  <div ref="holderRef" class="absolute inset-0 pointer-events-none">
    <canvas ref="canvasRef" class="block w-full h-full"></canvas>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

const holderRef = ref(null);
const canvasRef = ref(null);

let animationFrameId = null;

onMounted(() => {
  if (!holderRef.value || !canvasRef.value) return;

  const canvas = canvasRef.value;
  const ctx = canvas.getContext("2d");

  // Set up canvas dimensions
  const resize = () => {
    const scale = window.devicePixelRatio || 1;
    const width = holderRef.value.offsetWidth;
    const height = holderRef.value.offsetHeight;
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  };

  resize();
  window.addEventListener("resize", resize, { passive: true });

  // Animation loop
  const loop = () => {
    // Your rendering logic here
    animationFrameId = window.requestAnimationFrame(loop);
  };

  loop();

  // Store cleanup reference
  onBeforeUnmount(() => {
    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    window.removeEventListener("resize", resize);
  });
});
</script>

<style scoped>
canvas {
  pointer-events: none;
  width: 100%;
  height: 100%;
  display: block;
}
</style>
```

**Key points:**

- Use `onMounted` to initialize rendering and `onBeforeUnmount` to clean up.
- Use `requestAnimationFrame` for the animation loop — never `setInterval` or `setTimeout`.
- Handle `window.resize` to keep the canvas responsive.
- Always cancel the animation frame and remove event listeners on unmount.

### Step 3 — Register the Background

Open `app/config/backgrounds.js` and add an entry to the `backgrounds` array:

```js
{
  id: 'your-background-name',        // kebab-case, unique
  component: 'YourBackgroundName',    // must match the .vue filename
  name: 'Your Background Name',      // human-readable display name
  description: 'A brief description of the visual effect.',
  category: 'Canvas',                // 'Canvas' or 'WebGL'
  author: {
    name: 'Your Name',               // optional
    url: 'https://your-site.com'     // optional
  }
}
```

### Step 4 — Add a Screenshot

Generate or capture a screenshot of your background and place it in:

```
public/screenshots/your-background-name.png
```

You can also run `pnpm screenshots` to auto-generate screenshots for all backgrounds.

### Step 5 — Test It

1. Run `pnpm dev` and verify your background renders correctly.
2. Resize the browser window to confirm it handles different viewport sizes.
3. Check the browser console for errors or warnings.
4. Confirm there are no memory leaks (animation frames cancelled, listeners removed).

---

## Code Style

This project uses **ESLint** and **Prettier** to enforce consistent code style.

### Formatting Rules

- **Indentation:** 2 spaces (no tabs)
- **Semicolons:** as configured by ESLint/Prettier
- **Quotes:** double quotes for template attributes, consistent usage in scripts

### Before Submitting

Always run the linter and formatter before committing:

```bash
# Check for lint errors
pnpm lint

# Check formatting
pnpm prettier:check

# Auto-fix formatting
pnpm prettier:fix
```

Fix any errors or warnings before opening your PR. CI will catch them if you don't!

---

## Pull Request Workflow

### 1. Create a Branch

Use the following naming convention:

```
feat/issue-<N>-<short-description>
```

Examples:

- `feat/issue-42-plasma-field` — new background
- `fix/issue-15-memory-leak` — bug fix
- `docs/issue-7-update-readme` — documentation

```bash
git checkout -b feat/issue-42-plasma-field
```

### 2. Make Your Changes

- Keep commits focused and atomic.
- Write clear commit messages:
  ```
  feat: add PlasmaField background component
  ```

### 3. Push and Open a PR

```bash
git push origin feat/issue-42-plasma-field
```

When opening your Pull Request:

- **Link the related issue** (e.g., `Closes #42`) in the PR description.
- **Describe what you changed** and why.
- **Include a screenshot or GIF** of the background in action if you're adding a visual component.

### 4. Code Review

- At least one maintainer review is required before merging.
- Address review feedback with new commits (don't force-push during review).
- Once approved, a maintainer will merge your PR.

---

## Performance Guidelines

Animated backgrounds run on every frame — performance matters. Follow these guidelines to keep things smooth:

### General

- **Use `requestAnimationFrame`** for all animation loops. Never use `setInterval` or `setTimeout` for rendering.
- **Clean up on unmount.** Cancel animation frames, remove event listeners, dispose of WebGL resources. Leaked resources cause memory bloat and frame drops.
- **Throttle resize handlers** if they do heavy work. Use `{ passive: true }` for resize listeners.
- **Avoid allocations in the render loop.** Pre-allocate objects, arrays, and vectors outside the loop. Garbage collection causes jank.

### Canvas (2D)

- Use `clearRect` or redraw the full frame — avoid partial clears that leave artifacts.
- Batch draw calls where possible (e.g., a single `beginPath()` for many lines).
- Use `globalCompositeOperation` intentionally — blending modes like `"lighter"` are great for glows but cost more.

### WebGL / Three.js

- **Dispose of everything.** In `onBeforeUnmount`, call `.dispose()` on geometries, materials, textures, and the renderer. Call `renderer.forceContextLoss()` if appropriate.
- **Reuse geometries and materials** when possible instead of creating new ones per frame.
- **Limit draw calls.** Merge geometries, use instanced rendering, or use points/particles instead of individual meshes.
- **Be mindful of shader complexity.** Fragment shaders run per pixel — keep them efficient, especially for fullscreen effects.
- **Set `renderer.setPixelRatio`** to `Math.min(window.devicePixelRatio, 2)` to cap rendering resolution on high-DPI screens.

### Testing Performance

- Use the browser's Performance tab to check for dropped frames.
- Test on lower-end hardware or throttle CPU in DevTools.
- Aim for a consistent 60fps on mid-range devices.

---

## Issues & PR Templates

### Opening an Issue

When reporting a bug or requesting a feature:

- **Bug reports:** Include browser, OS, steps to reproduce, expected vs. actual behavior, and console errors if any.
- **Feature requests:** Describe the background idea, include reference visuals or CodePen links if possible, and mention which rendering approach you'd suggest (Canvas, WebGL, Three.js).
- **New background proposals:** Tag with `new-background` if available. A sketch, reference, or prototype helps a lot.

### Pull Request Description

A good PR description includes:

1. **What** — brief summary of the change
2. **Why** — link to the issue or explain the motivation
3. **How** — any non-obvious implementation details
4. **Screenshot/GIF** — for visual changes (new backgrounds, UI tweaks)

---

## Questions?

If you're unsure about anything, open an issue or start a discussion. We're happy to help you get your first contribution in. 🎨

Thank you for making OpenBackgrounds better!
