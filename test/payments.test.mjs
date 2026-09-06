import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Contract, id as hashId } from 'ethers';
import { application } from '../src/server.mjs';
import { Store } from '../src/store.mjs';
import { Chain } from '../src/chain.mjs';
import { KeeperHub, keeperRequest } from '../src/keeperhub.mjs';
let app, process, directory, sequence=0;
const invoice = (overrides={}) => app.store.create({reference:`TEST-${++sequence}`, title:'Contributor work', contributor:'Local test contributor', recipient:app.chain.config.recipients[0], amount:'8.75', ...overrides},app.chain.config);
before(async () => {
  directory=mkdtempSync(join(tmpdir(),'payroom-test-'));
  process=spawn('anvil',['--host','127.0.0.1','--port','18549','--chain-id','31337','--silent'],{stdio:'ignore'});
  for(let n=0;n<50;n++){ try{const r=await fetch('http://127.0.0.1:18549',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'});if(r.ok)break;}catch{} await new Promise(r=>setTimeout(r,100)); }
  app=await application({directory,rpc:'http://127.0.0.1:18549',port:4335});
  await new Promise(r=>app.server.listen(4335,'127.0.0.1',r));
});
after(async () => { if(app)await app.close(); if(process){process.kill('SIGINT');await new Promise(r=>process.once('exit',r));} if(directory)rmSync(directory,{recursive:true,force:true}); });
test('uses real Safe 1.4.1 with the invoice module enabled',async()=>{
  assert.equal(app.chain.config.safeVersion,'1.4.1');
  const safe=new Contract(app.chain.config.safe,['function isModuleEnabled(address) view returns(bool)'],app.provider);
  assert.equal(await safe.isModuleEnabled(app.chain.config.module),true);
});
test('rejects invalid amount, duplicate reference and invalid recipient',()=>{
  for(const amount of ['0','-1','1.0000001','1e4','Infinity'])assert.throws(()=>invoice({amount}));
  assert.throws(()=>invoice({recipient:'0x123'}));
  const i=invoice();assert.throws(()=>invoice({reference:i.reference.toLowerCase()}));
});
test('three concurrent runs pay one exact amount from the Safe',async()=>{
  const i=invoice({amount:'25'});
  const token=new Contract(i.token,['function balanceOf(address) view returns(uint256)'],app.provider);
  const before=await token.balanceOf(i.recipient);
  assert.equal((await app.chain.action(i.id,'approve')).state,'confirmed');
  const results=await Promise.all([1,2,3].map(()=>app.chain.action(i.id,'execute')));
  assert.equal(await token.balanceOf(i.recipient)-before,25000000n);
  assert.equal(results.filter(x=>x.alreadyPaid).length,2);
  assert.equal(app.store.operations().filter(x=>x.invoice===i.id&&x.kind==='pay').length,1);
  assert.equal((await app.chain.invoice(i.id)).status,'paid');
});
test('an approved invoice cannot be changed or reused',async()=>{
  const i=invoice();await app.chain.action(i.id,'approve');
  const op=await app.chain.serial(()=>app.chain.transact('tamper-test',i.id,'approve',[i.id,app.chain.config.recipients[1],i.token,'1',0]));
  assert.equal(op.state,'failed');assert.ok(op.receipt.status===0 || op.receipt.innerFailed);
  assert.equal((await app.chain.module.invoices(i.id)).recipient,i.recipient);
});
test('pause blocks transfer and resume allows the approved invoice',async()=>{
  const i=invoice();await app.chain.action(i.id,'approve');
  await app.chain.policy({paused:true});
  assert.equal((await app.chain.action(i.id,'execute')).state,'failed');
  assert.equal((await app.chain.invoice(i.id)).status,'approved');
  await app.chain.policy({paused:false});
  assert.equal((await app.chain.action(i.id,'execute')).state,'confirmed');
});
test('daily cap and recipient allowlist reject excess and unknown destinations',async()=>{
  const over=invoice({amount:'101'});
  assert.equal((await app.chain.action(over.id,'approve')).state,'failed');
  const bad=invoice({recipient:(await app.provider.getSigner(5)).address});
  assert.equal((await app.chain.action(bad.id,'approve')).state,'failed');
});
test('future invoices wait and cancelled invoices cannot pay',async()=>{
  const future=invoice({due:new Date(Date.now()+86400000).toISOString()});await app.chain.action(future.id,'approve');
  assert.equal((await app.chain.action(future.id,'execute')).state,'failed');
  await app.chain.action(future.id,'cancel');
  await assert.rejects(()=>app.chain.action(future.id,'execute'));
  const draft=invoice();await app.chain.action(draft.id,'cancel');await assert.rejects(()=>app.chain.action(draft.id,'approve'));
});
test('lost broadcast response recovers by exact sender nonce and calldata, without resending',async()=>{
  const i=invoice();await app.chain.action(i.id,'approve');
  const op=await app.chain.action(i.id,'execute');assert.equal(op.state,'confirmed');
  const nonce=await (await app.provider.getSigner(1)).getNonce();
  app.store.update(op.id,{state:'pending',hash:null,receipt:null});
  await assert.rejects(()=>app.chain.policy({paused:true}),/receipt check/);
  const recovered=await app.chain.reconcile();
  assert.equal(recovered.hash,op.hash);assert.equal(recovered.state,'confirmed');
  assert.equal(await (await app.provider.getSigner(1)).getNonce(),nonce);
});
test('saved invoices and pending receipt survive opening a new database connection',async()=>{
  const i=invoice();await app.chain.action(i.id,'approve');const op=await app.chain.action(i.id,'execute');
  app.store.update(op.id,{state:'pending',hash:null,receipt:null});
  const restored=new Store(join(directory,'payroom.sqlite'));
  const chain=new Chain(app.provider,app.chain.config,restored);
  assert.equal(restored.pending().id,op.id);
  assert.equal((await chain.reconcile()).hash,op.hash);
  assert.equal((await chain.invoice(i.id)).status,'paid');restored.close();
});
test('HTTP writes reject wrong origin and missing session token',async()=>{
  const url='http://127.0.0.1:4335';
  assert.equal((await fetch(url+'/api/policy',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"paused":true}'})).status,403);
  assert.equal((await fetch(url+'/api/state',{headers:{Origin:'https://unrelated.example'}})).status,403);
  const state=await(await fetch(url+'/api/state')).json();
  const good=await fetch(url+'/api/policy',{method:'POST',headers:{'Content-Type':'application/json','x-payroom-session':state.session},body:'{"paused":false}'});
  assert.equal(good.status,200);assert.equal((await good.json()).state,'confirmed');
});
test('KeeperHub request is canonical, Sepolia only and cannot rotate on a retry',async()=>{
  const config={...app.chain.config,chainId:11155111};
  const request=keeperRequest(config,hashId('keeper-test'));
  assert.deepEqual(request,keeperRequest(config,hashId('keeper-test')));
  assert.equal(typeof request.body.abi,'string');assert.deepEqual(JSON.parse(request.body.functionArgs),[hashId('keeper-test')]);
  assert.throws(()=>keeperRequest(app.chain.config,hashId('keeper-test')));
  let calls=0;
  const adapter=new KeeperHub({apiKey:'fixture-only',fetchImpl:async()=>{calls++;return new Response('{"status":"unconfirmed","executionId":"test_1"}',{status:202});}});
  const intent={request,created:Date.now(),simulation:{success:true,wouldRevert:false}};
  await assert.rejects(()=>adapter.broadcast(request,intent),/free account/);assert.equal(calls,0);
  adapter.freeAccessVerified=true;
  await assert.rejects(()=>adapter.broadcast(request,{...intent,created:Date.now()-24*3600000}),/replay window/);
  await assert.rejects(()=>adapter.broadcast({...request,idempotencyKey:'changed'},intent),/Persist/);
  const result=await adapter.broadcast(request,intent);assert.equal(result.value.status,'unconfirmed');assert.equal(calls,1);
});
