# Approved delivery and pickup rules — October 2026

The approved table defines 93 active zones: AED30 (17), AED50 (18), AED100 (11), AED150 (16), AED200 (9), AED250 (2), AED300 (20). Every supported zone has fee AED0 and freeDelivery=true. Palm Shoreline/Golden Mile and West/East Crescent are separate choices. IMPZ/Dubai Production City is one logical zone. Existing IDs and useful aliases are retained.

The server prices every line from the approved catalog and rejects delivery checkout below its zone minimum. Pickup has no zone, delivery address or zone minimum; it still requires available products, customer name/UAE mobile/email, pickupDate/preferredTime and a real billing address. Both fulfillment totals equal the items subtotal. No store address is substituted as customer billing.

Orders persist fulfillmentMethod=delivery|pickup. Delivery retains its existing date/slot/address/zone shape. Pickup persists pickup={pickupDate,preferredTime}; zone and delivery address remain absent. Legacy orders without the field remain delivery. Public pickup address comes from src/brand/business.ts. Operations dates, badges and detail panels distinguish pickup; Ready → Delivered confirms collection, while delivery keeps Ready → Out for Delivery → Delivered. Payment confirmation guards remain intact.

Hosted POST /checkout/web, provider ID persistence, return capability, authoritative GET reconciliation and duplicate guards are preserved. Official CheckoutWebPaymentRequest requires billingAddress, but deliveryAddress is optional: pickup omits it. Legacy token/debit adapter behavior is unchanged. No real provider calls are needed for validation.

## Safe database update

server/domain/delivery-rules.ts takes an integrity-checked private SQLite backup before updating zones and one idempotency marker in events. Catalog, orders, payments, conversations, jobs, audit and command history are untouched. Historical combined Palm IDs remain inactive for historical references. New rule versions do not rewrite frozen order quotes.

Startup activates the migration only for staging, after the normal backup. Production is deliberately excluded. After TEST review and explicit Production approval, Production requires its own backed-up rule application; deploying code alone does not apply this migration there. Do not copy the TEST database or credentials into Production.

Validation: tests/commerce/delivery-pickup.test.ts covers all seven threshold pairs, aliases, pickup validation and backup/idempotency/history preservation. paymennt-web.test.ts covers pickup hosted requests using an in-process provider mock. Browser tests at 390/1440 verify choices, fields, billing, totals and console errors without submitting payment.
