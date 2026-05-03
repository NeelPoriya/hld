---
title: "Harbor"
description: "Harbor is the CNCF-graduated open-source container registry — OCI artifact store with image vulnerability scanning (Trivy), image signing (Cosign / Notary), replication, RBAC, and multi-tenant projects. The leading self-hostable alternative to Docker Hub / ECR."
---

> Category: Container Registries · Written in: Go · License: Apache 2.0 · CNCF Graduated

## TL;DR
Harbor is the **open-source container / OCI artifact registry of choice** for organizations that need a private, security-conscious registry on their own infrastructure. It builds on Docker Distribution + adds the things real organizations need: **vulnerability scanning** (Trivy by default), **image signing** (Cosign / Notary v2), **replication** to / from other registries (Harbor, Docker Hub, ECR, GCR, ACR, Quay), **multi-tenant projects** with RBAC, **retention policies**, **immutability rules**, **OCI artifact support** (Helm charts, OCI bundles, CNAB), **proxy cache** for upstream registries, and a polished web UI. Reach for Harbor when you want a **self-hosted registry with security baked in** — air-gapped, regulated, or multi-cloud — and you want to avoid registering for and trusting a managed registry.

## What problem does it solve?
- **Docker Hub rate limits** + cost for private repos — self-host with Harbor.
- **Air-gapped / regulated** environments need on-prem registries.
- **Image vulnerability management** — scan every image; block deploy on critical CVEs.
- **Image provenance / supply-chain security** — sign images with Cosign / verify on admit.
- **Multi-cloud replication** — push once, replicate to ECR + GCR + ACR.
- **Multi-tenant** organizations need RBAC + project-level isolation.
- **Retention** — automatic cleanup of old / untagged images to save storage.

## When to use
- **On-prem / private cloud / air-gapped** Kubernetes clusters.
- **Regulated industries** with audit / compliance needs.
- **Multi-team enterprise** wanting RBAC + project isolation.
- **Supply-chain security** mandate (sign + scan + verify).
- **Mirror / proxy cache** for Docker Hub to avoid rate limits.
- **Mixed artifact** environments (containers + Helm + OCI bundles).

## When NOT to use
- **Tiny single-team app** — Docker Hub or GHCR is simpler.
- **Cloud-vendor-only** workload — ECR / GCR / ACR are deeply integrated with their IAM + scanning + lifecycle.
- **Zero-ops desire** — Harbor is real software you operate (deploy, upgrade, back up).
- **Object-store-as-a-registry** — if you only need raw blob hosting, plain S3 + ORAS may suffice.

## Core Concepts
- **Project** — namespace for repositories; public or private; has RBAC, scan policies, retention, immutability rules.
- **Repository** — collection of tagged images; e.g., `library/nginx`.
- **Artifact** — image / Helm chart / OCI bundle (+ signature + SBOM as referrers).
- **Tag** — mutable label pointing to a digest.
- **Digest** — content-addressed `sha256:...`.
- **Robot account** — service identity for CI / CD; scoped pull / push.
- **Replication rule** — push or pull from / to another registry; on event or scheduled.
- **Vulnerability scanner** — Trivy default; Clair / Anchore as alternates; runs on push or scheduled.
- **Vulnerability policy** — block pulls if image has CVEs above threshold.
- **Cosign signing** — sign images with private key; Harbor stores signatures as OCI referrers.
- **Retention policy** — keep last N tags / N days / matching pattern; rest are pruned.
- **Immutability rule** — prevent overwrite of tags matching pattern (e.g., `v*`).
- **Proxy cache project** — Harbor caches images pulled from an upstream (e.g., Docker Hub) so subsequent pulls hit Harbor.
- **Webhooks** — fire on push / scan complete / quota event.
- **Quota** — per-project storage / image count limits.

```yaml
# values.yaml — Harbor Helm install (excerpt)
expose:
  type: ingress
  tls: { enabled: true, certSource: secret, secret: { secretName: harbor-tls } }
  ingress:
    hosts: { core: registry.acme.com }
externalURL: https://registry.acme.com
persistence:
  enabled: true
  imageChartStorage:
    type: s3
    s3:
      region: us-east-1
      bucket: harbor-prod
      accesskey: AKIA...
      secretkey: ${S3_SECRET}
trivy:
  enabled: true
  ignoreUnfixed: true
notary:
  enabled: false           # Cosign preferred for new installs
database:
  type: external
  external: { host: pg.internal, username: harbor, password: ${PG_PASS} }
redis:
  type: external
  external: { addr: redis.internal:6379 }
```

```bash
# Push an image (after `docker login registry.acme.com -u robot$ci -p $ROBOT_TOKEN`)
docker tag api:1.4.2 registry.acme.com/api/api:1.4.2
docker push registry.acme.com/api/api:1.4.2

# Sign with Cosign (keyless via OIDC, or with key)
COSIGN_EXPERIMENTAL=1 cosign sign registry.acme.com/api/api:1.4.2

# Verify
cosign verify registry.acme.com/api/api:1.4.2 \
  --certificate-identity=ci@acme.com \
  --certificate-oidc-issuer=https://accounts.google.com
```

```yaml
# Replication rule (Harbor API): push api/* to ECR on every push
{
  "name": "ecr-mirror",
  "src_registry_id": 0,                  // local
  "dest_registry_id": 12,                // ECR registered as remote
  "dest_namespace": "prod",
  "trigger": { "type": "event_based" },
  "filters": [{ "type": "name", "value": "api/**" }],
  "enabled": true
}
```

## Architecture
- **Core** — main API + UI service (Go).
- **Registry** — Docker Distribution (the OCI registry) + a pluggable storage backend (filesystem, S3, GCS, Azure, Swift).
- **Database** — PostgreSQL stores metadata (projects, RBAC, policies, scan results).
- **Redis** — caching + job queues.
- **Trivy** — vulnerability scanner sidecar; Harbor calls it via REST.
- **Job service** — async tasks (replication, scans, retention).
- **Portal** — React UI.
- **ChartMuseum** (legacy) / OCI artifacts for Helm charts.
- **Notary** (legacy) / Cosign for signing.

## Trade-offs

| Strength | Weakness |
|---|---|
| Self-hostable; no rate limits | Operational burden (PG, Redis, S3, upgrades) |
| RBAC + multi-tenant projects | More moving parts than plain Docker Distribution |
| Trivy scanning built-in | Trivy can be slow for huge images |
| Cosign / Notary signing supported | Notary (TUF) is end-of-life; Cosign is the path forward |
| Replication to / from many registries | Replication rules need careful auth + filter config |
| Retention + immutability policies | Storage backend choice impacts perf (S3 vs FS) |
| OCI artifact + Helm chart support | Cluster-internal access + cert mgmt to set up |
| CNCF graduated; mature OSS | UI is functional but not as polished as managed clouds |

## Common HLD Patterns
- **Air-gapped K8s** — Harbor inside the perimeter; sync images from public registries via replication pull rules.
- **Supply chain** — CI builds image → push to Harbor → Cosign sign → admission webhook (e.g., Sigstore policy-controller / Kyverno) verifies signature on deploy.
- **Mirror / proxy cache** — Harbor proxy cache project against `docker.io`; cluster pulls from `registry.acme.com/dockerhub-proxy/library/nginx` to dodge Docker Hub rate limits.
- **Multi-region replication** — primary registry replicates to per-region Harbor instances for low-latency pulls.
- **Vulnerability gating** — `prevent_vul: true` on project; pulls fail if image has critical CVEs.
- **Retention** — prune dev/PR images > 14 days old; keep tagged releases forever via immutability rule on `v*`.
- **Webhook-driven CD** — `PUSH_ARTIFACT` webhook → ArgoCD / Flux pulls new image.

## Common Pitfalls / Gotchas
- **Database / Redis as SPOF** — back up + scale appropriately; Harbor doesn't tolerate DB loss.
- **Storage backend choice** — S3 is great for HA, slower than FS for layer fetch; use CDN in front for global pull.
- **Cert / TLS expiry** — registry pulls fail loudly when certs expire; alert on it.
- **Trivy DB freshness** — scanner DB updates daily; air-gapped installs need manual sync.
- **Quota enforcement is async** — push can succeed momentarily over quota.
- **Notary is dead** — use Cosign + OCI referrers; don't invest in Notary v1.
- **Immutability rule** can block CI tag overwrites; design tag policy first.
- **Robot account scope** — too-broad scopes leak via CI logs; rotate; scope tightly.
- **Replication loops** — bidirectional rules between two Harbors will ping-pong; one direction only.
- **Helm chart support** — old ChartMuseum is deprecated; use OCI artifact pushes (`helm push oci://`).
- **Web UI != API ground truth** — automate via API; UI for admin only.

## Interview Cheat Sheet
- **Tagline:** CNCF OSS container registry — Docker Distribution + scanning + signing + replication + RBAC + multi-tenant projects + OCI artifacts.
- **Best at:** self-hosted / private / air-gapped registry, supply-chain security, multi-cloud replication, multi-tenant orgs.
- **Worst at:** zero-ops desires, single-team tiny projects, single-cloud-vendor-only stacks (use ECR / GCR / ACR).
- **Scale:** millions of images; storage scales with backend (S3 effectively unlimited).
- **Distributes how:** stateless cores; PG + Redis backing; replication to / from other registries.
- **Consistency / state:** PG is source of truth for metadata; image blobs in S3 are content-addressed (immutable).
- **Killer alternative:** Docker Hub (managed, free public), GitHub Container Registry (GHCR; tied to GH), Quay (Red Hat / OSS Project Quay), Amazon ECR, Google Artifact Registry, Azure Container Registry, JFrog Artifactory (multi-format), Zot (lightweight OSS), Distribution (the bare upstream).

## Further Reading
- Official docs: <https://goharbor.io/docs/>
- Helm install: <https://goharbor.io/docs/latest/install-config/harbor-ha-helm/>
- Cosign + Harbor: <https://goharbor.io/docs/latest/working-with-projects/working-with-images/sign-images/>
- CNCF page: <https://www.cncf.io/projects/harbor/>
