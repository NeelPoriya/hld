---
title: "Okta"
description: "Okta is the enterprise identity cloud — workforce SSO, lifecycle management, SCIM provisioning, MFA, and customer identity (Auth0) under one roof."
---

> Category: Auth-as-a-Service · Provider: Okta · License: Proprietary (managed)

## TL;DR
Okta is the **default enterprise IdP** for workforce identity. It's the SaaS that your Fortune-500 employer uses for SSO into Salesforce, Slack, GitHub, AWS — and the same one that startups grow into when their customer says "we require Okta SSO." Okta does:
- **Workforce Identity Cloud (WIC)** — single sign-on, MFA, lifecycle management, app catalog (8000+ pre-integrated apps), SCIM provisioning, Adaptive MFA, FastPass passwordless.
- **Customer Identity Cloud (CIC)** — that's **Auth0** (acquired in 2021); covered separately. Sometimes branded "Okta CIAM" too.
- **Privileged Access** — JIT access to admin accounts.
- **Identity Governance** — access reviews, certifications, request workflows.
- **Universal Directory** — central user store federating from many sources (AD, HR systems).

When an interviewer asks "How do enterprises do SSO?" the canonical answer is **SAML 2.0 / OIDC, IdP is Okta, target is your app**. This page focuses on Workforce Okta — the big enterprise SSO + lifecycle play.

## What problem does it solve?
- **One identity for every app** — employees use one login for 200+ corporate apps.
- **Provisioning + deprovisioning** — when HR fires someone, all 200 apps auto-revoke (SCIM).
- **MFA everywhere** — uniform policy across apps; FastPass / WebAuthn beats SMS.
- **Compliance** — SOC 2, ISO, FedRAMP-ready; access reviews + audit logs.
- **Federation across orgs** — partners can sign in with their IdP via SAML.
- **Adaptive risk policies** — block / challenge based on device, location, behavior.

## When to use
- **You sell to enterprises** — they require SAML / OIDC SSO; Okta is the most common IdP.
- **>200 employees** — manual onboarding to apps becomes infeasible.
- **Mixed SaaS + on-prem apps** — Okta supports both via Okta Access Gateway.
- **Compliance audit** — Okta logs + reports satisfy SOC 2 / ISO requirements.
- **Acquiring a company** — federate two directories without merging Active Directory.

## When NOT to use
- **B2C consumer signup** — use Auth0 / Cognito / Firebase / Clerk instead.
- **Tiny startup** — Google Workspace SSO might be enough at <50 employees.
- **Air-gapped on-prem only** — use AD FS or Keycloak.
- **Open-source / self-hosted requirement.**

## Core Concepts (Workforce)
- **Org / Tenant** — `acme.okta.com`; admin console + end-user dashboard.
- **User** — workforce identity; lives in Universal Directory.
- **Group** — collection of users; basis for app assignments + policies.
- **App (App Integration)** — represents an external service (Salesforce, AWS, GitHub, internal app); supports SAML 2.0, OIDC / OAuth 2.0, SWA (form-fill), or WS-Fed.
- **Sign-on Policy** — rules per app: who, when, MFA required, device trust, network zone.
- **Authentication Policy** — global / per-app conditions for letting auth proceed.
- **Authenticator** — Okta Verify, FIDO2 / WebAuthn, YubiKey, SMS, email, security questions.
- **MFA Factor** — authenticator instance enrolled by user.
- **Lifecycle Management (LCM)** — automated provisioning + deprovisioning via SCIM 2.0 (or app-specific connectors).
- **Identity Provider** (federation) — external IdP (Azure AD, partner Okta) trusted to authenticate.
- **Profile Source** — authoritative source for attributes (HR system → Okta → downstream apps).
- **Universal Directory** — central user store with custom schema, group memberships.

```xml
<!-- SAML 2.0 metadata: a typical IdP-initiated SSO flow -->
<!-- 1. User clicks "Salesforce" tile in Okta dashboard -->
<!-- 2. Okta builds + signs a SAML Response (assertion) -->
<!-- 3. Browser POSTs assertion to Salesforce ACS URL -->

<saml2:Assertion ID="..." IssueInstant="2026-04-01T00:00:00Z">
  <saml2:Issuer>http://www.okta.com/exk1abc...</saml2:Issuer>
  <saml2:Subject>
    <saml2:NameID Format="...:emailAddress">jane@acme.com</saml2:NameID>
  </saml2:Subject>
  <saml2:Conditions NotOnOrAfter="2026-04-01T00:05:00Z">
    <saml2:AudienceRestriction>
      <saml2:Audience>https://saml.salesforce.com</saml2:Audience>
    </saml2:AudienceRestriction>
  </saml2:Conditions>
  <saml2:AttributeStatement>
    <saml2:Attribute Name="department"><saml2:AttributeValue>Engineering</saml2:AttributeValue></saml2:Attribute>
    <saml2:Attribute Name="roles">
      <saml2:AttributeValue>admin</saml2:AttributeValue>
      <saml2:AttributeValue>developer</saml2:AttributeValue>
    </saml2:Attribute>
  </saml2:AttributeStatement>
</saml2:Assertion>
```

```javascript
// OIDC integration with your custom app (recommended over SAML for new apps)
const config = {
  issuer: "https://acme.okta.com",
  clientId: "0oa1abc...",
  redirectUri: "https://app.acme.com/callback",
  scopes: ["openid", "profile", "email", "groups"]
};

// Express middleware verifies Okta-issued ID + access tokens via JWKS
import { auth } from "express-openid-connect";
app.use(auth({
  issuerBaseURL: config.issuer,
  baseURL: "https://app.acme.com",
  clientID: config.clientId,
  secret: process.env.SESSION_SECRET,
  authorizationParams: { response_type: "code", scope: config.scopes.join(" ") }
}));
```

```bash
# SCIM 2.0 — Okta provisions users into your app
# Your app exposes /scim/v2/Users etc.; Okta calls it on user assign / deassign

curl -X POST https://app.acme.com/scim/v2/Users \
  -H "Authorization: Bearer $OKTA_PROV_TOKEN" \
  -H "Content-Type: application/scim+json" \
  -d '{
    "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
    "userName": "jane@acme.com",
    "name": { "givenName": "Jane", "familyName": "Doe" },
    "emails": [{ "primary": true, "value": "jane@acme.com" }],
    "active": true
  }'
```

## Architecture (Conceptual)
- **Multi-tenant cloud** with regional cells (US, EU, etc.).
- **Cell isolation** for blast-radius control.
- **Universal Directory** stores users + custom attributes; sync from AD / LDAP via Okta AD Agent.
- **Policy engine** evaluates sign-on policies on each auth request.
- **MFA service** issues / verifies factors; FastPass (device-bound passkey) is the modern flagship.
- **SAML / OIDC server** issues assertions / tokens to apps.
- **SCIM server** drives provisioning to downstream apps via outbound API calls.
- **Workflows** — no-code automation builder for identity events (e.g., "when user joins HR, request laptop").
- **Logs** stream via System Log API or Log Streams to SIEM.

## Trade-offs

| Strength | Weakness |
|---|---|
| Industry-default workforce IdP | Expensive at enterprise scale |
| Massive app catalog + SCIM | Some integrations are SWA only (less secure) |
| Adaptive MFA + FastPass | Setup complexity for non-trivial policies |
| Strong governance / access reviews (Identity Governance add-on) | Add-ons stack pricing rapidly |
| Compliance certifications | Vendor lock-in for directory + policies |
| Workflows for no-code automation | Workflow runtime quirks; debugging is harder than code |
| Strong audit + System Log | System Log retention limited; ship to SIEM |
| Hybrid AD / cloud federation | AD Agent / LDAP Agent require host management |
| Customer Identity (Auth0) under same roof | Two distinct products — pricing / contracts differ |

## Common HLD Patterns
- **Default workforce SSO:** every internal + SaaS app integrates with Okta via SAML 2.0 or OIDC.
- **JIT provisioning:** user authenticates via SAML; if not in target app, app creates user from assertion attributes.
- **SCIM provisioning:** Okta is source of truth; pushes/removes users to downstream apps automatically.
- **Adaptive sign-on:** require strong MFA from new devices / risky locations; allow seamless from corp network.
- **Privileged access JIT:** request elevated role via Okta Workflows; auto-revoke after N hours.
- **B2B partner federation:** partner runs their own IdP; Okta trusts it via SAML; users sign in with home credentials.
- **Workforce + customer split:** Okta WIC for employees, Auth0 (under Okta) for customers.
- **Step-up MFA:** sensitive app requires re-auth or hardware factor regardless of session.

## Common Pitfalls / Gotchas
- **SAML SignatureWrapping / replay** — verify signature, audience, NotOnOrAfter, in-response-to.
- **Clock skew** — assertions have ~5 min validity; servers must be NTP-synced.
- **JIT user mismatch** — different attribute mapping creates orphaned accounts.
- **SCIM partial failures** — provisioning to many apps; one failure can block; design idempotent endpoints.
- **Group nesting limits** — apps may not flatten nested groups; flatten in Okta or app side.
- **Push notification fatigue** — attackers spam push; use FastPass / WebAuthn instead of plain push.
- **Active Directory agent outages** — break sync; ensure HA agents.
- **Policy ordering** — first match wins; complex policy stacks need testing.
- **Custom domain CSP** — `acme.okta.com` vs `id.acme.com` (custom URL) — TLS + DNS gotchas.
- **Org admin separation of duties** — too many super-admins is risky; least privilege.
- **Token TTL drift** — long ID/access tokens slow revocation.

## Interview Cheat Sheet
- **Tagline:** Default enterprise IdP — workforce SSO + lifecycle / SCIM provisioning + adaptive MFA + governance; Customer Identity (Auth0) under same parent.
- **Best at:** workforce SSO across many SaaS apps, SCIM provisioning, compliance / audit, adaptive risk-based MFA.
- **Worst at:** B2C consumer flows (use Auth0 / Cognito), self-hosted / air-gapped, ultra-low budget.
- **Scale:** tens of millions of users across tenants; per-app login throughput managed by Okta.
- **Distributes how:** regional cells; redundant agents for AD / LDAP federation; JWKS / SAML metadata published.
- **Consistency / state:** central directory; tokens stateless via JWT/SAML verification on apps.
- **Killer alternative:** Microsoft Entra ID (formerly Azure AD; default for Microsoft shops), Google Workspace IdP, Ping Identity, OneLogin (now part of One Identity), Auth0 (same parent — for CIAM), JumpCloud, Keycloak (OSS).

## Further Reading
- Official docs: <https://help.okta.com/>
- Architecture / cell strategy: <https://www.okta.com/blog/2022/06/oktas-cell-architecture/>
- SCIM provisioning: <https://developer.okta.com/docs/reference/scim/>
- Authentication Policies: <https://help.okta.com/oie/en-us/content/topics/identity-engine/policies/about-authentication-policies.htm>
