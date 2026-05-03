---
title: "Supabase"
description: "Supabase is the open-source Firebase alternative — Postgres + Auth (GoTrue) + Realtime (logical replication → WebSocket) + Storage (S3-style) + Edge Functions (Deno) + Vector + Studio UI, all packaged as a self-hostable platform or hosted SaaS."
---

> Category: Backend-as-a-Service · Written in: TypeScript / Go / Rust · License: Apache 2.0 (most components) + PostgreSQL

## TL;DR
Supabase bundles **everything you need to build a full-stack app's backend on top of PostgreSQL**: a managed **Postgres database** (with extensions like `pgvector`, `postgis`, `pg_cron`), **Auth** (`GoTrue` — email / password, magic link, OAuth providers, MFA, SAML, JWT issuance), **Realtime** (logical replication slot → server fans changes out as WebSocket events), **Storage** (S3-compatible blob store with row-level access control), **Edge Functions** (Deno runtime; deploy TS lambdas), **Vector / AI** (pgvector + embeddings APIs), and **Studio** (web UI to inspect tables, write SQL, manage policies). The killer feature: **Postgres Row Level Security (RLS)** — every API call carries a JWT; RLS policies on tables enforce per-user access at the database layer, so the public `postgrest`-generated REST + GraphQL APIs are safe to expose **directly to browsers**. Reach for Supabase when you want **the productivity of Firebase + the rigor of SQL + open-source / portability**.

## What problem does it solve?
- **"I want a backend without writing one"** — Supabase auto-exposes Postgres as REST + GraphQL.
- **Auth is a pain to build** — GoTrue ships providers, email flows, MFA, JWT.
- **Realtime sync** without managing WebSocket fleets — logical replication → broadcast.
- **File uploads with auth** — Storage with RLS policies.
- **Server functions** without operating Lambda — Edge Functions.
- **Vector / AI features** without separate vector DB — `pgvector`.
- **Open source / portability** — self-host the entire stack; no Firebase lock-in.

## When to use
- **MVP / prototype** that needs a real database + auth in days.
- **Internal tools** that benefit from auto-generated CRUD APIs.
- **Apps requiring SQL joins / transactions / constraints** (Firebase struggles here).
- **Realtime collab** features with row-level granularity.
- **AI / RAG apps** wanting vector search next to relational data.
- **OSS / sovereignty** mandates — self-host the entire stack.
- **Edge functions** without managing AWS Lambda / Cloud Run.

## When NOT to use
- **Massive scale beyond a single Postgres node** — Supabase is a Postgres frontend; PG vertical limits apply (sharding requires extensions like Citus).
- **Document-shaped massive collections** — Firestore / DynamoDB scales horizontally automatically.
- **Strict enterprise compliance / on-prem only** — paid tiers exist; verify.
- **Complex multi-region active-active writes** — Postgres replication is single-master.
- **Mobile-first push notification** — Firebase Cloud Messaging is more turnkey (Supabase has no native push).
- **You want infinite scale + serverless DB** — Neon / PlanetScale / Aurora Serverless are more elastic.

## Core Concepts
- **Project** — a managed Supabase environment (Postgres instance, Auth, Storage, Realtime, Edge Functions).
- **PostgREST** — exposes Postgres tables as REST endpoints (`/rest/v1/<table>?select=...&filter=...`).
- **GraphQL** — `pg_graphql` extension; `/graphql/v1/` endpoint.
- **Row Level Security (RLS)** — Postgres `CREATE POLICY` clauses; checked on every query against `auth.uid()`.
- **Auth schema** — Supabase manages `auth.users`, `auth.identities`; trigger-driven sync to public `profiles`.
- **JWT claims** — Auth issues JWTs containing `sub` (user_id) + `role` (`anon`, `authenticated`, `service_role`).
- **Realtime** — server reads WAL via logical replication slot; fans out changes filtered by RLS to subscribed clients.
- **Storage** — S3-style buckets; objects authorized via SQL policies on `storage.objects`.
- **Edge Function** — Deno-runtime serverless function; deployed via `supabase functions deploy`.
- **Database Branching** (paid) — branch per PR with copy of schema + data.
- **Migrations** — managed via `supabase/migrations/` SQL files + CLI.
- **Service role key** vs **Anon key** — anon is public, RLS-restricted; service role bypasses RLS — keep server-side only.

```sql
-- Row Level Security: a user can only see their own todos
CREATE TABLE todos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  title       text NOT NULL,
  done        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own todos"
  ON todos FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users insert own todos"
  ON todos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
```

```javascript
// Browser: full-stack-without-a-server
import { createClient } from "@supabase/supabase-js";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sign in
await sb.auth.signInWithPassword({ email, password });

// Read (RLS auto-filters to current user)
const { data: todos } = await sb.from("todos").select("*").eq("done", false);

// Write
await sb.from("todos").insert({ title: "Buy milk", user_id: (await sb.auth.getUser()).data.user.id });

// Realtime: subscribe to inserts/updates on my row(s)
const ch = sb.channel("todos-changes")
  .on("postgres_changes",
      { event: "*", schema: "public", table: "todos",
        filter: `user_id=eq.${userId}` },
      payload => console.log(payload))
  .subscribe();
```

```javascript
// Storage: auth-protected file upload
const { data, error } = await sb.storage
  .from("avatars")
  .upload(`${userId}/avatar.jpg`, file, { contentType: "image/jpeg", upsert: true });

// Public URL or signed URL
const { data: { publicUrl } } = sb.storage.from("avatars").getPublicUrl(`${userId}/avatar.jpg`);
```

```typescript
// Edge Function (supabase/functions/hello/index.ts)
import { serve } from "https://deno.land/std/http/server.ts";
serve(async (req) => {
  const { name } = await req.json();
  return new Response(JSON.stringify({ message: `hi ${name}` }), {
    headers: { "content-type": "application/json" }
  });
});
// Deploy: supabase functions deploy hello
```

## Architecture
- **Postgres** — primary store (managed; logical replication enabled).
- **PostgREST** (Go-based; actually Haskell — Supabase contributes upstream) — auto-generates REST from schema.
- **GoTrue** (Go) — auth server; issues JWTs.
- **Realtime** (Elixir) — reads WAL via logical replication; emits events over Phoenix Channels (WebSocket).
- **Storage** (Node.js) — S3-API-compatible store; objects' ACLs in Postgres.
- **Edge Functions** — Deno; runs on managed runtime (or self-host with Deno + Hono).
- **Studio** — Next.js admin UI.
- **PgBouncer / Supavisor** for connection pooling (PG can't handle thousands of connections).

## Trade-offs

| Strength | Weakness |
|---|---|
| Postgres as foundation = SQL + transactions + extensions | PG vertical scale limits (no auto-sharding) |
| RLS lets you expose DB safely to browser | Writing RLS policies is non-trivial; bugs leak data |
| Auto REST + GraphQL APIs | Generated APIs require careful schema design |
| Realtime via logical replication | Realtime has connection / row-rate limits |
| Storage with policies + signed URLs | Storage is not full S3 (no advanced lifecycle / replication) |
| Edge Functions in Deno | Deno-only; no Node ecosystem |
| `pgvector` for AI / RAG | Vector search performance < dedicated DBs at huge scale |
| Open-source, self-hostable | Self-hosting requires operating PG + several services |
| Generous hosted free tier | Hosted plans scale linearly with PG instance size |

## Common HLD Patterns
- **MVP / SaaS app**: Supabase Auth + RLS + auto-CRUD; frontend Next.js / SvelteKit talks directly to Supabase; Edge Functions for server-only logic (e.g., webhook handlers, Stripe).
- **Realtime collab**: row in `documents` table; subscribe to `postgres_changes` filtered by `doc_id`; CRDT in app code.
- **AI / RAG**: store embeddings in `pgvector` column; SQL `ORDER BY embedding <=> query_embedding LIMIT 10` for retrieval; RLS keeps tenants isolated.
- **File uploads with auth**: Storage bucket + SQL policy on `storage.objects` checking `auth.uid()` matches a folder name.
- **Multi-tenant SaaS**: `tenant_id` column + RLS policies; service role bypasses for admin tooling.
- **Webhook receivers**: Edge Function endpoint signs / verifies, writes to Postgres.
- **Cron / scheduled jobs**: `pg_cron` extension; Supabase exposes it via Studio.
- **Database migrations**: `supabase/migrations/*.sql` + `supabase db push` in CI.
- **Branch-per-PR** (paid): each PR gets a Postgres branch with schema; preview env runs against it.

## Common Pitfalls / Gotchas
- **RLS bugs leak data** — every table with PII needs `ENABLE ROW LEVEL SECURITY` + tested policies.
- **`anon` vs `authenticated` vs `service_role`** — make sure clients only get anon; never embed service role in frontend.
- **Service role bypasses RLS** — server-side only.
- **Connection limits** — PG defaults to ~100 connections; use Supavisor / PgBouncer pool mode.
- **Realtime filter** — filters are server-side but RLS additionally enforces; double-check both.
- **Migration drift** — manual SQL via Studio drifts from `migrations/` files; treat Studio as read-only in prod.
- **`pgvector` ANN tuning** — pick HNSW vs ivfflat; tune `lists` / `m` / `ef`.
- **Storage uploads + RLS** — bucket policies aren't enough; you need policies on `storage.objects`.
- **Free-tier project pause** — projects pause after inactivity; pre-warm if user-facing.
- **Edge Function cold start + Deno-only modules** — choose libraries carefully.
- **Postgres single-leader** — write throughput tied to a single instance; read replicas exist on paid plans.
- **Backup strategy** — paid plans have PITR; free is daily snapshot; test restores.
- **Triggers vs application logic** — moving complexity into PG triggers is convenient but harder to debug at scale.

## Interview Cheat Sheet
- **Tagline:** OSS Firebase alternative on Postgres — Auth + Realtime + Storage + Edge Functions + Vector + auto REST/GraphQL via PostgREST/pg_graphql + RLS for browser-safe DB access.
- **Best at:** SaaS / MVP / collab apps that benefit from SQL + transactions + RLS; AI / RAG via pgvector; OSS / self-hostable backend.
- **Worst at:** infinite-scale write throughput, serverless / multi-region active-active writes, mobile push (no FCM substitute).
- **Scale:** single-leader PG limits apply (vertical scale; read replicas; Citus for sharding); managed plans scale with instance size.
- **Distributes how:** managed PG; logical replication for Realtime; Edge Functions on Deno runtime.
- **Consistency / state:** Postgres ACID; Realtime is at-least-once via WAL.
- **Killer alternative:** Firebase (NoSQL, mobile-first), AWS Amplify (AWS-native, more boilerplate), Appwrite (OSS, MongoDB-style), PocketBase (single-binary OSS), Hasura (GraphQL on PG, no Auth/Storage), Nhost (similar OSS), Convex (typed reactive backend), PlanetScale + Auth.js + Cloudflare R2 (DIY).

## Further Reading
- Official docs: <https://supabase.com/docs>
- Row Level Security: <https://supabase.com/docs/guides/auth/row-level-security>
- Realtime: <https://supabase.com/docs/guides/realtime>
- Edge Functions: <https://supabase.com/docs/guides/functions>
- Self-hosting: <https://supabase.com/docs/guides/self-hosting>
