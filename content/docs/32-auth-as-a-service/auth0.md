---
title: "Auth0"
description: "Auth0 is the developer-friendly managed identity platform — drop-in OIDC / OAuth2 / SAML for any app, with social logins, MFA, B2B / B2C tenants, Actions, and rich SDKs."
---

> Category: Auth-as-a-Service · Provider: Okta (acquired Auth0 in 2021) · License: Proprietary (managed)

## TL;DR
Auth0 is the **developer-first managed identity platform**: a single signed-up tenant gives you a hosted **OIDC / OAuth 2.0 / SAML** authorization server, **Universal Login** pages, **30+ social connections** (Google, GitHub, Apple, …), **enterprise federation** (SAML, ADFS, Azure AD, OIDC), **MFA**, **passwordless** (email magic link, SMS, WebAuthn / passkeys), **role / permission-based authorization**, and **Actions** (serverless hooks to customize the login pipeline). You point your app at Auth0 via standard OIDC; Auth0 handles signup, login, MFA challenges, password reset, social, and returns ID + access tokens. Reach for Auth0 when you want **identity off your plate** with strong DX, 1-day integration, and a migration path from B2C → B2B SSO as you scale.

## What problem does it solve?
- **Don't roll your own auth** — credential storage, password hashing, MFA, social, SAML all done well by experts.
- **Compliance** — SOC 2 / ISO / HIPAA-ready out of the box.
- **B2B SSO is a sales requirement** — enterprises demand SAML / OIDC; Auth0 ships it day one.
- **Hosted Universal Login** absorbs CSRF / brute-force / credential-stuffing automatically.
- **Customization without owning infra** — Actions let you inject custom logic at signup / login / token issuance.

## When to use
- **B2C apps** — fast signup with social + email; passwordless / passkeys.
- **B2B SaaS** — multi-tenant, per-customer SAML / SCIM provisioning.
- **Apps that need MFA / compliance** without building it.
- **Migrating off home-grown auth** — Auth0 has a `users` import + import-on-login flow.
- **Mobile + SPA + traditional web** mixed clients.

## When NOT to use
- **Open-source / air-gapped requirement** — use Keycloak / Authentik / Ory.
- **Sub-cent unit economics** — Auth0 pricing scales with MAU; can get expensive at >100k.
- **Highly custom token / session shape** — possible via Actions + custom DB but you may fight the platform.
- **You already own a great IdP** (Cognito + Lambda triggers, your own Keycloak ops team).
- **Strict data residency** outside Auth0 regions.

## Core Concepts
- **Tenant** — your isolated Auth0 environment (e.g., `acme.auth0.com`).
- **Application** — a client (SPA / Native / Regular Web App / M2M); has client_id + client_secret.
- **Connection** — an identity source: Database (built-in user store), Social (Google, …), Enterprise (SAML, OIDC, ADFS), Passwordless.
- **API (Resource Server)** — represents your backend; defines scopes / permissions.
- **Rules / Hooks (legacy)** → **Actions (current)** — serverless JS that runs at well-defined trigger points: post-login, post-user-registration, post-change-password, pre-user-registration, M2M token issuance, …
- **Roles & Permissions** — Authorization Core: roles map to permissions; permissions are checked in your API via JWT claims.
- **Universal Login** — Auth0-hosted login pages; theme + branding; hosted MFA challenges.
- **Tenant Members** — admins of the tenant (different from end users).
- **Organizations** — modelling B2B customers; users belong to orgs; SSO per org.

```javascript
// Auth0 SPA SDK — React example
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";

const App = () => (
  <Auth0Provider
    domain="acme.auth0.com"
    clientId="abc123"
    authorizationParams={{
      redirect_uri: window.location.origin,
      audience: "https://api.acme.com",
      scope: "openid profile email read:orders write:orders"
    }}
  >
    <Dashboard />
  </Auth0Provider>
);

function Dashboard() {
  const { user, isAuthenticated, loginWithRedirect, getAccessTokenSilently } = useAuth0();
  if (!isAuthenticated) return <button onClick={loginWithRedirect}>Log in</button>;

  const callApi = async () => {
    const token = await getAccessTokenSilently();
    const res = await fetch("/api/orders", { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  };
  return <div>Hi {user.email}</div>;
}
```

```javascript
// Action: post-login hook to add custom claims + enforce email verified
exports.onExecutePostLogin = async (event, api) => {
  if (!event.user.email_verified) {
    api.access.deny("Please verify your email first.");
    return;
  }
  const tier = event.user.app_metadata?.tier ?? "free";
  api.idToken.setCustomClaim("https://acme.com/tier", tier);
  api.accessToken.setCustomClaim("https://acme.com/tier", tier);
  if (event.transaction?.requested_scopes?.includes("admin:all")
      && !event.user.app_metadata?.is_admin) {
    api.access.deny("Insufficient privileges");
  }
};
```

```python
# Verifying Auth0 JWTs in your backend (Python)
import jwt, requests
from jwt import PyJWKClient

JWKS = PyJWKClient("https://acme.auth0.com/.well-known/jwks.json")

def verify(token: str) -> dict:
    key = JWKS.get_signing_key_from_jwt(token).key
    return jwt.decode(
        token, key,
        algorithms=["RS256"],
        audience="https://api.acme.com",
        issuer="https://acme.auth0.com/"
    )
```

## Architecture (Conceptual)
- **Auth0 multi-tenant cloud** — your tenant lives on shared or dedicated infrastructure (Private Cloud option).
- **OIDC / OAuth 2.0 authorization server** issues ID + access + refresh tokens (RS256 / RS512 / HS256).
- **JWKS endpoint** — public keys your backend uses to verify JWTs.
- **User database** — stores hashed credentials, MFA factors, profile, app/user metadata.
- **Connections layer** federates identity from social / enterprise IdPs.
- **Action runtime** — Node.js serverless executor; one-time use per trigger; safe to have side effects.
- **Hooks** (deprecated, replaced by Actions).
- **Management API** — admin REST API for users / clients / connections; rate-limited.
- **Logs streaming** — to Datadog / Splunk / S3.

## Trade-offs

| Strength | Weakness |
|---|---|
| Production-grade auth in a day | Cost scales with MAU and adds up |
| Universal Login + branding for free | Vendor lock-in (token shape, custom DB, …) |
| 30+ social + enterprise SAML/OIDC | Deep customization fights the platform |
| Actions = clean serverless extension points | Action runtime has cold starts and time limits |
| MFA, passwordless, passkeys built in | Multi-region data residency requires Private Cloud / EU tenant |
| RBAC + Authorization Core | Authorization at scale (ABAC, fine-grained) is limited; pair with FGA |
| Compliance certifications | Ops debugging via logs + Tenant Settings only |
| Excellent SDKs across stacks | Token lifetimes / refresh logic must be tuned per app |

## Common HLD Patterns
- **SPA + API:** SPA uses Authorization Code + PKCE; receives ID token (user) + access token (audience = your API); API verifies JWT.
- **Native mobile + API:** same pattern with Authorization Code + PKCE in app.
- **B2B SSO:** Organizations + per-org SAML / OIDC enterprise connection; users provisioned via SCIM from customer's IdP.
- **Machine-to-machine:** Client Credentials grant; server-to-server JWT with limited scope.
- **Step-up auth:** Action enforces MFA only on high-value scopes (e.g., `transfer:funds`).
- **User import:** import existing user database with bcrypt / Argon2 hashes; users keep passwords.
- **Custom claims for downstream:** post-login Action adds `tier`, `org_id`, `permissions` to access token; backend reads them without DB lookup.
- **Token revocation:** short access token TTL + refresh-token rotation; or use opaque tokens + introspection.

## Common Pitfalls / Gotchas
- **Token verification with wrong audience / issuer** — most common bug; always verify both.
- **Putting too much in JWT** — large tokens hit headers limits; only essential claims.
- **Long access token TTL** — hard to revoke; prefer 5–15 min + refresh.
- **Refresh token rotation off** — replay attacks possible.
- **Universal Login customization drift** — heavy custom HTML breaks on Auth0 updates; prefer New Universal Login + Liquid templates.
- **Action timeout** (hard-capped seconds) — don't call slow third-party APIs inline; queue.
- **Rate limits on Management API** — bulk operations need backoff.
- **Wrong grant type** — using ROPG ("password" grant) is anti-pattern; use Authorization Code with PKCE.
- **Per-tenant log retention** — short by default; stream to your SIEM.
- **CORS** — Auth0 endpoints support specific origins; configure per app.
- **Account linking** — duplicate users created if email matches a social account; Auth0 has a recipe but it's manual.
- **MFA bypass via remember-the-browser** — review and tighten policy.

## Interview Cheat Sheet
- **Tagline:** Developer-friendly managed OIDC / OAuth2 / SAML identity platform; Universal Login + Actions + Organizations + RBAC.
- **Best at:** B2C signup with social + email, B2B SSO, MFA / passwordless, fast time-to-production for auth.
- **Worst at:** open-source / air-gapped, ultra-low MAU pricing, deep token customization, fine-grained ABAC at scale.
- **Scale:** millions of MAU per tenant; rate limits on Management API; user store + login throughput managed by Auth0.
- **Distributes how:** multi-tenant cloud across regions; dedicated Private Cloud option for isolation.
- **Consistency / state:** central user DB + JWKS; tokens stateless on your side via JWT verification.
- **Killer alternative:** Okta Workforce (B2E SSO; same parent), AWS Cognito (cheap, AWS-native, weaker DX), Firebase Auth, Clerk (modern dev experience), Stytch, FusionAuth (self-host), Keycloak (OSS), Authentik (OSS), Ory (OSS).

## Further Reading
- Official docs: <https://auth0.com/docs>
- Architecture overview: <https://auth0.com/docs/get-started/architecture-scenarios>
- Actions: <https://auth0.com/docs/customize/actions>
- Organizations (B2B): <https://auth0.com/docs/manage-users/organizations>
