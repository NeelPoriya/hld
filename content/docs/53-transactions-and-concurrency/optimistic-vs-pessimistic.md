---
title: "Optimistic vs Pessimistic Concurrency Control"
description: "Two app-level strategies for handling concurrent updates — pessimistic (lock first, work later, no conflicts) vs optimistic (work first, check-and-retry on conflict). Version columns, ETag headers, conditional writes, and when each is the right answer."
---

> Topic: Key Concept · Category: Transactions & Concurrency Control · Difficulty: Foundational

## TL;DR
When two users edit the same row, you can either:
- **Pessimistic:** **lock the row first**, do work, release. Other tx wait. (`SELECT ... FOR UPDATE`, distributed locks, advisory locks.) Conflicts are *prevented*.
- **Optimistic:** **read freely**, do work, check on save: "is the row still as I read it?" If not, **retry**. (Version columns, ETag, `IF` conditions on DynamoDB / Cosmos.) Conflicts are *detected*.

**Optimistic wins for high-read, low-conflict workloads** (most web apps). **Pessimistic wins for high-conflict critical sections** (inventory decrement, leader election). The two are not mutually exclusive — you'll mix them in real systems.

## What problem does each solve?

### Pessimistic
- **Guaranteed exclusivity** during the critical section.
- **No retry logic** — once you have the lock, you own the row.
- **Predictable latency** under low contention (no abort-retry storms).
- **Simple correctness reasoning** — locks define order.

### Optimistic
- **No blocking** of other readers / writers in the common case.
- **High throughput** under low contention.
- **Stateless servers** (no held locks across requests; survives server restart trivially).
- **Web-friendly:** ETag / If-Match in HTTP is optimistic concurrency over a network.

## How they work

### Pessimistic
```sql
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;     -- acquires X-lock on row
-- compute new balance
UPDATE accounts SET balance = ? WHERE id = 1;
COMMIT;     -- releases lock
```

- Other transactions trying to read or write that row **wait** until commit.
- Lock granularity: row, page, table, predicate.
- `FOR UPDATE NOWAIT` / `SKIP LOCKED` for non-blocking variants.

### Optimistic (version column)
```sql
-- Row has a `version` column that increments on every write.
-- Step 1: read
SELECT id, balance, version FROM accounts WHERE id = 1;     -- version = 7
-- Step 2: compute new balance in app code

-- Step 3: write conditionally
UPDATE accounts
   SET balance = ?, version = version + 1
 WHERE id = 1 AND version = 7;
-- If 0 rows updated → another tx beat you; retry.
```

### Optimistic (ETag / HTTP)
```http
GET /todos/42
ETag: "v7"

PUT /todos/42
If-Match: "v7"
{ "title": "..." }

# Server compares ETag; if outdated → 412 Precondition Failed → client retries.
```

### Optimistic (DynamoDB / Cosmos / NoSQL conditional write)
```javascript
// DynamoDB
ddb.update({
  TableName: "todos",
  Key: { id: "42" },
  UpdateExpression: "SET title = :t",
  ConditionExpression: "version = :v",
  ExpressionAttributeValues: { ":t": "...", ":v": 7 }
});
// throws ConditionalCheckFailed if version doesn't match
```

## When to use each (real-world examples)

### Pessimistic
- **Inventory decrement** — "decrement quantity if > 0"; high contention; lock or atomic SQL.
- **Bank balance updates** — `SELECT FOR UPDATE` + check + update + commit.
- **Singleton job execution** — distributed lock for "only one cron runs."
- **Order workflow steps** that mustn't run twice.
- **Database schema migration** — `LOCK TABLE`.
- **Job queues** — `SELECT FOR UPDATE SKIP LOCKED` to claim a job (PG advisory lock pattern).
- **Allocator services** that hand out unique IDs / sequence numbers.

### Optimistic
- **Web app updates** — user edits profile, saves; ETag detects "someone else edited" → re-render conflict UI.
- **Document collaboration** — Google Docs, Notion, Figma use OT / CRDTs which are basically OCC primitives.
- **Mobile app sync** — server sends version stamps; client retries on conflict.
- **DynamoDB / Cosmos / Firestore** — conditional writes are the idiom.
- **Distributed counters** with retry — `INCR` is naturally atomic, but compound counters need optimistic.
- **Upsert patterns** — `INSERT ... ON CONFLICT DO UPDATE`.
- **REST API writes** with `If-Match` header.
- **Event sourcing** — append events with expected version; conflicts cause retry.
- **Browser-edited forms** — version-token in form; reject stale submits.

## When NOT to use each

### Don't use pessimistic
- **High-throughput, low-conflict** — locks add overhead, serialize work unnecessarily.
- **Distributed systems** — pessimistic locks across services create coupling; need lease + fencing.
- **Long-running operations** — locks held forever block everyone.
- **REST APIs** — you can't hold a DB lock across HTTP requests.

### Don't use optimistic
- **High-contention hot rows** — every transaction aborts; throughput collapses. Pessimistic + queue is faster.
- **Operations with side effects in middle** — already sent the email when conflict detected → can't roll back.
- **Long computation between read and write** — high probability another writer beat you; lots of wasted work.
- **Without retry logic** — single attempt with no retry surfaces conflicts to user.

## Things to consider / Trade-offs
- **Conflict probability is the deciding factor.** Low conflict → optimistic; high → pessimistic.
- **Granularity** — row-level locks are usually fine; page / table locks block too much.
- **Lock timeout** — never block forever; set a deadline.
- **Deadlock prevention** — consistent lock order; deadlock detection in DB; always retry on `40P01`.
- **Optimistic retry strategy** — exponential backoff; cap retries; surface to user on persistent conflict.
- **Version column placement** — separate column or use `updated_at` (with millisecond precision); but `updated_at` collisions happen.
- **HTTP ETag generation** — strong vs weak; usually a content hash or version number.
- **MVCC** under the hood: **read** doesn't conflict with **write** (no locks needed); but two **writes** still conflict — optimistic detects, pessimistic prevents.
- **Saga pattern** is essentially optimistic across services + compensations.
- **Mixed approach** — short pessimistic lock around the critical compute + check, optimistic for read paths.
- **Test for conflict storms** — in load tests, simulate hot-row contention; observe abort rate.

## Common pitfalls

### Pessimistic
- **Lock leaks** — forgetting to commit/rollback; lock held forever.
- **Deadlocks** — inconsistent lock order. Sort lock acquisitions by ID.
- **Holding locks across user input** — never. Long pessimistic locks across HTTP requests are a scalability disaster.
- **`SELECT FOR UPDATE` on read replicas** — most replicas don't support write locks; must hit primary.
- **Distributed locks without fencing tokens** — silent split-brain (see [Distributed Locks](/docs/52-consensus-and-coordination/distributed-locks)).
- **Lock granularity mismatch** — taking a table lock when row lock would do.

### Optimistic
- **No retry logic** — conflicts surface to user as errors; bad UX.
- **Infinite retry on hot rows** — system thrashes; cap retries + fall back.
- **Mutating side effects between read and write** — sent email, then conflict; need to undo.
- **Version column not unique** — two writers increment to same version; conflict undetected.
- **Stale ETag** — compare against `updated_at` with second-precision; sub-second collisions.
- **Forgetting to bump version** on every write — silent overwrites.
- **Using server-generated `updated_at` on read but `now()` on write** — race conditions in version comparison.
- **Resending the same write multiple times after conflict** without re-reading — infinite loop.

## Interview Cheat Sheet
- **Two strategies:** pessimistic (lock first) vs optimistic (work first, retry on conflict).
- **Optimistic** = version column + conditional update + retry.
- **Pessimistic** = `SELECT FOR UPDATE`, advisory lock, distributed lock.
- **Pick optimistic for:** web apps, low contention, REST APIs, distributed systems.
- **Pick pessimistic for:** hot rows, sequential critical sections, singleton execution.
- **HTTP ETag / If-Match** is optimistic concurrency over the network.
- **DynamoDB / Cosmos conditional writes** are optimistic-by-design.
- **MVCC underneath** — both strategies coexist with MVCC.
- **Deadlock detection** is pessimistic's friend; **retry on conflict** is optimistic's.
- **Mixed approach is normal.**

## Related concepts
- [Isolation Levels](/docs/53-transactions-and-concurrency/isolation-levels) — what concurrency anomalies you must handle.
- [MVCC vs Locking](/docs/53-transactions-and-concurrency/mvcc-and-locking) — DB-level mechanics.
- [Idempotency](/docs/44-delivery-semantics/idempotency) — companion: safe retry.
- [Distributed Locks](/docs/52-consensus-and-coordination/distributed-locks) — pessimistic across services.
- [Saga Pattern](/docs/47-event-driven-architecture/saga-pattern) — optimistic across services with compensation.
- Concrete: Postgres `SELECT FOR UPDATE`, [DynamoDB](/docs/02-key-value-stores/dynamodb) conditional writes, HTTP ETag / If-Match.
