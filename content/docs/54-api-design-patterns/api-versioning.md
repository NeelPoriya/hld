---
title: "API Versioning"
description: "How to evolve a public API without breaking everyone — URL versioning (/v2/), header versioning, content-negotiation, additive evolution. The trade-offs, the lies you'll tell yourself, and what big companies actually do."
---

> Topic: Key Concept · Category: API Design Patterns · Difficulty: Foundational

## TL;DR
APIs evolve; clients can't always keep up. Four common strategies:
- **URL versioning** (`/v1/users`, `/v2/users`) — most common; visible; easy to route.
- **Header versioning** (`Accept: application/vnd.acme.v2+json`) — clean URL; harder to debug.
- **Content negotiation** (`Accept: application/json; version=2`) — same as above with different syntax.
- **Date-based versioning** (`API-Version: 2024-10-01`) — Stripe / Shopify; client opts into a "snapshot" of the API.

The deeper lesson: **don't version what you don't have to.** Most evolution should be **additive** (new fields ignored by old clients, new optional params, deprecation headers). Big bumps (`v1` → `v2`) are expensive — both for you (multi-version maintenance) and clients (forced rewrites). Stripe's date-based + additive model is the gold standard.

## What problem does it solve?
- **Clients don't upgrade in lockstep with you** — mobile apps, third-party integrations, scripts in CI.
- **Breaking changes destroy trust** in public APIs.
- **Multiple shapes of the same resource** must coexist for years.
- **Allows you to deprecate old behavior gracefully** with notice + sunset dates.
- **Lets the team experiment** without committing forever.

## How they work

### 1. URL versioning
```http
GET /v1/users/42
GET /v2/users/42
```
- Easy to route at gateway / load balancer.
- Easy to grep in logs / dashboards.
- Visible to clients (they pin to a major version).
- Used by: GitHub, Twilio, Twitter, Slack, Atlassian.

### 2. Header versioning
```http
GET /users/42
Accept: application/vnd.acme.v2+json
```
- Clean URL.
- Harder to test in browser / curl.
- Used by: GitHub also offers this; less common.

### 3. Content negotiation
```http
GET /users/42
Accept: application/json; version=2
```
- HTTP-spec-compliant.
- Same downsides as header.

### 4. Date-based / "API version pin" — the Stripe / Shopify model
```http
GET /v1/charges
Stripe-Version: 2024-10-01
```
- Each account / client pins to a specific date.
- Server applies "version layer" transformations between actual data and response shape based on version.
- Old clients keep working forever; opt-in to new versions per integration.
- Used by: Stripe, Shopify (`X-Shopify-API-Version`), GitHub for some headers.

## Versioning philosophies

### Additive evolution (the always-better path)
- **New optional fields** — old clients ignore, new clients use.
- **New optional query params** — defaults preserve old behavior.
- **New endpoints / methods** — never collide with existing.
- **Tolerant readers** — clients ignore unknown fields; servers ignore unknown params (when safe).
- **Don't remove or rename fields** ever in additive mode.
- **Deprecation headers** — `Deprecation: true`, `Sunset: 2025-12-31` (RFC 8594).

### Major version bumps (expensive)
- Reserve for genuinely incompatible changes:
  - Authentication mechanism changes.
  - Resource model fundamentally restructured.
  - Removing endpoints / fields that aliases can't paper over.
- Maintain at least 1-2 major versions in parallel for years.
- Each major version is essentially a separate codepath / team responsibility.

### Date-based versioning (Stripe-style)
- Account-pinned version; server "downgrades" responses to match.
- Add a "version transformer" per change: shape mutation between current and historical.
- Forces small, focused change-sets per version date.
- Excellent for SaaS APIs; expensive for in-house APIs that don't need it.

## When to use each (real-world examples)

### URL versioning
- **Public APIs with infrequent major bumps:** GitHub (`/v3/`), Twilio (`/2010-04-01/`), Slack (`/api/v1/`), Twitter (`/2/`).
- **Internal APIs** when clarity matters more than aesthetics.
- **Microservice-to-microservice** internal RPC.

### Header / content negotiation
- **Strictly REST-correct" deployments** that value clean URLs.
- **GitHub uses Accept headers** for some media types.
- **Less mainstream**; common pushback: harder to debug.

### Date-based
- **SaaS APIs with rapid iteration:** Stripe, Shopify (`Shopify-API-Version`), GitHub (some endpoints).
- **APIs with high cost of breaking** — payment processors, billing.

### Additive only (no version)
- **Internal APIs with controlled clients** — service mesh internal RPC.
- **GraphQL schemas** — additive by nature; deprecate fields, never break.
- **Webhook event payloads** — append fields; tolerant readers expected.

## Things to consider / Trade-offs

- **Pick once + commit.** Switching strategies mid-life is painful; clients integrate with one model.
- **Costs scale with versions you maintain.** Each maintained version = duplicate routing, code paths, tests, docs, support tickets.
- **Sunset policy** — give clients time. Stripe gives years; GitHub deprecates over 12+ months.
- **Documentation per version** — not just text; SDKs need version-specific generators.
- **SDK alignment** — your SDK pins to a specific version by default; users can override.
- **API versioning ≠ data versioning** — old data may need migration regardless.
- **Tolerant readers / Postel's law** — be liberal in what you accept, conservative in what you send. Critical for additive evolution.
- **Field renames** — always add new + keep old; deprecate old; remove only at major bump.
- **Header for version + URL for resource** is also valid and what some big systems do.
- **Don't put feature flags as version bumps** — separate concept; use real flags.
- **GraphQL** changes the question: schema deprecation rather than major versions.
- **gRPC / Protobuf** — schema evolution rules (no field number reuse, only optional new fields).
- **Webhook events** — version the *event payload schema*, often via top-level `version: "1.0"` field.
- **Test the migration** — actual clients on old version + new version + both alongside.

## Common pitfalls
- **Breaking changes without bump** — clients break, you blame them, support fires.
- **Bump too often** — `/v17/` signals chaos; maintenance cost spirals.
- **Forgetting deprecation headers** — clients have no signal until breakage.
- **No telemetry on version usage** — can't tell when it's safe to drop a version.
- **Sunset without communication** — public outrage.
- **Mixing strategies** (`/v2/users` AND `Accept: vnd.acme.v3`) — confusing; pick one.
- **Versioning by default, even for additive changes** — over-engineering.
- **Not testing old version against new server** — regression bugs.
- **Renaming fields mid-version** — silent client breakage.
- **Backwards-incompatible defaults** — adding required field; old clients break.
- **Not versioning webhook payloads** — same problem as APIs.
- **Forgetting query params + path params + body** — all can break.
- **Shipping breaking changes in error responses** — clients depend on error shape.

## Interview Cheat Sheet
- **Four strategies:** URL (`/v2/`), Accept header, content negotiation, date-based pinning.
- **URL versioning** is most common in public APIs.
- **Date-based** (Stripe/Shopify) is gold for SaaS — small changes, account pin.
- **Prefer additive evolution** over bumps; only major-bump for truly incompatible changes.
- **Tolerant readers** + `Deprecation` / `Sunset` headers (RFC 8594).
- **Maintain old versions for years** — sunset policy + telemetry.
- **GraphQL / gRPC have their own schema-evolution discipline** (deprecate fields, never reuse numbers).
- **Killer phrase:** "Stripe pins each integration to a date; new fields are added freely; only breaking changes ship as new dates with version transformers — best of both worlds."

## Related concepts
- [REST vs GraphQL vs gRPC](/docs/54-api-design-patterns/rest-vs-graphql-vs-grpc) — different versioning conventions.
- [Pagination Strategies](/docs/54-api-design-patterns/pagination-strategies) — pagination contract is part of versioning.
- [Idempotency](/docs/44-delivery-semantics/idempotency) — header presence is part of API contract.
- Concrete: Stripe API design, GitHub API versioning, Shopify API versioning.
