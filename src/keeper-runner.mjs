import {keeperRequest} from './keeperhub.mjs';

export function verifySimulation(value,config){
  if(value?.success!==true||value?.wouldRevert!==false||value.from?.toLowerCase()!==config.keeper.toLowerCase()||value.to?.toLowerCase()!==config.module.toLowerCase()||String(value.value)!=='0')throw Error('Simulation did not verify this exact keeper, target and zero native value.');
}

// All records are persisted before network writes. An unknown attempt is never re-sent automatically.
export class KeeperRunner {
  constructor({api,config,journal,save,readInvoice,receipt,guard=async()=>{}}){Object.assign(this,{api,config,journal,save,readInvoice,receipt,guard});}
  async one(id){
    const invoice=await this.readInvoice(id),previous=this.journal[id];
    if(invoice.status==='paid'){
      const proof=await this.receipt(id,previous?.response?.value);
      if(!proof)return {state:'pending',reason:'Paid state observed; matching keeper receipt still needs verification.'};
      const record={...(previous??{}),state:'confirmed',receipt:proof};this.journal[id]=record;await this.save();return record;
    }
    if(invoice.status!=='approved')return {state:'waiting',reason:'Invoice is not approved.'};
    if(previous){
      if(previous.state==='confirmed'){
        previous.state='review';previous.error='The chain no longer reports this invoice as paid. Inspect its previous receipt.';await this.save();
      }
      if(previous.executionId&&Date.now()>=(previous.nextPoll??0)&&previous.state==='pending'){
        const response=await this.api.status(previous.executionId);previous.response=response;
        const hint=Number(response.pollAfter);
        previous.nextPoll=Date.now()+Math.max(5,Number.isFinite(hint)?hint:30)*1000;
        if(response.ok&&response.pollAfter==='0')previous.state='review';
        await this.save();
      }
      const proof=await this.receipt(id,previous.response?.value);
      if(proof){previous.state='confirmed';previous.receipt=proof;await this.save();}
      return previous;
    }
    if(!invoice.due||invoice.paused||invoice.overCap)return {state:'waiting',reason:'Payment controls or due time block execution.'};
    await this.guard();
    const request=keeperRequest(this.config,id);
    const simulation=await this.api.simulate(request);
    if(!simulation.ok)throw Error('KeeperHub simulation failed. No broadcast was sent.');
    verifySimulation(simulation.value,this.config);
    const record={request,created:Date.now(),simulation:simulation.value,state:'pending',executionId:null};
    this.journal[id]=record;await this.save();
    // The persisted guard runs again immediately before the external write.
    await this.guard();
    try{
      const response=await this.api.broadcast(request,record);record.response=response;
      record.executionId=typeof response.value?.executionId==='string'?response.value.executionId:null;
      record.nextPoll=Date.now()+Math.max(5,Number(response.pollAfter)||30)*1000;
      if(!record.executionId)record.state='review';
    }catch{record.error='Broadcast result unknown. Reconcile this saved intent without a new key.';}
    await this.save();
    const proof=await this.receipt(id,record.response?.value);
    if(proof){record.state='confirmed';record.receipt=proof;await this.save();}
    return record;
  }
}
