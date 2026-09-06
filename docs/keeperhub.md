# KeeperHub integration

Checked against official documentation on 6 September 2026. These are integration requirements and prepared code, not a live account receipt.

The built-in [Safe plugin](https://docs.keeperhub.com/plugins/safe) reads Safe state. Payroom instead uses [Web3 write-contract](https://docs.keeperhub.com/plugins/web3) to call `execute(invoiceId)` on its enabled Safe module. The owner has already fixed the recipient, token, amount and due time. The keeper has no general transfer or approval permission.

`src/keeperhub.mjs` exports the direct request and disabled manual workflow. The workflow uses `web3Connection: eoa`; the organization's Turnkey EOA must match the on-chain keeper. Its canonical fields follow the [workflow schema](https://docs.keeperhub.com/workflows/schema-reference) and [workflow API](https://docs.keeperhub.com/api/workflows). A manual trigger is the initial integration test. Scheduling can be enabled only after real execution and receipt recovery work.

## Direct execution sequence

1. Confirm Sepolia is enabled and marked as a testnet in the account's chain list. Confirm actual free allowance and no paid overage.
2. Deploy a project Safe, test token and module on Sepolia. Set the keeper to the verified KeeperHub sender, enable the module through the Safe and approve one small test invoice.
3. Build and save one canonical request with its deterministic idempotency key before sending. Simulate that exact body, and require a successful non-reverting result.
4. Send once through `/api/execute/contract-call`. Preserve the response and execution ID even when the status is failed or unconfirmed.
5. Read `/api/execute/{executionId}/status`, then independently verify the transaction and the module's Paid event. HTTP success alone never means paid.

The [direct execution API](https://docs.keeperhub.com/api/direct-execution) documents a 24-hour replay window. The adapter refuses an intent older than 23 hours rather than assuming the key protects a later retry. On-chain invoice state remains the final duplicate-payment guard. Do not rotate keys while a request may still be running.

Live wiring must store credentials in the existing credential store, never in browser code, source or exported records. The present adapter's tests use a labelled fixture response. No API key or live account billing configuration has been invented.
