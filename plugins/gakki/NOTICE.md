# Dependency notices

GAKKI is MIT licensed. Dependencies and their bundled components retain their own licenses.

The build bundles the MCP TypeScript SDK, Zod and their required dependencies. Full license notices are generated from the exact bundled dependency graph into `dist/THIRD_PARTY_LICENSES.txt`; a missing license fails the build.

Sharp and Playwright Core remain runtime dependencies installed from the pinned lockfile, with their upstream licenses in `node_modules`. Their native and browser dependencies retain their own notices. The distribution does not bundle a browser or model weights.
