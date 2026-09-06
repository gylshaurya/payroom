import {JsonRpcProvider, keccak256, getCreateAddress, parseEther} from 'ethers';
import {readFile, writeFile, mkdir} from 'node:fs/promises';

export const RPC='https://ethereum-sepolia-rpc.publicnode.com';
export const publicProvider=()=>new JsonRpcProvider(RPC,undefined,{batchMaxCount:1,cacheTimeout:-1,pollingInterval:3000});
export async function journalSender(wallet,name='sepolia-deploy') {
  const provider=wallet.provider;
  const file=new URL(`../.local/${name}.json`,import.meta.url);
  await mkdir(new URL('../.local/',import.meta.url),{recursive:true,mode:0o700});
  let journal;
  try{journal=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={chainId:11155111,sender:wallet.address,operations:{}};}
  if(journal.sender!==wallet.address||journal.chainId!==11155111)throw Error('Journal belongs to another sender or chain.');
  const save=()=>writeFile(file,JSON.stringify(journal,null,2),{mode:0o600});
  async function send(key,request) {
    if(Number((await provider.getNetwork()).chainId)!==11155111)throw Error('Sepolia only.');
    const terms={to:request.to??null,data:request.data??'0x',value:String(request.value??0)};
    let entry=journal.operations[key];
    if(entry&&JSON.stringify(entry.terms)!==JSON.stringify(terms))throw Error('Saved transaction terms changed. Reconcile first.');
    if(!entry) {
      const nonce=await provider.getTransactionCount(wallet.address,'pending');
      const estimate=await provider.estimateGas({...request,from:wallet.address}),fee=await provider.getFeeData();
      const gasLimit=estimate*12n/10n, maxFeePerGas=fee.maxFeePerGas, maxPriorityFeePerGas=fee.maxPriorityFeePerGas??0n;
      if(!maxFeePerGas||gasLimit>8000000n||gasLimit*maxFeePerGas>parseEther('0.008'))throw Error('Testnet gas estimate exceeds this operation limit.');
      if(await provider.getBalance(wallet.address)<gasLimit*maxFeePerGas+BigInt(terms.value))throw Error('Free testnet gas is insufficient.');
      const raw=await wallet.signTransaction({...request,chainId:11155111,nonce,gasLimit,maxFeePerGas,maxPriorityFeePerGas,type:2});
      entry={terms,raw,hash:keccak256(raw),nonce,createdAt:new Date().toISOString(),...(request.to?{}:{address:getCreateAddress({from:wallet.address,nonce})})};
      journal.operations[key]=entry;await save();
    }
    let receipt=await provider.getTransactionReceipt(entry.hash);
    if(!receipt) {
      // Reuse only the exact signed bytes saved before the first broadcast.
      const existing=await provider.getTransaction(entry.hash);
      if(!existing) {
        const minedNonce=await provider.getTransactionCount(wallet.address,'latest');
        if(minedNonce>entry.nonce)throw Error('Saved nonce was consumed without the expected receipt. Inspect before continuing.');
        const tx=await provider.broadcastTransaction(entry.raw);console.log(JSON.stringify({sent:key,hash:tx.hash}));
      }
      receipt=await provider.waitForTransaction(entry.hash,1,90000);
    }
    if(!receipt||receipt.status!==1)throw Error('Saved transaction failed or still needs confirmation: '+entry.hash);
    const transaction=await provider.getTransaction(entry.hash);
    if(transaction?.from.toLowerCase()!==wallet.address.toLowerCase()||transaction?.data!==terms.data)throw Error('Receipt does not match sender and calldata.');
    entry.block=receipt.blockNumber;entry.blockHash=receipt.blockHash;entry.gasUsed=receipt.gasUsed.toString();await save();
    return {...entry,receipt};
  }
  const evidence=()=>({chainId:journal.chainId,sender:journal.sender,operations:Object.fromEntries(Object.entries(journal.operations).map(([k,{raw,...v}])=>[k,v]))});
  return {send,evidence};
}
