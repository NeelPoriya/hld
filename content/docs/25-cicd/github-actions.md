---
title: "GitHub Actions"
description: "GitHub Actions is the integrated CI/CD platform — workflows in YAML, runs on hosted or self-hosted runners, deeply integrated with the GitHub permission model and OIDC for cloud auth."
---

> Category: CI/CD · Provider: GitHub · License: Proprietary (managed) · Workflow runners can be self-hosted

## TL;DR
GitHub Actions is the **CI/CD system built into GitHub** — `.github/workflows/*.yml` files describe **events** (push, PR, schedule, manual, repository_dispatch) that trigger **jobs** running on **runners** (managed Ubuntu/Windows/macOS, or self-hosted in your VPC / Kubernetes / on-prem). It's the default CI for most modern repos because of the **zero-friction integration** with GitHub: PR checks, merge gates, environments with approval rules, and **OIDC tokens** for keyless cloud auth (no long-lived AWS / GCP / Azure secrets in the repo).

## What problem does it solve?
- **Inline CI/CD** — workflows live next to code; PR runs and main runs share the same definitions.
- **Hosted runners** — no Jenkins servers to maintain.
- **OIDC keyless auth** — workflow gets a JWT; AWS / GCP / Azure / HashiCorp Vault trust the GitHub OIDC provider; no long-lived `AWS_ACCESS_KEY_ID` in secrets.
- **Marketplace** — thousands of reusable Actions for Docker, Terraform, AWS, Slack, Codecov, …
- **Reusable workflows** — DRY across many repos.
- **Environment + approval gates** — `staging` / `prod` environments require reviewers / wait timers / specific branches.

## When to use
- **Any GitHub-hosted repo** — default option.
- **OIDC-driven cloud deploys** — keyless AWS / GCP / Azure auth.
- **Polyglot CI** — single platform across Node / Python / Java / Go / Rust / .NET.
- **Self-hosted runners** behind firewalls / GPUs / large RAM jobs.
- **Matrix builds** — test across Node 18/20/22 × Linux/macOS/Windows.

## When NOT to use
- **Massive monorepo with bespoke build graph** — Bazel + Buildbarn / Buildkite / custom runners may be more efficient.
- **You're on GitLab / Bitbucket** — use their native CI.
- **Air-gapped / no-internet** — self-hosted runners help, but workflow definitions still come from GitHub; consider GitLab / Tekton / Argo Workflows.
- **Long-running orchestrations** beyond 6 hours — use Argo Workflows / Tekton / Temporal.

## Data Model
- **Workflow** (`.github/workflows/*.yml`) — top-level YAML triggered by `on:` events.
- **Event** (`push`, `pull_request`, `schedule`, `workflow_dispatch`, `release`, …).
- **Job** — a unit of work; runs on a specific runner; has steps; jobs run in parallel by default; `needs:` for sequencing.
- **Step** — `run:` shell command or `uses:` an Action.
- **Action** — reusable unit; Docker container, JavaScript, or composite. Pulled by `owner/name@version`.
- **Runner** — VM / container that executes a job.
- **Secrets / Variables** — repo / org / environment-scoped; secrets masked in logs.
- **Environment** — named target (`staging`, `prod`) with approval rules / wait timers / required reviewers.

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  id-token: write       # required for OIDC
  contents: read

concurrency:            # cancel in-flight deploys for the same ref
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }}, cache: npm }
      - run: npm ci
      - run: npm test -- --reporter=junit --output=junit.xml
      - uses: actions/upload-artifact@v4
        with:
          name: test-results-node-${{ matrix.node }}
          path: junit.xml

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-deploy
          aws-region: us-east-1
      - uses: aws-actions/amazon-ecr-login@v2
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            123456789012.dkr.ecr.us-east-1.amazonaws.com/api:${{ github.sha }}
            123456789012.dkr.ecr.us-east-1.amazonaws.com/api:latest
          cache-from: type=gha
          cache-to:   type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment:
      name: prod
      url: https://api.example.com
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-deploy
          aws-region: us-east-1
      - run: aws ecs update-service --cluster prod --service api --force-new-deployment
```

## Architecture
- **Workflow runner orchestrator** — GitHub's hosted control plane parses workflows and dispatches jobs.
- **Runners** — VMs (managed) or self-hosted hosts; pull jobs over an authenticated long-poll connection.
- **Actions Marketplace** — published as repos with a `action.yml` manifest; resolved at workflow start.
- **Cache + Artifacts** — built-in cache (per repo, branch, key) and artifact storage (90-day retention by default).
- **OIDC issuer** — GitHub signs a JWT identifying the repo + environment + ref; cloud providers / Vault verify.

## Trade-offs

| Strength | Weakness |
|---|---|
| Zero-config for GitHub repos | Vendor lock-in to GitHub |
| OIDC keyless cloud auth | YAML logic gets unwieldy for complex pipelines |
| Massive Marketplace | Marketplace Actions are user-contributed; supply-chain risk |
| Hosted runners free for public repos / generous private | Runner perf can lag dedicated CI for big builds |
| Reusable workflows across repos | Debugging is painful — re-run-with-debug, no SSH into runner |
| Self-hosted runners for special hardware / privacy | Runner image updates can break workflows |
| Strong PR / branch protection integration | Cost can scale fast on private repos with macOS / large runners |

## Security Patterns
- **Pin third-party Actions to commit SHA** (`@<40-char-sha>`), not `@v3` (mutable tag).
- **Use OIDC for cloud auth**; avoid long-lived secrets.
- **`permissions:` scoped to minimum** — default `contents: read`; add `id-token: write` only when OIDC needed.
- **Environment approvals** — production deploys require manual review.
- **Secret scoping** — environment-specific secrets, not global.
- **Allowed Actions** — org / repo policies restrict which Actions can run.
- **Separate runners** — sensitive jobs on dedicated runner pool.

## Common HLD Patterns
- **Trunk-based CI:** PR → checks → merge to main → CI runs full test + build + deploy to staging → manual approval → prod.
- **Container build pipeline:** test → docker buildx (multi-arch) → push to ECR/GHCR → trigger CD (ArgoCD / ECS).
- **Monorepo path filters:** `paths:` triggers split per service so only changed services rebuild.
- **Reusable workflows:** central `.github/workflows/build-image.yml` called by many service repos via `uses:`.
- **Self-hosted runners** for: GPU jobs, network access to private VPC resources, large compute, security-critical builds.
- **Composite actions** — extract repeated step sequences (setup, login, test) into a private composite Action.

## Common Pitfalls / Gotchas
- **Mutable Action tags** — `@main` or `@v3` can change under you; pin to SHA for supply-chain safety.
- **Secrets in `pull_request_target`** — running with secrets on forked PRs is a giant security hole; understand the difference between `pull_request` and `pull_request_target`.
- **Workflow injection via untrusted input** — interpolating PR titles / branch names into shell scripts can run attacker code.
- **`GITHUB_TOKEN` permissions** — defaults can be too broad; set `permissions:` explicitly.
- **Concurrency without `cancel-in-progress`** — back-to-back deploys can stack.
- **Caching pitfalls** — wrong cache key invalidates often; too-loose key serves stale.
- **Self-hosted runner exposure** — public repos + self-hosted runners = remote code execution risk; use ephemeral runners (just-in-time).
- **Quotas / costs** — macOS / large / Windows runners burn budget fast.
- **Long jobs hit the 6-hour limit** — split into stages.
- **Logs leak secrets when masked through transformations** (e.g., base64-decode); review.

## Interview Cheat Sheet
- **Tagline:** GitHub-integrated CI/CD; YAML workflows on managed or self-hosted runners; OIDC for keyless cloud auth.
- **Best at:** GitHub repos, OIDC-driven cloud deploys, polyglot CI with matrix builds, environment-gated production deploys, marketplace-rich automation.
- **Worst at:** monorepo-heavy custom build graphs, air-gapped repos, long >6h orchestrations, GitLab/Bitbucket-hosted projects.
- **Scale:** hundreds of concurrent jobs per org with hosted runners; self-hosted scales as much as your hardware.
- **Distributes how:** GitHub-hosted control plane assigns jobs; runners pull via long-poll; jobs run isolated VMs.
- **Consistency / state:** workflow definitions live in repo; runs are isolated; cache + artifacts persist between runs.
- **Killer alternative:** GitLab CI/CD, CircleCI, Buildkite, Jenkins, Drone, Tekton, Argo Workflows, AWS CodeBuild/CodePipeline.

## Further Reading
- Official docs: <https://docs.github.com/en/actions>
- Workflow syntax: <https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions>
- OIDC for cloud auth: <https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect>
- Security hardening: <https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions>
