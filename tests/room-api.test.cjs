const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const path=require('node:path');
const {loadGameData}=require('../dist/infrastructure/data/loadGameData');
const {RoomProgression}=require('../dist/models/RoomProgression');
const {PuzzleAnswerRules}=require('../dist/models/PuzzleAnswerRules');
const {GameSession}=require('../dist/models/GameSession');
const {ParticipantRegistry}=require('../dist/services/ParticipantRegistry');
const {SessionService}=require('../dist/services/SessionService');
const {SessionController}=require('../dist/controllers/SessionController');
const {createSessionHttpServer}=require('../dist/infrastructure/http/createSessionHttpServer');
const {GameApiResponse,RoomCommandRequest}=require('../dist/generated/escape/v1/game_api');
const {SessionErrorCode}=require('../dist/generated/escape/v1/common');
const dataPromise=loadGameData(path.resolve(__dirname,'../data'));
const answer=(data,id)=>data.puzzleSlots.filter(s=>s.puzzleId===id).sort((a,b)=>a.slot-b.slot).map(s=>s.answer);

async function fixture(t){
 const data=await dataPromise,clock={elapsedMilliseconds:0};
 const service=new SessionService(new GameSession({id:'room-test',roles:['A','B']}),new ParticipantRegistry(clock,10000),data);
 const server=createSessionHttpServer(new SessionController(service));server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function req(route,token,body,headers={}){
  const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(token?{'x-participant-token':token}:{}),...(body!==undefined?{'content-type':'application/protobuf'}:{}),...headers},body,
   signal:AbortSignal.timeout(5000)});
  const bytes=new Uint8Array(await response.arrayBuffer());
  return{status:response.status,headers:response.headers,body:route==='/openapi.json'?JSON.parse(Buffer.from(bytes).toString()):GameApiResponse.decode(bytes).outcome};
 }
 const a=(await req('/sessions/join',null,new Uint8Array())).body.joined;
 const b=(await req('/sessions/join',null,new Uint8Array())).body.joined;
 const room=(token,roomNo,answers)=>req('/sessions/room-test/rooms/'+(answers===undefined?'door':'answer'),token,
  RoomCommandRequest.encode({roomNo,answers:answers??[]}).finish());
 const ready=async()=>{await req('/sessions/room-test/ready',a.participantToken,new Uint8Array());await req('/sessions/room-test/ready',b.participantToken,new Uint8Array());};
 return{data,clock,req,a,b,room,ready};
}
test('room answers preserve false, use authenticated role, and grant only the answering side',async t=>{
 const {data,req,a,b,room,ready}=await fixture(t);
 assert.equal((await room(b.participantToken,1,answer(data,5001))).body.failure.code,SessionErrorCode.GAME_NOT_PLAYING);
 await ready();
 let denied=await room(a.participantToken,1,answer(data,5001));
 assert.equal(denied.status,409);assert.equal(denied.body.failure.code,SessionErrorCode.SUBMISSION_NOT_ALLOWED);
 assert.equal((await room(a.participantToken,99)).body.failure.code,SessionErrorCode.ROOM_NOT_FOUND);
 let locked=await room(a.participantToken,1);assert.equal(locked.body.$case,'room');assert.equal(locked.body.room.value,false);
 let wrong=await room(b.participantToken,1,['wrong']);assert.equal(wrong.status,200);assert.equal(wrong.body.room.value,false);assert.equal(wrong.body.room.doorAllowed,false);
 let solved=await room(b.participantToken,1,answer(data,5001));assert.equal(solved.body.room.value,true);assert.equal(solved.body.room.doorAllowed,true);
 assert.deepEqual(solved.body.room.snapshot.unlockedRoomIds,[1001,1002,1004]);
 assert.equal((await req('/sessions/room-test',a.participantToken)).body.snapshot.unlockedRoomIds.includes(1003),false);
 let granted=await room(a.participantToken,1);assert.equal(granted.body.room.value,true);assert.equal(granted.body.room.doorAllowed,true);
 assert.deepEqual(granted.body.room.snapshot.unlockedRoomIds,[1001,1002,1003,1004]);
 assert.deepEqual((await room(a.participantToken,1)).body.room.snapshot.unlockedRoomIds,granted.body.room.snapshot.unlockedRoomIds);
 assert.equal((await room(a.participantToken,2)).body.room.value,false);
 assert.equal(granted.headers.get('content-type'),'application/protobuf');
 assert.equal(granted.headers.get('cache-control'),'no-store');
});
test('BothSolved grants no door after only one final answer and preserves repeat permissions',async()=>{
 const data=await dataPromise,model=new RoomProgression(data);
 for(let roomNo=1;roomNo<=6;roomNo++){
  const puzzle=data.puzzles.find(p=>p.solverRoom===data.roomsA.find(r=>r.roomNo===roomNo).id || p.solverRoom===data.roomsB.find(r=>r.roomNo===roomNo).id);
  const role=data.roomsA.some(r=>r.id===puzzle.solverRoom)?'A':'B';
  assert.equal(model.submit(role,puzzle.id,answer(data,puzzle.id)).correct,true);
  assert.equal(model.checkDoor(role==='A'?'B':'A',roomNo),true);
 }
 assert.equal(model.submit('A',5007,answer(data,5007)).correct,true);
 assert.equal(model.isDoorPermitted('A',7),false);assert.equal(model.checkDoor('A',7),false);
 assert.equal(model.submit('B',5008,answer(data,5008)).correct,true);
 assert.equal(model.isDoorPermitted('B',7),true);assert.equal(model.checkDoor('A',7),true);
 assert.equal(model.unlockedRoomIds.length,14);
 model.reset();assert.equal(model.isDoorPermitted('A',7),false);assert.deepEqual(model.unlockedRoomIds,[1001,1002]);
});
test('binary HTTP rejects JSON, malformed and oversized input without treating it as wrong answer',async t=>{
 const {req,a,ready,room,clock}=await fixture(t);await ready();
 const route='/sessions/room-test/rooms/answer';
 const cases=[
  [Buffer.from('{"roomNo":1}'),{'content-type':'application/json'},415,SessionErrorCode.UNSUPPORTED_MEDIA_TYPE],
  [Uint8Array.from([18,5,1]),{},400,SessionErrorCode.INVALID_REQUEST],
  [new Uint8Array(),{},400,SessionErrorCode.INVALID_REQUEST],
  [new Uint8Array(8193),{},413,SessionErrorCode.PAYLOAD_TOO_LARGE],
  [RoomCommandRequest.encode({roomNo:-1,answers:[]}).finish(),{},400,SessionErrorCode.INVALID_REQUEST],
  [RoomCommandRequest.encode({roomNo:1,answers:['x'.repeat(257)]}).finish(),{},400,SessionErrorCode.INVALID_REQUEST]
 ];
 for(const [bytes,headers,status,code]of cases){const res=await req(route,a.participantToken,bytes,headers);assert.equal(res.status,status);assert.equal(res.body.$case,'failure');assert.equal(res.body.failure.code,code);}
 const missing=await room(null,1);assert.equal(missing.status,400);assert.equal(missing.body.failure.code,SessionErrorCode.PARTICIPANT_TOKEN_REQUIRED);
 assert.equal((await room('forged',1)).body.failure.code,SessionErrorCode.INVALID_PARTICIPANT);
 const invalidDoor=await req('/sessions/room-test/rooms/door',a.participantToken,RoomCommandRequest.encode({roomNo:1,answers:['not allowed']}).finish());
 assert.equal(invalidDoor.body.failure.code,SessionErrorCode.INVALID_REQUEST);
 clock.elapsedMilliseconds=10000;assert.equal((await room(a.participantToken,1)).body.failure.code,SessionErrorCode.INVALID_PARTICIPANT);
});
test('false decision is an explicit Protobuf outcome and roundtrips with snapshot',()=>{
 const message={outcome:{$case:'room',room:{roomNo:1,value:false,doorAllowed:false,snapshot:{sessionId:'x',phase:3,players:[],unlockedRoomIds:[1001]}}}};
 assert.deepEqual(GameApiResponse.decode(GameApiResponse.encode(message).finish()),message);
 assert.equal(GameApiResponse.decode(new Uint8Array()).outcome,undefined);
});
test('OpenAPI endpoint and generated operation bindings describe protobuf instead of JSON game DTOs',async t=>{
 const {req}=await fixture(t),spec=(await req('/openapi.json')).body;
 const {gameApiOperations}=require('../dist/generated/http/game-api');
 assert.equal(gameApiOperations.length,9);
 for(const operation of gameApiOperations){const declared=spec.paths[operation.path][operation.method.toLowerCase()];assert.equal(declared.operationId,operation.name);assert.ok(declared.responses[operation.successStatus].content['application/protobuf']);}
 assert.equal((await req('/unknown')).body.failure.code,SessionErrorCode.ROUTE_NOT_FOUND);
});
test('puzzle policy registry reuses shared slot rules and allows an explicitly injected alternative',async()=>{
 const data=await dataPromise,puzzle=data.puzzles[0],slots=data.puzzleSlots.filter(s=>s.puzzleId===puzzle.id);
 assert.equal(new PuzzleAnswerRules().evaluate(puzzle,slots,answer(data,puzzle.id)),true);
 const rules=new PuzzleAnswerRules(new Map([[puzzle.type,{matches:()=>false}]]));assert.equal(rules.evaluate(puzzle,slots,answer(data,puzzle.id)),false);
 assert.throws(()=>new PuzzleAnswerRules().evaluate({...puzzle,type:'Unknown'},slots,[]),/지원하지 않는/);
});
