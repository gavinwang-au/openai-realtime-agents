const secrets = {
    OPENAI_API_KEY: new sst.Secret("OPENAI_API_KEY"),
    OPENAI_WEBHOOK_SECRET: new sst.Secret("OPENAI_WEBHOOK_SECRET"),
}

export { secrets }; 