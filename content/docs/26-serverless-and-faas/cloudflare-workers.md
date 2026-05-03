---
title: "Cloudflare Workers"
description: "Cloudflare Workers is V8-isolate-based serverless at the edge — sub-ms cold starts, runs in 300+ POPs worldwide, with KV / Durable Objects / R2 / D1 for stateful edge primitives."
---

> Category: Serverless / Edge Compute · Provider: Cloudflare · License: Proprietary (managed) · Open runtime: workerd (Apache 2.0)

## TL;DR
Cloudflare Workers is **serverless on the edge**. Instead of starting a container or VM, your code runs inside a **V8 isolate** (the same sandbox primitive Chrome uses for tabs) on a Cloudflare datacenter near the user — 300+ POPs worldwide. Cold starts are **sub-millisecond** (because no process boot), each request gets its own isolate context, and you pay per request + CPU time. Workers ships with **stateful primitives**: KV (eventually consistent global cache), Durable Objects (single-instance strongly-consistent objects), R2 (S3-compatible object storage with no egress fees), D1 (SQLite at the edge), Queues, Cron Triggers, Workers AI. Reach for Workers when latency-to-user matters more than anything, when you want zero cold start, or when you need globally-distributed compute without managing regions.

## What problem does it solve?
- **Region selection complexity** — "which AWS region?" disappears; deploy once, runs everywhere.
- **Cold starts** — V8 isolates start in < 5 ms vs Lambda's 100 ms+.
- **Edge latency** — code runs ~30–50 ms from any user globally.
- **Egress fees** — R2 has no egress fee (vs S3's $0.09/GB).
- **Edge state** — Durable Objects give you single-key strong consistency at the edge.

## When to use
- **Globally low-latency APIs** — HTML / JSON / auth at < 50ms p99 worldwide.
- **A/B testing, edge personalization, geo routing.**
- **JAMstack / SSR / ISR backends** — Pages + Workers for full-stack apps.
- **Image transformations / signed URLs / token issuance.**
- **API gateway / proxy / rewrite** — rewrite paths, add auth headers, route to origin.
- **WebSocket fan-out** — Durable Objects act as a per-room coordinator.
- **Egress-heavy workloads** — R2 + Workers avoid AWS egress costs.

## When NOT to use
- **Long-running workloads > 30 sec wall-clock / 30 sec CPU** — Workers is request-scoped (paid plans give more).
- **Heavy compute** — V8 isolate has limited CPU per request.
- **Native code / arbitrary binaries** — only WASM + JavaScript supported (Rust → WASM works well).
- **Tight AWS coupling** — Workers can call AWS but isn't IAM-native.
- **Heavy memory > 128 MB per isolate.**
- **Filesystem access** — no `fs`; use R2 / KV / D1.

## Data Model / Execution Model
- **Worker** — JS/TS module exporting `fetch`, `scheduled`, or `email` handler.
- **V8 Isolate** — sandbox with own JS heap; many isolates per process; no shared mutable state.
- **Bindings** — typed handles to KV, R2, D1, Queues, Durable Objects, secrets, env vars; injected as `env.MY_BINDING`.
- **Durable Object** — actor-style: a named instance pinned to a single colo; transactions over its `state.storage` are strongly consistent; ideal for room state, rate limits, counters.
- **KV** — global eventually-consistent key-value (60 s convergence); cache / config.
- **R2** — S3-compatible object storage; zero egress fees.
- **D1** — SQLite-on-the-edge; replicas in many colos; primary-elect for writes.
- **Queues** — managed message queue with retries / DLQ.
- **Cron Triggers** — schedule a Worker without an HTTP request.

```typescript
// worker.ts — Hono on Workers, with KV cache + R2
import { Hono } from "hono";

type Env = {
  CACHE: KVNamespace;
  ASSETS: R2Bucket;
  DB: D1Database;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/api/user/:id", async (c) => {
  const id = c.req.param("id");
  // try edge cache first
  const cached = await c.env.CACHE.get(`user:${id}`, "json");
  if (cached) return c.json(cached);
  // fall through to D1 (SQLite at edge)
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  if (!row) return c.notFound();
  await c.env.CACHE.put(`user:${id}`, JSON.stringify(row), { expirationTtl: 60 });
  return c.json(row);
});

app.get("/img/:key", async (c) => {
  const obj = await c.env.ASSETS.get(c.req.param("key"));
  if (!obj) return c.notFound();
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType ?? "image/png" } });
});

export default app;
```

```yaml
# wrangler.toml
name = "api"
main = "src/worker.ts"
compatibility_date = "2025-09-01"

[[kv_namespaces]]
binding = "CACHE"
id      = "<kv-id>"

[[r2_buckets]]
binding     = "ASSETS"
bucket_name = "site-assets"

[[d1_databases]]
binding     = "DB"
database_id = "<d1-id>"

[triggers]
crons = ["*/15 * * * *"]
```

## Architecture
- **V8 Isolate runtime** — same sandbox as Chrome tabs; near-zero start time; cooperative multitasking.
- **`workerd`** — Cloudflare's open-source Workers runtime; runs on every Cloudflare server; JS/TS + WASM.
- **Service Worker / Module Worker APIs** — modern API uses ES modules + bindings.
- **Durable Object placement** — when a DO is first accessed, it's pinned to a colo near the requester; subsequent requests route there.
- **D1 architecture** — SQLite primary in one region; reader replicas globally; reads are local-fast; writes route to primary.
- **R2** — S3-compatible API; objects stored in Cloudflare datacenters; cached at edge.

## Trade-offs

| Strength | Weakness |
|---|---|
| Sub-ms cold starts (V8 isolate) | JavaScript / WASM only |
| 300+ global POPs — runs near users | Strict CPU / memory limits per request |
| Zero egress fees with R2 | Filesystem / native libraries unavailable |
| Durable Objects = strong consistency edge primitive | Vendor lock-in (DO, KV, D1 are Cloudflare-only) |
| KV / D1 / R2 / Queues / AI as managed primitives | Some Node APIs partial (`node:` compat improving) |
| Excellent free tier; generous paid tier | Long-running tasks need Workers Triggers / Queues |
| `wrangler dev` for local emulation | Debug experience less mature than AWS Lambda |
| `workerd` is open-source — hostable yourself | Multi-region writes require careful design |

## Common HLD Patterns
- **Edge auth gateway:** Worker validates JWT, rewrites paths, calls origin; offload TLS + DDoS to Cloudflare.
- **Multi-tenant per-room state:** Durable Object per chat room / game / workspace; in-memory + persistent storage.
- **Cache-augmented origin:** Worker → KV cache → origin; cache hits never reach origin.
- **Edge ML inference:** Workers AI runs LLaMA / Mistral / embeddings on Cloudflare GPUs at the edge.
- **Static + dynamic SSR:** Cloudflare Pages (static assets) + Pages Functions (Worker handlers) for full stack.
- **Globally-distributed rate limiting:** Durable Object per API key holds counters; deterministic dispatch.
- **WebSocket coordinator:** clients connect through Worker; Worker upgrades to WebSocket; DO orchestrates fan-out.

## Common Pitfalls / Gotchas
- **CPU time limit** — default 10 ms / 50 ms / unlimited (Bundled / Standard / Unbound); long sync CPU work fails.
- **Memory ceiling** — 128 MB / isolate; large JSON parsing on hot paths leaks.
- **Sub-request limits** — 50 sub-requests per Worker on Bundled; 1000 on Unbound.
- **KV consistency** — eventual; reads after writes may show old data for up to 60 s.
- **Durable Object hot key** — single-instance bottleneck; if your DO becomes the contention point, shard.
- **D1 write throughput** — single primary; not for high-write OLTP.
- **No `eval` / dynamic `import`** — strict CSP-like restrictions.
- **`Node.js compat` mode** — partial; not every npm package works.
- **Cron + scheduled drift** — schedule fires on a per-region basis; high-precision timing isn't guaranteed.
- **Local dev vs prod parity** — `wrangler dev --remote` runs against real Cloudflare for fidelity.

## Interview Cheat Sheet
- **Tagline:** V8-isolate FaaS at the edge — sub-ms cold start; 300+ POPs; KV / DO / R2 / D1 stateful primitives.
- **Best at:** global low-latency APIs, edge personalization, A/B tests, image / asset routing, JAMstack SSR, egress-heavy workloads.
- **Worst at:** long compute, native binaries, heavy memory, AWS-tight integrations.
- **Scale:** runs in every POP; no region picking; effectively infinite horizontally.
- **Distributes how:** isolates per request; placement near user automatically.
- **Consistency / state:** stateless by default; KV eventually consistent; Durable Objects strongly consistent per-key; D1 single-primary; R2 strongly consistent reads after writes per-key.
- **Killer alternative:** AWS Lambda + Lambda@Edge / CloudFront Functions, Vercel Edge Functions, Deno Deploy, Fastly Compute@Edge (WASM), Netlify Edge Functions.

## Further Reading
- Official docs: <https://developers.cloudflare.com/workers/>
- workerd runtime (open-source): <https://github.com/cloudflare/workerd>
- Durable Objects: <https://developers.cloudflare.com/durable-objects/>
- D1 SQLite at edge: <https://developers.cloudflare.com/d1/>
