---
title: "WebSocket vs SSE vs Long Polling vs WebRTC"
description: "The four ways to push from server to client (and back) — how each works, what they cost, what each is best at. From the most-correct-but-deprecated long polling to the highest-performance WebRTC SFU."
---

> Topic: Key Concept · Category: Network Protocols & Real-time · Difficulty: Foundational

## TL;DR
Four practical patterns for real-time delivery in modern web/mobile:
- **Long polling** — client opens a request; server holds it until data arrives or timeout; client immediately re-polls. Works everywhere; high overhead.
- **Server-Sent Events (SSE)** — single long-lived HTTP response; server streams `text/event-stream` events; auto-reconnect built into browsers. Server→client only.
- **WebSocket** — persistent bidirectional TCP after HTTP upgrade. Send / receive arbitrary frames. Most common for chat / collab.
- **WebRTC** — peer-to-peer (or via SFU) UDP-based audio/video/data. Lowest latency; complex setup (STUN, TURN, signaling).

The simplest mental model: **SSE for "tell me what's new" (server→client only); WebSocket for "let's talk" (bidirectional); WebRTC for "let's see each other" (audio/video); long polling as the fallback when neither works.**

## What problem does each solve?

### Long polling
- **Real-time updates over plain HTTP** — works through any proxy.
- **Universal compatibility** — corporate firewalls, ancient browsers.
- **Fallback** when WebSocket / SSE blocked.

### SSE
- **One-way push from server to client** — the simpler-than-WebSocket option.
- **Auto-reconnect** with `Last-Event-ID` resume.
- **Stays HTTP** — caches, proxies, auth, observability all work normally.
- **AI streaming** — ChatGPT, Claude, Gemini all use SSE for token-by-token streaming.

### WebSocket
- **Full bidirectional** real-time.
- **Persistent low-latency** — no per-message HTTP overhead.
- **Custom message frames** (text or binary).
- **The default for chat / collab / multiplayer.**

### WebRTC
- **Sub-second media** — voice, video, screen-share.
- **Peer-to-peer** when possible — saves bandwidth + reduces latency.
- **DataChannel** for low-latency arbitrary data.
- **Used by:** Zoom, Google Meet, Discord, browser video calls, twilio video.

## How they work

### Long polling
```text
Client                          Server
  │   GET /events  →                │
  │                              [hold up to 25s waiting for data]
  │   ←  200 [data]                 │
  │   GET /events  →                │  immediately re-poll
```

### SSE
```text
Client                          Server
  │   GET /stream                   │
  │   Accept: text/event-stream     │
  │   ───────────────────►          │
  │   ◄────  data: hello            │
  │   ◄────  event: ping            │
  │   ◄────  data: ...              │
  │   (single response stream)      │
```

Browser auto-reconnects + sends `Last-Event-ID` header.

### WebSocket
```text
Client                          Server
  │   GET /ws                       │
  │   Upgrade: websocket            │
  │   Sec-WebSocket-Key: xyz        │
  │   ──►                            │
  │   ◄──  101 Switching Protocols   │
  │   ◄──►  full-duplex frames       │
```

After upgrade, raw bidirectional binary/text frames over TCP.

### WebRTC
```text
Client A                         Signaling                       Client B
  │   create offer (SDP)            │                                │
  │   ────────────────►             │   forward                       │
  │                                 │   ────────────────►             │
  │                                 │                                 │
  │                                 │   B's answer SDP                │
  │   ◄────────────────             │   ◄────────────────             │
  │                                 │                                 │
  │   ICE: STUN / TURN candidate exchange via signaling               │
  │                                                                   │
  │   ◄══════ direct UDP / DTLS / SRTP audio+video+data ══════►       │
```

Signaling can be WebSocket, SSE, or any transport — it's just for the metadata.

## When to use each (real-world examples)

### Long polling
- **Last-resort fallback** when corporate firewalls block WebSocket + SSE.
- **Trivial poll-style apps** where lag of seconds is OK.
- **Old browsers / old Android WebView.**
- **Some enterprise SaaS clients** still use it.

### SSE
- **AI / LLM streaming responses** — ChatGPT, Claude, Gemini, Cursor.
- **Live dashboards** — metrics scoreboards, status pages.
- **Notifications** — new email, mention, follower.
- **Build / deploy logs** — CI streaming.
- **Stock tickers** (one-way price updates).
- **Content drips** — live blog updates.

### WebSocket
- **Chat apps** — Slack, Discord, WhatsApp Web, Twitter DMs.
- **Collaborative editing** — Google Docs, Figma, Notion, Linear, Miro.
- **Multiplayer games** — turn-based + casual realtime.
- **Live trading dashboards** with bidirectional commands.
- **Presence / typing indicators.**
- **WebRTC signaling.**

### WebRTC
- **Video conferencing** — Zoom, Meet, Teams (browser), Whereby.
- **Voice / VoIP** — Discord voice, Slack huddles.
- **Screen sharing.**
- **Low-latency live streaming** (Cloudflare Stream WebRTC mode).
- **Sub-second auctions, classroom interaction, live shopping.**
- **Twilio Live, Daily, LiveKit, 100ms, Mediasoup.**

## Things to consider / Trade-offs

### Long polling
- **Overhead per request** — full HTTP headers + auth + TLS handshake (or session resume).
- **Connection churn** — open / close cycles tax LBs.
- **High latency floor** — round trip per event minimum.
- **Server holds open connections** during wait — file-descriptor pressure.

### SSE
- **One direction only** — for client→server, send a separate POST.
- **HTTP/1.1 6-connection-per-host limit** — one SSE eats one of those slots; HTTP/2 multiplexes fixes it.
- **Reconnection** is automatic + browsers send `Last-Event-ID`; server should support resume.
- **Proxy buffering** — must disable (`X-Accel-Buffering: no` on NGINX).
- **Mobile background** — connection killed when app backgrounded.
- **No binary** — encode binary as base64 or use WebSocket.

### WebSocket
- **Single process limits** — one Node / Go / Java process can hold ~50K-200K connections; horizontal scale with **sticky sessions + pub/sub backplane** (Redis, NATS, Pulsar).
- **Reconnection** is your job — exponential backoff, resume via cursor / message ID.
- **No HTTP cache / replay** — every message is bespoke.
- **Auth at connect** only by default; revoke on logout = close + reconnect rejected.
- **Backpressure** — slow clients can OOM the server; bounded send buffer + drop-or-disconnect policy.
- **Idle timeouts** at LB / NAT / browser — send pings every ~30s.
- **No native auth header** — pass JWT in URL (logged) or first message.
- **Messages can fragment** across frames; libraries hide it.
- **Compression** (`permessage-deflate`) — saves bandwidth at CPU cost; can leak data via timing.

### WebRTC
- **Setup complexity** — STUN / TURN servers, ICE candidates, SDP offer/answer.
- **NAT traversal** — STUN works for ~80% of cases; TURN relays the rest (bandwidth cost).
- **Signaling is your responsibility** — usually WebSocket.
- **Peer-to-peer doesn't scale beyond 2-4 peers** — use SFU (Selective Forwarding Unit) for groups.
- **SFU options:** LiveKit, Mediasoup, Janus, Jitsi, AWS Chime SDK, Daily, 100ms, Twilio Video.
- **End-to-end encryption** between peers (DTLS-SRTP); NOT through SFU unless using insertable streams.
- **Codec negotiation** — Opus for audio, VP8/VP9/AV1/H.264 for video.
- **Bandwidth adaptation** built in (REMB, TWCC, simulcast).
- **Mobile app battery / CPU drain** is real.

## Common pitfalls

### Long polling
- **No deduplication** — client may receive same event twice on retry; use sequence numbers.
- **Server holds too many connections** — file descriptor limit.

### SSE
- **NGINX / proxy buffering** delays delivery; disable buffering.
- **Trying to use it for bidirectional** — wrong tool.
- **Forgetting `Last-Event-ID`** for resume.
- **HTTP/1.1 connection limits** — only ~6 concurrent SSE per origin without HTTP/2.

### WebSocket
- **No reconnection logic** — a brief network blip drops users permanently.
- **Server-side memory leak** when not closing dead connections.
- **Sending JSON over text frames** at scale — Protobuf / MessagePack saves bandwidth.
- **Single-server scaling** — broadcasts cross-server need pub/sub backplane.
- **Auth tokens in URL** — leaked via logs.
- **No backpressure** — slow client OOMs server.
- **Mixing HTTP and WS auth state** — revoke session, but old WS still open.
- **Misconfigured LB** — kills idle connections at 60s.

### WebRTC
- **No TURN server** — 20% of users can't connect (symmetric NAT).
- **Treating SFU like P2P** — different scaling model; SFU bandwidth = N × users.
- **Ignoring simulcast** — sending full HD to all peers wastes bandwidth.
- **Signaling not encrypted** — anyone can hijack the offer.
- **DataChannel as a chat substitute** — works but lacks server-side persistence; use WebSocket for chat history.
- **Browser permission prompts** — every camera/mic access requires user interaction.
- **Echo cancellation / jitter buffer tuning** — defaults usually fine; off-spec rarely needed.

## Comparison

| Aspect | Long polling | SSE | WebSocket | WebRTC |
|---|---|---|---|---|
| **Direction** | Half-duplex | Server→Client | Bidirectional | Bidirectional |
| **Transport** | HTTP | HTTP | TCP (post-upgrade) | UDP (DTLS+SRTP) |
| **Latency** | Round-trip per event | Push, low | Push, low | Sub-second |
| **Reconnect** | Manual | Automatic | Manual | Manual via signaling |
| **Resume** | App-level cursor | `Last-Event-ID` | App-level cursor | Renegotiate SDP |
| **Browser native** | Yes | Yes | Yes | Yes (with permissions) |
| **Mobile background** | Re-poll on resume | Reconnect | Reconnect | Re-establish |
| **Caching/proxies** | Full HTTP | HTTP-friendly | HTTP upgrade then opaque | UDP, often blocked |
| **Auth** | HTTP headers | HTTP headers | Connect-time only | Signaling-time |
| **Server scale** | Easy | Easy | Sticky + pub/sub | SFU + signaling |
| **Best for** | Last-resort fallback | One-way push, AI streaming | Chat / collab / games | Video / voice / sub-second data |

## Interview Cheat Sheet
- **Long polling:** repeated GETs that hold; universal fallback.
- **SSE:** server→client one-way; HTTP-friendly; AI streaming default.
- **WebSocket:** persistent bidirectional; chat / collab / games.
- **WebRTC:** UDP P2P or SFU; sub-second media + DataChannel.
- **Combine:** WebSocket for chat + presence; SSE for notifications; WebRTC for media.
- **Scaling:** WebSocket needs **sticky sessions + pub/sub backplane** (Redis, NATS, Centrifugo).
- **Watch for:** proxy buffering (SSE), middlebox UDP blocks (WebRTC), connection drops on mobile.
- **Killer phrase:** "Use the lightest tool that fits — SSE if push is one-way, WebSocket if bidirectional, WebRTC if media or sub-second matters."

## Related concepts
- [TCP vs UDP & HTTP versions](/docs/56-network-protocols-and-realtime/tcp-vs-udp-and-http-versions) — what each runs on.
- [TLS / mTLS](/docs/56-network-protocols-and-realtime/tls-and-mtls) — encrypting any of these.
- [Forward / Reverse Proxy / LB / Gateway](/docs/50-network-traffic-routing/proxy-vs-reverse-proxy-vs-lb-vs-gateway) — passes through these protocols.
- Concrete: [Socket.IO](/docs/28-websockets-and-realtime/socket-io), [Centrifugo](/docs/28-websockets-and-realtime/centrifugo), [Mux](/docs/38-video-and-streaming-media/mux), [Cloudflare Stream](/docs/38-video-and-streaming-media/cloudflare-stream).
