---
title: "Centrifugo"
description: "Centrifugo is a Go-based real-time messaging server purpose-built for massive WebSocket fan-out — language-agnostic clients, server-side subscriptions, and horizontal scaling via Redis / Nats / KeyDB."
---

> Category: WebSockets & Realtime · Written in: Go · License: Apache 2.0

## TL;DR
Centrifugo is a **standalone real-time messaging server** designed for **massive WebSocket fan-out** (think live sports scores, stock tickers, social-media activity feeds with hundreds of thousands of concurrent connections). Unlike Socket.IO (Node-only library), Centrifugo runs as a **separate service** that your backend talks to via HTTP / GRPC API ("publish to channel X"), and clients in any language (JS, Swift, Kotlin, Python, Go, …) connect via WebSocket / SockJS / HTTP-streaming. It supports **channels with permissions, server-side subscriptions, presence, history, recovery on reconnect**, and scales horizontally via **Redis / KeyDB / Nats / Tarantool** brokers. Reach for Centrifugo when you need pub/sub-style fan-out at scale, decoupled from your application server, and don't want to be locked into Node.js.

## What problem does it solve?
- **Backend-language-agnostic real-time** — your Django / Rails / Spring server publishes; Centrifugo handles WebSocket fan-out.
- **Massive fan-out** — 100k+ concurrent connections per node trivially.
- **Reliable reconnection + history** — clients catch up on missed messages after disconnect.
- **No per-team boilerplate** — channels, presence, history are built-in features, not reinvented.
- **Decouples WebSocket layer** — your app server doesn't need to handle long-lived connections.

## When to use
- **Public-facing real-time at scale** — live scores, live trading dashboards, Twitter-like feeds.
- **Polyglot backends** — your team isn't on Node.js.
- **Pub/sub semantics** — channels with subscribers; not RPC-style request/response.
- **Reliability matters** — clients need to recover missed messages on reconnect.
- **Self-hosted alternative to Pusher / Ably / PubNub.**

## When NOT to use
- **Tiny scale + Node-only stack** — Socket.IO is simpler.
- **Bidirectional RPC-style chatter** — Centrifugo is mostly server → client; client publishes are limited.
- **You need fully managed** — use Ably / Pusher / Pub/Sub as a service.
- **Strict ordering / exactly-once across consumers** — Centrifugo is at-least-once.

## Data Model / Concepts
- **Channel** — named pub/sub channel; clients subscribe; publishers push.
- **Namespace** — channel-name prefix with config (history size, presence on/off, JWT subscribe required, …).
- **Token** — JWT (HS256/RS256) issued by your backend; client passes on connect; embeds permissions.
- **Subscribe** — client subscribes to channel by name; server validates via token (or proxy callback to your backend).
- **Publish** — backend → Centrifugo HTTP/GRPC API → fans out to subscribers.
- **Server-side subscriptions** — backend can subscribe a connection to channels server-side without client request.
- **Presence** — Centrifugo tracks who is in a channel; query / push presence updates.
- **History** — last N messages per channel cached; on reconnect client gets missed messages.
- **Recovery** — reconnect + last-seen offset = catch up reliably.
- **Proxies (HTTP/GRPC)** — Centrifugo can call back to your app on connect / subscribe / publish / refresh / RPC; your app authorizes / processes.

```yaml
# config.yaml — Centrifugo server
admin: true
admin_password: ${CENTRIFUGO_ADMIN_PASSWORD}
admin_secret: ${CENTRIFUGO_ADMIN_SECRET}

api_key: ${CENTRIFUGO_API_KEY}

token_hmac_secret_key: ${JWT_HMAC}

allowed_origins:
  - https://app.example.com

engine: redis
redis:
  address: redis://redis:6379

namespaces:
  - name: chat
    presence: true
    history_size: 100
    history_ttl: 24h
    join_leave: true
    force_recovery: true
  - name: tickers
    presence: false
    history_size: 0     # broadcast-only feed
```

```javascript
// client.js — browser
import { Centrifuge } from "centrifuge";

const c = new Centrifuge("wss://realtime.example.com/connection/websocket", {
  token: await fetchJwt()  // user-scoped Centrifugo JWT from your backend
});

c.on("connected", (ctx) => console.log("connected", ctx.client));
const sub = c.newSubscription("chat:room-42");
sub.on("publication", (ctx) => render(ctx.data));
sub.subscribe();
c.connect();
```

```bash
# Backend publishes to a channel via HTTP API
curl -X POST https://realtime.example.com/api \
  -H "X-API-Key: $CENTRIFUGO_API_KEY" -H "Content-Type: application/json" \
  -d '{"method":"publish","params":{"channel":"chat:room-42","data":{"text":"hi","user":"alice"}}}'
```

## Architecture
- **Single Centrifugo binary** — Go server, single static binary; small memory footprint per connection.
- **Engines:**
  - **Memory engine** — single-node only; great for dev / small.
  - **Redis / KeyDB engine** — pub/sub between nodes; presence + history in Redis; horizontal scaling.
  - **Nats engine** — alternate broker; lighter than Redis.
  - **Tarantool engine** — for very high history / presence load.
- **Transports** — WebSocket (default), SockJS, HTTP-streaming, SSE (Server-Sent Events), GRPC unidirectional.
- **Proxies** — HTTP / GRPC callbacks to your app: connect / subscribe / refresh / publish / RPC.
- **Admin UI** — built-in web admin (info, channels, broadcast).

## Trade-offs

| Strength | Weakness |
|---|---|
| Massive fan-out (100k+ connections / node) | Mostly server→client; client publish is constrained |
| Language-agnostic clients (JS, Swift, Kotlin, Go, …) | More moving parts than embedded Socket.IO |
| Built-in history + recovery + presence | Operational responsibility — you run it |
| Channels + namespaces + JWT permissions | Smaller community than Socket.IO |
| Multiple transports (WS, SSE, HTTP-streaming) | Pub/sub-style semantics — not request/response |
| Redis / Nats / Tarantool engines | History TTL must be tuned per channel |
| Open-source, self-hostable | Limited message persistence vs Kafka |
| Excellent docs | Bidirectional RPC requires the Centrifugo RPC proxy feature |

## Common HLD Patterns
- **Live feed (one-to-many):** backend writes → publish → Centrifugo fans out to all subscribers in `feed:global`.
- **Per-user notifications:** publish to `personal:#${userId}` channel; user-scoped JWT only allows subscribing to own.
- **Chat rooms:** namespace `chat`; channel per room; presence on; history 100.
- **Live dashboards:** dashboard subscribes to `metrics:${tenantId}`; backend pushes deltas; history off (always fresh).
- **Activity stream with replay:** namespace with `history_size: 1000`, recovery on; clients on reconnect catch up.
- **Server-side subscription on connect:** backend `connect` proxy callback subscribes a user to their relevant channels automatically.
- **Bridge from Kafka:** Kafka consumer → Centrifugo publish → fan-out to clients.

## Common Pitfalls / Gotchas
- **History size + TTL** — too big = memory bloat in Redis; too small = clients miss data on reconnect.
- **Channel cardinality** — millions of distinct presence-enabled channels can stress Redis.
- **JWT TTL too short** — clients reconnect and get auth errors; tune refresh proxy.
- **Publishing without API key** — use admin API only on server side; never expose to clients.
- **Allowed origins** — set explicit list; otherwise CSRF-like risks on auth flows.
- **Sticky sessions for SockJS** — needed for SockJS XHR-streaming fallback.
- **Connection limits per IP** — set `client_connection_limit` to defend against single-IP floods.
- **Separate read/write Redis** — Redis Cluster works but partitioning across slots needs the right `redis_cluster_addresses`.
- **Recovery semantics** — at-least-once; consumer must be idempotent if effects matter.
- **HTTP/2 + idle timeouts** — long-lived streams may be killed by intermediaries; use WebSocket where possible.

## Interview Cheat Sheet
- **Tagline:** Go-based standalone real-time messaging server — WebSocket fan-out at scale; channels + presence + history + recovery; engine in Redis / Nats.
- **Best at:** massive fan-out, polyglot backends, public-facing real-time, decoupled WebSocket layer.
- **Worst at:** tiny scale, RPC-style chatter, fully-managed needs (vs Ably / Pusher).
- **Scale:** 100k+ concurrent connections per node; horizontal via Redis / Nats engines.
- **Distributes how:** broker (Redis pub/sub etc.) propagates publishes across nodes; clients land on any node via LB.
- **Consistency / state:** at-least-once delivery; recovery via channel history + last-seen offset.
- **Killer alternative:** Socket.IO (Node lib), Ably / Pusher / PubNub (managed), Pushpin / Fanout, GoChat, native WebSocket + Redis pub/sub, AWS API Gateway WebSocket, Phoenix Channels.

## Further Reading
- Official docs: <https://centrifugal.dev/>
- Server API: <https://centrifugal.dev/docs/server/server_api>
- Channels & permissions: <https://centrifugal.dev/docs/server/channels>
- Engines: <https://centrifugal.dev/docs/server/engines>
