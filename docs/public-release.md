# Sepolia release

The public workspace reads Ethereum Sepolia and needs no account to inspect invoices or receipts. It uses only pUSD test tokens. New invoice descriptions are saved in the current browser; payment terms and states are read from the Safe module. The published DEMO invoice is illustrative contributor work with real on-chain approval.

The source and app are public. Browser code contains addresses, ABIs and a free RPC URL, never a signing key or KeeperHub API key. Owner actions use an injected wallet and require Sepolia, the configured owner and a one-owner Safe threshold. A read-only visitor cannot sign for that owner. The app checks deployed code hashes, its deployment block hash and actual receipt events.

## Addresses

- Safe: `0xB807E723343221736A4831B6995fCA9628D184E5`
- Payroom module: `0x0152Dd3602b0485A3cC00450Cb559B6d2190EFa5`
- Test token: `0x8AE2D92B36D5Bf9966A6A274555AcB9944541E43`
- KeeperHub sender: `0xf0135C32368Cee89df899b259C54B530870Ca89b`

Deployment receipts and code hashes are in [sepolia-deployment.json](sepolia-deployment.json). Both the module and test token passed Sourcify verification. No paid explorer key was used.

Safe's canonical 1.4.1 singleton was checked against its [official deployment registry](https://github.com/safe-global/safe-deployments/blob/main/src/assets/v1.4.1/safe.json). The checked registry snapshot is included here. The first proxy was initialized and its owner verified before funding it with pUSD. The deployment script now creates future proxies through Safe's canonical factory with initialization in the same transaction; it only reconciles the already completed first deployment through its old journal entries. An incomplete prior setup stops for inspection.

## Owner and keeper checks

[public-owner-check.json](public-owner-check.json) contains three actual Sepolia transactions: approval, pause and resume. They used the public app's EIP-1193 code path with an encrypted project wallet bridge. This exercises real signing and receipt verification, but does not prove a particular browser extension's popup behavior.

The demonstration invoice remains approved and unpaid until KeeperHub executes it. **Check payment** only reads chain state. It never impersonates KeeperHub or sends a payment from the owner. The sponsor key stays in the local credential store. Live API access currently waits on the account holder's email and authenticator confirmation.

## Build

```sh
npm ci --ignore-scripts
forge build
node scripts/build-public.mjs
```

Use Node 24+. `dist` is a static GitHub Pages artifact. `public-app/config.json` binds it to this deployment. A separate local browser store keeps drafts and the pending transaction journal. Web Locks serialize access across tabs. A lost wallet response blocks new writes until the exact sender/nonce/target/calldata receipt is reconciled. Do not clear browser storage to retry an unknown send.

The local app remains available with `./payroom start`. Never expose its unlocked Anvil RPC or owner service publicly. Sepolia deployment scripts use encrypted keystores with their passwords in macOS Keychain and save signed transaction bytes only in ignored `.local` journals for exact replay.

## Current limits

KeeperHub execution and its final video are still pending. The host computer must be available for a future local keeper runner. Main-track acceptance of this new testnet integration into the existing Safe protocol is unconfirmed. The public RPC can be slow or unavailable; an unavailable check must not be treated as a payment. The history scan is bounded to 200,000 blocks for this release. Token controls are intended only for the included test token.
