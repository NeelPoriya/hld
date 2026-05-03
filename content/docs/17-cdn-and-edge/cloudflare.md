---
title: "Cloudflare"
description: "Cloudflare is a global edge platform — CDN, DDoS protection, DNS, WAF, plus Workers (V8 isolates), R2 (zero-egress object storage), D1 (SQLite at edge), and Tunnel (origin without public IP)."
---

> Category: CDN / Edge Platform · Provider: Cloudflare · License: Proprietary (managed)

## TL;DR
Cloudflare is far more than a CDN — it's a **global edge platform** with 300+ PoPs across 120+ countries. Beyond traditional CDN/WAF/DNS/DDoS, it offers a programmable edge stack: **Workers** (V8 isolates running JavaScript / WASM in milliseconds at the edge), **R2** (S3-compatible object store with **zero egress fees**), **D1** (SQLite at the edge), **KV** (eventually-consistent key-value), **Durable Objects** (single-instance serverless with strong consistency), and **Tunnel** / **Access** for zero-trust origin connectivity. Reach for Cloudflare when you want **best-in-class CDN + DDoS** plus **rich programmable edge** without per-region orchestration.

## What problem does it solve?
- **Global low-latency delivery** with PoPs closer to users than most clouds.
- **DDoS / WAF / Bot protection** included in base tier; mature enterprise stack on top.
- **Egress cost** — R2's zero-egress changes the economics for media-heavy workloads.
- **Edge compute** — Workers cold-start in microseconds (V8 isolates, not containers); enables real apps at edge, not just edge logic.
- **Origin protection** — Cloudflare Tunnel + Access let origin run with no public IP.

## When to use
- **Public web traffic** that benefits from a global CDN + DDoS shield.
- **Static + dynamic sites** with heavy edge logic (Workers / Pages).
- **Egress-heavy workloads** — video, images, downloads — where R2's pricing is dramatic vs S3.
- **Edge-rendered apps** (Next.js / Remix / Astro / SvelteKit) deployed on Workers / Pages.
- **Global low-latency APIs** with KV / D1 / Durable Objects holding state at the edge.
- **Zero-trust networking** — Cloudflare Access + Tunnel replace VPNs.

## When NOT to use
- **You want pure infrastructure neutrality** — Cloudflare's edge is its proprietary stack.
- **Heavy compute at edge** — Workers have CPU time limits (10-50ms typical, 30s extended); use a region for big jobs.
- **Workloads requiring large egress to AWS-only services** — placing data on Cloudflare R2 means cross-cloud reads to AWS compute may cost.
- **Strict regulatory data residency** — Cloudflare's network is global; placement controls exist but are coarser than per-region cloud.

## Product Stack
- **CDN + caching** — global cache, configurable per zone / route.
- **DNS** — anycast authoritative DNS with sub-10-ms global lookup.
- **WAF + Bot Management + Rate Limiting** — managed and custom rules.
- **DDoS Protection** — auto-mitigation up to terabits / sec at L3-7.
- **Workers** — V8 isolates; JS/TS/WASM/Rust/Python; no cold starts; deployed globally instantly.
- **R2** — S3-compatible object store with zero egress fees.
- **KV** — eventually-consistent low-latency global KV (read-heavy).
- **D1** — SQLite at the edge with global read replicas.
- **Durable Objects** — single-instance JS objects with strong consistency + transactional storage.
- **Queues** — at-least-once message queue for Workers.
- **Pages** — static / SSR site hosting on Workers.
- **Access + Tunnel** — zero-trust auth + origin without public IP.

```javascript
// Cloudflare Worker: edge API with KV cache + R2 fallback
export default {
    async fetch(req, env, ctx) {
        const url = new URL(req.url);
        const key = url.pathname.slice(1);

        // Try edge KV cache (fast, eventually consistent globally)
        let body = await env.MY_KV.get(key, "stream");
        if (body) return new Response(body, { headers: { "x-cache": "kv" } });

        // Miss → fetch from R2 (object storage, zero egress)
        const obj = await env.MY_BUCKET.get(key);
        if (!obj) return new Response("Not Found", { status: 404 });

        // Async-populate KV (don't block the response)
        const cloned = obj.body.tee();
        ctx.waitUntil(env.MY_KV.put(key, cloned[1], { expirationTtl: 3600 }));

        return new Response(cloned[0], { headers: { "x-cache": "r2" } });
    }
};
```

## Architecture
- **300+ PoPs** with anycast routing — clients hit the nearest PoP.
- **Cache hierarchy** — edge cache → tiered cache (regional, optional) → origin.
- **Workers runtime** — V8 isolates share a process, microsecond cold-start, sandboxed APIs.
- **Storage products** are all globally addressable; each has its own consistency story (KV = eventual, D1 = strong-per-replica, Durable Objects = strong per object).
- **Argo Smart Routing** — adaptive routing across CF backbone for faster origin connections.

## Consistency Models (per product)
- **CDN cache**: TTL + revalidation; instant purge available.
- **KV**: eventual consistency; reads are < 5 ms at edge; writes propagate seconds.
- **R2**: strong read-after-write per object (similar to S3 in 2026).
- **D1**: strong consistency on primary writer; read replicas are eventually consistent.
- **Durable Objects**: strong consistency, per-object serialization, transactional.

## Trade-offs

| Strength | Weakness |
|---|---|
| Largest free CDN tier; generous DDoS protection | Vendor lock-in to Cloudflare-specific runtimes |
| Workers: microsecond cold starts | CPU time limits (10-50 ms typical) |
| R2 zero egress; aggressive on egress economics | KV / D1 / Workers ecosystem is younger than AWS equivalents |
| Tight integration: KV, R2, D1, Queues all in one Worker | Some products (D1) still maturing |
| Argo Smart Routing accelerates uncacheable APIs | Cross-cloud (Cloudflare ↔ AWS/GCP) bandwidth still costs from the cloud side |
| Pages / Workers good for full edge-rendered apps | Limited GPU / heavy compute at edge |

## Common HLD Patterns
- **Edge-rendered SPA / SSR:** Pages + Workers serve hydrated HTML from nearest PoP; KV holds session; R2 holds assets.
- **Image delivery:** Cloudflare Images / R2 + Worker handles dynamic resizing/format negotiation; zero egress to clients.
- **Global API gateway:** Worker authenticates JWT, looks up rate limits in KV, routes to nearest origin via Argo.
- **Origin without public IP:** Cloudflare Tunnel from origin to nearest PoP; Access handles SSO; no inbound rules.
- **At-edge AB testing:** Worker reads cookie or uses bucketing function; serves variant from cache.
- **Scheduled jobs at edge:** Cron Triggers fire Workers on schedule; useful for warming caches / cleaning KV.

## Common Pitfalls / Gotchas
- **Cache poisoning via headers** — be explicit about cache key inclusion of headers/cookies.
- **Workers CPU limit** — heavy logic OOMs / hits CPU cap; offload to origin or use Durable Objects with separate budget.
- **KV propagation lag** — assume up to ~60 s globally; for strict consistency use Durable Objects or D1.
- **Cold cache after deploy** — first request per PoP misses; tier-1 caches help; pre-warm if SLO-critical.
- **R2 region awareness** — R2 is regional under the hood with global metadata; choose primary jurisdiction.
- **Workers limits** — sub-request count, response size, total CPU; design idempotent, short request paths.
- **DNS propagation when changing nameservers** — initial onboarding requires nameserver change at registrar.

## Interview Cheat Sheet
- **Tagline:** Global CDN + edge platform with V8-isolate Workers, zero-egress R2, KV/D1/Durable Objects, and zero-trust networking.
- **Best at:** programmable edge, egress-heavy workloads (R2), DDoS, global low-latency APIs, edge-rendered apps.
- **Worst at:** heavy compute at edge, strict regional data residency, AWS-native deep integrations.
- **Scale:** terabits/sec global capacity; trillions of requests / month.
- **Distributes how:** anycast DNS / BGP; cache hierarchy with optional tiered caching + Argo Smart Routing.
- **Consistency / state:** product-specific — KV eventual, R2 strong-per-object, D1 strong-per-replica, Durable Objects strong-per-object with transactions.
- **Killer alternative:** AWS CloudFront (AWS-native), Fastly (instant purge, Compute@Edge / WASM), Akamai (legacy enterprise), Vercel / Netlify (Workers-equivalent built on infra including Cloudflare).

## Further Reading
- Cloudflare docs: <https://developers.cloudflare.com/>
- Workers: <https://developers.cloudflare.com/workers/>
- R2: <https://developers.cloudflare.com/r2/>
- Durable Objects: <https://developers.cloudflare.com/durable-objects/>
- Architecture explainer: <https://blog.cloudflare.com/how-we-built-the-cloudflare-network/>
