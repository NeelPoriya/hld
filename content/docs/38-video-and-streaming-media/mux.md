---
title: "Mux"
description: "Mux is the API-first video infrastructure platform — upload → transcode (per-title encoding) → adaptive HLS / DASH delivery on a global CDN, plus live streaming, signed URLs, DRM, Mux Player, and Mux Data video QoE analytics."
---

> Category: Video & Streaming Media · Provider: Mux · License: Proprietary (managed)

## TL;DR
Mux is the **Stripe of video**: a developer-first API that turns "upload a file" into a **scalable adaptive-bitrate video streaming pipeline** in minutes. Behind the scenes it does **per-title encoding** (machine-tuned ladder per asset), **HLS + DASH** packaging, **multi-CDN delivery**, **live streaming** (RTMP / SRT / WHIP ingest → HLS / WebRTC / Low-Latency HLS playback), **signed playback URLs / DRM** (Widevine / FairPlay / PlayReady), **subtitles / captions**, **thumbnails / animated GIFs / clipping**, and **storyboards**. It also ships **Mux Data** — drop-in QoE analytics that show real-user metrics (rebuffer rate, video startup time, exit-before-video-start) across every player. Reach for Mux when you want **YouTube-class video infrastructure without operating FFmpeg fleets, packagers, DRM servers, and CDNs**.

## What problem does it solve?
- **Building video infra is hard** — encode, package, DRM, CDN, player, analytics is months of work.
- **Adaptive bitrate ladders** are tricky to tune; Mux per-title encoding does it automatically.
- **Live streaming reliability** — multi-region ingest + transcoding + delivery is non-trivial.
- **DRM / signed URLs** — encrypting + key-serving infrastructure is operationally heavy.
- **Video QoE analytics** — measuring "is video actually working for users?" requires player instrumentation; Mux Data does it.
- **Multi-CDN failover** — Mux already has it.

## When to use
- **Video on demand (VOD)** for a content / education / social platform.
- **Live streaming** — events, classes, conferences, sports, gaming.
- **User-generated video** — TikTok-style upload-and-share.
- **Lecture / course platforms** with DRM + signed URLs.
- **You already have an app** and need to "add video" without an infra team.
- **Video QoE analytics** — instrumenting any player (Mux's, ours, or a custom one).

## When NOT to use
- **Cost-sensitive at huge volume** — at scale, building on AWS Elemental + CloudFront / Cloudflare Stream may be cheaper.
- **Simple progressive MP4** — a plain S3 + CloudFront serve might be enough.
- **Custom transcoding ladders** beyond per-title — full control may favor self-hosting FFmpeg.
- **Tight on-prem / air-gapped** requirements.
- **Embedded / niche codec** workflows (AV1-only, custom HDR pipelines beyond what Mux supports).
- **Live with sub-second latency at massive scale** — Mux LL-HLS hits ~3–7s; sub-1s wants WebRTC SFU like LiveKit, Agora, Daily.

## Core Concepts
- **Asset** — a piece of VOD content; ID, ingest input, status (`preparing → ready`), playback IDs.
- **Playback ID** — opaque ID used in HLS / DASH URLs; can be `public` (open) or `signed` (token required).
- **Signing key** — public/private key pair used to sign JWT playback tokens.
- **Live Stream** — long-lived ingest endpoint; produces Assets per session (or simulcast); supports DVR.
- **Master / Mezzanine** — original upload; available via "Master Access" if enabled.
- **Encoding tier** — `smart` (default, per-title), `baseline` (cheaper), or LL-HLS-enabled.
- **Subtitles / captions** — uploaded as text tracks; auto-generated optional.
- **Thumbnail / GIF / Storyboard** — image artifacts derived from asset.
- **Mux Player** — open-source web component (`<mux-player>`); native QoE.
- **Mux Data** — QoE analytics SDK; integrates with HLS.js, Video.js, native players.
- **DRM** — Widevine (Chrome / Firefox / Android), FairPlay (Safari / iOS), PlayReady (Edge / Xbox).
- **MP4 support** — generated on demand for download / older-platform fallback.

```javascript
// Server: create an Asset from a public URL (Node.js, mux-node SDK)
import Mux from "@mux/mux-node";
const { video } = new Mux();

const asset = await video.assets.create({
  inputs: [{ url: "https://uploads.acme.com/raw/lecture-42.mp4" }],
  playback_policy: ["signed"],
  encoding_tier: "smart",
  mp4_support: "standard",
  master_access: "temporary"
});

// Persist asset.id + asset.playback_ids[0].id in DB; webhook fires when ready
```

```javascript
// Sign a playback token (JWT, RS256) — give to logged-in user
import jwt from "jsonwebtoken";
import fs from "fs";

const privateKey = fs.readFileSync(process.env.MUX_SIGNING_KEY_PATH);
const token = jwt.sign(
  {
    sub: playbackId,                 // playback ID
    aud: "v",                        // 'v' = video, 't' = thumbnail, 'g' = gif, 's' = storyboard
    exp: Math.floor(Date.now() / 1000) + 3600,
    kid: process.env.MUX_SIGNING_KEY_ID
  },
  privateKey,
  { algorithm: "RS256" }
);

// Client URL: https://stream.mux.com/<playback_id>.m3u8?token=<token>
```

```javascript
// Browser: Mux Player + Mux Data
<mux-player
  playback-id="abc123"
  playback-token="<jwt>"
  metadata-video-title="Lecture 42"
  metadata-viewer-user-id="u_42"
  env-key="<MUX_DATA_ENV_KEY>"
/>
```

```bash
# Live: create a stream (RTMP ingest URL + stream key)
curl -u $MUX_TOKEN_ID:$MUX_TOKEN_SECRET \
  -X POST https://api.mux.com/video/v1/live-streams \
  -H 'Content-Type: application/json' \
  -d '{
    "playback_policy": ["public"],
    "new_asset_settings": { "playback_policy": ["public"] },
    "latency_mode": "low",
    "reconnect_window": 60,
    "max_continuous_duration": 43200
  }'
# OBS / FFmpeg ingest to: rtmps://global-live.mux.com:443/app/<stream_key>
# Playback HLS at: https://stream.mux.com/<playback_id>.m3u8
```

## Architecture (Conceptual)
- **Ingest** — direct upload (presigned URLs / Mux Uploader) or pull from URL.
- **Transcoder fleet** — per-title encoding selects an optimal ladder (resolutions × bitrates).
- **Packager** — emits HLS + DASH + low-latency variants; segments stored on object storage.
- **Multi-CDN** — Mux fronts content with multiple CDNs and routes per-user; `stream.mux.com` is the CNAME.
- **DRM key servers** for Widevine / FairPlay / PlayReady; license requests authenticated by JWT.
- **Live ingest pop** (RTMP / SRT / WHIP) → transcode → segment → CDN.
- **Mux Data** — SDK ships beacons → ingestion pipeline → real-time dashboards.

## Trade-offs

| Strength | Weakness |
|---|---|
| Best-in-class developer experience | Per-minute pricing adds up at scale |
| Per-title encoding tuned automatically | Less control vs raw FFmpeg / MediaConvert |
| Live + VOD + DRM + analytics in one platform | DRM keys / signed URLs require careful key mgmt |
| Mux Player + Mux Data are excellent OSS / SaaS | Latency floor ~3s for LL-HLS (WebRTC needed for <1s) |
| Multi-CDN reliability built-in | Vendor lock-in: playback URLs are `stream.mux.com` |
| Webhooks for asset state changes | Storage of mezzanines costs extra |
| Strong adaptive bitrate quality | Custom codecs / pipelines limited |
| Simple SDKs across languages | Geo-restriction is per-token, not server-enforced beyond JWT |

## Common HLD Patterns
- **Course / education platform**: upload to Mux as signed asset → server generates JWT per logged-in user → `<mux-player>` + token plays for entitlement window.
- **UGC platform**: client direct-upload to Mux via presigned URL → webhook on `asset.ready` updates DB → push notification to user.
- **Live event**: provision live stream → broadcaster ingests RTMP → viewers get LL-HLS → simulcast asset auto-created for VOD replay.
- **DRM** (paid content): `playback_policy: ["drm"]` → use Mux DRM tokens → players negotiate license with Mux key server.
- **Adaptive thumbnails / hover-scrub**: storyboard URL gives sprite + WebVTT for hover preview.
- **Trim / clip**: Mux has clipping API; or pre-process client-side before upload.
- **Caption auto-generation**: AI captions feature; or upload `.vtt` / `.srt`.
- **Multi-CDN failover**: built-in; expose Mux's `stream.mux.com` directly.
- **Analytics-driven QoE**: Mux Data shows rebuffer / startup / failure metrics; gate launches on them.

## Common Pitfalls / Gotchas
- **Public vs signed playback** — public IDs can be scraped + hot-linked; default to signed for paid content.
- **JWT expiry** — set short (10–60 min); refresh server-side; long expiries can leak.
- **Geo-blocking** — Mux's signed JWT can't enforce IP / region by default; do it at your origin or with watermarked policies.
- **Live stream key leakage** — anyone with the key can broadcast; rotate; restrict by IP if possible.
- **Reconnect window** — broadcaster network blip → live stream cuts; tune `reconnect_window`.
- **Player choice** — third-party players don't auto-instrument Mux Data; integrate the SDK.
- **Asset webhook idempotency** — Mux retries on failure; key on `data.id`.
- **MP4 support flag** — must be enabled at create-time to render MP4 fallback.
- **Storage of master / mezzanine** — extra cost; don't enable if not needed.
- **Bitrate / quality decisions** — let Mux smart encoding do its thing unless you have a reason.
- **DRM is harder than signed URLs** — only enable if your content rights demand it.
- **CORS for direct uploads** — configure on Mux side via API.

## Interview Cheat Sheet
- **Tagline:** API-first VOD + live + DRM + analytics video platform; per-title encoding; multi-CDN; Mux Player + Mux Data for QoE.
- **Best at:** UGC video, courses, live events, adding video to apps fast, video analytics.
- **Worst at:** sub-1s latency (use WebRTC SFU), cost-sensitive ultra-scale, embedded niche codecs.
- **Scale:** trillions of minutes streamed; multi-CDN; global ingest.
- **Distributes how:** managed multi-CDN; transcoder fleet; webhooks; SDKs.
- **Consistency / state:** Mux is source of truth for asset / live-stream state; webhooks notify your DB.
- **Killer alternative:** Cloudflare Stream (cheaper per-minute), AWS Elemental MediaConvert + CloudFront (raw infra), Bitmovin (high-end encoding), api.video, JW Platform, LiveKit / Agora / Daily / 100ms (sub-1s WebRTC), Vimeo OTT.

## Further Reading
- Official docs: <https://docs.mux.com/>
- Player: <https://www.mux.com/player>
- Mux Data: <https://docs.mux.com/guides/data/>
- Live Streaming: <https://docs.mux.com/guides/video/start-live-streaming>
- Signed URLs: <https://docs.mux.com/guides/video/secure-video-playback>
