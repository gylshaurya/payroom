import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
const root = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory = resolve(root,'.local');
mkdirSync(directory,{recursive:true,mode:0o700});
const record = resolve(directory,'runtime.json');
const sleep = ms => new Promise(r => setTimeout(r,ms));
function owned(pid, marker) { try { return execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}).includes(marker); } catch { return false; } }
function occupied(port) { return new Promise(resolve => { const socket=createConnection({host:'127.0.0.1',port}); socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false)); }); }
let state = existsSync(record) ? JSON.parse(readFileSync(record)) : {};
const save = () => writeFileSync(record, JSON.stringify(state,null,2), {mode:0o600});
if (process.argv[2] === 'stop') {
  for (const [kind,marker] of [['server',resolve(root,'src/server.mjs')],['anvil',resolve(directory,'chain.json')]]) {
    if (state[kind] && owned(state[kind],marker)) process.kill(state[kind],'SIGINT');
  }
  await sleep(1200);
  if(existsSync(record))unlinkSync(record); console.log('Stopped owned Payroom processes. Saved invoices and chain state remain.');
} else if (process.argv[2] === 'start') {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Use ./payroom start to select Node 24 or newer.');
  for (const [kind,bin,args,marker] of [
    ['anvil','anvil',['--host','127.0.0.1','--port','18547','--chain-id','31337','--silent','--state',resolve(directory,'chain.json'),'--state-interval','1'],resolve(directory,'chain.json')],
    ['server',process.execPath,[resolve(root,'src/server.mjs')],resolve(root,'src/server.mjs')]
  ]) {
    if (state[kind] && owned(state[kind],marker)) continue;
    if(await occupied(kind==='anvil'?18547:4323)) throw new Error(`Payroom's ${kind} port is occupied by another process. It has not been changed.`);
    const fd = openSync(resolve(directory,`${kind}.log`),'a',0o600);
    const child = spawn(bin,args,{cwd:root,detached:true,stdio:['ignore',fd,fd]});
    child.on('error', () => {}); child.unref(); state[kind]=child.pid; save();
    for (let n=0;n<60;n++) {
      await sleep(200);
      try {
        const response = await fetch(kind === 'anvil' ? 'http://127.0.0.1:18547' : 'http://127.0.0.1:4323/api/state',kind === 'anvil' ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})} : {});
        if (response.ok) break;
      } catch {}
      if (n === 59) throw new Error(`${kind} did not start. Read its ignored log in .local.`);
    }
  }
  console.log('Payroom: http://127.0.0.1:4323 (local test chain, no real funds)');
} else throw new Error('Use ./payroom start or ./payroom stop.');
