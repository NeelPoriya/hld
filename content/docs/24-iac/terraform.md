---
title: "Terraform"
description: "Terraform is the dominant Infrastructure-as-Code tool — declarative HCL, provider model for every cloud, state-driven plan/apply lifecycle; OpenTofu is the Linux-Foundation OSS fork after the BUSL relicensing."
---

> Category: Infrastructure as Code · Written in: Go · License: BUSL 1.1 (since 2023; OpenTofu is the OSS fork)

## TL;DR
Terraform is the de-facto **Infrastructure as Code (IaC)** tool — you write declarative **HCL** describing the resources you want (`aws_instance`, `kubernetes_namespace`, `cloudflare_record`, …), Terraform computes a diff between **desired state** and **actual state** stored in a **state file**, and `apply` brings the world to match. The 2023 license change to BUSL spawned **OpenTofu**, a drop-in OSS fork under the Linux Foundation. Reach for Terraform when you need cross-cloud, version-controlled, audited infrastructure changes — the most universal IaC tool in production.

## What problem does it solve?
- **Click-ops drift** — UI-created resources are unrepeatable and untracked.
- **Multi-cloud + multi-vendor** — one tool for AWS, GCP, Azure, Cloudflare, GitHub, PagerDuty, Datadog, MongoDB Atlas (3,000+ providers).
- **Reproducible environments** — same code makes dev / staging / prod identical (modulo variables).
- **Change review** — `terraform plan` shows what will change; PR review approves.
- **Audit trail** — Git history of every infrastructure change.
- **Modular reuse** — modules + registry for composable infrastructure patterns.

## When to use
- **Cloud infrastructure** — VPCs, subnets, IAM, RDS, S3, Kubernetes clusters, DNS records, CDN configs.
- **Cross-vendor stitching** — provision an EKS cluster + Cloudflare DNS + GitHub repo + Datadog dashboards in one apply.
- **Standardized platform abstraction** — modules expose a "create-a-microservice" or "create-a-tenant" interface.
- **Compliance / SOC2 audits** — Git-based audit trail of all infra changes.
- **Disaster recovery rehearsals** — re-run apply in DR region.

## When NOT to use
- **Imperative scripting** — Terraform is declarative; for ad-hoc one-off scripts, use bash / boto3 / Pulumi (general-purpose lang).
- **Application code deployments** — Terraform isn't a CI/CD tool; pair with ArgoCD / GitHub Actions / Spinnaker.
- **Inside-a-VM configuration management** — Ansible / Chef / Puppet / cloud-init; Terraform stops at the VM/container boundary (though it can call provisioners — discouraged).
- **High-frequency mutations** — state file lock contention; use config-management tools or Kubernetes operators.

## Data Model
- **Configuration** — `.tf` files in HCL describing `provider`, `resource`, `data`, `module`, `variable`, `output`, `locals`.
- **State** — JSON file (`terraform.tfstate`) mapping configuration to real-world IDs; remote state backends (S3 + DynamoDB lock, GCS, Terraform Cloud, Consul, Azurerm) are mandatory in any real setup.
- **Plan** — diff between desired and actual; `terraform plan -out=plan.tfplan` for review.
- **Apply** — execute the plan; updates state.
- **Modules** — reusable Terraform packages; published on Terraform Registry or hosted in Git.
- **Workspaces** — multiple state instances per configuration (e.g., per environment).

```hcl
# main.tf — minimal AWS VPC + subnets + S3 bucket with strict policy
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.40" }
  }
  backend "s3" {
    bucket         = "acme-tfstate"
    key            = "prod/network.tfstate"
    region         = "us-east-1"
    dynamodb_table = "acme-tflock"
    encrypt        = true
  }
}

provider "aws" { region = "us-east-1" }

variable "env" { type = string }

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  tags       = { Name = "${var.env}-vpc", Env = var.env }
}

resource "aws_subnet" "private" {
  for_each          = toset(["a", "b", "c"])
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 4, index(["a","b","c"], each.key))
  availability_zone = "us-east-1${each.key}"
  tags              = { Name = "${var.env}-private-${each.key}" }
}

module "logs_bucket" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 4.0"

  bucket = "${var.env}-acme-logs"
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
  versioning = { enabled = true }
}

output "vpc_id" { value = aws_vpc.main.id }
```

```bash
terraform init       # download providers + configure backend
terraform fmt        # canonical formatting
terraform validate   # schema-check the config
terraform plan -out=tfplan -var env=prod
terraform apply tfplan
```

## Architecture
- **CLI** — Go binary that reads HCL, talks to providers via gRPC, manages state.
- **Providers** — separate plugins (`hashicorp/aws`, `cloudflare/cloudflare`, `kubernetes/kubernetes`); each maps Terraform resources to a vendor's API.
- **State backend** — remote storage (S3, GCS, Azurerm, TF Cloud) with locking (DynamoDB, GCS, native).
- **Plan engine** — graph-based dependency resolution; parallel apply where dependencies permit.
- **Lifecycle hooks** — `create_before_destroy`, `prevent_destroy`, `ignore_changes`.

## Common Patterns
- **Remote state backend** — never use local state in production; S3 + DynamoDB lock or Terraform Cloud.
- **Modules per service / per layer** — `network`, `eks`, `rds`, `dns` modules composed into root configs.
- **Terragrunt** — third-party wrapper that DRY-s remote-state config and module instantiation across environments.
- **Pre-commit hooks** — `terraform fmt`, `tflint`, `tfsec`, `checkov` before commit.
- **Plan in PR** — Atlantis / Spacelift / TF Cloud / GitHub Actions runs `plan` on PR, comments diff, and `apply` on merge.
- **Drift detection** — scheduled `plan` job alerts on drift between code and reality.

## Trade-offs

| Strength | Weakness |
|---|---|
| Largest provider ecosystem (3,000+ providers) | License changed to BUSL in 2023 (OpenTofu is the OSS fork) |
| Declarative + idempotent | HCL is not a real programming language; complex logic is awkward |
| Plan / apply review workflow | State file is sacred; corruption is painful to recover |
| Mature, ubiquitous | Provider quirks; resource drift can happen if changed elsewhere |
| Modules + Registry for reuse | Iterating with for_each / dynamic blocks has rough edges |
| Cross-vendor in one apply | Long applies on huge state files; split state for scale |
| Strong CI/CD integrations (Atlantis, TF Cloud, Spacelift) | Plan-apply gap allows races (ttn other actors) |

## Common HLD Patterns
- **Per-environment workspaces:** dev / staging / prod state files; module fed by environment-specific tfvars.
- **Per-service module:** modules expose minimal inputs (name, env, sizing); platform team curates; product teams consume.
- **Multi-region:** providers with aliases (`provider = aws.us-west-2`); resources tagged with region.
- **Secret bootstrapping:** Vault Provider creates auth methods + roles; subsequent runs read short-lived creds via Vault.
- **GitOps for infra:** Atlantis or TF Cloud auto-plans on PR, requires approvals, applies on merge.
- **Compliance scanning:** `tfsec` / `checkov` / Sentinel policies prevent open S3 buckets / missing encryption / wide IAM.

## Common Pitfalls / Gotchas
- **State file in git** — never commit; secrets leak; use remote backend with encryption.
- **No locking** — concurrent applies corrupt state; always use a backend with locking.
- **Drift** — manual changes via console make `apply` undo or fight; reconcile via `import` or refresh.
- **Provider version drift** — without `required_providers` constraints, providers auto-upgrade and break plans.
- **Resource recreation surprise** — changing a "force-new" attribute destroys + recreates resources (DBs!); read the plan carefully.
- **`for_each` ordering** — sets are stable; lists with index can shift on changes; prefer `for_each` over `count`.
- **Massive root modules** — slow plans; split state by domain (network / data / app).
- **Mixing Terraform with manual scripts** — kills idempotency.
- **Sensitive outputs** — mark `sensitive = true` to avoid logging; audit anyway.
- **Removing modules without `state rm`** — leaves zombie resources in state.

## Interview Cheat Sheet
- **Tagline:** Declarative HCL Infrastructure as Code with state-driven plan/apply; provider for every cloud and SaaS.
- **Best at:** cross-vendor infra provisioning, version-controlled change review, modular platform abstractions, compliance audit trails.
- **Worst at:** imperative scripts, in-VM configuration, app deployments, high-frequency state mutations.
- **Scale:** 3,000+ providers; thousands of resources per state; state-splitting for very large estates.
- **Distributes how:** state file is the source of truth; remote backend with locking; plan/apply per workspace.
- **Consistency / state:** strongly consistent within a single state file (locked apply); cross-state references via `terraform_remote_state` or workspace outputs.
- **Killer alternative:** OpenTofu (OSS fork), Pulumi (real languages), AWS CDK / CDK for Terraform, CloudFormation, Bicep (Azure), Crossplane (K8s-native).

## Further Reading
- Official docs: <https://developer.hashicorp.com/terraform/docs>
- Module Registry: <https://registry.terraform.io/>
- OpenTofu (OSS fork): <https://opentofu.org/>
- Best practices: <https://developer.hashicorp.com/terraform/cloud-docs/recommended-practices>
