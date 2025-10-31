const PROJECT_NAME = "realtime-agent";

const getStage = () => $app.stage || process.env.STAGE || "dev";

// Updated: include stage suffix
const getProjectName = () => {
  const stage = getStage();
  return `${PROJECT_NAME}-${stage}`;
};

export { getProjectName, getStage };
