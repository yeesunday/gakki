import fs from "node:fs/promises";
import { operations, execute } from "./operations.mjs";
const [name, inputPath] = process.argv.slice(2);
if (!name || name === "--help") {
  console.log(
    "Usage: node dist/cli.mjs <operation> [input.json]\n" +
      Object.entries(operations)
        .map(([name, o]) => `${name}: ${o.description}`)
        .join("\n"),
  );
} else {
  try {
    const value = await execute(
      name,
      inputPath ? JSON.parse(await fs.readFile(inputPath, "utf8")) : {},
    );
    console.log(JSON.stringify(value.result ?? value, null, 2));
    if (
      value.checks === "failed" ||
      value.sourceChanged ||
      value.status === "stale"
    )
      process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
