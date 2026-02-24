import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdir, access } from "fs/promises";
import { constants } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = join(__dirname, "../public/screenshots");
const WAIT_TIME = 3000;
const VIEWPORT = { width: 1920, height: 1080 };
const FORCE_REGENERATE = process.argv.includes("--force");

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function generateScreenshots() {
  const { backgrounds } = await import("../app/config/backgrounds.js");

  const filteredBackgrounds = backgrounds.filter(
    (bg) => bg.component.length > 1,
  );
  const skippedCount = backgrounds.length - filteredBackgrounds.length;

  await mkdir(SCREENSHOT_DIR, { recursive: true });

  console.log(
    `Starting screenshot generation for ${filteredBackgrounds.length} backgrounds...`,
  );
  if (skippedCount > 0) {
    console.log(`Skipping ${skippedCount} single-letter component(s)`);
  }
  console.log(`Using base URL: ${BASE_URL}`);
  console.log(`Screenshots will be saved to: ${SCREENSHOT_DIR}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
  });
  const page = await context.newPage();

  for (const bg of filteredBackgrounds) {
    console.log(`\nProcessing: ${bg.name || bg.id} (${bg.id})`);

    const screenshotPath = join(SCREENSHOT_DIR, `${bg.id}.png`);
    const exists = await fileExists(screenshotPath);

    if (exists && !FORCE_REGENERATE) {
      console.log(`  ⊘ Skipping - screenshot already exists`);
      continue;
    }

    const url = `${BASE_URL}/preview/${bg.id}`;
    console.log(`  Capturing screenshot...`);

    try {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(WAIT_TIME);

      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
      });

      console.log(`    ✓ Saved: ${bg.id}.png`);
    } catch (error) {
      console.error(`    ✗ Failed: ${error.message}`);
    }
  }

  await browser.close();
  console.log(`\nDone! Screenshots saved to: ${SCREENSHOT_DIR}`);
}

generateScreenshots().catch(console.error);
