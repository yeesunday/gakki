import fs from "node:fs/promises";
import path from "node:path";
import { file, hash, newOutput, writeJson } from "./files.mjs";

export async function sharpRuntime() {
  try {
    return (await import("sharp")).default;
  } catch {
    throw new Error(
      "Image runtime missing. Run node scripts/setup.mjs from the installed GAKKI plugin directory.",
    );
  }
}
export async function readImage(input) {
  const source = await file(input);
  if ((await fs.stat(source)).size > 80 * 1024 * 1024)
    throw new Error("Image exceeds 80 MiB");
  const sharp = await sharpRuntime();
  const bytes = await fs.readFile(source);
  const metadata = await sharp(bytes, {
    limitInputPixels: 32_000_000,
    failOn: "error",
  }).metadata();
  if (
    !["png", "jpeg", "webp"].includes(metadata.format) ||
    (metadata.pages ?? 1) !== 1
  )
    throw new Error("Use a single-frame PNG, JPEG or WebP");
  const { data, info } = await sharp(bytes)
    .autoOrient()
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    sharp,
    data,
    info,
    source: {
      path: source,
      sha256: hash(bytes),
      width: info.width,
      height: info.height,
      format: metadata.format,
      originalOrientation: metadata.orientation ?? 1,
      coordinateSpace: "exif-oriented source pixels",
    },
  };
}
export function box(rect, width, height) {
  if (
    !Array.isArray(rect) ||
    rect.length !== 4 ||
    rect.some((v) => !Number.isInteger(v))
  )
    throw new Error("Rect must contain integer x, y, width, height");
  const [left, top, w, h] = rect;
  if (
    left < 0 ||
    top < 0 ||
    w < 1 ||
    h < 1 ||
    left + w > width ||
    top + h > height
  )
    throw new Error("Rect exceeds source image");
  return { left, top, width: w, height: h };
}
export async function png(image, rect) {
  let pipeline = image.sharp(image.data, { raw: image.info });
  if (rect)
    pipeline = pipeline.extract(box(rect, image.info.width, image.info.height));
  return pipeline.png().toBuffer();
}
export async function inspectDesign({ imagePath, regions = [] }) {
  const image = await readImage(imagePath);
  const { width, height } = image.info;
  let left = width,
    top = height,
    right = -1,
    bottom = -1,
    transparent = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const alpha = image.data[(y * width + x) * 4 + 3];
      if (alpha === 0) transparent++;
      if (alpha > 8) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  const full = await png(image);
  const preview = await image
    .sharp(full)
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const items = [
    {
      label: "reference preview; coordinates remain original pixels",
      bytes: preview,
    },
  ];
  const measurements = [];
  for (const region of regions) {
    const cropped = await png(image, region.rect);
    const stats = await image.sharp(cropped).stats();
    measurements.push({
      id: region.id,
      rect: region.rect,
      meanRgba: stats.channels.map((c) => Number(c.mean.toFixed(2))),
    });
    items.push({ label: region.id, bytes: cropped });
  }
  return {
    result: {
      source: image.source,
      transparentPixels: transparent,
      contentBoundsAboveAlpha8:
        right < 0 ? null : [left, top, right - left + 1, bottom - top + 1],
      regions: measurements,
      note: "These are observed pixels. Infer layout separately; map changing content to existing project models, not invented APIs.",
    },
    previews: items,
  };
}

export async function prepareAssets({ assets, outputDir, target = "flutter" }) {
  if (new Set(assets.map((a) => a.id)).size !== assets.length)
    throw new Error("Asset IDs must be unique");
  const prepared = [];
  for (const asset of assets) {
    const image = await readImage(asset.source);
    const rect = asset.rect ?? [0, 0, image.info.width, image.info.height];
    const area = box(rect, image.info.width, image.info.height);
    const [logicalWidth, logicalHeight] = asset.logicalSize;
    if (
      Math.abs(area.width / area.height - logicalWidth / logicalHeight) > 0.01
    )
      throw new Error(
        `${asset.id}: logical size changes aspect ratio; use an explicit crop`,
      );
    if (
      asset.scales.some(
        (s) =>
          Math.round(logicalWidth * s) > area.width ||
          Math.round(logicalHeight * s) > area.height,
      )
    )
      throw new Error(
        `${asset.id}: insufficient source pixels for requested density`,
      );
    const buffer = await png(image, rect);
    if (
      asset.alpha === "required" &&
      (await image.sharp(buffer).stats()).channels[3].min === 255
    )
      throw new Error(
        `${asset.id}: source is opaque; preserve background or supply a real cutout. No automatic edge-color erasure.`,
      );
    prepared.push({ asset, image, rect, buffer });
  }
  const output = await newOutput(outputDir);
  const records = [];
  for (const { asset, image, rect, buffer } of prepared) {
    const variants = [];
    for (const scale of asset.scales) {
      const prefix = asset.usage === "fixture" ? "fixtures/" : "";
      const relative =
        target === "flutter"
          ? `${prefix}${scale === 1 ? "" : `${Number.isInteger(scale) ? scale.toFixed(1) : scale}x/`}${asset.id}.png`
          : `${prefix}${asset.id}${scale === 1 ? "" : `@${scale}x`}.png`;
      const destination = path.join(output, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const bytes = await image
        .sharp(buffer)
        .resize(
          Math.round(asset.logicalSize[0] * scale),
          Math.round(asset.logicalSize[1] * scale),
          { kernel: "lanczos3" },
        )
        .png()
        .toBuffer();
      await fs.writeFile(destination, bytes, { flag: "wx" });
      variants.push({ path: relative, scale, sha256: hash(bytes) });
    }
    records.push({
      id: asset.id,
      usage: asset.usage,
      source: image.source,
      rect,
      logicalSize: asset.logicalSize,
      alpha: asset.alpha,
      variants,
    });
  }
  const manifest = {
    schema: "gakki.assets/2",
    target,
    assets: records,
    visualAcceptance: "not_evaluated",
  };
  await writeJson(path.join(output, "assets.json"), manifest);
  return {
    outputDir: output,
    manifest: path.join(output, "assets.json"),
    assets: records.length,
    files: records.reduce((sum, a) => sum + a.variants.length, 0),
    visualAcceptance: "not_evaluated",
  };
}
