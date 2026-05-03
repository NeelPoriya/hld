---
title: "Clock Skew & NTP Synchronization"
description: "Why physical wall-clock time on distributed machines can never be trusted for ordering — clock drift, NTP, PTP, leap seconds, Google's TrueTime, and what to do about it in real systems."
---

> Topic: Key Concept · Category: Time & Ordering · Difficulty: Foundational

## TL;DR
Every machine has a **quartz oscillator** that drifts by **~10–100 microseconds per second** (~1s per day on a cheap server, far less on a GPS-disciplined one). **NTP (Network Time Protocol)** synchronizes clocks across the internet to **typical accuracy of ~10ms** (LAN: ~1ms; WAN: ~10–50ms). **PTP (IEEE 1588)** does sub-microsecond on a LAN with hardware support. **Google's TrueTime** uses GPS + atomic clocks in every datacenter to bound clock uncertainty to ~7ms and exposes it as `[earliest, latest]` to applications. The takeaway: **never trust two machines' clocks to agree to the millisecond, never use wall-clock time to order events across machines, and always assume `now()` may run backwards** (NTP step adjustments). For ordering across distributed systems, use **logical clocks** instead.

## What problem does it solve?
- **Distributed event ordering breaks under skew** — "did event A on machine 1 happen before event B on machine 2?" cannot be answered correctly with wall clocks.
- **Last-Write-Wins (LWW) conflict resolution** depends on timestamps; if clocks lie, you lose data.
- **TTL / cache expiry** — clock skew between writer and cache makes TTLs unreliable.
- **Distributed locks with TTL** (e.g., Redis Redlock) need clock agreement to be safe — without it, two nodes can hold the lock simultaneously.
- **Snapshot isolation across shards** depends on a consistent timeline.
- **Audit logs / regulatory requirements** want monotonic accurate timestamps.

## How clock skew arises

```text
Machine A clock drifts +20μs/s
Machine B clock drifts -15μs/s
Without NTP:    1 day → A ahead of B by 3 seconds
With NTP:       sync error ~10ms typical, ~100ms on bad networks
After NTP step: time can JUMP forward or BACKWARD
```

- **Drift** — quartz crystal frequency varies with temperature, age, and quality.
- **NTP slew** — NTP gradually adjusts the rate (smooth, monotonic).
- **NTP step** — large offset → sudden jump (can go *backwards*); breaks `time.monotonic()` assumptions.
- **Leap seconds** — rare extra second; broke Cloudflare DNS in 2017, broke Reddit / Cassandra at the 2012 leap.
- **Virtualization clock drift** — paused VMs lose time, then resume; suspended laptops are even worse.
- **Stratum** — NTP server tier; stratum 1 = directly attached to GPS / atomic; stratum 2+ = synced from upstream NTP.

## Time APIs to use
| API | What it returns | Safe for? |
|---|---|---|
| **`time.time()` / wall clock** | Seconds since epoch; can jump | User-visible timestamps; never for ordering |
| **`time.monotonic()`** | Always increasing; arbitrary epoch | Measuring elapsed time / timeouts |
| **HLC (Hybrid Logical Clock)** | Wall + logical counter | Distributed event ordering |
| **TrueTime (`TT.now()`)** | `[earliest, latest]` interval | Externally consistent transactions (Spanner) |

## When this matters (real-world examples)
- **Cassandra LWW timestamps** — out-of-sync clocks cause **write loss**: an old write with a newer timestamp wins. Cassandra docs warn explicitly: keep clocks within a few ms.
- **Distributed locks** — Redis Redlock; Martin Kleppmann showed that clock skew can cause lock holders to overlap.
- **Kerberos** — tickets have validity windows; >5min skew breaks auth.
- **TLS certificate validation** — wrong clock = "certificate expired" or "not yet valid" failures.
- **Spanner / TrueTime** — Google's solution; commit waits out the uncertainty window for external consistency.
- **CockroachDB / YugabyteDB** — uses HLC + clock-uncertainty checks; aborts transactions if skew exceeds bound.
- **Kafka log retention** — based on timestamps; clock issues cause early or late deletion.
- **Token expiry** — JWT, OAuth tokens; skew > expiry tolerance = false rejections.
- **Stripe webhook signatures** — include timestamp; skew > 5min = signature rejected.
- **Audit logs / compliance** — bank ledgers, healthcare events; need bounded skew.
- **Grafana / Prometheus dashboards** — metric timestamps from skewed nodes look like out-of-order data.

## When you can ignore it
- **Single-node systems** — no comparison across machines.
- **Skew-tolerant logic** — aggregations over hour buckets are fine with sub-second skew.
- **Coarse rate limiting** — minute-resolution limits don't care about ms.
- **Logging only** — useful for human reading; not used for logic.

## Things to consider / Trade-offs
- **Always run NTP** (or `chronyd`, `systemd-timesyncd`) — typical error 1–10ms, good enough for most.
- **Multiple NTP sources** — at least 3 stratum-2 servers (e.g., `time.cloudflare.com`, `pool.ntp.org`, AWS / GCP TimeSync).
- **`chronyd`** is more robust than legacy `ntpd` (handles VM pause, network jumps).
- **PTP for high-precision** — sub-microsecond on a LAN with NIC hardware support.
- **Slew, don't step** — configure `chronyd -x` or similar to never step backwards in production.
- **Disable VM clock-sync for guests if NTP runs inside** — double-syncing fights itself.
- **Bound your skew assumption** — code that assumes "<5ms skew" should fail-safe on detected skew above that.
- **Prefer monotonic clocks** for everything internal — timeouts, latency measurements, `time.elapsed()`.
- **Hybrid Logical Clocks (HLC)** — combine physical + logical for "approximately wall-time but never goes backwards across machines."
- **TrueTime** — Google's dedicated GPS + atomic clock infra; commit-wait protocol guarantees external consistency.
- **AWS Time Sync Service / GCP / Azure** — cloud NTP at <1ms; use these on cloud VMs.
- **Be wary of `Date.now()` in JavaScript** — can step backward when the user changes their clock.
- **Test for clock jumps** — what happens to your retry timer if the clock jumps 1 hour forward? Backward?

## Common pitfalls
- **Comparing timestamps from two services to decide ordering** — always wrong.
- **Using `Date.now()` for timeouts** — `monotonic()` is safer.
- **TTL-based distributed locks (Redlock) without fencing tokens** — Kleppmann's classic warning.
- **Sleeping until a wall-clock time** — clock jump can sleep forever or wake too soon.
- **Cassandra LWW with skewed clocks** — silent write loss.
- **Leap second day** — Cloudflare's 2017 outage; many DBs froze.
- **DST / timezone changes mistaken for clock skew** — always work in UTC internally.
- **VM resumed from suspend** — clock can jump hours; many systems hang or misbehave.
- **JWT / OAuth token "not yet valid"** — issuer ahead of verifier by even a few seconds.
- **Cron jobs running twice or skipping** when clock steps.

## Interview Cheat Sheet
- **NTP accuracy:** ~1ms LAN, ~10ms WAN, sub-microsecond with PTP.
- **Drift:** ~100μs/s without sync; up to seconds/day on cheap hardware.
- **Never use wall clock for distributed ordering** — use logical clocks (Lamport / HLC) or consensus.
- **`time.monotonic()`** for elapsed time / timeouts; never wall clock.
- **Leap seconds + DST** are real problems; UTC internally always.
- **Spanner's TrueTime** uses GPS + atomic clocks + commit-wait for external consistency.
- **Cloud-native NTP:** AWS Time Sync, GCP / Azure NTP, Cloudflare; <1ms typical.
- **Distributed locks** need fencing tokens; clock TTLs alone are unsafe.

## Related concepts
- [Logical Clocks](/docs/43-time-and-ordering/logical-clocks) — Lamport, vector, HLC; ordering without trusted wall clocks.
- [Replication Strategies](/docs/42-data-distribution/replication-strategies) — LWW + clock skew = data loss.
- [Idempotency](/docs/44-delivery-semantics/idempotency) — needed because timing-based deduplication is unreliable.
- Concrete systems: [Spanner](/docs/01-relational-databases/spanner) (TrueTime), [CockroachDB](/docs/01-relational-databases/cockroachdb) (HLC), [Cassandra](/docs/03-wide-column-stores/cassandra) (LWW + warnings).
