// Usage: node --test tests/reliability/bridge.test.js (inert services, no provider calls).
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createReliabilityRouter} from '../../apps/server/src/reliability.js';
import {OpenBaoAdapter} from '../../apps/server/src/vault.js';

test('real bridge HTTP: isolated auth, freshness, redaction and concurrent deduplicated inbox', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'a0-bridge-'));
  const token = crypto.randomBytes(32).toString('hex');
  const tokenFile = path.join(dir,'token');
  await fs.writeFile(tokenFile,token,{mode:0o600});
  const buildFile = path.join(dir,'build.json');
  await fs.writeFile(buildFile,JSON.stringify({commit:'a'.repeat(40),dirty:false,builtAt:new Date().toISOString(),secret:'must-not-leak'}));
  let failVault=false;
  const vault={healthCheck:async()=>{if(failVault)throw new Error('private-error');return {initialized:true,sealed:false,version:'fixture',clusterId:'fixture'};},readSecret:async()=>({api_key:'provider-canary'})};
  const app=express();
  app.use('/api/reliability',createReliabilityRouter({vault,databaseCheck:async()=>{},tokenFile,siteOrigin:'https://console.example',directory:dir,buildFile}));
  app.use('/api',(_req,res)=>res.status(401).json({error:'session_required'}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(p,init={})=>fetch(base+p,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers}});
  try{
    assert.equal((await fetch(base+'/api/reliability/status')).status,401);
    assert.equal((await request('/api/reliability/status',{headers:{Authorization:'Bearer '+'b'.repeat(64)}})).status,401);
    assert.equal((await request('/api/reliability/status',{headers:{Origin:'https://attacker.example'}})).status,403);
    assert.equal((await request('/api/conversations')).status,401);
    assert.equal((await request('/api/reliability/anything-else')).status,404);
    const live=await (await request('/api/reliability/status')).json();
    assert.equal(live.schema,'a0.reliability/1');assert.equal(live.build.commit,'a'.repeat(40));
    assert.equal(live.services.vault.state,'ready');assert.equal(live.providers[0].credential,'present');
    assert.ok(Math.abs(Date.now()-Date.parse(live.observedAt))<3000);
    assert.ok(!JSON.stringify(live).includes('canary'));assert.ok(!JSON.stringify(live).includes('must-not-leak'));
    failVault=true;
    const unavailable=await (await request('/api/reliability/status')).json();
    assert.equal(unavailable.services.vault.state,'unavailable');assert.equal(unavailable.providers[0].credential,'unavailable');
    assert.ok(!JSON.stringify(unavailable).includes('private-error'));
    const init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:'Codex',text:'# Inert handoff\nDo not execute.'})};
    const receipts=await Promise.all(Array.from({length:4},async()=>{const r=await request('/api/reliability/handoffs',init);assert.ok([200,201].includes(r.status));return r.json();}));
    assert.equal(new Set(receipts.map(r=>r.id)).size,1);assert.equal(receipts.filter(r=>!r.duplicate).length,1);
    const list=await (await request('/api/reliability/handoffs')).json();assert.equal(list.items.length,1);assert.equal(list.items[0].state,'received');
    const full=await (await request('/api/reliability/handoffs/'+receipts[0].id)).json();assert.equal(full.text,'# Inert handoff\nDo not execute.');
    assert.equal((await request('/api/reliability/handoffs',{...init,body:JSON.stringify({target:'shell',text:'rm anything'})})).status,400);
    await fs.chmod(tokenFile,0o644);assert.equal((await request('/api/reliability/status')).status,503);
    await fs.chmod(tokenFile,0o600);await fs.writeFile(tokenFile,'c'.repeat(64));assert.equal((await request('/api/reliability/status')).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
});

test('vault requires exact cluster, authenticates token and blocks redirect forwarding',async()=>{
  const calls=[];
  const original=globalThis.fetch;
  let cluster='expected';
  globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json(url.endsWith('seal-status')?{initialized:true,sealed:false,cluster_id:cluster,version:'fixture'}:{data:{policies:['a0-app']}});};
  try{
    const vault=new OpenBaoAdapter({addr:'http://127.0.0.1:8200',token:'inert',clusterId:'expected',tokenFile:''});
    assert.equal((await vault.healthCheck()).clusterId,'expected');
    assert.ok(calls.some(c=>c.url.endsWith('/auth/token/lookup-self')));assert.ok(calls.every(c=>c.init.redirect==='error'));
    cluster='wrong';await assert.rejects(vault.healthCheck(),/identity mismatch/);
  }finally{globalThis.fetch=original;}
});

test('authenticated bridge requests are bounded and malformed inbox paths never read files',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'a0-rate-'));
 const token='d'.repeat(64), tokenFile=path.join(directory,'token');
 await fs.writeFile(tokenFile,token,{mode:0o600});
 const app=express();app.use('/api/reliability',createReliabilityRouter({tokenFile,directory,siteOrigin:'https://console.example',requestLimit:2}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base=`http://127.0.0.1:${server.address().port}/api/reliability`;
 try{
  for(let i=0;i<3;i++)assert.equal((await fetch(base+'/handoffs')).status,401);
  const headers={Authorization:`Bearer ${token}`};
  assert.equal((await fetch(base+'/handoffs/'+encodeURIComponent('../token'),{headers})).status,400);
  assert.equal((await fetch(base+'/handoffs',{headers})).status,200);
  const limited=await fetch(base+'/handoffs',{headers});assert.equal(limited.status,429);assert.ok(limited.headers.get('retry-after'));
 }finally{await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
});
