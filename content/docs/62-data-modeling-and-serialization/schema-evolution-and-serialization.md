---
title: "Schema Evolution & Serialization Formats"
description: "How services / clients survive shape changes — JSON vs Protobuf vs Avro vs MessagePack vs Thrift. Forward / backward compatibility, schema registry, the rules of safe evolution."
---

> Topic: Key Concept · Category: Data Modeling & Serialization · Difficulty: Foundational

## TL;DR
Serialization formats convert in-memory objects ↔ bytes for storage / wire. Five common ones:
- **JSON** — human-readable, no schema, ubiquitous, verbose, slow.
- **Protobuf (Google)** — schema-first, compact, fast, gRPC default.
- **Avro (Apache)** — schema-first, schema embedded or via registry, big-data-friendly (Kafka, Hadoop).
- **MessagePack** — binary JSON-like, compact, schemaless, fast.
- **Thrift (Facebook)** — schema-first, RPC + serialization combined.

**Schema evolution** is the discipline of changing a schema without breaking existing producers / consumers. Three compatibility modes:
- **Backward** — new schema can read data written with old schema.
- **Forward** — old schema can read data written with new schema.
- **Full** — both.

The interview-critical insight: **for streams (Kafka) and persisted data, schema evolution is mandatory because old data outlives the schema**. Protobuf and Avro have explicit rules; JSON has none. Pick a format that supports your evolution discipline.

## What problem does it solve?
- **Send / store data efficiently** — JSON's `"size":42` is bigger than 2-byte protobuf varint.
- **Cross-language compatibility** — schema-first formats generate clients in many languages.
- **Schema evolution** — old code reads new data; new code reads old data.
- **Data lake schema management** — Parquet / Avro on S3.
- **Protocol stability** — gRPC + Protobuf standard.

## How they compare

| Format | Schema | Wire size | Speed | Human-readable | Schema evolution | Used in |
|---|---|---|---|---|---|---|
| **JSON** | Optional | Verbose | Moderate | Yes | Manual / tolerant readers | Web APIs, configs |
| **Protobuf** | Required | Compact | Fast | No | Field numbers + rules | gRPC, Google internal |
| **Avro** | Required | Compact | Fast | No | Embedded schema or registry | Kafka, Hadoop, big data |
| **MessagePack** | Optional | Compact | Fast | No | Manual | RPC, Redis serialization |
| **Thrift** | Required | Compact | Fast | No | Field IDs + rules | Older Facebook stack |

## How each handles evolution

### JSON
- No format-level rules; you pick.
- **Tolerant reader / writer** — ignore unknown fields; never remove fields; never rename.
- **Application-level versioning** — add `"version": 2` if needed.
- **Pros:** flexibility.
- **Cons:** silent breakage; no validation.

### Protobuf
- **Each field has a unique number** — never reused.
- **All fields are optional in proto3** (with default values).
- **Adding a field:** safe (old readers ignore unknown).
- **Removing a field:** mark `reserved` so the number isn't reused.
- **Renaming a field:** safe (number is the wire identity, not the name).
- **Type change:** dangerous — must follow specific compatibility rules (e.g., `int32` ↔ `int64` OK; `int32` ↔ `string` not).
- **`reserved` keyword** prevents future reuse of removed numbers.

```text
message User {
  int32 id = 1;
  string email = 2;
  reserved 3;             // never reuse field 3
  reserved "old_name";    // never reuse name
  string display_name = 4;  // new field; old code ignores
}
```

### Avro
- **Schema is required** (writer's schema must accompany data).
- **Reader's schema** can differ — Avro resolution rules:
  - Field present in writer + reader → use it.
  - Field in reader only → use default.
  - Field in writer only → ignore.
- **Type promotion** allowed (int → long → float → double).
- **Renaming** via aliases.
- **Schema registry** (Confluent / Apicurio) stores versions; clients fetch by ID.

```json
{
  "type": "record",
  "name": "User",
  "fields": [
    { "name": "id", "type": "long" },
    { "name": "email", "type": "string" },
    { "name": "display_name", "type": "string", "default": "" }
  ]
}
```

### MessagePack
- Schemaless; like JSON in binary.
- Evolution = same as JSON (manual).

### Thrift
- Similar to Protobuf — field IDs, evolution rules.
- Less popular today.

## Compatibility modes (Kafka context)

| Mode | Old reader, new writer | New reader, old writer |
|---|---|---|
| **Backward** | New reader reads old data | (no constraint) |
| **Forward** | (no constraint) | Old reader reads new data |
| **Full** | Both | Both |
| **None** | No guarantee | No guarantee |

**Default for Kafka topics: backward** — consumers can be upgraded ahead of producers.

## Schema registry

Confluent Schema Registry, Apicurio, AWS Glue Schema Registry:
- Store versioned schemas centrally.
- Producer registers schema (gets schema ID); message contains 4-byte schema ID + payload.
- Consumer fetches schema by ID; deserializes.
- Compatibility checks at registration time — enforce backward / forward / full.
- Used by: Kafka + Avro / Protobuf, AWS Kinesis, Pulsar.

## When to use each (real-world examples)

### JSON
- **Public REST APIs** — universally readable.
- **Configurations / manifests** — humans need to edit.
- **Logs** — pipe to anywhere.
- **Quick prototypes.**

### Protobuf
- **gRPC services** (mandatory).
- **Internal microservice protocols.**
- **High-throughput, low-latency RPC.**
- **Strongly-typed cross-language APIs.**
- **Kubernetes etcd, Google cloud APIs.**
- **Storage when size matters** (mobile sync, Bluetooth packets).

### Avro
- **Kafka + schema registry.**
- **Hadoop / data lakes** (Parquet / ORC use Avro-style schemas).
- **Streaming pipelines** with evolving schemas.
- **Apache Flink / Spark Streaming.**

### MessagePack
- **Redis serialization** of Ruby/Python/JS objects.
- **WebSocket binary frames.**
- **Mobile <-> server** when JSON's size matters but schema isn't critical.

### Thrift
- **Legacy Facebook / Twitter / LinkedIn services.**
- **Cassandra's protocol historically.**

## Things to consider / Trade-offs

### Schema-first vs schemaless
- **Schema-first (Protobuf, Avro, Thrift):**
  - ✅ Cross-language, validation, evolution rules.
  - ❌ Requires code generation step; harder to debug binary.
- **Schemaless (JSON, MessagePack):**
  - ✅ Flexible, easy to debug.
  - ❌ Manual evolution; silent breakage.

### Wire size
- **Protobuf / Avro:** ~50% size of JSON typical.
- **MessagePack:** ~70% size of JSON.
- **Compression** (gzip / zstd / snappy) can equalize JSON.

### CPU
- **Protobuf:** very fast.
- **Avro:** fast (with code-gen).
- **JSON:** moderately fast (Jackson, ujson, simdjson are competitive now).

### Schema migration discipline
- **Never reuse field numbers / IDs.**
- **Never change a field's type incompatibly.**
- **Always provide defaults for new fields.**
- **Always test with old + new client/server combinations.**

### Schema registry adoption
- **Big-data / Kafka pipelines** benefit hugely.
- **REST APIs** rarely need it (use OpenAPI for docs).

### Binary vs text
- **Binary** more efficient but harder to debug.
- **Text** ubiquitous + slow.
- **CBOR** is "binary JSON" with stricter rules.

## Common pitfalls
- **JSON without tolerant reader** — `extra_field_added` causes deserialization failure.
- **Renaming Protobuf field name** but assuming wire name matters — only field number does.
- **Reusing Protobuf field number** — old code reads garbage.
- **Schema registry compatibility mode wrong** — backward set when forward needed; deploys break.
- **Ad-hoc binary** without schema → can't evolve.
- **Forgetting to support both schemas** during migration window.
- **Type change** — int32 to string breaks.
- **No defaults** for new fields → required field missing for old data.
- **Schema drift** — multiple versions in production with no governance.
- **Treating Protobuf wire format as stable across `proto2 ↔ proto3`** — rules differ.
- **Kafka producer schema cache stale** — registry rotated; producer fails.
- **Big payloads in JSON** at scale — bandwidth + GC pressure.
- **Polyglot serialization** — Java's Jackson + Python's `dataclasses_json` may serialize differently.
- **Floating-point JSON** rounding — same number serialized differently across languages.
- **Date / time in JSON** — RFC3339 string vs epoch ms; pick one.

## Interview Cheat Sheet
- **JSON** — human-readable, no schema, ubiquitous, slow + verbose. APIs / configs.
- **Protobuf** — schema-first, compact, fast. gRPC, microservices.
- **Avro** — schema with registry. Kafka / Hadoop / data lakes.
- **MessagePack** — binary JSON; schemaless. WebSocket, Redis.
- **Schema evolution rules:** never reuse field IDs; only optional fields; provide defaults.
- **Backward / Forward / Full** compatibility — pick at registry / per-topic.
- **Tolerant reader / writer** for JSON.
- **Schema registry** for Kafka pipelines (Confluent / Apicurio / Glue).
- **Generate code** from schema for cross-language safety.
- **Killer phrase:** "Persisted / streamed data outlives the schema, so schema evolution rules — never reuse field IDs, default new fields, registry-enforce compatibility — are non-negotiable for Protobuf / Avro / Thrift; JSON gets you flexibility but no automatic safety."

## Related concepts
- [API Versioning](/docs/54-api-design-patterns/api-versioning) — schema evolution at the API layer.
- [Event Sourcing](/docs/47-event-driven-architecture/event-sourcing) — events outlive schema.
- [Stream Processing](/docs/61-stream-processing/windowing-and-watermarks) — schema-aware streaming.
- [REST vs GraphQL vs gRPC](/docs/54-api-design-patterns/rest-vs-graphql-vs-grpc) — uses different formats.
- Concrete: [Kafka](/docs/09-message-queues-and-streaming/kafka), Avro, Protobuf, Confluent Schema Registry.
