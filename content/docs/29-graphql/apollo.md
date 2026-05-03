---
title: "Apollo GraphQL"
description: "Apollo is the canonical GraphQL platform — Apollo Server for the gateway, Apollo Client for browsers, Apollo Federation for composing subgraphs, and Apollo Router (Rust) for production gateways."
---

> Category: GraphQL · Written in: TypeScript (server, client) + Rust (Router) · License: MIT (server, client) + ELv2 (Router)

## TL;DR
Apollo is the **default GraphQL stack**. It spans:
- **Apollo Server** — Node GraphQL server (resolvers, schema, plugins).
- **Apollo Client** — JS / iOS / Android / Kotlin clients with normalized cache.
- **Apollo Federation** — spec for composing many GraphQL subgraphs into one supergraph.
- **Apollo Router** — high-perf Rust gateway implementing Federation v2 (replaces older JS gateway).
- **GraphOS / Apollo Studio** — managed schema registry, observability, CI checks.

GraphQL itself solves the **REST over-fetch / under-fetch problem**: instead of N round-trips to N REST endpoints with whatever shapes the backend chose, the client asks for **exactly the fields it needs** in one request. Apollo + Federation lets multiple teams own different parts of the schema (the **subgraphs**), and the gateway stitches them into one supergraph the clients see.

Reach for Apollo when you have many backend services that need to expose a unified API to web / mobile clients, you have polyglot frontends sharing types, and you want a strongly-typed client cache that's smarter than `fetch`.

## What problem does it solve?
- **Over-fetch / under-fetch in REST** — clients pull only what they ask for.
- **N+1 endpoints per page** — single round trip serves complex screens.
- **Backend schema fragmentation** — Federation unifies many services into one schema.
- **Strongly-typed cache** — Apollo Client's normalized cache deduplicates entities by `__typename + id`.
- **Schema governance + observability** — GraphOS tracks schema changes + per-field usage.

## When to use
- **Multiple frontends** (web + iOS + Android) sharing a typed API.
- **Composable backend** (microservices) that need a unified gateway.
- **Rich UI screens** with deeply-nested data — single GraphQL query beats 10 REST calls.
- **Realtime via subscriptions** (over WS / SSE).
- **Strongly-typed client codegen** (`graphql-codegen`).

## When NOT to use
- **Public REST-style APIs for third parties** — REST + OpenAPI is more idiomatic.
- **Heavy file uploads / streaming** — REST + S3 presigned URLs is simpler.
- **Tiny apps with one client** — REST is less ceremony.
- **Caching by HTTP / CDN** — REST GETs cache trivially; GraphQL is POST by default.
- **Read-mostly large-payload public APIs** — GraphQL parsing + N+1 risk often outweigh benefits.

## Core Concepts (GraphQL Itself)
- **Schema** — types, queries, mutations, subscriptions; SDL syntax.
- **Resolver** — function per field; receives `(parent, args, context, info)`; returns scalar / object / promise.
- **Operations** — `query`, `mutation`, `subscription`.
- **Fragments** — reusable selection sets.
- **Variables** — typed parameters to operations.
- **Introspection** — schema is queryable; powers tooling.

```graphql
# subgraph: products.graphql
extend schema @link(
  url: "https://specs.apollo.dev/federation/v2.5",
  import: ["@key", "@shareable"]
)

type Product @key(fields: "id") {
  id: ID!
  title: String!
  price: Int!
  inStock: Boolean!
}

type Query {
  product(id: ID!): Product
  products(first: Int = 20): [Product!]!
}

type Mutation {
  setPrice(id: ID!, price: Int!): Product!
}
```

```typescript
// Apollo Server (subgraph)
import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { typeDefs } from "./schema";

const resolvers = {
  Query: {
    product: (_, { id }, ctx) => ctx.dataSources.catalog.byId(id),
    products: (_, { first }, ctx) => ctx.dataSources.catalog.list(first)
  },
  Mutation: {
    setPrice: (_, { id, price }, ctx) =>
      ctx.dataSources.catalog.update(id, { price })
  },
  Product: {
    __resolveReference: (ref, ctx) => ctx.dataSources.catalog.byId(ref.id)
  }
};

const server = new ApolloServer({
  schema: buildSubgraphSchema({ typeDefs, resolvers }),
  introspection: process.env.NODE_ENV !== "production"
});
await startStandaloneServer(server, { listen: { port: 4001 } });
```

```typescript
// Apollo Client (browser)
import { ApolloClient, InMemoryCache, gql, useQuery } from "@apollo/client";

const client = new ApolloClient({
  uri: "https://api.example.com/graphql",
  cache: new InMemoryCache({
    typePolicies: { Product: { keyFields: ["id"] } }
  })
});

const PRODUCT = gql`
  query Product($id: ID!) {
    product(id: $id) { id title price inStock }
  }
`;

function ProductPage({ id }) {
  const { data, loading } = useQuery(PRODUCT, { variables: { id } });
  if (loading) return <Spinner />;
  return <ProductView product={data.product} />;
}
```

## Federation Architecture
- **Subgraphs** — independent GraphQL services owned by different teams.
- **Supergraph** — composed schema published to GraphOS / file.
- **Gateway / Router** — query planner; for each operation, decomposes into per-subgraph fetches; merges results.
- **`@key`** — entity identity; subgraphs can extend the same type by joining on key.
- **`@external`, `@requires`, `@provides`** — fine-grained ownership directives.
- **Apollo Router (Rust)** — production-grade gateway; replaces JS gateway; hot-reloads supergraph SDL; OTel-native.

## Trade-offs

| Strength | Weakness |
|---|---|
| Client requests only the fields it needs | Operational complexity vs REST |
| Federation lets many teams own one API | N+1 resolver problem if not using DataLoader |
| Strongly-typed end-to-end | Schema design discipline required |
| Excellent client cache (Apollo Client) | Caching at HTTP/CDN is harder (POST + body) |
| Subscriptions over WS / SSE | Subscriptions are awkward to scale across many gateways |
| GraphOS schema registry + checks | GraphOS commercial; OSS alternative is Hive / WunderGraph |
| Apollo Router is fast (Rust) | Router license is Elastic v2 (not pure OSS) |
| Codegen tools (`graphql-codegen`) | Persisted queries needed for security at scale |

## Common HLD Patterns
- **BFF (Backend-for-Frontend):** GraphQL gateway in front of REST microservices; one schema per frontend variant.
- **Federation across teams:** each team owns a subgraph; CI publishes supergraph; router serves clients.
- **Persisted queries / APQ:** clients send query hash, gateway resolves to whitelisted query; smaller payloads + security.
- **DataLoader pattern:** batch + cache resolver fetches per request to defeat N+1.
- **Subscriptions:** GraphQL subscription over WebSocket; backend publishes events; gateway fans out.
- **Schema checks in CI:** GraphOS / Inigo / Hive runs operation-impact analysis on PRs to prevent breaking changes.
- **Auth via context:** auth middleware sets `context.user`; resolvers check; field-level auth via directives.

## Common Pitfalls / Gotchas
- **N+1 resolvers** — naive resolver calls DB per item; always use DataLoader / batch.
- **Unbounded queries** — clients can request 100-deep relations; use depth limit + cost limit + persisted queries.
- **Authorization at the wrong layer** — apply at resolver / field level; not just the gateway.
- **CDN-cacheable GETs** — POST is default; use APQ + HTTP GET to cache.
- **Federation DDL drift** — subgraph schema changes must compose; CI must enforce.
- **Public introspection** — disable in production for security.
- **Subscription scale** — one subscription per client per topic; fan-out across many gateway nodes is non-trivial.
- **Schema bloat** — every type added is forever; deprecation discipline is essential.
- **Client cache invalidation** — Apollo cache uses `__typename + id`; missing IDs break normalization.
- **Apollo Router config** — Rust router is fast but its YAML config is rich; treat it as IaC.

## Interview Cheat Sheet
- **Tagline:** Default GraphQL stack — Server (Node), Client (JS/iOS/Android), Federation (compose subgraphs), Router (Rust gateway), GraphOS (schema registry / observability).
- **Best at:** unified API across microservices, multi-frontend type-sharing, deeply-nested UIs, schema governance.
- **Worst at:** public REST-like APIs, large file streaming, simple single-client apps, HTTP-cache-friendly read-heavy APIs.
- **Scale:** subgraph services scale independently; Apollo Router (Rust) handles tens of thousands of req/s per node.
- **Distributes how:** Router decomposes operations into per-subgraph fetches in parallel; merges results.
- **Consistency / state:** single-request consistency only; resolvers fetch from each subgraph independently.
- **Killer alternative:** REST + OpenAPI, gRPC + grpc-gateway, tRPC (TS-only), Hasura (instant GraphQL on Postgres), WunderGraph, Hot Chocolate (.NET), GraphQL Yoga, Pothos (schema-first TS).

## Further Reading
- Official docs: <https://www.apollographql.com/docs/>
- Federation: <https://www.apollographql.com/docs/federation/>
- Apollo Router: <https://www.apollographql.com/docs/router/>
- DataLoader (N+1 solution): <https://github.com/graphql/dataloader>
