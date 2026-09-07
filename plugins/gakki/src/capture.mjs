import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { newOutput, snapshot, writeJson, hash } from "./files.mjs";
import { readImage } from "./images.mjs";

const execFileAsync = promisify(execFile);
export async function browserRuntime(executablePath) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    throw new Error(
      "Browser runtime missing. Run node scripts/setup.mjs in the installed plugin.",
    );
  }
  if (executablePath)
    return chromium.launch({ executablePath, headless: true });
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    try {
      return await chromium.launch({ headless: true });
    } catch {
      throw new Error(
        "No usable Chrome/Chromium. Use an installed browserExecutable or install Chromium with npx playwright-core install chromium. No browser was downloaded.",
      );
    }
  }
}
export async function captureWeb(args) {
  const url = new URL(args.url);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error(
      "capture_web operates on a local development URL without embedded credentials. Use the host browser tools for external websites.",
    );
  const start = performance.now();
  const before = await snapshot(args.projectRoot, args.files);
  const browser = await browserRuntime(args.browserExecutable);
  const browserVersion = browser.version();
  let output;
  const captures = [];
  try {
    output = await newOutput(args.outputDir);
    for (const viewport of args.viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.dpr,
        locale: args.locale,
        reducedMotion: "reduce",
        colorScheme: "light",
      });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(args.timeoutMs);
        const errors = [];
        page.on("pageerror", (error) =>
          errors.push({ kind: "javascript", message: error.message }),
        );
        page.on("requestfailed", (request) =>
          errors.push({
            kind: "network",
            url: request.url(),
            message: request.failure()?.errorText,
          }),
        );
        page.on("response", (response) => {
          if (response.status() >= 400)
            errors.push({
              kind: "http",
              url: response.url(),
              status: response.status(),
            });
        });
        await page.goto(url.href, {
          waitUntil: "load",
          timeout: args.timeoutMs,
        });
        if (args.readySelector)
          await page.locator(args.readySelector).waitFor({ state: "visible" });
        for (const step of args.steps) {
          const locator = page.locator(step.selector);
          if (step.action === "fill") await locator.fill(step.value);
          else if (step.action === "press") await locator.press(step.value);
          else if (step.action === "click") await locator.click();
          else await locator.waitFor({ state: "visible" });
        }
        await page.evaluate(async (timeout) => {
          let timer;
          try {
            await Promise.race([
              Promise.all([
                document.fonts.ready,
                ...Array.from(document.images, (image) =>
                  image.complete
                    ? Promise.resolve()
                    : new Promise((resolve) => {
                        image.addEventListener("load", resolve, { once: true });
                        image.addEventListener("error", resolve, {
                          once: true,
                        });
                      }),
                ),
              ]),
              new Promise((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error("Page fonts/images did not settle")),
                  timeout,
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        }, args.timeoutMs);
        const measured = await page.evaluate((selectors) => {
          const rectOf = (e) => {
            const r = e.getBoundingClientRect();
            return [r.x, r.y, r.width, r.height];
          };
          return {
            viewport: {
              width: innerWidth,
              height: innerHeight,
              dpr: devicePixelRatio,
            },
            document: {
              width: document.documentElement.scrollWidth,
              height: document.documentElement.scrollHeight,
            },
            brokenImages: Array.from(document.images)
              .filter((i) => !i.complete || !i.naturalWidth)
              .map((i) => i.currentSrc),
            elements: selectors.map((selector) => {
              const matches = document.querySelectorAll(selector);
              if (matches.length !== 1)
                return { selector, matches: matches.length };
              const e = matches[0],
                s = getComputedStyle(e),
                rect = rectOf(e);
              const sourceElement = e.closest(
                "[data-gakki-source], [data-source]",
              );
              return {
                selector,
                matches: 1,
                rect,
                text: e.textContent?.trim().slice(0, 1000),
                visible:
                  e.checkVisibility({
                    opacityProperty: true,
                    visibilityProperty: true,
                  }) &&
                  rect[2] > 0 &&
                  rect[3] > 0,
                style: {
                  fontFamily: s.fontFamily,
                  fontSize: s.fontSize,
                  lineHeight: s.lineHeight,
                  color: s.color,
                  backgroundColor: s.backgroundColor,
                  padding: s.padding,
                  gap: s.gap,
                  display: s.display,
                },
                sourceHint:
                  sourceElement?.getAttribute("data-gakki-source") ??
                  sourceElement?.getAttribute("data-source") ??
                  null,
              };
            }),
          };
        }, args.selectors);
        const checks = [
          {
            id: "horizontal-overflow",
            passed: measured.document.width <= viewport.width + 1,
            expected: viewport.width,
            actual: measured.document.width,
          },
          {
            id: "images-loaded",
            passed: measured.brokenImages.length === 0,
            actual: measured.brokenImages.length,
          },
          {
            id: "runtime-errors",
            passed: errors.length === 0,
            actual: errors.length,
          },
        ];
        for (const rule of args.expectations) {
          const item = measured.elements.find(
            (e) => e.selector === rule.selector,
          );
          if (!item || item.matches !== 1) {
            checks.push({
              id: rule.selector,
              passed: false,
              reason:
                "Selector did not resolve to exactly one measured element",
            });
            continue;
          }
          const failures = [];
          if (rule.visible !== undefined && item.visible !== rule.visible)
            failures.push("visibility");
          if (rule.minWidth !== undefined && item.rect[2] < rule.minWidth)
            failures.push("width");
          if (rule.minHeight !== undefined && item.rect[3] < rule.minHeight)
            failures.push("height");
          if (
            rule.textIncludes !== undefined &&
            !item.text.includes(rule.textIncludes)
          )
            failures.push("text");
          if (
            rule.inViewport &&
            (item.rect[0] < 0 ||
              item.rect[1] < 0 ||
              item.rect[0] + item.rect[2] > viewport.width + 1 ||
              item.rect[1] + item.rect[3] > viewport.height + 1)
          )
            failures.push("viewport");
          if (
            rule.rect &&
            rule.rect.some(
              (v, i) => Math.abs(v - item.rect[i]) > rule.tolerance,
            )
          )
            failures.push("geometry");
          checks.push({
            id: rule.selector,
            passed: failures.length === 0,
            failures,
            actual: item,
          });
        }
        const screenshot = path.join(output, `${viewport.id}.png`);
        await page.screenshot({
          path: screenshot,
          animations: "disabled",
          caret: "hide",
          fullPage: false,
        });
        captures.push({
          id: viewport.id,
          screenshot,
          sha256: hash(await fs.readFile(screenshot)),
          measurements: measured,
          errors,
          checks,
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const after = await snapshot(args.projectRoot, args.files);
  const result = {
    schema: "gakki.capture/2",
    platform: "web",
    execution: "completed",
    url: url.href,
    environment: {
      os: os.platform(),
      arch: os.arch(),
      node: process.version,
      browser: browserVersion,
    },
    elapsedMs: Math.round(performance.now() - start),
    sources: before,
    sourceChanged: JSON.stringify(before) !== JSON.stringify(after),
    checks: captures.every((c) => c.checks.every((k) => k.passed))
      ? "passed"
      : "failed",
    fidelity: "not_evaluated",
    captures,
  };
  await writeJson(path.join(output, "capture.json"), result);
  return { report: path.join(output, "capture.json"), ...result };
}

export async function readIosSettings(deviceId, run = execFileAsync) {
  const settings = {};
  for (const option of ["appearance", "content_size"]) {
    try {
      const { stdout } = await run(
        "xcrun",
        ["simctl", "ui", deviceId, option],
        { timeout: 5000 },
      );
      const value = stdout.trim();
      settings[option] =
        value && !["unknown", "unsupported"].includes(value)
          ? { status: "measured", value }
          : { status: "unavailable" };
    } catch {
      settings[option] = { status: "unavailable" };
    }
  }
  return settings;
}

export async function captureIos(args) {
  if (process.platform !== "darwin")
    throw new Error("iOS simulator capture requires macOS and Xcode");
  const start = performance.now(),
    before = await snapshot(args.projectRoot, args.files);
  const { stdout } = await execFileAsync(
    "xcrun",
    ["simctl", "list", "devices", "--json"],
    { timeout: 15000, maxBuffer: 8 * 1024 * 1024 },
  );
  const inventory = JSON.parse(stdout).devices;
  const devices = args.devices.map((id) => {
    for (const [runtime, list] of Object.entries(inventory)) {
      const device = list.find((d) => d.udid === id);
      if (device) {
        if (device.state !== "Booted")
          throw new Error(`Simulator ${id} is not booted`);
        return { ...device, runtime };
      }
    }
    throw new Error(`Unknown simulator ${id}`);
  });
  const output = await newOutput(args.outputDir),
    captures = [];
  for (const device of devices) {
    const screenshot = path.join(output, `${device.udid}.png`);
    await execFileAsync(
      "xcrun",
      ["simctl", "io", device.udid, "screenshot", screenshot],
      { timeout: 15000 },
    );
    const image = await readImage(screenshot);
    captures.push({
      id: device.udid,
      name: device.name,
      runtime: device.runtime,
      settings: await readIosSettings(device.udid),
      screenshot,
      image: image.source,
    });
  }
  const after = await snapshot(args.projectRoot, args.files);
  const result = {
    schema: "gakki.capture/2",
    platform: "ios",
    context: args.context ? { status: "declared", ...args.context } : null,
    binaryProvenance: "not_verified",
    execution: "completed",
    elapsedMs: Math.round(performance.now() - start),
    sources: before,
    sourceChanged: JSON.stringify(before) !== JSON.stringify(after),
    checks: "not_run",
    fidelity: "not_evaluated",
    note: "Captured the current simulator surfaces. This tool does not build, launch, navigate, or infer which app/state is visible.",
    captures,
  };
  await writeJson(path.join(output, "capture.json"), result);
  return { report: path.join(output, "capture.json"), ...result };
}
