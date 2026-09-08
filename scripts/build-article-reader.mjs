import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const temporaryDir = resolve(rootDir, ".article-reader-build");

await rm(temporaryDir, { recursive: true, force: true });
await mkdir(temporaryDir, { recursive: true });
await build({
  configFile: false,
  root: rootDir,
  publicDir: false,
  build: {
    outDir: temporaryDir,
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: resolve(rootDir, "src/article-reader/index.ts"),
      output: {
        format: "iife",
        name: "ReadnoteStudioArticleReader",
        entryFileNames: "article-reader.js",
        inlineDynamicImports: true
      }
    }
  }
});

await copyFile(
  resolve(temporaryDir, "article-reader.js"),
  resolve(rootDir, "article-reader.js")
);
await rm(temporaryDir, { recursive: true, force: true });
