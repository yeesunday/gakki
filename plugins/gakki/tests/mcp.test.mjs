import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import sharp from "sharp";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test(
  "plugin MCP configuration resolves to the working packaged server",
  { timeout: 10000 },
  async (t) => {
    const config = JSON.parse(
      await fs.readFile(path.join(root, ".mcp.json"), "utf8"),
    ).mcpServers.gakki;
    const client = new Client({ name: "gakki-manifest-test", version: "1" });
    t.after(() => client.close());
    await client.connect(
      new StdioClientTransport({
        command: config.command,
        args: config.args,
        cwd: path.resolve(root, config.cwd),
        stderr: "pipe",
      }),
    );
    const reply = await client.callTool({ name: "doctor", arguments: {} });
    assert.equal(reply.isError, undefined);
    assert.equal(
      JSON.parse(reply.content[0].text).entrypoint,
      path.join(root, "dist/mcp.mjs"),
    );
  },
);
test(
  "packaged MCP executable starts and answers from an unrelated cwd",
  { timeout: 10000 },
  async (t) => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(root, "dist/mcp.mjs")],
      cwd: os.tmpdir(),
      stderr: "pipe",
    });
    const client = new Client({ name: "gakki-package-test", version: "1" });
    t.after(() => client.close());
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 7);
    const reply = await client.callTool({ name: "doctor", arguments: {} });
    const value = JSON.parse(reply.content[0].text);
    assert.equal(value.version, "0.4.0-alpha.1");
    assert.equal(value.images, true);
    assert.equal(value.execution, "bundle");
    assert.match(value.build.sourceFingerprint, /^[a-f0-9]{64}$/);
    const imageDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "gakki-mcp-image-"),
    );
    t.after(() => fs.rm(imageDir, { recursive: true, force: true }));
    const imagePath = path.join(imageDir, "source.png");
    await sharp({
      create: {
        width: 30,
        height: 30,
        channels: 4,
        background: { r: 40, g: 100, b: 160, alpha: 0.5 },
      },
    })
      .png()
      .toFile(imagePath);
    const inspected = await client.callTool({
      name: "inspect_design",
      arguments: {
        imagePath,
        regions: [{ id: "detail", rect: [0, 0, 10, 10] }],
      },
    });
    assert.equal(inspected.isError, undefined);
    assert.equal(inspected.content.filter((c) => c.type === "image").length, 2);
    assert.equal(JSON.parse(inspected.content[0].text).source.width, 30);
    const failed = await client.callTool({
      name: "inspect_design",
      arguments: { imagePath: "/nonexistent/gakki.png" },
    });
    assert.equal(failed.isError, true);
  },
);
test(
  "copy of only the distribution runs without development dependencies",
  { timeout: 10000 },
  async (t) => {
    const copy = await fs.mkdtemp(path.join(os.tmpdir(), "gakki-installed-"));
    t.after(() => fs.rm(copy, { recursive: true, force: true }));
    await fs.cp(path.join(root, "dist"), path.join(copy, "dist"), {
      recursive: true,
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(copy, "dist/mcp.mjs")],
      cwd: os.tmpdir(),
      stderr: "pipe",
    });
    const client = new Client({ name: "gakki-clean-install", version: "1" });
    t.after(() => client.close());
    await client.connect(transport);
    const reply = await client.callTool({ name: "doctor", arguments: {} });
    const result = JSON.parse(reply.content[0].text);
    assert.equal(result.images, false);
    assert.equal(result.browserLibrary, false);
    assert.ok(result.setupCommand.includes(copy));
  },
);

test("debug client persists real image previews without overwriting prior evidence", async (t) => {
  const { promisify } = await import("node:util");
  const { execFile } = await import("node:child_process");
  const run = promisify(execFile);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gakki-preview-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, "source.png");
  await sharp({
    create: { width: 20, height: 30, channels: 4, background: "#8c80bb" },
  })
    .png()
    .toFile(source);
  const input = path.join(dir, "input.json");
  await fs.writeFile(input, JSON.stringify({ imagePath: source }));
  const args = [
    path.join(root, "scripts/mcp-call.mjs"),
    "inspect_design",
    input,
    path.join(root, "dist/mcp.mjs"),
    path.join(dir, "previews"),
  ];
  const result = JSON.parse((await run(process.execPath, args)).stdout);
  assert.equal(result.imageCount, 1);
  assert.equal(result.previews.length, 1);
  const before = await fs.readFile(result.previews[0]);
  assert.equal((await sharp(before).metadata()).width, 20);
  await assert.rejects(run(process.execPath, args));
  assert.deepEqual(await fs.readFile(result.previews[0]), before);
});
