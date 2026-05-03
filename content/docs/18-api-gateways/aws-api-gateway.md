---
title: "AWS API Gateway"
description: "AWS API Gateway is the managed gateway in AWS — REST, HTTP, and WebSocket APIs with built-in auth (Cognito / IAM / Lambda authorizers), throttling, caching, and Lambda / VPC backends."
---

> Category: API Gateway · Provider: AWS · License: Proprietary (managed)

## TL;DR
Amazon API Gateway is AWS's fully managed API gateway service. Three flavors: **REST APIs** (full feature set, expensive), **HTTP APIs** (cheaper, lower latency, simpler features), and **WebSocket APIs**. Reach for it when you're on AWS and want a managed gateway that integrates with **Lambda**, **AWS IAM / Cognito**, **WAF**, and **VPC private integrations** without standing up Kong / Envoy yourself. The trade-off is per-request pricing that can become expensive at very high QPS, and feature-set lock-in to the AWS API surface.

## What problem does it solve?
- **Front Lambda functions with HTTP** without writing a server.
- **Auth + throttling + caching + logging** as managed concerns rather than self-hosted gateway operations.
- **VPC Link** to forward to ALB / NLB / Cloud Map services without exposing them publicly.
- **WebSocket APIs** — managed connection state mapping to Lambda invocations.
- **Per-stage** versioning, canary deployments, custom domains, mutual TLS.

## When to use
- **AWS Lambda backends** — natural pairing.
- **HTTP API to private VPC services** — VPC Link reaches NLB / ALB privately.
- **Auth via Cognito / IAM** — Cognito user pools, SigV4 IAM auth, or custom Lambda authorizers.
- **WebSocket APIs** with state-stickiness across Lambdas.
- **Per-API throttling / usage plans / API keys** for partner / third-party access.

## When NOT to use
- **High-QPS public APIs** where per-request pricing dominates — at sustained millions of RPS, self-hosted (Kong/Envoy on EC2/ECS) becomes cheaper.
- **Heavy custom plugins / WASM** — pick Kong or Envoy.
- **Multi-cloud portability** — AWS-specific.
- **Sub-millisecond budget** — managed gateway adds milliseconds of overhead.
- **GraphQL** — AWS AppSync is the managed GraphQL gateway.

## API Types

| Type | When to use | Notes |
|---|---|---|
| REST API | Need full feature set: API keys, usage plans, request validation, request/response transforms, edge-optimized via CloudFront | More expensive; higher latency |
| HTTP API | Most modern use cases; simpler config, JWT authorizer, Lambda + ALB + private integrations | ~70% cheaper, ~60% lower latency |
| WebSocket API | Real-time bidirectional connections | Lambda receives `$connect`, `$disconnect`, `$default`, custom routes |

## Architecture
- **Stages** — versioned deployments (`dev`, `staging`, `prod`) with their own throttling / variables.
- **Resources / methods** (REST) or **routes** (HTTP) — request matching.
- **Integrations** — Lambda (proxy or non-proxy), HTTP backend, VPC Link, Service integrations (DynamoDB, SQS, SNS, S3, Step Functions).
- **Authorizers** — Lambda authorizer, Cognito authorizer, JWT authorizer (HTTP API), IAM (SigV4).
- **Custom domains** + ACM TLS + Route 53 mapping.
- **Caching** (REST API only) — per-stage cache, 0.5 GB to 237 GB.

```yaml
# AWS SAM template snippet
Resources:
  UsersApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      StageName: prod
      Auth:
        Authorizers:
          JwtAuth:
            JwtConfiguration:
              issuer: https://example.auth0.com/
              audience: [api.example.com]
            IdentitySource: $request.header.Authorization
        DefaultAuthorizer: JwtAuth
      RouteSettings:
        "GET /users":
          ThrottlingBurstLimit: 200
          ThrottlingRateLimit: 100
      DefaultRouteSettings:
        DetailedMetricsEnabled: true

  GetUsersFn:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./handlers/
      Handler: users.list
      Runtime: nodejs20.x
      Events:
        GetUsers:
          Type: HttpApi
          Properties:
            ApiId: !Ref UsersApi
            Path: /users
            Method: GET
```

## Throttling & Caching
- **Account-level**: 10,000 RPS / 5,000 burst (REST), can request increase.
- **Per-stage and per-method** throttling.
- **Usage plans + API keys** (REST) — per-key quotas + throttling.
- **Cache** (REST only) — per-stage TTL, key by request parameters; reduces backend hits significantly for read-heavy public APIs.

## Auth Mechanisms
- **IAM (SigV4)** — internal AWS service-to-service.
- **Cognito User Pool** — built-in user management.
- **JWT authorizer** (HTTP API) — validates against any OIDC issuer.
- **Lambda authorizer** — custom logic (token + context-based decisions).
- **Mutual TLS** — for B2B / device authentication.

## Trade-offs

| Strength | Weakness |
|---|---|
| Fully managed; no servers | Per-request pricing dominates at very high RPS |
| First-class Lambda + IAM + Cognito + VPC Link | Lock-in to AWS API surface |
| WebSocket + REST + HTTP all supported | REST API has higher cost + latency than HTTP API |
| Stages, canary releases, per-stage variables | Cache is REST-only; HTTP API has none |
| Deep AWS integration (CloudWatch, X-Ray, WAF) | Cold-start latency added to Lambda integration |
| Mutual TLS support | Limited customization vs Kong / Envoy plugins |

## Common HLD Patterns
- **Serverless API:** API Gateway HTTP API → Lambda functions → DynamoDB / RDS Proxy.
- **Public API with usage plans:** REST API + usage plans + API keys; partner gets quota + throttling per key.
- **Private internal API:** API Gateway with VPC Link → NLB → ECS / EKS services in private subnets.
- **WebSocket realtime:** WebSocket API → Lambda for `$connect` / `$disconnect` / messages → DynamoDB stores connection IDs → server-push messages via API Gateway management API.
- **Hybrid edge:** CloudFront in front of API Gateway → terminate TLS at edge, cache safe GETs, send misses to API Gateway for auth + Lambda.
- **Canary deployment:** stage with X% traffic to new Lambda alias; promote when healthy.

## Common Pitfalls / Gotchas
- **Per-request cost** — at millions of RPS, self-hosting cheaper; do the math.
- **30-second timeout** on REST API integration — long jobs need async pattern (Step Functions, SQS).
- **HTTP API ≠ REST API** — features differ; pick deliberately and don't expect parity.
- **Cold starts on Lambda authorizers** — cache authorizer results aggressively (TTL).
- **Cache key bloat** (REST cache) — too many vary parameters = low hit rate.
- **Payload limits** — 10 MB max request, 6 MB Lambda payload; for big files use S3 + presigned URLs.
- **Mapping templates (REST)** — VTL templates are powerful but error-prone; HTTP API removed them in favor of simpler models.
- **Custom domains + multi-region** — need Route 53 latency-based routing or Global Accelerator for true multi-region active-active.

## Interview Cheat Sheet
- **Tagline:** AWS-managed API gateway with REST / HTTP / WebSocket flavors, native Lambda + IAM + Cognito + VPC integration.
- **Best at:** serverless APIs on Lambda, AWS-native auth, managed throttling / caching / usage plans, WebSocket realtime.
- **Worst at:** millions-of-RPS cost-sensitive public APIs, multi-cloud portability, heavy plugin customization.
- **Scale:** 10k RPS default, can request increases; AWS scales the data plane.
- **Distributes how:** managed multi-AZ within region; CloudFront edge-optimized REST APIs sit behind global PoPs.
- **Consistency / state:** stateless gateway; WebSocket connection state managed via API Gateway; usage plan counters tracked by AWS.
- **Killer alternative:** Kong, Envoy + Gloo, Tyk, Azure API Management, Apigee, AWS AppSync (GraphQL).

## Further Reading
- Official docs: <https://docs.aws.amazon.com/apigateway/>
- HTTP API vs REST API: <https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html>
- VPC Link: <https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vpc-links.html>
- WebSocket APIs: <https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html>
