import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all([
  esbuild.build({
    entryPoints: [path.join(root, "src", "content.ts")],
    bundle: true,
    outfile: path.join(dist, "content.js"),
    format: "iife",
    target: "chrome120",
    sourcemap: true
  }),
  esbuild.build({
    entryPoints: [path.join(root, "src", "popup.ts")],
    bundle: true,
    outfile: path.join(dist, "popup.js"),
    format: "iife",
    target: "chrome120",
    sourcemap: true
  })
]);

await Promise.all([
  copyFile(path.join(root, "public", "manifest.json"), path.join(dist, "manifest.json")),
  copyFile(path.join(root, "public", "popup.html"), path.join(dist, "popup.html")),
  copyFile(path.join(root, "public", "popup.css"), path.join(dist, "popup.css"))
]);
