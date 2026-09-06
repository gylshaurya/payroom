import {Contract,ContractFactory,Interface,keccak256,toUtf8Bytes,ZeroAddress} from 'ethers';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {testWallet} from './testnet-wallet.mjs';
import {publicProvider,journalSender,RPC} from './sepolia-journal.mjs';
import {safeCallData,safeArtifact,moduleArtifact} from '../src/chain.mjs';

const provider=publicProvider();
try {
  const owner=(await testWallet('owner')).connect(provider),contributor=await testWallet('contributor');
  const keeper='0xf0135C32368Cee89df899b259C54B530870Ca89b';
  const {send,evidence}=await journalSender(owner);
  const deploy=async(key,artifact,args=[])=>send(key,await new ContractFactory(artifact.abi,typeof artifact.bytecode==='string'?artifact.bytecode:artifact.bytecode.object,owner).getDeployTransaction(...args));
  const registry=JSON.parse(await readFile(new URL('../docs/safe-1.4.1-deployments.json',import.meta.url)));
  if(registry.version!=='1.4.1'||registry.networkAddresses['11155111']!=='canonical')throw Error('Unexpected Safe deployment registry.');
  const singleton=registry.deployments.canonical;
  if(keccak256(await provider.getCode(singleton.address))!==singleton.codeHash)throw Error('Canonical Safe singleton code differs from its official registry.');
  let proxy;
  const existing=evidence().operations;
  if(existing['safe-proxy']) {
    // Reconcile the already completed first release. Never create a new uninitialized proxy.
    if(!existing['safe-setup']?.block)throw Error('Prior proxy setup is incomplete. Inspect its ownership before continuing.');
    proxy=existing['safe-proxy'];
  } else {
    const factories=JSON.parse(await readFile(new URL('../docs/safe-factory-1.4.1-deployments.json',import.meta.url)));
    const factory=factories.deployments.canonical;
    if(factories.networkAddresses['11155111']!=='canonical'||keccak256(await provider.getCode(factory.address))!==factory.codeHash)throw Error('Safe factory code differs from the official registry.');
    const factoryAbi=JSON.parse(await readFile(new URL('../node_modules/@safe-global/safe-contracts/build/artifacts/contracts/proxies/SafeProxyFactory.sol/SafeProxyFactory.json',import.meta.url))).abi;
    const iface=new Interface(factoryAbi), initializer=new Interface(safeArtifact().abi).encodeFunctionData('setup',[[owner.address],1,ZeroAddress,'0x',ZeroAddress,ZeroAddress,0,ZeroAddress]);
    const creation=await send('safe-create-and-setup',{to:factory.address,data:iface.encodeFunctionData('createProxyWithNonce',[singleton.address,initializer,BigInt(keccak256(toUtf8Bytes('Payroom:'+owner.address)))])});
    const event=creation.receipt.logs.filter(l=>l.address.toLowerCase()===factory.address.toLowerCase()).map(l=>{try{return iface.parseLog(l);}catch{return null;}}).find(e=>e?.name==='ProxyCreation');
    if(!event)throw Error('Safe factory did not produce a creation receipt.');proxy={address:event.args.proxy,block:creation.block};
  }
  const safe=new Contract(proxy.address,safeArtifact().abi,provider);
  if(!await safe.isOwner(owner.address)||await safe.getThreshold()!==1n)throw Error('Safe owner or threshold differs from this project.');
  const deployedModule=await deploy('payroom-module',moduleArtifact(),[safe.target,keeper]);
  const module=new Contract(deployedModule.address,moduleArtifact().abi,provider);
  const token=await deploy('test-token',JSON.parse(await readFile(new URL('../out/TestDollar.sol/TestDollar.json',import.meta.url))),[safe.target,1000000000n]);
  async function ownerCall(key,to,data){
    const op=await send(key,{to:safe.target,data:safeCallData(owner.address,to,data)});
    if(op.receipt.logs.some(l=>{try{return l.address.toLowerCase()===safe.target.toLowerCase()&&safe.interface.parseLog(l)?.name==='ExecutionFailure';}catch{return false;}}))throw Error('Safe inner call failed: '+key);
  }
  await ownerCall('enable-module',safe.target,safe.interface.encodeFunctionData('enableModule',[module.target]));
  await ownerCall('allow-contributor',module.target,module.interface.encodeFunctionData('setRecipient',[contributor.address,true]));
  await ownerCall('set-cap',module.target,module.interface.encodeFunctionData('setDailyCap',[token.address,100000000n]));
  const config={version:1,chainId:11155111,environment:'Ethereum Sepolia',rpc:RPC,explorer:'https://sepolia.etherscan.io',safe:safe.target,module:module.target,token:token.address,owner:owner.address,keeper,recipients:[contributor.address],safeVersion:await safe.VERSION(),deployedBlock:deployedModule.block,deployedBlockHash:deployedModule.blockHash,codeHashes:{},keeperLive:false};
  for(const key of ['safe','module','token']){const code=await provider.getCode(config[key]);if(code==='0x')throw Error('Deployment code is absent.');config.codeHashes[key]=keccak256(code);}
  if(!await safe.isModuleEnabled(module.target)||await module.keeper()!==keeper)throw Error('Module or keeper configuration mismatch.');
  await mkdir(new URL('../public-app/',import.meta.url),{recursive:true});
  await writeFile(new URL('../public-app/config.json',import.meta.url),JSON.stringify(config,null,2)+'\n');
  await writeFile(new URL('../docs/sepolia-deployment.json',import.meta.url),JSON.stringify({...evidence(),config},null,2)+'\n');
  console.log(JSON.stringify(config));
}catch(e){console.error(e.shortMessage||e.message);process.exitCode=1;}finally{provider.destroy();}
