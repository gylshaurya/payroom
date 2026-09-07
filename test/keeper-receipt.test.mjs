import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Interface,keccak256} from 'ethers';
import {keeperPaymentProof} from '../src/keeper-receipt.mjs';
const config=JSON.parse(readFileSync(new URL('../public-app/config.json',import.meta.url)));
const abis=JSON.parse(readFileSync(new URL('../public-app/abis.json',import.meta.url)));
const id=config.demoInvoices[0].id,hash='0x'+'aa'.repeat(32),blockHash='0x'+'bb'.repeat(32);
function fixture(){
  const moduleAbi=new Interface(abis.module),safeAbi=new Interface(abis.safe),tokenAbi=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
  const invoice={...config.demoInvoices[0],amount:12500000n,state:2n};
  const log=(address,abi,name,args)=>({address,...abi.encodeEventLog(abi.getEvent(name),args)});
  const receipt={hash,blockNumber:100,blockHash,status:1,gasUsed:177430n,logs:[log(config.module,moduleAbi,'Paid',[id,invoice.recipient,config.token,invoice.amount]),log(config.safe,safeAbi,'ExecutionFromModuleSuccess',[config.module]),log(config.token,tokenAbi,'Transfer',[config.safe,invoice.recipient,invoice.amount])]};
  const tx={chainId:11155111n,value:0n,from:'0x'+'ab'.repeat(20),to:'0x'+'cd'.repeat(20)};
  const desk={config:{...config,codeHashes:Object.fromEntries(['module','safe','token'].map(k=>[k,keccak256('0x6000')]))},provider:{getTransactionReceipt:async()=>receipt,getTransaction:async()=>tx,getBlock:async()=>({hash:blockHash}),getCode:async()=>'0x6000',getBlockNumber:async()=>101},module:{interface:moduleAbi,keeper:async()=>config.keeper,invoices:async()=>invoice},safe:{interface:safeAbi}};
  return {desk,receipt,tx,invoice,log,moduleAbi};
}
test('verifies sponsored payment from exact module, Safe and token events',async()=>{const f=fixture(),p=await keeperPaymentProof(f.desk,id,hash);assert.equal(p.status,1);assert.equal(p.sponsored,true);assert.equal(p.amount,'12500000');});
test('rejects an unrelated emitter even with identical Paid topics',async()=>{const f=fixture();f.receipt.logs[0].address=f.tx.from;await assert.rejects(keeperPaymentProof(f.desk,id,hash),/Paid event/);});
test('rejects altered invoice terms',async()=>{const f=fixture();f.invoice.amount=1n;await assert.rejects(keeperPaymentProof(f.desk,id,hash),/Paid event/);});
test('requires an actual token transfer as well as Paid',async()=>{const f=fixture();f.receipt.logs.pop();await assert.rejects(keeperPaymentProof(f.desk,id,hash),/token transfer/);});
test('requires a successful Safe module call',async()=>{const f=fixture();f.receipt.logs.splice(1,1);await assert.rejects(keeperPaymentProof(f.desk,id,hash),/Safe module/);});
test('rejects different historical contract code or keeper',async()=>{let f=fixture();f.desk.provider.getCode=async()=>'0x6001';await assert.rejects(keeperPaymentProof(f.desk,id,hash),/contract code/);f=fixture();f.desk.module.keeper=async()=>f.tx.from;await assert.rejects(keeperPaymentProof(f.desk,id,hash),/Keeper or invoice/);});
test('rejects keeper changes inside a payment transaction',async()=>{const f=fixture();f.receipt.logs.push(f.log(config.module,f.moduleAbi,'KeeperSet',[config.keeper]));await assert.rejects(keeperPaymentProof(f.desk,id,hash),/Keeper changed/);});
test('rejects noncanonical, failed or value-bearing transactions',async()=>{for(const change of [f=>f.receipt.status=0,f=>f.receipt.blockHash=hash,f=>f.tx.value=1n]){const f=fixture();change(f);await assert.rejects(keeperPaymentProof(f.desk,id,hash),/canonical/);}});
test('waits for another block without claiming confirmation',async()=>{const f=fixture();f.desk.provider.getBlockNumber=async()=>100;assert.equal(await keeperPaymentProof(f.desk,id,hash),null);});
