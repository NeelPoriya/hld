---
title: "AWS Lambda"
description: "AWS Lambda is the canonical Function-as-a-Service — short-lived stateless container invocations triggered by events, with per-millisecond billing, automatic scaling, and managed runtime."
---

> Category: Serverless / FaaS · Provider: AWS · License: Proprietary (managed)

## TL;DR
AWS Lambda is the **archetypal Function-as-a-Service**. You upload a function (zip, container image, or layer); AWS runs it on demand inside a **micro-VM (Firecracker)** triggered by an event source — API Gateway HTTP request, SQS message, S3 object create, EventBridge rule, DynamoDB stream, scheduled rule, or a direct invoke. You pay per **GB-millisecond of compute** plus per-invocation cost. There are no servers to patch, no autoscaling to configure, no idle cost (mostly). Reach for Lambda when you have **bursty, event-driven, short workloads** (< 15 minutes) and want infrastructure to disappear; reach for ECS / EKS / EC2 when you need long-running processes, predictable steady-state load, or extreme cost-efficiency at scale.

## What problem does it solve?
- **Idle servers cost money** — Lambda bills only while code runs.
- **Autoscaling is hard** — Lambda scales 0 → 1000 concurrent in seconds.
- **Event-driven glue code** has high ops cost on EC2 — Lambda is the perfect glue.
- **Patching / OS lifecycle** — AWS owns the runtime.
- **Multi-language polyglot** — Node, Python, Java, Go, .NET, Ruby; custom runtimes via Lambda Runtime API.

## When to use
- **HTTP APIs with bursty traffic** — API Gateway / ALB / Function URL → Lambda.
- **Event processing** — S3 uploads, DynamoDB streams, Kinesis, SQS, EventBridge.
- **Cron / scheduled jobs** — EventBridge schedule → Lambda.
- **Webhooks** — receive third-party callback, write to DB / queue.
- **CI/CD glue** — slack notifications, custom lifecycle hooks.
- **Image / file processing** — thumbnails, virus scanning, transcoding (small).

## When NOT to use
- **Long-running > 15 min** — Lambda has 15-min hard cap; use ECS / Step Functions / Batch.
- **High steady-state QPS at scale** — long-running ECS / EKS is cheaper.
- **Sub-ms latency-critical** — cold starts add 100ms–several seconds; provisioned concurrency mitigates but costs idle.
- **Heavy local state / caching** — Lambda is stateless; warm caches are best-effort.
- **GPU / specialized hardware** — Lambda is CPU-only (limited memory/vCPU mapping).
- **Stateful WebSocket connections** — API Gateway WebSocket + DynamoDB connection map works but is awkward; consider AppSync / Ably / dedicated server.

## Data Model / Execution Model
- **Function** — code package (zip up to 250 MB, container image up to 10 GB) + runtime + handler.
- **Memory + vCPU** — pick memory (128 MB → 10 GB); vCPU scales linearly with memory.
- **Concurrency** — concurrent executions; account default 1000; reserved / provisioned concurrency for tuning.
- **Environment variables** — per-function; encrypted with KMS optionally.
- **Layers** — shared zip (libraries, binaries) referenced by multiple functions.
- **Versions + Aliases** — immutable versions; aliases (`prod` → version 7) shift traffic, do canaries.
- **Triggers / event sources** — API Gateway, SQS, SNS, EventBridge, S3, DynamoDB Streams, Kinesis, Cognito, MSK, ALB, Function URLs.

```python
# handler.py — Python Lambda example
import json
import os
import boto3

table = boto3.resource("dynamodb").Table(os.environ["TABLE"])

def handler(event, context):
    # API Gateway HTTP API event
    body = json.loads(event["body"])
    table.put_item(Item={"pk": body["id"], "data": body["data"]})
    return {
        "statusCode": 200,
        "body": json.dumps({"ok": True, "request_id": context.aws_request_id})
    }
```

```yaml
# AWS SAM template
Resources:
  CreateItemFn:
    Type: AWS::Serverless::Function
    Properties:
      Runtime: python3.12
      Handler: handler.handler
      MemorySize: 512
      Timeout: 10
      Architectures: [arm64]      # cheaper than x86_64
      Environment:
        Variables:
          TABLE: !Ref Items
      Events:
        Http:
          Type: HttpApi
          Properties: { Path: /items, Method: post }
      Policies:
        - DynamoDBWritePolicy: { TableName: !Ref Items }
```

## Architecture
- **Firecracker micro-VMs** — KVM-based lightweight VMs spin up in ~125 ms.
- **Worker fleet** — pool of EC2 hosts running Firecracker; sandboxes are placed and reused.
- **Cold start vs warm** — first request to a new sandbox = init runtime + handler init; subsequent requests reuse the same process (warm). Provisioned concurrency keeps N sandboxes warm at idle cost.
- **Frontend invoker** — receives invoke / event source pull; assigns to worker.
- **Event source mappers** — Lambda-managed pollers for SQS / Kinesis / DynamoDB / Kafka.
- **Lambda Extensions** — out-of-process companion processes (Datadog, Dynatrace, secrets) hooked via Runtime API.

## Trade-offs

| Strength | Weakness |
|---|---|
| Zero ops, no servers | Cold start can be 100ms–several seconds |
| Pay-per-invocation; idle = $0 | Hard 15-min execution cap |
| Auto-scales 0 → thousands in seconds | Concurrency limits + throttle errors |
| Built-in integrations with most AWS services | Tight AWS lock-in |
| Versions + aliases for safe rollouts | Vendoring large dependencies = slow cold start |
| Container images up to 10 GB | At sustained high QPS, cheaper alternatives exist (ECS) |
| Provisioned + reserved concurrency for predictability | Provisioned concurrency = idle cost |
| ARM (Graviton) ~20% cheaper | Limited language ecosystem for non-AWS deploy |

## Common HLD Patterns
- **Sync API:** API Gateway HTTP API → Lambda → DynamoDB / RDS Proxy. Use **RDS Proxy** for connection pooling against RDS.
- **Async fan-out:** SNS → many SQS → Lambda. Each consumer scales independently.
- **Stream processing:** DynamoDB Stream / Kinesis → Lambda; batch up to 10000 records; partial-batch responses.
- **S3 → Lambda → S3:** image resize, antivirus scan, log compaction.
- **Step Functions** orchestrate multi-step workflows; each step is a Lambda; built-in retries / catch / map.
- **Webhook receiver:** API Gateway → Lambda → SQS for backend processing (decouples spiky external load).
- **Custom authorizer:** API Gateway Lambda authorizer validates JWT, returns IAM policy.
- **Provisioned concurrency** for latency-sensitive APIs to eliminate cold starts.

## Common Pitfalls / Gotchas
- **Cold starts** — JVM / .NET cold starts are big; SnapStart for Java / Python (snapshot reduces startup).
- **VPC cold starts (legacy)** — were ~10s; current Lambda uses Hyperplane ENI, ~ms.
- **Stateless** — global variables persist across warm invocations on the same sandbox; use carefully (good for caching, dangerous for per-request data).
- **Connection pooling vs Postgres / MySQL** — naïve `psycopg2.connect()` per invoke causes connection exhaustion; use RDS Proxy.
- **Concurrency limits** — default 1000 per account / region; can throttle real traffic.
- **Function size + cold start tradeoff** — bigger zip = slower cold start.
- **Logs cost** — every print goes to CloudWatch Logs; can dominate cost at high QPS; sample / disable.
- **Timeouts cascade** — long downstream timeout + Lambda 15-min cap = nasty bills; set bounded timeouts.
- **EventBridge / SQS retry semantics differ** — understand DLQ + max-receive vs retries.
- **ALB / API Gateway differ on payload format** — API Gateway v1 vs v2 vs ALB are three different event shapes.

## Interview Cheat Sheet
- **Tagline:** Canonical FaaS — micro-VM (Firecracker) per function; pay per GB-ms; auto-scales; 15-min hard cap.
- **Best at:** event-driven glue, bursty HTTP APIs, scheduled jobs, S3/Stream processing, low-ops backends.
- **Worst at:** long-running, latency-sensitive (cold start), GPU / heavy compute, stateful long-lived connections.
- **Scale:** thousands of concurrent invocations per account default; can request more; per-region.
- **Distributes how:** AWS Lambda fleet of Firecracker sandboxes; transparent placement, cross-AZ.
- **Consistency / state:** stateless; persist to DynamoDB / S3 / RDS for state.
- **Killer alternative:** Cloudflare Workers (V8 isolate, faster cold start), Google Cloud Functions / Cloud Run, Azure Functions, Vercel Functions, ECS Fargate (containers), self-hosted OpenFaaS / Knative.

## Further Reading
- Official docs: <https://docs.aws.amazon.com/lambda/>
- Best practices: <https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html>
- Firecracker (open-source micro-VM): <https://firecracker-microvm.github.io/>
- AWS Serverless Application Model (SAM): <https://docs.aws.amazon.com/serverless-application-model/>
