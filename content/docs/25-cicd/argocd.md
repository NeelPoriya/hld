---
title: "Argo CD"
description: "Argo CD is the GitOps continuous-delivery controller for Kubernetes — Git is the source of truth, Argo CD reconciles cluster state to match declared manifests; with sync waves, app-of-apps, and progressive delivery via Argo Rollouts."
---

> Category: Continuous Delivery / GitOps · Written in: Go · License: Apache 2.0 · CNCF graduated

## TL;DR
Argo CD is the de-facto **GitOps continuous-delivery** controller for Kubernetes. You commit Kubernetes manifests (or Helm charts / Kustomize overlays) to Git; Argo CD watches the repo, **continuously reconciles** the live cluster to match the desired state, and shows the diff in a slick UI. Combined with **Argo Rollouts** for canary / blue-green delivery, **Argo Workflows** for pipelines, and **Argo Events** for triggers, the Argo project is the CNCF-graduated GitOps stack. Reach for Argo CD when you run Kubernetes at scale and want a single source of truth (Git) with automated reconciliation, drift detection, and rich UI.

## What problem does it solve?
- **`kubectl apply` from a laptop** — unauditable, irreversible, drift-prone.
- **Drift between Git and cluster** — manual changes silently desync state.
- **Multi-cluster deploy coordination** — one tool to push the same manifest to N clusters.
- **Progressive delivery** — canary / blue-green with metric-based promotion.
- **Auditable deploys** — every change is a Git commit with PR review history.

## When to use
- **Kubernetes-native** workloads — Argo CD shines on K8s.
- **Multi-cluster** — manage clusters across regions / accounts from one Argo CD.
- **Helm / Kustomize / plain YAML / Jsonnet** — all supported.
- **Compliance / SOC2** — Git is the audit trail; sync requires RBAC.
- **Progressive delivery** — pair with Argo Rollouts / Flagger.

## When NOT to use
- **Non-K8s deploys** — Spinnaker / Octopus / GitHub Actions for VM / Lambda / serverless.
- **Tiny single-cluster setups** — `kubectl apply` in CI may be enough.
- **Push-based pipelines** that mutate clusters without Git — Argo CD is pull-based; switching mindset takes effort.
- **Highly imperative deploys** with complex state — Helm hooks / Job orchestration may be cleaner via Argo Workflows.

## GitOps Principles
1. **Declarative** — desired state in Git as YAML/Helm/Kustomize.
2. **Versioned & immutable** — Git history is the deploy log.
3. **Pulled automatically** — agent in the cluster pulls and reconciles.
4. **Continuously reconciled** — drift is automatically detected and corrected (or alerted).

## Data Model
- **Application** — Argo CD CRD pointing at a Git repo path / Helm chart / Kustomize overlay → target cluster + namespace.
- **AppProject** — boundary: which repos / clusters / namespaces an Application can target.
- **Sync** — manual or automated; can prune resources removed from Git, can self-heal manual changes.
- **Sync waves & hooks** — order resources via annotations; pre-/post-sync hooks for migrations.
- **App-of-Apps** — root Application that points at a folder of child Applications; bootstraps a whole cluster.
- **ApplicationSet** — generator that creates many Applications from a template (cluster generator, Git directory generator, list, matrix).

```yaml
# Application: deploy `api` chart from Git to prod cluster
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api-prod
  namespace: argocd
spec:
  project: prod
  source:
    repoURL: https://github.com/acme/k8s-manifests
    targetRevision: main
    path: charts/api
    helm:
      valueFiles: [values-prod.yaml]
  destination:
    server: https://k8s-prod.acme.local
    namespace: api
  syncPolicy:
    automated:
      prune: true        # delete resources removed from Git
      selfHeal: true     # revert manual cluster edits
    syncOptions:
    - CreateNamespace=true
    - ServerSideApply=true
```

```yaml
# ApplicationSet: one Application per cluster
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata: { name: cluster-bootstrap, namespace: argocd }
spec:
  generators:
  - clusters:
      selector:
        matchLabels: { env: prod }
  template:
    metadata: { name: 'platform-{{name}}' }
    spec:
      project: platform
      source:
        repoURL: https://github.com/acme/platform
        targetRevision: HEAD
        path: 'overlays/{{metadata.labels.region}}'
      destination:
        server: '{{server}}'
        namespace: platform
      syncPolicy:
        automated: { prune: true, selfHeal: true }
```

## Architecture
- **API server** — gRPC + REST + UI; auth via SSO (OIDC, SAML, GitHub) or local accounts.
- **Repo server** — clones Git repos, renders Helm / Kustomize / Jsonnet to plain YAML.
- **Application controller** — main reconciler; compares desired (rendered manifest) vs live (`kubectl get`); syncs.
- **Notifications controller** — Slack / email / webhook on sync events.
- **Dex** (optional) — bundled OIDC for SSO bridging.
- **Redis** — caches manifests + state for performance.

## Argo Rollouts (paired)
- **Rollout CRD** replaces `Deployment` for canary / blue-green / experiments.
- **AnalysisTemplate** — query Prometheus / Datadog / NewRelic / Wavefront / Kayenta for promotion decisions.
- **Traffic shifting** integrates with Istio / Linkerd / NGINX / SMI / ALB / Apisix / Traefik.
- Auto-promote or auto-rollback based on metrics.

## Trade-offs

| Strength | Weakness |
|---|---|
| Git is the source of truth — auditable, reversible | K8s-only |
| Continuous reconciliation + drift correction | Self-heal can fight legitimate manual changes — design carefully |
| Rich UI; great for incident debugging | Repo-server bottleneck on huge repos / many apps |
| ApplicationSet for fleet management | App-of-apps gets complex without conventions |
| Sync waves + hooks for migrations | Helm hooks vs Argo CD sync waves can confuse |
| First-class with Helm / Kustomize / Jsonnet | Webhook + auto-sync semantics need understanding |
| CNCF graduated; large community | RBAC + project boundaries take real design |

## Common HLD Patterns
- **App-of-Apps bootstrap:** root Application manages cluster Applications (cert-manager, ingress, monitoring, mesh) + product Applications.
- **One repo per environment vs envs in branches/folders:** prefer folder-per-env on a single branch (avoid environment-per-branch divergence).
- **ApplicationSet per cluster:** template + cluster generator deploys the same platform stack to every cluster.
- **Pull request previews:** `pull_request` ApplicationSet generator creates ephemeral preview Applications per PR.
- **Progressive delivery:** Rollout CRD + AnalysisTemplate against Prometheus → auto-promote 10% → 50% → 100% on healthy SLOs.
- **Multi-tenant:** AppProject isolates teams; each project can only deploy to whitelisted destinations / repos.
- **Backstage integration:** developer portal renders Argo CD app status next to service catalog.

## Common Pitfalls / Gotchas
- **`prune: true` deletes resources** removed from Git — be sure resources you care about are in Git.
- **`selfHeal: true` fights kubectl** — manual edits are reverted; design break-glass procedures.
- **Image tag drift** — using `:latest` in manifests means Argo CD shows synced even when image changed; pin tags or use Argo CD Image Updater.
- **Helm hooks vs sync waves** — sync waves apply at K8s manifest level; Helm hooks apply at chart level; choose one ordering model.
- **Git auth** — long-lived tokens are a smell; use GitHub App / SSH deploy keys with rotation.
- **Repo server scaling** — many huge repos overwhelm the repo server; split repos or shard repo servers.
- **Sensitive secrets in Git** — use Sealed Secrets / SOPS / External Secrets Operator; never commit plaintext.
- **Parallel sync** of dependent CRDs without sync waves causes failed-then-succeeded loops.
- **Timeouts on long migrations** — set `argocd.argoproj.io/sync-options: SkipDryRunOnMissingResource=true` and tune timeouts.

## Interview Cheat Sheet
- **Tagline:** CNCF-graduated GitOps controller for Kubernetes — Git is the source of truth; Argo CD continuously reconciles.
- **Best at:** declarative K8s deploys, multi-cluster fleets, drift detection, progressive delivery (with Argo Rollouts), audit-friendly pipelines.
- **Worst at:** non-K8s deploys, push-based pipelines, tiny single-cluster setups where `kubectl apply` is enough.
- **Scale:** thousands of Applications per Argo CD; ApplicationSet for fleet patterns; horizontal scale via sharding controllers.
- **Distributes how:** application controller reconciles per-app; repo server renders manifests; sharded across replicas.
- **Consistency / state:** desired state in Git; live state in cluster; controller reconciles; eventual consistency.
- **Killer alternative:** Flux CD (GitOps Toolkit, simpler), Spinnaker (multi-cloud), Tekton + Argo Workflows (pipelines), Jenkins X, Codefresh, GitHub Actions push-style.

## Further Reading
- Official docs: <https://argo-cd.readthedocs.io/en/stable/>
- ApplicationSet: <https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/>
- Argo Rollouts: <https://argoproj.github.io/argo-rollouts/>
- GitOps principles: <https://opengitops.dev/>
