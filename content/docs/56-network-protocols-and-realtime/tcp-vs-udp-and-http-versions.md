---
title: "TCP vs UDP, HTTP/1.1 vs HTTP/2 vs HTTP/3 (QUIC)"
description: "The transport / application protocols you'll be asked about — TCP's reliability vs UDP's speed; HTTP/1.1's head-of-line blocking; HTTP/2's multiplexing; HTTP/3 / QUIC moving to UDP for true 0-RTT and per-stream loss recovery."
---

> Topic: Key Concept · Category: Network Protocols & Real-time · Difficulty: Foundational

## TL;DR
- **TCP** = reliable, ordered byte stream; 3-way handshake; congestion control. Used by HTTP/1.1, HTTP/2, most APIs, databases.
- **UDP** = unreliable, unordered, message-oriented; no handshake; minimal overhead. Used by DNS, video / VoIP, gaming, QUIC (HTTP/3).
- **HTTP/1.1** = one request at a time per connection; head-of-line (HOL) blocking; 6 connections per origin in browsers.
- **HTTP/2** = single TCP connection multiplexes many streams; binary; header compression (HPACK); but TCP-level HOL still hurts under packet loss.
- **HTTP/3 / QUIC** = HTTP over UDP + new transport layer (QUIC); per-stream loss recovery; 0-RTT resumption; built-in TLS 1.3; what Cloudflare / Google / YouTube serve today.

The deepest insight: HTTP/2 fixed application-layer HOL but inherited TCP's transport-layer HOL; HTTP/3 fixed both by **moving off TCP entirely**.

## What problem does each solve?

### TCP
- **Reliable delivery** — retransmits lost packets; in-order.
- **Congestion control** — slow-start, AIMD, BBR.
- **Stream abstraction** — apps see bytes, not packets.
- **Default for everything that needs reliability.**

### UDP
- **Low latency** — no handshake; no retransmit wait.
- **Best-effort** delivery — fine for time-sensitive lossy data.
- **Foundation for modern protocols** (QUIC, WireGuard, custom transport).
- **Multicast / broadcast** support.

### HTTP/1.1
- **Universal compatibility** — every device speaks it.
- **Cacheable, statelessness, simple text format.**
- **Limitation:** one request per connection at a time; pipelining never worked in practice; head-of-line blocking.

### HTTP/2
- **Multiplexing** many streams on one TCP connection — fixes app-layer HOL.
- **Header compression (HPACK)** — vastly reduces overhead.
- **Server push** (rarely used / removed in some browsers).
- **Required for gRPC.**
- **Limitation:** under packet loss, ALL streams stall (TCP HOL).

### HTTP/3 / QUIC
- **Per-stream loss recovery** — one packet loss only affects one stream.
- **0-RTT connection resumption** — repeat connections skip handshake.
- **TLS 1.3 baked in** — encryption is mandatory.
- **Connection migration** — survives client IP change (Wi-Fi → mobile).
- **Limitations:** UDP often blocked / rate-limited; CPU more expensive than TCP.

## How they work

### TCP handshake (3-way)
```text
Client                              Server
  │   SYN  →                          │
  │   ←  SYN-ACK                      │
  │   ACK  →                          │
  │   ─────  data flows  ────►        │
```
1.5 RTTs to first byte. With TLS, add another 2 RTTs (TLS 1.2) or 1 RTT (TLS 1.3).

### UDP
```text
Client                              Server
  │   datagram  →                     │
  │   (maybe)  ←  reply               │
```
Zero RTT setup. App handles loss / retransmit / order.

### HTTP/1.1
```text
TCP conn ──► Request 1 ──► Response 1 ──► Request 2 ──► Response 2 ──► …
                  (serial; only one at a time)
```
Browsers open 6 parallel connections per origin to compensate.

### HTTP/2
```text
single TCP conn ──► multiplexed streams [1, 3, 5, 7, ...]
                    Request 1, Request 3, Response 1, Response 3, ...
                    interleaved binary frames
```
One TCP loss → ALL streams pause until retransmit.

### HTTP/3 / QUIC
```text
single UDP "connection" ──► QUIC streams [1, 3, 5, ...]
                            independent loss recovery per stream
                            connection ID survives IP change
                            TLS 1.3 handshake folded into transport
```

## When to use each (real-world examples)

### TCP
- **HTTP-based services, databases, email (SMTP/IMAP), SSH, FTP, anything reliability-first.**

### UDP
- **DNS** — request fits in one datagram; reply in another; retry on lost.
- **VoIP / video conferencing** (RTP) — old data is useless; speed > completeness.
- **Online games** — same logic as VoIP.
- **DHCP, NTP, SNMP, syslog.**
- **WireGuard, OpenVPN UDP mode.**
- **QUIC / HTTP/3 / gRPC over QUIC.**
- **Multicast** — UDP only.

### HTTP/1.1
- **Legacy clients / servers.**
- **Simple internal scripts.**
- **Curl debugging.**
- **Long-tail compatibility.**

### HTTP/2
- **gRPC** — strictly requires HTTP/2.
- **Modern web servers behind a CDN — usually default.**
- **API gateways with multiplexing.**

### HTTP/3
- **High-loss / mobile networks** — packet loss recovery per stream is huge.
- **Latency-sensitive APIs** — 0-RTT resumption.
- **Cloudflare-fronted sites** — automatic HTTP/3 enabled.
- **YouTube / Google / Meta / Cloudflare** all serve HTTP/3 to clients that support it.

## Things to consider / Trade-offs

### TCP
- **Setup cost** — 1 RTT for handshake + 1 RTT for TLS.
- **Slow start** — congestion window starts small; throughput ramps over RTTs.
- **HOL blocking at transport** — single packet loss blocks all bytes after it.
- **NAT-friendly** — most networks pass TCP fine.
- **CPU cost** — kernel-managed; mature.

### UDP
- **Application must do reliability + ordering + congestion control** (or accept loss).
- **NAT traversal** harder than TCP — STUN / TURN / ICE for WebRTC.
- **Some networks throttle / block UDP.**
- **No backpressure built in** — apps must implement.

### HTTP/2
- **One TCP connection per origin** — mostly good; can become a bottleneck under saturation.
- **TCP HOL** still hurts under packet loss.
- **Header compression vulnerability** (HPACK Bomb / CRIME-like) — mitigated by limits.
- **Server push** never delivered on its promise; mostly removed.
- **Most CDNs default to HTTP/2** for clients that support it.

### HTTP/3 / QUIC
- **UDP CPU overhead** higher than TCP — kernel's TCP path is heavily optimized; QUIC is mostly userspace.
- **Middleboxes / corporate firewalls** may block UDP — fall back to HTTP/2.
- **Connection migration** is a feature with security implications (need anti-amplification).
- **Server-side QUIC stacks** maturing rapidly (nginx, lighttpd, Cloudflare's quiche, Google's quiche, Apple's nw_quic).
- **TLS 1.3 mandatory** — no plaintext mode.

### gRPC and HTTP/2
- **Single connection per backend = imbalanced load** with L4 LB; need L7 LB or many connections.
- **Long-running streaming RPCs** — must handle connection draining gracefully.

## Common pitfalls
- **TCP fall-back from UDP without thinking** — VoIP over TCP is awful (HOL stalls audio).
- **HTTP/2 over plaintext** — most browsers reject it; HTTPS is effectively required.
- **L4 load balancer with HTTP/2** — single TCP conn pinned to one backend; unbalanced.
- **Server push** in HTTP/2 — doesn't help in practice; modern browsers ignore or remove.
- **HTTP/1.1 + many small assets** — round-trip overhead dominates; bundle / sprite / inline.
- **HTTP/3 disabled in firewall** — UDP 443 blocked; clients fall back to HTTP/2.
- **Wrong content type** for streaming over HTTP/1.1 — need `Transfer-Encoding: chunked`.
- **Reusing TCP connection** with mutating state — pipelining bugs.
- **Trusting `X-Forwarded-For`** without LB chain config — IP spoofing.
- **Long-lived idle connections** killed by NATs — send keep-alives.
- **Buffer-bloat** at edges making BBR / CUBIC misbehave.
- **0-RTT replay attacks** in QUIC — only allow idempotent operations.
- **Migration without verification** — QUIC connection migration must verify peer.

## Interview Cheat Sheet
- **TCP:** reliable, ordered, byte-stream, 3-way handshake, default.
- **UDP:** unreliable, message-oriented, lightweight, foundation for QUIC + real-time.
- **HTTP/1.1:** one request per connection at a time; HOL blocking; 6 conns / origin.
- **HTTP/2:** multiplexed streams over single TCP; binary; HPACK; gRPC requires it; TCP HOL still bites under loss.
- **HTTP/3 / QUIC:** UDP-based; per-stream loss recovery; 0-RTT resumption; TLS 1.3 mandatory; connection migration.
- **Use UDP / HTTP/3 for:** mobile, lossy networks, latency-sensitive, real-time.
- **Use TCP / HTTP/2 for:** general APIs, gRPC, environments hostile to UDP.
- **Killer phrase:** "HTTP/2 fixed application-layer HOL blocking; HTTP/3 fixed transport-layer HOL by replacing TCP with QUIC over UDP."

## Related concepts
- [WebSocket / SSE / Long Polling](/docs/56-network-protocols-and-realtime/websocket-sse-long-polling) — real-time choices on top of HTTP.
- [TLS & mTLS](/docs/56-network-protocols-and-realtime/tls-and-mtls) — encryption layer on top.
- [DNS & Anycast](/docs/56-network-protocols-and-realtime/dns-and-anycast) — UDP's biggest user.
- [L4 vs L7 LB](/docs/50-network-traffic-routing/l4-vs-l7-load-balancing) — protocol-aware routing.
- Concrete: [NGINX](/docs/16-load-balancing-and-proxies/nginx), [Envoy](/docs/16-load-balancing-and-proxies/envoy), Cloudflare HTTP/3, Google QUIC.
