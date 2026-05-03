---
title: "HashiCorp Vault"
description: "HashiCorp Vault is the de-facto secrets and encryption-as-a-service platform — dynamic credentials, transit encryption, identity-based auth, PKI as a service, and a HSM-grade audit trail."
---

> Category: Secrets Management / Identity-aware Encryption · Written in: Go · License: BUSL 1.1 (since 2023; OpenBao is the OSS fork)

## TL;DR
HashiCorp Vault centralizes **secrets management**, **dynamic credential generation**, **encryption-as-a-service**, and **PKI** behind a single API with rich identity-based authorization. Apps authenticate to Vault using their workload identity (Kubernetes SA, AWS IAM, JWT, AppRole), receive **short-lived credentials** for downstream systems (DB passwords, AWS keys, certs) that Vault generates on demand, and Vault rotates / revokes everything. The 2023 license change to BUSL spawned the **OpenBao** OSS fork (Linux Foundation) with a near-identical feature set. Reach for Vault when you need a single source of truth for secrets across multi-cloud / multi-platform environments with a strong audit and rotation story.

## What problem does it solve?
- **Hard-coded secrets in code / config** — Vault gives apps a way to fetch secrets at runtime from a single source.
- **Long-lived static credentials** rotting in places you've forgotten — Vault generates **dynamic, short-lived** creds (15 minutes to 24 hours) for databases, cloud, SSH, certs.
- **Cryptographic operations** without giving apps direct access to keys — `transit` engine encrypts/decrypts on the app's behalf using FIPS-grade keys.
- **Audit trail** of every secret access — required for compliance (SOC2, PCI, HIPAA, FedRAMP).
- **Identity-aware authorization** — policy granted by who you are (workload identity), not by a static API key in env vars.

## When to use
- **Multi-cloud** secrets management — same Vault tier across AWS / GCP / Azure / on-prem.
- **Dynamic database credentials** — every app instance gets its own short-lived DB user.
- **PKI / certificate authority** — internal CA issuing short-lived certs (mTLS, code signing).
- **Encryption-as-a-service** — `transit` engine for app-level encryption without giving apps the keys.
- **Compliance** with strict audit requirements.
- **Kubernetes secrets** with rotation, projection, and identity-based access (Vault Agent + CSI provider).

## When NOT to use
- **Trivial secrets needs** in a single cloud — AWS Secrets Manager / Parameter Store / GCP Secret Manager / Azure Key Vault are simpler.
- **No platform team** to operate Vault HA — running Vault is non-trivial; consider HCP Vault (managed) or cloud-native services.
- **You can't tolerate the 2023 license change** — use **OpenBao**, the LF-hosted fork.
- **Sub-millisecond secret lookups in hot paths** — use Vault Agent caching or short-lived in-process cache.

## Architecture
- **Storage backend** — Integrated Storage (Raft, recommended), Consul (legacy), filesystem (dev only). Holds encrypted state.
- **Encryption barrier** — Vault encrypts everything written to storage with the **master key**, derived from the **unseal keys** (Shamir's Secret Sharing or auto-unseal with KMS).
- **Auto-unseal** — KMS-managed unseal (AWS KMS, GCP KMS, Azure Key Vault, HSM) so Vault unseals without manual key shares.
- **HA** — multiple Vault nodes; one active, others standby; Raft for leader election + replication.
- **Performance / DR replicas** — Enterprise feature for cross-region read replicas + DR.
- **Engines** — pluggable backends:
  - **kv** (v1/v2) — static secret store.
  - **database** — dynamic DB creds (Postgres, MySQL, Mongo, MSSQL, Cassandra, …).
  - **aws / gcp / azure** — dynamic cloud creds.
  - **pki** — internal CA.
  - **transit** — encrypt/decrypt + key rotation.
  - **ssh** — SSH OTP / signed cert auth.
- **Auth methods** — Kubernetes SA, AWS IAM, JWT/OIDC, AppRole, LDAP, GitHub, Token.

```bash
# Enable a database secrets engine (Postgres) and rotate static creds dynamically
vault secrets enable database
vault write database/config/postgres-app \
    plugin_name=postgresql-database-plugin \
    allowed_roles="readonly,readwrite" \
    connection_url="postgresql://{{username}}:{{password}}@db.internal:5432/app" \
    username="vault-admin" password="..."

vault write database/roles/readonly \
    db_name=postgres-app \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; \
                         GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
    default_ttl="1h" max_ttl="24h"

# App requests a short-lived DB credential
vault read database/creds/readonly
# Key                Value
# lease_id           database/creds/readonly/abc...
# username           v-token-readonly-xyz
# password           A1b2C3...   (valid for 1 hour)
```

```hcl
# Policy: app can only read its own KV path + use transit for its tenant key
path "kv/data/app/checkout/*" { capabilities = ["read"] }
path "transit/encrypt/checkout-tenant-{{identity.entity.aliases.auth_kubernetes_xyz.metadata.tenant}}" {
  capabilities = ["update"]
}
```

## Authentication & Identity
- **Auth method** authenticates the caller; produces a **token** (or wraps existing credential) bound to a **policy set**.
- **Policies** are HCL ACLs scoping `path` + `capabilities` (`read`, `create`, `update`, `delete`, `list`, `sudo`).
- **Identity entities** unify a user across auth methods; entity aliases bind to a specific auth.
- **Templated policies** — substitute identity attributes (`{{identity.entity.metadata.tenant}}`) into paths for per-tenant scoping.

## Trade-offs

| Strength | Weakness |
|---|---|
| Dynamic secrets + auto-rotation | License changed to BUSL in 2023 (OpenBao is the OSS fork) |
| Encryption-as-a-service via `transit` | Operating HA Vault correctly is non-trivial |
| Rich audit trail | Sealed-state recovery requires unseal keys (Shamir or KMS) |
| Plugin model: many engines + auth methods | Token expiry / lease renewal can confuse beginners |
| Identity-aware templated policies | Performance impact of every secret request |
| Mature ecosystem (CSI driver, Agent, Operator) | Cross-region replication is Enterprise-only (or DR-only OSS) |

## Common HLD Patterns
- **Per-pod database creds:** Kubernetes pod auths via service account → Vault returns 1-hour DB password → pod uses; lease expires; pod re-renews; revoked when pod terminates.
- **mTLS PKI:** Vault PKI engine issues short-lived certs (24 h) to services; sidecar (Vault Agent) auto-renews.
- **Envelope encryption:** App calls `transit/encrypt` with plaintext + key name; Vault returns ciphertext; key rotation in Vault doesn't require app changes.
- **Cross-cloud secrets:** single Vault tier issues AWS / GCP / Azure creds based on workload identity.
- **CI/CD secrets:** GitHub Actions / GitLab CI authenticates with OIDC token → Vault returns deployment creds for a single job.
- **GitOps for policies:** Terraform Vault Provider manages auth methods, roles, policies as code.

## Common Pitfalls / Gotchas
- **Lease management** — apps must renew leases before expiry or the credential is revoked; long-running pods need a sidecar (Vault Agent).
- **Sealed-state outages** — restart without auto-unseal means manual unseal with Shamir keys; use auto-unseal in production.
- **Audit log not enabled** — easy to forget; without audit log, no compliance value.
- **Token TTL too short** — apps spend more time renewing than working; tune.
- **Storage backend choice** — file backend is dev-only; switch to Integrated Storage (Raft).
- **Secrets in environment variables** — even with Vault, dumping secrets into env vars can leak via crash dumps; use file mounts via Vault Agent / CSI.
- **Performance Standby reads (Enterprise)** — only Enterprise allows non-leader reads; OSS routes to leader.
- **License audit in production** — using Vault Enterprise without a license is a real exposure.

## Interview Cheat Sheet
- **Tagline:** Identity-aware secrets manager + encryption-as-a-service with dynamic credentials, PKI, audit, and a vast plugin ecosystem.
- **Best at:** dynamic DB / cloud creds, internal PKI, transit encryption for app-level data, multi-cloud secrets, audit-first compliance.
- **Worst at:** trivial single-cloud secrets (Secrets Manager simpler), low-ops shops, hot-path lookups (cache via Vault Agent).
- **Scale:** thousands of secrets per cluster; HA with 3-5 node Raft; Enterprise scales to millions of leases per region.
- **Distributes how:** Raft (Integrated Storage); active leader, standby followers; performance / DR replicas (Enterprise) for cross-region.
- **Consistency / state:** strongly consistent via Raft; secrets stored encrypted on storage backend; sealed at rest until unsealed.
- **Killer alternative:** OpenBao (OSS fork), AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, Doppler, Infisical, AWS Parameter Store.

## Further Reading
- Official docs: <https://developer.hashicorp.com/vault/docs>
- Architecture: <https://developer.hashicorp.com/vault/docs/internals/architecture>
- Auto-unseal: <https://developer.hashicorp.com/vault/docs/concepts/seal>
- OpenBao (OSS fork): <https://openbao.org/>
