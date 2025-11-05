

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
    const { authOutputs } = await import("./infra/auth");
    const { webOutputs } = await import("./infra/web");
    return {
      ...authOutputs,
      ...webOutputs,
    };
  },
});
