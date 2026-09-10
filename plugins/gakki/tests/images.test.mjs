import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { execute } from "../src/operations.mjs";

async function fixture(t, color = { r: 24, g: 80, b: 140, alpha: 0.5 }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gakki-image-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source.png");
  await sharp({
    create: { width: 60, height: 90, channels: 4, background: color },
  })
    .png()
    .toFile(source);
  return { root, source };
}
const request = (f, extra = {}) => ({
  outputDir: path.join(f.root, "out"),
  assets: [
    {
      id: "frame",
      source: f.source,
      logicalSize: [20, 30],
      usage: "static",
      alpha: "required",
      ...extra,
    },
  ],
});

test("exact source coordinates and alpha survive Flutter density packaging", async (t) => {
  const f = await fixture(t);
  const output = await execute("prepare_assets", request(f));
  const manifest = JSON.parse(await fs.readFile(output.manifest));
  assert.deepEqual(
    manifest.assets[0].variants.map((v) => v.path),
    ["frame.png", "2.0x/frame.png", "3.0x/frame.png"],
  );
  for (const [scale, relative] of [
    [1, "frame.png"],
    [2, "2.0x/frame.png"],
    [3, "3.0x/frame.png"],
  ]) {
    const image = sharp(path.join(output.outputDir, relative));
    const m = await image.metadata(),
      s = await image.stats();
    assert.equal(m.width, 20 * scale);
    assert.equal(m.height, 30 * scale);
    assert.ok(s.channels[3].min >= 127 && s.channels[3].max <= 128);
  }
  const inspected = await execute("inspect_design", {
    imagePath: f.source,
    regions: [{ id: "corner", rect: [0, 0, 10, 10] }],
  });
  assert.equal(inspected.result.source.width, 60);
  assert.equal(inspected.previews.length, 2);
  assert.deepEqual(inspected.result.contentBoundsAboveAlpha8, [0, 0, 60, 90]);
});
test("fixtures remain separate from production assets and opaque backgrounds remain valid", async (t) => {
  const f = await fixture(t, { r: 200, g: 100, b: 50, alpha: 1 });
  const output = await execute("prepare_assets", {
    ...request(f, { usage: "fixture", alpha: "preserve", scales: [1] }),
    target: "web",
  });
  const manifest = JSON.parse(await fs.readFile(output.manifest));
  assert.equal(manifest.assets[0].usage, "fixture");
  assert.equal(manifest.assets[0].variants[0].path, "fixtures/frame.png");
  assert.equal(
    (await sharp(path.join(output.outputDir, "fixtures/frame.png")).stats())
      .channels[3].min,
    255,
  );
});
for (const [name, change, pattern] of [
  ["upscaling", { logicalSize: [40, 60] }, /insufficient source/],
  ["distortion", { logicalSize: [20, 20] }, /aspect ratio/],
  ["out-of-bounds crop", { rect: [55, 0, 10, 10] }, /exceeds source/],
  ["path traversal", { id: "../../escape" }, /Invalid/],
  ["duplicate scale", { scales: [1, 1] }, /Duplicate scale/],
])
  test(`reject ${name} before writing output`, async (t) => {
    const f = await fixture(t);
    await assert.rejects(
      execute("prepare_assets", request(f, change)),
      pattern,
    );
    await assert.rejects(fs.access(path.join(f.root, "out")));
  });
test("opaque input cannot masquerade as a required cutout", async (t) => {
  const f = await fixture(t, { r: 245, g: 240, b: 235, alpha: 1 });
  await assert.rejects(
    execute("prepare_assets", request(f)),
    /source is opaque/,
  );
  await assert.rejects(fs.access(path.join(f.root, "out")));
});

test("alpha inspection distinguishes visible artwork, an open center and edge pixels", async (t) => {
  const f = await fixture(t);
  const data = Buffer.alloc(60 * 90 * 4);
  for (const [x, alpha] of [
    [10, 255],
    [11, 128],
  ]) {
    const offset = (10 * 60 + x) * 4;
    data.set([240, 210, 140, alpha], offset);
  }
  await sharp(data, { raw: { width: 60, height: 90, channels: 4 } })
    .png()
    .toFile(f.source);
  const inspected = await execute("inspect_design", {
    imagePath: f.source,
    transparencyPreview: true,
    regions: [{ id: "opening", rect: [20, 20, 20, 30] }],
  });
  assert.equal(inspected.result.source.hasAlpha, true);
  assert.deepEqual(inspected.result.alpha, {
    min: 0,
    max: 255,
    totalPixels: 5400,
    transparentPixels: 5398,
    translucentPixels: 1,
    opaquePixels: 1,
    status: "has_transparency",
  });
  assert.equal(inspected.result.regions[0].alpha.status, "invisible");
  assert.deepEqual(inspected.result.contentBoundsAboveAlpha8, [10, 10, 2, 1]);
  assert.equal(inspected.previews.length, 4);
  const { data: pair, info } = await sharp(inspected.previews[1].bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 120);
  assert.deepEqual([...pair.subarray(0, 3)], [245, 245, 245]);
  assert.deepEqual([...pair.subarray(60 * 3, 60 * 3 + 3)], [32, 32, 32]);
  // Opaque foreground is unchanged over both backgrounds.
  assert.deepEqual(
    [...pair.subarray((10 * 120 + 10) * 3, (10 * 120 + 10) * 3 + 3)],
    [240, 210, 140],
  );
  assert.deepEqual(
    [...pair.subarray((10 * 120 + 70) * 3, (10 * 120 + 70) * 3 + 3)],
    [240, 210, 140],
  );
});

for (const channels of [3, 4])
  test(`edited cutout replaced by a ${channels}-channel opaque checkerboard is rejected`, async (t) => {
    const f = await fixture(t);
    await execute("prepare_assets", request(f));
    const data = Buffer.alloc(60 * 90 * channels, 255);
    for (let y = 0; y < 90; y++)
      for (let x = 0; x < 60; x++) {
        const gray = (Math.floor(x / 6) + Math.floor(y / 6)) % 2 ? 180 : 220;
        const offset = (y * 60 + x) * channels;
        data.set([gray, gray, gray], offset);
      }
    const edited = path.join(f.root, "edited.png");
    await sharp(data, { raw: { width: 60, height: 90, channels } })
      .png()
      .toFile(edited);
    const inspected = await execute("inspect_design", { imagePath: edited });
    assert.equal(inspected.result.source.hasAlpha, channels === 4);
    assert.equal(inspected.result.alpha.status, "opaque");
    assert.equal(inspected.result.alpha.opaquePixels, 5400);
    const outputDir = path.join(f.root, "edited-out");
    await assert.rejects(
      execute("prepare_assets", {
        ...request(f, { source: edited }),
        outputDir,
      }),
      /source is opaque/,
    );
    await assert.rejects(fs.access(outputDir));
  });

test("transparent surroundings do not make an opaque crop a cutout", async (t) => {
  const f = await fixture(t, { r: 0, g: 0, b: 0, alpha: 0 });
  const bytes = await sharp(f.source)
    .composite([
      {
        input: await sharp({
          create: { width: 20, height: 30, channels: 4, background: "white" },
        })
          .png()
          .toBuffer(),
        left: 10,
        top: 10,
      },
    ])
    .png()
    .toBuffer();
  await fs.writeFile(f.source, bytes);
  await assert.rejects(
    execute(
      "prepare_assets",
      request(f, { rect: [10, 10, 20, 30], scales: [1] }),
    ),
    /source is opaque/,
  );
  await assert.rejects(fs.access(path.join(f.root, "out")));
});

test("invisible cutout cannot pass required-alpha packaging", async (t) => {
  const f = await fixture(t, { r: 0, g: 0, b: 0, alpha: 0 });
  const inspected = await execute("inspect_design", { imagePath: f.source });
  assert.equal(inspected.result.alpha.status, "invisible");
  assert.equal(inspected.result.contentBoundsAboveAlpha8, null);
  await assert.rejects(
    execute("prepare_assets", request(f)),
    /fully transparent/,
  );
  await assert.rejects(fs.access(path.join(f.root, "out")));
});
test("existing output is not overwritten", async (t) => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.root, "out"));
  await fs.writeFile(path.join(f.root, "out/keep"), "original");
  await assert.rejects(execute("prepare_assets", request(f)), /EEXIST/);
  assert.equal(
    await fs.readFile(path.join(f.root, "out/keep"), "utf8"),
    "original",
  );
});
test("EXIF orientation defines the coordinate space", async (t) => {
  const f = await fixture(t);
  const jpg = path.join(f.root, "oriented.jpg");
  await sharp({
    create: { width: 60, height: 90, channels: 3, background: "red" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toFile(jpg);
  const value = await execute("inspect_design", {
    imagePath: jpg,
    regions: [{ id: "right", rect: [80, 0, 10, 10] }],
  });
  assert.equal(value.result.source.width, 90);
  assert.equal(value.result.source.height, 60);
});
test("comparison detects alpha differences and creates a review without claiming fidelity", async (t) => {
  const f = await fixture(t),
    other = path.join(f.root, "other.png");
  await sharp({
    create: {
      width: 60,
      height: 90,
      channels: 4,
      background: { r: 24, g: 80, b: 140, alpha: 1 },
    },
  })
    .png()
    .toFile(other);
  const result = await execute("compare_render", {
    reference: f.source,
    actual: other,
    outputDir: path.join(f.root, "diff"),
    regions: [{ id: "detail", rect: [0, 0, 10, 10] }],
  });
  assert.equal(result.assessment, "needs_visual_review");
  assert.ok(result.regions[0].alphaMae > 100);
  assert.equal(result.regions[1].changedFraction, 1);
  await fs.access(result.review);
});
test("invisible RGB does not inflate visual metrics", async (t) => {
  const f = await fixture(t, { r: 255, g: 0, b: 0, alpha: 0 }),
    other = path.join(f.root, "other.png");
  await sharp({
    create: {
      width: 60,
      height: 90,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 0 },
    },
  })
    .png()
    .toFile(other);
  const result = await execute("compare_render", {
    reference: f.source,
    actual: other,
    outputDir: path.join(f.root, "diff"),
  });
  assert.equal(result.regions[0].changedFraction, 0);
  assert.equal(result.regions[0].rgbMae, 0);
});
test("comparison refuses unequal dimensions and invalid region paths", async (t) => {
  const f = await fixture(t),
    other = path.join(f.root, "small.png");
  await sharp(f.source).resize(10, 15).toFile(other);
  await assert.rejects(
    execute("compare_render", {
      reference: f.source,
      actual: other,
      outputDir: path.join(f.root, "diff"),
    }),
    /identical pixel/,
  );
  await assert.rejects(
    execute("compare_render", {
      reference: f.source,
      actual: f.source,
      outputDir: path.join(f.root, "diff"),
      regions: [{ id: "../oops", rect: [0, 0, 1, 1] }],
    }),
  );
  await assert.rejects(fs.access(path.join(f.root, "diff")));
});
