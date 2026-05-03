---
title: "Pulumi"
description: "Pulumi is Infrastructure as Code in real programming languages — TypeScript, Python, Go, C#, Java; same provider model as Terraform, with loops, conditionals, abstractions, and unit tests as first-class."
---

> Category: Infrastructure as Code · Written in: Go (engine) + multi-language SDKs · License: Apache 2.0

## TL;DR
Pulumi is **Infrastructure as Code in real programming languages**. You describe infrastructure in **TypeScript / JavaScript / Python / Go / C# / Java / YAML** instead of HCL, and Pulumi runs the program to produce the same kind of plan/apply that Terraform does — using **the same Terraform-compatible provider model** under the hood for many providers (and native cloud providers too). Reach for Pulumi when you want loops, conditionals, abstractions, IDE refactoring, and unit-testable infrastructure code; or when your team is comfortable in code but allergic to HCL's limitations.

## What problem does it solve?
- **HCL is not a programming language** — complex logic in Terraform requires `for_each` gymnastics; Pulumi gives you `for`, `if`, classes, modules, types.
- **Type safety + IDE refactoring** — TypeScript / Go / Java compilers catch typos and shape mismatches at build time.
- **Unit tests for infrastructure** — write Jest / pytest / Go tests against Pulumi resources; mock the cloud.
- **Reuse via classes / inheritance** — natural in OO languages.
- **Same engine, same providers** — Pulumi can wrap Terraform providers via `pulumi-terraform-bridge`; provider parity is high.
- **Component resources** — high-level abstractions ("a microservice with DB + queue + IAM") encapsulating many primitives.

## When to use
- **Strong-typed language teams** — TypeScript / Go / Java / Python shops.
- **Complex orchestration logic** — branching, loops, computed inputs across many environments.
- **Reusable platform components** — a "create-a-service" Component that hides 30 raw resources.
- **Tested infra** — unit tests + property tests for component contracts.
- **Same languages for app + infra** — engineers don't context-switch.

## When NOT to use
- **All-Terraform shops** — switching cost vs marginal benefit; Terraform / OpenTofu may be enough.
- **You want one universally-supported tool** — Terraform/OpenTofu are more universal in job postings and tooling.
- **Pure declarative discipline preferred** — HCL's constraints are sometimes a feature.
- **Minimal infra that doesn't need real programming** — overkill.

## Data Model
- **Stack** — a deployable instance (env: dev / staging / prod) with its own config + state.
- **Project** — a Pulumi program (any of the supported languages).
- **State backend** — Pulumi Cloud (managed, default), or self-hosted (S3, Azure Blob, GCS, file).
- **Resources** — `new aws.s3.Bucket(...)`, `new k8s.apps.v1.Deployment(...)`, etc.
- **Component Resources** — your own resource types composed of primitives.
- **Stack references** — read another stack's outputs (cross-stack dependency).
- **Config + secrets** — per-stack values via `pulumi config set`; secrets encrypted with a key (passphrase, KMS, Pulumi Cloud).

```typescript
// index.ts — TypeScript Pulumi program
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const cfg = new pulumi.Config();
const env = cfg.require("env");

const vpc = new aws.ec2.Vpc("main", {
    cidrBlock: "10.0.0.0/16",
    tags: { Name: `${env}-vpc`, Env: env },
});

const azs = ["a", "b", "c"];
const subnets = azs.map((az, i) =>
    new aws.ec2.Subnet(`private-${az}`, {
        vpcId: vpc.id,
        cidrBlock: `10.0.${i}.0/24`,
        availabilityZone: `us-east-1${az}`,
        tags: { Name: `${env}-private-${az}` },
    })
);

const logs = new aws.s3.BucketV2("logs", {
    bucket: `${env}-acme-logs`,
});
new aws.s3.BucketVersioningV2("logs-versioning", {
    bucket: logs.id,
    versioningConfiguration: { status: "Enabled" },
});
new aws.s3.BucketPublicAccessBlock("logs-block", {
    bucket: logs.id,
    blockPublicAcls: true, blockPublicPolicy: true,
    ignorePublicAcls: true, restrictPublicBuckets: true,
});

export const vpcId = vpc.id;
export const subnetIds = pulumi.output(subnets.map(s => s.id));
```

```python
# Same idea in Python
import pulumi
import pulumi_aws as aws

cfg = pulumi.Config()
env = cfg.require("env")

vpc = aws.ec2.Vpc("main", cidr_block="10.0.0.0/16",
                  tags={"Name": f"{env}-vpc", "Env": env})

for i, az in enumerate(["a", "b", "c"]):
    aws.ec2.Subnet(f"private-{az}",
                   vpc_id=vpc.id,
                   cidr_block=f"10.0.{i}.0/24",
                   availability_zone=f"us-east-1{az}")

pulumi.export("vpc_id", vpc.id)
```

## Architecture
- **Pulumi engine (Go)** — orchestrates resource lifecycle; talks to providers via gRPC.
- **Language hosts** — each language has a host process that executes your code and emits resource registrations to the engine.
- **Providers** — same provider model as Terraform; many providers are wrapped Terraform providers via `pulumi-terraform-bridge`; native ones exist too (e.g., `pulumi-aws-native`).
- **State backend** — Pulumi Cloud (managed; collaboration / RBAC / audit) or self-hosted file/S3/GCS/Azure.
- **Inputs / Outputs** — async-typed values; outputs from one resource become inputs to another (Promise-like).

## Trade-offs

| Strength | Weakness |
|---|---|
| Real programming languages — types, refactoring, testing | Steeper bar than declarative HCL for non-programmers |
| Same provider ecosystem as Terraform | Terraform's community / examples / providers still larger |
| Component Resources for great abstractions | Two state-backend choices (Pulumi Cloud paid, self-hosted DIY) |
| Stack-references + secret encryption | Migrating from Terraform requires `tf2pulumi` and care |
| Unit tests + policy-as-code (CrossGuard) | Imperative-flavored programs can hide intent — discipline needed |
| Native cloud providers + classic TF-bridge providers | Some providers are TF-bridge derivatives; lag native a tiny bit |
| Free for small teams; OSS engine | Commercial features (RBAC, drift, deployments, ESC) gated to Pulumi Cloud |

## Common HLD Patterns
- **Component Resource libraries:** platform team publishes `@acme/microservice` Component that takes name + image + DB requirements and creates IAM, ECS service, Aurora cluster, ALB rules, Datadog dashboards.
- **Stack per environment:** `dev` / `staging` / `prod` stacks with shared program + per-stack config.
- **Cross-stack composition:** `network` stack outputs VPC ID; `app` stack reads it via `StackReference`.
- **Policy as Code (CrossGuard):** central policy pack denies open S3 buckets / IPv4-only / wildcard IAM at plan time.
- **Pulumi ESC (Environments, Secrets, Configuration):** central config / secret store referenced by stacks; replaces ad-hoc tfvars / Vault calls.
- **Automation API:** drive Pulumi from a service / CLI without `pulumi` binary; useful for SaaS-style provisioning ("create-a-tenant" backed by Pulumi).

## Common Pitfalls / Gotchas
- **Awaiting Outputs** — Outputs are deferred / async; never call `.toString()` directly; use `apply` / `pulumi.interpolate`.
- **Non-deterministic resource names** — using random numbers / dates in resource names creates churn each run.
- **Stack references vs hard-coded** — prefer stack refs over hard-coded ARNs / IDs across environments.
- **Secrets in plain config** — use `pulumi config set --secret`; never commit plain secrets.
- **Local-state mistakes** — file backend on a laptop is fine for demos; production needs S3/GCS or Pulumi Cloud.
- **Cyclic dependencies** between resources — Pulumi will throw; restructure inputs.
- **Mixing Terraform + Pulumi** in same domain — one source of truth; don't have both manage the same resources.
- **Refactoring resource names** mid-life — Pulumi will recreate; use `pulumi state rename`.

## Interview Cheat Sheet
- **Tagline:** Infrastructure as Code in real languages (TS/Py/Go/C#/Java); same provider model as Terraform; types + tests + abstractions.
- **Best at:** complex orchestration logic, reusable Component abstractions, unit-testable infra, polyglot teams already in TS/Py/Go.
- **Worst at:** all-Terraform shops with no migration appetite, declarative-discipline-required environments, tiny one-off scripts.
- **Scale:** comparable provider ecosystem; component model scales platform abstractions cleanly.
- **Distributes how:** stack-per-environment with own state and config; stack references for cross-stack composition.
- **Consistency / state:** managed via state backend (Pulumi Cloud or self-hosted); locked applies; same plan/apply lifecycle as Terraform.
- **Killer alternative:** Terraform / OpenTofu (HCL standard), AWS CDK (CloudFormation under the hood), CDKTF (CDK + TF providers), Crossplane (K8s-native), Bicep (Azure), Ansible (config-management).

## Further Reading
- Official docs: <https://www.pulumi.com/docs/>
- Concepts overview: <https://www.pulumi.com/docs/concepts/>
- Pulumi Cloud: <https://www.pulumi.com/product/pulumi-cloud/>
- Component Resources: <https://www.pulumi.com/docs/concepts/resources/components/>
