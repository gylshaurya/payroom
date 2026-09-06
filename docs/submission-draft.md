# Payroom submission draft

Status: preparation only. Do not submit this version. The required transaction through KeeperHub and final integration video are still missing.

## Name and short description

**Payroom**

An invoice desk for Safe teams. Approve a contributor payment once, let a keeper run it within clear limits, and keep the chain receipt with the invoice.

## Which project did you integrate with?

Payroom integrates with Safe 1.4.1. A small team can approve the exact recipient, token, amount and due time for an invoice. The Payroom module holds those terms on chain. Its keeper can execute the approved payment, but it cannot change the invoice or make an unrelated Safe transfer.

The main-track requirement refers to an existing live project. Safe is the existing protocol used here. Whether this new testnet integration meets the organizer's intended interpretation is still unconfirmed.

## What does it do?

Small teams often keep contributor requests in one place and payment receipts somewhere else. Payroom puts the request, approval, limits and receipt together. A retry does not become a second payment because an invoice can move to paid only once.

The Safe owner controls recipient and token permissions, the daily cap and pause. Those controls are checked when the keeper executes, including for invoices approved earlier. A failed transfer leaves the invoice unpaid and restores its spending allowance.

## KeeperHub surfaces

Prepared: direct contract-call API, dry-run simulation, stable idempotency key, execution-status lookup and a manual workflow export using Web3 write-contract. The intended action is `execute(invoiceId)` on the Safe module.

Current proof: local real Safe transactions and tested API request construction. A live KeeperHub execution has not yet been recorded. Replace this paragraph with the exact surfaces actually used and the verified transaction link after the release run.

## Testnet or mainnet?

The current complete workspace runs on local Anvil, chain 31337. Sepolia, chain 11155111, is the planned public release. It uses fixed-supply pUSD test tokens with no value. No mainnet funds are used.

## What works?

Invoice creation and validation, immutable Safe approvals, due time, cancellation, recipient/token controls, a UTC daily limit, pause, payment receipts, restart recovery and JSON export. The UI works on desktop and phone screens and supports keyboard use.

Sixteen contract tests pass, including 256 fuzz cases. Eleven integration tests pass, including three concurrent requests producing one payment and a lost response recovered without another send. These are local test results, not an external audit.

## What is unfinished?

Live KeeperHub execution, Sepolia publication, the final integration video and its required transaction link. The current local service is not a public authenticated backend. The test token has simple transfer behavior; fee-on-transfer and rebasing assets are unsupported. An unknown send with no hash and no matching transaction still needs careful operator reconciliation.

## Links and contact

- Source: https://github.com/gylshaurya/payroom
- Public product: pending deployment and verification.
- Short video showing KeeperHub working: pending recording after live execution.
- Transaction executed through KeeperHub: pending.
- Contact: reuse the saved DoraHacks profile and the user's confirmed contact details. Never invent an X or Discord handle.

The final package must replace every pending field with evidence or a candid limit, satisfy the event's required deliverables and receive the user's exact submission approval.
