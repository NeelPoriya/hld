---
title: "Consul"
description: "Consul is HashiCorp's service-mesh / service-discovery / configuration / KV platform — gossip-clustered agents, health-checked services, DNS + HTTP discovery, and Consul Connect for L7 mTLS service mesh."
---

> Category: Service Discovery & Configuration · Written in: Go · License: BUSL 1.1 (post-Aug-2023; OpenBao / OpenZiti are forks-spirit alternatives)

## TL;DR
Consul is the **HashiCorp toolkit for service-meshing and runtime discovery** of distributed services. It runs as a **server cluster** (Raft consensus, 3 or 5 nodes) plus a **client agent on every host**; agents register local services and run health checks; clients query Consul to discover healthy instances of a service either via **DNS** (`service.consul`) or **HTTP API**. Beyond discovery, Consul ships:
- **KV store** for runtime configuration / leader election.
- **Service Mesh (Connect)** — L4/L7 mTLS proxy (Envoy-based) with intentions, ACLs, traffic management.
- **Multi-datacenter federation** — WAN-gossiped fleet of clusters.
- **DNS interface** so legacy apps "just see DNS" but get health-aware records.
- **Watches / event triggers** for change notifications.

Reach for Consul when you need **service discovery + configuration + service mesh in one tool**, especially in mixed VM + container environments where pure-Kubernetes solutions (Istio / Linkerd) don't apply.

## What problem does it solve?
- **Service registry without a hand-coded one** — every service registers itself + health check; consumers query for healthy instances.
- **DNS-native discovery** — apps that already do `lookup db.internal` get health-aware answers.
- **Distributed configuration** — runtime feature flags, leader election, semaphores via KV + sessions.
- **Service mesh for non-K8s** — VMs, bare metal, mixed estates need mTLS + L7 routing too.
- **Multi-datacenter federation** — gossip + WAN allows cross-DC service queries with locality preference.

## When to use
- **Mixed VM + container environments** where Istio (K8s-only) doesn't fit.
- **Service discovery via DNS** for legacy apps.
- **Distributed locks / leader election / coordination.**
- **Hybrid cloud / on-prem** with WAN federation.
- **HashiCorp stack alignment** (Vault + Consul + Nomad + Terraform).
- **Service-mesh-light** — Connect can replace a fat Istio install for many shops.

## When NOT to use
- **Pure Kubernetes** — Istio / Linkerd are more native (Consul-on-K8s exists but is more complex).
- **Tiny single-service systems** — overkill.
- **OSS-only / OSI-license requirement** — Consul is BUSL 1.1 since Aug 2023; consider alternative service-mesh / discovery tools.
- **Read-heavy at huge global scale** — Consul scales but ZooKeeper-class consensus has limits.
- **Zero-ops desire** — Consul is real distributed software; you operate it.

## Core Concepts
- **Server agent** — runs Raft, persists state, leader-elected.
- **Client agent** — every host; registers local services / health checks; gossips with peers via SWIM-like protocol.
- **Service** — registered entity with `name`, `tags`, `address`, `port`, `check`(s).
- **Health check** — script / HTTP / TCP / TTL / Docker / gRPC; passing / warning / failing.
- **Catalog** — global view of all services + nodes.
- **DNS interface** — `<service>.service.<datacenter>.consul`; returns A / SRV records of healthy instances.
- **HTTP API** — `/v1/health/service/<name>?passing=true`.
- **KV store** — hierarchical key-value with CAS, sessions, watches.
- **Session** — coordination primitive; backs distributed locks / leader election (`session` + `acquire`).
- **Intention** — Consul Connect rule: who can talk to whom (allow / deny).
- **Connect proxy** — Envoy sidecar handling mTLS + L7 routing.
- **Datacenter** — primary cluster boundary; multi-DC via WAN.
- **Mesh Gateway** — bridges Connect traffic across DCs / partitions.
- **Namespace + Admin Partition** (Enterprise) — multi-tenancy primitives.

```hcl
# Server config (consul.hcl)
datacenter        = "dc1"
data_dir          = "/opt/consul/data"
server            = true
bootstrap_expect  = 3
ui_config { enabled = true }
client_addr       = "0.0.0.0"
retry_join        = ["consul-1.internal", "consul-2.internal", "consul-3.internal"]
acl {
  enabled        = true
  default_policy = "deny"
  enable_token_persistence = true
}
encrypt = "<gossip-encryption-key>"

connect {
  enabled = true
}
```

```hcl
# Service registration with health check + Connect sidecar
service {
  name = "api"
  port = 8080
  tags = ["v1", "prod"]
  check {
    http     = "http://localhost:8080/health"
    interval = "10s"
    timeout  = "2s"
  }
  connect {
    sidecar_service {
      proxy {
        upstreams {
          destination_name = "db"
          local_bind_port  = 5432
        }
      }
    }
  }
}
```

```bash
# DNS lookup (from any host with /etc/resolv.conf or systemd-resolved pointed at consul agent on 8600)
dig @127.0.0.1 -p 8600 api.service.consul          # A records of healthy instances
dig @127.0.0.1 -p 8600 SRV api.service.consul      # full SRV with port

# HTTP API
curl http://localhost:8500/v1/health/service/api?passing=true | jq .
```

```bash
# Distributed lock via session + KV
SESSION=$(curl -s -X PUT http://localhost:8500/v1/session/create \
  -d '{"Name":"leader","TTL":"30s","Behavior":"release"}' | jq -r .ID)

# Acquire key (returns true if lock obtained)
curl -X PUT "http://localhost:8500/v1/kv/leader?acquire=$SESSION" -d 'me'

# Renew session periodically; release to step down
curl -X PUT http://localhost:8500/v1/session/renew/$SESSION
```

## Architecture
- **Server cluster** — 3 or 5 servers; Raft consensus for strongly-consistent KV + catalog state.
- **Client agents** — one per host; gossip with cluster via SWIM (LAN gossip); forward queries to servers.
- **Health checks** — agent runs them locally; reports status to servers.
- **Gossip** — LAN within a DC, WAN across DCs for federation; encrypted with a shared key.
- **Connect data plane** — Envoy sidecars; control plane is Consul itself.
- **xDS** — Connect uses Envoy xDS for config distribution.
- **DNS** — agents serve DNS on port 8600; round-robin healthy instances; SRV for ports.

## Trade-offs

| Strength | Weakness |
|---|---|
| Discovery + config + mesh in one tool | BUSL 1.1 license (post-2023) |
| DNS interface for legacy apps | Agent on every host = ops surface |
| Multi-DC WAN federation | Cross-DC consistency requires careful config |
| KV + sessions for locks / leader-election | Raft 3-server quorum loss = downtime |
| Connect (Envoy mesh) without K8s assumption | On K8s, Istio / Linkerd are more idiomatic |
| HashiCorp ecosystem alignment | Enterprise features (namespaces, partitions, audit) gated to paid |
| ACLs + intentions + gossip encryption | ACL bootstrapping is tricky |
| Health-aware DNS responses | DNS TTL caching can mask quick failures |

## Common HLD Patterns
- **DNS service discovery for monoliths + microservices on VMs** — apps just lookup `name.service.consul`.
- **Leader election** for replica-style services (Etcd-like usage): take session + KV lock.
- **Distributed configuration** — config in KV; apps watch for changes via long-poll or use `consul-template` to render config files.
- **Multi-DC failover** — local DNS prefers local DC, falls back to remote via prepared queries.
- **Service mesh on VMs** — Connect proxies enforce mTLS + intentions; useful where Istio doesn't fit.
- **Database connection rotation** — Consul-Template renders DB config + reloads on KV changes (often paired with Vault dynamic creds).
- **Nomad + Consul** — Nomad schedules services; Consul registers + health-checks; mesh between jobs.
- **Service mesh gateways** — east-west and ingress mesh gateways for multi-DC / multi-cloud Connect traffic.

## Common Pitfalls / Gotchas
- **Quorum loss** — losing 2 of 3 servers = read-only / unavailable; use 5-server clusters in prod with thoughtful AZ spread.
- **Gossip encryption key drift** — every agent must share the same key.
- **Long DNS TTLs** — stale cached DNS can hide health-failed instances; tune TTL low.
- **`bootstrap_expect`** — set on server config; mismatched values delay leader election.
- **ACL "default_policy: deny"** but no token rotation → systems break.
- **Anti-entropy** — agent reconciles local state with catalog; aggressive checks may flap; use TTL checks for lazy services.
- **WAN gossip overhead** — federate carefully; don't WAN-join 50 DCs.
- **License BUSL 1.1** — production usage requires care for competitive / SaaS scenarios; check legal.
- **Connect intentions ordering** — first-match; explicit deny + default deny preferred.
- **Sidecar ordering on app start** — app must start after Envoy proxy is ready (or use init-containers in K8s).
- **Metrics flood** — Connect Envoy metrics are voluminous; budget your Prometheus.

## Interview Cheat Sheet
- **Tagline:** Service discovery + KV + service-mesh in one Go binary; Raft-backed servers + per-host agents; DNS + HTTP API; Connect (Envoy) for L7 mTLS mesh.
- **Best at:** mixed VM/container service discovery, runtime config + locks, multi-DC federation, hybrid mesh.
- **Worst at:** pure Kubernetes (Istio / Linkerd more native), OSS-only requirements (BUSL 1.1), ultra-tiny systems.
- **Scale:** thousands of services, tens of thousands of hosts per DC; multi-DC WAN federation.
- **Distributes how:** Raft within a DC; gossip on LAN + WAN; agents per host forward queries.
- **Consistency / state:** strongly-consistent catalog + KV via Raft; gossip-eventual member state.
- **Killer alternative:** etcd (KV-only), ZooKeeper, Eureka (Netflix; deprecated), Kubernetes Services + CoreDNS, Istio / Linkerd (mesh-only), AWS Cloud Map, NATS service discovery, Spring Cloud / Nacos.

## Further Reading
- Official docs: <https://developer.hashicorp.com/consul/docs>
- Consul Connect: <https://developer.hashicorp.com/consul/docs/connect>
- KV + sessions: <https://developer.hashicorp.com/consul/docs/dynamic-app-config/sessions>
- Multi-DC federation: <https://developer.hashicorp.com/consul/docs/architecture/federation>
