import { vpc } from "./vpc";
import { getProjectName } from "./environments";

const projectName = getProjectName();

const cluster = new sst.aws.Cluster(`${projectName}-ecs-cluster`, { vpc });

export { cluster };
