import {PublicDesk} from './core.mjs';
import config from './config.json';
import abis from './abis.json';
const desk=new PublicDesk(config,abis,localStorage);
let tail=Promise.resolve();
const serial=fn=>{const next=tail.then(fn,fn);tail=next.catch(()=>{});return next;};
window.payroomAPI=(path,body)=>serial(async()=>{
  if(!navigator.locks)throw Error('Use a browser with Web Locks support for this saved workspace.');
  return navigator.locks.request(desk.key,async()=>{
    if(body===undefined){const state=await desk.state();return path==='/api/export'?{version:1,exportedAt:new Date().toISOString(),...state}:state;}
    if(path==='/api/invoices')return desk.create(body);
    if(path==='/api/reconcile')return desk.reconcile();
    if(path==='/api/policy')return desk.policy(body);
    const m=path.match(/^\/api\/invoices\/(0x[a-f0-9]{64})\/(approve|cancel|execute)$/i);
    if(m)return desk.action(m[1],m[2]);
    throw Error('Unsupported operation.');
  });
});
window.payroomPublic=true;
document.querySelector('#connect-owner').onclick=async()=>{
  const notice=document.querySelector('#notice');notice.hidden=false;
  try{const address=await desk.connect(window.ethereum);notice.textContent='Safe owner connected: '+address;document.querySelector('#connect-owner').textContent='Owner connected';}
  catch(e){notice.textContent=e.message;notice.className='notice error';}
};
await import('../public/app.js');
