// Builds the static demo + SDK into dist/ for production deploys.
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, "index.html"), join(dist, "index.html"));
await cp(join(root, "src"), join(dist, "src"), { recursive: true });
await cp(join(root, "lib"), join(dist, "lib"), { recursive: true });
await cp(join(root, "assets"), join(dist, "assets"), { recursive: true });
for (const f of ["README.md", "privacy.html", "LICENSE"]) {
  await cp(join(root, f), join(dist, f));
}
console.log("Built → dist/");
