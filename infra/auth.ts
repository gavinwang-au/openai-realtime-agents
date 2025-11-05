
import { getProjectName } from "./environments";

const projectName = getProjectName();

export const auth = new sst.aws.Auth(`${projectName}-auth`, {
  issuer: "packages/functions/src/auth.handler",
});

export const authOutputs = {
  AuthUrl: auth.url,
};
