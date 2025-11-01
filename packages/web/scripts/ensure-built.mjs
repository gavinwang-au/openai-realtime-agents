import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const requiredFile = join(process.cwd(), ".next", "required-server-files.json");

if (existsSync(requiredFile)) {
  process.exit(0);
}

console.info("Next.js build output missing; running `pnpm run build`...");
const result = spawnSync("pnpm", ["run", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
