# Payroom

Payroom keeps a contributor invoice, its Safe approval and its payment receipt in one place. The owner approves exact terms once. A keeper can then pay within an on-chain daily limit. A repeated run cannot pay the same invoice twice.

## Run locally

You need Node 24 or newer, Python 3 and Foundry (`forge` and `anvil`). The launcher uses an existing Node installation, including the bundled Codex runtime on this Mac, without changing global settings.

```sh
npm ci --ignore-scripts
forge build
./payroom start
```

Open http://127.0.0.1:4323. The first start deploys a real Safe 1.4.1, a Payroom module and a fixed-supply test token to an owned Anvil chain on port 18547. It allows three local contributor accounts and starts with a daily limit of 100 pUSD.

Create an invoice, approve it, then select **Run local keeper**. These are real local EVM transactions. The UI labels this environment and never presents it as a public KeeperHub run. The local owner and keeper accounts are unlocked test accounts, not production login or signing.

```sh
./payroom test
./payroom stop
```

The tests start and stop a separate temporary Anvil instance on 18549. Keep that port and test HTTP port 4335 free. Tests use the actual Safe bytecode, not a fake Safe implementation.

`npm ci` uses legacy peer resolution because Safe's package declares ethers 5 for its own tooling. Payroom consumes only its published ABI/bytecode and uses ethers 6 independently.

## What is built

- Invoice drafts, exact Safe approvals, cancellation and one-time execution.
- Recipient/token allowlists, a per-token UTC daily cap, due time and pause.
- A SQLite transaction journal written before broadcast. Unknown sends block further writes until receipt recovery.
- Receipt recovery by exact sender, nonce and calldata after a lost response.
- Desktop and mobile invoice list, payment controls, activity and record export.
- A documented KeeperHub direct-call adapter with stable idempotency keys, simulation and a separate receipt-status request.

## What still needs live verification

Sepolia deployment, free KeeperHub account allowance, actual KeeperHub execution, a public app and the final demo are separate release steps. The current local build does not prove these. See [docs/keeperhub.md](docs/keeperhub.md).

The contract is a hackathon testnet demonstration. Use only the included test token. Allowlisting a token trusts its transfer behavior; fee-on-transfer, rebasing and malicious tokens are unsupported. This code has not received an external security audit.

## Recovery and data

The ignored `.local` folder holds the SQLite database, deployment anchor, owned process IDs and saved Anvil chain. Preserve the whole folder when moving the workspace. Do not delete the chain while keeping its invoices. A deployment block-hash check rejects mismatched chains.

If a transaction is pending, use **Check receipt**. The app never silently rebroadcasts an unknown request. If the local RPC rejected a send before producing a hash, an operator may need to inspect the preserved sender nonce and chain state. Keep the journal intact.

The HTTP service binds to loopback only and checks Host, Origin and a session token for writes. It is a local tool, not an internet-facing authenticated server. Do not expose its port or its Anvil RPC publicly.

## Project notes

- [Acceptance and milestones](acceptance.md)
- [KeeperHub integration](docs/keeperhub.md)
- [Safe contracts](https://github.com/safe-global/safe-smart-account)

Safe artifacts retain their LGPL license in the installed package. Manrope's OFL license is included beside the self-hosted font. Payroom's own source is MIT licensed.
