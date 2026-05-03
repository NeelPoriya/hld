---
title: "Apache Airflow"
description: "Apache Airflow is the de-facto open-source workflow orchestrator. Define DAGs of tasks in Python, schedule them, monitor them — the canonical batch ETL scheduler."
---

> Category: Workflow Orchestrator / Batch Scheduler · Written in: Python · License: Apache 2.0

## TL;DR
Apache Airflow is the **standard open-source workflow orchestrator** — born at Airbnb, now used by virtually every data team for **batch ETL pipelines**. You define **DAGs (Directed Acyclic Graphs) of tasks in Python**, schedule them with cron-like expressions, and Airflow runs them in dependency order. Reach for Airflow when you need to **orchestrate batch data pipelines** — Spark jobs, dbt runs, ML training, S3 → Snowflake loads, custom Python scripts. Reach for **Temporal** for application-level durable workflows; reach for **Prefect / Dagster** for modern, more developer-friendly alternatives; reach for **Step Functions / Cloud Composer** for managed cloud equivalents.

## What problem does it solve?
You have many interdependent batch jobs:
- "Every night at 2am, pull yesterday's events from S3, run dbt transformations, push to Snowflake, refresh materialized views, send email reports."
- "Every hour, retrain the recommender model if new data is available."
- "Backfill the last 6 months of data when a new column is added."

Without orchestration: cron + bash + brittle scripts that fail silently. Airflow replaces that with:
- **Explicit dependencies** between tasks.
- **Retries, alerting, SLAs** built in.
- **Web UI** showing pipeline status, logs, task durations.
- **Backfilling** — re-run a DAG for past dates programmatically.
- **Operators** for hundreds of integrations (S3, GCS, Spark, Snowflake, BigQuery, Postgres, …).

## When to use
- **Batch ETL pipelines** — daily/hourly scheduled data workflows.
- **dbt orchestration** — schedule `dbt run` + tests + downstream actions.
- **ML training pipelines** — feature build → train → eval → register.
- **Cross-system orchestration** — coordinate jobs across Spark, Snowflake, Databricks, custom scripts.
- **Data engineering teams** that already write Python.

## When NOT to use
- **Application-level durable workflows** (sagas, long-running business processes) — Temporal / Cadence are far better.
- **Sub-second / streaming workloads** — Airflow is batch; latency floor is seconds even for simple DAGs.
- **Real-time event-driven workflows** — Argo Workflows / Step Functions / Temporal handle event triggers better.
- **Simple cron job** — overkill if you have one task.
- **You don't have Python expertise** — DAG-as-Python is the entry barrier.

## Data Model
- **DAG** — a Python module that defines a graph of tasks and a schedule.
- **Task** — a unit of work (an instance of an `Operator`).
- **Operator** — a class that defines what kind of work runs (BashOperator, PythonOperator, SparkSubmitOperator, KubernetesPodOperator, …).
- **Task Instance** — a specific run of a task on a specific date.
- **DAG Run** — a specific run of an entire DAG on a specific date.
- **XCom** — small key-value passed between tasks (use sparingly; it's not for big data).

```python
from airflow import DAG
from airflow.providers.snowflake.operators.snowflake import SnowflakeOperator
from airflow.providers.amazon.aws.transfers.s3_to_snowflake import S3ToSnowflakeOperator
from datetime import datetime, timedelta

with DAG(
    dag_id="daily_events_etl",
    start_date=datetime(2026, 1, 1),
    schedule="0 2 * * *",   # 2am daily
    catchup=False,
    default_args={"retries": 3, "retry_delay": timedelta(minutes=10)},
) as dag:

    load = S3ToSnowflakeOperator(
        task_id="load_events",
        s3_keys=["events/{{ ds }}/*.parquet"],
        table="raw.events",
        schema="lake",
        stage="raw_stage",
    )

    transform = SnowflakeOperator(
        task_id="transform",
        sql="CALL analytics.refresh_daily_aggregates('{{ ds }}')",
    )

    load >> transform
```

## Architecture & Internals
Several long-running services:
- **Webserver** — Flask UI for DAG status, logs, manual triggers.
- **Scheduler** — parses DAG files, schedules tasks based on schedule + dependencies, hands off to executor.
- **Executor** — runs tasks; choices include:
  - **LocalExecutor** — same machine, multiprocess.
  - **CeleryExecutor** — workers on remote machines, Redis/RabbitMQ as broker.
  - **KubernetesExecutor** — each task as a Kubernetes pod.
  - **CeleryKubernetesExecutor** — hybrid.
- **Metadata DB** — Postgres / MySQL — DAGs, runs, task state, XCom, connections, variables.
- **Workers** — execute task code (Celery / Kubernetes pods).

```
DAG file (Python) → Scheduler → metadata DB → Executor → Workers
                                      ↑
                                  Webserver UI
```

## Consistency Model
- Task state is in the metadata DB; transactions ensure no double-running.
- **Idempotent tasks** are your responsibility — Airflow may retry; design your code to be safe.
- DAGs run on a **schedule + execution date** model; the same `(dag_id, execution_date)` is unique.

## Replication
- Airflow itself doesn't replicate; HA is achieved by:
  - Running multiple **schedulers** (HA scheduler since Airflow 2.0).
  - Running multiple **webservers** behind a load balancer.
  - **Metadata DB** = standard Postgres / MySQL HA.
  - **Workers** scale horizontally.
- **Cross-region** = run multiple Airflow deployments per region.

## Partitioning / Sharding
- Not really partitioning, but you scale via:
  - **Pools** — limit concurrency per resource (e.g. only 5 concurrent Snowflake queries).
  - **Worker concurrency** — number of tasks each worker can run.
  - **DAG concurrency** + **task concurrency** — global and per-DAG limits.
- Sharding the metadata DB is uncommon; it's typically a single Postgres.

## Scale
- **Tens of thousands of DAGs** in a single deployment is achievable with tuning.
- **Tens of thousands of tasks per minute** with Celery/Kubernetes executor on a beefy cluster.
- **Scheduler** is historically a bottleneck — Airflow 2.x dramatically improved it; multiple HA schedulers help.
- **Database** can be a bottleneck — keep XCom small, prune old runs.

## Performance Characteristics
- **DAG parse time** matters — DAG files re-parsed every few seconds; complex Python at module load time slows the scheduler.
- **Task scheduling latency** — typically sub-second to few seconds in Airflow 2.x.
- **Bottlenecks:** scheduler CPU on large DAG counts, metadata DB write throughput, executor saturation.

## Trade-offs

| Strength | Weakness |
|---|---|
| Mature, huge ecosystem of operators / providers | Scheduler-heavy; not for streaming |
| Python DAGs — flexible | DAG-as-code is also a footgun (dynamic DAGs are messy) |
| Web UI, alerts, retries, SLAs out of the box | Operational complexity (DB, scheduler, workers, webserver) |
| Backfilling for historical recomputation | XCom anti-pattern for large data |
| Battle-tested at scale (Airbnb, Lyft, Uber, Twitter) | Schedule semantics confusing (logical date vs run date, catchup) |
| Active community + cloud managed (MWAA, Composer, Astronomer) | Not for app-level workflows (use Temporal) |

## Common HLD Patterns
- **Daily ETL:** S3 → Spark transforms → S3 → Snowflake → dbt → BI dashboards.
- **CDC + warehousing:** Debezium → Kafka → S3 → Airflow daily merge into Snowflake.
- **ML training pipeline:** feature build → train → evaluate → if better, register and deploy.
- **Cross-cloud orchestration:** AWS S3 → on-prem Spark → GCP BigQuery, all driven by one DAG.
- **Data quality gates:** main pipeline → Great Expectations / dbt tests as Airflow tasks → block downstream if fails.

## Common Pitfalls / Gotchas
- **Heavy code at module top-level** of DAG files — Airflow re-imports DAG files frequently; keep top-level fast.
- **XCom abuse** — passing big DataFrames via XCom; use S3 / external storage instead.
- **`catchup=True` by default in old Airflow** — set explicit `catchup=False` unless you want backfill on first deploy.
- **Confusing execution date semantics** — `ds` is the *start* of the interval, run happens at the end; lots of teams have learned this the hard way.
- **Scheduler bottleneck** — old Airflow 1.x; modern Airflow 2.x with HA scheduler resolves most.
- **Executor mismatch** — using LocalExecutor in production = guaranteed regret.
- **Connection / Variable secrets in plaintext** — use Secrets Backend (AWS Secrets Manager, HashiCorp Vault).
- **Long-running tasks blocking workers** — split into smaller tasks or use sensors with `mode='reschedule'`.

## Interview Cheat Sheet
- **Tagline:** Open-source batch workflow orchestrator — Python DAGs, scheduler, web UI, huge operator ecosystem.
- **Best at:** scheduled batch ETL, ML pipelines, cross-system orchestration.
- **Worst at:** real-time, streaming, app-level long-running workflows, sub-second latency.
- **Scale:** tens of thousands of DAGs / tasks per minute with proper executor and DB tuning.
- **Shard by:** pools (per-resource concurrency caps), DAG concurrency, executor scaling.
- **Consistency:** task state in metadata DB; idempotency is the user's responsibility.
- **Replicates how:** doesn't itself; relies on Postgres HA, multiple schedulers/webservers, executor scaling.
- **Killer alternative:** Temporal (app workflows), Prefect / Dagster (modern Python orchestration), AWS Step Functions / GCP Workflows, Argo Workflows (Kubernetes-native), MWAA / Composer / Astronomer (managed Airflow).

## Further Reading
- Official docs: <https://airflow.apache.org/docs/apache-airflow/stable/>
- Best practices: <https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html>
- Concepts: DAGs, tasks, scheduling: <https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/index.html>
- Airflow vs Prefect vs Dagster: <https://www.astronomer.io/blog/airflow-prefect-dagster-comparison/>
