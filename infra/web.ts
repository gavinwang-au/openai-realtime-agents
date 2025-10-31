import { secrets } from "./secret";
import { getStage } from "./environments";

const stage = getStage();

const site = new sst.aws.Nextjs("WebSite", {
  path: "packages/web",
  ...(stage === "dev"
    ? {
        domain: {
          name: "www.heneinfo.com",
        },
      }
    : {}),
  environment: {
    LOG_LEVEL: "info",
    NEXT_PUBLIC_STAGE: stage,
    NEXT_PUBLIC_ACCESS_API_KEY: secrets.OPENAI_API_KEY.value,
  },
});

export { site };
