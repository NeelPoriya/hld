---
title: "Stripe"
description: "Stripe is the payments / billing / subscriptions / marketplace / tax / fraud platform — a developer-first API for charging cards, sending payouts, billing subscriptions, computing tax, fighting fraud, and orchestrating two-sided marketplaces."
---

> Category: Payments & Billing · Provider: Stripe · License: Proprietary (managed)

## TL;DR
Stripe is the **default global payments platform** for internet businesses. It exposes a coherent REST API around a small number of objects (**Customer**, **PaymentIntent**, **Subscription**, **Invoice**, **Account**) and layers a sprawling product suite on top: **Payments** (cards + wallets + bank debits + buy-now-pay-later in 100+ currencies), **Billing** (recurring subscriptions, prorations, metered billing, dunning), **Connect** (marketplaces / platforms with split payments + payouts), **Radar** (ML-based fraud), **Tax** (sales-tax / VAT / GST computation), **Identity** (KYC), **Issuing** (program-managed virtual / physical cards), **Climate**, **Atlas**. Front-end PCI burden is removed with **Stripe Elements / Checkout / Payment Links** — the card data never touches your servers. Reach for Stripe when you need to **start charging in a week, scale globally, and offload PCI / 3DS2 / SCA / dunning / tax** without building any of it.

## What problem does it solve?
- **PCI compliance is brutal** — Stripe Elements/Checkout offload card collection from your servers (PCI SAQ A).
- **3D Secure 2 / SCA / regulatory friction** in EU, India, Brazil, etc. — Stripe handles regional requirements.
- **Subscriptions are a tax / proration nightmare** — Billing handles upgrades, downgrades, dunning, retries.
- **Marketplaces need split payments + KYC + payouts** — Connect handles all of it.
- **Fraud / chargebacks** — Radar ML model + 3DS challenge tuning.
- **Tax** is jurisdiction-by-jurisdiction; Stripe Tax computes it from address.

## When to use
- **SaaS billing** with subscriptions, trials, plans, metered.
- **E-commerce** with cards + wallets (Apple/Google Pay) + BNPL.
- **Marketplaces / platforms** with on-platform sellers.
- **Global reach** — 135+ currencies, 50+ countries.
- **Need PCI offload** — never see PAN.
- **Modern dev experience** — strong API, idempotency keys, webhooks, test mode.

## When NOT to use
- **High-risk verticals** banned by Stripe (gambling, regulated firearms, certain crypto, adult).
- **Cost-sensitive at huge volume** — interchange-plus often beats Stripe's flat 2.9%+30¢.
- **Single-country domestic-rail-only** (e.g., India UPI-only) — local PSP may be cheaper.
- **Need Merchant of Record** (Stripe is payment processor, not MoR — use Paddle / Lemon Squeezy / Outseta).
- **Crypto-only checkout** — use Coinbase Commerce / BitPay.
- **Strict on-prem / sovereignty** requirements.

## Core Concepts
- **Customer** — long-lived buyer; holds default payment methods, addresses, tax IDs.
- **PaymentMethod** — tokenized card / bank / wallet attached to Customer.
- **PaymentIntent** — server-driven flow object: `requires_payment_method` → `requires_confirmation` → `requires_action` (3DS) → `succeeded` / `requires_capture`. Replaces older `Charge`.
- **SetupIntent** — save a card without charging (subscriptions, deferred payments).
- **Idempotency key** — header `Idempotency-Key`; safe retries.
- **Webhook event** — async notification (`payment_intent.succeeded`, `charge.refunded`, `invoice.payment_failed`). Verify signature.
- **Product / Price** — Stripe Billing primitives. Price has `interval`, `tiers`, metering.
- **Subscription** — Customer + Price(s); generates Invoices; handles proration on changes.
- **Invoice** — itemized bill; auto-charged or sent.
- **Connect Account** — `standard` (Stripe-managed onboarding), `express`, or `custom` (you onboard).
- **Application fee** — platform's cut on Connect charges.
- **Radar rules** — fraud rules (block / 3DS / review).
- **Tax registration** — per-jurisdiction registration; Stripe Tax auto-files where you're registered.
- **3D Secure 2** — strong customer auth challenge for EU PSD2.

```javascript
// Server: create a PaymentIntent (Node.js)
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const intent = await stripe.paymentIntents.create({
  amount: 4999,                    // cents
  currency: "usd",
  customer: customerId,
  automatic_payment_methods: { enabled: true },
  metadata: { order_id: "ord_123" }
}, {
  idempotencyKey: "ord_123"
});

return Response.json({ client_secret: intent.client_secret });
```

```javascript
// Browser: collect card via Stripe Elements + confirm
import { loadStripe } from "@stripe/stripe-js";
const stripe = await loadStripe("pk_live_...");

const { error } = await stripe.confirmPayment({
  elements,                         // Stripe Elements instance
  confirmParams: { return_url: "https://acme.com/order/success" }
});
// On 3DS challenge, Stripe redirects to issuer + back to return_url.
```

```javascript
// Webhook handler (verify signature, idempotent processing)
import { headers } from "next/headers";

export async function POST(req) {
  const sig = headers().get("stripe-signature");
  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Bad sig: ${err.message}`, { status: 400 });
  }

  // Idempotent: store event.id in your DB; if already-processed, return 200
  if (await alreadyProcessed(event.id)) return new Response("ok", { status: 200 });

  switch (event.type) {
    case "payment_intent.succeeded": await fulfillOrder(event.data.object); break;
    case "invoice.payment_failed":   await emailDunning(event.data.object); break;
  }
  await markProcessed(event.id);
  return new Response("ok", { status: 200 });
}
```

```javascript
// Subscriptions: upgrade with proration
const sub = await stripe.subscriptions.update(subId, {
  items: [{ id: itemId, price: "price_pro_monthly" }],
  proration_behavior: "create_prorations"
});
```

## Architecture (Conceptual)
- **API gateway** — `api.stripe.com` REST + SDKs (Node, Python, Go, Java, Ruby, PHP, .NET).
- **Workers + ledger** — every charge is a ledger entry; reconciled to bank rails.
- **Webhook delivery** — at-least-once; signed; retried with exponential backoff.
- **Card networks** — Stripe acts as acquirer/processor across Visa, Mastercard, Amex, etc.
- **Local rails** — SEPA, ACH, BACS, FPS, UPI integrations.
- **Radar** — ML model trained on Stripe-wide fraud signal.
- **Tax engine** — address-based jurisdiction lookup; rate tables.
- **Billing engine** — generates invoices on schedule; runs proration math; dunning on failed charges (smart retries).

## Trade-offs

| Strength | Weakness |
|---|---|
| Best-in-class developer experience | Premium pricing — 2.9% + 30¢ standard |
| 100+ currencies, 50+ countries | Banned high-risk verticals |
| Elements / Checkout = PCI offload | You're on the hook for tax remittance (not MoR) |
| Subscriptions + dunning + tax bundled | Vendor lock-in; data export possible but plumbing |
| Connect for marketplaces (KYC, payouts) | Connect onboarding adds friction for sellers |
| Radar fraud out of the box | Subscription edge cases (proration, schedules) get complex |
| Strong test mode + observability | EU SCA / 3DS adds checkout friction (mandated) |
| Webhooks + idempotency keys | Fee structure adds international + currency conversion costs |

## Common HLD Patterns
- **One-time card payment** — server creates PaymentIntent → client confirms via Elements → webhook fulfills order. Idempotency on order ID.
- **Subscription billing** — Customer + SetupIntent (save card) → Subscription on Price → invoice each period → webhook updates entitlement.
- **Metered billing** — report usage via `subscription_item.usage_records.create`; Stripe invoices on tier formula.
- **Marketplace (Connect)** — Connect Express onboarding → `transfer_data.destination` on PaymentIntent → `application_fee_amount` is platform cut → automatic payout to seller bank.
- **Customer Portal** — Stripe-hosted portal lets users manage payment methods + cancel.
- **3DS / SCA flow** — `requires_action` status; client handles redirect / iframe; webhook on success.
- **Refund / partial refund** — `refunds.create` referencing `payment_intent`; emit refund webhook.
- **Dunning** — Smart Retries + Recovery emails configured in dashboard.
- **Sales tax** — Stripe Tax + customer address + product tax codes.

## Common Pitfalls / Gotchas
- **Webhook idempotency** — duplicate deliveries are normal; key on `event.id`.
- **Webhook signature verification** — must verify; otherwise attackers forge events.
- **Race condition** — order fulfillment from API success vs webhook; pick one (usually webhook).
- **Strong Customer Auth (SCA)** — EU cards may force 3DS; build the redirect path.
- **Saving cards** — use SetupIntent or set `setup_future_usage: 'off_session'` for off-session.
- **Off-session charges** — must use saved PaymentMethod with `off_session: true`; failures don't trigger 3DS in real time.
- **Currency conversion fees** — settling in non-presentment currency adds fees.
- **Connect onboarding** — Express has KYC requirements; sellers may stall mid-flow.
- **Subscription proration math** — partial-period upgrades / downgrades; test thoroughly.
- **Account balance vs settled funds** — payouts have a delay (T+2 by default).
- **Disputes / chargebacks** — respond by deadline; build evidence submission flow.
- **Test cards in prod by mistake** — separate publishable / secret keys per env; never commit.
- **Dispute window vs subscription churn** — refunds + chargebacks affect MRR reporting.

## Interview Cheat Sheet
- **Tagline:** Developer-first global payments + billing + marketplaces; Elements / Checkout offload PCI; PaymentIntent + idempotency + signed webhooks.
- **Best at:** SaaS billing, e-commerce checkout, marketplaces (Connect), global reach, modern dev experience.
- **Worst at:** high-risk verticals, cost-sensitive huge-volume, MoR-required (use Paddle), crypto-only.
- **Scale:** trillions of $ processed annually; multi-region; financial-grade SLA.
- **Distributes how:** managed multi-region; webhooks at-least-once; ledger-backed; bank-rail integrations.
- **Consistency / state:** PaymentIntent state machine; idempotency keys + signed webhooks for safe processing.
- **Killer alternative:** Adyen (enterprise, low-code), Braintree (PayPal), Square (in-person + e-com), Checkout.com, Razorpay (India), Mercado Pago (LatAm), Paddle (MoR), Lemon Squeezy (MoR), local acquirers for cost optimization.

## Further Reading
- Official docs: <https://docs.stripe.com/>
- PaymentIntent guide: <https://docs.stripe.com/payments/payment-intents>
- Webhooks: <https://docs.stripe.com/webhooks>
- Connect: <https://docs.stripe.com/connect>
- Billing: <https://docs.stripe.com/billing>
