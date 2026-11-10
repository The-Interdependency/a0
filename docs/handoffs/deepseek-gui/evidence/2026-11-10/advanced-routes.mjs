// DEFECT WITNESS: PASS reproduces the audited bug; this is not an acceptance gate.
// Original audited source: de66778dd1d9073f6a8b3d532e73514868f94e3c.
// See README.md for safe invocation, polarity, and conversion after repair.
import { sourceRoot, sourceCommit, auditedCommit, sourceDirty } from './audit-runtime.mjs';
// Read-only diagnostic witnesses: exact route callbacks, inert DB/sidecar fixtures.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=sourceRoot;
const source=await fs.readFile(root+'/apps/server/src/index.js','utf8');
const contextSource=(await fs.readFile(root+'/apps/server/src/contexts.js','utf8')).replace(/^import .*;\n/gm,'').replaceAll('export ','');
function route(path,context){
 const marker=`app.post('${path}', asyncRoute(`;
 const start=source.indexOf(marker);
 assert.ok(start>=0);
 const from=start+marker.length;
 const to=source.indexOf('\n  }));',from)+4;
 assert.ok(to>from);
 return vm.runInNewContext('('+source.slice(from,to)+')',context);
}
function response(){return {code:200,body:null,status(v){this.code=v;return this;},json(v){this.body=v;return this;}};}
function contexts(query){
 const env={query,config:{harness:{version:'fixture',systemPrompt:'inert harness'}},readUploadBase64:async()=>{throw Error('No uploads expected');}};
 vm.runInNewContext(contextSource+'\nglobalThis.exports={buildBlocks,estimateCachePrefix,assembleBlocks};',env);
 return env.exports;
}
const results=[];
{
 const query=async(sql,args)=>{
   if(sql.startsWith('SELECT id FROM conversations'))return {rows:[{id:'c-agent'}]};
   if(sql.startsWith('SELECT * FROM conversations'))return {rows:[{id:'c-agent',project_id:null}]};
   if(sql.includes('FROM messages m'))return {rows:[]};
   throw Error('Unexpected database operation: '+sql);
 };
 const ctx=contexts(query);
 const handler=route('/api/conversations/:id/context-revisions',{query,...ctx,createRevision:async()=>{throw Error('Save should have been rejected before a write');}});
 const res=response();
 await handler({params:{id:'c-agent'},user:{id:'owner'},body:{blocks:[{id:'harness',included:true},{id:'agent:a1',content:'edited effective instructions',included:true},{id:'tools',included:true}],expectedRevision:1}},res);
 assert.equal(res.code,400);
 assert.equal(res.body.message,'Unknown or unauthorized block: agent:a1');
 results.push({witness:'agent-context-rejected',status:res.code,response:res.body});
}
{
 const query=async(sql,args)=>{
   if(sql.startsWith('SELECT id FROM conversations'))return {rows:[{id:'c2'}]};
   if(sql.startsWith('SELECT * FROM conversations'))return {rows:[{id:'c2',project_id:'project-b'}]};
   if(sql.startsWith('SELECT name, instructions'))return {rows:[{name:'Project B',instructions:'Original B instructions'}]};
   if(sql.includes('FROM messages m'))return {rows:[]};
   throw Error('Unexpected database operation: '+sql);
 };
 const ctx=contexts(query);let persisted;
 const handler=route('/api/conversations/:id/context-revisions',{query,...ctx,createRevision:async(conversationId,userId,body)=>{persisted={conversationId,userId,...body};return {revision:1,...body};}});
 const res=response();
 await handler({params:{id:'c2'},user:{id:'owner'},body:{blocks:[{id:'harness',included:true},{id:'project',content:'Private context from conversation A',included:true},{id:'tools',included:true}],expectedRevision:null}},res);
 assert.equal(res.code,201);
 assert.equal(persisted.blocks.find(b=>b.id==='project').content,'Private context from conversation A');
 results.push({witness:'cross-conversation-project-save-accepted',status:res.code,conversationId:persisted.conversationId,project:persisted.blocks.find(b=>b.id==='project')});
}
{
 const session={id:'s1',user_id:'owner',game_session_id:'g1',turn:0,turns:8,status:'ready'};
 let observeCalls=0;
 const client={query:async(sql,args)=>{
   if(sql.startsWith('SELECT * FROM ahbg_sessions'))return {rows:[{...session}]};
   if(sql.includes("SET status = 'in_progress'")){session.status='in_progress';return {rows:[]};}
   throw Error('Unexpected transactional operation: '+sql);
 }};
 const handler=route('/api/ahbg/sessions/:id/turn',{
  withTransaction:async(fn)=>fn(client),
  query:async(sql,args)=>{if(sql.includes('SET status = $2')){session.status=args[1];return {rows:[]};}throw Error('Unexpected database operation: '+sql);},
  ahbg:{observe:async()=>{observeCalls++;const e=Error('Synthetic transient sidecar outage');e.status=502;throw e;}}
 });
 const req={params:{id:'s1'},user:{id:'owner'}};
 let firstError;
 try{await handler(req,response());}catch(e){firstError={message:e.message,status:e.status};}
 assert.equal(session.status,'in_progress');
 const second=response();await handler(req,second);
 assert.equal(second.code,409);
 assert.equal(observeCalls,1);
 results.push({witness:'ahbg-error-sticks-lock',firstError,persistedStatus:session.status,retryStatus:second.code,retryResponse:second.body,observeCalls});
}
console.log(JSON.stringify({source:sourceCommit,auditedSource:auditedCommit,sourceDirty,scope:'Exact route callback execution with inert DB/sidecar fixtures; no production calls or writes',results},null,2));
