import { cluster } from "./ecs";
import { secrets } from "./secret";
import { getStage, getProjectName } from "./environments";

const stage = getStage();
const projectName = getProjectName();

const healthChecks = {
  "3000/http": {
    path: "/api/health",
  },
} as const;

const loadBalancer =
  stage === "dev"
    ? {
        domain: {
          name: "www.dev.heneinfo.com",
        },
        rules: [
          { listen: "80/http" as const, redirect: "443/https" as const },
          { listen: "443/https" as const, forward: "3000/http" as const },
        ],
        health: healthChecks,
      }
    : {
        rules: [{ listen: "80/http" as const, forward: "3000/http" as const }],
        health: healthChecks,
      };

const webService = new sst.aws.Service(`${projectName}-ecs`, {
  cluster,
  cpu: "1 vCPU",
  memory: "2 GB",
  image: {
    context: ".",
    dockerfile: "packages/web/Dockerfile",
  },
  environment: {
    NODE_ENV: "production",
    LOG_LEVEL: "info",
    NEXT_PUBLIC_STAGE: stage,
    OPENAI_API_KEY: secrets.OPENAI_API_KEY.value,
  },
  dev: {
    command: "pnpm --filter @openai-realtime-agents/web dev",
    autostart: true,
    directory: ".",
    url: "http://localhost:3000",
  },
  loadBalancer,
});

export { webService };
export const webOutputs = {
  WebUrl: webService.url,
};
