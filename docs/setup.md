# Run and review Payroom

Payroom is a local invoice desk backed by a Safe module. It needs Node 24+, Python 3 and Foundry. No model API or paid service is used by the local app.

From the project folder:

```sh
npm ci --ignore-scripts
forge build
./payroom start
```

Open `http://127.0.0.1:4323`. The launcher starts only its own service and Anvil process. It refuses to take over an occupied port. The first start creates a Safe, enables Payroom, creates 1,000 pUSD test tokens and allows three local contributor addresses. None of these tokens has monetary value.

## First payment

1. Choose **New invoice**. Enter a unique reference, contributor, description and amount. Select one of the local recipients. Leave due time blank for immediate eligibility after approval.
2. Choose **Save draft**, then review the full recipient and amount. Saving has not moved tokens or approved anything.
3. Choose **Approve invoice**. The local owner sends a real Safe transaction that fixes the terms on chain.
4. Choose **Run local keeper**. The module checks the approval, recipient, token, due time, pause and daily cap before moving tokens from the Safe.
5. Open the payment receipt. It includes the transaction hash, block and local chain ID. **Export records** saves the real invoices and receipts as JSON.

Samples are optional illustrative drafts, clearly named SAMPLE. They do not claim completed work or real customers. Local owner and keeper accounts are public development accounts and must never receive real funds.

## Controls and recovery

Payment controls shows allowed recipients, today's use, cap, Safe and module. A cap of zero blocks the test token. Pause blocks new keeper payments; it does not reverse a completed payment. Both controls need a Safe owner transaction. The limit uses UTC midnight, regardless of this computer's timezone.

Unknown transactions stay pending. Use **Check receipt** before making another change. Payroom searches the recorded hash, or the exact sender and nonce if the response was lost, and checks target, calldata and value. A confirmed receipt must also pass the Safe's inner result. A different transaction using the nonce stays blocked for inspection.

An operation with no hash and no matching chain transaction needs an operator to inspect the journal. Do not clear it simply to unlock the UI. On-chain invoice state is the final duplicate-payment guard.

## Verify and stop

```sh
./payroom test
forge test -vv
./payroom stop
```

The Node tests need ports 18549 and 4335 free. They create temporary state and stop only their test processes. The normal runtime uses ports 18547 and 4323. Stopping retains `.local` so the next start restores invoices, operation history and the same chain.

Back up the whole `.local` directory while stopped. Do not combine invoices from one chain with a fresh chain. The deployment block hash detects that mismatch. Keep `.local`, `.wallets`, environment files and credentials out of Git and public hosting.

## KeeperHub release

The local keeper is not KeeperHub. The adapter in `src/keeperhub.mjs` prepares Sepolia-only calls and a disabled workflow. The live release must use a funded testnet Safe, the verified KeeperHub sender, secure API access, a successful simulation and an independently checked receipt. See [KeeperHub integration](keeperhub.md).

The signed-in free plan was checked on 6 September 2026 and paid overage caps were saved as zero. API creation currently requires the account holder's email and authenticator checks. No free allowance proves that a particular chain has sponsored gas. Public access and the final sponsor demo must be verified after live deployment.
