---
title: "Amazon CloudFront"
description: "Amazon CloudFront is AWS's global CDN — caches content at 600+ edge locations, terminates TLS, integrates with S3 / ALB / API Gateway / Lambda@Edge for low-latency global delivery."
---

> Category: CDN / Edge · Provider: AWS · License: Proprietary (managed)

## TL;DR
Amazon CloudFront is AWS's global content delivery network. It caches static and dynamic content at **600+ edge locations** (Points of Presence) and **regional edge caches**, terminates TLS at the edge, and forwards cache misses to origins (S3, ALB, EC2, custom HTTP origins, API Gateway). It also runs **Lambda@Edge** and **CloudFront Functions** for at-edge compute. Reach for CloudFront when you're already on AWS — it's the natural CDN with first-class S3 integration, OAC for private origins, and tight WAF / Shield ties.

## What problem does it solve?
- **Latency**: serving from a PoP near the user (10-50 ms) vs the origin region (100-300 ms intercontinental).
- **Origin shielding**: cache absorbs read traffic; origin only sees misses + revalidations.
- **DDoS mitigation**: AWS Shield Standard is included; Shield Advanced + WAF integrate at the CloudFront layer.
- **TLS termination at edge**: clients connect to nearest PoP, which holds short-lived TLS connection to origin.
- **Edge compute**: rewrite headers / URLs / A-B test / authenticate without round-tripping to origin.

## When to use
- **Static asset delivery** — JS/CSS/images/video from S3.
- **Dynamic content** with cache rules (varying by query string / cookie / header).
- **API acceleration** — TCP / TLS optimization to API Gateway or ALB even for uncacheable APIs.
- **Live + on-demand video** — HLS / DASH chunks via CloudFront.
- **At-edge auth / rewrites** — JWT validation, geo-blocking, A/B routing.
- **Origin protection** — keep origin private; CloudFront is the only public surface.

## When NOT to use
- **Single-region, intra-VPC traffic** — overkill; ALB is enough.
- **You need provider-neutral CDN** — Cloudflare / Fastly / Akamai may fit better.
- **Complex programmable edge logic** — CloudFront Functions is restricted; Cloudflare Workers / Fastly Compute@Edge offer more.
- **You want cheaper egress universally** — Cloudflare's R2 + free egress story is compelling for static workloads.

## Data Model
- **Distribution** — the CDN configuration unit; has one or more **origins** and a set of **cache behaviors** (path-pattern → origin + cache rules).
- **Cache key** — derived from URL + selected query strings + headers + cookies; controls cache hits.
- **TTLs** — `MinTTL`, `DefaultTTL`, `MaxTTL`; respect Cache-Control unless overridden.
- **Origin** — S3 bucket, MediaPackage, ALB, ELB, custom HTTP, API Gateway.
- **OAI / OAC** — Origin Access Identity / Control to make S3 buckets reachable only via CloudFront.

```bash
# Invalidate a path (after a deploy)
aws cloudfront create-invalidation \
  --distribution-id E1ABCD2EFGHIJK \
  --paths "/index.html" "/assets/*"
```

```javascript
// CloudFront Function: rewrite / strip query strings, set headers
function handler(event) {
    var req = event.request;
    if (req.uri.endsWith('/')) req.uri += 'index.html';

    // Block non-allowed countries (example)
    var country = event.viewer.countryCode;
    if (country === 'XX') {
        return { statusCode: 403, statusDescription: 'Blocked' };
    }
    return req;
}
```

## Architecture
- **Edge locations (PoPs)** — 600+ globally; cache + TLS terminate.
- **Regional edge caches** — larger mid-tier caches behind PoPs, shielding origins from per-PoP misses.
- **Origin Shield** — opt-in extra layer that consolidates misses through a single region.
- **Anycast routing** — clients hit the nearest PoP via DNS + BGP anycast.
- **Lambda@Edge** runs in regional edge caches; **CloudFront Functions** run at PoPs (millis budget, JS only).

## Caching Behavior
- Cache key configurable via cache policies (which query strings / headers / cookies are part of key).
- **Stale-while-revalidate** + **stale-if-error** supported via response headers.
- **Negative caching** — 404s/5xx cached briefly to avoid hammering origin.
- **Object versioning** — best practice: include hash in URL (`/app.a1b2c3.js`) instead of relying on invalidations.

## Trade-offs

| Strength | Weakness |
|---|---|
| Tight AWS integration (S3, ALB, WAF, Shield) | Egress pricing; cost scales with traffic |
| 600+ PoPs, regional edge caches, origin shield | Edge compute is more limited than Cloudflare Workers / Fastly |
| OAC for private S3 origins | Cache invalidation has 1000-path/month free tier; bulk invalidations cost |
| Lambda@Edge = Node.js / Python at edge | Lambda@Edge regional, latency vs CloudFront Functions |
| Excellent for video (CMAF, MediaPackage tie-ins) | Vendor lock-in to AWS feature set |
| AWS Shield Standard included | UI / config sprawl (cache policies, behaviors, origins) |

## Common HLD Patterns
- **Static site:** S3 (private, OAC) + CloudFront (CDN) + ACM (TLS) + Route 53 (DNS).
- **API acceleration:** CloudFront in front of API Gateway / ALB; cache safe GETs; uncacheable POSTs benefit from TCP/TLS edge optimization.
- **Hybrid origin:** path-pattern routing — `/static/*` → S3, `/api/*` → ALB, `/admin/*` → custom origin.
- **Geo-block / geo-route:** CloudFront Functions filter by country.
- **A/B testing at edge:** Lambda@Edge sets cookie + chooses origin variant.
- **Live video:** MediaLive → MediaPackage → CloudFront → players.
- **DDoS shield:** Shield Advanced + WAF rules at CloudFront before traffic reaches origin.

## Common Pitfalls / Gotchas
- **Cache key bloat** — caching by all headers/cookies = near-zero hit rate; whitelist only what matters.
- **Invalidation cost** — relying on invalidations instead of versioned URLs gets expensive.
- **Origin protocol mismatch** — origin returns relative URLs assuming HTTP, CloudFront serves HTTPS → mixed content.
- **Compression** — enable Gzip/Brotli at CloudFront; otherwise 5x bandwidth waste.
- **Signed URLs vs Signed Cookies** — for many objects per session, signed cookies are way cheaper than per-object signed URLs.
- **Long TTL + frequent updates** — without versioned URLs, users see stale content until TTL expires.
- **Lambda@Edge cold starts** — keep functions tiny; viewer-request runs on every request.
- **WAF rule cost** — per-request charges add up at high QPS.

## Interview Cheat Sheet
- **Tagline:** AWS's global CDN — 600+ PoPs, S3-native, edge compute via Lambda@Edge / CloudFront Functions.
- **Best at:** AWS-native static + dynamic delivery, S3-backed sites, HLS/DASH video, edge auth, DDoS protection.
- **Worst at:** complex programmable edge (Workers / Compute@Edge are richer), heavy egress budgets, multi-cloud agnostic CDN.
- **Scale:** trillions of requests / mo across the global network.
- **Distributes how:** anycast DNS + BGP routes clients to nearest PoP; PoPs cache; misses go to regional edge caches → origin shield → origin.
- **Consistency / cache:** TTL-based; SWR + SIE; manual invalidations; versioned URLs preferred.
- **Killer alternative:** Cloudflare (better edge compute + free egress), Fastly (instant purge, Compute@Edge), Akamai (legacy enterprise reach).

## Further Reading
- Official docs: <https://docs.aws.amazon.com/cloudfront/>
- Caching strategy: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-policies.html>
- Lambda@Edge: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge.html>
- CloudFront Functions: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html>
