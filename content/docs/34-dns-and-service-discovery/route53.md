---
title: "Amazon Route 53"
description: "Route 53 is AWS's authoritative + recursive DNS service — global anycast, programmable routing policies (latency / geo / weighted / failover), private hosted zones, health checks, and 100% SLA on the public DNS query path."
---

> Category: DNS · Provider: AWS · License: Proprietary (managed)

## TL;DR
Route 53 is **AWS's flagship DNS service**, named after port 53 (the TCP/UDP port DNS uses). It's both a **highly-available authoritative DNS** for your domains (zones) and a **domain registrar**. It serves queries from a global **anycast** network of edge locations, has the rare **100% query-response SLA**, and adds programmable **routing policies** — simple, weighted, latency-based, geolocation, geoproximity, multivalue-answer, and failover — that let your DNS itself be a load balancer / traffic engineer / regional failover system. With **health checks**, Route 53 actively probes endpoints and removes unhealthy ones from DNS responses. **Private hosted zones** serve internal records to your VPCs. **Resolver** handles outbound DNS resolution for your VPC and supports inbound / outbound endpoints for hybrid DNS (on-prem ↔ cloud). Reach for Route 53 when you're AWS-native, want DNS that's a first-class traffic-control plane, or need active-active / regional failover wired through DNS.

## What problem does it solve?
- **Generic DNS providers don't do health checks + failover** — Route 53 does, natively.
- **Regional traffic distribution** — latency-based routing automatically sends users to the closest healthy region.
- **Hybrid DNS** — on-prem ↔ AWS resolution unified through Resolver endpoints.
- **Private DNS for VPCs** — internal hostnames without exposing publicly.
- **Programmable failover** — DNS itself becomes the regional cutover mechanism.
- **Domain + DNS together** — registrar features integrated for AWS shops.

## When to use
- **AWS-native architectures** — multi-region active-active with latency or geo routing.
- **Active-active / DR** — primary fails, Route 53 health check flips DNS to secondary region.
- **Hybrid cloud** — on-prem ↔ AWS DNS resolution.
- **Private DNS** for VPC-internal records (`db.internal.acme.com`).
- **Multi-account DNS** — shared central zone with cross-account resolution via Resolver rules.
- **CloudFront / ALB / NLB / API Gateway integrations** — alias records (no A record + IP needed).

## When NOT to use
- **Multi-cloud agnostic** — Cloudflare / NS1 are vendor-neutral.
- **DNSSEC + DDoS-protected at edge with DNS Firewall + analytics** — Cloudflare DNS edges Route 53 on UX.
- **Need DNS edge filtering / WAF + bot management at DNS layer** — Cloudflare.
- **Tiny single-region apps** — any DNS provider works; Route 53 features are wasted.

## Core Concepts
- **Hosted Zone** — collection of records for a domain (`acme.com`); public or private.
- **Record Set** — `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `SRV`, `CAA`, `NS`, `SOA`, `PTR`.
- **Alias Record** — Route 53-specific: A / AAAA pointing to AWS resources (CloudFront, ALB, NLB, API Gateway, S3 website, ELB, Beanstalk env, VPC interface endpoints) — resolves to the right IPs without you managing them, and is free.
- **Routing Policy:**
  - **Simple** — single answer.
  - **Weighted** — split traffic by weight; A/B / canary.
  - **Latency** — answer is the AWS region with lowest measured latency from the resolver.
  - **Geolocation** — by country / continent / state.
  - **Geoproximity** (Traffic Flow) — bias by distance + bias factor.
  - **Failover** — primary + secondary; secondary served if primary fails health check.
  - **Multivalue Answer** — up to 8 answers; client picks one (rudimentary load balance).
- **Health Check** — HTTP / HTTPS / TCP probe; CloudWatch alarm-based; calculates "healthy" status used by failover / weighted / latency policies.
- **Traffic Flow** — visual routing policy designer combining the above.
- **Resolver** — VPC DNS resolver; supports **inbound endpoints** (on-prem → resolve AWS internal) and **outbound endpoints** (AWS → resolve on-prem domains).
- **Private Hosted Zone** — zone visible only to associated VPCs.
- **DNSSEC** — sign zones with KMS-managed keys; published DS records to TLD.
- **Application Recovery Controller (ARC)** — orchestrates regional failover with safety quorum.

```hcl
# Terraform: hosted zone + alias to ALB + latency-based multi-region
resource "aws_route53_zone" "acme" {
  name = "acme.com"
}

# Latency-routed: us-east-1 record
resource "aws_route53_record" "api_use1" {
  zone_id = aws_route53_zone.acme.zone_id
  name    = "api.acme.com"
  type    = "A"
  set_identifier = "us-east-1"
  latency_routing_policy { region = "us-east-1" }
  alias {
    name                   = aws_lb.use1.dns_name
    zone_id                = aws_lb.use1.zone_id
    evaluate_target_health = true
  }
  health_check_id = aws_route53_health_check.api_use1.id
}

# Latency-routed: eu-west-1 record (same name, same type, different region)
resource "aws_route53_record" "api_euw1" {
  zone_id = aws_route53_zone.acme.zone_id
  name    = "api.acme.com"
  type    = "A"
  set_identifier = "eu-west-1"
  latency_routing_policy { region = "eu-west-1" }
  alias {
    name                   = aws_lb.euw1.dns_name
    zone_id                = aws_lb.euw1.zone_id
    evaluate_target_health = true
  }
  health_check_id = aws_route53_health_check.api_euw1.id
}

# Health check
resource "aws_route53_health_check" "api_use1" {
  fqdn              = aws_lb.use1.dns_name
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = 3
  request_interval  = 30
}
```

```text
# Failover (active-passive)
api.acme.com    A   <ALIAS-primary-ALB>   set_id=primary    failover=PRIMARY    health=hc-primary
api.acme.com    A   <ALIAS-dr-ALB>        set_id=dr         failover=SECONDARY  health=hc-dr
```

## Architecture
- **Anycast network** — same IPs announced from many AWS edge locations; BGP routes resolvers to nearest.
- **Authoritative servers** — serve your zones; horizontally scaled per zone.
- **Health checkers** — distributed across regions; majority-vote determines health to avoid single-region false positives.
- **Resolver service** — per-VPC resolver answers internal queries; Inbound / Outbound endpoints for hybrid.
- **Control plane** (zone management) is regional (us-east-1 historically); data plane (queries) is global.
- **Traffic Flow policies** versioned and deployable via JSON.

## Trade-offs

| Strength | Weakness |
|---|---|
| 100% query SLA on public DNS | Control plane (mgmt API) tied to us-east-1 historically |
| Programmable routing (latency / geo / weighted / failover) | Vendor lock-in vs Cloudflare / NS1 |
| Alias to AWS resources | Alias only works to AWS targets |
| Health checks with majority-vote | Health check pricing per check + per request |
| Private Hosted Zones for VPC-internal | Cross-account sharing requires Resolver rules / RAM |
| Hybrid via Resolver endpoints | Resolver endpoints aren't free; hourly per IP |
| Strong AWS integration (CloudFront, ALB, …) | DNS-level WAF / filtering: less than Cloudflare |
| DNSSEC supported | Less polished UI vs DNS-focused vendors |

## Common HLD Patterns
- **Active-active multi-region** — latency-based routing; users hit nearest region; health check pulls failed region.
- **Active-passive DR** — failover routing; primary region; secondary serves only if health fails (classic warm-standby).
- **Canary deploy via DNS weights** — 95% old, 5% new; ramp weights; simpler than service-mesh splits for DNS-cached traffic.
- **Geo-restricted endpoints** — geolocation policy returns different IPs per country (compliance / pricing / language).
- **Hybrid DNS** — Resolver outbound endpoint forwards `*.corp.acme.com` to on-prem DNS; Inbound endpoint lets on-prem resolve `*.aws.acme.com`.
- **Private Hosted Zone for service mesh** — internal `db.internal.acme.com`; only VPCs see it.
- **Multi-account central DNS** — central account hosts zones; other accounts use Resolver rules to resolve them via RAM-shared zones.
- **DNSSEC with KMS** — KMS asymmetric keys sign zone; DS records published to registrar.

## Common Pitfalls / Gotchas
- **TTL too high** during failover — a 1-hour TTL means DR cutover stretches; use 30–60s for failover-critical records.
- **Resolver caching downstream** — your TTL is a hint; ISPs / clients may keep records longer.
- **Alias vs CNAME at zone apex** — CNAME at apex is illegal; Alias (or ANAME via other providers) is the workaround.
- **Health check from public IPs** — your origin must allow Route 53 health checker IP ranges.
- **Cross-account DNS sharing** — confusing first-time setup; use AWS RAM or Private Zone associations.
- **Cost of geoproximity / Traffic Flow** — Traffic Policies bill per-policy-record, can surprise.
- **DNSSEC misconfig** — KSK rotation / DS record propagation must be flawless or you take the domain offline.
- **Private zone overlap with public zone** — different records for the same name in VPC vs Internet; intentional, but easy to confuse.
- **Health check false positives** during AWS-region issues — health checkers may agree wrongly; manual override sometimes needed.
- **Edge case: MX / SPF / DMARC** — these aren't aliases; manage carefully when changing email providers.
- **NS records changes propagate slowly** at TLD level; plan migrations.

## Interview Cheat Sheet
- **Tagline:** AWS authoritative + recursive DNS — global anycast, programmable routing policies, health checks, alias records to AWS resources, private VPC zones.
- **Best at:** AWS-native multi-region routing + failover, hybrid DNS, private zones, DNS-driven traffic engineering.
- **Worst at:** vendor-neutral / multi-cloud (Cloudflare / NS1), DNS-edge filtering / WAF, tiniest one-record use cases.
- **Scale:** trillions of queries per day across the platform; 100% query SLA on public DNS.
- **Distributes how:** anycast across global edges; control plane us-east-1; majority-vote health checks.
- **Consistency / state:** zone changes propagate within seconds; DNS-level eventual consistency by TTL.
- **Killer alternative:** Cloudflare DNS (free, global, fast), NS1 (multi-cloud, programmable), Google Cloud DNS, Azure DNS, Akamai Edge DNS, Dyn (Oracle), self-hosted PowerDNS / NSD.

## Further Reading
- Official docs: <https://docs.aws.amazon.com/Route53/>
- Routing policies: <https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy.html>
- Resolver: <https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver.html>
- Application Recovery Controller: <https://docs.aws.amazon.com/r53recovery/>
