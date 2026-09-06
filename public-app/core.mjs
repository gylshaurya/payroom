import {Contract,Interface,JsonRpcProvider,BrowserProvider,getAddress,parseUnits,id as hashId,keccak256,concat,zeroPadValue,ZeroAddress} from 'ethers';

export function draft(input,config,existing=[]) {
  const text=(v,name,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f]/.test(v))throw Error(`Enter a valid ${name}.`);return v.trim();};
  const reference=text(input.reference,'reference',50);
  if(existing.some(x=>x.reference.toLowerCase()===reference.toLowerCase()))throw Error('This invoice reference already exists.');
  const title=text(input.title,'description',180),contributor=text(input.contributor,'contributor',80),recipient=getAddress(input.recipient);
  if(!config.recipients.some(a=>a.toLowerCase()===recipient.toLowerCase()))throw Error('Select an allowed contributor.');
  if(typeof input.amount!=='string'||!/^\d{1,9}(\.\d{1,6})?$/.test(input.amount)||parseUnits(input.amount,6)<=0n)throw Error('Use a positive amount with at most six decimals.');
  const due=input.due?Math.floor(Date.parse(input.due)/1000):0;
  if(!Number.isSafeInteger(due)||due<0||due>4102444800)throw Error('Enter a valid due date before 2100.');
  return {id:hashId(crypto.randomUUID()),reference,title,contributor,recipient,token:config.token,amount:parseUnits(input.amount,6).toString(),due,chainId:config.chainId,created:new Date().toISOString()};
}

export function assertTerms(invoice,onchain) {
  if(onchain.state!==0n&&(invoice.recipient.toLowerCase()!==onchain.recipient.toLowerCase()||invoice.token.toLowerCase()!==onchain.token.toLowerCase()||BigInt(invoice.amount)!==onchain.amount||invoice.due!==Number(onchain.due)))throw Error('Saved invoice differs from its approved chain terms.');
}

export class PublicDesk {
  constructor(config,abis,storage,provider) {
    if(config.chainId!==11155111)throw Error('Public workspace requires Sepolia.');
    this.config={...config,public:true};this.abis=abis;this.storage=storage;
    this.key=`payroom:${config.chainId}:${config.module.toLowerCase()}`;
    this.provider=provider??new JsonRpcProvider(config.rpc,undefined,{batchMaxCount:1,cacheTimeout:-1});
    this.module=new Contract(config.module,abis.module,this.provider);this.safe=new Contract(config.safe,abis.safe,this.provider);
    this.injected=null;this.reload();
  }
  reload(){
    const raw=this.storage.getItem(this.key);this.saved=raw?JSON.parse(raw):{version:1,invoices:[],operations:[],logs:[],cursor:this.config.deployedBlock};
    if(this.saved.version!==1)throw Error('Unsupported local records.');
    for(const seed of this.config.demoInvoices??[]){
      const existing=this.saved.invoices.find(i=>i.id===seed.id);
      if(!existing)this.saved.invoices.push({...seed});
      else if(existing.reference.startsWith('CHAIN-'))Object.assign(existing,{reference:seed.reference,title:seed.title,contributor:seed.contributor});
    }
  }
  save(){this.storage.setItem(this.key,JSON.stringify(this.saved));}
  async verify() {
    if(Number((await this.provider.getNetwork()).chainId)!==11155111)throw Error('RPC is not Sepolia.');
    const anchor=await this.provider.getBlock(this.config.deployedBlock);
    if(anchor?.hash!==this.config.deployedBlockHash)throw Error('Deployment anchor does not match this chain.');
    for(const key of ['safe','module','token'])if(keccak256(await this.provider.getCode(this.config[key]))!==this.config.codeHashes[key])throw Error('Published contract code does not match: '+key);
    if(!await this.safe.isModuleEnabled(this.config.module))throw Error('The Safe has disabled Payroom.');
  }
  async connect(injected) {
    if(!injected)throw Error('Use a browser with a wallet extension to sign. Reading receipts needs no wallet.');
    const p=new BrowserProvider(injected);await p.send('eth_requestAccounts',[]);
    if(Number((await p.getNetwork()).chainId)!==11155111)throw Error('Switch your wallet to Ethereum Sepolia, then connect again.');
    const signer=await p.getSigner();
    if(signer.address.toLowerCase()!==this.config.owner.toLowerCase()||!await this.safe.isOwner(signer.address)||await this.safe.getThreshold()!==1n)throw Error('This demo Safe requires its configured owner. You can still inspect all public receipts.');
    this.injected=injected;return signer.address;
  }
  async logs() {
    const head=await this.provider.getBlockNumber();
    let from=Math.max(this.config.deployedBlock,Math.min(this.saved.cursor??this.config.deployedBlock,head)-6);
    if(head-this.config.deployedBlock>200000)throw Error('This release exceeds its bounded history window. Export records and refresh the release configuration.');
    this.saved.logs=this.saved.logs.filter(l=>l.blockNumber<from);
    for(;from<=head;from+=2000){
      const to=Math.min(head,from+1999);
      const logs=await this.provider.getLogs({address:this.config.module,fromBlock:from,toBlock:to});
      for(const l of logs)this.saved.logs.push({transactionHash:l.transactionHash,blockNumber:l.blockNumber,blockHash:l.blockHash,index:l.index,topics:l.topics,data:l.data});
    }
    this.saved.cursor=head;this.save();
    return this.saved.logs;
  }
  async proof(hash,kind,invoice,request) {
    const receipt=await this.provider.getTransactionReceipt(hash);if(!receipt)return null;
    const tx=await this.provider.getTransaction(hash);
    if(!tx||Number(tx.chainId)!==11155111||tx.value!==0n)throw Error('Unexpected receipt transaction.');
    if(request&&(tx.from.toLowerCase()!==request.from.toLowerCase()||tx.to?.toLowerCase()!==request.to.toLowerCase()||tx.data!==request.data||tx.nonce!==request.nonce))throw Error('Receipt differs from the saved request.');
    const eventName={approve:'Approved',pay:'Paid',cancel:'Cancelled',cap:'CapSet',pause:'PauseSet'}[kind];
    const event=receipt.logs.filter(l=>l.address.toLowerCase()===this.config.module.toLowerCase()).map(l=>{try{return this.module.interface.parseLog(l);}catch{return null;}}).find(e=>e?.name===eventName&&(!invoice||e.args.id===invoice));
    const innerFailed=receipt.logs.some(l=>{try{return l.address.toLowerCase()===this.config.safe.toLowerCase()&&this.safe.interface.parseLog(l)?.name==='ExecutionFailure';}catch{return false;}});
    const succeeded=receipt.status===1&&!innerFailed&&!!event;
    return {hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,chainId:11155111,status:succeeded?1:0,innerFailed,from:tx.from,to:tx.to,gasUsed:receipt.gasUsed.toString()};
  }
  async state() {
    this.reload();await this.verify();
    const logs=await this.logs(), operations=[];
    for(const log of logs){
      let event;try{event=this.module.interface.parseLog(log);}catch{continue;}
      if(event?.name==='Approved'&&!this.saved.invoices.some(i=>i.id===event.args.id)){
        this.saved.invoices.push({id:event.args.id,reference:'CHAIN-'+event.args.id.slice(2,10),title:'Invoice terms read from the Safe module',contributor:'Testnet contributor',recipient:event.args.recipient,token:event.args.token,amount:event.args.amount.toString(),due:Number(event.args.due),chainId:11155111,created:new Date((await this.provider.getBlock(log.blockNumber)).timestamp*1000).toISOString()});
      }
      const kind={Approved:'approve',Paid:'pay',Cancelled:'cancel',CapSet:'cap',PauseSet:'pause'}[event?.name];
      if(!kind)continue;
      const invoice=event.args.id??null,proof=await this.proof(log.transactionHash,kind,invoice);
      if(!proof||proof.status!==1)continue;
      operations.push({id:`${log.transactionHash}:${log.index}`,invoice,kind,state:'confirmed',hash:log.transactionHash,receipt:proof,created:new Date((await this.provider.getBlock(log.blockNumber)).timestamp*1000).toISOString()});
    }
    const invoices=[];
    for(const i of this.saved.invoices){const onchain=await this.module.invoices(i.id);assertTerms(i,onchain);invoices.push({...i,status:i.cancelled&&onchain.state===0n?'cancelled':['draft','approved','paid','cancelled'][Number(onchain.state)]});}
    for(const op of this.saved.operations){
      if(op.hash){const receipt=await this.proof(op.hash,op.kind,op.invoice,op.body.tx);if(receipt){op.receipt=receipt;op.state=receipt.status===1?'confirmed':'failed';}}
      if(!operations.some(x=>x.hash===op.hash))operations.push(op);
    }
    this.save();
    const block=await this.provider.getBlock('latest');
    return {config:this.config,paused:await this.module.paused(),cap:(await this.module.dailyCaps(this.config.token)).toString(),spent:(await this.module.spent(this.config.token,Math.floor(block.timestamp/86400))).toString(),chainTime:block.timestamp,invoices:invoices.sort((a,b)=>b.created.localeCompare(a.created)),operations:operations.sort((a,b)=>b.created.localeCompare(a.created)),pending:this.saved.operations.find(o=>o.state==='pending')??null};
  }
  create(input){this.reload();const i=draft(input,this.config,this.saved.invoices);this.saved.invoices.push(i);this.save();return i;}
  async ownerCall(kind,invoice,method,args){
    this.reload();await this.verify();
    if(this.saved.operations.some(o=>o.state==='pending'))throw Error('Check the pending receipt before another change.');
    if(!this.injected)throw Error('Connect the configured Safe owner wallet first.');
    const p=new BrowserProvider(this.injected);
    if(Number((await p.getNetwork()).chainId)!==11155111)throw Error('Wallet must be on Sepolia.');
    const signer=await p.getSigner();
    if(signer.address.toLowerCase()!==this.config.owner.toLowerCase()||!await this.safe.isOwner(signer.address)||await this.safe.getThreshold()!==1n)throw Error('Wrong Safe owner or threshold.');
    const inner=this.module.interface.encodeFunctionData(method,args);
    const signature=concat([zeroPadValue(signer.address,32),zeroPadValue('0x00',32),'0x01']);
    const data=this.safe.interface.encodeFunctionData('execTransaction',[this.config.module,0,inner,0,0,0,0,ZeroAddress,ZeroAddress,signature]);
    const tx={to:this.config.safe,from:signer.address,data,value:'0',nonce:await signer.getNonce('pending'),chainId:11155111};
    // Simulate the owner's exact Safe call before opening the wallet request.
    await this.provider.call(tx);
    const op={id:crypto.randomUUID(),kind,invoice,state:'pending',hash:null,created:new Date().toISOString(),body:{tx,startBlock:await this.provider.getBlockNumber()}};
    this.saved.operations.push(op);this.save();
    try{const response=await signer.sendTransaction({...tx,value:0n});op.hash=response.hash;this.save();}
    catch(e){if(e.code==='ACTION_REJECTED'||e.code===4001){op.state='failed';op.error='Wallet request rejected. No transaction was approved.';}else op.error='Wallet send result unknown. Check the saved receipt before retrying.';this.save();throw Error(op.error);}
    const receipt=await this.provider.waitForTransaction(op.hash,1,60000);
    if(receipt){op.receipt=await this.proof(op.hash,kind,invoice,tx);op.state=op.receipt.status===1?'confirmed':'failed';this.save();}
    return op;
  }
  async reconcile(){
    this.reload();await this.verify();const op=this.saved.operations.find(o=>o.state==='pending');if(!op)return null;
    if(!op.hash){
      const head=await this.provider.getBlockNumber();if(head-op.body.startBlock>2000)throw Error('Preserve the record for an operator nonce check. The 2,000-block search window has elapsed.');
      for(let n=op.body.startBlock;n<=head;n++){
        const b=await this.provider.send('eth_getBlockByNumber',['0x'+n.toString(16),true]);
        const tx=b.transactions.find(t=>t.from.toLowerCase()===op.body.tx.from.toLowerCase()&&Number(BigInt(t.nonce))===op.body.tx.nonce);
        if(tx){op.hash=tx.hash;this.save();break;}
      }
    }
    if(op.hash){const proof=await this.proof(op.hash,op.kind,op.invoice,op.body.tx);if(proof){op.receipt=proof;op.state=proof.status===1?'confirmed':'failed';this.save();}}
    return op;
  }
  async action(id,action){
    const s=await this.state(),i=s.invoices.find(i=>i.id===id);if(!i)throw Error('Invoice not found.');
    if(action==='execute')return i.status==='paid'?{state:'confirmed'}:{state:'pending',error:'KeeperHub has not confirmed this invoice yet. Checking does not send a payment.'};
    if(action==='approve'){if(i.status!=='draft')throw Error('Only drafts can be approved.');return this.ownerCall('approve',id,'approve',[id,i.recipient,i.token,i.amount,i.due]);}
    if(action==='cancel'){
      if(i.status==='draft'){this.saved.invoices.find(x=>x.id===id).cancelled=true;this.save();return {state:'confirmed'};}
      if(i.status!=='approved')throw Error('Only unpaid invoices can be cancelled.');return this.ownerCall('cancel',id,'cancel',[id]);
    }
    throw Error('Unknown invoice action.');
  }
  async policy(input){
    if(typeof input.paused==='boolean')return this.ownerCall('pause',null,'setPaused',[input.paused]);
    if(typeof input.cap!=='string'||!/^\d{1,9}(\.\d{1,6})?$/.test(input.cap))throw Error('Enter a valid cap.');
    return this.ownerCall('cap',null,'setDailyCap',[this.config.token,parseUnits(input.cap,6)]);
  }
}
