import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execute } from "../src/operations.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gakki-capture-"));
  const page = path.join(root, "index.html");
  await fs.writeFile(
    page,
    `<!doctype html><html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px}button{height:44px;min-width:100px}input{max-width:100%}</style><form><input aria-label="name" id="name"><button id="save">保存</button></form><output id="result"></output><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();document.querySelector('output').textContent=document.querySelector('input').value}</script></html>`,
  );
  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(await fs.readFile(page));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, page, url: `http://127.0.0.1:${server.address().port}` };
}
test("real browser captures multiple viewports, interaction and drift", async (t) => {
  const f = await fixture(t);
  const result = await execute("capture_web", {
    url: f.url,
    projectRoot: f.root,
    outputDir: path.join(f.root, "capture"),
    files: ["index.html"],
    viewports: [
      { id: "compact", width: 375, height: 667 },
      { id: "wide", width: 960, height: 800 },
    ],
    steps: [
      { action: "fill", selector: "#name", value: "本地测试" },
      { action: "press", selector: "#name", value: "Enter" },
    ],
    expectations: [
      { selector: "#save", minHeight: 44, visible: true, inViewport: true },
      { selector: "#result", textIncludes: "本地测试" },
    ],
  });
  assert.equal(result.checks, "passed");
  assert.equal(result.captures.length, 2);
  assert.equal(result.fidelity, "not_evaluated");
  assert.equal(result.captures[0].measurements.elements[0].rect[3], 44);
  assert.equal(
    (
      await execute("verify_capture", {
        report: result.report,
        projectRoot: f.root,
      })
    ).status,
    "current",
  );
  await fs.appendFile(f.page, "<!-- next iteration -->");
  assert.equal(
    (
      await execute("verify_capture", {
        report: result.report,
        projectRoot: f.root,
      })
    ).status,
    "stale",
  );
  await fs.unlink(f.page);
  const removed = await execute("verify_capture", {
    report: result.report,
    projectRoot: f.root,
  });
  assert.equal(removed.status, "stale");
  assert.equal(removed.differences[0].missing, true);
  assert.ok(result.environment.browser);
  assert.match(result.captures[0].sha256, /^[a-f0-9]{64}$/);
});
test("real browser exposes overflow, tiny controls and missing selectors", async (t) => {
  const f = await fixture(t);
  await fs.appendFile(
    f.page,
    "<style>body{width:900px}button{height:20px}</style>",
  );
  const result = await execute("capture_web", {
    url: f.url,
    projectRoot: f.root,
    outputDir: path.join(f.root, "capture"),
    viewports: [{ id: "compact", width: 375, height: 667 }],
    expectations: [
      { selector: "#save", minHeight: 44 },
      { selector: ".missing", visible: true },
    ],
  });
  assert.equal(result.checks, "failed");
  assert.deepEqual(
    result.captures[0].checks.filter((c) => !c.passed).map((c) => c.id),
    ["horizontal-overflow", "#save", ".missing"],
  );
});
test("missing ready state stays a failure; screenshots are not silently accepted", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    execute("capture_web", {
      url: f.url,
      projectRoot: f.root,
      outputDir: path.join(f.root, "capture"),
      viewports: [{ id: "compact", width: 375, height: 667 }],
      readySelector: ".never-ready",
      timeoutMs: 500,
    }),
    /Timeout/,
  );
  await assert.rejects(fs.access(path.join(f.root, "capture/capture.json")));
});
test("unsafe source selection and duplicate viewport IDs are rejected", async (t) => {
  const f = await fixture(t);
  const args = {
    url: f.url,
    projectRoot: f.root,
    outputDir: path.join(f.root, "capture"),
    viewports: [{ id: "a", width: 375, height: 667 }],
  };
  await assert.rejects(
    execute("capture_web", { ...args, files: [f.page] }),
    /project-relative/,
  );
  await assert.rejects(
    execute("capture_web", {
      ...args,
      viewports: [...args.viewports, ...args.viewports],
    }),
    /Duplicate viewport/,
  );
  await assert.rejects(
    execute("capture_web", { ...args, url: "https://example.com" }),
    /local development/,
  );
});
