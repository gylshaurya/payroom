import { readFileSync } from 'node:fs';
import { Contract, ContractFactory, JsonRpcProvider, Interface, ZeroAddress, concat, zeroPadValue, toBeHex } from 'ethers';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
export const moduleArtifact = () => json('../out/Payroom.sol/Payroom.json');
export const safeArtifact = () => json('../node_modules/@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json');
export function providerFor(url) {
  const target = new URL(url);
  if (!['127.0.0.1','localhost'].includes(target.hostname) || target.protocol !== 'http:') throw new Error('Local runtime accepts loopback RPC only.');
  return new JsonRpcProvider(url, undefined, { cacheTimeout: -1 });
}
export function safeCallData(owner, to, data) {
  const signature = concat([zeroPadValue(owner, 32), zeroPadValue('0x00', 32), '0x01']);
  return new Interface(safeArtifact().abi).encodeFunctionData('execTransaction', [to, 0, data, 0, 0, 0, 0, ZeroAddress, ZeroAddress, signature]);
}
export async function deployLocal(provider) {
  const network = await provider.getNetwork();
  if (network.chainId !== 31337n) throw new Error('Local setup requires chain 31337.');
  const owner = await provider.getSigner(0), keeper = await provider.getSigner(1);
  const recipients = await Promise.all([2,3,4].map(async n => (await provider.getSigner(n)).address));
  const deploy = async (artifact, args=[]) => {
    const bytecode = typeof artifact.bytecode === 'string' ? artifact.bytecode : artifact.bytecode.object;
    const c = await new ContractFactory(artifact.abi, bytecode, owner).deploy(...args);
    await c.waitForDeployment(); return c;
  };
  const singleton = await deploy(safeArtifact());
  const proxy = await deploy(json('../node_modules/@safe-global/safe-contracts/build/artifacts/contracts/proxies/SafeProxy.sol/SafeProxy.json'), [singleton.target]);
  const safe = new Contract(proxy.target, safeArtifact().abi, owner);
  await (await safe.setup([owner.address], 1, ZeroAddress, '0x', ZeroAddress, ZeroAddress, 0, ZeroAddress)).wait();
  const module = await deploy(moduleArtifact(), [safe.target, keeper.address]);
  const token = await deploy(json('../out/TestDollar.sol/TestDollar.json'), [safe.target, 1000000000n]);
  const ownerCall = async (to, data) => {
    const receipt = await (await owner.sendTransaction({ to: safe.target, data: safeCallData(owner.address, to, data), gasLimit: 1000000 })).wait();
    const failed = receipt.logs.some(l => { try { return safe.interface.parseLog(l)?.name === 'ExecutionFailure'; } catch { return false; } });
    if (failed) throw new Error('Safe setup transaction failed.');
  };
  await ownerCall(safe.target, safe.interface.encodeFunctionData('enableModule', [module.target]));
  await ownerCall(module.target, module.interface.encodeFunctionData('setDailyCap', [token.target, 100000000n]));
  for (const recipient of recipients) await ownerCall(module.target, module.interface.encodeFunctionData('setRecipient', [recipient, true]));
  const block = await provider.getBlock('latest');
  return { version: 1, chainId: 31337, environment: 'Local Anvil', safe: safe.target, module: module.target, token: token.target, owner: owner.address, keeper: keeper.address, recipients, deployedBlock: block.number, deployedBlockHash: block.hash, safeVersion: await safe.VERSION() };
}

export class Chain {
  constructor(provider, config, store) { this.provider = provider; this.config = config; this.store = store; this.module = new Contract(config.module, moduleArtifact().abi, provider); this.tail = Promise.resolve(); }
  serial(fn) { const next = this.tail.then(fn, fn); this.tail = next.catch(() => {}); return next; }
  async verify() {
    const network = await this.provider.getNetwork();
    if (network.chainId !== 31337n || this.config.chainId !== 31337) throw new Error('Local signing is restricted to chain 31337.');
    const anchor = await this.provider.getBlock(this.config.deployedBlock);
    if (anchor?.hash !== this.config.deployedBlockHash || await this.provider.getCode(this.config.module) === '0x') throw new Error('Saved chain does not match this workspace. Restore the saved Anvil state.');
  }
  async invoice(id) {
    const local = this.store.get(id), v = await this.module.invoices(id);
    if (v.state !== 0n && (v.recipient.toLowerCase() !== local.recipient.toLowerCase() || v.token.toLowerCase() !== local.token.toLowerCase() || v.amount.toString() !== local.amount || Number(v.due) !== local.due)) throw new Error('Saved invoice differs from its approved chain terms.');
    return { ...local, status: local.cancelled && v.state === 0n ? 'cancelled' : ['draft','approved','paid','cancelled'][Number(v.state)] };
  }
  async state() {
    await this.verify();
    const block = await this.provider.getBlock('latest');
    const [paused, cap, spent, invoices] = await Promise.all([this.module.paused(), this.module.dailyCaps(this.config.token), this.module.spent(this.config.token, Math.floor(block.timestamp / 86400)), Promise.all(this.store.list().map(x => this.invoice(x.id)))]);
    return { config: this.config, paused, cap: cap.toString(), spent: spent.toString(), chainTime: block.timestamp, invoices, operations: this.store.operations(), pending: this.store.pending() ?? null };
  }
  async transact(kind, invoice, method, args, owner=true) {
    await this.verify();
    if (this.store.pending()) throw new Error('A transaction needs a receipt check. Reconcile it before making another change.');
    const signer = await this.provider.getSigner(owner ? this.config.owner : this.config.keeper);
    const inner = this.module.interface.encodeFunctionData(method, args);
    const tx = { from: signer.address, to: owner ? this.config.safe : this.config.module, data: owner ? safeCallData(signer.address, this.config.module, inner) : inner, value: '0x0', gas: toBeHex(1000000), nonce: toBeHex(await signer.getNonce('pending')) };
    const startBlock = await this.provider.getBlockNumber();
    const operationId = this.store.begin(kind, invoice, { tx, startBlock });
    try {
      const hash = await this.provider.send('eth_sendTransaction', [tx]);
      this.store.update(operationId, { hash });
    } catch {
      this.store.update(operationId, { error: 'The send result is unknown. Check the receipt before retrying.' });
    }
    await this.reconcile();
    return this.store.operations().find(x => x.id === operationId);
  }
  async reconcile() {
    await this.verify();
    const op = this.store.pending();
    if (!op) return null;
    let hash = op.hash;
    if (!hash) {
      const end = await this.provider.getBlockNumber();
      if (end - op.body.startBlock > 5000) throw new Error('Receipt search exceeds 5000 local blocks. Preserve the journal for a manual chain check.');
      for (let n = op.body.startBlock; n <= end; n++) {
        const block = await this.provider.send('eth_getBlockByNumber', [toBeHex(n), true]);
        const found = block?.transactions.find(t => t.from.toLowerCase() === op.body.tx.from.toLowerCase() && BigInt(t.nonce) === BigInt(op.body.tx.nonce));
        if (!found) continue;
        if (found.to?.toLowerCase() !== op.body.tx.to.toLowerCase() || found.input !== op.body.tx.data || BigInt(found.value) !== 0n) throw new Error('The recorded nonce was used by a different transaction. Keep this operation blocked.');
        hash = found.hash; this.store.update(op.id, { hash }); break;
      }
    }
    if (!hash) return op;
    const receipt = await this.provider.getTransactionReceipt(hash);
    if (!receipt) return op;
    const tx = await this.provider.getTransaction(hash);
    if (!tx || tx.from.toLowerCase() !== op.body.tx.from.toLowerCase() || tx.to?.toLowerCase() !== op.body.tx.to.toLowerCase() || tx.data !== op.body.tx.data || BigInt(tx.nonce) !== BigInt(op.body.tx.nonce) || tx.value !== 0n) throw new Error('Receipt does not match the saved operation.');
    const safeInterface = new Interface(safeArtifact().abi);
    const innerFailed = receipt.logs.some(l => { try { return l.address.toLowerCase() === this.config.safe.toLowerCase() && safeInterface.parseLog(l)?.name === 'ExecutionFailure'; } catch { return false; } });
    const succeeded = receipt.status === 1 && !innerFailed;
    const proof = { hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, gasUsed: receipt.gasUsed.toString(), chainId: this.config.chainId, status: receipt.status, innerFailed, from: tx.from, to: tx.to };
    this.store.update(op.id, { state: succeeded ? 'confirmed' : 'failed', receipt: proof, error: succeeded ? null : 'The chain rejected this change. Invoice terms and payment controls still apply.' });
    return this.store.operations().find(x => x.id === op.id);
  }
  action(id, action) { return this.serial(async () => {
    const invoice = await this.invoice(id);
    if (this.store.pending()) throw new Error('Reconcile the pending operation before continuing.');
    if (action === 'approve') {
      if (invoice.status !== 'draft') throw new Error('Only a draft invoice can be approved.');
      return this.transact('approve', id, 'approve', [id, invoice.recipient, invoice.token, invoice.amount, invoice.due]);
    }
    if (action === 'execute') {
      if (invoice.status === 'paid') return { state: 'confirmed', alreadyPaid: true };
      if (invoice.status !== 'approved') throw new Error('Approve this invoice before payment.');
      return this.transact('pay', id, 'execute', [id], false);
    }
    if (action === 'cancel') {
      if (invoice.status === 'draft') { this.store.cancelDraft(id); return { state: 'confirmed' }; }
      if (invoice.status !== 'approved') throw new Error('Only an unpaid invoice can be cancelled.');
      return this.transact('cancel', id, 'cancel', [id]);
    }
    throw new Error('Unknown invoice action.');
  }); }
  policy(input) { return this.serial(async () => {
    if (typeof input.paused === 'boolean') return this.transact('pause', null, 'setPaused', [input.paused]);
    if (typeof input.cap === 'string' && /^\d{1,9}(\.\d{1,6})?$/.test(input.cap)) {
      const [whole, fraction=''] = input.cap.split('.');
      return this.transact('cap', null, 'setDailyCap', [this.config.token, BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))]);
    }
    throw new Error('Enter a valid daily cap or pause setting.');
  }); }
}
