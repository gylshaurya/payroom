# Payroom

Payroom is an invoice desk for small protocol teams paying recurring contributors from one Safe. The owner approves an exact recipient, token, amount and invoice once. A KeeperHub wallet can then execute the payment within contract limits. Receipts stay with the invoice, including recovery after an interrupted run.

## Confirmed context

- Platform: web, desktop first with a complete mobile layout.
- User selected the exact Payroom idea. Stack and design choices are delegated; do not repeat a design interview.
- Testnet demonstration only, Sepolia, test tokens, no real funds. Local Anvil is the reproducible development environment and must be clearly labelled.
- One Safe, recipient and token allowlists, per-invoice nonce, daily cap, pause and receipt reconciliation.
- KeeperHub's Safe plugin is read-only. Writes need its documented Web3 contract-call path. A prepared adapter is not evidence of a live KeeperHub execution.
- Use plain explanatory English, no em dashes, no sales claims, no routine AI branding. Preserve required provenance and licenses.
- Zero additional spend. A working local build cannot clear live account, eligibility or final submission checks.

## Design decisions delegated to the builder

Assumed use scene: a team operator reviewing several contributor invoices on a laptop in normal daylight, then checking receipts from a phone. Prioritize exact money, recipient, approval and pending states. Use a compact list with an adjacent invoice detail, not a marketing page or wallet-value dashboard. Self-host the interface font. Keep long addresses and receipts accessible without letting them dominate the invoice list.

## Candidate visual systems before the direction roll

The category rut is a crypto dashboard with balance tiles; its predictable opposite is an editorial paper ledger. Neither is a candidate.

1. Studio production board: blue-grey work surface, ordered job slips, shared due-date lane.
2. Shipping dispatch console: light steel surfaces, compact dispatch rows, one exact destination sheet.
3. University lab booking system: pale lavender fields, reservation list and precise policy sidebar.
4. Transit service control: white route strips, plum navigation, clear status vocabulary.
5. Engineering change register: indexed requests, white and cool graphite, paired approval and receipt panels.
6. Community workshop tool checkout: blue-green stock board, clear handover record and return-proof strip.
7. Broadcast running order: time-led list, indigo framing and selected item inspector.

The list spans production rituals, civic interfaces, technical records and shared physical facilities. Every direction keeps task controls familiar.
