import fs from "node:fs/promises";
import path from "node:path";
import { readImage, png } from "./images.mjs";
import { newOutput, writeJson, escapeHtml } from "./files.mjs";

export async function compareRender({
  reference,
  actual,
  outputDir,
  regions = [],
}) {
  const left = await readImage(reference),
    right = await readImage(actual);
  if (
    left.info.width !== right.info.width ||
    left.info.height !== right.info.height
  )
    throw new Error(
      "Reference and actual must have identical pixel dimensions; choose a matching viewport/DPR or an explicit prior crop. No implicit resize.",
    );
  const names = ["full", ...regions.map((r) => r.id)];
  if (new Set(names).size !== names.length)
    throw new Error("Unique region IDs required; full is reserved");
  // Validate every region before creating output.
  const pairs = [];
  for (const region of [{ id: "full" }, ...regions])
    pairs.push({
      region,
      a: await png(left, region.rect),
      b: await png(right, region.rect),
    });
  const output = await newOutput(outputDir),
    results = [];
  for (const { region, a, b } of pairs) {
    const { data: ad, info } = await left
      .sharp(a)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const bd = await left.sharp(b).raw().toBuffer();
    const diff = Buffer.alloc(ad.length),
      overlay = Buffer.alloc(ad.length);
    let rgbError = 0,
      alphaError = 0,
      changed = 0;
    for (let i = 0; i < ad.length; i += 4) {
      let delta = Math.abs(ad[i + 3] - bd[i + 3]);
      alphaError += delta;
      for (let c = 0; c < 3; c++) {
        // Composite on white so invisible RGB cannot inflate the visual metric.
        const ar = (ad[i + c] * ad[i + 3]) / 255 + 255 - ad[i + 3];
        const br = (bd[i + c] * bd[i + 3]) / 255 + 255 - bd[i + 3];
        rgbError += Math.abs(ar - br);
        delta = Math.max(delta, Math.abs(ar - br));
        overlay[i + c] = Math.round((ar + br) / 2);
      }
      if (delta > 8) changed++;
      diff[i] = 255;
      diff[i + 1] = diff[i + 2] = 255 - Math.min(255, Math.round(delta * 4));
      diff[i + 3] = overlay[i + 3] = 255;
    }
    const folder = path.join(output, region.id);
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, "reference.png"), a);
    await fs.writeFile(path.join(folder, "actual.png"), b);
    await left
      .sharp(diff, { raw: info })
      .png()
      .toFile(path.join(folder, "diff.png"));
    await left
      .sharp(overlay, { raw: info })
      .png()
      .toFile(path.join(folder, "overlay.png"));
    const pixels = info.width * info.height;
    results.push({
      id: region.id,
      rect: region.rect ?? [0, 0, info.width, info.height],
      rgbMae: rgbError / pixels / 3,
      alphaMae: alphaError / pixels,
      changedFraction: changed / pixels,
    });
  }
  const result = {
    schema: "gakki.comparison/2",
    reference: left.source,
    actual: right.source,
    assessment: "needs_visual_review",
    regions: results,
    note: "Difference diagnostics only. These metrics do not judge design correctness or authorize baseline replacement.",
  };
  await writeJson(path.join(output, "comparison.json"), result);
  await fs.writeFile(
    path.join(output, "review.html"),
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>GAKKI · 页面比较</title><style>body{margin:32px;font:15px system-ui;background:#f8f7f4;color:#292b34}h1{font-size:28px}p{line-height:1.6}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}img{width:100%;border:1px solid #ddd}figure{margin:0}section{margin:32px 0}label{display:block;margin-bottom:8px}@media(max-width:800px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}</style><h1>GAKKI · 页面比较</h1><p>参考 / 当前 / 叠加 / 差异。统计值用于定位问题，最终判断需结合页面用途、动态内容与交互。</p>${results
      .map(
        (r) =>
          `<section><h2>${escapeHtml(r.id)}</h2><p>变化像素 ${(r.changedFraction * 100).toFixed(2)}% · RGB MAE ${r.rgbMae.toFixed(2)}</p><div class="grid">${[
            ["reference", "参考"],
            ["actual", "当前"],
            ["overlay", "叠加"],
            ["diff", "差异"],
          ]
            .map(
              ([f, label]) =>
                `<figure><label>${label}</label><img loading="lazy" src="${r.id}/${f}.png" alt="${escapeHtml(r.id)} ${label}"></figure>`,
            )
            .join("")}</div></section>`,
      )
      .join("")}</html>`,
    { flag: "wx" },
  );
  return {
    report: path.join(output, "comparison.json"),
    review: path.join(output, "review.html"),
    ...result,
  };
}
