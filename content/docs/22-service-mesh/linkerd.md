---
title: "Linkerd"
description: "Linkerd is the lightweight, security-first service mesh — a Rust micro-proxy (linkerd2-proxy) sidecar with mTLS by default, sub-millisecond overhead, and CNCF-graduated."
---

> Category: Service Mesh · Written in: Rust (data plane) + Go (control plane) · License: Apache 2.0

## TL;DR
Linkerd is the **simpler, lighter, security-first service mesh** for Kubernetes — CNCF-graduated, with a custom Rust micro-proxy (`linkerd2-proxy`) instead of Envoy. Its calling cards: **zero-config mTLS by default**, **sub-millisecond p99 overhead**, **tiny memory footprint**, and an opinionated feature set that prioritizes operational simplicity over Istio's everything-and-the-kitchen-sink. Reach for Linkerd when you want a service mesh's core benefits (mTLS, retries, golden metrics, traffic shifting) **without** the operational weight of Istio.

## What problem does it solve?
- **mTLS everywhere with zero config** — the default; no PeerAuthentication CRDs needed.
- **Tiny per-pod overhead** — the Rust proxy uses ~10 MB RAM and ~0.5 ms latency.
- **Minimal CRD surface** — fewer concepts, fewer foot-guns; easier to learn and debug.
- **Excellent default observability** — `linkerd viz` ships with Grafana / Prometheus / web dashboards.
- **Pragmatic feature set** — retries, timeouts, traffic split, but not the deep richness of Istio (which can be a feature, not a bug).

## When to use
- **Most Kubernetes meshes** that don't need Istio's full feature surface.
- **Latency-sensitive** services — Rust proxy beats Envoy on tail latency at light load.
- **Small platform teams** without bandwidth to operate Istio.
- **Security-first** environments wanting mTLS-by-default with auto-rotation.
- **Multi-cluster** with simpler topology than Istio's multi-network model.

## When NOT to use
- **You need Envoy-specific features** — gRPC-Web, complex filter chains, ext_authz integrations — use Istio or raw Envoy.
- **Highly customized traffic logic** — Linkerd intentionally limits what you can configure.
- **Non-K8s environments** — Linkerd is K8s-only (Linkerd 2.x); Consul Connect or AWS App Mesh fit better.
- **Heavy L7 policy needs** — Istio's AuthorizationPolicy is richer.

## Architecture
- **Control plane** — Go services in the `linkerd` namespace:
  - **destination** — service discovery + endpoint metadata.
  - **identity** — mTLS CA + cert issuance (rotates every 24h by default).
  - **proxy-injector** — webhook that injects the Rust proxy into pods.
  - **policy** — server-side policy enforcement.
- **Data plane** — `linkerd2-proxy` Rust sidecar; intercepts TCP traffic via iptables; speaks HTTP/1.1, HTTP/2, gRPC; transparent for unknown TCP.
- **Extensions** — `linkerd-viz` (observability), `linkerd-multicluster`, `linkerd-jaeger`.

```yaml
# Inject linkerd into a namespace (auto-injection)
kubectl annotate ns prod linkerd.io/inject=enabled

# Manual inject (per pod)
kubectl get deploy api -o yaml | linkerd inject - | kubectl apply -f -

# Observe
linkerd viz top deploy/api -n prod
linkerd viz tap deploy/api -n prod
linkerd viz dashboard      # opens browser to Grafana / topology
```

```yaml
# TrafficSplit: 90/10 canary
apiVersion: split.smi-spec.io/v1alpha2
kind: TrafficSplit
metadata: { name: api-split, namespace: prod }
spec:
  service: api
  backends:
  - service: api-v1
    weight: 90
  - service: api-v2
    weight: 10
---
# AuthorizationPolicy (Linkerd-native)
apiVersion: policy.linkerd.io/v1beta3
kind: AuthorizationPolicy
metadata: { name: api-allow, namespace: prod }
spec:
  targetRef: { group: core, kind: Service, name: api }
  requiredAuthenticationRefs:
  - kind: ServiceAccount
    name: web
    namespace: prod
```

## Core CRDs / Concepts
- **Server / ServerAuthorization / AuthorizationPolicy** — mesh-native policy.
- **HTTPRoute / GRPCRoute** (Gateway API) — request-based routing.
- **TrafficSplit** (SMI) — weighted traffic shifting.
- **MeshTLSAuthentication / NetworkAuthentication** — auth subjects (mTLS identity, IPs).

## Trade-offs

| Strength | Weakness |
|---|---|
| mTLS by default, zero config | Smaller feature surface than Istio |
| Tiny Rust proxy: ~10 MB RAM, ~0.5 ms p99 | Less ecosystem / fewer plugins |
| `linkerd viz` excellent OOTB observability | No ambient-mode equivalent (yet) — sidecar-only |
| Simple operational story; few CRDs | gRPC-Web / ext_authz / WASM not first-class |
| CNCF-graduated; Buoyant maintains | Multi-cluster works but topologies less flexible than Istio |
| Auto cert rotation every 24h | Some advanced HTTP filters require external proxies |
| Strong upgrade story (`linkerd check --pre`) | Less common in big-org "we already have Istio" environments |

## Common HLD Patterns
- **mTLS-by-default Kubernetes:** annotate namespace; pods auto-inject; all intra-namespace traffic mTLS-encrypted with cert rotation.
- **Canary release:** TrafficSplit + Flagger automate metric-based promotion; same idea as Istio + Argo Rollouts but lighter.
- **Topology-aware routing:** prefer same-zone endpoints to cut cross-AZ data transfer cost.
- **Multi-cluster:** `linkerd multicluster link` connects clusters; mirror services across via `Service` mirroring.
- **Per-route policy:** HTTPRoute splits paths to different backends; AuthorizationPolicy gates by ServiceAccount.
- **Failure injection / chaos:** `linkerd inject --debug` for tap; combine with chaos tools like Litmus for fault-injection.

## Common Pitfalls / Gotchas
- **First request after restart** can be slower while proxy initializes — keep readiness probes accurate.
- **Non-HTTP TCP services** — Linkerd transparent-proxies TCP but doesn't add L7 metrics; explicit protocol detection.
- **Skipped ports** — by default Linkerd doesn't intercept some ports (databases). Configure via `config.linkerd.io/skip-outbound-ports`.
- **Cert lifecycle** — control-plane CA is bootstrapped once; rotating root CA requires careful steps.
- **`opaque ports`** — for non-HTTP protocols, mark them opaque to skip protocol detection.
- **Memory under load** — proxy memory scales with concurrent connections; size pod limits with headroom.
- **Upgrades across major versions** — read release notes; control plane and proxies should be close in version.
- **Limited L7 transformations** — if you need request rewriting, consider an API gateway tier above Linkerd.

## Interview Cheat Sheet
- **Tagline:** Lightweight, security-first Kubernetes service mesh with a Rust micro-proxy; mTLS by default; CNCF-graduated.
- **Best at:** simple, fast meshes; mTLS-by-default; small ops team; latency-sensitive paths; pragmatic feature set.
- **Worst at:** Envoy-rich features (filter chains, gRPC-Web, ext_authz), non-K8s, deeply customized L7 policy.
- **Scale:** thousands of pods per cluster; multi-cluster topologies supported.
- **Distributes how:** control-plane Go services → identity / destination / policy → Rust proxy in each pod via injector webhook.
- **Consistency / state:** stateless data plane; identity & policy are control-plane CRDs reconciled to proxies.
- **Killer alternative:** Istio (richer features, heavier), Consul Connect (multi-platform), Cilium mesh (eBPF), Kuma, AWS App Mesh.

## Further Reading
- Official docs: <https://linkerd.io/2/overview/>
- Architecture: <https://linkerd.io/2/reference/architecture/>
- Linkerd vs Istio: <https://linkerd.io/2020/12/03/why-linkerd-doesnt-use-envoy/>
- Buoyant blog: <https://buoyant.io/blog>
