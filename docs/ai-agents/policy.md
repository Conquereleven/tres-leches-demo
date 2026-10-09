# AI operating policy

Default: copilot. `AI_AUTONOMOUS_ALLOWED=false`. No unrestricted autonomy exists.

| Mode | Behavior |
| --- | --- |
| copilot | Private proposal; human approves or edits before sending. |
| supervised_auto | Only high-confidence greeting, approved FAQ or location request can send automatically while AI_ACTIVE. Commercial actions still need approval. |
| autonomous_bounded | Explicit configuration permission required; currently retains the same conservative response/action bounds. |

Mandatory handoff: low confidence/unknown intent, human request, complaint, refund, cancellation, custom quotation, unavailable catalog/FAQ, unresolved delivery or failed eligibility, inconsistent payment/proof requiring reconciliation, provider/schema/tool failure, loop limits or policy violation. Human-active and paused conversations cannot auto-send. Manual private copilot generation remains available.

Tools are strict and conversation-scoped: catalog search/product lookup, current order, draft/add/remove proposals, customer-supplied address proposal, zone/eligibility read, payment-status read, payment-request preparation, approved FAQ and handoff. No SQL, user administration, zone editing, secrets, raw provider requests, refund, paid-state mutation or price override is exposed. Prompt-injection detection adds defense; authorization and allowlisted domain commands do not depend on detecting every phrase.

Business facts come only from active imported catalog, configured delivery rules, domain payment state or administrator-approved FAQ. Unknown facts remain unknown. Empty catalogs prevent product/order tools, while greetings and available approved FAQ remain possible. Availability means active catalog listing, not a promise of stock or a delivery date.

Custom cakes always require human quotation. The system stores the original bounded enquiry and explicitly extractable occasion, ISO date, servings and labelled theme/preferences/requirements. Unprovided or ambiguous values remain absent for the operator to collect; no inferred price, feasibility, deadline or allergy guarantee is offered.

Allergen, storage, opening-hours, lead-time and cancellation policies begin unconfigured. An administrator must approve each language-specific answer. Unapproved content cannot be used for customer answers. Editing knowledge or commerce facts invalidates stale proposals.
