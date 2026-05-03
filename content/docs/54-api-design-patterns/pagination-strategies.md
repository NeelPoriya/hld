---
title: "Pagination Strategies"
description: "How to return a long list piece by piece — offset/limit (page=2), cursor (?after=xyz), keyset (?gt=last_id), seek-based; why offset breaks at scale and cursor is the right answer for everything past 100K rows."
---

> Topic: Key Concept · Category: API Design Patterns · Difficulty: Foundational

## TL;DR
Three main strategies:
- **Offset / limit** (`?page=2&limit=20`) — easy to implement; **broken at scale** (DB scans `OFFSET` rows; deep pages slow; pages drift if rows insert/delete).
- **Cursor / token-based** (`?after=eyJpZCI6MTIzfQ`) — opaque server-generated cursor; **correct + fast** at any depth; can't jump to page 50; what every modern API uses.
- **Keyset / seek-based** (`?gt_id=12345`) — use indexed column as the seek key (`WHERE id > 12345 ORDER BY id LIMIT 20`); fast; deterministic; can be combined with cursor encoding.

**Use cursor or keyset for any list that might have > 1000 entries**. Offset is fine only for small lists with stable ordering.

## What problem does it solve?
- **Returning 1M rows in one response is impossible** — payload size, latency, memory.
- **Stable pagination over changing data** — pages shouldn't shift or repeat as items are added.
- **Index-friendly queries** — DB shouldn't scan every preceding row.
- **Client UX** — load more on scroll, jump to specific row, deep-link.

## How they work

### 1. Offset / limit
```http
GET /posts?offset=40&limit=20
GET /posts?page=3&per_page=20      (offset = (page - 1) * per_page)
```

```sql
SELECT * FROM posts ORDER BY created_at DESC OFFSET 40 LIMIT 20;
```
- DB still **scans 40 + 20 rows**, returns last 20.
- Page 1000 with `OFFSET 19999` reads 20K rows. Slow.
- **Drift:** insert at top → page 2 contains row that was on page 1.

### 2. Cursor / token-based
```http
GET /posts?after=eyJpZCI6MTIzLCJ0aW1lIjoxNzAwMDAwMDAwfQ
{ "data": [...], "next_cursor": "eyJpZCI6MTQzLCJ0aW1lIjoxNzAwMDA0MDAwfQ" }
```

The cursor is an **opaque base64-encoded JSON** containing the seek key (e.g., `{ id: 143, time: 1700004000 }`). Server uses it directly:
```sql
SELECT * FROM posts
 WHERE (created_at, id) < ($1, $2)        -- composite seek key
 ORDER BY created_at DESC, id DESC
 LIMIT 20;
```
- **Index-friendly** (seek-then-scan-N).
- **No drift** — even with inserts, you continue from the last seen row.
- **Can't jump to page N** — only "next" / "prev."

### 3. Keyset / seek-based (cursor's transparent cousin)
```http
GET /posts?gt_id=12345&limit=20
```
- Just a typed query parameter; not encoded.
- Same SQL pattern as cursor.
- Cleaner for internal APIs; cursors are better for public APIs (opaque = easier to evolve).

## Recipes

### Composite seek (for non-unique sort key)
Sort by `created_at DESC`, but `created_at` isn't unique → tie-break by primary key:
```sql
WHERE (created_at, id) < (last_seen_created_at, last_seen_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

### Bidirectional cursor (next + prev)
- Return both `next_cursor` (last item) and `prev_cursor` (first item).
- Client sends one or the other.

### "Has more" indicator
Fetch `LIMIT N+1` rows; if you got `N+1`, set `has_more = true` and drop the last one.

### Total count
Pagination doesn't give a free total count. If users need "page 1 of 50," do a separate `SELECT COUNT(*)`. **Cache aggressively** — counts on big tables are slow. Or display "showing 1-20 of many."

## When to use each (real-world examples)

### Offset
- **Admin dashboards** with stable, small datasets ("show me the 50 deleted records").
- **Search results** where total count + page jumping matter (Google-style "page 1 of 10").
- **Internal reports** with bounded data (last 24 hours of orders).
- **Lists < 10K rows** where deep pages are rare.

### Cursor / Keyset
- **Public APIs at scale:** Stripe (`starting_after`), Twitter (`since_id` / `max_id`), GitHub (`after`/`before`), Slack (`cursor`), Shopify (`page_info`).
- **Infinite scroll feeds** — Instagram, Facebook, TikTok all cursor-paginated.
- **Time-series logs** — Loki, Cloudwatch, Datadog log search.
- **Email inboxes / message lists.**
- **Long activity feeds.**
- **Anything sorted by `created_at DESC` with new items arriving.**
- **Database CDC consumers** — track last processed offset.

## Things to consider / Trade-offs

- **Stability under inserts.** Offset fails; cursor / keyset succeed.
- **Stability under deletes.** Most strategies are robust to a deleted item; if cursor points to a deleted row, just skip / return next.
- **Sort key uniqueness.** Always include a unique tie-breaker (PK) in cursor — otherwise rows can be skipped or repeated.
- **Total count is expensive.** Don't compute on every page load; cache or skip.
- **Cursor opacity.** Public APIs should hide the structure; opaque base64 lets you change it later.
- **Cursor signing.** If the cursor encodes user-specific filters, sign or HMAC it to prevent tampering.
- **Deep pagination.** Cursor stays O(N) per page regardless of depth; offset becomes O(offset).
- **Indexes are mandatory.** Seek keys must match a btree index, or `ORDER BY + LIMIT` falls back to scan.
- **Sort direction.** Default DESC for "newest first" feeds; tie-break with `id DESC`.
- **Cursors and filtering.** Cursor must encode all filter state (or filter must be in URL alongside cursor). Otherwise change of filter mid-pagination yields chaos.
- **Cursor expiry.** Database changes (re-index, partition, schema migration) can invalidate cursors.
- **Pagination + caching.** Cursor URLs are cacheable per (cursor, filter); offset URLs are too but each page is rebuilt.
- **GraphQL "Relay-style" connections** are cursor-based and standardized — `edges`, `node`, `pageInfo`.

## Common pitfalls

- **Offset on million-row tables** — slowest pages take seconds.
- **No tie-breaker on non-unique sort** — items repeat or skip across pages.
- **Cursor without filter context** — change filter, cursor points to wrong slice.
- **Returning total count on every page** — N×O(scan) per pagination session.
- **Page drift not handled** — user "loads more" and sees same items again because offset shifted.
- **Cursor structure leaks** — clients depend on its internals; can't change format later.
- **Limits unbounded** — `?limit=999999` lets clients DOS your DB. Cap server-side.
- **Mixing pagination parameters** — `?page=` AND `?cursor=` simultaneously; pick one.
- **Forgetting to validate cursor signature** if it encodes auth-relevant filters.
- **Database missing the right composite index** — your seek runs full scan.
- **Cursor encoded as JSON without compression** — long cursor strings.
- **Two queries when one will do** — SELECT + COUNT + JOIN; reduce.

## Interview Cheat Sheet
- **Three strategies:** offset / limit, cursor / token, keyset / seek.
- **Offset:** simple, broken at scale, drifts.
- **Cursor:** opaque token; index-friendly; standard for public APIs.
- **Keyset:** transparent column-based seek; clean internally.
- **At scale → cursor or keyset.**
- **Composite seek key** (sort col + PK) needed for non-unique sorts.
- **Total count** is a separate, often cached, query.
- **Public APIs use cursor:** Stripe, GitHub, Slack, Shopify, Twitter.
- **Always cap server-side limit.**
- **Killer phrase:** "Offset is `OFFSET N + LIMIT M`; cursor is `WHERE (sort, id) < (last_seen) LIMIT M` — same throughput at depth 0, vastly different at depth 10K."

## Related concepts
- [REST vs GraphQL vs gRPC](/docs/54-api-design-patterns/rest-vs-graphql-vs-grpc) — every API needs pagination.
- [Sharding & Partitioning](/docs/42-data-distribution/sharding-and-partitioning) — cross-shard pagination is hard.
- [Caching Strategies](/docs/41-caching/caching-strategies) — paginate-then-cache pattern.
- Concrete: Stripe API design guide, GraphQL Relay Cursor Spec.
