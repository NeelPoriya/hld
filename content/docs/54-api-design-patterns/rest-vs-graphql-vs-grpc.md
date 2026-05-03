---
title: "REST vs GraphQL vs gRPC vs WebSocket vs SSE"
description: "The five API styles that show up in HLD interviews — what each does well, where it falls down, when to combine them. REST for resource CRUD; GraphQL for client-shaped queries; gRPC for service-to-service; WebSocket / SSE for real-time."
---

> Topic: Key Concept · Category: API Design Patterns · Difficulty: Foundational

## TL;DR
Five major API paradigms; pick by **who's calling, what they want, and how often:**
- **REST (HTTP+JSON)** — resource-oriented; cacheable; ubiquitous; over-fetches and under-fetches.
- **GraphQL** — client picks the shape of the response; great for mobile/web; harder to cache; n+1 query traps.
- **gRPC (HTTP/2 + Protobuf)** — strongly-typed schemas; binary; bidirectional streaming; great for service-to-service; weak in browser.
- **WebSocket** — persistent bidirectional TCP; chat, multiplayer, collaboration.
- **Server-Sent Events (SSE)** — one-way server→client over HTTP; notifications, dashboards, AI streaming responses.

Real systems use **multiple at once:** REST for public CRUD, gRPC internally between services, WebSocket / SSE for realtime updates, and increasingly GraphQL gateways for mobile / web product surfaces.

## Quick comparison

| Aspect | REST | GraphQL | gRPC | WebSocket | SSE |
|---|---|---|---|---|---|
| **Transport** | HTTP/1.1+ | HTTP/1.1+ (POST) | HTTP/2 | TCP (over HTTP upgrade) | HTTP/1.1+ |
| **Format** | JSON (usually) | JSON | Protobuf (binary) | Any (text/binary) | text/event-stream |
| **Schema** | OpenAPI optional | Required (SDL) | Required (`.proto`) | None | None |
| **Direction** | Client → Server (req/resp) | Client → Server | Bidirectional streaming | Bidirectional persistent | Server → Client only |
| **Browser-friendly** | Excellent | Excellent | No (gRPC-Web shim) | Excellent | Excellent |
| **Caching (HTTP cache)** | First-class | Hard (POST) | No | No | No |
| **Typed client gen** | OpenAPI-based | Strong (typed clients) | Excellent | n/a | n/a |
| **Streaming** | Chunked / SSE | Subscriptions over WS | Native (4 modes) | Native | One-way |
| **Performance** | Moderate | Moderate | Excellent (binary, mux) | Excellent | Good |
| **Error handling** | HTTP status codes | Always 200; errors in body | gRPC status codes | Application-defined | Application-defined |
| **Tooling** | Vast (every language) | Apollo, Relay, urql | grpcurl, BloomRPC | Limited | Browser-native |
| **Browser native?** | Yes | Yes | No | Yes | Yes |
| **Best for** | Public APIs, CRUD, cacheable | Mobile/web with varying needs | Internal RPC, microservices | Realtime collab/chat | Notifications, AI streaming |

## When to use each (real-world examples)

### REST
- **Public APIs** — Stripe, Twilio, GitHub, Slack, Twitter all expose REST.
- **CRUD on resources** — `/users/42`, `/orders/abc`.
- **Caching at CDN** — `Cache-Control` headers; immutable URLs.
- **Mobile / web with simple data needs.**
- **Webhooks** (delivered as HTTP POST → REST-style endpoints).
- **Stateless server fleets** behind a load balancer.
- **Server-to-server in different orgs** — REST is the lingua franca.

### GraphQL
- **Mobile apps** — minimize bandwidth + round-trips by fetching exactly what the screen needs.
- **Aggregating multiple backend services** — one query → fanout to many services.
- **Frontend-driven product evolution** — backend doesn't ship new endpoints for every screen.
- **Complex nested data** — e-commerce product page (product + reviews + recommendations + inventory).
- **GitHub / Shopify / Facebook public APIs** — all offer GraphQL.
- **BFF (Backend for Frontend)** layer — Apollo Federation, gateway aggregation.

### gRPC
- **Internal microservice-to-microservice** — typed schemas + binary efficiency + bidirectional streaming.
- **High-throughput / low-latency** — Protobuf is dense; HTTP/2 is multiplexed.
- **Polyglot internal stacks** — generate clients in Go, Java, Python, Rust, Node.
- **Streaming workloads** — tail logs, ML inference streaming, IoT telemetry.
- **Kubernetes / Envoy ecosystem** — first-class gRPC routing.
- **Examples:** Google internal services, Netflix internal APIs, Uber internal services, etcd's protocol.

### WebSocket
- **Chat / messaging** — Slack, Discord, WhatsApp web.
- **Collaborative editing** — Google Docs, Figma, Notion.
- **Multiplayer games** — turn-based + low-latency.
- **Live trading dashboards** — bidirectional updates.
- **Live polls / Q&A** — Mentimeter.
- **Presence / typing indicators.**

### SSE (Server-Sent Events)
- **Server → client notifications** — new email, new mention, push.
- **Live dashboards** with one-way updates — metrics, scoreboards.
- **AI / LLM token streaming** — ChatGPT, Claude, Gemini all use SSE for token-by-token responses.
- **Stock tickers / live blogs.**
- **Live deployment / build logs in CI UI.**

## Things to consider / Trade-offs

### REST
- **Over-fetching:** `/users/42` returns 50 fields; client uses 3.
- **Under-fetching:** `/posts/1` then `/users/X` then `/comments/Y` — N round trips.
- **Versioning is cultural** — `/v1/`, `/v2/`, header-based, content-negotiation. Pick one.
- **HATEOAS** is the textbook ideal; almost no one implements it fully.
- **Pagination** styles: offset (page=2), cursor (?after=xyz), keyset. Cursor is the right answer at scale; see [Pagination](/docs/54-api-design-patterns/pagination-strategies).
- **Idempotency** for non-GET — use `Idempotency-Key` header.
- **Standardize errors** — RFC 7807 Problem Details.

### GraphQL
- **N+1 queries** — naive resolver triggers DB call per nested item; fix with **DataLoader** (per-request batching).
- **Caching is hard** — POST always; need normalized client cache (Apollo InMemoryCache, Relay store).
- **Query complexity** — clients can write enormous queries; enforce depth + complexity limits.
- **Mutations** are not atomic across multiple resolvers; design carefully.
- **Subscriptions over WebSocket** for realtime; same scaling problems as WebSocket.
- **Federation** (Apollo) for splitting schema across services.
- **Persisted queries** for prod — clients send hash, not full query, to mitigate complexity attacks + reduce bandwidth.

### gRPC
- **Browser support requires gRPC-Web shim + Envoy/proxy.**
- **Schema evolution** is critical — Protobuf forward/backward compatibility rules.
- **Streaming flow control** built into HTTP/2.
- **Load balancing** at L7 (each stream-as-request) — L4 LB sticks first connection → imbalanced.
- **Error handling** — gRPC status codes; map to HTTP for gateway exposure.
- **Deadlines / timeouts** propagate across calls — first-class feature.
- **Reflection** for debugging tools.

### WebSocket
- **Sticky sessions** — connection lives on one server; need pub/sub layer (Redis, NATS) to broadcast across servers.
- **Scaling** — one process can hold ~50K-200K connections; horizontal scaling via shard + pub/sub.
- **Reconnection** logic on client; resume / replay missed messages (Centrifugo, Pulsar, Pusher patterns).
- **Backpressure** — slow clients can exhaust server memory; bounded queues + drop policy.
- **Auth** — auth on connect (JWT in URL or first message); revoke on logout.
- **Idle timeouts** — most LBs / proxies kill idle connections at ~60s; send pings.

### SSE
- **One-way only** — for client→server, use plain HTTP POST.
- **Auto-reconnect** built into browsers; resume via `Last-Event-ID` header.
- **HTTP/1.1** has 6-connection-per-host limit → SSE eats one. HTTP/2 mux fixes this.
- **Connection limits per server** lower than WebSocket because of HTTP/2 mux.
- **Browser support** is excellent (since IE never supported it, EdgeHTML also didn't, but everyone modern does).
- **Proxies** can buffer; disable buffering with appropriate headers.

## Common pitfalls

### REST
- **Fat controllers** — bundling unrelated operations under one URL.
- **CRUD-shaped APIs for non-CRUD operations** — "send email" is not a resource. Use action-style endpoints.
- **Inconsistent error formats.**
- **Pagination via offset on large tables** — slow scans.
- **No `Idempotency-Key`** on mutating endpoints.
- **Returning 200 with `{ "error": ... }`** — abuse of HTTP status.

### GraphQL
- **N+1** without DataLoader.
- **No query depth / complexity limits** — DOS attack vector.
- **Caching at CDN** — POST defeats it; use persisted queries + GET.
- **Mutations side-effect ordering** unclear.
- **Schema sprawl** — types grow unboundedly without governance.
- **Client thinks GraphQL is "always faster"** — it's only faster than REST when REST was wrong.

### gRPC
- **Browser usage without proxy** — won't work; need gRPC-Web.
- **L4 load balancing of gRPC** — single connection, all streams stick to one backend.
- **Schema breaking changes** — clients break silently; field number reuse is forbidden.
- **No retries by default** — implement client-side retry with backoff.
- **Long-lived streams** + LB connection draining — connection cuts kill streams.
- **Default 4 MB message limit** trips up surprised users.

### WebSocket
- **Single-process scaling** — one Node process can't hold a million connections.
- **No pub/sub layer** — multi-server broadcasts fail.
- **No reconnection / resume** — clients see dropped messages on flaky networks.
- **Backpressure ignored** — slow clients OOM the server.
- **Authentication only on connect** — credentials expire mid-stream.
- **Sending JSON over text frames** — fine for small; binary frames + Protobuf scale better.

### SSE
- **Proxy buffering** — events delayed minutes; set headers carefully.
- **Connection per client × HTTP/1.1 limit** — limits concurrent SSE streams from one origin in a browser.
- **One-way limitation forgotten** — using SSE for chat input doesn't work.
- **Server-side memory leak** — not closing terminated streams promptly.

## Interview Cheat Sheet
- **REST:** resource-oriented, cacheable, ubiquitous; default for public CRUD.
- **GraphQL:** client picks shape; great for mobile/web; n+1 + caching trade-offs.
- **gRPC:** typed binary RPC; service-to-service; needs proxy for browser.
- **WebSocket:** bidirectional persistent; chat / collab / multiplayer.
- **SSE:** server→client one-way; notifications + AI token streaming.
- **Combine them:** REST/gRPC for CRUD/RPC, WebSocket/SSE for realtime, GraphQL gateway for client-driven shapes.
- **Killer phrase:** "REST for resources you can cache; gRPC for services you control; GraphQL for shapes the client decides; WebSocket / SSE for push."

## Related concepts
- [Pagination Strategies](/docs/54-api-design-patterns/pagination-strategies) — every API needs them.
- [API Versioning](/docs/54-api-design-patterns/api-versioning) — how to evolve safely.
- [Idempotency](/docs/44-delivery-semantics/idempotency) — for safe retries on POST.
- [Rate Limiting](/docs/45-resilience-patterns/rate-limiting) — for any public API.
- Concrete: [Apollo / Hasura](/docs/29-graphql/apollo), [Socket.IO](/docs/28-websockets-and-realtime/socket-io), [Centrifugo](/docs/28-websockets-and-realtime/centrifugo), [API gateways](/docs/18-api-gateways/kong).
