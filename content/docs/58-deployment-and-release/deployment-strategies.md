---
title: "Deployment Strategies"
description: "How code reaches production safely — rolling updates, blue-green, canary, shadow / dark launches, feature flags. The trade-off between deploy speed, blast radius, and rollback cost."
---

> Topic: Key Concept · Category: Deployment & Release · Difficulty: Foundational

## TL;DR
Six common strategies, each with different blast-radius / rollback costs:
- **Rolling update** — replace replicas one or N at a time. Default in Kubernetes. Slow to roll back. Both versions live simultaneously.
- **Blue-green** — two full environments; switch traffic atomically. Instant rollback. Costs 2× resources.
- **Canary** — send small % of traffic to new version; gradually ramp. Limits blast radius. Needs traffic-shifting LB.
- **Shadow / dark launch** — duplicate prod traffic to new version without serving its responses. Tests under real load.
- **Feature flags** — code is deployed dark; turned on per user / cohort. Decouples deploy from release.
- **A/B testing** — like canary but for product / UX, not infra.

The deeper point: **deploys should be boring**. Pair any strategy with **automatic rollback on SLO regression** and **observability** (latency / error / saturation).

## What problem does each solve?

### Rolling update
- **Default zero-downtime** for replicated services.
- **Resource-efficient** (no double infra).
- **Built into Kubernetes** (`Deployment` rolling).

### Blue-green
- **Atomic switch** — flip traffic at once.
- **Instant rollback** — flip back.
- **Decouples deploy from cutover** — bake on green before promoting.

### Canary
- **Limit blast radius** — only 1% sees the bug.
- **Validate with real prod traffic** before full rollout.
- **Statistical confidence** — collect signal at low risk.

### Shadow / dark launch
- **Test under real load** without user impact.
- **Spot performance issues** before exposing to users.
- **Compare new vs old behavior** on actual prod requests.

### Feature flags
- **Deploy ≠ release** — code in prod, off until flag flipped.
- **Per-user / cohort rollout** — internal employees first, then beta, then GA.
- **Instant kill switch** — toggle flag, don't redeploy.
- **A/B testing** for product features.

### A/B testing
- **Measure user behavior** under different variants.
- **Data-driven product decisions.**

## How they work

### Rolling update

```text
Replicas:
   v1  v1  v1  v1  v1
        ↓ surge=1, maxUnavailable=0
   v1  v1  v1  v1  v1  v2     (new pod added)
   v1  v1  v1  v1  v2         (old pod removed)
   ... repeat ...
   v2  v2  v2  v2  v2
```

- **MaxSurge** = how many extra replicas during rollout.
- **MaxUnavailable** = how many can be down.
- **Both versions serve traffic** during rollout.

### Blue-green

```text
Before:
  Load Balancer ──► Blue (v1)  [serving]
                    Green (v2) [idle]

Cutover:
  Load Balancer ──► Green (v2) [serving]
                    Blue (v1)  [warm standby]

Rollback: flip back.
```

### Canary

```text
   Load Balancer
      ├──► v1 (99% of traffic)
      └──► v2 (1% of traffic)

   Watch SLOs for v2: latency, error rate, saturation.
   Healthy → ramp to 5%, 25%, 50%, 100%.
   Unhealthy → drop v2 → rollback.
```

### Shadow / dark launch

```text
   Load Balancer
      ├──► v1 (real response)
      └──► v2 (response discarded; just test)

   Compare v1 vs v2 outputs offline; check v2 latency / errors.
   No user impact.
```

### Feature flag

```python
if feature_flag("new_checkout_flow", user):
    return new_checkout(user)
else:
    return old_checkout(user)
```

Flag service (LaunchDarkly, Unleash, Flagsmith, OpenFeature) controls rollout: %, by user attribute, by tenant.

### A/B testing

```python
variant = ab_test.variant(user, experiment="checkout_v2")  # 'A' or 'B'
if variant == 'B':
    show_new_button()
log_event("seen_variant", variant=variant, user=user)
```

Measure conversion rate per variant; statistical significance test.

## When to use each (real-world examples)

### Rolling update
- **Default for Kubernetes services** — `Deployment` resource.
- **Stateless web / API services.**
- **Low-risk changes** — patches, config bumps.

### Blue-green
- **Stateful services** with schema-compat issues — flip atomically.
- **Critical systems** where partial-state mid-deploy is unacceptable.
- **DB schema migration coordination.**
- **AWS Elastic Beanstalk / CodeDeploy blue-green.**

### Canary
- **Risky changes** to high-traffic services — Netflix, Google, Meta default.
- **ML model rollouts** — compare metrics on small population.
- **API breaking changes** — start small + observe.
- **Argo Rollouts / Flagger / Spinnaker** automate.

### Shadow
- **New algorithms / ranking changes** — replay prod traffic to new ranker.
- **Performance regression testing.**
- **Migration validation** — old vs new database, queue, service.

### Feature flags
- **Continuous deployment** — multiple deploys/day with risk control.
- **Gradual rollout** — 1% → 10% → 50% → 100%.
- **Kill switches** for new features.
- **Per-tenant gates** — premium customers get feature first.
- **A/B testing infrastructure.**
- **LaunchDarkly, Unleash, Split, Flagsmith, OpenFeature.**

### A/B testing
- **Product / UX changes** — button color, copy, layout.
- **Recommendation algorithms.**
- **Pricing experiments.**
- **Onboarding flows.**

## Things to consider / Trade-offs

### Rolling update
- **Schema compat is your problem** — both versions live simultaneously; new code must handle old data and vice versa.
- **Slow rollback** — must roll forward (deploy old version again) or use rolling-back logic.
- **Capacity dip** during rollout if `maxUnavailable > 0`.
- **Pod startup time** — slow services drag rollouts.

### Blue-green
- **2× resources** during cutover.
- **Stateful services** are tricky — sessions don't transfer.
- **DB migrations** — both versions must work with same schema, or coordinate carefully.
- **Cache warming** — "green" is cold at cutover; pre-warm or expect a latency spike.

### Canary
- **Need traffic-shifting LB** (Istio, Linkerd, Argo Rollouts, Flagger, AWS App Mesh, Cloudflare LB weighted).
- **Statistical noise at small %** — 1% may not show real signal.
- **Sticky sessions** complicate it — same user always gets same version.
- **Schema compat** — same as rolling.
- **Auto-rollback on SLO breach** is the killer feature.

### Shadow
- **Can't measure user-visible impact** — only system behavior.
- **Side-effects must be contained** — shadow shouldn't write to prod DB / send emails.
- **Read-only services are easiest** to shadow.
- **Cost** — duplicate compute.

### Feature flags
- **Flag debt** — flags accumulate; clean up after rollout.
- **Dependency on flag service** — outage = which path runs?
- **Local SDK eval** preferred over per-request RPC.
- **Test both paths in CI.**
- **A/B vs operational flags** — different lifetimes, different teams.

### A/B testing
- **Statistical significance** — wait long enough.
- **Sample-ratio mismatch** — flag delivery skews; check assignment proportion.
- **Multiple simultaneous tests** interact; consider mutually exclusive layers.
- **Novelty effect** — short-term lift fades.
- **Don't peek and stop** — proper statistical testing.

### General
- **Always be ready to roll back** — auto-rollback on SLO regression.
- **Observability before deployment** — can't roll back what you can't see is broken.
- **Database migrations are special** — backward-compatible schema changes; deploy code that handles both old + new shapes.
- **Service contracts** — keep API backward-compatible during deploy.
- **Per-tenant safety** — for B2B, roll out tenant-by-tenant.
- **Test the rollback path** — assume rollback will be needed.

## Common pitfalls
- **No automated rollback** — deploy bad version + go to bed.
- **Canary without observability** — small % with bug, looks fine on dashboards.
- **Schema migration tied to deploy** — new code requires schema; old replicas break.
- **Feature flag defaults wrong** — outage flips behavior unexpectedly.
- **Stale flags** never cleaned up — code spaghetti.
- **A/B test results conflated with operational rollout** — different statistics.
- **Shadow with side effects** — duplicate emails sent.
- **Blue-green with shared cache** — bug in green poisons cache for both.
- **Rolling update too fast** — new pods not warm; latency spikes.
- **No `terminationGracePeriodSeconds`** — pods killed mid-request.
- **No `preStop` hook + draining** — load balancer still routing to terminating pod.
- **Sticky sessions** breaking canary % — users always old or always new.
- **Forgetting to deploy reverse migration** — code rolled back; DB schema can't.
- **Dependency-pinned deploys** — service A new, service B old, broken protocol.

## Interview Cheat Sheet
- **Six strategies:** rolling, blue-green, canary, shadow, feature flag, A/B.
- **Rolling:** default; replace N at a time; both versions live.
- **Blue-green:** atomic switch; instant rollback; 2× resources.
- **Canary:** small % first; gradually ramp; auto-rollback on SLO breach.
- **Shadow:** real traffic, discarded responses; load test in prod.
- **Feature flag:** deploy ≠ release; flip per user / cohort; instant kill switch.
- **A/B test:** measure user behavior under variants; statistical significance.
- **Pair with observability** + automatic rollback on regression.
- **DB schema migrations** must be backward-compat across deploys.
- **Tools:** Argo Rollouts / Flagger (canary), LaunchDarkly / Unleash (flags), Spinnaker / ArgoCD (CD), Istio / Linkerd (traffic shifting).

## Related concepts
- [Feature Flags & Experimentation](/docs/30-feature-flags-and-experimentation/launchdarkly) — concrete tools.
- [SLO + Error Budget](/docs/57-observability-and-sre/sli-slo-sla-error-budgets) — when canary auto-rollback fires.
- [Circuit Breaker](/docs/45-resilience-patterns/circuit-breaker) — protects under deploy turmoil.
- [Disaster Recovery](/docs/59-failure-detection-and-dr/disaster-recovery) — failover ≠ deploy strategy.
- Concrete: [ArgoCD](/docs/25-cicd/argocd), [Kubernetes](/docs/19-container-orchestration/kubernetes), [Service Mesh](/docs/22-service-mesh/istio).
