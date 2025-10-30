/// <reference path="./.sst/platform/config.d.ts" />

import { WebStack } from "./infra/web";

const DEFAULT_REGION = process.env.AWS_REGION ?? "ap-southeast-2";
const DEFAULT_STAGE = process.env.SST_STAGE ?? "dev";
const APP_NAME = process.env.PROJECT_NAME ?? "openai-realtime-agents";

export default $config({
  app(input) {
    const stage = input.stage ?? DEFAULT_STAGE;
    return {
      name: APP_NAME,
      stage,
      removal: stage === "prod" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: DEFAULT_REGION,
        },
      },
    };
  },
  run() {
    return WebStack({
      stage: $app.stage,
    });
  },
});
