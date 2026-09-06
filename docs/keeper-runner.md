# Local KeeperHub runner

The runner is implemented and tested with labelled API fixtures. It has not executed a live KeeperHub payment yet. The open account handoff requires the user's email code and authenticator confirmation before the API key can be created.

After that personal step, the operator copies only the newly created Payroom key and runs `python3 scripts/store-keeper-key.py --clipboard`. The helper validates the key format, stores it in macOS Keychain and clears that copied key from the clipboard. No key is printed or written to an environment file. The normal hidden-input mode is also available. Never put the key in chat, GitHub or browser code.

## Access checks before activation

Verify the current free plan, daily and monthly paid caps of zero, the current organization EOA and enabled Sepolia. The public chains API was checked on 6 September 2026 and lists Sepolia as enabled and a testnet; it does not authenticate an API key. The API key needs read and write scope, not admin.

Save those actual checks to the ignored `.local/keeper-access.json`, including `checkedAt`, `paidDailyCap`, `paidMonthlyCap`, `chainId`, `keeper`, `ideaDigest`, `buildStart`, `buildEnd` and `rulesFingerprint`. These values come from verified account state and the current Hacky ledger. This file is intentionally not supplied with invented success values. The runner rejects stale checks after seven days and respects Hacky pause, archive, idea changes and the coding window.

## Run one bounded pass

```sh
node scripts/build-public.mjs
node scripts/keeper-runner.mjs
```

Use Node 24+. The runner processes at most five known invoices, stopping at an unresolved request. It checks chain code and invoice state, simulates the exact call, requires the correct sender and target with zero native value, and persists one intent before a broadcast. The on-chain Safe cap, recipient permissions and one-time invoice state remain independent checks.

The existing local Hacky scheduler can invoke another bounded pass after activation. No runner daemon was installed while access is pending. The Mac and credential store must be available. An existing lock means inspect the owner process and journal before retrying; never erase a lock to run a second worker blindly.

## Interrupted requests

The journal lives in `.local/keeper-journal.json`, written by an atomic file replacement. An unknown result is never automatically sent again. When an execution ID is available, the next pass polls it after the server's interval hint. A completed HTTP response still needs a real matching payment receipt. The runner checks the exact module, keeper sender, invoice calldata, zero native value and Paid event, then waits for a second block before recording confirmation.

A failed or unknown execution without a usable receipt stays for review. Do not rotate its idempotency key or clear its journal. A previous confirmed record does not override a changed chain state. Eight tests cover interrupted responses, persistence failure, wrong simulation sender, payment controls, terminal API results and restart recovery. They are fixture evidence, not sponsor execution proof.

Source: [KeeperHub direct execution](https://docs.keeperhub.com/api/direct-execution) and [chain catalog](https://docs.keeperhub.com/api/chains).
