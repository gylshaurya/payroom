# Payroom asset manifest

Independent media review of composition A in `.impeccable/mocks/compositions.png`, checked against `PRODUCT.md`. Composition A is the approved structural reference under the user's delegated design choice: a narrow dark navigation rail, dense invoice register, and adjacent selected-invoice inspector. The mock is a design reference, not evidence or a source of product data.

## Inventory

| Visible ingredient | Implementation medium | Required treatment |
| --- | --- | --- |
| Payroom wordmark | Semantic text with CSS | Use the product name in the interface font. No logo image needed. |
| Left navigation and workspace context | Semantic `nav`, links and buttons with CSS | Preserve the dark indigo rail and compact vertical rhythm. Only show destinations with implemented behavior. Workspace identity must come from configuration or be clearly labelled demo context. |
| Invoice, payment, recipient, approval, activity and settings symbols | Inline SVG icons | Small consistent stroke icons, approximately 16–20 px, aligned with labels. Use only icons for implemented destinations. Decorative icons are hidden from assistive technology; icon-only controls need accessible names. |
| Main title and type hierarchy | Self-hosted Manrope WOFF2 plus semantic headings | Normal-width geometric sans, not condensed. Use regular/medium body text and semibold headings. Keep the page title visibly above section labels, with compact tabular amounts. Load the font locally and retain its license. A font file is required; no text is rasterized. |
| Status tabs and counts | Semantic buttons or a correctly implemented tab pattern with CSS | Compact adjacent filters with a clear selected state. Counts derive from the invoice records. |
| Search and filters | Native input and semantic buttons; inline SVG search/filter icons | Preserve their quiet placement above the register. Input and filter controls need visible or accessible labels and working behavior. |
| Invoice register | Semantic table with CSS | Dense rows, subtle horizontal dividers, right-aligned amounts and one selected row. Preserve the register as the main work area. Use actual records or explicitly labelled local fixtures, never the mock's names, dates or values as claimed facts. |
| Selected-row emphasis | CSS | Pale indigo selection fill, slim strong indigo leading rule, restrained border. No bitmap, mask or texture required. |
| Draft, approved, pending and paid states | Semantic text with CSS badges | Small tinted labels with readable contrast. State must be backed by application and receipt evidence. Color supplements words. |
| Selected invoice inspector | Semantic `aside` or labelled section with CSS | White detail panel adjacent to the register on desktop, section headings, hairline separators and compact metadata pairs. Adapt to a focused mobile detail view without losing context. |
| Recipient address and copy control | Text, semantic button and inline SVG copy icon | Show a short address in dense contexts and make the full address available. Copy the actual full value and confirm the result accessibly. |
| Inspector close, chevrons and new-item plus | Semantic buttons with inline SVG | Simple exact vector geometry. Preserve keyboard focus visibility and useful hit areas. |
| Primary action, New invoice | Semantic button with CSS and inline SVG plus | Compact dark indigo rectangle with a small corner radius; no physical material effect appears in the comp. Its form must be functional. |
| Approval, execution and reconciliation actions | Semantic buttons with CSS | Place actions beside invoice detail and receipt state. Translate mock actions into the supported exact-approval and payment workflow. A manual “Mark as paid” affordance must not substitute for verified contract receipts. |
| Receipt details and links | Semantic text and anchors with CSS | Receipt status is selectable text, and transaction links identify the actual network. Missing or interrupted execution remains explicit until reconciled. |
| Network indicator | Semantic status text with CSS dot; button only if interactive | Clearly distinguish local Anvil from Sepolia testnet. Do not use a green dot to imply live KeeperHub connectivity without evidence. |
| User identity circle | CSS initials, if an actual identity exists | No portrait is required. Omit unconfigured personal identity instead of copying the mock's fictional name, initials or email. |
| Borders, panel seams and surfaces | CSS | Restrained small radii, fine cool-grey rules, flat white work surfaces and dark indigo navigation. No shadows or decorative effects are needed to create physical depth. |

## Production result

**No image-native asset is needed.** The approved composition contains no photograph, illustration, physical object, material texture, or detailed scene. Its principal elements are precise geometry, typography, controls and data. Do not crop or embed the mock as interface content, and do not generate decorative media.

The raster production bucket is empty. Required implementation assets are the self-hosted Manrope font with its license and the small inline SVG control icons listed above. This manifest specifies these assets; it does not claim their files have already been installed or verified. No new font, raster, icon or source-code files were produced as part of this independent review.
