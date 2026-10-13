# Review: fulfilment actions on orders with incomplete or unverified addresses

Scope: what the UI and the backend do today. **No state-machine or backend change is made in TL-OMS-01.** Safeguards at the end are proposals awaiting a decision.

## Findings

1. **The backend does not check the address on any transition.** `transition` in `server/domain/service.ts` requires a paid payment before Production, Ready, Out for Delivery and Delivered, and blocks payment-owned states. `server/domain/workflow.ts` only validates the state path and the pickup shortcut. An order can go Ready → Out for Delivery → Delivered with an empty street or building and without verification.
2. **This is existing behaviour, not introduced here.** On `main` (`5aaa33d`) the order card already rendered "Address incomplete · Review address before dispatch" and "ADDRESS NOT VERIFIED" as text while offering the same "Send for delivery" button (`src/commerce/OrdersBoard.tsx`, PR #19). The warnings were advisory then and are advisory now.
3. **"Unverified" is the normal case, not an exception.** `addressVerification` becomes `VERIFIED` only through the website checkout when Google address mode is active (`server/domain/web-checkout.ts`, `deliveryAddressMode === "google"`). Orders built over WhatsApp, and website orders in the other address mode, are `UNVERIFIED` or carry no value. A hard block on "unverified" would stop most deliveries.
4. **"Incomplete" should be rare for website orders.** Website checkout requires street and building. Incomplete addresses come from WhatsApp-built orders (free-text address or a GPS pin) and from historical records.
5. **Pickup orders are exempt** everywhere (no address required, no warning).

## What the order page does now (UI only)

- The Delivery card keeps both warnings from the address hotfix, unchanged in wording.
- New in the refinement pass: when the next available step is **Send for delivery** and the address is incomplete or unverified, the same warning is repeated directly beside the button. On mobile the Delivery card is far below the action, so the operator previously could dispatch without seeing it.
- The button stays enabled. Disabling it in the UI alone would be a business rule living only in the browser, bypassable from the Kitchen and Deliveries cards and from the API.
- Earlier steps (Start preparation, Mark ready) show no dispatch warning: preparing food does not depend on the address.

Covered by `tests/operations-e2e/oms.spec.ts` ("address problems are stated beside the dispatch action…").

## Proposed safeguards (not implemented; each needs approval)

| #   | Proposal                                                                                 | Where                                                      | Effect                                               | Note                                                                                |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Refuse Ready → Out for Delivery when street or building is missing on a delivery order   | Backend, in the `transition` command (not the state table) | Hard stop for clearly undeliverable orders           | Needs a way to complete the address first; today paid orders cannot be edited       |
| 2   | Add an "address confirmed by operator" action recording who confirmed and when           | Backend command + one stored field                         | Gives unverified addresses an auditable manual check | Schema/contract change: out of scope without approval                               |
| 3   | Require an explicit confirmation step in the UI before dispatching an unverified address | Frontend                                                   | Friction at the risky moment, no backend change      | Weakest option; must also be added to Kitchen and Deliveries cards to be consistent |
| 4   | Apply the same beside-the-button warning on the Kitchen and Deliveries cards             | Frontend                                                   | Consistency with the order page                      | Small; left out to keep this pass within its scope                                  |

Recommended order if approved: 4 (cheap, consistent), then 1 together with 2 so a blocked order has a way forward.
