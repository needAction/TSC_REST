const path = require("node:path");
const { DockerDeployConfig } = require("./docker-deploy/DockerDeployConfig.cjs");
const { DockerCli } = require("./docker-deploy/DockerCli.cjs");
const { DockerDeployment } = require("./docker-deploy/DockerDeployment.cjs");

async function main(args = process.argv.slice(2)) {
  if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("배포 도구는 Node.js 24 이상이 필요합니다.");
  if (args.length < 1 || args.length > 2 || (args[1] && args[1] !== "--plan"))
    throw new Error("사용법: node scripts/deploy-docker.cjs <local|cloud> [--plan]");
  const root = path.resolve(__dirname, "..");
  const config = DockerDeployConfig.load(args[0], root);
  const deployment = new DockerDeployment(config, new DockerCli(root));
  if (args[1] === "--plan") { deployment.describe(); console.log("미리보기입니다. Docker 접속이나 배포를 실행하지 않았습니다."); }
  else await deployment.execute();
}

if (require.main === module) main().catch(error => { console.error(`[배포 오류] ${error.message}`); process.exitCode = 1; });
module.exports = { main };
