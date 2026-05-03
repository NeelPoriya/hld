---
title: "Encryption: At Rest, In Transit, End-to-End"
description: "The three places data gets encrypted, the keys that protect it, envelope encryption, KMS / HSMs, key rotation, and why 'encryption at rest' alone is the bare minimum (not the gold standard)."
---

> Topic: Key Concept · Category: Security & Auth · Difficulty: Foundational

## TL;DR
Data is encrypted in three contexts:
- **At rest** — on disk; protects stolen disks / databases. AWS KMS-encrypted EBS / S3, encrypted Postgres tablespaces, transparent disk encryption (LUKS / FileVault / BitLocker). **Necessary but rarely sufficient.**
- **In transit** — moving between systems; protects passive eavesdropping + active MITM. TLS 1.2+ everywhere, mTLS for service-to-service.
- **End-to-end (E2E)** — only sender + recipient can decrypt; the server / cloud provider can't. WhatsApp, Signal, iMessage, password managers, secrets in client-side encrypted storage.

The hard work is **key management** — generating, storing, rotating, revoking, and auditing keys. Real systems use **envelope encryption** (encrypt data with a per-record DEK; encrypt the DEK with a master KEK in a HSM / KMS) so you can rotate easily and audit access.

## What problem does each solve?

### At rest
- **Disk theft / lost laptop / decommissioned drive** — data is unreadable.
- **Backup tapes / snapshots leaking** — encrypted backups stay safe.
- **Insider with raw filesystem access** — needs the key, not just the file.
- **Compliance** (HIPAA, PCI-DSS, GDPR) often mandates encryption at rest.

### In transit
- **Eavesdropping** on shared networks (Wi-Fi, ISP, malicious peer in datacenter).
- **MITM (man-in-the-middle)** — TLS certificate validation prevents.
- **Service-to-service auth** — mTLS confirms peer identity in zero-trust networks.

### End-to-end (E2E)
- **Server compromise** — even the server operator can't read your messages.
- **Subpoena / lawful access** — provider cannot reveal what they don't have.
- **Insider threats** — DBA / SREs can't read user data.
- **Privacy by default** — Signal, WhatsApp, iMessage standard.

## How they work

### At rest
- **Disk-level (transparent encryption):** AES-XTS for full-disk; OS / cloud provider manages keys.
  - LUKS (Linux), FileVault (macOS), BitLocker (Windows).
  - AWS EBS / RDS / S3 server-side encryption, GCP CMEK, Azure SSE.
- **Database-level:** TDE (Transparent Data Encryption) in Oracle, SQL Server, MySQL Enterprise, Postgres + extensions.
- **Field-level / application-level:** encrypt sensitive columns (`SSN`, `email`) before write; decrypt on read. Pair with KMS / HSM.
- **Object storage:** S3 SSE-KMS (with KMS-managed keys), SSE-C (customer-provided), SSE-S3 (Amazon-managed).

### In transit (TLS)
- **Client-server TLS handshake** — exchange cipher suites, validate server cert, negotiate session key.
- **TLS 1.3** is the modern default — fewer round-trips, better forward secrecy, removed legacy crypto.
- **mTLS** — server also validates client cert. Used in service mesh (Istio, Linkerd auto-mTLS).
- **TLS termination at edge** + plaintext or re-encrypted internally — choose based on threat model.
- **HSTS** + `Strict-Transport-Security` header forces HTTPS in browsers.

### End-to-end (E2E)
- **Per-message symmetric key** encrypted with recipient's public key (asymmetric crypto).
- **Forward secrecy** — Diffie-Hellman exchange per session; compromise of long-term key doesn't reveal past messages.
- **Signal Protocol** (X3DH + Double Ratchet) — used by Signal, WhatsApp, Messenger Secret Conversations, Skype Private.
- **Server only stores ciphertext + metadata.**
- **Verification of recipient identity** is the hard part — safety numbers, key fingerprints, key transparency.

### Envelope encryption (the canonical pattern)
```text
Master Key (KEK) — lives in KMS / HSM, never leaves.
   │
   │  encrypt
   ▼
Data Encryption Key (DEK) — random per object / per record.
   │
   │  encrypt data
   ▼
Ciphertext + Encrypted DEK (stored together).
```

To decrypt: KMS returns plaintext DEK to authorized caller (audited); caller decrypts data; discards DEK.

Benefits:
- **Rotate KEK without re-encrypting all data** — just re-encrypt DEKs.
- **Audit trail** — every "decrypt this DEK" call logged in KMS.
- **Performance** — KMS round-trip only once per object, not per byte.
- **Limit blast radius** — DEK compromise affects one record; KEK is in HSM.

## When to use each (real-world examples)

### At rest
- **Cloud-stored databases / file systems** — default on; cheap.
- **Backups + snapshots** — always encrypt.
- **Compliance-driven workloads** (PCI / HIPAA / SOC 2).
- **Field-level for PII** — credit cards, SSNs, healthcare records.

### In transit
- **Every external API** — HTTPS only.
- **Internal microservices** in zero-trust env — mTLS.
- **Database connections** — TLS to your DB, even within VPC.
- **Service mesh** (Istio, Linkerd) — auto-mTLS.

### E2E
- **Messaging apps** — Signal, WhatsApp, iMessage, Wire, Threema.
- **Password managers** — 1Password, Bitwarden, LastPass (with caveats).
- **Backups** with personal keys — Apple iCloud Advanced Data Protection.
- **Healthcare data** sharing with provider as zero-knowledge custodian.
- **Cryptocurrency wallets** — keys never leave the device.
- **Privacy-focused SaaS** (Proton Mail, Tutanota).

## When NOT to use each

### Don't think E2E is universal
- **Server-side processing required** (search, recommendations, AI features) breaks E2E.
- **Compliance / law enforcement requirements** sometimes prohibit it.
- **Account recovery** — without keys on server, lost device = lost data.

### Don't skip in transit
- **No excuse not to TLS** today — Let's Encrypt is free.

### Don't think encryption at rest = secure
- **App holds the keys + reads the disk** — encryption at rest doesn't help against a compromised app.
- **Mostly a compliance check-box** for cloud-managed encryption with cloud-managed keys.

## Things to consider / Trade-offs

### Key management (the hard part)
- **HSM / KMS:** AWS KMS, GCP Cloud KMS, Azure Key Vault, HashiCorp Vault, on-prem HSMs.
- **Key rotation:** schedule rotation (90 days typical); rotate KEKs without touching data thanks to envelope.
- **Customer-Managed Keys (CMK)** vs cloud-managed keys — CMK gives you ownership; cloud-managed is simpler.
- **Cross-region key replication** — KMS keys in single region; multi-region keys are paid feature.
- **Key access policies** — who can `Encrypt` vs `Decrypt`; separate from object permissions.
- **Audit logs** — every key operation must be logged + alerted.
- **Key destruction** — for data destruction (crypto-shredding); destroying KEK destroys access to all DEK-encrypted records.

### Performance
- **AES-NI / hardware acceleration** makes symmetric encryption near-free.
- **TLS handshake** is ~1-5 RTTs; session resumption mitigates.
- **mTLS overhead** — ~1ms additional handshake; cert rotation logistics.
- **KMS calls per request** — cache plaintext DEKs in app memory with TTL.

### Compliance
- **PCI-DSS** — encryption of cardholder data at rest + in transit; BYOK.
- **HIPAA** — required for ePHI; explicit guidance.
- **GDPR** — encryption is "appropriate measure"; combined with right-to-be-forgotten = crypto-shredding.
- **FedRAMP / FIPS 140-2/3** — specific HSM requirements.

### Forward secrecy
- **TLS 1.3 mandates ECDHE** — past sessions safe even if long-term key leaked later.
- **Signal's Double Ratchet** — forward + backward secrecy on every message.

## Common pitfalls
- **"Encrypted at rest"** — but cloud provider has the key. Compliance checkbox; not real isolation.
- **Reusing IV / nonce** in AES-GCM — catastrophic; key-IV pairs leak plaintext.
- **Hardcoded keys in source code** — leaked via git.
- **Not rotating keys** — rotation surfaces operational issues; do it routinely.
- **No alerting on KMS denied calls** — attackers probe.
- **Storing encrypted DEK and plaintext DEK in the same place** — defeats the purpose.
- **TLS without certificate validation** — `rejectUnauthorized: false` in Node = MITM vulnerable.
- **`alg: none` JWT** mistakenly accepted (not encryption per se but related).
- **Ignoring expired certs** — alert before they expire; auto-renew with cert-manager / Let's Encrypt.
- **mTLS without good certificate distribution** — manual cert handouts age badly.
- **E2E with no recovery story** — users lose phones; data unrecoverable.
- **Encryption at rest + plaintext logs** — sensitive data leaks via logs.
- **Encryption in transit but plaintext in queues** — Kafka / SQS messages may be plaintext at rest.
- **Backup encryption keys lost** — backups become unreadable.
- **Single KEK for all data** — rotation/blast radius hard.

## Interview Cheat Sheet
- **Three layers:** at rest (disk), in transit (TLS), end-to-end (only endpoints can decrypt).
- **Envelope encryption** — DEK per record + KEK in KMS/HSM. Standard pattern.
- **Key management is the hard part** — rotation, audit, recovery, blast radius.
- **TLS 1.3** is the modern minimum; **mTLS** for service-to-service.
- **E2E** = server can't decrypt; comes at cost of recovery + server-side features.
- **Crypto-shredding** = destroy KEK to "delete" data; supports GDPR.
- **Use AES-GCM with unique IV** for symmetric; never reuse nonce.
- **Forward secrecy** built into TLS 1.3 ECDHE.
- **Killer phrase:** "Encrypt everything; rotate every key; audit every decrypt; never let a single KEK protect everything."

## Related concepts
- [Authentication](/docs/55-security-and-auth/authentication-oauth-oidc-saml-jwt) — proves who can ask for decryption.
- [TLS / mTLS](/docs/56-network-protocols-and-realtime/tls-and-mtls) — in-transit encryption details.
- [RBAC / ABAC](/docs/55-security-and-auth/rbac-vs-abac) — who can access decrypted data.
- Concrete: [Vault](/docs/23-secrets-and-identity/vault), AWS KMS, GCP Cloud KMS, Azure Key Vault, HSMs (Thales, YubiHSM, AWS CloudHSM), Signal Protocol.
