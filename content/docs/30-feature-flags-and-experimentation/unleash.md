---
title: "Unleash"
description: "Unleash is the leading open-source feature-flag platform — self-hostable, language-agnostic SDKs, strategy-based targeting, edge proxy for low-latency client-side flags."
---

> Category: Feature Flags & Experimentation · Written in: TypeScript / Node.js (server) + Rust / Java / Go / Node / Python / .NET SDKs · License: Apache 2.0

## TL;DR
Unleash is the **most popular open-source feature-flag platform** — the OSS answer to LaunchDarkly. You self-host (or use Unleash Hosted) the **Unleash Server** (Node.js + Postgres), define flags in the UI, and your apps use the **client SDK** (Node, Java, Go, Python, .NET, Ruby, Rust, browser, …) to evaluate flags locally. SDKs poll the Unleash Server periodically for the **flag rules**, then evaluate them in-process — sub-microsecond decision per request. For client-side / browser apps, the **Unleash Edge** (Rust) sits at the edge and provides low-latency frontend SDK support without exposing your full ruleset. Reach for Unleash when you want feature flags **without vendor lock-in**, when you need **on-prem / air-gapped** deployment, or when you want a strong OSS foundation you can extend.

## What problem does it solve?
- **Decouple deploy from release** — same problem LaunchDarkly solves, with OSS license.
- **No vendor lock-in** — Apache 2.0 server + SDKs.
- **On-prem / air-gapped** — fully self-hostable in your VPC / on-prem.
- **Cost predictability** — no per-MAU pricing for OSS; Hosted plans available.
- **Audit + permissions** — Unleash Enterprise has change requests / approvals / SSO.

## When to use
- **OSS-first stack** — you want feature flags without paid SaaS.
- **Air-gapped** environments — banks, govt, healthcare.
- **Polyglot backends** — 10+ official SDKs.
- **Self-hostable** with reasonable ops.
- **Needs a clear migration path off LaunchDarkly** — Unleash supports flag-import.

## When NOT to use
- **Smallest apps** — env var or `if-process.env` is enough.
- **Heavy A/B experimentation with stat engines** — LaunchDarkly / Statsig / Optimizely have richer experimentation.
- **Frontend-only apps with no backend** — possible via Edge, but you re-implement rule evaluation client-side.
- **Tight integrations with proprietary SaaS observability** — LaunchDarkly may have native integrations Unleash lacks.

## Core Concepts
- **Toggle (flag)** — boolean by default; can have variants for multivariate.
- **Strategies** — built-in: `default` / `userIDs` / `IPs` / `gradualRolloutUserId` / `gradualRolloutSessionId` / `gradualRolloutRandom` / `applicationHostname`. Plus custom strategies.
- **Constraints** — predicates on context attributes (`environment IN [prod]`, `tier == enterprise`).
- **Variants** — multivariate values (multiple buckets within a flag).
- **Environments** — dev / preprod / prod; flags configured per env.
- **Projects** — group flags by product / team.
- **Segments** — reusable constraint sets.
- **Strategy stickiness** — bucket key (userId, sessionId, random); deterministic.
- **Change requests** (Enterprise) — 4-eye approval workflow.

```yaml
# Sample Unleash flag (UI-driven; representation):
name: new-checkout-flow
type: release
project: web
environments:
  production:
    enabled: true
    strategies:
      - name: gradualRolloutUserId
        parameters:
          percentage: "25"
          groupId: new-checkout-flow
          stickiness: userId
        constraints:
          - contextName: country
            operator: IN
            values: [US, CA]
      - name: userWithId
        parameters:
          userIds: 12,42,7,99    # internal staff always on
```

```typescript
// Node SDK
import { initialize } from "unleash-client";

const unleash = initialize({
  url: process.env.UNLEASH_URL!,
  appName: "checkout-svc",
  customHeaders: { Authorization: process.env.UNLEASH_API_TOKEN! }
});

await new Promise(res => unleash.on("ready", res));

app.get("/checkout/:userId", (req, res) => {
  const ctx = {
    userId: req.params.userId,
    properties: { country: req.user.country, tier: req.user.tier }
  };
  if (unleash.isEnabled("new-checkout-flow", ctx)) return renderNew(req, res);
  return renderLegacy(req, res);
});
```

```rust
// Rust SDK
use unleash_api_client::client::ClientBuilder;
let client = ClientBuilder::default()
    .api_url("https://unleash.acme.io/api")
    .app_name("checkout-svc")
    .authorization(Some("Bearer ...".to_string()))
    .build()?;
client.register().await?;
```

## Architecture
- **Unleash Server** — Node.js app + Postgres for state; admin UI + API.
- **Client SDK** — polls server every ~15 s for ruleset; evaluates locally on every request.
- **Unleash Edge (Rust)** — sits between SDKs and Server; low-latency cache for client-side / frontend SDKs; preserves API key model; can run at edge POPs.
- **Metrics back-channel** — SDKs send aggregated impression counts back to server (no per-event PII).
- **Multi-environment** — single Server can host many environments + projects with API tokens scoped.
- **Backup / read replicas** — Postgres native; HA via standard PG patterns.

## Trade-offs

| Strength | Weakness |
|---|---|
| Apache 2.0 OSS — no lock-in | Operational responsibility (run server + Postgres) |
| Self-hostable on-prem | Smaller ecosystem vs LaunchDarkly's marketplace |
| 10+ official SDKs | Variant / experimentation features less mature |
| Strategies + constraints + custom strategies | Approval workflows / SSO are Enterprise-tier |
| Edge proxy for frontend SDKs (Rust) | Polling-based by default (15 s default); not SSE push |
| Fast local evaluation | UI is functional but less polished than LD |
| Active community + Enterprise option | Some integrations require custom adapters |
| Migration import path from LD | Smaller third-party tooling ecosystem |

## Common HLD Patterns
- **Trunk-based dev with flags:** ship dark behind `new-checkout-flow`; gradually turn on via UI.
- **Per-environment flags:** dev always on, staging staff-only, prod 1% → 100%.
- **Kill switch:** every risky feature has a flag; flip off during incident; no redeploy.
- **Strategy: gradualRolloutUserId** — sticky bucketing by user ID; deterministic.
- **Custom strategy:** company-specific logic (e.g., "tenant has feature X paid for") implemented in SDK as a custom strategy plugin.
- **Edge proxy in front:** browser SDK hits Unleash Edge (lightweight, regional); Edge talks to upstream Unleash Server.
- **Migration off LD:** import flags via `unleash-import`; switch SDKs gradually.
- **Per-tenant flags:** constraint on `tenantId IN [...]`; flag enables feature only for selected tenants.

## Common Pitfalls / Gotchas
- **Polling lag** — default 15 s poll interval; flag flip can take up to 15 s to propagate; tune if you need faster.
- **Stale flag debt** — same as LaunchDarkly; remove dead flags + code references.
- **Frontend SDK exposes ruleset** — never put sensitive logic in browser-side flag rules; use server SDK + Edge model.
- **Postgres is the single point of failure** — set up HA + backups properly.
- **API token scoping** — admin token vs frontend token; never use admin in client.
- **Custom strategies require SDK code deploy** — adding a new strategy means redeploying every consuming app.
- **Variant rollout consistency** — make sure stickiness is on a stable key (userId), not session.
- **Audit trail in OSS** — basic event log; full change requests + approvals are Enterprise.
- **Multi-region** — replicate Postgres or run regional servers; SDKs poll regional cache.
- **Time skew** — gradual rollout depends on hash; clock differences across pods are mostly fine, but constraints on `time` can drift.

## Interview Cheat Sheet
- **Tagline:** Apache 2.0 self-hostable feature-flag server (Node.js + Postgres); SDKs poll for rules and evaluate locally; Edge proxy for frontend.
- **Best at:** OSS-first stacks, self-hosted / air-gapped, polyglot backends, predictable cost.
- **Worst at:** richest experimentation analytics, smallest apps, push-style sub-second propagation (without tuning).
- **Scale:** any number of SDKs; server scales horizontally with Postgres backing; Edge for frontend offload.
- **Distributes how:** SDKs poll server (~15s); local in-process eval; Edge proxy fans out to many frontend SDKs.
- **Consistency / state:** ruleset replicated to all SDKs via polling; eval deterministic per (flag, context, strategy).
- **Killer alternative:** LaunchDarkly (managed), Flipt (OSS, lighter), Split.io, ConfigCat, Statsig, GrowthBook (OSS, experimentation-focused), AWS AppConfig.

## Further Reading
- Official docs: <https://docs.getunleash.io/>
- Architecture: <https://docs.getunleash.io/understanding-unleash/unleash-overview>
- Unleash Edge: <https://docs.getunleash.io/reference/unleash-edge>
- Custom strategies: <https://docs.getunleash.io/topics/custom-activation-strategies>
