---
title: "Multi-tenancy: Silo, Pool, Hybrid Models"
description: "How to serve many customers from one platform — silo (DB per tenant), pool (shared everything with tenant_id), hybrid (pool by default, silo for premium). Trade-offs in cost, isolation, performance, and noisy-neighbor risk."
---

> Topic: Key Concept · Category: Multi-tenancy Patterns · Difficulty: Intermediate

## TL;DR
Three strategies for serving multiple customers (tenants) from one SaaS platform:
- **Silo** — separate database / instance per tenant. Maximum isolation; expensive; per-tenant scaling. (Snowflake's per-account, dedicated Postgres clusters per enterprise.)
- **Pool** — single shared database; rows have `tenant_id`. Cheap; high density; noisy-neighbor risk. (Stripe, GitHub, most B2B SaaS.)
- **Hybrid** — pool by default (free / mid tier); silo for premium / enterprise tier.

The deeper truth: **multi-tenancy is the SaaS economic model** — operating cost ÷ many customers. Pool is cheapest; silo is safest; most successful B2B SaaS run hybrid (pool for SMB; silo for enterprise contracts).

## What problem does it solve?
- **Cost efficiency** — one operational team serves thousands of customers.
- **Tenant isolation** — one tenant's bug / load doesn't affect others.
- **Compliance / data residency** — enterprise often wants their data segregated.
- **Per-tenant scaling** — large customers can pay for dedicated infra.
- **Noisy-neighbor mitigation** — one heavy user can't crater performance for the rest.

## How they work

### Pool (shared everything)

```text
   ┌─────────────────────────────────────┐
   │       Single application fleet      │
   │       (stateless, horizontal scale) │
   └────────────────┬────────────────────┘
                    │
   ┌────────────────▼────────────────────┐
   │       Single shared database        │
   │   tenant_id column on every row     │
   │   RLS / app-layer filter            │
   └─────────────────────────────────────┘
```

- Every query: `WHERE tenant_id = ?`.
- Row-level security (Postgres RLS) or app-layer filtering.
- All tenants share schema, hardware, indexes.

### Silo (full isolation)

```text
   Tenant A:   ┌─app fleet─┐ → ┌─DB A─┐
   Tenant B:   ┌─app fleet─┐ → ┌─DB B─┐
   Tenant C:   ┌─app fleet─┐ → ┌─DB C─┐
```

- Per-tenant database (or per-tenant schema, or per-tenant cluster).
- Routing layer maps tenant → backend.
- Isolation is physical / logical.

### Hybrid

```text
   Pool tier:    SMB customers → shared DB
   Silo tier:    Enterprise → dedicated clusters
   Premium:      "noisy-neighbor protection" → reserved capacity within pool
```

## When to use each (real-world examples)

### Pool
- **B2C SaaS** (millions of small users): Stripe, GitHub, Slack free tier, Trello, Asana, Linear, Notion (largely pool with optimizations).
- **High-density SaaS** with low per-tenant cost.
- **Fast onboarding** — new tenant = new row, not new infra.

### Silo
- **Enterprise SaaS** with strict data residency / compliance: Salesforce orgs, Workday, large Snowflake accounts, dedicated AWS RDS clusters.
- **Banks, healthcare, government** customers.
- **Customers who pay for dedicated**.
- **Per-tenant performance SLOs.**

### Hybrid
- **Most successful B2B SaaS** at scale.
- **Free / Pro tier in pool; Enterprise in silo.**
- **Self-serve in pool; enterprise contracts in silo.**

## Things to consider / Trade-offs

### Pool
**Pros:**
- Cheapest per tenant.
- Easy schema migrations (one DB).
- Easy global features.
- High density.

**Cons:**
- **Noisy neighbor:** one tenant's huge query slows everyone.
- **Blast radius:** a bug deletes wrong rows → affects all tenants.
- **Can't easily upgrade one tenant** to new schema.
- **Compliance hard** — "show me my data"; "delete only my data."
- **Per-tenant performance SLOs hard.**

### Silo
**Pros:**
- Strong isolation.
- Per-tenant resource scaling.
- Compliance trivial — "your data is in your DB."
- Per-tenant backup / restore.
- Per-tenant schema variation possible (rarely a good idea).

**Cons:**
- **High cost** — minimum infra per tenant.
- **Operational overhead** — schema migrations × N tenants.
- **Onboarding latency** — new DB takes minutes.
- **Cross-tenant queries impossible** without ETL layer.
- **Resource fragmentation** — small tenants waste capacity.

### Hybrid
**Pros:**
- Cost optimization for most + isolation for top tier.
- Migration path from pool → silo as customer grows.

**Cons:**
- **Two operational models** to maintain.
- **Schema migration complexity** doubles.
- **Routing layer added complexity.**

### Tenant routing
- **Subdomain:** `tenant1.app.com`, `tenant2.app.com`.
- **Path:** `app.com/tenant1/...`.
- **JWT claim:** every token includes `tenant_id`.
- **Header:** `X-Tenant-ID`.

### Pool isolation techniques
- **Row Level Security (RLS):** Postgres / SQL Server enforce `tenant_id` automatically.
- **App-layer filtering:** every query has `WHERE tenant_id = ?`.
- **Schema-per-tenant (in shared DB):** middle ground; same Postgres instance, separate schemas.
- **Per-tenant rate limits / quotas.**
- **Per-tenant connection pools.**
- **Resource governor** (SQL Server) limiting heavy tenants.

### Silo at multiple levels
- **Per-tenant database** in same instance (cheap silo).
- **Per-tenant cluster** (real silo).
- **Per-tenant region** for residency.

### Noisy-neighbor mitigation in pool
- **Per-tenant rate limits.**
- **Per-tenant connection pool / thread pool** ([bulkhead](/docs/60-microservices-patterns/sidecar-and-bulkhead)).
- **Query cost limits** — kill queries > X seconds.
- **Read replicas** for heavy reads per tenant.
- **Resource governor / cgroups** per tenant.
- **Shuffle sharding** — randomly distribute tenants across N shards so one bad tenant only affects 1/N.

### Shuffle sharding
- AWS Route 53's pattern: each tenant assigned a random K-of-N shard subset.
- A bad tenant only affects their K shards; other tenants on different K-shards are safe.
- Used by AWS Route 53, S3, etc.

### Schema migrations
- **Pool:** one migration; risky if tenant-specific columns differ.
- **Silo:** N migrations; orchestration tool needed (Liquibase, Flyway).
- **Mixed schema versions** across tenants during rollout.

### Backups + restore
- **Pool:** full DB backup; per-tenant restore is hard.
- **Silo:** trivial per-tenant restore.

### Per-tenant analytics
- **Pool:** trivial (just `WHERE tenant_id = ?` aggregations).
- **Silo:** ETL + central warehouse needed.

## Common pitfalls
- **Forgetting `tenant_id` filter** in pool — data leak.
- **Hardcoded admin queries without `tenant_id`** — count or list across all tenants.
- **Cross-tenant joins** — pool data leaking via reports.
- **No per-tenant rate limiting** — one tenant DOSes everyone.
- **Silo schema drift** — different tenants on different versions; bug fixes incomplete.
- **Migration runs on N silos serially** — takes hours.
- **Migration runs on N silos in parallel** — overwhelms DB infra.
- **Hot tenant in pool** — one tenant uses 80% of resources.
- **Shared cache without tenant key** — Tenant A sees Tenant B's data.
- **JWT without tenant claim** — auth without authorization scope.
- **Test data in production tenant** — leaks via queries.
- **Connection pool exhaustion** by one tenant.
- **Query optimizer choosing index without tenant_id leading** — full scan.
- **No per-tenant observability** — can't tell who's affected by an incident.
- **Compliance "delete my data"** in pool without proper audit / FK cleanup.
- **Tenant-aware caching** — sharing cache across tenants → leak.

## Interview Cheat Sheet
- **Three models:** silo (DB per tenant), pool (shared with tenant_id), hybrid.
- **Pool:** cheap, dense, noisy-neighbor risk. SMB SaaS default.
- **Silo:** isolated, expensive, compliance-friendly. Enterprise default.
- **Hybrid:** most SaaS at scale; pool for free/pro, silo for enterprise.
- **Pool isolation:** RLS or app-layer; per-tenant rate limits + bulkheads.
- **Shuffle sharding** limits blast radius of one bad tenant.
- **Always tenant_id in:** JWT claims, every query, cache keys, observability tags.
- **Schema migration discipline** — backward-compat rules apply; orchestrate across silos.
- **Per-tenant SLOs** require silo or strong pool isolation.
- **Killer phrase:** "Pool wins on cost, silo wins on isolation, hybrid wins on enterprise sales — and shuffle sharding limits the blast radius of pool's noisy neighbors."

## Related concepts
- [Sharding & Partitioning](/docs/42-data-distribution/sharding-and-partitioning) — silo is sharding by tenant.
- [Bulkhead Pattern](/docs/60-microservices-patterns/sidecar-and-bulkhead) — per-tenant resource isolation.
- [Rate Limiting](/docs/45-resilience-patterns/rate-limiting) — per-tenant caps.
- [RBAC / ABAC](/docs/55-security-and-auth/rbac-vs-abac) — per-tenant authz.
- Concrete: PostgreSQL RLS, [Vitess](/docs/01-relational-databases/aurora) (Vitess shards customers by keyspace), [Snowflake](/docs/12-data-warehousing/snowflake) (per-account silo).
