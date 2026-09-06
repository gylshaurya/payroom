// Exercises the public app's EIP-1193 path through an encrypted test-wallet bridge.
// This proves signed Sepolia behavior, not a wallet extension's popup UI.
import {readFile,writeFile} from 'node:fs/promises';
import {PublicDesk} from '../public-app/core.mjs';
import {testWallet} from './testnet-wallet.mjs';
import {publicProvider,journalSender} from './sepolia-journal.mjs';
const provider=publicProvider();
const file=new URL('../.local/public-demo-state.json',import.meta.url);
let saved=null;try{saved=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
const storage={getItem:()=>saved,setItem:(key,value)=>{saved=value;}};
try {
  const config=JSON.parse(await readFile(new URL('../public-app/config.json',import.meta.url))),abis=JSON.parse(await readFile(new URL('../public-app/abis.json',import.meta.url)));
  const wallet=(await testWallet('owner')).connect(provider),{send,evidence}=await journalSender(wallet,'public-owner-check');
  let operationKey='';
  const injected={request:async({method,params=[]})=>{
    if(['eth_accounts','eth_requestAccounts'].includes(method))return [wallet.address];
    if(method==='eth_chainId')return '0xaa36a7';
    if(method==='eth_sendTransaction'){
      const tx=params[0];if(tx.from.toLowerCase()!==wallet.address.toLowerCase()||tx.to.toLowerCase()!==config.safe.toLowerCase()||BigInt(tx.value??0)!==0n||Number(BigInt(tx.chainId??11155111))!==11155111)throw Error('Unexpected public-app transaction.');
      const op=await send(operationKey,{to:tx.to,data:tx.data,value:0n});return op.hash;
    }
    if(!/^eth_(getTransactionCount|getTransactionByHash|getTransactionReceipt|getBlockByNumber|blockNumber|estimateGas|call|gasPrice|maxPriorityFeePerGas|getBalance|getCode)$/.test(method))throw Error('Unexpected wallet RPC method: '+method);
    return provider.send(method,params);
  }};
  const desk=new PublicDesk(config,abis,storage,provider);
  await desk.connect(injected);let state=await desk.state();
  let invoice=state.invoices.find(i=>i.reference==='DEMO-001');
  if(!invoice){invoice=desk.create({reference:'DEMO-001',title:'Test contributor documentation review',contributor:'Demo contributor',recipient:config.recipients[0],amount:'12.50'});await writeFile(file,saved,{mode:0o600});}
  if((await desk.state()).invoices.find(i=>i.id===invoice.id).status==='draft'){
    operationKey='demo-approve';await desk.action(invoice.id,'approve');await writeFile(file,saved,{mode:0o600});
  }
  state=await desk.state();
  if(!evidence().operations['pause-test']){operationKey='pause-test';await desk.policy({paused:true});await writeFile(file,saved,{mode:0o600});}
  state=await desk.state();
  if(state.paused){operationKey='resume-test';await desk.policy({paused:false});await writeFile(file,saved,{mode:0o600});}
  state=await desk.state();
  if(state.invoices.find(i=>i.id===invoice.id).status!=='approved')throw Error('Expected the approved invoice to remain unpaid until KeeperHub runs.');
  await writeFile(file,saved,{mode:0o600});
  await writeFile(new URL('../docs/public-owner-check.json',import.meta.url),JSON.stringify({...evidence(),invoice,checkedAt:new Date().toISOString(),status:'approved, waiting for KeeperHub',walletPath:'PublicDesk EIP-1193 path with encrypted test-wallet bridge. Browser extension popup not exercised.'},null,2)+'\n');
  console.log(JSON.stringify({invoiceId:invoice.id,status:'approved',operations:Object.keys(evidence().operations),safe:config.safe}));
}catch(e){console.error(e.shortMessage||e.message);process.exitCode=1;}finally{if(saved)await writeFile(file,saved,{mode:0o600});provider.destroy();}
