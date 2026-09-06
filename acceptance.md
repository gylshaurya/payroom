# Acceptance and milestones

## Payments milestone

1. Create an invoice with title, recipient, test-token amount and due time. Invalid addresses, zero/negative/excess decimal amounts and duplicate references are rejected.
2. A real Safe owner transaction approves immutable payment terms. An executor cannot alter them.
3. Only the selected executor can pay. Token and recipient allowlists, daily cap, due time and pause are checked on chain at execution.
4. Concurrent duplicate execution attempts produce one token transfer. Invoice IDs cannot be reused after payment or cancellation.
5. Persist operation intent before sending. Unknown transaction outcomes block further writes until receipt reconciliation. Restart preserves invoices and pending operations.
6. The invoice shows its chain state and actual transaction receipt. Failed Safe inner calls are not successful approvals.
7. KeeperHub adapter uses its documented contract-call and idempotency schema. Never infer settlement from HTTP success. Live account execution is a separate pending milestone.
8. Browser workflow, keyboard use and narrow-screen layout work; local sample data is clearly labelled. Export real invoice/receipt records.

## Later scoped milestones

- Limits: adversarial contract review, cap boundary, cancellation, reentrancy and concurrency tests.
- Guide: complete setup, sponsor workflow instructions, submission text and caption storyboard.
- Local review: rerun the whole journey and independent quality/security pass.
- Public release: verify free KeeperHub allowance, Sepolia wallets and Safe, actual KeeperHub execution and explorer evidence, public hosting and final recorded demo. Do not mark live before proof.
- Final submission requires the user's approval of the exact package.

## Build sequence

First implement Safe module and durable journal, test real local transactions, then build and review the invoice desk. Commit each completed tested milestone with actual current timestamps. Preserve limitations in the report.
