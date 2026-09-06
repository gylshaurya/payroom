import { Interface, getAddress, keccak256, toUtf8Bytes } from 'ethers';
import { moduleArtifact } from './chain.mjs';

export const KEEPER_ORIGIN = 'https://app.keeperhub.com';
export function keeperRequest(config, invoiceId) {
  if (Number(config.chainId) !== 11155111) throw new Error('KeeperHub execution is restricted to Sepolia.');
  if (!/^0x[a-fA-F0-9]{64}$/.test(invoiceId)) throw new Error('Invalid invoice ID.');
  const contractAddress = getAddress(config.module);
  const abi = new Interface(moduleArtifact().abi).formatJson();
  const body = { contractAddress, chainId: 11155111, functionName: 'execute', functionArgs: JSON.stringify([invoiceId]), abi, value: '0', gasLimitMultiplier: '1.2' };
  const key = `payroom-${keccak256(toUtf8Bytes(JSON.stringify(body))).slice(2)}`;
  return { endpoint: '/api/execute/contract-call', idempotencyKey: key, body };
}
export function keeperWorkflow(config, invoiceId, walletIntegrationId) {
  const { body } = keeperRequest(config, invoiceId);
  if (typeof walletIntegrationId !== 'string' || !walletIntegrationId.trim()) throw new Error('A verified KeeperHub wallet integration is required.');
  return {
    name: `Payroom invoice ${invoiceId.slice(2, 10)}`,
    nodes: [
      { id: 'trigger', type: 'trigger', data: { label: 'Approved invoice', type: 'trigger', config: { triggerType: 'Manual' } } },
      { id: 'pay', type: 'action', data: { label: 'Pay approved invoice', type: 'action', config: { actionType: 'web3/write-contract', network: '11155111', contractAddress: body.contractAddress, abiFunction: 'execute', functionArgs: body.functionArgs, abi: body.abi, walletIntegrationId, gasLimitMultiplier: '1.2' } } }
    ], edges: [{ id: 'trigger-pay', source: 'trigger', target: 'pay' }]
  };
}

/** No automatic retry, key rotation or settlement assertion. The caller persists intent first. */
export class KeeperHub {
  constructor({ apiKey, freeAccessVerified = false, fetchImpl = fetch }) { this.apiKey = apiKey; this.freeAccessVerified = freeAccessVerified; this.fetch = fetchImpl; }
  async request(path, method='GET', body, key) {
    if (!this.apiKey) throw new Error('KeeperHub account connection is not configured.');
    if (!/^\/api\/(execute|chains)(\/|$)/.test(path)) throw new Error('Unsupported KeeperHub endpoint.');
    const response = await this.fetch(`${KEEPER_ORIGIN}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(45000), headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    return { ok: response.ok, status: response.status, value, pollAfter: response.headers.get('X-Poll-Interval-Hint') };
  }
  simulate(request) { return this.request(request.endpoint, 'POST', { ...request.body, simulate: true }); }
  async broadcast(request, savedIntent) {
    if (!this.freeAccessVerified) throw new Error('Verify free account execution and disable paid overage before a live run.');
    if (request.body.chainId !== 11155111 || request.body.functionName !== 'execute' || request.body.value !== '0') throw new Error('Only a Sepolia invoice execution is permitted.');
    if (JSON.stringify(savedIntent.request) !== JSON.stringify(request)) throw new Error('Persist this exact request before broadcasting.');
    if (!Number.isFinite(savedIntent.created) || Date.now() - savedIntent.created >= 23 * 3600000 || savedIntent.created > Date.now()) throw new Error('The replay window is no longer safe. Reconcile the chain before another attempt.');
    if (savedIntent.simulation?.success !== true || savedIntent.simulation?.wouldRevert !== false) throw new Error('A successful simulation of this request is required.');
    return this.request(request.endpoint, 'POST', request.body, request.idempotencyKey);
  }
  status(id) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,180}$/.test(id)) throw new Error('Invalid execution ID.');
    return this.request(`/api/execute/${id}/status`);
  }
}
