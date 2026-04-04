import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";
import { rm } from "fs/promises";

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();
  console.log("client build complete — output in dist/public/");

  console.log("building server...");
  await esbuild({
    entryPoints: ["server/index.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: "dist/index.cjs",
    external: [
      "pg",
      "pg-native",
      "express",
      "http-proxy-middleware",
      "better-auth",
      "drizzle-orm",
      "@neondatabase/serverless",
      "ws",
      "bufferutil",
      "utf-8-validate",
    ],
    packages: "external",
    banner: {
      js: '"use strict";',
    },
  });
  console.log("server build complete — output in dist/index.cjs");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
