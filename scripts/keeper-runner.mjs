import {readFile,writeFile,rename,mkdir,unlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PublicDesk} from '../public-app/core.mjs';
import {KeeperHub} from '../src/keeperhub.mjs';
import {KeeperRunner} from '../src/keeper-runner.mjs';

const directory=new URL('../.local/',import.meta.url),file=new URL('keeper-journal.json',directory),lock=new URL('keeper-runner.lock',directory);
let desk,locked=false;
try{
  await mkdir(directory,{recursive:true,mode:0o700});
  await writeFile(lock,String(process.pid),{flag:'wx',mode:0o600});locked=true;
  const config=JSON.parse(await readFile(new URL('../public-app/config.json',import.meta.url))),abis=JSON.parse(await readFile(new URL('../public-app/abis.json',import.meta.url)));
  const access=JSON.parse(await readFile(new URL('keeper-access.json',directory)));
  const checked=Date.parse(access.checkedAt);
  if(!Number.isFinite(checked)||checked>Date.now()||access.paidDailyCap!==0||access.paidMonthlyCap!==0||access.chainId!==11155111||access.keeper!==config.keeper||Date.now()-checked>7*86400000)throw Error('Refresh the saved free-plan, zero-cap and sender checks before running.');
  let key;try{key=execFileSync('/usr/bin/security',['find-generic-password','-a','payroom','-s','payroom-keeperhub-api-v1','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{throw Error('KeeperHub API access is not available in the credential store. Complete the personal account check.');}
  const api=new KeeperHub({apiKey:key,freeAccessVerified:true});
  const chains=await api.request('/api/chains');
  if(!chains.ok||!Array.isArray(chains.value)||!chains.value.some(c=>Number(c.chainId)===11155111&&c.isEnabled===true&&c.isTestnet===true))throw Error('KeeperHub does not currently list enabled Sepolia.');
  let cache;desk=new PublicDesk(config,abis,{getItem:()=>cache,setItem:(_,v)=>{cache=v;}});
  let journal={};try{journal=JSON.parse(await readFile(file));}catch(e){if(e.code!=='ENOENT')throw e;}
  const save=async()=>{const temp=new URL('keeper-journal.tmp',directory);await writeFile(temp,JSON.stringify(journal,null,2),{mode:0o600});await rename(temp,file);};
  async function guard(){
    const controller=fileURLToPath(new URL('../../../hacky.py',import.meta.url));
    const status=JSON.parse(execFileSync('python3',[controller,'status'],{encoding:'utf8',maxBuffer:8*1024*1024}));
    const event=status.events.find(e=>e.id==='keeperhub-agent-economy-2026'),task=status.local_work.find(w=>w.id==='keeperhub-agent-economy-2026:keeper-live');
    if(status.paused||!event||['candidate','skipped','archived','submitted'].includes(event.stage)||task?.content.idea_digest!==access.ideaDigest)throw Error('Hacky has paused, removed or changed this chosen project.');
    const data=event.content;
    if(data.build_start!==access.buildStart||data.build_end!==access.buildEnd||(data.rules_fingerprint??null)!==(access.rulesFingerprint??null)||Date.now()<Date.parse(data.build_start)||Date.now()>=Date.parse(data.build_end))throw Error('Recheck the current event rules and coding window.');
  }
  async function receipt(id,response){
    let hash=response?.receipts?.find(r=>r.verified===true&&Number(r.chainId)===11155111&&r.receiptStatus==='success')?.hash??response?.transactionHash;
    if(!hash){const logs=await desk.provider.getLogs({address:config.module,topics:[desk.module.interface.getEvent('Paid').topicHash,id],fromBlock:config.deployedBlock,toBlock:'latest'});hash=logs.at(-1)?.transactionHash;}
    if(!hash)return null;
    const tx=await desk.provider.getTransaction(hash);
    if(!tx||tx.from.toLowerCase()!==config.keeper.toLowerCase()||tx.to?.toLowerCase()!==config.module.toLowerCase()||tx.data!==desk.module.interface.encodeFunctionData('execute',[id])||tx.value!==0n)throw Error('Receipt sender or call does not match the expected KeeperHub invoice execution.');
    const proof=await desk.proof(hash,'pay',id);
    return proof?.status===1&&await desk.provider.getBlockNumber()>proof.blockNumber?proof:null;
  }
  await guard();const state=await desk.state();
  const runner=new KeeperRunner({api,config,journal,save,guard,receipt,readInvoice:async id=>{
    const chain=await desk.module.invoices(id),block=await desk.provider.getBlock('latest');
    return {status:['draft','approved','paid','cancelled'][Number(chain.state)],due:Number(chain.due)<=block.timestamp,paused:await desk.module.paused(),overCap:await desk.module.spent(chain.token,Math.floor(block.timestamp/86400))+chain.amount>await desk.module.dailyCaps(chain.token)};
  }});
  const ids=[...new Set([...Object.keys(journal),...state.invoices.filter(i=>i.status==='approved').map(i=>i.id)])];
  for(const id of ids.slice(0,5)){const result=await runner.one(id);console.log(JSON.stringify({invoice:id,state:result.state,hash:result.receipt?.hash??null,reason:result.reason??result.error??null}));if(['pending','review'].includes(result.state))break;}
  if(!ids.length)console.log('No approved invoices need a keeper run.');
}catch(e){console.error(e.code==='ENOENT'?'KeeperHub access checks are not configured yet. Complete account authorization and verify the free plan first.':e.code==='EEXIST'?'A keeper runner lock already exists. Inspect that process and journal before retrying.':e.message);process.exitCode=1;}
finally{if(desk)desk.provider.destroy();if(locked)await unlink(lock);}
