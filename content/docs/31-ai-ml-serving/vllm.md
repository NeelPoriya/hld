---
title: "vLLM"
description: "vLLM is the high-throughput, memory-efficient inference engine for large language models — PagedAttention + continuous batching + tensor parallelism turn an LLM into a real production-grade API server."
---

> Category: AI / ML Serving · Written in: Python + CUDA / C++ kernels · License: Apache 2.0

## TL;DR
vLLM is the **de-facto open-source LLM inference engine**. Born from UC Berkeley research, it's now the production default for serving open-weight LLMs (Llama, Mistral, Qwen, DeepSeek, …) at scale. Its two big innovations are:
- **PagedAttention** — the KV-cache (the giant tensor that holds attention state for every token in flight) is managed like virtual memory: split into fixed-size *blocks* that are paged in/out and shared across requests with copy-on-write. This eliminates the 2–4× memory waste of naive contiguous KV caches and enables much higher concurrency on the same GPU.
- **Continuous batching** — instead of "static batching" (wait for N requests, run them together, return all when slowest finishes), vLLM continuously injects/evicts requests at every decoding step, so the GPU is never idle waiting for the longest sequence.

It also speaks the **OpenAI-compatible HTTP API**, so client code written for `openai-python` works against your self-hosted vLLM with one base-URL change. Reach for vLLM when you need to **self-host LLMs at production throughput** — RAG backends, internal copilots, agents, on-prem chatbots.

## What problem does it solve?
- **Naive HuggingFace `transformers.generate()` is ~10× slower** than vLLM at the same hardware.
- **KV-cache fragmentation** wastes 60%+ of GPU memory in classic implementations.
- **Static batching** under-utilizes the GPU when sequences have different lengths.
- **Multi-tenant LLM serving** needs prefix caching, LoRA hot-swapping, request preemption — vLLM has them built in.
- **OpenAI lock-in** — vLLM's OpenAI-compatible endpoint lets you swap GPT-4 for Llama-3 with a URL change.

## When to use
- **Self-hosting open LLMs** at >10 req/s with low p99.
- **RAG / agent backends** where prompt prefixes are shared across users (prefix caching is huge).
- **On-prem / air-gapped** LLM deployments (compliance, data residency).
- **Multi-LoRA serving** — many fine-tuned adapters on one base model, hot-swapped per request.
- **GPU cost optimization** — squeeze 2–4× more requests out of the same H100s.
- **Distillation / eval pipelines** running large batches offline.

## When NOT to use
- **CPU-only** machines — vLLM is GPU-first; CPU support exists but is slow.
- **Single-user toy chatbot** — `transformers` or Ollama is simpler.
- **Closed-weight model use** (GPT-4, Claude) — use the vendor API directly.
- **Edge devices / mobile** — too heavy; use llama.cpp / MLX / TensorRT-LLM mobile.
- **Speech / vision-only models** (use Triton, BentoML, TorchServe).
- **Strict <50ms TTFT requirements** — vLLM is good but TensorRT-LLM is faster on NVIDIA at the cost of complexity.

## Core Concepts
- **KV-cache** — per-request, per-layer tensor that grows with each generated token; dominates memory.
- **PagedAttention** — KV-cache is split into 16-token blocks; a per-request block table maps logical positions to physical blocks. Blocks can be shared (prefix caching, beam search) via reference counts.
- **Continuous batching** — at every decode step, the scheduler decides which active requests to batch and which to swap in/out.
- **Prefix caching** — identical prompt prefixes reuse cached blocks across requests; system prompts essentially free after the first request.
- **Speculative decoding** — small draft model proposes N tokens; large model verifies in one forward pass; up to 2–3× speedup.
- **Tensor parallelism (TP)** — split each layer's weights across N GPUs; collective ops every layer; for big models that don't fit on one GPU.
- **Pipeline parallelism (PP)** — split layers across stages; less collective overhead, more latency.
- **Quantization** — AWQ / GPTQ / FP8 / INT4 reduce weight precision; vLLM supports many.
- **LoRA** — Low-Rank Adapters; vLLM hot-loads many adapters per base model.

```bash
# Serve Llama-3.1-8B with OpenAI-compatible API on 1 GPU
vllm serve meta-llama/Meta-Llama-3.1-8B-Instruct \
    --port 8000 \
    --max-model-len 8192 \
    --gpu-memory-utilization 0.92 \
    --enable-prefix-caching \
    --dtype bfloat16

# 70B with 4-way tensor parallelism on 4 H100s
vllm serve meta-llama/Meta-Llama-3.1-70B-Instruct \
    --tensor-parallel-size 4 \
    --max-model-len 32768 \
    --gpu-memory-utilization 0.92 \
    --enable-prefix-caching \
    --quantization fp8
```

```python
# Client — pure OpenAI SDK, just a different base URL
from openai import OpenAI

client = OpenAI(base_url="http://vllm:8000/v1", api_key="not-needed")

resp = client.chat.completions.create(
    model="meta-llama/Meta-Llama-3.1-8B-Instruct",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain PagedAttention in one paragraph."}
    ],
    temperature=0.2,
    max_tokens=512
)
print(resp.choices[0].message.content)
```

```python
# Offline batch inference — direct LLM API
from vllm import LLM, SamplingParams

llm = LLM(model="mistralai/Mistral-7B-Instruct-v0.3", enable_prefix_caching=True)
params = SamplingParams(temperature=0.0, max_tokens=256)
prompts = [f"Summarize: {t}" for t in long_articles]
outs = llm.generate(prompts, params)
for o in outs:
    print(o.outputs[0].text)
```

## Architecture
- **Engine** — `LLMEngine` orchestrates request scheduling + model execution.
- **Scheduler** — at every step, picks which active requests get prefill / decode this iteration; respects max-concurrent + memory budgets.
- **Block manager** — owns the GPU KV-cache as a pool of fixed blocks; tracks free / referenced.
- **Worker** — one per GPU; runs forward pass; in TP mode workers communicate via NCCL.
- **Attention backends** — FlashAttention 2/3, xFormers, Triton kernels for paged attention.
- **OpenAI-compat server** — FastAPI front-end translating chat/completions requests into engine calls.
- **Distributed mode** — `tensor-parallel-size`, `pipeline-parallel-size`, optional Ray for multi-node.

## Trade-offs

| Strength | Weakness |
|---|---|
| Highest open-source LLM throughput today | GPU-only in practice; CPU is a fallback |
| PagedAttention solves KV-cache waste | Operational tuning needed for max throughput |
| Continuous batching uses GPU well | Big context windows still memory-hungry |
| OpenAI-compatible API drops in everywhere | Closed-weight models not supported |
| Multi-LoRA hot-swap | Some kernels NVIDIA-specific (AMD ROCm catching up) |
| Prefix caching = near-free system prompts | Cluster orchestration left to you (K8s, Ray) |
| Speculative decoding built in | Per-request fairness needs careful priority config |
| Active community + fast release cadence | API surface evolves quickly; pin versions |

## Deployment Patterns
- **Single GPU + 7B–13B model** — one pod, vLLM serve, autoscale on RPS.
- **Tensor-parallel 70B / 405B** — multi-GPU node (8× H100); `--tensor-parallel-size 8`.
- **Multi-node** for very large models — vLLM + Ray Serve.
- **Multi-LoRA** — one base model, dozens of fine-tunes hot-swapped per request → cheap fine-tune-as-a-service.
- **Disaggregated prefill / decode** — separate prefill nodes (compute-bound) from decode nodes (memory-bound) using vLLM's `--kv-transfer` modes (newer feature).
- **Speculative decoding** — pair Llama-70B target with Llama-8B draft for cheaper latency.
- **Gateway in front** — Envoy / NGINX / a custom router routes by model, applies auth, rate limits per user.
- **Autoscaler** — horizontal pod autoscaler scales vLLM replicas on `vllm:num_requests_running` + `vllm:gpu_cache_usage_perc` metrics.

## Common HLD Patterns
- **RAG backend:** retrieve embeddings (Pinecone / pgvector) → stuff context into prompt → vLLM completion. Prefix-cache the system + retrieval template.
- **Agent runtime:** vLLM serves the LLM; LangChain / LlamaIndex orchestrates tool calls; high-prefix-cache-hit because system prompts are stable.
- **Internal copilot:** vLLM in VPC, no data leaves; OpenAI-compatible endpoint plugs into existing IDE / app code.
- **Content generation pipeline:** offline batch — `LLM.generate()` over millions of prompts; throughput-optimized config.
- **A/B test new fine-tunes** — many LoRAs on one base model; route by user / experiment id.
- **Cost optimization:** route easy queries to small model (8B), hard queries to big (70B / GPT-4) via a gateway.

## Common Pitfalls / Gotchas
- **`--gpu-memory-utilization` too high** — leaves no margin; OOM under load.
- **`--max-model-len` too high** — every concurrent request reserves KV-cache up to this length; reduces concurrency.
- **Prefix caching off by default in some versions** — explicitly enable.
- **Quantization tradeoffs** — FP8 / INT8 are great; AWQ / GPTQ vary by model.
- **Long input + long output** — KV-cache linear in tokens; budget appropriately.
- **TP must divide attention heads evenly** — 70B has 64 heads → TP 1/2/4/8 OK, not 3.
- **Speculative decoding requires aligned tokenizers** — draft and target models must agree.
- **Per-request fairness** — naive scheduling lets a long generation hog the GPU; tune `max-num-batched-tokens` and request priorities.
- **CUDA / driver / vLLM version skew** — pin a known-good combo; upgrades break occasionally.
- **OpenAI-compat quirks** — function calling / tool use schema differs slightly from OpenAI on some models.
- **Hugging Face downloads** — first run downloads weights (tens of GB); pre-warm the model cache.

## Interview Cheat Sheet
- **Tagline:** Open-source LLM inference engine; PagedAttention + continuous batching + OpenAI-compatible API; production default for self-hosted LLMs.
- **Best at:** high-throughput LLM serving, RAG / agent backends, multi-LoRA fine-tune serving, on-prem deployments.
- **Worst at:** CPU-only, edge / mobile, ultra-low TTFT (TensorRT-LLM is faster), closed-weight models.
- **Scale:** thousands of concurrent requests on 8× H100 for 70B; horizontal scaling via replicas.
- **Distributes how:** tensor-parallel within a node; pipeline-parallel + Ray Serve across nodes; HPA replicas behind a router.
- **Consistency / state:** stateless API; per-request KV-cache; prefix cache shared across requests.
- **Killer alternative:** TensorRT-LLM (NVIDIA, fastest on NVIDIA, complex), TGI (Text Generation Inference, HuggingFace), SGLang (research-grade competitor), Triton + LLM backends, llama.cpp / Ollama (single-user / edge), MLC-LLM, TorchServe.

## Further Reading
- Official docs: <https://docs.vllm.ai/en/latest/>
- PagedAttention paper: <https://arxiv.org/abs/2309.06180>
- Production deployment guide: <https://docs.vllm.ai/en/latest/serving/distributed_serving.html>
- Prefix caching: <https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html>
