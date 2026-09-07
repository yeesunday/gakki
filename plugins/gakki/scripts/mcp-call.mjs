// Exercise the exact packaged stdio entry, including initialization and tool schemas.
// Requires development dependencies; the installed plugin itself does not.
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [
  name = "doctor",
  inputFile,
  entry = fileURLToPath(new URL("../dist/mcp.mjs", import.meta.url)),
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
  console.log(
    JSON.stringify(
      {
        value,
        imageCount: reply.content.filter((c) => c.type === "image").length,
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
