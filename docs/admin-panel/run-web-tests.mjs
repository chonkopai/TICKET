// Bundle the existing web Node tests for this pnpm/ESM workspace; no mocks added.
import { build } from "../../node_modules/.pnpm/node_modules/esbuild/lib/main.js";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
const files = execFileSync("rg", ["--files", "apps/web/src"], {
  encoding: "utf8",
}).trim().split("\n").filter(path => /\.spec\.(ts|tsx|mjs)$/.test(path));

await build({
  entryPoints: files,
  outdir: "apps/web/.next-admin-unit",
  outbase: "apps/web/src",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  jsx: "automatic",
  outExtension: { ".js": ".mjs" },
  loader: { ".css": "empty" },
  logLevel: "error",
  plugins: [{
    name: "next-node-extensions",
    setup(build) {
      build.onResolve({ filter: /^next\/(link|server|navigation|headers|image)$/ },
        args => ({ path: args.path + ".js", external: true }));
    },
  }],
});
console.log(`Bundled ${files.length} web test files into apps/web/.next-admin-unit`);
