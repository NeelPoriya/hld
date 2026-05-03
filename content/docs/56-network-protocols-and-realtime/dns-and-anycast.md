---
title: "DNS, Anycast & GeoDNS"
description: "How a hostname becomes an IP — DNS records, recursive resolution, TTL, DNSSEC. Anycast for one IP serving from many places. GeoDNS / latency-based routing for global apps."
---

> Topic: Key Concept · Category: Network Protocols & Real-time · Difficulty: Foundational

## TL;DR
- **DNS** — the distributed phonebook that maps hostnames to IPs (and other records). Hierarchical (`com → google.com → mail.google.com`), cached at every layer, controlled by **TTL**.
- **Anycast** — same IP advertised from many physical locations; BGP routes you to the nearest one. Used by **Cloudflare, Google DNS (8.8.8.8), Cloudflare DNS (1.1.1.1), AWS Route 53, public CDNs**.
- **GeoDNS / latency-based routing** — DNS server returns different answers based on **client's location / measured latency**. Used to route users to nearest region of a multi-region app.
- **Anycast** + **GeoDNS** are different layers: Anycast routes packets at the IP/BGP layer; GeoDNS chooses which IP to give the client.

DNS is the **most under-appreciated dependency in HLD interviews** — every system relies on it; TTL choices determine failover speed.

## What problem does each solve?

### DNS
- **Translate hostnames to IPs** — humans type names, not IPs.
- **Indirection** — change IPs without breaking clients.
- **Failover** — return different IPs based on health.
- **Email routing** (MX), service discovery (SRV), text metadata (TXT), DKIM / SPF / DMARC (TXT).

### Anycast
- **Single IP, multiple locations** — clients hit the nearest one automatically.
- **DDoS resilience** — distributes attack across many sites.
- **Low-latency public services** (DNS resolvers, CDNs).

### GeoDNS / latency-based
- **Multi-region apps** — route EU users to EU region.
- **Compliance** (data residency).
- **Latency optimization.**
- **Failover** — exclude unhealthy regions.

## How they work

### DNS resolution

```text
Client                                           Internet
  │   1. "What's mail.google.com?"                  │
  │   ──► local DNS (e.g., 8.8.8.8) ──►             │
  │                                                 │
  │   2. resolver asks root server (.)              │
  │   ◄── ".com is at this NS"                      │
  │                                                 │
  │   3. resolver asks .com NS                      │
  │   ◄── "google.com is at these authoritative NSs"│
  │                                                 │
  │   4. resolver asks google.com NS                │
  │   ◄── "mail.google.com → 142.251.32.197"        │
  │                                                 │
  │   5. resolver returns IP to client (cached      │
  │      with TTL)                                  │
```

### DNS record types
- **A / AAAA** — hostname → IPv4 / IPv6.
- **CNAME** — alias one hostname to another (`www → acme.com`).
- **MX** — mail routing (priority + hostname).
- **TXT** — arbitrary text (SPF, DKIM, DMARC, domain verification).
- **NS** — delegate to nameservers.
- **SOA** — start of authority (zone metadata).
- **SRV** — service location with port (`_xmpp._tcp.example.com`).
- **CAA** — which CAs may issue certs for the domain.
- **PTR** — reverse DNS (IP → hostname); used by spam filters.
- **ALIAS / ANAME** (vendor-specific) — apex CNAME.
- **DNSKEY / RRSIG / DS** — DNSSEC records.

### Anycast

```text
   IP 1.1.1.1 advertised from many POPs:

   Tokyo POP     ──BGP──► routes 1.1.1.1
   Frankfurt POP ──BGP──► routes 1.1.1.1
   New York POP  ──BGP──► routes 1.1.1.1
   ...

   Client in Berlin → BGP routes packet to Frankfurt POP (nearest).
   Client in Sydney → BGP routes to Tokyo POP.
```

- **No app-level smarts;** the network does it.
- **Stateless services only** — connections may end up at different POPs after re-routing.
- **DDoS defense:** an attacker hitting 1.1.1.1 from Asia hits Tokyo POP; doesn't affect Frankfurt.

### GeoDNS / latency-based routing
- DNS server has IP geolocation database + per-region IP pools.
- Returns **different A records** based on:
  - Client IP geolocation.
  - Measured latency (Route 53 latency-based).
  - Weighted (canary).
  - Failover (primary / secondary).
  - Geoproximity (with bias).

- **Caveat:** DNS sees the **resolver IP**, not the user IP, unless EDNS Client Subnet (ECS) is enabled.

## When to use each (real-world examples)

### DNS
- **Universal** — every internet system uses it.
- **Service discovery** in some architectures (Kubernetes uses DNS for service names).
- **Email routing** (MX records).
- **Sender authentication** (SPF / DKIM / DMARC TXT records).
- **Domain ownership verification** (TXT records for SaaS).

### Anycast
- **Public DNS resolvers** — 8.8.8.8 (Google), 1.1.1.1 (Cloudflare).
- **CDNs** — Cloudflare, Fastly, AWS CloudFront edges anycast.
- **DDoS scrubbing services.**
- **Public APIs with global users.**
- **AWS Global Accelerator, GCP Anycast IP, Cloudflare Workers.**

### GeoDNS / latency-based
- **Multi-region active-active** — users hit nearest region.
- **Active-passive failover** — primary in us-east-1, failover in us-west-2.
- **Compliance** — EU users to EU servers (data residency).
- **Performance** — CDN edge is closer than origin; latency-based to nearest origin.
- **Used by:** AWS Route 53, GCP Cloud DNS, Cloudflare LB, NS1, Akamai, Dyn.

## Things to consider / Trade-offs

### DNS
- **TTL is the failover SLA.** TTL=300 means 5 minutes worst-case for a failover to propagate.
- **Long TTLs** — cheap (less traffic) + slow failover.
- **Short TTLs** — expensive (more queries) + fast failover.
- **Negative caching** — `NXDOMAIN` results also cached; broken DNS = 5+ minute outage.
- **Resolver caching** — Google DNS, Cloudflare DNS cache aggressively; some respect TTL, some min-TTL.
- **Browser caching** — Chrome / Firefox have their own DNS cache (5-30s typical).
- **DNS over HTTPS (DoH) / over TLS (DoT)** — encrypted DNS; bypasses some ISP-level filtering.
- **Provisioning new DNS records** — instant at authoritative; minutes to hours globally.
- **DNSSEC** — signed records; prevents cache poisoning; complex to operate.
- **Zone delegation** — multi-vendor DNS for redundancy (Route 53 + Cloudflare).

### Anycast
- **Stateless protocols** (UDP / DNS / HTTP request-response) work well.
- **Stateful long-lived connections** can fail mid-session if BGP changes route — apps must handle reconnect.
- **TCP works** with Anycast for typical short connections (HTTP request-response).
- **Operational complexity** — you need BGP peering at each POP.
- **Asymmetric routing** can confuse network monitoring.

### GeoDNS
- **Resolver IP ≠ user IP** — without EDNS Client Subnet, geolocation is rough.
- **Mobile carriers** — single resolver for whole region; user might be far from resolver.
- **Health checks** — DNS provider monitors origin health; removes unhealthy IPs.
- **Failover speed** = TTL + health check interval.
- **Don't cache too long for failover-critical records** — 60s TTL typical for failover.
- **Stickiness** — clients re-resolve at TTL expiry; switch regions on each refresh.
- **Hybrid with anycast** — resolve to anycast IP that's already geographically close; anycast handles the rest.

## Common pitfalls
- **Long DNS TTL during planned migration** — old IP cached for hours.
- **TTL=0 or 1** — DNS amplification cost; doesn't really propagate faster than minutes anyway.
- **DNS as a single point of failure** — use 2 DNS providers (Route 53 + Cloudflare).
- **CNAME at apex** — RFC forbids; use ALIAS / ANAME (vendor-specific) or A record.
- **No DNSSEC + no DoT/DoH** — coffee-shop attacker can poison cache.
- **Trusting `Host` header** — set by client; verify upstream.
- **Forgotten internal DNS** — service mesh / Kubernetes DNS goes down → cluster outage.
- **Health check too aggressive** — flapping; healthy-unhealthy-healthy cycles.
- **GeoDNS without EDNS Client Subnet** — coarse geolocation; users routed sub-optimally.
- **Anycast for stateful WebSocket** — connection drops on BGP reroute.
- **Forgetting MX / SPF / DKIM / DMARC** — emails go to spam.
- **CAA missing** — anyone can request a cert for your domain.
- **PTR record mismatch** — outbound mail rejected by some servers.
- **Domain expiration** — set auto-renew + alerts; lapsed domains have been hijacked.
- **Letting DNS provider be the only auth-DNS** — provider outage = invisible to users globally.
- **Wildcard records** — convenient but match anything; can mask typos that should fail.

## Interview Cheat Sheet
- **DNS:** hierarchical hostname → IP system; cached at every layer; controlled by TTL.
- **TTL = failover SLA** — pick to match your failover requirements (60s for failover-critical).
- **Anycast:** same IP advertised from many places; BGP routes to nearest; stateless services only.
- **GeoDNS:** different A records based on client location / latency; AWS Route 53 / Cloudflare LB.
- **Combine them:** GeoDNS picks nearest region; Anycast IP serves from nearest POP within region.
- **Records to know:** A, AAAA, CNAME, MX, TXT, SRV, NS, SOA, CAA, PTR.
- **Email auth:** SPF (TXT), DKIM (TXT), DMARC (TXT).
- **Two DNS providers** for redundancy.
- **DNSSEC** prevents cache poisoning; DoH/DoT encrypts queries.
- **Killer phrase:** "DNS is your real failover SLA. Pick TTL ≤ your acceptable downtime."

## Related concepts
- [TCP vs UDP & HTTP](/docs/56-network-protocols-and-realtime/tcp-vs-udp-and-http-versions) — DNS is UDP-based.
- [TLS / mTLS](/docs/56-network-protocols-and-realtime/tls-and-mtls) — depends on DNS for hostname.
- [LB Algorithms](/docs/50-network-traffic-routing/load-balancing-algorithms) — geographic routing layer.
- [Disaster Recovery](/docs/59-failure-detection-and-dr/disaster-recovery) — DNS is part of multi-region failover.
- Concrete: [Route 53](/docs/34-dns-and-service-discovery/route53), [Consul](/docs/34-dns-and-service-discovery/consul), [CloudFront](/docs/17-cdn-and-edge/cloudfront), [Cloudflare](/docs/17-cdn-and-edge/cloudflare).
