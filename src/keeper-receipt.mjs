import {Interface,keccak256} from 'ethers';

const tokenEvents=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const events=(receipt,address,abi)=>receipt.logs.filter(l=>same(l.address,address)).flatMap(l=>{try{const e=abi.parseLog(l);return e?[e]:[];}catch{return [];}});

// Sponsored execution may have a relayer as the outer sender. Verify the actual
// known module, its authorized keeper, and the exact Safe token movement instead.
export async function keeperPaymentProof(desk,id,hash){
  const {provider,module,safe,config}=desk;
  const receipt=await provider.getTransactionReceipt(hash);
  if(!receipt)return null;
  const tx=await provider.getTransaction(hash),block=await provider.getBlock(receipt.blockNumber);
  if(!tx||Number(tx.chainId)!==11155111||tx.value!==0n||receipt.status!==1||block?.hash!==receipt.blockHash)throw Error('Keeper receipt is not a successful canonical Sepolia transaction.');
  for(const name of ['module','safe','token'])if(keccak256(await provider.getCode(config[name],receipt.blockNumber))!==config.codeHashes[name])throw Error('Keeper receipt contract code differs from the published deployment.');
  const at={blockTag:receipt.blockNumber};
  const [keeper,invoice]=await Promise.all([module.keeper(at),module.invoices(id,at)]);
  if(!same(keeper,config.keeper)||invoice.state!==2n||!same(invoice.token,config.token))throw Error('Keeper or invoice state differs at the payment block.');
  const moduleEvents=events(receipt,config.module,module.interface);
  if(moduleEvents.some(e=>e.name==='KeeperSet'))throw Error('Keeper changed in this payment transaction; inspect its call trace.');
  const paid=moduleEvents.filter(e=>e.name==='Paid'&&e.args.id===id);
  if(paid.length!==1||!same(paid[0].args.recipient,invoice.recipient)||!same(paid[0].args.token,invoice.token)||paid[0].args.amount!==invoice.amount)throw Error('Paid event differs from the invoice terms.');
  const safeEvents=events(receipt,config.safe,safe.interface);
  if(!safeEvents.some(e=>e.name==='ExecutionFromModuleSuccess'&&same(e.args[0],config.module))||safeEvents.some(e=>['ExecutionFailure','ExecutionFromModuleFailure'].includes(e.name)))throw Error('Safe module execution was not successful.');
  const transfers=events(receipt,config.token,tokenEvents).filter(e=>e.name==='Transfer'&&same(e.args.from,config.safe)&&same(e.args.to,invoice.recipient)&&e.args.value===invoice.amount);
  if(transfers.length!==1)throw Error('Receipt lacks the exact Safe-to-contributor token transfer.');
  if(await provider.getBlockNumber()<=receipt.blockNumber)return null;
  return {hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,chainId:11155111,status:1,keeper,invoice:id,recipient:invoice.recipient,token:invoice.token,amount:invoice.amount.toString(),from:tx.from,to:tx.to,sponsored:!same(tx.from,keeper),gasUsed:receipt.gasUsed.toString()};
}
