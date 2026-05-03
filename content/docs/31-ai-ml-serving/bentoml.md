---
title: "BentoML"
description: "BentoML is the open-source ML model serving framework — wrap any model into a Python service, package it as a Bento, and deploy to Kubernetes / serverless / BentoCloud with one command."
---

> Category: AI / ML Serving · Written in: Python (server) + Go (CLI / orchestration) · License: Apache 2.0

## TL;DR
BentoML is the **MLOps Swiss-army knife** for **packaging and serving ML models** of any framework — PyTorch, TensorFlow, scikit-learn, XGBoost, HuggingFace Transformers, ONNX, custom Python — behind a clean Python API that becomes an HTTP / gRPC service, with batching, multi-model composition, GPU support, autoscaling, and a deployment story to Kubernetes (Yatai), BentoCloud (managed), or any cloud serverless. The packaging unit is a **Bento**: a versioned, immutable archive of code + model weights + dependencies + Dockerfile spec. Reach for BentoML when you serve **traditional ML models or LLMs**, want a **framework-agnostic Python serving layer**, and need a clean path from notebook to production.

Compared to **vLLM** (which we cover separately), BentoML is **the serving framework**, vLLM is **the LLM inference engine** — and they compose: BentoML can use vLLM as the runtime for LLM endpoints while exposing classical models through the same service.

## What problem does it solve?
- **From-notebook-to-API gap** — DS writes `model.predict()`; productionizing it normally takes weeks.
- **Framework lock-in** — TorchServe is PyTorch-only; TF Serving is TF-only; BentoML is everything.
- **Model + business logic in one service** — preprocessing, postprocessing, multi-model pipelines.
- **Reproducible builds** — Bentos are immutable, version-controlled, and deployable identically.
- **GPU efficient batching** — adaptive batching collects requests over a few ms to fill the GPU.
- **Multi-model on one container** — embed model + reranker + classifier in one service.

## When to use
- **Production ML serving** for any framework.
- **LLMs + classical models** in the same stack.
- **Compound AI systems** — multiple models orchestrated in one Python service.
- **You want one tool** spanning packaging + deployment + monitoring.
- **Self-hosted MLOps** on Kubernetes (via Yatai) or managed (BentoCloud).
- **Notebook-friendly DS workflow** that scales to prod without rewrite.

## When NOT to use
- **Pure LLM serving with maximum throughput** — use vLLM directly (BentoML can wrap it).
- **Tiny scikit-learn model** — Flask / FastAPI may be enough.
- **NVIDIA-specific ultra-low-latency** — Triton may be faster for that niche.
- **No Python in stack** — BentoML is Python-first; thin clients in Go / TS exist.
- **Edge / mobile inference** — use Core ML / TFLite / ONNX runtime.

## Core Concepts
- **Service** — `@bentoml.service` Python class with `@bentoml.api`-decorated methods that become HTTP endpoints.
- **Runner / IO descriptors** (older API) — encapsulate model + inputs/outputs.
- **Bento** — immutable packaged service (code + weights + deps + Dockerfile config).
- **Model store** — local or remote registry of versioned model artifacts.
- **Adaptive batching** — server collects requests up to `max_latency_ms` or `max_batch_size`, runs them as one batch.
- **Concurrency model** — async by default (asyncio); workers per CPU; GPU pinning.
- **Yatai** — Kubernetes operator for deploying Bentos.
- **BentoCloud** — managed serverless inference platform (proprietary).

```python
# service.py
from __future__ import annotations
import bentoml
from PIL import Image
import torch
import numpy as np

# 1. Save / version your model once
# bentoml.pytorch.save_model("resnet50", trained_resnet50)

@bentoml.service(
    resources={"gpu": 1, "memory": "16Gi"},
    traffic={"timeout": 30, "concurrency": 32},
    workers=1
)
class ImageClassifier:
    model_ref = bentoml.models.get("resnet50:latest")

    def __init__(self):
        self.model = bentoml.pytorch.load_model(self.model_ref).cuda().eval()
        self.labels = open(self.model_ref.path + "/labels.txt").read().splitlines()

    @bentoml.api(batchable=True, batch_dim=0, max_batch_size=64, max_latency_ms=20)
    @torch.inference_mode()
    def classify(self, images: list[Image.Image]) -> list[dict]:
        x = torch.stack([preprocess(img) for img in images]).cuda()
        logits = self.model(x)
        idx = logits.argmax(dim=1).tolist()
        scores = logits.softmax(dim=1).max(dim=1).values.tolist()
        return [{"label": self.labels[i], "score": s} for i, s in zip(idx, scores)]
```

```python
# Compose two services into one pipeline
@bentoml.service
class RAGService:
    embedder = bentoml.depends(EmbedderService)
    reader   = bentoml.depends(ReaderService)

    @bentoml.api
    async def answer(self, question: str) -> str:
        emb = await self.embedder.embed(question)
        ctx = await retrieve_from_vector_db(emb)
        return await self.reader.read(question=question, context=ctx)
```

```yaml
# bentofile.yaml — describe how to build the Bento
service: "service:ImageClassifier"
labels:
  owner: ml-platform
  team: cv
include:
  - "*.py"
python:
  requirements_txt: ./requirements.txt
docker:
  python_version: "3.11"
  cuda_version: "12.1"
models:
  - resnet50:latest
```

```bash
# Build, run, push, deploy
bentoml build                                    # produces a Bento
bentoml serve service:ImageClassifier --port 3000
bentoml containerize image_classifier:latest    # builds Docker image
bentoml deploy . --cluster prod                  # to BentoCloud / Yatai
```

## Architecture
- **API server** — FastAPI / Starlette under the hood; async; handles HTTP + gRPC.
- **Workers** — one or more processes per replica; CPU-bound preprocessing here.
- **Runner / model code** — runs the actual inference; can be co-located or separated as a "runner pod" for GPU pooling.
- **Adaptive micro-batcher** — middleware that collects compatible requests into a batch.
- **Model store** — `~/bentoml/models/` locally; S3 / OCI registry remotely.
- **Bento store** — built artifacts cached locally; pushable to registry.
- **Metrics** — Prometheus by default (`/metrics` endpoint).
- **Tracing** — OpenTelemetry hooks built in.

## Trade-offs

| Strength | Weakness |
|---|---|
| Framework-agnostic (PyTorch, TF, sklearn, ONNX, …) | Python serving — slower than C++ runtimes for tiny models |
| Adaptive batching out of the box | Requires Python knowledge of devs |
| Compound AI: multi-model services in one process | Overhead vs raw FastAPI for trivial endpoints |
| OpenAI-compatible LLM endpoints supported | LLM perf depends on chosen runtime (vLLM / TGI) |
| Yatai for K8s self-hosted deploy | Yatai is younger / less mature than KServe |
| BentoCloud for managed serverless | Cloud is paid + vendor lock-in |
| Strong DS-friendly Python API | Some advanced features lag behind raw frameworks |
| OTel + Prometheus built in | Heavy Docker images by default |

## Common HLD Patterns
- **Single-model service:** one `@bentoml.service`; `@bentoml.api` returns predictions; HPA replicas scale on RPS.
- **Multi-model pipeline:** `Embedder → Retriever → Ranker → LLM` chained in one Bento via `bentoml.depends`; either co-located (in-process) or separated services for independent scaling.
- **LLM service via vLLM runtime:** BentoML service wraps a vLLM engine; HTTP API in front; rate limiting + auth in BentoML; raw inference in vLLM.
- **Batch + online dual-purpose service:** same Bento exposes online endpoint and batch handler (Spark / Beam can call into it).
- **Canary deployment:** Yatai routes 5% of traffic to new Bento version; monitors latency + error rate; auto-promotes.
- **Multi-tenant deployment:** one Bento, per-tenant LoRA or model selection via header → routed to correct in-process model.

## Common Pitfalls / Gotchas
- **CPU vs GPU concurrency mismatch** — GPU runner can be the bottleneck; tune `traffic.concurrency` and adaptive batching.
- **Adaptive batching latency budget** — too high = stalls; too low = under-batched.
- **Model versioning** — pinning to `latest` in production is risky; pin to immutable tag.
- **Heavy preprocessing on the API worker** — move to a runner or background worker if it dominates.
- **Cold start** — large model loads (10s of GB) take time; pre-warm replicas.
- **Container size** — bundling CUDA + framework + model can hit 10+ GB; multi-stage build / model store mounts help.
- **Async vs sync APIs** — use `async def` for I/O-bound; sync for pure CPU.
- **Compose pitfalls** — when chaining services in one Bento, GIL contention can hurt; consider separating heavy-CPU stages into their own service.
- **GPU memory leaks** — long-running services drift; periodic restart helps.
- **OpenAI-compat endpoints** — match the schema exactly; tool/function calling has known divergences.

## Interview Cheat Sheet
- **Tagline:** Framework-agnostic Python ML serving — wrap any model, package as immutable Bento, deploy to K8s / BentoCloud, with adaptive batching + multi-model composition.
- **Best at:** any-framework production ML serving, compound AI systems (multi-model), notebook-to-prod path, LLM + classical mixed.
- **Worst at:** lowest-latency LLM serving (use vLLM directly), edge inference, tiny FastAPI-grade endpoints.
- **Scale:** stateless replicas behind LB; Yatai HPA on RPS / latency / GPU util.
- **Distributes how:** services as deployments; runners can be separated for shared GPU pools.
- **Consistency / state:** stateless serving; model artifacts immutable in store; per-request idempotent.
- **Killer alternative:** Triton Inference Server (NVIDIA, polyglot, fastest), KServe (K8s-native), Ray Serve (composable Python with Ray), TorchServe (PyTorch-only), TF Serving (TF-only), Seldon, vLLM (LLM-only).

## Further Reading
- Official docs: <https://docs.bentoml.com/en/latest/>
- Compound AI services: <https://docs.bentoml.com/en/latest/build-with-bentoml/distributed-services.html>
- Yatai (K8s deployment): <https://github.com/bentoml/Yatai>
- BentoCloud: <https://www.bentoml.com/cloud>
