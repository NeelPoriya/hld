---
title: "Stream Processing: Windowing & Watermarks"
description: "How streaming systems handle 'continuous' data — tumbling / hopping / sliding / session windows, event-time vs processing-time, watermarks for late events, and exactly-once stream guarantees."
---

> Topic: Key Concept · Category: Stream Processing · Difficulty: Intermediate

## TL;DR
Streaming = computing on **unbounded data** (data that never stops). Two key concepts:
- **Windowing** — slice the unbounded stream into bounded chunks for aggregation. Four canonical types:
  - **Tumbling** — fixed-size, non-overlapping (`every 1 min`).
  - **Hopping** — fixed-size, overlapping (`size 1min, advance 30s`).
  - **Sliding (session)** — variable-size, gap-based (`session if idle for 30 min`).
  - **Global** — single never-ending window with custom triggers.
- **Time semantics:**
  - **Event time** — when the event actually happened (clock at the source).
  - **Processing time** — when the streaming engine sees it.
  - **Ingestion time** — when the broker received it.
  - **Watermarks** — bounds on "we've seen all events up to time T." Used to fire window computations + handle late data.

The interview-critical insight: **late events are inevitable**. Choose windowing + watermark strategy to balance correctness vs latency.

## What problem does it solve?
- **Streams are unbounded** — you can't "wait for all data" to compute.
- **Aggregations require bounds** — counts, sums, averages need a window.
- **Real-time + correct** despite out-of-order events.
- **Sliding business semantics** — "last 5 min of clicks" continually.

## Time semantics

```text
   Event happens at:     12:00:00.000  (event time)
   Phone is offline...
   Phone reconnects, sends event:
   Broker receives at:   12:00:30.000  (ingestion time)
   Stream processor processes at:  12:00:30.500  (processing time)

   If you bucket by processing time, this event lands in the 12:00:30 minute window.
   If you bucket by event time, it lands in the 12:00:00 window — but the window
     may have already "fired" 30 seconds ago.
```

**Use event time** for correctness; use processing time for cheap real-time approximations.

## Windowing types

### Tumbling
Fixed size, no overlap. Each event in exactly one window.
```
Events: ──┼─────────┼─────────┼─────────┼─────────►
         12:00     12:01     12:02     12:03

Tumbling 1min:  [12:00,12:01) [12:01,12:02) [12:02,12:03) ...
```
Use for: per-minute counts, hourly aggregates.

### Hopping
Fixed size, overlapping (slide < size). Each event in multiple windows.
```
Hopping size=1min, advance=30s:
   [12:00,12:01)
        [12:00:30,12:01:30)
                [12:01,12:02)
                       [12:01:30,12:02:30)
```
Use for: smoothed moving averages, rolling counts.

### Session
Variable size, ends after gap of inactivity. Per-key windows.
```
User A clicks: ●───●─●─────────────●───●     "session" with gaps:
                                 (gap > 30min → new session)
   Session 1: [first ●, last ●]
   Session 2: [next ●, last ●]
```
Use for: user sessions, traffic bursts.

### Global / custom
One window with custom triggers. Use for: "every 1000 events", "every 10 events from key X".

## Watermarks

A **watermark** is a logical timestamp indicating "we've probably seen all events with event_time ≤ T".

```text
   Watermark advances slowly behind incoming events.
   When watermark crosses end of window → fire the window.
   Late events arriving after watermark → handled separately:
     - drop (ignore)
     - emit late update (re-fire)
     - send to side output / dead letter
```

### Watermark strategies
- **Bounded out-of-order** — "max delay 30s; watermark = max(event_time) - 30s."
- **Punctuation-based** — special marker events advance watermark.
- **Per-source** — Kafka per-partition watermarks; combined via min.

### Late event handling
- **Allowed lateness** — extra grace period after watermark; window is updated if late event arrives.
- **Side output** — late events routed to special channel for separate handling.
- **Drop** — simplest; data loss.

## Real-world examples

- **Real-time fraud detection** — aggregate transaction counts per user per 5-min sliding window.
- **Live dashboards** — running totals every 1-second window.
- **Anomaly detection** — z-score over 1-hour rolling window.
- **Web analytics** — sessions per user (gap = 30 min idle).
- **IoT** — sensor anomaly detection per 1-min tumbling window.
- **Ad metrics** — impressions / clicks over 5-min hopping window.
- **Kafka Streams aggregations** — windowed `count()`, `aggregate()`.
- **Flink / Spark Streaming / Beam** — extensive windowing APIs.
- **Snowflake / BigQuery materialized views over streams.**

## Things to consider / Trade-offs

### Window choice
- **Tumbling:** simplest, exact partitioning, but boundary effects (event at 12:00:59 vs 12:01:00 in different windows).
- **Hopping:** smooths boundary effects; but costs N× more state (event in N windows).
- **Session:** matches user behavior but harder to bound state.
- **Global with custom trigger:** maximum flexibility but custom code.

### Time choice
- **Event time:** correct results but needs watermark handling.
- **Processing time:** fast + simple but wrong under delays.
- **Ingestion time:** middle ground.

### Watermark
- **Tighter watermark (less lateness allowed)** — faster results, more events dropped.
- **Looser watermark** — slower results, fewer events lost.
- **Heuristic** — measure max observed delay in production; set bound.

### Late data handling
- **Allowed lateness** ≠ free; state retained longer.
- **Materialized view updates** — late events trigger re-emission downstream.
- **Don't allow lateness for low-value approx metrics.**

### State
- **Stateful windowing keeps per-key state** — sized to N keys × window contents.
- **State backends:** Flink RocksDB, Kafka Streams local store + change-log topic.
- **State checkpoints** for recovery.
- **State TTL** important for unbounded keys.

### Exactly-once in streams
- **Kafka transactions + idempotent producer** — exactly-once within Kafka.
- **Flink checkpointing + 2PC sink** — exactly-once across Kafka → external sink.
- **Beam: at-least-once + idempotent processing pattern.**
- See [Delivery Guarantees](/docs/44-delivery-semantics/delivery-guarantees).

### Out-of-order events at scale
- **Per-partition watermarks** combined as `min()` for global.
- **Timestamp extractor** must handle clock skew.
- **Don't trust client timestamps** alone; allow + cap lateness.

## Common pitfalls
- **Using processing time for correctness** — phone-offline events all land in the wrong bucket.
- **No watermark strategy** — windows never fire.
- **Watermark too aggressive** — most events dropped as late.
- **Watermark too loose** — windows fire late; UI feels slow.
- **No state TTL** — unbounded growth on per-key state.
- **Confusing tumbling vs hopping** — wrong aggregation.
- **Session windows without proper gap timeout** — runaway state.
- **Late events ignored silently** — data quality issues invisible.
- **Reprocessing old data with current watermark** — produces wrong windows.
- **Cross-partition aggregations** without correct watermark merging — silent correctness bugs.
- **Treating exactly-once as easy** — Kafka transactions + Flink checkpoints + idempotent sinks all need to align.
- **Window state larger than memory** — OOM.
- **Slow downstream** — backpressure stalls the entire pipeline.
- **No monitoring of watermark lag** — silent data delay.

## Interview Cheat Sheet
- **Streaming = computing on unbounded data.**
- **Windowing types:** tumbling (no overlap), hopping (overlap), session (gap-based), global (custom).
- **Time semantics:** event-time (correct), processing-time (fast), ingestion-time (middle).
- **Watermark = "I've seen all events up to T"**; advances time + triggers windows.
- **Allowed lateness** lets late events update windows; otherwise drop / side-output.
- **Exactly-once** via Kafka transactions + checkpointed sinks (Flink).
- **Pair with [Idempotency](/docs/44-delivery-semantics/idempotency)** in downstream sinks.
- **Real systems:** Flink, Kafka Streams, Spark Streaming, Apache Beam.
- **Killer phrase:** "Use event time + watermarks for correctness; processing time for cheap approximations; allowed lateness lets you trade latency for accuracy on out-of-order events."

## Related concepts
- [Delivery Guarantees](/docs/44-delivery-semantics/delivery-guarantees) — exactly-once in streams.
- [Idempotency](/docs/44-delivery-semantics/idempotency) — required for sink-side correctness.
- [Event Sourcing](/docs/47-event-driven-architecture/event-sourcing) — events fed into streams.
- [Logical Clocks](/docs/43-time-and-ordering/logical-clocks) — ordering / watermark semantics.
- Concrete: [Flink](/docs/10-stream-processing/flink), [Kafka Streams](/docs/10-stream-processing/kafka-streams), [Spark Streaming](/docs/10-stream-processing/spark-streaming).
