/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "openai-realtime-agents",
      removal: input.stage === "prod" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    await import("./infra/secret");
    await import("./infra/web");
    return {
    
    };
  },
});
