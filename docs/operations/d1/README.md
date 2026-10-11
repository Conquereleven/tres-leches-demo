# D1 — Operations V2

## Baseline and reuse

Base: origin/main `e2a82387549d5861e110178d6b9c8b8ae7f84f10`.
Isolated branch: `feature/3l-operations-dashboard-v2`.
Preserved canonical working tree (4bd4cbe), existing worktrees, Conchas uncommitted work and stash.
Open PR baselines inspected: #6 `14484ab0eef21c64732ea744c31eb3f6761839c3`, #7 `b65be4915327f74ef54325bf7793bc15f54596da`, #8 `bda10c35ee33f042e412b656b4f16b79c548b9ea`. None incorporated.

Reused before extending the UI:
- OperationsShell: sidebar collapse, keyboard-safe native mobile dialog, history navigation, logout, authenticated actor and staging-only diagnostics.
- Workspace: authoritative polling snapshot, command version/idempotency handling, assignments, multi-number inbox, linked OrderPanel, agent Copilot/human takeover, notifications, zones and diagnostics.
- OrdersBoard + orders-board: paid production queue, due ordering, filtering, validated next-action commands and permissions. Only presentation and search changed.
- API types, Node/SQLite/auth, domain workflow and commercial calculations remain unchanged.

## Navigation and completeness

| Screen | Implementation | Authority / limitation |
|---|---|---|
| Overview | Snapshot metrics, recent activity and warnings | Counts existing orders/jobs; no estimated revenue |
| Orders | Search reference/customer/product, filters, paid queue, payment badges, quantities, dates, detail and actions | Existing transition and ownership commands |
| Kitchen | Confirmed/Production/Ready queue, quantities, date, instructions, pickup/delivery | Same OrderCard and existing server workflow |
| Deliveries | Ready/Out for Delivery/Delivered queue | Existing rules and server state |
| Inbox | Assignment, unread/status/source filters, search, sending, linked orders, Copilot | Existing canonical inbox and concurrency safeguards |
| Products | Honest unavailable/restricted state | No PR #7 editor or API integration |
| Print Center | Known models and permitted order ticket previews | No communication or print jobs |
| Settings | Read-only role and preference explanation | Admin/manager only; no settings mutation |
| Delivery areas | Existing approved zone editor | Writes remain admin-only on server |
| Diagnostics / UAT | Existing checks/knowledge editor | Admin in staging only |

Overview manual-address warnings and uncertain payment warnings are counted separately; attention excludes Delivered/Cancelled. Confirmed payments are explicitly labeled payments, not accounting revenue. Customer-provided instructions, product names, messages and historical audit contents stay verbatim.

## EN / TL

Independent i18next instance in `ops-i18n.tsx`, resources under `src/commerce/locales/`.
English default. Tagalog/Filipino selected in header. Browser preference is keyed to authenticated user ID; no cross-device synchronization. Dates use Asia/Dubai with en-GB / fil-PH formats. Stable states, API identifiers, role values and database enums are not translated; presentation labels are.

Navigation, headings, filters, actions, empty states, accessibility labels and built-in errors are localized. Unknown server errors show a localized recoverable error. Technical provider codes, diagnostic evidence, approved customer knowledge (EN/ES), message bodies, audit actions and commercial names remain source data; they are not silently rewritten. Public EN/ES/AR and notification language are unchanged. Automated resource parity and interpolation coverage cover every literal `t()` key in the six admin components.

## Print foundation

Reception: Epson TM-T20II M267D. Kitchen: Epson TM-T20II M267E.
Both show **Printer connection not configured**. These are known model targets, not registrations or online devices. Preview reads only the permitted workspace snapshot. No POST, job history, successful print/reprint controls, Windows agent, IP transport, PrintNode, Epson installation or mock print service.

`print-contract.ts` defines future registration, destination, health, job/retry/reprint metadata. Actual capabilities are deferred until Windows connectivity is verified and server authorization is designed. Future kitchen tickets should omit customer contact details; current previews already do so.

## Compatibility and safety

PR #7 can replace ProductsAvailability after integration; no unfinished API has been connected. It will require localization and review of roles in this shell. PR #8 remains independent: all added style rules use `.commerce.ops-shell`, without changing global or public brand tokens. Shared source files may require ordinary conflict review; no automatic incorporation assumed.

No changes to server/, shared commerce policy, catalog, delivery rules, Paymennt, Meta, customer checkout, credentials, dependencies or production data/configuration. No merge or deploy.

## QA

Results and commands: [qa.md](qa.md). EN/TL screenshots for each major screen at 390/768/1440 are in [screenshots](screenshots/). All screenshot data is fictitious and all browser/payment tests use local mocks/temporary databases.
