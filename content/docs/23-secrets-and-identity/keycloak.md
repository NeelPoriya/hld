---
title: "Keycloak"
description: "Keycloak is the open-source identity and access management server — OIDC, SAML, OAuth 2.0, social logins, federation, and fine-grained authorization; backed by Red Hat, used by enterprise SSO platforms worldwide."
---

> Category: Identity Provider / SSO · Written in: Java (Quarkus runtime since 17.x) · License: Apache 2.0

## TL;DR
Keycloak is the leading open-source **Identity Provider (IdP)** — a complete OIDC + OAuth 2.0 + SAML server with user federation, social login, brokering, MFA, theming, and fine-grained authorization. Its calling card: standards-compliant SSO that you can self-host, with a rich admin console and SDKs for every major language. Reach for Keycloak when you want **one identity tier** for many applications without paying Auth0 / Okta per active user, or when regulations require self-hosting. Red Hat's commercial distribution is **Red Hat build of Keycloak** (formerly Red Hat SSO).

## What problem does it solve?
- **One login across many apps** — SSO via OIDC / SAML.
- **Federated identity** — bridge to LDAP / Active Directory / Kerberos / external OIDC / SAML providers; users log in once with corporate credentials.
- **Social login** — Google / GitHub / Microsoft / Facebook / Apple as OIDC IdPs.
- **MFA, password policies, account recovery** — standardized.
- **Fine-grained authorization** — role-based, group-based, ABAC policies, resource-level permissions.
- **Self-hosted** alternative to Auth0 / Okta / Azure AD for orgs with sovereignty / cost concerns.

## When to use
- **Customer-facing apps** with many users, social login, MFA, branded UI.
- **Internal SSO** for employees + B2B partners with LDAP/AD federation.
- **Multi-tenant SaaS** — Keycloak realms = tenants (or use organizations / groups).
- **Microservices** secured with OIDC tokens validated by services.
- **On-prem / regulated** environments where SaaS IdPs aren't acceptable.

## When NOT to use
- **Tiny single app, few users** — Auth0 / Clerk / Supabase Auth / Firebase Auth are simpler.
- **No platform team** — Keycloak HA + Postgres + cache is real ops.
- **You want a fully managed IdP** — Auth0 / Okta / Microsoft Entra (Azure AD) / WorkOS.
- **Workforce identity at huge enterprise scale** with deep Microsoft tooling — Entra is the natural fit.

## Data Model
- **Realm** — top-level isolation: users, clients, roles, groups, identity providers, themes. One Keycloak instance can host many realms.
- **Client** — an app / service registered in a realm; gets a `client_id` and (for confidential clients) a secret.
- **User** — a person; can have credentials, attributes, group memberships, role assignments, sessions.
- **Group** — hierarchical container of users with attributes + role assignments.
- **Role** — realm-level or client-level; assigned to users / groups / composite roles.
- **Identity Provider** — external IdP (OIDC / SAML / social) brokered by this Keycloak.
- **Authorization Services** — resource-based permissions, policies (role / group / time / JS), permissions, scopes.

```bash
# Run Keycloak locally
docker run -p 8080:8080 \
    -e KEYCLOAK_ADMIN=admin \
    -e KEYCLOAK_ADMIN_PASSWORD=admin \
    quay.io/keycloak/keycloak:25 start-dev
```

```javascript
// Frontend: Keycloak adapter
import Keycloak from 'keycloak-js';

const kc = new Keycloak({
    url: 'https://auth.example.com',
    realm: 'acme',
    clientId: 'web-app'
});

await kc.init({ onLoad: 'login-required', pkceMethod: 'S256' });

// Use the access token to call APIs
fetch('/api/data', { headers: { Authorization: `Bearer ${kc.token}` } });
```

```python
# Backend: validate an OIDC token from Keycloak
from jose import jwt
import requests

JWKS = requests.get('https://auth.example.com/realms/acme/protocol/openid-connect/certs').json()

def verify_token(token: str) -> dict:
    return jwt.decode(token, JWKS, algorithms=['RS256'],
                      audience='web-app',
                      issuer='https://auth.example.com/realms/acme')
```

## Architecture (Keycloak 22+ / Quarkus)
- **Quarkus runtime** — fast startup, low memory, GraalVM native option.
- **Stateless JVM nodes** — N replicas behind a load balancer.
- **Database** — Postgres (recommended), MariaDB, MSSQL, Oracle; holds realms, users, sessions (optional).
- **Distributed cache** — Infinispan (embedded) for sessions / authz / login failures across nodes.
- **Multi-site / cross-DC** — Infinispan replication or Active-Passive with external Infinispan.

## Standards Supported
- **OAuth 2.0** — authorization code (with PKCE), client credentials, device code, refresh tokens.
- **OIDC** — identity layer over OAuth 2.0; ID tokens (JWT), userinfo, discovery, dynamic client registration.
- **SAML 2.0** — IdP-initiated and SP-initiated flows; for legacy enterprise apps.
- **WebAuthn / FIDO2** — passwordless and second factor.
- **TOTP** — Google Authenticator-compatible MFA.
- **Token introspection / revocation / userinfo** — RFC standards.

## Trade-offs

| Strength | Weakness |
|---|---|
| Open-source, full-featured IdP | Operating HA Keycloak + Postgres + cache is real work |
| OIDC + SAML + social + LDAP/AD federation | UI is functional but less polished than Auth0 |
| Themes / extensions / SPI | Performance can lag managed IdPs without tuning |
| Authorization services for fine-grained policy | Authorization services have a learning curve |
| Multi-realm tenancy | Cross-DC active-active needs Infinispan tuning |
| Strong upgrade path; major releases ~quarterly | Some docs lag the code; community + Red Hat fill gaps |
| Free at any user count | Backups, restore, migrations require care |

## Common HLD Patterns
- **OIDC for SPA + API:** SPA does Auth Code + PKCE → access token → API validates JWT signature against Keycloak JWKS.
- **Identity brokering:** Keycloak is your unified IdP; users can sign in with Google/GitHub/Corporate-AD; downstream apps see one OIDC issuer.
- **Multi-tenant SaaS:** one realm per tenant (strict isolation) or single realm with `organization` claim (lighter); pick deliberately.
- **B2B partner SSO:** add a SAML IdP per partner organization, brokered into your realm.
- **Step-up MFA:** apps require `acr_values=2` for sensitive operations; Keycloak prompts second factor and re-issues token.
- **Service-to-service:** OIDC client credentials grant; service A gets JWT, service B validates.

## Common Pitfalls / Gotchas
- **JWT validation in services** — verify signature, issuer, audience, expiry, and `nbf`; rotate JWKS cache periodically.
- **PKCE for public clients** — always use PKCE for SPAs / mobile; never store client secrets in browsers / apps.
- **Token TTLs** — short access token (5–15 min) + refresh token; rotation strategy for refresh tokens (rotation + reuse detection).
- **Session TTLs** — Keycloak SSO session vs access token vs refresh token are independent dimensions; understand each.
- **Multi-realm sprawl** — many small realms multiply admin effort; consider one realm + groups / organizations.
- **DB performance** — busy realms with many tokens hammer Postgres; tune connection pool + sessions storage.
- **Backup before upgrade** — schema migrations between major versions can be irreversible.
- **Custom themes** — themes break across major versions; pin the version you developed against and re-test.
- **Authorization services vs simple roles** — start with roles + groups; add authz services only when truly needed.

## Interview Cheat Sheet
- **Tagline:** Open-source identity provider with OIDC + SAML + social + LDAP/AD federation; the self-hosted Auth0 equivalent.
- **Best at:** SSO across many apps, federated identity, branded customer login, multi-tenant SaaS auth, on-prem regulated environments.
- **Worst at:** trivial single-app needs, teams without platform support, organizations standardized on a managed IdP (Entra / Okta / Auth0).
- **Scale:** millions of users, thousands of clients per realm; HA via Postgres + Infinispan; clusters at large enterprises.
- **Distributes how:** stateless Quarkus nodes behind LB; Postgres source of truth; Infinispan for cluster-wide caches / sessions.
- **Consistency / state:** strong via DB; cache eventual; cross-DC replication via Infinispan.
- **Killer alternative:** Auth0 / Okta / Microsoft Entra ID (Azure AD) / WorkOS / Authentik / Ory Kratos+Hydra / Zitadel.

## Further Reading
- Official docs: <https://www.keycloak.org/documentation>
- Server admin guide: <https://www.keycloak.org/docs/latest/server_admin/>
- Authorization services: <https://www.keycloak.org/docs/latest/authorization_services/>
- Red Hat build of Keycloak: <https://access.redhat.com/products/red-hat-build-of-keycloak>
