import * as sst from "sst";

export interface WebStackProps {
  stage: string;
}

export function WebStack(props: WebStackProps) {
  const openaiApiKey = new sst.Secret("OPENAI_API_KEY");

  const site = new sst.aws.Nextjs("WebSite", {
    path: "../packages/web",
    runtime: "nodejs20.x",
    environment: {
      LOG_LEVEL: "info",
      NEXT_PUBLIC_STAGE: props.stage,
      OPENAI_API_KEY: openaiApiKey.value,
    },
    edge: false,
    cdn: {
      cachePolicy: {
        defaultTtl: "86400",
        minTtl: "60",
        maxTtl: "31536000",
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      },
      logging: {
        includeCookies: false,
      },
    },
    streaming: true,
  });

  return {
    WebUrl: site.url,
    CloudFrontDistributionId: site.distributionId,
  };
}
