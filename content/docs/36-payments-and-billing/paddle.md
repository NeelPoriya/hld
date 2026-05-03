---
title: "Paddle"
description: "Paddle is the Merchant of Record (MoR) for SaaS — Paddle takes legal ownership of the transaction so you don't have to register for sales tax / VAT / GST in 100+ jurisdictions; Paddle Billing covers subscriptions, invoicing, and payment recovery."
---

> Category: Payments & Billing · Provider: Paddle · License: Proprietary (managed)

## TL;DR
Paddle is **payments-with-the-tax-and-compliance-burden-removed**. Unlike Stripe (which is a Payment Service Provider — you're the merchant of record), Paddle is the **Merchant of Record (MoR)**: every customer transaction is legally between Paddle and the buyer, so **Paddle handles sales tax / VAT / GST registration, collection, remittance, and audits across 100+ countries**, plus refunds / chargebacks / fraud, in exchange for a higher take rate (~5% + 50¢ on Paddle Billing). For B2B / B2C SaaS selling globally, this collapses massive ops complexity. Paddle ships **subscription billing**, **localized pricing / payment methods**, **smart retries / dunning**, **checkout overlay / inline / standalone**, and **tax-inclusive invoicing**. Reach for Paddle when you want to **sell SaaS globally without standing up a tax / compliance team**, or you're a small studio that can't afford international tax filings.

## What problem does it solve?
- **Global tax compliance is brutal** — VAT / GST / sales tax registrations in dozens of countries; thresholds; filings; audits. Paddle absorbs all of it.
- **PCI compliance** — Paddle Checkout offloads PAN.
- **Fraud / chargebacks** — Paddle takes the chargeback liability.
- **Refunds / disputes** — Paddle handles disputes; you focus on product.
- **Localized pricing & methods** — Paddle presents local currencies + payment methods (cards, PayPal, Apple Pay, Google Pay, iDEAL, Bancontact, etc.).
- **Subscription billing** — Paddle Billing handles trials, plans, prorations, dunning, recovery.

## When to use
- **Indie / small / mid-stage SaaS** selling globally.
- **You don't want to register for tax** in EU + UK + AU + CA + ZA + ...
- **You're hit by EU VAT MOSS / OSS** rules and want to outsource.
- **Digital products only** — Paddle is software / SaaS / digital goods focused.
- **MoR model is acceptable** to your accounting / legal teams.
- **Need fast time-to-revenue** without a finance team.

## When NOT to use
- **Physical goods e-commerce** — Paddle is digital-only.
- **Marketplaces / two-sided platforms** — use Stripe Connect.
- **Direct relationship with bank rails** — Paddle is between you and money.
- **Cost-sensitive at huge volume** — Paddle's take is ~2x Stripe's; once you have a tax team, Stripe direct is cheaper.
- **Crypto / banned categories** — same restrictions as Stripe (and stricter).
- **Enterprise multi-entity revenue recognition** — Paddle is fine but ERP integration may need work.

## Core Concepts
- **Merchant of Record (MoR)** — Paddle is legal seller; customer's invoice shows "Paddle.com Inc." (or Paddle Markets Ltd.).
- **Customer** — buyer object.
- **Product** — your SKU.
- **Price** — money + interval (one-time, recurring); supports trial, multiple currencies.
- **Transaction** — single payment; one-time or scheduled subscription cycle.
- **Subscription** — Customer + Price; auto-renews.
- **Adjustment** — refunds, credits, write-offs.
- **Webhooks (Notifications)** — async events; signed; retried.
- **Checkout** — overlay / inline / standalone-page hosted checkout.
- **Paddle Retain** — dunning + revenue recovery (was ProfitWell Retain).
- **Tax codes** — categorize products for correct rate application.
- **Customer Portal** — hosted page to manage subscription / cards.
- **Paddle Classic vs Paddle Billing** — Classic is older API; Billing (2023+) is modern REST API.

```javascript
// Server: create a transaction (Paddle Billing API)
const res = await fetch("https://api.paddle.com/transactions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.PADDLE_API_KEY}`,
    "Content-Type": "application/json",
    "Paddle-Version": "1"
  },
  body: JSON.stringify({
    items: [{ price_id: "pri_pro_monthly", quantity: 1 }],
    customer_id: "ctm_123",
    collection_mode: "automatic"
  })
});
const txn = (await res.json()).data;
// Returns checkout URL for hosted flow, or transaction ID to confirm via Paddle.js
```

```javascript
// Client: launch checkout overlay
import { initializePaddle } from "@paddle/paddle-js";

const paddle = await initializePaddle({
  environment: "production",
  token: "live_pdl_..."           // client-side token (NOT API key)
});

paddle.Checkout.open({
  items: [{ priceId: "pri_pro_monthly", quantity: 1 }],
  customer: { email: "buyer@acme.com" },
  customData: { app_user_id: "u_42" }      // echoed in webhook
});
```

```javascript
// Webhook handler — verify signature + idempotent processing
import crypto from "crypto";

export async function POST(req) {
  const raw = await req.text();
  const sigHeader = req.headers.get("paddle-signature");  // ts=...;h1=...
  const [tsPart, sigPart] = sigHeader.split(";");
  const ts = tsPart.split("=")[1];
  const sig = sigPart.split("=")[1];

  const expected = crypto.createHmac("sha256", process.env.PADDLE_WEBHOOK_SECRET)
    .update(`${ts}:${raw}`).digest("hex");
  if (sig !== expected) return new Response("bad sig", { status: 400 });

  const event = JSON.parse(raw);
  switch (event.event_type) {
    case "transaction.completed":  await provisionAccess(event.data); break;
    case "subscription.canceled":  await downgradeAccount(event.data); break;
    case "transaction.payment_failed": await sendDunning(event.data); break;
  }
  return new Response("ok", { status: 200 });
}
```

## Architecture (Conceptual)
- **Paddle as MoR** — Paddle is between you and your customers; Paddle invoices the customer; you invoice Paddle.
- **Tax computation engine** — address + tax code → rate; supports tax-inclusive vs tax-exclusive pricing.
- **Acquiring relationships** — Paddle aggregates onto card networks + local rails.
- **Subscription engine** — generates transactions on schedule.
- **Dunning** — Paddle Retain runs smart retries + recovery emails.
- **Webhook delivery** — at-least-once; signed; retried.
- **Localized checkout** — server-side IP / address detection drives currency + tax + methods.

## Trade-offs

| Strength | Weakness |
|---|---|
| MoR offloads tax / VAT / GST globally | Higher fee than Stripe (~5% + 50¢ vs 2.9% + 30¢) |
| Paddle handles chargebacks / fraud / refunds | Customer's invoice shows "Paddle" not your brand |
| Strong dunning (Retain) | Digital goods only |
| Localized currency + payment methods | Not for marketplaces (no Connect-style split) |
| Hosted Checkout = PCI offload | Less developer-mindshare than Stripe |
| One platform, one contract | Once you grow, Stripe + tax tooling may be cheaper |
| Subscription primitives (proration, trials, plans) | Smaller integration ecosystem than Stripe |
| Lemon Squeezy / FastSpring are direct alternatives | EU-headquartered; some non-EU enterprises hesitate |

## Common HLD Patterns
- **Indie SaaS launching globally** — wire up Paddle Checkout, never think about VAT again.
- **Subscription with trial** — Price with trial period; Paddle starts the trial; webhook on conversion.
- **License-key delivery** — `transaction.completed` webhook → generate license key → email customer + store in DB keyed on Paddle `customer_id`.
- **Plan upgrade with proration** — `subscriptions.update` with new `price_id`; Paddle prorates.
- **Failed-payment recovery** — Paddle Retain + your in-app banner alerting user; reduce churn.
- **Customer Portal** — Paddle-hosted page handles cancellations / card updates.
- **Webhook → entitlement service** — single source of truth for "what plan is this user on?" comes from Paddle subscription state, mirrored locally.

## Common Pitfalls / Gotchas
- **MoR means Paddle's name on invoice** — some enterprise buyers ask for "your name" invoices; not possible.
- **Webhook signature** — verify or attackers can forge events.
- **Idempotency** — duplicate webhooks are common; key on `event_id`.
- **Race between checkout success page + webhook** — webhook is source of truth; checkout success is just UX.
- **Paddle Classic vs Paddle Billing API** — different APIs, different webhooks; new integrations should use Billing.
- **Trial conversion timing** — Paddle bills at trial end; honor the timezone; emit reminder emails.
- **Tax-inclusive vs exclusive pricing** — pick at price creation; switching mid-stream is messy.
- **Customer-facing brand confusion** — buyers see "Paddle" charge on card statement; pre-warn in UX.
- **Refund → chargeback racing** — issue refund quickly; chargebacks bypass the MoR fee benefit.
- **Currency rounding** — multi-currency display can drift from authorized currency by a cent; reconcile via Paddle data.
- **Banned categories** — review T&Cs before integrating.

## Interview Cheat Sheet
- **Tagline:** Merchant of Record for SaaS — Paddle owns the transaction so you don't deal with global tax / VAT / GST / chargebacks; Paddle Billing for subscriptions; ~5% + 50¢ take.
- **Best at:** indie / mid-stage SaaS selling globally without a tax team; offloading compliance.
- **Worst at:** marketplaces (no Connect-style), physical goods, cost-sensitive huge-volume, enterprises wanting their name on invoices.
- **Scale:** thousands of digital businesses; global multi-currency; tax in 100+ jurisdictions.
- **Distributes how:** managed; Paddle as legal seller; webhooks signed + at-least-once.
- **Consistency / state:** Paddle is the source of truth for billing state; mirror via webhooks into your entitlement DB.
- **Killer alternative:** Stripe (PSP, you're MoR), Lemon Squeezy (MoR, simpler), FastSpring (MoR, enterprise), Polar.sh (developer-focused MoR), Outseta (bundled SaaS toolkit), Chargebee (subscription mgmt on top of Stripe).

## Further Reading
- Official docs: <https://developer.paddle.com/>
- Paddle Billing API: <https://developer.paddle.com/api-reference/overview>
- Webhooks: <https://developer.paddle.com/webhooks/overview>
- MoR explained: <https://www.paddle.com/blog/merchant-of-record>
