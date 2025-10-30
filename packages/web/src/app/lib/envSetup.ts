import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

const stage =
  process.env.SST_STAGE ||
  process.env.NEXT_PUBLIC_STAGE ||
  process.env.PULUMI_STACK?.split("-").pop() ||
  process.env.NODE_ENV ||
  "dev";

const candidateFiles = [
  `.env.${stage}`,
  `.env.${stage}.local`,
  `.env.local`,
  `env/.${stage}.env`,
  `env/${stage}.env`,
];

for (const file of candidateFiles) {
  const fullPath = resolve(process.cwd(), file);
  if (existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
    break;
  }
}
