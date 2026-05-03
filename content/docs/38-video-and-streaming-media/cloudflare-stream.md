---
title: "Cloudflare Stream"
description: "Cloudflare Stream is the per-minute-priced video platform on Cloudflare's global network — VOD + live + LL-HLS + signed URLs + Stream Player, baked directly into Cloudflare's CDN, Workers, and R2."
---

> Category: Video & Streaming Media · Provider: Cloudflare · License: Proprietary (managed)

## TL;DR
Cloudflare Stream is **a video platform that lives natively inside Cloudflare's edge network**. You upload (HTTP, TUS resumable, or pull-from-URL); Stream **transcodes into adaptive HLS / DASH**, serves segments **from 300+ Cloudflare POPs**, and exposes them via the **Stream Player** (`<iframe>` or `<stream>` web component). Pricing is **per-minute of stored video + per-minute delivered** (no per-seek-byte, no egress fees) — the simplest economic model in the space and often the **cheapest at scale**. It supports **live ingest (RTMP / SRT / WHIP)** with **Low-Latency HLS** + **WebRTC sub-second mode**, **signed URLs**, and **simulcast to RTMP destinations** (e.g., YouTube, Twitch). Reach for Cloudflare Stream when **you're already on Cloudflare**, want **predictable per-minute pricing**, and don't need the deep developer experience / analytics of Mux.

## What problem does it solve?
- **Predictable video cost** — per-minute, not per-byte; no egress.
- **Edge delivery** — already-on-Cloudflare apps get sub-second TTFB on segments.
- **Live + VOD + DRM** in one product.
- **Sub-second latency option** via WebRTC (WHIP / WHEP).
- **Simulcast to multiple RTMP destinations** without operating ingest.
- **Tight Workers / R2 / Images integration** — Cloudflare ecosystem coherence.

## When to use
- **Already on Cloudflare** for CDN / DNS / Workers — natural extension.
- **Per-minute pricing** is friendlier than Mux for high-watch-time / educational content.
- **Live streaming** with simulcast to YouTube / Twitch.
- **Sub-second WebRTC** broadcasts (sports, auctions, classrooms).
- **You don't need deep video analytics** (Stream's analytics are minimal vs Mux Data).
- **Cost-sensitive UGC / education / community platforms.**

## When NOT to use
- **You want best-in-class video QoE analytics** — Mux Data is far richer.
- **Custom encoding ladders / pipelines** — Stream's controls are limited.
- **Niche codecs / HDR / Dolby Vision** workflows — limited.
- **Off-Cloudflare apps** — adds cross-vendor friction.
- **You need MoR-style billing model** — Stream is straight per-minute.
- **Strict on-prem** — Cloudflare-only.

## Core Concepts
- **Video** — VOD asset; identified by UID (`<uid>`).
- **Live Input** — long-lived ingest endpoint with RTMP + SRT + WebRTC URLs and stream key.
- **Output** — simulcast destination (RTMP push to YouTube, Twitch, etc.).
- **Signed URLs** — JWT-based access tokens for time-limited / restricted playback.
- **Stream Player** — `<iframe src="https://customer-<acct>.cloudflarestream.com/<uid>/iframe">` or web component `<stream src="<uid>">`.
- **Webhooks** — `video.live_input.connected`, `video.live_input.disconnected`, `video.ready`, etc.
- **TUS upload** — resumable client uploads.
- **Direct creator upload** — one-time upload URL for client-side flows.
- **MP4 download URL** — for offline / non-HLS contexts.
- **Animated thumbnail / preview** — auto-generated.
- **Captions / VTT** — uploadable; AI captions in beta.
- **DRM** — Widevine + FairPlay support; keys served by Stream.
- **WebRTC live mode (WHIP / WHEP)** — sub-second latency ingest + playback.
- **Custom domain** — `videos.acme.com` CNAME to `cloudflarestream.com`.

```bash
# Upload via TUS resumable upload (file > 200MB recommended)
tus-upload \
  --endpoint https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/stream \
  --header "Authorization: Bearer $CF_API_TOKEN" \
  --metadata 'name lecture-42.mp4' \
  ./lecture-42.mp4
# Returns Stream UID; persist in DB
```

```bash
# Create a live input (RTMP + WebRTC)
curl -X POST https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/stream/live_inputs \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "meta": { "name": "town-hall" },
    "recording": { "mode": "automatic" },
    "defaultCreator": "u_42"
  }'
# Returns rtmps + srt + webrtc URLs and stream key
```

```javascript
// Server: sign a JWT token for paid-only playback (Workers example)
import { SignJWT, importPKCS8 } from "jose";

async function signPlaybackToken(uid, userId) {
  const pk = await importPKCS8(env.STREAM_PRIVATE_KEY, "RS256");
  return await new SignJWT({
    sub: uid,
    kid: env.STREAM_KEY_ID,
    accessRules: [
      { type: "ip.geoip.country", action: "allow", country: ["US", "CA"] },
      { type: "any", action: "block" }
    ]
  })
    .setProtectedHeader({ alg: "RS256", kid: env.STREAM_KEY_ID })
    .setExpirationTime("1h")
    .sign(pk);
}
// Player URL: https://customer-<acct>.cloudflarestream.com/<token>/manifest/video.m3u8
```

```javascript
// Browser: <stream> web component
<script src="https://embed.cloudflarestream.com/embed/sdk.latest.js" defer />
<stream
  src="<uid_or_signed_token>"
  controls
  preload="metadata"
  poster="https://customer-<acct>.cloudflarestream.com/<uid>/thumbnails/thumbnail.jpg"
/>
```

## Architecture (Conceptual)
- **Ingest** — TUS / direct upload / RTMP / SRT / WHIP terminate at edge POPs.
- **Transcoder fleet** — encodes VOD asynchronously; live streams transcoded in flight.
- **Storage** — internal object storage backed by Cloudflare's network; not directly user-accessible (no R2 bucket exposed).
- **CDN** — Cloudflare's global anycast network serves HLS / DASH segments.
- **Live LL-HLS** — chunked CMAF for ~3-second latency.
- **WebRTC mode** — SFU at edge for sub-1s latency via WHIP / WHEP.
- **Signed URL verifier** — at edge; JWT validated; access rules (IP / geo / time) enforced.
- **Workers integration** — generate signed URLs at edge with zero origin round-trip.

## Trade-offs

| Strength | Weakness |
|---|---|
| Per-minute pricing — predictable, often cheap | Less polished dev experience than Mux |
| 300+ POP delivery; no egress fees | Limited control over encoding ladder |
| Native Cloudflare Workers / R2 / Images integration | Analytics are basic vs Mux Data |
| WebRTC sub-second mode | DRM library support not as comprehensive |
| Simulcast to RTMP destinations included | Limited customization of the Stream Player |
| Resumable TUS upload | UI / dashboard less rich |
| AI captions in beta | Tied to Cloudflare account model |
| Strong signed URLs with access rules (geo / IP / time) | Custom transcoding profiles limited |

## Common HLD Patterns
- **Already-on-Cloudflare app** — Workers route adds Stream Player iframe; signed token generated at edge.
- **Live event with simulcast** — single RTMP ingest → Stream + YouTube + Twitch simultaneously.
- **Education platform** — VOD signed JWT with IP / geo restriction; player embedded in app.
- **UGC platform** — direct-creator upload URLs; users upload from browser without proxying through your servers.
- **Sub-second auction / classroom** — WHIP ingest from broadcaster's WebRTC SDK; WHEP playback.
- **Video on R2 + Stream** — store master file in R2 for archival; Stream holds the playable transcodes.
- **Custom-domain delivery** — CNAME `videos.acme.com` to `customer-<acct>.cloudflarestream.com`.

## Common Pitfalls / Gotchas
- **Per-minute "delivered" math** — every viewer × minutes; calculate before launch.
- **Signed JWT expiry** — short tokens; refresh on player events.
- **Live stream key leakage** — same problem as Mux; rotate.
- **Recording mode** — set to `automatic` to capture VOD from live; otherwise stream is live-only.
- **Webhook signature verification** required on Cloudflare webhooks.
- **MP4 download URL** — separately enable per video; not all videos have one.
- **WebRTC requires WHIP/WHEP-capable broadcasters / players** — older OBS won't do WHIP without plugin.
- **Custom domains** — SSL provisioning takes minutes; pre-warm before launch.
- **No "master / mezzanine" download** — once uploaded, original file is not retrievable; back up your masters elsewhere.
- **Geo-block via JWT access rules** — verify they match the JWT lib expectations.
- **Live stream connection limit** — per-account; check plan tier.
- **Caption languages** — AI captions are limited language set; verify before launch.

## Interview Cheat Sheet
- **Tagline:** Per-minute-priced video on Cloudflare's edge network — VOD + live + LL-HLS + WebRTC sub-second + signed URLs + simulcast.
- **Best at:** Cloudflare-native apps, predictable per-minute cost, live + simulcast, sub-second WebRTC, cost-sensitive UGC / education.
- **Worst at:** deep video QoE analytics, custom encoding pipelines, niche codecs, multi-cloud out of Cloudflare.
- **Scale:** Cloudflare-network scale (300+ POPs, multi-Tbps).
- **Distributes how:** managed; uploads transcoded; segments served from edge; signed URLs validated at edge.
- **Consistency / state:** UID is the asset; webhooks notify your DB on state changes.
- **Killer alternative:** Mux (premium dev experience + analytics), AWS Elemental MediaConvert + CloudFront, api.video, Bitmovin, Vimeo, JW Platform, Daily / LiveKit / Agora / 100ms / Mediasoup (sub-1s WebRTC SFU).

## Further Reading
- Official docs: <https://developers.cloudflare.com/stream/>
- WebRTC (WHIP / WHEP): <https://developers.cloudflare.com/stream/webrtc-beta/>
- Live streaming: <https://developers.cloudflare.com/stream/stream-live/>
- Signed URLs: <https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/>
