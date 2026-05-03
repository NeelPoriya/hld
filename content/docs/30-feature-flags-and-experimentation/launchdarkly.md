---
title: "LaunchDarkly"
description: "LaunchDarkly is the canonical managed feature-flag and experimentation platform — global low-latency flag delivery, percentage rollouts, targeting rules, and audit trails for safe deploys."
---

> Category: Feature Flags & Experimentation · Provider: LaunchDarkly · License: Proprietary (managed)

## TL;DR
LaunchDarkly is the **gold-standard managed feature-flag platform**. You define flags (boolean / multivariate / JSON / numeric / string) in a UI; client and server SDKs in 30+ languages stream flag updates via SSE; the SDK evaluates flags **locally** with the latest rules, so flag checks are **microsecond-fast** and never block a request. On top of flag delivery, LaunchDarkly provides **targeting** (rules by user attributes / segments), **percentage rollouts**, **A/B experimentation** with stats engines, **approval workflows**, **audit logs**, **flag debugger**, **environments** (dev / staging / prod), and **migrations** (multi-step rollout templates). Reach for LaunchDarkly when you need **trunk-based development with feature flags as a first-class deploy primitive** and you want a polished managed experience your security and product teams will trust.

## What problem does it solve?
- **Decouple deploy from release** — ship dark code, flip flag when ready.
- **Progressive rollouts** — 1% → 5% → 25% → 100% with health checks.
- **Kill switches** — disable a misbehaving feature in seconds, no redeploy.
- **A/B testing** with proper stats — control vs treatment + statistical significance.
- **Targeted rollouts** — beta users / specific tenants / specific regions.
- **Audit + compliance** — every flag change has an audit log entry; approvers required.

## When to use
- **Trunk-based dev** with frequent merges to main.
- **Risky migrations / refactors** — gate behind flag, dial up gradually.
- **A/B tests** with statistical rigor.
- **Multi-tenant SaaS** — per-customer feature gating.
- **Mobile / desktop apps** — push flag changes without app store review.
- **Regulated industries** needing audit + approval workflows.

## When NOT to use
- **Tiny apps with one feature flag** — env var or simple OSS lib (Unleash, Flipt) is enough.
- **No internet** / strict air-gap — LaunchDarkly is SaaS; you can self-host the Relay Proxy but flag mgmt UI is hosted.
- **Bug fixes** — flags are not for hiding bugs; ship the fix.
- **Permanent config that never flips** — that's just config, use Vault / SSM / env.
- **Cost-sensitive small teams** — pricing scales with MAU / contexts; check before adopting.

## Core Concepts
- **Flag** — typed entity; boolean is most common. Multivariate flags return one of N values.
- **Variation** — possible flag value (true/false, "blue"/"green"/"red", or a JSON config).
- **Targeting rule** — `if user.country in [US, CA] → variation: blue`.
- **Segment** — reusable user group (e.g., "beta-users", "internal-staff").
- **Percentage rollout** — bucket users by hashed key; deterministic.
- **Environment** — dev / staging / prod; flags are versioned per env.
- **Project** — separate flag namespace (e.g., per product).
- **Context** — modern multi-kind attribute carrier (user, organization, device, …); replaces older "user" model.
- **Migration flag** — multi-step rollout template (off → shadow → live → on).
- **Experiment** — flag tied to a metric; LD computes lift / significance.

```typescript
// Server SDK (Node.js)
import * as LaunchDarkly from "@launchdarkly/node-server-sdk";

const client = LaunchDarkly.init(process.env.LD_SDK_KEY!);
await client.waitForInitialization();

app.get("/checkout/:userId", async (req, res) => {
  const ctx = {
    kind: "multi",
    user: { kind: "user", key: req.params.userId, country: req.user.country, plan: req.user.plan },
    org:  { kind: "org",  key: req.user.orgId,    tier: req.user.tier }
  };

  const useNewCheckout = await client.variation("new-checkout-flow", ctx, false);
  if (useNewCheckout) {
    return renderNewCheckout(req, res);
  }
  return renderLegacyCheckout(req, res);
});
```

```typescript
// Client SDK (React)
import { LDProvider, useFlags } from "launchdarkly-react-client-sdk";

const App = () => (
  <LDProvider clientSideID={process.env.LD_CLIENT_ID!} context={{ kind: "user", key: userId }}>
    <Checkout />
  </LDProvider>
);

function Checkout() {
  const { newCheckoutFlow } = useFlags();
  return newCheckoutFlow ? <NewCheckout /> : <LegacyCheckout />;
}
```

## Architecture
- **Flag delivery** — flags evaluated **client-side / server-side in your process**, NOT by API call per request.
- **SDK fetches initial state** + opens **SSE stream** to receive updates within ~200 ms globally.
- **Edge / Relay Proxy** — optional self-hosted proxy that caches flag state for many SDKs; reduces fan-out to LaunchDarkly cloud and serves SDKs in your VPC.
- **Events backend** — SDK posts evaluation events back to LD for audit + experimentation analytics; sampled to control bandwidth.
- **Multi-region delivery** — LaunchDarkly serves SDK streams from edge POPs.
- **Federated environments** — same flag, multiple SDK keys per environment.

## Trade-offs

| Strength | Weakness |
|---|---|
| Microsecond local evaluation; no per-call API hit | Pricing at scale (per MAU / context) can grow |
| 30+ language SDKs | Vendor lock-in to LD API + SDK |
| Robust targeting + experimentation | Complex enough to require team training |
| Audit logs + approvals + 4-eye workflows | Self-hosted-only deployment unsupported (Relay Proxy is read cache) |
| SSE stream — flag changes propagate in seconds | "Stale flag" cleanup is your responsibility |
| Mobile + browser + server SDKs | Marketing-quality UI but config sprawl can grow |
| Excellent observability (flag eval dashboards) | Some advanced features gated to higher tiers |
| Migration flag for safe multi-step rollouts | Tightly coupled to LD's data model |

## Common HLD Patterns
- **Trunk-based deploy + flag rollout:** PR merges to main with feature behind flag (off); CI deploys; flag dialed up gradually in prod.
- **Kill switch:** every risky feature gets a flag; ops can flip in seconds during incident.
- **Per-tenant feature:** flag targeting `org.id in [...]`; allows enabling for specific customers.
- **A/B test:** flag splits 50/50; LD computes conversion / metric lift.
- **Migration flag:** old code → shadow new code (compare, no effect) → live with N% traffic → 100%.
- **Server-side flags only for sensitive logic** — client SDK exposes flag config to JS console; sensitive flags must be server-only.
- **Relay Proxy in VPC:** for very low latency / private networks, run Relay Proxy locally and point SDKs at it.
- **CI gate on flag cleanup:** linter fails PR if flag is referenced in code but archived in LD (or vice versa).

## Common Pitfalls / Gotchas
- **Flag debt** — old flags accumulating in code; use code references + cleanup linters.
- **Sensitive logic in client flags** — anyone can read JS bundle; don't gate auth on client flag.
- **Default value mismatch** — when SDK can't reach LD, it returns the default you pass in; choose default that's safe.
- **Targeting on PII** — sending email / IP as context keys can leak to LD; use hashed keys.
- **Long-lived contexts** — exploding number of unique contexts inflates billing.
- **Synchronous evaluation in hot path** — should be sub-microsecond; if not, check SDK init.
- **Flag changes during long requests** — SDK gives consistent value within a single evaluation; long requests may see different flag mid-flow if you re-evaluate.
- **Approvals slow rollouts** — useful but design for pace.
- **Mobile flag staleness** — mobile SDK caches; force refresh on resume.
- **Region selection** — LaunchDarkly stores can be US / EU; pick for compliance.

## Interview Cheat Sheet
- **Tagline:** Managed feature-flag + experimentation platform; SDK does local eval; SSE stream pushes updates; targeting + rollouts + A/B + audit.
- **Best at:** trunk-based dev, progressive rollouts, kill switches, A/B testing, regulated industries needing audit.
- **Worst at:** tiny apps, air-gapped envs (use Unleash / Flipt), permanent config, ultra-cost-sensitive teams.
- **Scale:** flag eval is local — effectively unlimited; analytics events scale with MAU * eval count.
- **Distributes how:** SDK in every process; SSE stream from LD cloud (or Relay Proxy) keeps state fresh.
- **Consistency / state:** flag state replicated to all SDKs within seconds; eval is deterministic per (flag, context).
- **Killer alternative:** Unleash (OSS), Flipt (OSS, light), Split.io, Optimizely (experimentation-first), AWS AppConfig + CloudWatch Evidently, ConfigCat, Statsig, GrowthBook (OSS).

## Further Reading
- Official docs: <https://docs.launchdarkly.com/>
- SDK overview: <https://docs.launchdarkly.com/sdk>
- Relay Proxy: <https://docs.launchdarkly.com/home/relay-proxy>
- Best practices: <https://launchdarkly.com/blog/feature-flag-best-practices/>
