const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const root=path.resolve(__dirname,'..');
const xml=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(command+' 실패: '+(code??signal))));});}
async function main(){
 const args=process.argv.slice(2);
 if(args.length && (args.length!==2 || args[0]!=='--client'))throw new Error('사용법: verify-game-api.cjs [--client Unity프로젝트경로]');
 const client=args.length?path.resolve(args[1]):path.resolve(root,JSON.parse(fs.readFileSync(path.join(root,'protocol.projects.local.json'),'utf8')).clientProject);
 const tools=path.join(client,'Tools/CsvValidation.Tests');
 const project=fs.readFileSync(path.join(tools,'CsvValidation.Tests.csproj'),'utf8');
 const sources=new Set(fs.globSync('*.cs',{cwd:tools}).map(name=>path.join(tools,name)));
 for(const match of project.matchAll(/<Compile Include="([^"]+)"/g))
  for(const name of fs.globSync(match[1],{cwd:tools}))sources.add(path.resolve(tools,name));
 const runtime=path.join(client,'Assets/Plugins/Protobuf/Google.Protobuf.dll');
 if(!fs.existsSync(runtime))throw new Error('Unity Google.Protobuf 런타임이 필요합니다.');
 const output=path.join(root,'.protocol-tools/http-checks');fs.mkdirSync(output,{recursive:true});
 const projectFile=path.join(output,'GameApiChecks.csproj');
 fs.writeFileSync(projectFile,'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>disable</Nullable><UseAppHost>false</UseAppHost><EnableDefaultCompileItems>false</EnableDefaultCompileItems><NuGetAudit>false</NuGetAudit></PropertyGroup><ItemGroup>'+[...sources].map(source=>`<Compile Include="${xml(source)}" />`).join('\n')+`<Reference Include="Google.Protobuf"><HintPath>${xml(runtime)}</HintPath></Reference></ItemGroup></Project>`);
 fs.writeFileSync(path.join(output,'NuGet.Config'),'<configuration><packageSources><clear /></packageSources></configuration>');
 await run('dotnet',['build',projectFile,'--verbosity','quiet']);
 const {loadGameData}=require('../dist/infrastructure/data/loadGameData');
 const {GameSession}=require('../dist/models/GameSession');
 const {ParticipantRegistry}=require('../dist/services/ParticipantRegistry');
 const {SessionService}=require('../dist/services/SessionService');
 const {SessionController}=require('../dist/controllers/SessionController');
 const {createSessionHttpServer}=require('../dist/infrastructure/http/createSessionHttpServer');
 const {MonotonicMillisecondClock}=require('../dist/common/MonotonicMillisecondClock');
 const data=await loadGameData(path.join(root,'data'));
 const service=new SessionService(new GameSession({id:'protobuf-http-check',roles:['A','B']}),new ParticipantRegistry(new MonotonicMillisecondClock(),60000),data);
 const server=createSessionHttpServer(new SessionController(service));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await run('dotnet',[path.join(output,'bin/Debug/net10.0/GameApiChecks.dll'),'--http',`http://127.0.0.1:${server.address().port}`,client]);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
