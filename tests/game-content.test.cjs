const {test}=require('node:test');
const {readReply}=require('./helpers/protobuf.cjs');
const {PuzzleCommandRequest}=require('../dist/generated/escape/v1/game_api');
const assert=require('node:assert/strict');
const path=require('node:path');
const {once}=require('node:events');
const {loadGameData}=require('../dist/infrastructure/data/loadGameData');
const {RoomProgression}=require('../dist/models/RoomProgression');
const {GameSession}=require('../dist/models/GameSession');
const {SessionService}=require('../dist/services/SessionService');
const {ParticipantRegistry}=require('../dist/services/ParticipantRegistry');
const {SessionController}=require('../dist/controllers/SessionController');
const {createSessionHttpServer}=require('../dist/infrastructure/http/createSessionHttpServer');
const {CsvParser}=require('../dist/common/csv/CsvParser');
const {createGameDataBundle}=require('../dist/data/GameDataBundle');
const {requiresBothPuzzles}=require('../dist/data/RoomExitRules');
const dataPromise=loadGameData(path.resolve(__dirname,'../data'));
test('exit policy and runtime reset reject unsupported rules and split starts',async()=>{
 const data=await dataPromise;
 assert.equal(requiresBothPuzzles('SolvedEach'),false);
 assert.equal(requiresBothPuzzles('BothSolved'),true);
 assert.throws(()=>requiresBothPuzzles('BothSolvd'),/지원하지 않는/);
 const split={...data,roomsA:data.roomsA.map((row,i)=>i===0?{...row,next:0}:row)};
 assert.throws(()=>new RoomProgression(split),/정확히 하나/);
});
test('bundle roundtrip preserves every cell and version',async()=>{
 const data=await dataPromise,bundle=createGameDataBundle(data.source);
 assert.equal(bundle.tables.length,23);assert.equal(bundle.version,createGameDataBundle(data.source).version);
 const parser=new CsvParser();let cells=0;
 for(const table of bundle.tables){const original=data.source.getDocument(table.name),parsed=parser.read(table.csv,table.name);
 assert.deepEqual(parsed.headers,original.headers);assert.equal(parsed.rows.length,original.rows.length);
 original.rows.forEach((row,i)=>original.headers.forEach(header=>{assert.equal(parsed.rows[i].get(header),row.get(header));cells++;}));}
 assert.equal(cells,2861);
});
test('progression checks role, active room, answers and retains prior rooms',async()=>{
 const data=await dataPromise,model=new RoomProgression(data);
 const answer=id=>data.puzzleSlots.filter(row=>row.puzzleId===id).sort((a,b)=>a.slot-b.slot).map(row=>row.answer.toLowerCase());
 assert.deepEqual(model.unlockedRoomIds,[1001,1002]);
 assert.equal(model.submit('A',5001,answer(5001)).accepted,false);
 assert.equal(model.submit('B',5002,answer(5002)).accepted,false);
 assert.equal(model.submit('B',5001,['wrong']).correct,false);
 for(const [id,role] of [[5001,'B'],[5002,'A'],[5003,'B'],[5004,'A'],[5005,'B'],[5006,'A']]) { assert.equal(model.submit(role,id,answer(id)).correct,true); const roomNo=data.puzzles.find(p=>p.id===id).solverRoom; const room=[...data.roomsA,...data.roomsB].find(r=>r.id===roomNo); model.checkDoor(role==='A'?'B':'A',room.roomNo); }
 assert.equal(model.unlockedRoomIds.length,14);
 model.submit('B',5001,answer(5001));assert.equal(model.unlockedRoomIds.length,14);
 model.reset();assert.deepEqual(model.unlockedRoomIds,[1001,1002]);
});
test('HTTP authoritative sync and two client unlock use participant auth',async()=>{
 const data=await dataPromise,session=new GameSession({id:'world-test',roles:['A','B']});
 let elapsedMs=0;
 const registry=new ParticipantRegistry({get elapsedMilliseconds(){return elapsedMs}},10000);
 const service=new SessionService(session,registry,data),server=createSessionHttpServer(new SessionController(service));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 const req=(route,token,body)=>fetch(base+route,{method:body===undefined?'GET':'POST',headers:token?{'x-participant-token':token,'content-type':'application/protobuf'}:{},body:body===undefined?undefined:PuzzleCommandRequest.encode({answers:body.answers??[]}).finish()});
 try{
  const a=await readReply(await req('/sessions/join',null,{})),b=await readReply(await req('/sessions/join',null,{}));
  assert.equal((await req('/sessions/world-test/data')).status,400);
  assert.equal((await req('/sessions/world-test/data','invalid')).status,403);
  const bundle=await readReply(await req('/sessions/world-test/data',a.participantToken));assert.equal(bundle.tables.length,23);
  const answers=data.puzzleSlots.filter(row=>row.puzzleId===5001).sort((a,b)=>a.slot-b.slot).map(row=>row.answer);
  const submit=token=>req('/sessions/world-test/puzzles/5001/submit',token,{answers}).then(readReply);
  assert.equal((await submit(b.participantToken)).accepted,false);
  await req('/sessions/world-test/ready',a.participantToken,{});await req('/sessions/world-test/ready',b.participantToken,{});
  assert.equal((await submit(a.participantToken)).accepted,false);
  assert.equal((await submit(b.participantToken)).correct,true);
  for(const token of [a.participantToken,b.participantToken])assert.deepEqual((await readReply(await req('/sessions/world-test',token))).snapshot.unlockedRoomIds,[1001,1002,1004]);
  assert.equal((await req('/sessions/world-test/puzzles/5001/submit',b.participantToken,{answers:['x'.repeat(257)]})).status,400);
  elapsedMs=10000;
  const expired=await req('/sessions/world-test/data',a.participantToken);
  assert.equal(expired.status,403);
  assert.equal((await readReply(expired)).code,'INVALID_PARTICIPANT');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
