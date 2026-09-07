import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { operations, execute, VERSION } from "./operations.mjs";
import { readImage } from "./images.mjs";

const server = new McpServer({ name: "gakki", version: VERSION });
for (const [name, operation] of Object.entries(operations)) {
  server.registerTool(
    name,
    {
      description: operation.description,
      inputSchema: operation.schema.shape,
      annotations: {
        readOnlyHint: operation.readOnly,
        destructiveHint: false,
        openWorldHint: name === "capture_web",
      },
    },
    async (input) => {
      try {
        const value = await execute(name, input);
        const content = [
          { type: "text", text: JSON.stringify(value.result ?? value) },
        ];
        const previews = value.previews ?? [];
        // Return the actual render to Codex in the same call as its measurements.
        // Full resolution originals remain in the consumer's run directory.
        for (const capture of (value.captures ?? []).slice(0, 2)) {
          const image = await readImage(capture.screenshot);
          previews.push({
            label: `${capture.id}: actual capture, preview resized; inspect the saved original for pixel comparisons`,
            bytes: await image
              .sharp(image.data, { raw: image.info })
              .resize({
                width: 1400,
                height: 1400,
                fit: "inside",
                withoutEnlargement: true,
              })
              .png()
              .toBuffer(),
          });
        }
        for (const image of previews) {
          content.push({ type: "text", text: image.label });
          content.push({
            type: "image",
            mimeType: "image/png",
            data: image.bytes.toString("base64"),
          });
        }
        return { content };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    },
  );
}
// This executable is tested from dist over stdio, not just via in-memory imports.
await server.connect(new StdioServerTransport());
