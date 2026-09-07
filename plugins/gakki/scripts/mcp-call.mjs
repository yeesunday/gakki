// Exercise the exact packaged stdio entry, including initialization and tool schemas.
// Requires development dependencies; the installed plugin itself does not.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [
  name = "doctor",
  inputFile,
  entry = fileURLToPath(new URL("../dist/mcp.mjs", import.meta.url)),
  previewDir,
] = process.argv.slice(2);
const client = new Client({ name: "gakki-debug", version: "1" });
const start = performance.now();
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      cwd: os.tmpdir(),
      stderr: "inherit",
    }),
  );
  const reply = await client.callTool(
    {
      name,
      arguments: inputFile
        ? JSON.parse(await fs.readFile(inputFile, "utf8"))
        : {},
    },
    undefined,
    { timeout: 180000 },
  );
  const value = reply.isError
    ? reply.content[0].text
    : JSON.parse(reply.content[0].text);
  const images = reply.content.filter((c) => c.type === "image");
  const previews = [];
  if (previewDir && images.length) {
    const output = path.resolve(previewDir);
    await fs.mkdir(output, { recursive: false });
    for (const [index, item] of images.entries()) {
      const extension = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
      }[item.mimeType];
      if (!extension)
        throw new Error(`Unsupported preview MIME: ${item.mimeType}`);
      const target = path.join(output, `preview-${index + 1}.${extension}`);
      await fs.writeFile(target, Buffer.from(item.data, "base64"), {
        flag: "wx",
      });
      previews.push(target);
    }
  }
  console.log(
    JSON.stringify(
      {
        value,
        imageCount: images.length,
        ...(previewDir ? { previews } : {}),
        elapsedMs: Math.round(performance.now() - start),
        isError: reply.isError ?? false,
      },
      null,
      2,
    ),
  );
  if (
    reply.isError ||
    value.checks === "failed" ||
    value.status === "stale" ||
    value.sourceChanged
  )
    process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
} finally {
  await client.close();
}
