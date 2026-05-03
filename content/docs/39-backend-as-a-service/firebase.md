---
title: "Firebase"
description: "Firebase is Google's mobile + web BaaS — Firestore (NoSQL document DB) + Realtime Database + Authentication + Cloud Functions + Hosting + FCM push + Crashlytics + Remote Config + A/B Testing, all wrapped in client SDKs that talk directly to backend services."
---

> Category: Backend-as-a-Service · Provider: Google · License: Proprietary (managed)

## TL;DR
Firebase is **Google's batteries-included BaaS**, especially loved for **mobile-first apps**. The flagship is **Cloud Firestore** — a globally-distributed NoSQL document database with **realtime subscriptions** and **offline persistence** — talking directly to mobile / web SDKs over WebSockets. Around it: **Authentication** (email + OAuth + phone + anonymous), **Cloud Functions** (Node / Python / Go serverless triggered by Firestore writes / HTTP / Auth events / Pub/Sub), **Hosting** (CDN-fronted static sites), **Storage** (GCS-backed file uploads with security rules), **Cloud Messaging (FCM)** (push notifications to iOS / Android / web), **Remote Config** (cloud-controlled flags), **A/B Testing**, **Crashlytics** (crash reporting), **Performance Monitoring**, **App Check** (anti-abuse). The killer feature is **realtime listeners + offline-first SDKs**: your mobile app writes to a local cache; SDK syncs to Firestore in the background; collaborators get the change in <1s. **Security Rules** (declarative DSL on top of Firestore / Storage) let mobile / web apps write directly to the database safely. Reach for Firebase when you want **mobile-class velocity, realtime by default, and Google-scale infra** — and you're okay with NoSQL document modeling and Google lock-in.

## What problem does it solve?
- **Mobile apps need offline-first + realtime sync** — Firestore + RTDB SDKs do it.
- **Auth across mobile + web** — Firebase Auth + Identity Platform.
- **Push notifications to iOS / Android / web** without operating APNs / FCM endpoints.
- **No backend server** for many CRUD apps — clients talk to Firestore via Security Rules.
- **Crash + perf reporting** built-in.
- **A/B + flags + remote config** for mobile rollout.
- **Cloud Functions** for server-side triggers without Lambda config.

## When to use
- **Mobile (iOS / Android) apps** with offline + realtime requirements.
- **Web apps** with realtime collab features.
- **MVP / prototype** that needs auth + DB + push in days.
- **Chat / messaging / collaboration** apps with subscription patterns.
- **Hackathon / weekend projects** — fastest possible to working app.
- **Mobile games** with leaderboards / cloud-saved state.
- **Push notifications** at scale (FCM is the de-facto Android push channel).

## When NOT to use
- **Complex relational queries / joins** — Firestore is NoSQL; multi-collection joins are client-side or denormalized.
- **Strict GDPR / sovereignty** requirements outside supported regions.
- **Predictable cost at huge scale** — read / write / egress charges add up unpredictably.
- **OSS / self-hostable requirement** — Firebase is Google-managed only.
- **Vendor-neutral architecture** — moving off Firebase is a lift-and-shift project.
- **Heavy aggregations / analytics** — pipe to BigQuery, don't query Firestore.
- **Large blob retrieval at high QPS** — Storage works, but specialized object stores or CDNs may suit better.

## Core Concepts
- **Project** — top-level container; tied to a GCP project.
- **Cloud Firestore** — schemaless document DB; **collection → document → subcollection** hierarchy.
- **Realtime Database (RTDB)** — older JSON-tree DB; still good for high-frequency tiny updates (like presence).
- **Document** — JSON-like map; up to 1 MiB; up to 20K fields; max 1 write/sec/document.
- **Composite index** — required for compound queries; auto-suggested by error messages.
- **Security Rules** — DSL defining `read` / `write` predicates per path; reference `request.auth`, `resource.data`, `request.resource.data`.
- **Auth provider** — email / password, Google, Apple, Facebook, Twitter, GitHub, Microsoft, phone, anonymous, custom token.
- **Identity Platform** (paid Firebase Auth+) — SAML, OIDC, MFA, blocking functions.
- **Cloud Function trigger** — HTTP, Firestore document write, Auth event, FCM, Pub/Sub, Storage object.
- **FCM (Firebase Cloud Messaging)** — push notifications via topic / token / device groups.
- **App Check** — verifies requests originate from your real app (DeviceCheck, Play Integrity, reCAPTCHA).
- **Remote Config** — cloud-served key/value flags + conditional targeting + A/B integration.
- **Hosting** — static SPA hosting + rewrites to Cloud Functions or Cloud Run.
- **Extensions** — pre-built integrations (Algolia sync, Stripe, image resize).

```javascript
// Web client SDK
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, query, where, onSnapshot } from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Sign in
await signInWithEmailAndPassword(auth, email, password);

// Write
await setDoc(doc(db, "users", auth.currentUser.uid, "todos", "t1"),
  { title: "Buy milk", done: false, createdAt: Date.now() });

// Realtime subscribe
const q = query(
  collection(db, "users", auth.currentUser.uid, "todos"),
  where("done", "==", false)
);
const unsub = onSnapshot(q, (snap) => {
  snap.docChanges().forEach(c => {
    console.log(c.type, c.doc.id, c.doc.data());
  });
});
```

```text
// firestore.rules — only the user can read/write their own todos
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId}/todos/{todoId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId
                         && request.resource.data.title is string
                         && request.resource.data.title.size() < 200;
    }

    match /publicPosts/{postId} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.token.email_verified == true;
    }
  }
}
```

```javascript
// Cloud Function: on user signup, create profile doc + send welcome push
import { onUserCreated } from "firebase-functions/v2/identity";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp();

export const onSignup = onUserCreated(async (event) => {
  const { uid, email, displayName } = event.data;
  await getFirestore().doc(`users/${uid}`).set({
    email, displayName, createdAt: Date.now()
  });

  // Send welcome push if device token registered
  // ... fetch token, getMessaging().send({ token, notification: { ... } })
});
```

```javascript
// FCM: send push to a topic
const message = {
  notification: { title: "New post", body: "Tap to read" },
  topic: "newsletter",
  android: { priority: "high" },
  apns: { payload: { aps: { sound: "default" } } }
};
await getMessaging().send(message);
```

## Architecture (Conceptual)
- **Firestore** — globally replicated multi-region NoSQL on Google's Spanner-class infra (similar architecture).
- **RTDB** — JSON tree; regional; better for very high-frequency tiny writes.
- **Auth** — Identity Platform; OIDC under the hood.
- **Cloud Functions** — runs on Cloud Run / Cloud Functions Gen 2.
- **FCM** — Google's push service; APNs / WebPush bridges.
- **Hosting** — global CDN with edge caching.
- **Security Rules** — evaluated at the database edge before any read / write.
- **Client SDKs** — maintain local cache; reconcile via change-streams.

## Trade-offs

| Strength | Weakness |
|---|---|
| Mobile + web SDKs are best-in-class | Vendor lock-in; migration is hard |
| Realtime + offline by default | Firestore query model is limited (no joins, limited compound queries) |
| Auth + Push + DB + Hosting in one project | Cost can spike (per read / write / egress) |
| Security Rules let clients hit DB safely | Writing safe Security Rules is subtle; bugs leak data |
| FCM is THE push channel for Android | Cross-region disaster recovery story is opaque |
| Cloud Functions on document writes | Cold starts on Cloud Functions Gen 1 |
| Crashlytics + Performance Monitoring | NoSQL document modeling forces denormalization |
| 1MB document size cap | Hot document = 1 write/sec limit |

## Common HLD Patterns
- **Mobile app with realtime feed** — collection `posts`; client subscribes via `onSnapshot`; offline cache + reconciliation handled by SDK.
- **Multi-user collab** (chat / docs) — collection `rooms/{roomId}/messages`; participants subscribe; Security Rules enforce membership.
- **User profile + auth** — `users/{uid}` doc per user; signup trigger creates doc; Security Rules `request.auth.uid == userId`.
- **Push notifications** — store device tokens in `users/{uid}/devices`; Cloud Function on event sends FCM.
- **Counter / leaderboard** — Firestore has 1 write/sec/doc; use **distributed counter** pattern (sharded counter docs).
- **Search** — Firestore can't full-text; use Algolia / Typesense Extension or pipe to BigQuery for OLAP.
- **Image resize** — Storage trigger + Cloud Function (or use Resize Images extension).
- **Stripe billing** — Stripe Extension syncs subscriptions into Firestore.
- **Anonymous → authenticated upgrade** — `linkWithCredential` preserves UID + data.

## Common Pitfalls / Gotchas
- **Hot document** — single doc with > 1 write/sec hits limit; shard the counter / partition the doc.
- **Composite indexes** required for compound queries; missing index = clear error message.
- **`array-contains-any` + `in`** queries combine to ≤ 30 disjuncts.
- **Read multipliers** — query that returns 100 docs costs 100 reads.
- **Security Rules pitfall** — reading from another collection in rules costs a read each.
- **Egress costs** — large client-side reads add up; minimize via aggregations or BigQuery.
- **No cross-document atomic transactions** beyond batched writes (500 docs limit) or Firestore transactions (sequential reads + writes).
- **Cold-start on Cloud Functions** — use Gen 2 + min instances for latency-critical paths.
- **Listener limits** per client (~100 active listeners).
- **Offline cache** can grow large; tune.
- **App Check** must be enabled to prevent free reads from scrapers.
- **Migrating off Firebase** is painful — Firestore data + auth + functions all need rewrites.

## Interview Cheat Sheet
- **Tagline:** Google's mobile + web BaaS — Firestore (realtime + offline NoSQL) + Auth + FCM + Cloud Functions + Hosting + Security Rules for direct DB access from clients.
- **Best at:** mobile apps, realtime chat / collab, MVPs, push notifications, offline-first.
- **Worst at:** complex relational queries, vendor-neutral architectures, OSS / self-host, predictable huge-scale cost.
- **Scale:** Google-scale Firestore (multi-region replication), trillions of writes / month across customers.
- **Distributes how:** managed; multi-region replicated Firestore; client SDKs handle offline + reconnect.
- **Consistency / state:** Firestore is strongly consistent within a region; eventually consistent across multi-region; Security Rules at the DB edge.
- **Killer alternative:** Supabase (Postgres-based OSS), AWS Amplify (AWS-native), Appwrite (OSS), PocketBase (single-binary OSS), Convex (typed reactive backend), Hasura (GraphQL), DIY (DynamoDB + Cognito + AppSync + S3 + SNS).

## Further Reading
- Official docs: <https://firebase.google.com/docs>
- Firestore data model: <https://firebase.google.com/docs/firestore/data-model>
- Security Rules: <https://firebase.google.com/docs/firestore/security/get-started>
- FCM: <https://firebase.google.com/docs/cloud-messaging>
- Cloud Functions: <https://firebase.google.com/docs/functions>
