import {test} from 'node:test';
import assert from 'node:assert/strict';
import {id as hashId} from 'ethers';
import {KeeperRunner,verifySimulation} from '../src/keeper-runner.mjs';
const config={chainId:11155111,module:'0x0000000000000000000000000000000000000001',keeper:'0x0000000000000000000000000000000000000002'};
const id=hashId('runner fixture');
function fixture(overrides={}){
  const journal={},saved=[];let sends=0,polls=0,proof=null;
  const api={simulate:async()=>({ok:true,value:{success:true,wouldRevert:false,from:config.keeper,to:config.module,value:'0'}}),broadcast:async()=>{assert.equal(saved.at(-1)[id].state,'pending');sends++;return {ok:true,status:202,pollAfter:'5',value:{executionId:'fixture_1',status:'completed'}};},status:async()=>{polls++;return {ok:true,pollAfter:'0',value:{status:'completed'}};}};
  const runner=new KeeperRunner({api,config,journal,save:async()=>saved.push(structuredClone(journal)),readInvoice:async()=>({status:'approved',due:true,paused:false,overCap:false}),receipt:async()=>proof,...overrides});
  return {runner,api,journal,saved,get sends(){return sends;},get polls(){return polls;},set proof(value){proof=value;}};
}
test('HTTP completed without a chain receipt remains pending and is not broadcast twice',async()=>{
  const f=fixture();assert.equal((await f.runner.one(id)).state,'pending');assert.equal((await f.runner.one(id)).state,'pending');assert.equal(f.sends,1);assert.equal(f.polls,0);
});
test('lost API response persists one intent and never rotates or retries it automatically',async()=>{
  const f=fixture();let sends=0;f.api.broadcast=async()=>{sends++;throw Error('connection lost');};
  const first=await f.runner.one(id),key=first.request.idempotencyKey;
  assert.equal(first.state,'pending');await f.runner.one(id);assert.equal(sends,1);assert.equal(f.journal[id].request.idempotencyKey,key);
});
test('simulation sender, target and native value are bound before broadcast',async()=>{
  const value={success:true,wouldRevert:false,from:config.keeper,to:config.module,value:'0'};
  for(const update of [{from:config.module},{to:config.keeper},{value:'1'},{wouldRevert:true},{success:false}])assert.throws(()=>verifySimulation({...value,...update},config));
  const f=fixture();f.api.simulate=async()=>({ok:true,value:{...value,from:config.module}});await assert.rejects(()=>f.runner.one(id));assert.equal(f.sends,0);assert.deepEqual(f.journal,{});
});
test('a persistence failure prevents broadcast',async()=>{
  const f=fixture({save:async()=>{throw Error('disk full');}});await assert.rejects(()=>f.runner.one(id),/disk full/);assert.equal(f.sends,0);
});
test('pause or due-time restrictions prevent both simulation and broadcast',async()=>{
  for(const update of [{paused:true},{due:false},{overCap:true}]){
    const f=fixture({readInvoice:async()=>({status:'approved',due:true,paused:false,overCap:false,...update})});let simulations=0;f.api.simulate=async()=>{simulations++;};
    assert.equal((await f.runner.one(id)).state,'waiting');assert.equal(simulations,0);assert.equal(f.sends,0);
  }
});
test('terminal API result still needs independently verified payment proof',async()=>{
  const f=fixture();await f.runner.one(id);f.journal[id].nextPoll=0;
  assert.equal((await f.runner.one(id)).state,'review');assert.equal(f.polls,1);
  f.proof={hash:'fixture receipt',status:1};assert.equal((await f.runner.one(id)).state,'confirmed');assert.equal(f.sends,1);
});
test('reopened journal recovers paid invoice from chain proof without another request',async()=>{
  const f=fixture();await f.runner.one(id);
  const restored=new KeeperRunner({api:f.api,config,journal:structuredClone(f.journal),save:async()=>{},readInvoice:async()=>({status:'paid'}),receipt:async()=>({hash:'verified fixture',status:1})});
  assert.equal((await restored.one(id)).state,'confirmed');assert.equal(f.sends,1);
});
test('a formerly confirmed record does not override a reverted chain state',async()=>{
  const f=fixture();f.journal[id]={state:'confirmed',receipt:{hash:'old fixture'}};
  assert.equal((await f.runner.one(id)).state,'review');assert.equal(f.sends,0);
});
