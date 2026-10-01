# Paymennt web checkout — TEST

The 218 UI option IDs and prices already match the approved import exactly. The availability defect came from also requiring payment activation (`config.enabled`) to add an available server catalog product to the cart. Menu matching and AddToCart now use the server's active/available product list; payment remains fail-closed independently. No SKU or price is rewritten or duplicated.

Customer flow: product → cart → validated delivery/customer/billing → POST /api/checkout/web → backend POST https://api.test.paymennt.com/mer/v2.0/checkout/web → validated TEST redirectUrl → /checkout/return → POST /api/checkout/reconcile → authoritative GET /checkout/{stored checkoutId}.

The backend uses the existing payment outbox, durable reservation, unique payment requestId, validated AED prices, quote and billing mapping. Before the network call it commits `checkoutFlow=web`, the trusted returnUrl and the processing lease. No blind POST retries; lost responses are recovered by requestId lookup followed by GET. Creation never marks Paid. Existing reconciliation verifies checkout ID/requestId/orderId/amount/currency; Paid creates ORDER_PAID once. Pending/Authorized stay unpaid; Failed/Cancelled/Expired and refund states retain the established domain rules.

Return URL is derived only from server APP_ORIGIN. TEST must use its isolated Railway HTTPS hostname. A future approved Production activation uses APP_ORIGIN=https://www.3ldubai.ae, producing https://www.3ldubai.ae/checkout/return. LIVE remains blocked. Query parameters never determine payment status.

Sanitized example (fictional UAT; server computes all amounts):

```json
{
  "requestId": "example-payment-id",
  "orderId": "example-order-id",
  "currency": "AED",
  "amount": 66,
  "items": [
    {
      "sku": "pan-de-muerto-traditional-azucar-mini-40-g",
      "name": "Pan de Muerto tradicional · Azúcar · Mini · 40 g",
      "quantity": 6,
      "unitprice": 11,
      "linetotal": 66
    }
  ],
  "totals": { "subtotal": 66, "tax": 0, "shipping": 0 },
  "customer": {
    "firstName": "UAT",
    "lastName": "Reviewer",
    "email": "uat@example.invalid",
    "phone": "+971500000000"
  },
  "billingAddress": {
    "name": "UAT Reviewer",
    "address1": "UAT Tower, UAT address only",
    "city": "Dubai",
    "country": "AE"
  },
  "deliveryAddress": {
    "name": "UAT Reviewer",
    "address1": "UAT Tower, UAT address only",
    "city": "Dubai",
    "country": "AE"
  },
  "returnUrl": "https://tres-leches-pasteleria-demo-paymennt-test.up.railway.app/checkout/return"
}
```

Official contract: https://docs.paymennt.com/openapi/paymennt.yaml, CheckoutWebPaymentRequest. Authentication stays on the server in existing environment secrets. A browser public key is unnecessary for web checkout.

Rollback: restore the preceding code release in TEST after review. Existing embedded adapter/routes and frozen direct records are preserved; reconciliation continues selecting the original payment API for records with directAttempt/transactionId. No frozen record is migrated. Do not enable Meta outbound or change Production credentials.

Local automated tests stub Paymennt; no card data or real provider charges. Real TEST UAT may create one unpaid hosted checkout and inspect its redirect/GET state; entering a card or completing any charge requires separate approval.
