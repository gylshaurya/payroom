const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = amount => { const value=BigInt(amount);const fraction=(value%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return (value/1000000n).toLocaleString('en-US')+'.'+(fraction.length<2?fraction.padEnd(2,'0'):fraction); };
const date = value => value ? new Date(value * 1000).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : 'On approval';
const short = value => `${value.slice(0,8)}...${value.slice(-6)}`;
const label = state => state[0].toUpperCase()+state.slice(1);
let data, selected=null, filter='all', view='invoices', creating=false, busy=false, draftValues={};

function notice(message,error=false) { const el=$('#notice');el.hidden=!message;el.className=`notice${error?' error':''}`;el.textContent=message; }
async function api(path,body) {
  const response=await fetch(path,body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json','x-payroom-session':data?.session??''},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw new Error(result.error || 'The request could not finish.');return result;
}
async function refresh() {
  data=await api('/api/state');
  if(selected&&!data.invoices.some(i=>i.id===selected))selected=null;
  if(!selected&&data.invoices.length&&!creating)selected=data.invoices[0].id;
  render();
}
async function run(action,success) {
  if(busy)return;busy=true;$$('button:not(:disabled)').forEach(b=>{b.dataset.requestDisabled='true';b.disabled=true;});notice('Working on the local chain...');
  try{const result=await action();await refresh();if(result?.state==='failed')notice(result.error||'The chain rejected this change.',true);else if(result?.state==='pending')notice('The payment result is still unknown. Reconcile the receipt before retrying.',true);else notice(success);}catch(error){notice(error.message,true);try{await refresh();}catch{}}
  finally{busy=false;$$('[data-request-disabled]').forEach(b=>{b.disabled=false;delete b.dataset.requestDisabled;});}
}
function render() {
  if(!data)return;
  $('#invoice-view').hidden=view!=='invoices';$('#controls-view').hidden=view!=='controls';$('#activity-view').hidden=view!=='activity';
  $('#page-title').textContent={invoices:'Invoices',controls:'Payment controls',activity:'Activity'}[view];
  $('#page-description').textContent={invoices:'Approve the work. Keep the receipt.',controls:'Limits stay on chain, even when a workflow repeats.',activity:'Every attempt stays with its receipt.'}[view];
  $$('.nav-item').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});
  const pending=$('#pending');pending.hidden=!data.pending;
  if(data.pending){pending.className='pending-strip';pending.innerHTML='<div><strong>A transaction needs a receipt check</strong><p>Payroom has paused new chain changes. Checking does not send another payment.</p></div><button class="secondary" id="reconcile">Check receipt</button>';$('#reconcile').onclick=()=>run(()=>api('/api/reconcile',{}),'Receipt check complete.');}
  if(view==='invoices'){renderQueue();renderInspector();}
  if(view==='controls')renderControls();
  if(view==='activity')renderActivity();
}
function renderQueue() {
  $$('.filter').forEach(el=>{const f=el.dataset.filter;el.classList.toggle('active',f===filter);el.setAttribute('aria-pressed',String(f===filter));el.querySelector('span').textContent=f==='all'?data.invoices.length:data.invoices.filter(i=>i.status===f).length;});
  const query=$('#search').value.trim().toLowerCase();
  const rows=data.invoices.filter(i=>(filter==='all'||i.status===filter)&&`${i.reference} ${i.title} ${i.contributor} ${i.recipient}`.toLowerCase().includes(query));
  if(!creating && selected && !rows.some(i=>i.id===selected)){selected=null;renderInspector();}
  const queue=$('#queue-content');
  if(!rows.length)queue.innerHTML=`<div class="empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6zM9 10h6M9 14h6"/></svg><h2>${data.invoices.length?'No matching invoices':'Your next payment starts here'}</h2><p>${data.invoices.length?'Try another filter or search term.':'Add a contributor invoice. Approve its exact terms, then let the keeper pay within your Safe limits.'}</p>${data.invoices.length?'':'<button class="primary" id="first-invoice">Create an invoice</button>'}</div>`;
  else queue.innerHTML=`<table><thead><tr><th class="due-column">Due</th><th>Invoice / contributor</th><th>Status</th><th class="amount">Amount</th></tr></thead><tbody>${rows.map(i=>`<tr class="${i.id===selected?'selected':''}" data-id="${i.id}"><td class="due-column">${date(i.due)}</td><td><button class="invoice-button" data-select="${i.id}" aria-label="Open ${escape(i.reference)}">${escape(i.reference)}</button><span class="invoice-subtitle">${escape(i.contributor)}</span></td><td><span class="badge ${i.status}">${label(i.status)}</span></td><td class="amount">${money(i.amount)}<small>pUSD</small></td></tr>`).join('')}</tbody></table>`;
  $$('[data-select]').forEach(b=>b.onclick=()=>{selected=b.dataset.select;creating=false;renderQueue();renderInspector();if(innerWidth<=900)$('#inspector').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});
  $('#first-invoice')?.addEventListener('click',newInvoice);
  $('#queue-summary').textContent=`${rows.length} ${rows.length===1?'invoice':'invoices'} shown · Local test tokens`;
}
function renderInspector() {
  const panel=$('#inspector');
  if(creating){renderForm();return;}
  const i=data.invoices.find(i=>i.id===selected);
  if(!i){panel.innerHTML='<div class="empty"><h2>Invoice details</h2><p>Select an invoice to review the recipient, amount and payment receipt.</p></div>';return;}
  const operations=data.operations.filter(op=>op.invoice===i.id);
  const payment=operations.find(op=>op.kind==='pay'&&op.state==='confirmed');
  const pending=data.pending?.invoice===i.id;
  const due=i.due>data.chainTime;
  const over=BigInt(data.spent)+BigInt(i.amount)>BigInt(data.cap);
  let explanation,action='';
  if(i.status==='draft'){explanation='Approval locks this recipient, token, amount and due date in the Safe module.';action='<button class="primary" data-action="approve">Approve invoice</button><button class="danger" data-action="cancel">Cancel</button>';}
  if(i.status==='approved'){explanation=data.paused?'Payments are paused. Resume them in Payment controls.':due?'This invoice is approved. The keeper can pay it when its due time arrives.':over?'This payment would exceed today’s cap. Wait for the next UTC day or change the Safe limit.':'The keeper can pay these exact terms. A repeated run cannot pay the invoice twice.';action=`<button class="primary" data-action="execute" ${data.paused||due||over?'disabled':''}>Run local keeper</button><button class="danger" data-action="cancel">Cancel invoice</button>`;}
  if(i.status==='paid')explanation='The module recorded one payment. The receipt below links this invoice to the chain transaction.';
  if(i.status==='cancelled')explanation='This invoice is cancelled. Create a new invoice if the work should be paid later.';
  panel.innerHTML=`<div class="inspector-enter"><div class="detail-heading"><h2>${escape(i.reference)}</h2><span class="badge ${i.status}">${label(i.status)}</span></div><p class="detail-description">${escape(i.title)}</p><div class="detail-amount">${money(i.amount)}<span>pUSD</span></div><p class="detail-meta">Due ${date(i.due)}${i.due?' · '+new Date(i.due*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):''}</p><section class="detail-section"><h3>Recipient</h3><strong>${escape(i.contributor)}</strong><code class="address">${i.recipient}</code><button class="text-button" id="copy-address">Copy address</button></section><section class="detail-section"><h3>${i.status==='paid'?'Payment receipt':'Payment'}</h3><p>${explanation}</p>${pending?'<p>A receipt check is still pending.</p>':''}<div class="detail-actions">${action}</div>${payment?receiptDetails(payment,true):''}</section><section class="detail-section"><h3>Invoice record</h3><p>Created ${new Date(i.created).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}</p><details class="receipt-item"><summary>Invoice ID and token</summary><dl><dt>Invoice ID</dt><dd>${i.id}</dd><dt>Token</dt><dd>${i.token}</dd><dt>Safe</dt><dd>${data.config.safe}</dd></dl></details>${operations.filter(op=>op.id!==payment?.id).map(op=>receiptDetails(op)).join('')}</section></div>`;
  $$('[data-action]').forEach(b=>b.onclick=()=>run(()=>api(`/api/invoices/${i.id}/${b.dataset.action}`,{}),{approve:'Invoice approved. Its payment terms are now locked.',execute:'Payment checked against the chain.',cancel:'Invoice cancelled.'}[b.dataset.action]));
  $('#copy-address').onclick=async()=>{try{await navigator.clipboard.writeText(i.recipient);notice('Recipient address copied.');}catch{notice('Select the address above to copy it.',true);}};
}
function receiptDetails(op,open=false) {
  const names={approve:'Approval',pay:'Payment',cancel:'Cancellation',pause:'Pause setting',cap:'Daily cap'};
  return `<details class="receipt-item" ${open?'open':''}><summary>${names[op.kind]||escape(op.kind)} · ${label(op.state)}</summary><dl>${op.receipt?`<dt>Transaction hash</dt><dd>${op.receipt.hash}</dd><dt>Block / chain</dt><dd>${op.receipt.blockNumber} / ${op.receipt.chainId} (local)</dd><dt>Result</dt><dd>${op.receipt.status===1&&!op.receipt.innerFailed?'Confirmed on the local chain':'Rejected on the local chain'}</dd>`:`<dt>Receipt</dt><dd>${op.hash||'Not found yet. Check the receipt before another attempt.'}</dd>`}${op.error?`<dt>Issue</dt><dd>${escape(op.error)}</dd>`:''}</dl></details>`;
}
function newInvoice(){view='invoices';creating=true;draftValues={};render();$('#reference').focus();if(innerWidth<=900)$('#inspector').scrollIntoView({block:'start'});}
function renderForm() {
  $('#inspector').innerHTML=`<div class="detail-heading"><h2>New invoice</h2><button class="close-detail" id="close-form" aria-label="Close new invoice"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><p class="detail-description">Save the request first. Approval is a separate step.</p><form id="invoice-form"><label for="reference">Invoice reference</label><input id="reference" name="reference" required maxlength="50" placeholder="INV-001" autocomplete="off"><label for="contributor">Contributor</label><input id="contributor" name="contributor" required maxlength="80" placeholder="Name or team"><label for="description">Work description</label><textarea id="description" name="title" required maxlength="180" placeholder="What work is this payment for?"></textarea><label for="recipient">Recipient address</label><select id="recipient" name="recipient">${data.config.recipients.map((a,n)=>`<option value="${a}">Local contributor ${n+1} · ${short(a)}</option>`).join('')}</select><small>These three test accounts are on the Safe allowlist. Full addresses are in Payment controls.</small><label for="amount">Amount in pUSD</label><input id="amount" name="amount" inputmode="decimal" required pattern="[0-9]+(\.[0-9]{1,6})?" placeholder="25.00"><small>Local test tokens only. Daily cap: ${money(data.cap)} pUSD.</small><label for="due">Due time (optional)</label><input id="due" name="due" type="datetime-local"><small>Leave blank to allow payment after approval. Time uses this device’s timezone.</small><div class="form-actions"><button class="primary" type="submit">Save draft</button><button class="secondary" type="button" id="cancel-form">Discard</button></div></form>`;
  const form=$('#invoice-form');
  for(const [name,value] of Object.entries(draftValues)){const field=form.elements.namedItem(name);if(field)field.value=value;}
  form.oninput=()=>{draftValues=Object.fromEntries(new FormData(form));};
  form.onchange=form.oninput;
  $('#close-form').onclick=$('#cancel-form').onclick=()=>{creating=false;draftValues={};renderInspector();};
  $('#invoice-form').onsubmit=event=>{event.preventDefault();const input=Object.fromEntries(new FormData(event.target));run(async()=>{const i=await api('/api/invoices',input);selected=i.id;creating=false;draftValues={};return i;},'Draft saved. Review its terms before approval.');};
}
function renderControls() {
  const left=BigInt(data.cap)>BigInt(data.spent)?BigInt(data.cap)-BigInt(data.spent):0n;
  $('#controls-view').innerHTML=`<div class="controls-layout"><section><div class="control-block"><h2>Daily spending limit</h2><p>${money(data.spent)} of ${money(data.cap)} pUSD used today. ${money(left.toString())} pUSD remains. The limit resets at midnight UTC.</p><div class="limit-bar"><progress max="${data.cap==='0'?'1':data.cap}" value="${data.spent}" aria-label="Daily spending used"></progress></div><form id="cap-form"><label for="daily-cap">Daily cap in pUSD</label><input id="daily-cap" name="cap" value="${money(data.cap).replaceAll(',','')}" inputmode="decimal" required pattern="[0-9]+(\.[0-9]{1,6})?"><small>Setting the cap to zero blocks this token. Changing the cap requires a Safe owner transaction.</small><div class="form-actions"><button class="secondary" type="submit">Save daily cap</button></div></form></div><div class="control-block"><h2>${data.paused?'Payments are paused':'Payments are enabled'}</h2><p>Pause stops new keeper payments. It does not reverse payments already confirmed on chain.</p><button class="${data.paused?'primary':'secondary'}" id="pause">${data.paused?'Resume payments':'Pause payments'}</button></div></section><section><div class="control-block"><h2>Allowed recipients</h2><p>The keeper can only pay an address on this list, using the exact terms of an approved invoice.</p><ul class="recipient-list">${data.config.recipients.map((a,n)=>`<li><strong>Local contributor ${n+1}</strong><code class="address">${a}</code></li>`).join('')}</ul></div><div class="control-block"><h2>Safe and execution</h2><p>Safe ${data.config.safeVersion} holds the test tokens. The Payroom module limits what its keeper can do.</p><strong>Safe</strong><code class="address">${data.config.safe}</code><p>KeeperHub live execution is pending. The current button runs a separate local keeper account against the same contract function.</p><strong>Module</strong><code class="address">${data.config.module}</code></div></section></div>`;
  $('#cap-form').onsubmit=e=>{e.preventDefault();run(()=>api('/api/policy',{cap:$('#daily-cap').value}),'Daily cap checked against the chain.');};
  $('#pause').onclick=()=>run(()=>api('/api/policy',{paused:!data.paused}),data.paused?'Payments resumed.':'Payments paused.');
}
function renderActivity() {
  $('#activity-view').innerHTML=data.operations.length?`<div class="activity-list">${data.operations.map(op=>{const i=data.invoices.find(i=>i.id===op.invoice);return `<article class="activity-row"><time datetime="${op.created}">${new Date(op.created).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}</time><div><strong>${escape(i?.reference || 'Payment controls')}</strong><p>${escape({approve:'Safe owner approval',pay:'Local keeper payment',cancel:'Invoice cancellation',cap:'Daily cap change',pause:'Pause setting change'}[op.kind]||op.kind)}</p>${receiptDetails(op)}</div><span class="badge ${op.state}">${label(op.state)}</span></article>`;}).join('')}</div>`:'<div class="empty"><h2>No chain attempts yet</h2><p>Your first approval or payment will appear here. Failed attempts stay visible too.</p></div>';
}
$('#new-invoice').onclick=newInvoice;
$('#refresh').onclick=()=>run(()=>refresh(),'Workspace refreshed.');
$$('.nav-item').forEach(b=>b.onclick=()=>{view=b.dataset.view;creating=false;render();});
$$('.filter').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;renderQueue();});
$('#search').oninput=renderQueue;
$('#export').onclick=async()=>{try{const result=await api('/api/export');const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='payroom-records.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);notice('Invoice records exported with their actual local receipts.');}catch(e){notice(e.message,true);}};
$('#sample').onclick=()=>run(async()=>{if(data.invoices.some(i=>i.reference.startsWith('SAMPLE-')))throw new Error('Sample invoices already exist. Create your own invoice next.');for(const [n,title,name,amount]of[[0,'Documentation update','Sample contributor 1','12.50'],[1,'Contract review notes','Sample contributor 2','8.75'],[2,'Interface fixes','Sample contributor 3','35.25']])await api('/api/invoices',{reference:`SAMPLE-00${n+1}`,title,contributor:name,recipient:data.config.recipients[n],amount});},'Three sample drafts added. They are illustrative requests, not completed payments.');
refresh().catch(error=>notice(`The local workspace is unavailable. Start Payroom and refresh this page. ${error.message}`,true));
