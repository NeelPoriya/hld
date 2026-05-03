---
title: "TLS Handshake & mTLS"
description: "What TLS actually does on the wire — handshake (TLS 1.2 vs 1.3), session resumption, certificate validation, and mutual TLS for service-to-service zero-trust auth. The latency cost of each round trip and how 0-RTT works."
---

> Topic: Key Concept · Category: Network Protocols & Real-time · Difficulty: Intermediate

## TL;DR
**TLS** (Transport Layer Security) gives you **encrypted, authenticated, integrity-protected** communication. The handshake exchanges a session key; data after handshake is symmetrically encrypted. Modern **TLS 1.3** is the floor — 1 RTT handshake (or 0-RTT for resumed sessions), forward secrecy by default, removed legacy crypto. **mTLS (mutual TLS)** is TLS where **both sides** present certificates — used in zero-trust service meshes, machine-to-machine APIs, and high-security environments. mTLS is the auth mechanism behind **Istio / Linkerd / SPIFFE / SPIRE / AWS IAM Roles Anywhere**.

The interview-critical details: **how many RTTs a handshake costs**, **why 0-RTT has replay risks**, **how forward secrecy works**, **what makes mTLS different operationally** (cert distribution + rotation).

## What problem does it solve?

### TLS
- **Confidentiality** — eavesdroppers can't read.
- **Integrity** — tampered traffic is detected.
- **Authentication** — client knows it's talking to the right server (cert validation).
- **Replay protection** — sequence numbers and nonces.
- **Foundation of HTTPS, mTLS, gRPC over TLS, mail (SMTP/IMAP STARTTLS), DB connections (Postgres, MySQL, Redis with TLS).**

### mTLS
- **Server authenticates client** (in addition to the usual reverse).
- **Eliminates shared secrets / API keys** — cert IS the credential.
- **Zero-trust networking** — no implicit network trust; every connection authenticated.
- **Service identity** in microservices.
- **Compliance** for regulated industries.

## How TLS works

### TLS 1.3 handshake (1 RTT)

```text
Client                                Server
  │   ClientHello                       │
  │   {cipher_suites, key_share, ...}   │
  │   ──────────────────►               │
  │                                     │
  │   ◄──────────────────               │
  │   ServerHello                        │
  │   {selected_cipher, key_share}       │
  │   {EncryptedExtensions}              │
  │   {Certificate, CertVerify}          │
  │   {Finished}                         │
  │                                     │
  │   {Finished}                         │
  │   ──────────────────►                │
  │                                     │
  │   ════ application data ════►        │
```

**1 RTT total before app data** — a major improvement over TLS 1.2's 2 RTTs.

### TLS 1.3 0-RTT resumption

```text
Client (with PSK from previous session)
  │   ClientHello + early_data           │
  │   {ticket, encrypted app data!}      │
  │   ──────────────────►                │
  │   ════ first app data sent on first packet ════►
```

**0 RTT to first byte** — the request is sent on the very first packet using a Pre-Shared Key (PSK) from the previous session. **Caveat: replay attack risk** — only safe for idempotent requests (GET, etc.).

### Certificate validation
1. Server presents certificate chain.
2. Client validates:
   - Signature chain back to a trusted root CA.
   - Cert subject matches the hostname (`Subject Alternative Name`).
   - Cert is within validity period.
   - Cert is not revoked (CRL or OCSP).
3. Optional: Certificate Transparency check (browsers do this).

### Forward secrecy
- TLS 1.3 mandates **ECDHE (Elliptic-Curve Diffie-Hellman Ephemeral)** for key exchange.
- A new session key is derived per connection from ephemeral keys.
- **Compromise of long-term cert key** doesn't reveal past session keys.

### Session resumption
- **Tickets:** server gives client an encrypted ticket; client sends it on next connect; server decrypts (only it has the key) and resumes.
- **PSK (Pre-Shared Key):** TLS 1.3 generalization; enables 0-RTT.

## How mTLS works

```text
Client                                Server
  │   ClientHello                        │
  │   ──────────────────►                │
  │                                      │
  │   ◄──────────────────                │
  │   ServerHello + Cert + CertReq       │
  │   (server requests client cert)      │
  │                                      │
  │   ClientCert + CertVerify + Finished │
  │   ──────────────────►                │
  │                                      │
  │   ════ app data ════►                │
```

Both sides present and validate certs. Server typically uses the **client cert's identity** for authorization (e.g., SPIFFE ID like `spiffe://prod/api-service`).

## When to use TLS / mTLS (real-world examples)

### TLS (always-on)
- **Every HTTPS website.**
- **API endpoints** — internal + external.
- **Database connections** — even in private VPC, defense in depth.
- **Email** — SMTP / IMAP STARTTLS.
- **VPN tunnels** (OpenVPN, WireGuard uses different crypto but similar role).
- **MQTT, AMQP, gRPC, Redis, Kafka brokers.**

### mTLS
- **Service-to-service in microservices** — Istio / Linkerd / Consul Connect auto-mTLS.
- **Zero-trust networks** — Google BeyondCorp, Cloudflare Zero Trust.
- **High-value APIs** — banking, regulated industries.
- **IoT device authentication** — each device has a cert.
- **Federated services** — Banking via Open Banking.
- **AWS IAM Roles Anywhere** — workloads outside AWS authenticate via mTLS to AWS APIs.
- **Kubernetes** — kubelet ↔ API server uses mTLS.
- **gRPC channel auth** — common pattern.

## Things to consider / Trade-offs

### TLS
- **Latency cost:**
  - First connection: 1 RTT (TLS 1.3) + 1 RTT TCP = 2 RTTs total. ~50-150ms cross-region.
  - Resumed: 1 RTT (or 0 RTT for safe idempotent ops).
  - QUIC / HTTP/3 folds TLS handshake into transport — even fewer RTTs.
- **CPU cost** — initial handshake is the expensive part (asymmetric crypto); subsequent encryption is AES-NI (near-free).
- **Cipher suite selection** — TLS 1.3 limits to a few sane defaults (no more BEAST / POODLE / Heartbleed-prone choices).
- **Certificate management** — let's encrypt + cert-manager makes free and automated for public; internal CAs for private.
- **OCSP stapling** — server attaches signed "this cert is still valid" to handshake; saves CRL/OCSP roundtrip.
- **HSTS** — `Strict-Transport-Security` header forces HTTPS in browsers.
- **Cipher / curve agility** — be ready to disable algorithms when broken (3DES, RC4, SHA-1).

### mTLS
- **Cert distribution to clients** — the operational challenge. Solutions:
  - **SPIFFE / SPIRE** — workload identity issuance.
  - **Service mesh sidecars** (Envoy / linkerd-proxy) auto-issue + rotate.
  - **AWS IAM Roles Anywhere** — IAM-issued certs to non-AWS workloads.
- **Cert rotation** — TLS certs typically days-to-weeks; auto-rotate via cert-manager / SPIRE.
- **Revocation** — short-lived certs are simpler than CRL/OCSP.
- **Trust store distribution** — clients need root CA; rotation matters.
- **Performance overhead** — minimal (one extra cert + verify per connection).
- **Identity assertion** — services use peer cert subject / SAN to authorize (SPIFFE IDs are the standard).
- **Layer integration** — service mesh handles TLS transparently; bypassed if you skip the sidecar.

### General
- **0-RTT replay risks** — only enable for idempotent requests; don't for state-changing POSTs.
- **Pinning** — public-key pinning (HPKP) is mostly deprecated; cert pinning still used in mobile apps for high security.
- **Long-lived connections** — TLS rekey on session timeout; gRPC streams handle internally.
- **TLS 1.0 / 1.1 / SSLv3** — deprecated; disable everywhere; PCI compliance requires.
- **Client / server compat** — stick to TLS 1.2 minimum; offer TLS 1.3 preferred.

## Common pitfalls
- **Disabling cert validation** in dev → leaving it disabled in prod (`rejectUnauthorized: false` in Node).
- **Self-signed certs in prod** without proper trust store distribution.
- **Wildcard certs** for many services — single cert compromise affects all.
- **Cert expiry** — most outages start with "we forgot to rotate the cert"; alert on expiry.
- **No HSTS** — first-request downgrade attacks.
- **Mixed content** — HTTPS page loading HTTP resources fails or warns.
- **0-RTT for non-idempotent operations** — replay attacks.
- **HSM / KMS-stored cert keys lost** — irrecoverable.
- **No revocation strategy** — short-lived certs (1-90 days) avoid CRL/OCSP entirely.
- **mTLS with shared cert across services** — no real identity isolation.
- **Using mTLS as the only auth** — paired with RBAC / authorization; cert says "who," not "what they can do."
- **Cipher suite typos** — accidentally allow weak ciphers.
- **Trusting `X-Forwarded-Proto`** without LB chain config — clients can spoof "https."
- **TLS 1.3 0-RTT enabled by default** for safety-critical APIs without thinking — replay risk.
- **No alerting on cert expiry warnings.**

## Interview Cheat Sheet
- **TLS provides:** confidentiality + integrity + authentication.
- **TLS 1.3:** 1 RTT handshake, 0-RTT resumption, forward secrecy mandatory, weak crypto removed.
- **TLS 1.2 vs 1.3:** 1.2 is 2-RTT; 1.3 is 1-RTT; cipher suites simplified.
- **mTLS:** both sides present certs; service-mesh / zero-trust default.
- **Forward secrecy** = ephemeral keys per session = past sessions safe even if cert leaked.
- **0-RTT** has replay risk — only for idempotent requests.
- **HTTPS only** — disable plaintext HTTP; enable HSTS.
- **Cert rotation** — automate via cert-manager / SPIRE; short-lived avoids CRL/OCSP.
- **Killer phrase:** "TLS 1.3 + ECDHE + auto-rotated short-lived certs + HSTS + OCSP stapling — it's all one well-tuned default now."

## Related concepts
- [Encryption at Rest / In Transit / E2E](/docs/55-security-and-auth/encryption-and-key-management) — companion: at-rest + key mgmt.
- [Authentication: OAuth2, OIDC, JWT](/docs/55-security-and-auth/authentication-oauth-oidc-saml-jwt) — app-layer auth on top.
- [DNS & Anycast](/docs/56-network-protocols-and-realtime/dns-and-anycast) — TLS depends on hostname → IP.
- Concrete: [Service Mesh (Istio / Linkerd)](/docs/22-service-mesh/istio), Let's Encrypt, cert-manager, SPIFFE / SPIRE.
