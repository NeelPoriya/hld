---
title: "RBAC vs ABAC vs ReBAC"
description: "Three authorization models — Role-Based (roles to permissions), Attribute-Based (policy expressions), and Relationship-Based (graph-based, Google Zanzibar). What each is, what they cost, and which to choose."
---

> Topic: Key Concept · Category: Security & Auth · Difficulty: Intermediate

## TL;DR
Once you know **who** the user is (authentication), you need to decide **what they can do** (authorization). Three dominant models:
- **RBAC (Role-Based)** — assign users to **roles** (`admin`, `editor`, `viewer`); roles have **permissions** (`posts:edit`, `users:delete`). Simple, fast, well-known. Breaks down at scale (role explosion).
- **ABAC (Attribute-Based)** — evaluate a **policy expression** at request time (`user.dept == resource.dept AND time.hour ∈ [9, 17]`). Flexible; powerful; harder to debug. (Used by AWS IAM, Google Cloud IAM Conditions, OPA / Rego.)
- **ReBAC (Relationship-Based)** — model permissions as a **graph of relationships** (`user A is owner of folder F; folder F contains document D; therefore A can edit D`). Inspired by Google's Zanzibar paper; used by Auth0 FGA, OpenFGA, SpiceDB, Permify. Best for complex sharing models (Google Docs, GitHub, Slack channels).

The three are **not mutually exclusive** — real systems mix them: RBAC for org-level roles + ABAC for resource conditions + ReBAC for fine-grained sharing.

## What problem does each solve?

### RBAC
- **Coarse-grained access** — "who can use this feature?"
- **Standard org models** — admin / editor / viewer.
- **Easy auditing** — list role's permissions; assign / revoke.
- **Fast verification** — single lookup `(user, role)` → permission set.

### ABAC
- **Context-aware decisions** — "can edit during business hours from corp network."
- **Multi-tenant isolation** — "user can read records where `record.tenant_id == user.tenant_id`."
- **Compliance / regulation** — "PII access only for compliance team."
- **Resource attributes drive policy** rather than fixed roles.

### ReBAC
- **Hierarchical / inherited permissions** — folders / nested documents.
- **Complex sharing** — Google Docs (owner → editors → commenters → viewers).
- **Group membership inheritance** — "any member of `team:engineering` can read `repo:foo`."
- **Cross-resource relationships** — "anyone in tenant X with role Y on project Z."

## How they work

### RBAC

```text
User — has role → Role — has permission → Permission
                           e.g.,            e.g.,
                          'editor'         'posts:edit'
```

Implementation:
```sql
CREATE TABLE users (id, email, ...);
CREATE TABLE roles (id, name);
CREATE TABLE permissions (id, name);                  -- e.g., 'posts:edit'
CREATE TABLE user_roles (user_id, role_id);
CREATE TABLE role_permissions (role_id, permission_id);
```

Enforce:
```python
def can(user, action, resource):
    return any(action in role.permissions for role in user.roles)
```

### ABAC

```text
Policy:  permit(action, resource)
   if user.dept == resource.dept
      AND user.clearance >= resource.classification
      AND now in [9:00, 17:00]
```

Implementation: **OPA / Rego, AWS IAM policy JSON, XACML, custom expression engine**.

```text
# OPA / Rego
package authz
default allow = false

allow {
    input.user.dept == input.resource.dept
    input.user.clearance >= input.resource.classification
    time.now_ns() / 1e9 % 86400 >= 9 * 3600
    time.now_ns() / 1e9 % 86400 <= 17 * 3600
}
```

### ReBAC (Zanzibar-inspired)

```text
Tuples (relationships):
   doc:design-doc#owner@user:alice
   doc:design-doc#viewer@group:eng-team#member
   group:eng-team#member@user:bob

Schema (rules):
   doc.viewer = relation
   doc.editor = relation
   doc.editor → doc.viewer  (editors are also viewers)
```

Query: "Can `user:bob` read `doc:design-doc`?" → walk the graph.

Implementation: **OpenFGA, SpiceDB, Auth0 FGA, Permify**, or roll your own following the Zanzibar paper.

## When to use each (real-world examples)

### RBAC
- **Internal admin tools** (Django admin, Rails admin).
- **B2B SaaS user roles** — "owner / admin / member / viewer."
- **Organization-level permissions** — "billing admins."
- **Kubernetes RBAC** — `Role`, `ClusterRole`, `RoleBinding`.
- **Most apps under 50 permissions.**

### ABAC
- **Multi-tenant data isolation** — "user can read records where `tenant_id == user.tenant_id`."
- **Time-of-day / IP / device-based access** — "can transact only from corp network."
- **AWS IAM with conditions** — `s3:GetObject` if `aws:SourceIp` in allowed range.
- **HIPAA / PCI / SOX compliance** — fine-grained policy expression.
- **Cloud platforms** (AWS, GCP, Azure all have ABAC).
- **Open Policy Agent (OPA)** as policy decision point in Kubernetes / service mesh.

### ReBAC
- **Document / folder sharing** — Google Docs, Notion, Dropbox.
- **GitHub-style repo access** — owner / write / read with team inheritance.
- **Slack channels** — workspace member, channel member, admin.
- **Multi-tenant SaaS with complex hierarchies** — companies → departments → projects → documents.
- **AuthZed / SpiceDB / OpenFGA / Auth0 FGA** customers.
- **Anywhere you can't list every (user, resource) pair.**

## When NOT to use each

### Don't use RBAC
- **Resource-level permissions explode** — "owner of doc 123, editor of doc 456" → don't model with roles.
- **Context-dependent policy** — time / location / device.
- **Inheritance / group membership matters.**

### Don't use ABAC
- **Simple role-list scenario** — overkill.
- **Need fast O(1) verification** — ABAC eval can be expensive.
- **No clear policy authors** — without owners, policies drift.

### Don't use ReBAC
- **Tiny permission model** — overhead isn't worth it.
- **No tooling experience** — Zanzibar systems are operationally complex.
- **You can solve with RBAC + a few resource ID columns.**

## Things to consider / Trade-offs

### RBAC
- **Role explosion** — "VP_engineering_west_coast" emerges as you add nuance. Limit role count; refactor.
- **No resource-instance permissions** — you can't say "alice can edit doc 42 but not doc 43" without adding ABAC.
- **Audit-friendly** — every assignment is visible.
- **Static** — doesn't adapt to context.

### ABAC
- **Policy debugging** — "why was access denied?" can be hard. Need explain / dry-run tooling.
- **Performance** — every request evaluates policy; cache decisions where safe.
- **Policy drift** — undocumented invariants embedded in policy text.
- **Centralized policy decision point** (OPA, AuthZed) vs **embedded in service**.
- **Combine with RBAC** — roles as one attribute among many.

### ReBAC
- **Operational complexity** — separate database / service for relationships.
- **Latency** — graph traversal on every check; use caching, denormalization.
- **Consistency** — Zanzibar uses snapshot-based reads with `zedtoken`s.
- **Schema design** — relations and inheritance are conceptual + take iteration.
- **Migration** from RBAC is non-trivial.
- **Choice of system:** SpiceDB / OpenFGA / Auth0 FGA / Permify — different trade-offs.

### General
- **Authorize at the right boundary** — too coarse (gateway) misses fine permissions; too fine (each query) burdens performance.
- **Cache decisions** at TTL appropriate to revocation needs.
- **Audit logs** for every decision (especially deny).
- **Test policies** like code — unit tests, integration tests, regression suites.
- **Avoid mixing in a single layer** — RBAC + ABAC + ReBAC mixed inline becomes spaghetti. Extract to authorization service.
- **Defense in depth** — service-level + DB-level (row-level security) + application-level.

## Common pitfalls
- **Hard-coding role names in code** — `if user.role == "admin"`; brittle.
- **No revocation mechanism** beyond expiry.
- **Permissions as raw strings without namespace** — `:edit` colliding across resources.
- **Caching authorization decisions too long** — revocation lag.
- **Treating RBAC as "we'll bolt on conditions later"** — refactor cost is real.
- **ABAC policies in code rather than declarative** — can't audit.
- **ReBAC without a snapshot read consistency story** — stale relationship reads grant access wrongly.
- **No "what can this user do?" UI** — hard to debug.
- **Authorization on the client side only** — bypassed instantly.
- **Privilege escalation via missing checks** — every endpoint must enforce.
- **Tenant isolation by `WHERE tenant_id = ?`** without testing every code path — leaks.
- **Granting "manage roles" without limits** — admin makes themselves super-admin.

## Interview Cheat Sheet
- **RBAC:** users → roles → permissions. Simple, common, scales until it doesn't.
- **ABAC:** policy expression over user / resource / context attributes; OPA / AWS IAM.
- **ReBAC:** graph of relationships (Zanzibar / OpenFGA / SpiceDB); right for sharing models.
- **Mix them.** RBAC for org roles + ABAC for context + ReBAC for resource sharing.
- **Centralize the decision** (PDP) — Kubernetes admission, OPA, FGA — keep it consistent.
- **Cache, but with revocation in mind.**
- **Audit every decision.**
- **Killer phrase:** "RBAC for who you are, ABAC for what's true right now, ReBAC for what you're related to."

## Related concepts
- [Authentication: OAuth2, OIDC, SAML, JWT](/docs/55-security-and-auth/authentication-oauth-oidc-saml-jwt) — companion: who.
- [Encryption & Key Management](/docs/55-security-and-auth/encryption-and-key-management) — protect what RBAC lets you access.
- Concrete: [Auth0](/docs/32-auth-as-a-service/auth0), [Okta](/docs/32-auth-as-a-service/okta), [Keycloak](/docs/23-secrets-and-identity/keycloak), [Vault](/docs/23-secrets-and-identity/vault), AWS IAM, OpenFGA, SpiceDB, OPA.
