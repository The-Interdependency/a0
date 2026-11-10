// DEFECT WITNESS: PASS reproduces the audited bug; this is not an acceptance gate.
// Original audited source: de66778dd1d9073f6a8b3d532e73514868f94e3c.
// See README.md for safe invocation, polarity, and conversion after repair.
import { sourcePath } from './audit-runtime.mjs';
// Read-only audit of actual source modules; only database/media/config imports are inert fixtures.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const root=sourcePath('apps', 'server', 'src');
const time='2026-11-10T00:00:00Z';
let conversation, messages, revisions, snapshots;
const reset=()=>{
  conversation={id:'c1',user_id:'owner1',project_id:null,context_policy:{mode:'all',selectedMessageIds:[]}};
  messages=[
    {id:'u1',role:'user',content:'Original question',round:0,created_at:time},
    {id:'a1',role:'assistant',participant_id:'p1',provider:'deepseek',model:'fixture',content:'Keep this answer',round:1,created_at:time,status:'complete'},
    {id:'a2',role:'assistant',participant_id:'p2',provider:'openai',model:'fixture',content:'Exclude this answer',round:1,created_at:time,status:'complete'},
  ];revisions=[];snapshots=[];
};
const query=async(sql,params)=>{
  if(sql.includes('SELECT * FROM conversations'))return {rows:[structuredClone(conversation)]};
  if(sql.includes('FROM messages m'))return {rows:structuredClone(messages)};
  if(sql.includes('FROM attachments a'))return {rows:[]};
  if(sql.includes('SELECT * FROM context_revisions'))return {rows:revisions.length?[structuredClone(revisions.at(-1))]:[]};
  if(sql.includes('INSERT INTO context_revisions')){
    const row={id:'revision-'+(revisions.length+1),conversation_id:params[0],user_id:params[1],revision:params[2],blocks:JSON.parse(params[3]),note:params[4],parent_revision_id:params[5]};
    revisions.push(row);return {rows:[structuredClone(row)]};
  }
  if(sql.includes('INSERT INTO context_snapshots')){snapshots.push(JSON.parse(params[3]));return {rows:[{id:'snapshot-'+snapshots.length}]};}
  throw Error('Unrecognized fixture query: '+sql);
};
const context=vm.createContext({console});
const stub=(name,exports)=>new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context,identifier:name});
const deps={
 './db.js':stub('fixture-db',{query}),
 './config.js':stub('fixture-config',{config:{harness:{version:'audit-fixture',systemPrompt:'Audit fixture harness'}}}),
 './media.js':stub('fixture-media',{readUploadBase64:async()=>{throw Error('Fixture forbids media access');}}),
};
const contexts=new vm.SourceTextModule(await readFile(root+'/contexts.js','utf8'),{context,identifier:root+'/contexts.js'});
const harness=new vm.SourceTextModule(await readFile(root+'/harness.js','utf8'),{context,identifier:root+'/harness.js'});
deps['./contexts.js']=contexts;
await harness.link(specifier=>{if(!deps[specifier])throw Error('Unrecognized import: '+specifier);return deps[specifier];});
await harness.evaluate();
const {freezeSnapshot}=harness.namespace;
const addQuestion=()=>messages.push({id:'u2',role:'user',content:'Latest user question must reach the selected model',round:0,created_at:time});
reset();
conversation.context_policy={mode:'selected',selectedMessageIds:['a1']};addQuestion();
let result=await freezeSnapshot('c1','owner1',1);
let observed=JSON.parse(JSON.stringify({messageIds:result.snapshot.messages.map(m=>m.id),blocks:result.snapshot.blocks.filter(b=>b.type==='history').map(b=>({id:b.id,included:b.included}))}));
console.log('Selected policy with no prior revision '+JSON.stringify(observed));
assert.deepEqual(observed.messageIds,['a1']);
reset();
await freezeSnapshot('c1','owner1',1);
conversation.context_policy={mode:'selected',selectedMessageIds:['a1']};addQuestion();
result=await freezeSnapshot('c1','owner1',2);
observed=JSON.parse(JSON.stringify({messageIds:result.snapshot.messages.map(m=>m.id),blocks:result.snapshot.blocks.filter(b=>b.type==='history').map(b=>({id:b.id,included:b.included}))}));
console.log('Selected policy after an existing all-responses revision '+JSON.stringify(observed));
assert.deepEqual(observed.messageIds,['u1','a1','a2']);
assert.equal(observed.blocks.find(b=>b.id==='msg:u2').included,false);
conversation.context_policy={mode:'all',selectedMessageIds:[]};
result=await freezeSnapshot('c1','owner1',3);
observed=JSON.parse(JSON.stringify({messageIds:result.snapshot.messages.map(m=>m.id)}));
console.log('Return to Include all after the selected-mode round '+JSON.stringify(observed));
assert.deepEqual(observed.messageIds,['u1','a1','a2']);
console.log('CONFIRMED: selected responses omit new user messages; saved revision also retains deselected prior answers. No network/provider/production calls.');
