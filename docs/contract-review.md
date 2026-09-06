# Payment control review

The owner decides who may receive funds, which test token may move and how much may move each UTC day. The keeper can execute only an existing approval. It cannot choose a new recipient or amount, change permissions, enable a different module or make a general Safe call.

Approvals are immutable. An invoice ID cannot be approved again after payment or cancellation. Each invoice includes its exact recipient, token, amount and earliest payment time. The contract checks the current permissions again at execution, so revoking a recipient or setting the token cap to zero blocks old approvals too.

Spending is cumulative per token and UTC day. Updating a cap does not clear recorded spending. If a lower cap falls below the amount already spent, more payments wait until the limit is raised or the next UTC day begins. UTC midnight is a calendar boundary, not a rolling 24-hour limit.

## Tested behavior

`forge test -vv` exercises 16 cases against a real Safe 1.4.1 proxy. One case runs 256 fuzz inputs and checks recipient balance, Safe balance and recorded spending for each exact amount. Other cases cover combined invoice limits, UTC boundaries, due time, owner access through the Safe, keeper rotation, permission revocation, cancellation and duplicate execution.

Three hostile-token cases return false, revert or return malformed bytes. Each failure keeps the invoice approved and restores the spending counter. A fourth attempts to reenter another invoice while acting as keeper; the lock rejects it and the second invoice stays unpaid. These test tokens are never used by the app.

The Node integration suite separately uses Safe's published deployment bytecode and a local Anvil chain. Three concurrent requests for the same invoice produce one payment. Lost broadcast responses are recovered by exact sender, nonce and calldata without another send.

## Boundaries

These tests are local evidence, not an external security audit or a proof of public sponsor execution. The app supports only the included fixed-supply test token. A malicious token can report success without transferring value; allowlisting a token therefore trusts its behavior. Fee-on-transfer and rebasing tokens are unsupported.

The owner has authority over the Safe itself and can disable the module or move its funds. A daily cap restricts this module, not the owner's other Safe transactions. The demonstration Safe has one owner; a production organization would need its own signing policy and review.

There is no arbitrary delegatecall or token allowance in Payroom. Module execution has zero native value and calls only the approved token's transfer function. The keeper still needs testnet gas unless its provider sponsors that network.
