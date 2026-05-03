---
title: "Amazon ECR"
description: "Amazon Elastic Container Registry is the AWS-managed Docker / OCI registry — IAM-integrated private + public repos, image scanning (basic + Inspector enhanced), cross-region replication, lifecycle policies, and pull-through cache."
---

> Category: Container Registries · Provider: AWS · License: Proprietary (managed)

## TL;DR
Amazon ECR is **AWS's managed container registry**. It hosts both **private repositories** (default; IAM-controlled) and **public repositories** (via ECR Public — `public.ecr.aws/`), serves OCI / Docker images at scale, integrates natively with **ECS**, **EKS**, **Fargate**, **Lambda container images**, and **App Runner**, and is the path of least resistance when your workloads run on AWS. ECR is **IAM-authenticated** — no separate registry credentials — and ships **basic vulnerability scanning** (free, OS-only) plus **Inspector enhanced scanning** (paid, deep CVE + language packages). Bonus features: **lifecycle policies** to auto-prune old images, **cross-region replication**, **pull-through cache** to mirror Docker Hub / Quay / k8s.gcr.io / GitHub Container Registry. Reach for ECR when **AWS is your cloud and you don't want to operate your own registry**.

## What problem does it solve?
- **Self-hosting a registry has ops burden** — ECR is fully managed.
- **Docker Hub rate limits** for AWS workloads — ECR + pull-through cache fixes this.
- **IAM as auth** — no separate username / password / token management.
- **Native AWS service integration** — ECS / EKS / Lambda / App Runner all pull from ECR with task-role credentials.
- **Cross-region image distribution** — replication for multi-region apps.
- **Image scanning** — built-in CVE detection.

## When to use
- **AWS-only** workloads (ECS / EKS / Fargate / Lambda).
- **You want IAM-authenticated** image pulls.
- **Cost-effective for AWS-internal pulls** (no data egress within region).
- **Need pull-through cache** to dodge Docker Hub rate limits.
- **Lifecycle automation** for cleaning up stale images.
- **Compliance** — audit logging via CloudTrail, encryption at rest with KMS.

## When NOT to use
- **Multi-cloud** workloads where cross-cloud pulls would incur egress; consider Harbor or a vendor-neutral registry.
- **You want UI-driven image management** beyond AWS Console (Harbor's UI is more polished).
- **Free public OSS distribution** at huge scale — Docker Hub or GHCR may have better default discoverability.
- **Air-gapped / on-prem** — ECR requires internet to AWS endpoints (or VPC endpoints + AWS Direct Connect).
- **Multi-tenant SaaS isolation** with project-level RBAC — ECR is repo-level; Harbor has projects.

## Core Concepts
- **Registry** — per-account, per-region: `<account_id>.dkr.ecr.<region>.amazonaws.com`.
- **Repository** — collection of images sharing a name; e.g., `api/api`. Created via console / CLI / Terraform.
- **Image** — content-addressed `sha256:...` + tags.
- **IAM auth** — `aws ecr get-login-password | docker login`; or use ECR credential helper.
- **Repository policy** — resource-based JSON allowing other AWS accounts to pull / push.
- **Lifecycle policy** — JSON rules to expire images by tag pattern + count / age.
- **Image scanning (basic)** — Clair-based; OS package CVEs; free; on push or manual.
- **Image scanning (Inspector enhanced)** — language packages too; paid; continuous monitoring.
- **Cross-region replication** — registry-level setting; copies images to listed regions.
- **Pull-through cache rule** — proxy from ECR to upstream (Docker Hub / Quay / k8s.gcr.io / GHCR / ACR / GAR); first pull caches, subsequent pulls hit ECR.
- **VPC endpoint (Interface)** — keep ECR pulls inside VPC (private subnets without NAT).
- **ECR Public** — separate service; `public.ecr.aws/`; rate-limited but free for OSS.
- **OCI artifact support** — Helm charts via `helm push oci://` and other OCI artifacts.

```bash
# Create repo + push image
aws ecr create-repository --repository-name api/api --image-scanning-configuration scanOnPush=true

aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

docker tag api:1.4.2 123456789012.dkr.ecr.us-east-1.amazonaws.com/api/api:1.4.2
docker push        123456789012.dkr.ecr.us-east-1.amazonaws.com/api/api:1.4.2
```

```json
// Lifecycle policy: keep 30 latest semver tags; expire untagged > 14 days
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep 30 most recent semver tags",
      "selection": {
        "tagStatus": "tagged",
        "tagPatternList": ["v*"],
        "countType": "imageCountMoreThan",
        "countNumber": 30
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Expire untagged > 14 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": { "type": "expire" }
    }
  ]
}
```

```hcl
# Terraform: pull-through cache for Docker Hub
resource "aws_ecr_pull_through_cache_rule" "dockerhub" {
  ecr_repository_prefix = "dockerhub"
  upstream_registry_url = "registry-1.docker.io"
  credential_arn        = aws_secretsmanager_secret.dockerhub.arn
}

# Now pull docker.io/library/nginx via:
#   <acct>.dkr.ecr.<region>.amazonaws.com/dockerhub/library/nginx:latest
```

```yaml
# Kubernetes pod referencing ECR — node IAM role grants ecr:GetAuthorizationToken + ecr:BatchGetImage
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: api
          image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/api/api:1.4.2
```

## Architecture (Conceptual)
- **Regional service** — registry per AWS region.
- **Storage** — backed by S3 (image blobs) + DynamoDB (metadata).
- **API** — `ecr.<region>.amazonaws.com` REST + `dkr.ecr.<region>.amazonaws.com` Docker / OCI v2 API.
- **Auth** — temporary tokens (12 hours) via STS; rotate via `get-login-password`.
- **Replication** — async copies images to listed regions on push.
- **Scanning** — basic = Clair-based; Inspector V2 = deep, continuous, language-aware.
- **Pull-through cache** — first pull misses → ECR fetches from upstream → caches → subsequent pulls served from ECR.

## Trade-offs

| Strength | Weakness |
|---|---|
| IAM-native — no extra credentials | AWS-only auth model (no LDAP / OIDC unless via IAM Identity Center) |
| Deep AWS service integration | Console UI thin vs Harbor / Quay |
| Lifecycle policies prune storage | Pull-through cache rules are per-prefix |
| Cross-region replication | Cross-region replication is async + adds storage cost |
| Pull-through cache fixes Docker Hub limits | ECR Public is separate service |
| VPC endpoints for private pulls | No multi-tenant project-level RBAC (per-repo only) |
| Basic scanning free; Inspector deep | Inspector enhanced scanning has per-image cost |
| Encrypted at rest with KMS | Egress fees if pulling cross-region without replication |

## Common HLD Patterns
- **EKS / ECS pull from ECR** — node IAM role permits pull; image pulled in-region.
- **Multi-region active/active** — image pushed to primary region; replication to secondaries; each region's workload pulls locally.
- **CI/CD pipeline** — GitHub Actions / CodeBuild builds image → tags `commit_sha` + `v1.4.2` → pushes to ECR → triggers ArgoCD / EKS rollout.
- **Vulnerability gating** — `scanOnPush: true` + EventBridge rule on `ECR Image Scan` event → block deploy if critical CVE.
- **Pull-through cache for k8s.gcr.io / Docker Hub** — cluster pulls via ECR; resilient to upstream rate limits / outages.
- **Lambda container images** — pushed to ECR; Lambda function references image URI; cold-start optimized for ECR.
- **Lifecycle pruning** — keep N latest tags; expire ephemeral PR builds; reduce storage spend.
- **Cross-account sharing** — repository policy grants pull to other AWS account ID for shared base images.

## Common Pitfalls / Gotchas
- **`docker login` token expires every 12 hours** — use ECR credential helper or refresh in CI.
- **Untagged image accumulation** — without lifecycle, every multi-arch push leaves dangling manifests; storage grows.
- **Cross-region pulls** incur egress; replicate or use regional registries.
- **Image scanning lag** — basic scan can take minutes; CI gating must wait.
- **Repository policy vs IAM policy** confusion — repository policy grants other accounts; IAM policy grants principals in your account.
- **ECR Public** is rate-limited and separate from private ECR; don't conflate.
- **Pull-through cache** requires upstream credentials in Secrets Manager for paid registries (Docker Hub, GHCR).
- **Replication != backup** — both regions can be deleted by a bad IAM action; consider point-in-time backups via lifecycle + retention.
- **Tag mutability** — by default tags are mutable; toggle to `IMMUTABLE` for safety on prod tags.
- **OCI Helm chart push** — needs Helm 3.8+ and `helm registry login`.
- **EKS node IAM role missing perms** silently fails image pull as `ImagePullBackOff` — diagnose via `kubectl describe pod`.

## Interview Cheat Sheet
- **Tagline:** AWS-managed Docker / OCI registry — IAM auth, scanning, lifecycle, cross-region replication, pull-through cache, deep ECS / EKS / Lambda integration.
- **Best at:** AWS-native workloads, IAM-authenticated pulls, cross-region replication, dodging Docker Hub limits via cache.
- **Worst at:** multi-cloud, multi-tenant project RBAC, polished UI, air-gapped, OSS public discovery.
- **Scale:** essentially unlimited (S3-backed); per-region.
- **Distributes how:** managed AWS service; replication to other regions; pull-through cache from upstreams.
- **Consistency / state:** S3 (blobs, immutable, content-addressed) + DynamoDB (metadata).
- **Killer alternative:** Harbor (OSS, multi-cloud), Docker Hub (managed, public-friendly), GHCR (GitHub-native), Quay (Red Hat), Google Artifact Registry, Azure Container Registry, JFrog Artifactory (multi-format), GitLab Container Registry.

## Further Reading
- Official docs: <https://docs.aws.amazon.com/AmazonECR/latest/userguide/>
- Lifecycle policies: <https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html>
- Pull-through cache: <https://docs.aws.amazon.com/AmazonECR/latest/userguide/pull-through-cache.html>
- Inspector enhanced scanning: <https://docs.aws.amazon.com/inspector/latest/user/scanning-ecr.html>
