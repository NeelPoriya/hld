---
title: "Kubernetes"
description: "Kubernetes is the dominant container orchestrator — schedules workloads across a cluster of machines with declarative APIs for deployments, services, storage, networking, and policy."
---

> Category: Container Orchestration · Written in: Go · License: Apache 2.0

## TL;DR
Kubernetes (K8s) is the de-facto container orchestration platform. You describe **desired state** in YAML — Deployments, Services, ConfigMaps, Secrets, Ingresses, StatefulSets — and Kubernetes' control loops continuously reconcile the cluster toward that state. It manages **scheduling**, **networking**, **storage**, **service discovery**, **rollouts/rollbacks**, **secrets**, and **autoscaling** across hundreds-to-thousands of nodes. Reach for Kubernetes when you have many services, multiple environments, and need consistent deployment / scaling / self-healing — but expect operational complexity that justifies dedicated platform engineering investment.

## What problem does it solve?
- **Scheduling** containers onto machines based on resources / constraints / affinity.
- **Self-healing** — replace failed pods, restart crashed containers, reschedule on node failure.
- **Service discovery & load balancing** — Services + DNS + iptables/IPVS.
- **Rolling updates / rollbacks** — declarative deployment strategies.
- **Horizontal & vertical autoscaling**.
- **Configuration & secrets** decoupled from images.
- **Storage abstraction** — PersistentVolumes / Claims; CSI drivers for any backend.
- **Network policy** — pod-level firewalling.
- **Extensibility** — Custom Resource Definitions + Operators turn K8s into a platform for anything stateful.

## When to use
- **Many microservices** with independent release cycles.
- **Multi-environment** (dev / staging / prod) needs consistent platform.
- **Burst / autoscaling** workloads — HPA / Cluster Autoscaler / Karpenter.
- **Multi-cloud / hybrid** — same API across AWS EKS, GCP GKE, Azure AKS, OpenShift, on-prem.
- **Operator-managed stateful systems** — Postgres, Kafka, Cassandra, Elastic, Redis via Operators.

## When NOT to use
- **Tiny app, single team** — managed PaaS (Fly.io, Railway, Heroku, App Runner, Cloud Run) is simpler.
- **Monolithic Lambda-friendly workloads** — serverless is cheaper to operate.
- **No platform team to absorb the operational complexity** — K8s rewards investment.
- **Strict ultra-low-latency / kernel-bypass workloads** — sometimes bare-metal + custom orchestration wins.

## Core Objects
- **Pod** — atomic deploy unit (one or more co-located containers, shared network/storage).
- **ReplicaSet** — ensures N replicas of a pod template.
- **Deployment** — manages ReplicaSets for rolling updates / rollbacks.
- **StatefulSet** — stable identity + ordered rollout for stateful systems (DBs, queues).
- **DaemonSet** — one pod per node (logging agents, network plugins, monitoring).
- **Job / CronJob** — batch / scheduled workloads.
- **Service** — stable VIP + DNS for a set of pods (ClusterIP / NodePort / LoadBalancer / ExternalName).
- **Ingress / Gateway API** — L7 routing into the cluster.
- **ConfigMap / Secret** — config + sensitive values, mounted as files / env vars.
- **PersistentVolume / Claim** — durable storage abstraction; CSI drivers for any backend.
- **Namespace** — soft multi-tenancy boundary.
- **HorizontalPodAutoscaler** — scale by CPU / memory / custom metrics.
- **NetworkPolicy** — pod-level firewall rules.
- **CustomResourceDefinition (CRD)** — extend the API.

## Architecture
- **Control plane** (master nodes):
  - **kube-apiserver** — REST API; only thing that talks to etcd.
  - **etcd** — distributed key-value (Raft); source of truth for cluster state.
  - **kube-scheduler** — assigns pods to nodes.
  - **kube-controller-manager** — runs controllers (Deployment, ReplicaSet, Node, Endpoints, …).
  - **cloud-controller-manager** — cloud-provider integrations (LBs, volumes).
- **Data plane** (worker nodes):
  - **kubelet** — agent on each node; talks to apiserver, manages container runtime.
  - **container runtime** — containerd, CRI-O.
  - **kube-proxy** — programs iptables/IPVS for Service VIPs.
  - **CNI plugin** — pod networking (Calico, Cilium, Flannel, AWS VPC CNI).

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: prod
spec:
  replicas: 4
  selector:
    matchLabels: { app: api }
  strategy:
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  template:
    metadata:
      labels: { app: api }
    spec:
      containers:
      - name: api
        image: ghcr.io/acme/api:1.4.2
        ports: [{ containerPort: 8080 }]
        resources:
          requests: { cpu: 200m, memory: 256Mi }
          limits:   { cpu: 1,    memory: 512Mi }
        readinessProbe:
          httpGet: { path: /healthz, port: 8080 }
          periodSeconds: 5
        livenessProbe:
          httpGet: { path: /alivez, port: 8080 }
          initialDelaySeconds: 15
        env:
        - name: DB_PASSWORD
          valueFrom: { secretKeyRef: { name: api-secrets, key: db_password } }
---
apiVersion: v1
kind: Service
metadata: { name: api, namespace: prod }
spec:
  selector: { app: api }
  ports: [{ port: 80, targetPort: 8080 }]
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: api, namespace: prod }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: api }
  minReplicas: 4
  maxReplicas: 50
  metrics:
  - type: Resource
    resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
```

## Networking Model
- **Every pod gets a routable IP** in a flat cluster network (no NAT between pods).
- **Service VIPs** are virtual; kube-proxy programs iptables/IPVS to load-balance to pod IPs.
- **DNS** (CoreDNS) resolves `service.namespace.svc.cluster.local`.
- **Ingress / Gateway API** handles L7 (HTTP/gRPC) routing into the cluster.
- **NetworkPolicy** + CNI (Cilium, Calico) for pod-level firewalling.

## Storage
- **PersistentVolumeClaim (PVC)** — pod requests storage.
- **StorageClass** — defines how to provision (CSI driver + parameters).
- **CSI drivers** — every cloud + storage vendor implements one.
- **StatefulSet** + PVC + headless Service is the standard stateful pattern.

## Trade-offs

| Strength | Weakness |
|---|---|
| Declarative, reconciling control loops | Steep learning curve; many moving parts |
| Self-healing / autoscaling out of the box | Operational burden — ops team is non-negotiable |
| Massive ecosystem (Helm, ArgoCD, operators, service meshes) | YAML sprawl; templating tools (Helm/Kustomize) add complexity |
| Cloud-portable; same API across providers | Networking + storage portability not perfect |
| Extensible via CRDs + operators | Etcd is a SPOF for control plane; size carefully |
| Mature security primitives (RBAC, NetworkPolicy, Pod Security) | Default settings are not production-secure; harden deliberately |

## Common HLD Patterns
- **GitOps:** ArgoCD / Flux watches Git; reconciles cluster to repo state. Audit trail is git history.
- **Multi-tenant cluster:** namespaces + RBAC + ResourceQuotas + NetworkPolicy + Pod Security.
- **Stateful with Operator:** Postgres / Kafka / ClickHouse via Operator that manages PVCs, scaling, backup, failover.
- **Ingress + service mesh:** NGINX / Envoy ingress at edge; Istio / Linkerd / Cilium service mesh for east-west.
- **Autoscaling:** HPA scales pods on CPU/memory/custom metrics; Cluster Autoscaler / Karpenter scales nodes; VPA recommends right-sizing.
- **Blue-green / canary:** Argo Rollouts / Flagger automate progressive delivery with metric-based promotion.
- **Multi-cluster:** Cluster API / Argo Multi-Cluster / Submariner / Cilium Cluster Mesh for federation.

## Common Pitfalls / Gotchas
- **CrashLoopBackOff** caused by missing config / wrong env var / failing health check.
- **OOMKilled** when memory limits set too low or app leaks; tune limits + GC.
- **Resource requests/limits missing** — scheduler can't bin-pack; nodes overcommitted; QoS class becomes BestEffort and gets evicted first.
- **`latest` tag** + `imagePullPolicy: Always` makes deployments non-deterministic; pin image SHAs.
- **Etcd disk performance** — slow disks → cluster instability; use SSD/NVMe.
- **Too many small clusters vs one big cluster** — multi-cluster is operationally expensive; consolidate when possible.
- **Long-running pods that hold connections** during rolling updates — set `terminationGracePeriodSeconds` + lifecycle preStop hooks; honor SIGTERM.
- **Cluster autoscaler + spot instances** — chains of disruptions if not configured with PodDisruptionBudgets.
- **Network policy default-allow** in many distros — explicitly deny by default for prod.
- **Helm chart upgrades** can introduce schema drift; pin chart versions; review diffs.

## Interview Cheat Sheet
- **Tagline:** Declarative container orchestrator with reconciling control loops; the cloud-native standard for running services at scale.
- **Best at:** running many services with consistent deployment / scaling / self-healing across clouds; running stateful systems via operators.
- **Worst at:** tiny single-app workloads (PaaS / Lambda simpler), strict bare-metal latency (kernel bypass), teams without ops bandwidth.
- **Scale:** ~5,000 nodes / ~150,000 pods per cluster supported (single cluster); multi-cluster for larger.
- **Distributes how:** scheduler bin-packs pods on nodes by resource requests + affinity / taint / topology rules.
- **Consistency / state:** etcd as single source of truth (Raft, strongly consistent); controllers reconcile to desired state; eventual at runtime.
- **Killer alternative:** Nomad (simpler), ECS (AWS-managed), Cloud Run / App Runner (serverless containers), bare-metal + Ansible (low-level), DC/OS (legacy).

## Further Reading
- Official docs: <https://kubernetes.io/docs/home/>
- Architecture: <https://kubernetes.io/docs/concepts/overview/components/>
- Production cluster best practices: <https://kubernetes.io/docs/setup/production-environment/>
- CNCF landscape (ecosystem): <https://landscape.cncf.io/>
