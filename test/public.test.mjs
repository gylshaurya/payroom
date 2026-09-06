import {test} from 'node:test';
import assert from 'node:assert/strict';
import {draft,assertTerms,PublicDesk} from '../public-app/core.mjs';
const config={chainId:11155111,module:'0x0000000000000000000000000000000000000001',safe:'0x0000000000000000000000000000000000000002',token:'0x0000000000000000000000000000000000000003',recipients:['0x0000000000000000000000000000000000000004']};
const input={reference:'INV-001',title:'Test contributor work',contributor:'Test contributor',recipient:config.recipients[0],amount:'12.50'};
test('public drafts validate amount, recipient, duplicate reference and due date',()=>{
  const i=draft(input,config);assert.equal(i.amount,'12500000');assert.equal(i.due,0);assert.match(i.id,/^0x[0-9a-f]{64}$/);
  for(const amount of ['0','-1','1.0000001','1e3'])assert.throws(()=>draft({...input,amount},config));
  assert.throws(()=>draft({...input,recipient:config.safe},config));
  assert.throws(()=>draft({...input,reference:'inv-001'},config,[i]));
  assert.throws(()=>draft({...input,due:'not a date'},config));
});
test('public invoice metadata cannot override approved chain terms',()=>{
  const i=draft(input,config),onchain={recipient:i.recipient,token:i.token,amount:12500000n,due:0n,state:1n};
  assert.doesNotThrow(()=>assertTerms(i,onchain));
  for(const changed of [{amount:'12500001'},{recipient:config.safe},{token:config.module},{due:1}])assert.throws(()=>assertTerms({...i,...changed},onchain));
});
test('public mode refuses a non-Sepolia configuration before constructing a provider',()=>{
  assert.throws(()=>new PublicDesk({...config,chainId:1},{},{}),/Sepolia/);
});
test('missing browser wallet produces a read-only handoff before signing',async()=>{
  await assert.rejects(()=>PublicDesk.prototype.connect.call({},null),/Reading receipts needs no wallet/);
});
