---
title: "Authentication: OAuth2, OIDC, SAML, JWT"
description: "How users / services prove who they are — sessions vs tokens, OAuth2 flows (auth code + PKCE, client credentials), OIDC on top of OAuth2, SAML for enterprise SSO, JWT structure / signing / pitfalls."
---

> Topic: Key Concept · Category: Security & Auth · Difficulty: Foundational

## TL;DR
Authentication answers **"who is this?"** Five major mechanisms in modern systems:
- **Session cookies** — server stores session state; cookie holds opaque ID. Old, simple, still ubiquitous.
- **JWT (JSON Web Tokens)** — self-contained signed claims; stateless verification. Hot in microservices.
- **OAuth2** — *authorization* framework (delegation). "Let app X access my data on service Y." Flows: Authorization Code + PKCE (web/mobile), Client Credentials (service-to-service), Device Code (TVs / CLIs).
- **OpenID Connect (OIDC)** — *authentication* layer on top of OAuth2; adds the `id_token` (JWT with user identity claims). Modern web/mobile login standard.
- **SAML 2.0** — XML-based enterprise SSO. Workforce auth (Okta, Azure AD, Ping). Older but entrenched.

The deepest truth: **OAuth2 is for authorization, OIDC is for authentication, JWT is just the token format, sessions are just the storage strategy.** Mixing the terms is the most common interview confusion.

## What problem does each solve?

### Session cookies
- **State on server** — server is source of truth; revocation is trivial (delete session row).
- **Battle-tested** — every web framework supports it.
- **Auth state revocation** — instant.
- **Bad for stateless service fleets** — needs sticky sessions or shared session store (Redis).

### JWT
- **Stateless verification** — any service can verify with the public key.
- **Microservice-friendly** — pass the same JWT through service-to-service calls.
- **No DB lookup per request** — verification is signature check.
- **Bad for instant revocation** — token is valid until expiry; need a revocation list / short TTL + refresh.

### OAuth2 (authorization)
- **Third-party app accessing user data** — "Sign in with Google" letting GitHub Actions push to your repo.
- **Delegated access** — user grants scopes to apps.
- **Service-to-service** with `client_credentials` flow.
- **Token issuance + refresh** model.

### OIDC (authentication on top of OAuth2)
- **"Who is this user?"** answered with `id_token` (JWT).
- **Standardizes the user-info endpoint** + scopes (`openid email profile`).
- **De-facto modern auth** for web + mobile + SPA.

### SAML 2.0
- **Enterprise SSO** — corporate identity → SaaS apps.
- **XML-based assertions** + signed via XML-DSIG.
- **Push (IdP-initiated)** + **Pull (SP-initiated)** flows.
- **Used by Okta, Azure AD / Entra ID, Ping, ADFS, AWS IAM Identity Center.**

## How they work

### Session cookie
```text
1. POST /login (creds)
2. Server: validate, create session row { id, user_id, expires }
3. Response sets cookie: Set-Cookie: session=opaque_id; HttpOnly; Secure; SameSite=Lax
4. Subsequent requests carry cookie; server looks up session, attaches user.
5. Logout: delete row.
```

### OAuth2 Authorization Code + PKCE (modern public client flow)

```text
Client (mobile / SPA)        Auth Server (e.g., Auth0)         Resource Server (API)
        │                            │                                  │
        │  1. Generate code_verifier (random) and code_challenge = SHA256(code_verifier)
        │                            │                                  │
        │   2. /authorize?response_type=code&...&code_challenge=...      │
        │   →  redirects user to Auth Server                             │
        │                            │                                  │
        │   3. User logs in; Auth Server redirects back with             │
        │   ?code=...                                                    │
        │                            │                                  │
        │   4. POST /token { code, code_verifier }                       │
        │   →  Auth Server verifies challenge; issues access_token +     │
        │       refresh_token + id_token (if OIDC)                       │
        │                            │                                  │
        │   5. GET /api with Authorization: Bearer <access_token>        │
        │   →  Resource Server validates JWT signature; checks scope     │
```

### OAuth2 Client Credentials (service-to-service)
```text
Service A     Auth Server
   │              │
   │  POST /token (grant_type=client_credentials, client_id, client_secret)
   │  ←  access_token (JWT)
   │              │
   │  Service A → Service B  (Authorization: Bearer <access_token>)
   │              Service B verifies signature.
```

### OIDC `id_token` (JWT structure)
```text
header.payload.signature

header  (Base64url): { "alg": "RS256", "kid": "key_2026_01" }
payload (Base64url): {
  "iss": "https://auth.acme.com",
  "sub": "u_42",
  "aud": "client_abc",
  "iat": 1735000000,
  "exp": 1735003600,
  "email": "alice@acme.com",
  "name": "Alice"
}
signature: RSA-SHA256(header.payload, private_key)
```

### SAML
```text
1. User → SP (the SaaS app, e.g., Slack): "log in"
2. SP → IdP (Okta): SAMLRequest (signed XML) via browser redirect
3. User authenticates at IdP
4. IdP → SP: SAMLResponse (signed XML containing assertion: who, when, attributes)
5. SP validates signature + assertion; creates session.
```

## When to use each (real-world examples)

### Session cookies
- **Server-rendered web apps** (Rails, Django, Laravel, classic Spring).
- **Single-domain monolith.**
- **Apps where instant revocation matters** (banking, admin tools).
- **First-party login** — your users on your app.

### JWT
- **Stateless API gateway / microservices** — no shared session store.
- **Mobile apps** with bearer tokens.
- **Federated services** — pass the same token through.
- **Short-lived API access** (15-60 min).
- **OIDC `id_token`** as login proof.

### OAuth2 (auth code + PKCE)
- **"Sign in with Google / GitHub"** for third-party login.
- **Mobile / SPA logins.**
- **Letting one app access user data in another** (Zapier connecting to your Salesforce).
- **Modern delegated authorization for any public API.**

### OAuth2 (client credentials)
- **Service-to-service in M2M scenarios.**
- **Background jobs / cron with API access.**
- **Internal API authentication** in a service mesh.

### OIDC
- **Modern login** for web + mobile + SPA.
- **Auth0, Clerk, Cognito, Azure AD, Okta** all expose OIDC.
- **Federation** between identity providers.

### SAML
- **Enterprise SSO** — corporate "log in to Slack with our SSO."
- **Workforce identity** — employees → 100 SaaS apps.
- **Strict compliance / audit** environments.

## Things to consider / Trade-offs

### Sessions vs JWT
- **Sessions** = stateful + slower per-request DB lookup + instant revocation + simpler.
- **JWT** = stateless + fast verify + harder revocation + complex if you need it.
- **Hybrid**: short-lived JWT (15min) + opaque refresh token in HTTP-only cookie + refresh-token-rotation.

### JWT specifics
- **Sign with RS256 (asymmetric)** for distributed verification — services have public key.
- **Avoid HS256** (symmetric) for distributed services unless secret management is solid.
- **`kid` header + JWKS** for key rotation.
- **Short expiry (15-60 min)** + refresh token + rotation.
- **Don't put PII in JWT** — it's just base64; visible to anyone holding it.
- **Don't put auth state in JWT body** unless you accept eventual consistency on revocation.
- **Set audience (`aud`) and issuer (`iss`)** — verify both on every check.
- **Algorithm confusion attack** — verify the alg is the one you expect; reject `alg: none`.

### OAuth2 / OIDC
- **Always use Authorization Code + PKCE for public clients** — no client secret needed.
- **Implicit Flow is deprecated** — don't use.
- **Refresh token rotation** — every refresh issues new refresh token; old one invalid.
- **State parameter** prevents CSRF; nonce prevents replay (OIDC).
- **Audience / scope checks on access token** — every API must verify them.
- **PKCE everywhere** — RFC 9700 recommends it for confidential clients too.
- **OAuth2 is large** — DPoP, mTLS-bound tokens, Token Exchange (RFC 8693), Rich Authorization Requests (RAR) are advanced topics.

### SAML
- **XML signing** has known security pitfalls (XXE, signature wrapping); use battle-tested library.
- **Clock skew** breaks SAML — assertions are timestamped.
- **Decommissioning is harder** — corporate identity providers are deeply entrenched.
- **Slowly being replaced by OIDC** in workforce auth, but enterprise won't move overnight.

### General
- **TLS everywhere** — non-negotiable for any auth flow.
- **HTTP-only + Secure + SameSite cookies** for sessions / refresh tokens.
- **Don't store JWT in localStorage** — XSS leak; use HTTP-only cookie or memory.
- **CSRF protection** — `SameSite=Lax/Strict` cookies, double-submit token, or fetch-mode.
- **Brute-force protection** on login — rate limit + lockout + CAPTCHA.
- **MFA** — TOTP, WebAuthn / Passkeys, SMS (last resort).
- **Password storage** — Argon2id (or bcrypt at min cost 12).
- **Account recovery flows** are the #1 attack surface — be paranoid.

## Common pitfalls
- **Confusing AuthN with AuthZ** — OAuth2 is authorization; OIDC adds authentication.
- **Putting JWT in URL query string** — logged in proxies, leaked.
- **Long-lived JWT without refresh** — can't revoke.
- **`alg: none` accepted** — token is unsigned and forged.
- **HS256 with shared secret across services** — any service compromise = full forgery.
- **Implicit flow for SPAs** — deprecated; tokens leaked in URLs.
- **Storing tokens in localStorage** — every XSS = session takeover.
- **No PKCE on mobile** — auth code interception attacks.
- **Trusting `id_token` for API access** — `id_token` is for the relying party only; use `access_token` for API.
- **Trusting JWT claims without verifying signature** — happens too often.
- **No JWKS rotation strategy** — keys rotate, clients break.
- **No clock-skew tolerance** — token "expired" on slightly-fast server, "not yet valid" on slow.
- **Including PII in JWT** — claims are visible; treat as secret only signing.
- **Not validating `aud`** — tokens issued for service A used at service B.
- **No refresh token rotation** — long-lived refresh tokens get stolen.
- **SAML signature wrapping** — using XML libraries that don't enforce strict canonicalization.

## Interview Cheat Sheet
- **Session cookie:** server-stored state; instant revocation; needs shared store at scale.
- **JWT:** stateless verifiable; short-lived (15-60 min); pair with refresh token; RS256 + JWKS for distributed.
- **OAuth2:** authorization framework; flows: Auth Code + PKCE (public client), Client Credentials (service).
- **OIDC:** authentication on top of OAuth2; `id_token` is JWT with user claims; modern login.
- **SAML 2.0:** enterprise SSO; XML; entrenched in workforce.
- **Don't confuse them:** OAuth2 ≠ authn; OIDC ≠ authz; JWT ≠ either, just the format.
- **PKCE everywhere; no implicit flow; HTTP-only cookies for refresh tokens; HTTPS always.**
- **Killer phrase:** "OAuth2 is for authorization; OIDC layers authentication on top; JWT is just a signed token format used by both; sessions vs JWT is a different axis (stateful vs stateless storage)."

## Related concepts
- [Encryption: At Rest, In Transit, E2E](/docs/55-security-and-auth/encryption-and-key-management) — how the channel is secured.
- [RBAC vs ABAC](/docs/55-security-and-auth/rbac-vs-abac) — what the user is allowed to do.
- [TLS handshake / mTLS](/docs/56-network-protocols-and-realtime/tls-and-mtls) — channel-level auth.
- [API Gateway](/docs/18-api-gateways/kong) — typically enforces JWT verification.
- Concrete: [Auth0](/docs/32-auth-as-a-service/auth0), [Okta](/docs/32-auth-as-a-service/okta), [Keycloak](/docs/23-secrets-and-identity/keycloak), [Vault](/docs/23-secrets-and-identity/vault).
