import { getProjectName } from "./environments";

const projectName = getProjectName();

const vpc = new sst.aws.Vpc(`${projectName}-vpc`, {

});

export { vpc };