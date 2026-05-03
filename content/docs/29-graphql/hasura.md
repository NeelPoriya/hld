---
title: "Hasura"
description: "Hasura is the instant-GraphQL engine — point it at Postgres / MySQL / MS SQL / BigQuery / Snowflake and get a fully-featured GraphQL API with permissions, subscriptions, and event triggers in seconds."
---

> Category: GraphQL · Written in: Haskell (engine) + Rust (v3 / DDN) · License: Apache 2.0 (CE) + Proprietary EE features

## TL;DR
Hasura is a **GraphQL Engine that auto-generates the API from your database schema**. Instead of writing resolvers, you connect Hasura to Postgres / MySQL / MS SQL / BigQuery / Snowflake / MongoDB, and it instantly exposes:
- **CRUD GraphQL queries + mutations** for every table.
- **Realtime subscriptions** over WebSocket.
- **Row-level + column-level permissions** declared in YAML / metadata.
- **Relationships** auto-derived from foreign keys.
- **Event Triggers** that POST to webhooks on insert/update/delete.
- **Actions** to wrap REST / serverless functions as GraphQL mutations.
- **Remote Schemas / Joins** to stitch in other GraphQL APIs.

The newer **Hasura DDN** (Data Delivery Network) decouples connectors from engine and supports federation across many sources. Reach for Hasura when you have a primary database (Postgres especially) and want a permission-aware GraphQL layer **without writing resolvers**, especially for internal tools, admin panels, and rapid prototyping.

## What problem does it solve?
- **Writing CRUD resolvers is repetitive** — Hasura generates them.
- **Row-level auth in app code is bug-prone** — Hasura puts it in declarative metadata that the engine enforces.
- **Subscriptions are hard to build right** — Hasura supports them out of the box (live queries on Postgres logical replication / polling).
- **Heterogeneous backends behind one API** — Hasura DDN federates Postgres + Mongo + REST.
- **Speed of development** for internal tools is 10× vs hand-rolled GraphQL.

## When to use
- **Postgres-centric apps** with complex permissions — Hasura's row-level auth shines.
- **Admin panels / internal tools** that need many resolvers fast.
- **Realtime dashboards** — subscription on `SELECT ... WHERE ...` updates clients live.
- **Federated read API** over multiple sources via Remote Joins / DDN.
- **GraphQL on top of legacy DB** without rewriting backend.
- **Rapid prototyping / hackathons** — get a real API in minutes.

## When NOT to use
- **Heavy custom business logic in resolvers** — Hasura supports Actions / hooks but if everything is custom, you're fighting the framework.
- **Schema you do NOT want auto-exposed** — careful permission setup is required; default-deny mindset.
- **Public APIs with strict shape control** — Hasura's auto-generated shape may not match what you want public.
- **Heavy write-paths with side effects** — you'll lean on Actions / Event Triggers; hand-rolled GraphQL may be cleaner.
- **Tiny apps where one or two REST endpoints suffice.**

## Data Model / Concepts
- **Sources** — connected DB(s); each source has tables tracked by Hasura.
- **Track table** — exposes table in GraphQL with auto-generated CRUD.
- **Relationships** — derived from FKs (or manually declared); array (one-to-many) and object (many-to-one).
- **Permissions** — per-role × per-table × {select, insert, update, delete} with row-filter (Boolean expression) + column allowlist + presets.
- **Roles** — derived from request headers (`X-Hasura-Role: user`, `X-Hasura-User-Id: 123`).
- **Computed fields** — Postgres function exposed as a GraphQL field.
- **Actions** — custom GraphQL field that POSTs to a webhook (your microservice / Lambda).
- **Event Triggers** — DB row change → POST to webhook (CDC-lite).
- **Cron Triggers / One-off Scheduled Triggers** — fire webhooks on schedule.
- **Remote Schemas** — merge another GraphQL service into Hasura's schema.
- **Remote Joins** — join across DB tables and remote services in a single query.

```yaml
# metadata: permissions for `orders` table, role=user
table:
  schema: public
  name: orders
select_permissions:
- role: user
  permission:
    columns:
      - id
      - user_id
      - total
      - status
      - created_at
    filter:
      user_id:
        _eq: X-Hasura-User-Id   # row-level: only my orders
    allow_aggregations: true
insert_permissions:
- role: user
  permission:
    columns: [total, items]
    set:
      user_id: X-Hasura-User-Id  # force user_id from JWT, never trust client
    check:
      total: { _gt: 0 }          # only positive totals
update_permissions:
- role: user
  permission:
    columns: [status]
    filter:
      _and:
      - { user_id: { _eq: X-Hasura-User-Id } }
      - { status: { _in: [pending, draft] } }
    check: {}
```

```graphql
# Auto-generated subscription: live order list for current user
subscription MyOrders {
  orders(order_by: { created_at: desc }, limit: 50) {
    id
    total
    status
    items {
      product { id title }
      qty
    }
  }
}
```

## Architecture
- **Hasura Engine (Haskell)** — parses GraphQL → translates to a single SQL query (with joins for relationships) → executes against source.
- **Single-query optimization** — most GraphQL nested queries become **one SQL query**, defeating N+1 by design.
- **Permissions as SQL filters** — `WHERE` clauses are inlined into the generated SQL based on JWT claims.
- **Subscriptions** — live queries (re-evaluate at interval) or DB triggers + LISTEN/NOTIFY (engine choice depends on source).
- **Actions** — Hasura sends synchronous webhook on a custom mutation; webhook returns result.
- **Event Triggers** — Hasura listens to row changes (Postgres `pg_notify` / outbox table); fires webhook async with retry.
- **Hasura DDN** — newer architecture: lightweight Rust engine + per-source NDC connectors; supergraph federation.

## Trade-offs

| Strength | Weakness |
|---|---|
| Instant GraphQL from DB schema | Must enforce permissions correctly — default-allow is dangerous |
| Single-SQL-query execution avoids N+1 | Custom logic requires Actions (not free) |
| Built-in subscriptions | Subscription scale is engine-bound |
| Row-level auth via JWT claims | Schema shape mirrors DB — sometimes you want abstraction |
| Event Triggers + Actions extend cleanly | DB-coupled: changes in DB schema ripple through API |
| Open-source CE; commercial EE for SSO / caching | EE features (caching, query plans, rate limiting) gated to paid |
| Multi-source: Postgres / MySQL / BQ / SF / Mongo | Some connectors lag in features vs Postgres |
| Apollo Federation compatible | Hasura DDN is a different model than v2 — some migration churn |

## Common HLD Patterns
- **Internal admin panel:** Postgres + Hasura + Retool / Forest Admin / your React app — full CRUD with auth in days.
- **Realtime dashboard:** Hasura subscription on aggregated query; updates live as DB changes.
- **JWT-secured public-ish API:** Hasura validates JWT (HS256/RS256/JWKS); maps claims to roles + user-id; row-level auth.
- **Event-driven side effects:** insert into `orders` → Hasura Event Trigger → POST to webhook (Lambda) → kicks off processing.
- **Federation:** Hasura subgraph + Apollo Router gateway; domain teams own subgraphs; Hasura handles DB-backed ones.
- **Actions for non-DB logic:** "checkout" mutation calls Stripe via Action webhook; result merged into GraphQL response.
- **Remote join to enrich:** orders (Hasura) join with shipping (REST microservice) in one GraphQL query.

## Common Pitfalls / Gotchas
- **Default-deny for new tables** — but if you forget to set permissions on a sensitive table, data may be exposed; review before going prod.
- **JWT claims are trusted** — always issue JWT server-side with right claims; never accept client-set role.
- **Heavy nested queries** can generate massive SQL; use depth limit + query allowlist.
- **Subscription cost** — live queries re-run; high subscriber count + complex queries = DB load; rate-limit + share queries.
- **Event Triggers retries** — at-least-once; webhook must be idempotent.
- **Tracking too many tables** — schema bloat; only track what should be exposed.
- **Migrations** — Hasura metadata + DB migrations must move together; use `hasura migrate` + `hasura metadata`.
- **Caching** — query response caching is EE-only; OSS users do edge caching with care.
- **Mutating client-set fields** — use `preset` on inserts to force user-id, tenant-id from JWT.
- **DDN vs v2** — they have different metadata models; pick a path and commit.

## Interview Cheat Sheet
- **Tagline:** Instant GraphQL on top of Postgres / MySQL / BQ / SF / Mongo — auto-CRUD + subscriptions + row-level auth + event triggers.
- **Best at:** internal tools, realtime dashboards, JWT-secured DB-backed APIs, rapid prototyping.
- **Worst at:** heavy custom business logic, public APIs needing tight shape control, no-DB scenarios.
- **Scale:** Postgres-throughput-bound; horizontal Hasura instances are stateless behind LB; subscriptions need careful sizing.
- **Distributes how:** stateless engine instances; sticky-session not required; Postgres is the state.
- **Consistency / state:** GraphQL → single SQL = same consistency as the underlying DB; subscriptions eventually consistent (poll interval / NOTIFY-based).
- **Killer alternative:** PostgREST (REST instead), Supabase (PG + auth + realtime SaaS), Apollo + hand-rolled resolvers, Prisma + GraphQL Yoga, WunderGraph, Stepzen, GraphJin.

## Further Reading
- Official docs: <https://hasura.io/docs/>
- Permissions: <https://hasura.io/docs/latest/auth/authorization/permissions/>
- Hasura DDN: <https://hasura.io/docs/3.0/index/>
- Event Triggers: <https://hasura.io/docs/latest/event-triggers/overview/>
