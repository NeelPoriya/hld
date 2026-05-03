---
title: "Twilio"
description: "Twilio is the API-first communications cloud — programmable SMS, voice, WhatsApp, video, email (SendGrid), and verify (OTP / TOTP / push) over global carrier and IP networks."
---

> Category: Notifications & Communications · Provider: Twilio · License: Proprietary (managed)

## TL;DR
Twilio is the **default API-first communications platform**. A single account gives you programmable **SMS / MMS**, **voice calls**, **WhatsApp Business**, **video / live streaming**, **chat (Conversations API)**, **email** (via SendGrid, owned by Twilio), and **identity verification** (Verify: OTP via SMS / voice / email / push / TOTP). Under the hood Twilio runs the carrier-relationship + global SS7/IP infrastructure; you pay per message / minute / verification. The flagship product is still **SMS / Programmable Messaging** — `POST /Messages` with a `from`, `to`, `body`, and Twilio routes it to the carrier, handles delivery receipts, retries, opt-outs (STOP / HELP), and surfaces analytics.

Reach for Twilio when you need **transactional or marketing communications** anywhere in the world without negotiating with carriers, when phone-number-based verification is a product requirement, or when you're building a contact-center / IVR / video application.

## What problem does it solve?
- **Don't talk to 200+ carriers** — Twilio negotiates global SMS/voice routes for you.
- **Compliance + deliverability** — registered short codes / 10DLC / toll-free verification handled via Twilio.
- **Programmable IVR** — TwiML lets you build phone trees in XML or via webhook callbacks.
- **OTP / 2FA fatigue** — Twilio Verify abstracts SMS / voice / email / push / TOTP / WhatsApp into one API.
- **WhatsApp Business** — get a verified WhatsApp number through Twilio without direct Meta integration.
- **Global phone numbers** — instant rental of long codes / short codes / toll-free in 150+ countries.

## When to use
- **Transactional SMS** — order confirmations, OTPs, alerts.
- **Marketing SMS / WhatsApp** — opt-in campaigns at scale (with regulatory care).
- **Voice + IVR** — programmable phone systems, contact centers (Flex).
- **Video calling** — embedded video for telehealth / customer support (Twilio Video).
- **In-app chat** — Conversations API spans SMS + WhatsApp + chat in one threaded model.
- **Verify / 2FA** — phone-based verification flows.

## When NOT to use
- **Tiny single-channel apps** — bare AWS SNS / Vonage / MessageBird may be cheaper.
- **No internet egress** to Twilio cloud — air-gapped systems.
- **Pure email** — use SendGrid directly (Twilio-owned), Mailgun, or SES.
- **Push-only mobile notifications** — FCM / APNs / OneSignal are simpler / cheaper.
- **Cost-sensitive at very high SMS volume** — direct carrier deals beat Twilio at huge scale.

## Core Concepts
- **Account / Subaccount** — billing + isolation; subaccounts for multi-tenant.
- **Project / Service** — Verify and other products group resources by Service.
- **Phone Number** — bought through Twilio Console / API; properties: type (long-code / short-code / toll-free), capabilities (SMS / MMS / voice / fax).
- **Messaging Service** — pool of numbers + sender configuration (sticky-sender, geomatching, opt-out handling).
- **TwiML** — XML responses Twilio executes for voice / messaging webhooks.
- **Webhook** — Twilio POSTs status / inbound events to your URL.
- **Verify Service** — OTP delivery; tracks attempts + verification state.
- **Conversations** — multi-party multi-channel threads (SMS + WhatsApp + chat).
- **Studio** — drag-and-drop flow builder for IVR / messaging.

```python
# Send SMS via Twilio Programmable Messaging
from twilio.rest import Client
client = Client(account_sid, auth_token)

msg = client.messages.create(
    messaging_service_sid="MGxxxx",     # use a Messaging Service for sticky-sender
    to="+14155551212",
    body="Your code is 123456. Don't share it."
)
print(msg.sid, msg.status)
```

```python
# Twilio Verify — managed OTP flow
verify = client.verify.v2.services("VAxxxx")

verify.verifications.create(to="+14155551212", channel="sms")     # send OTP

ok = verify.verification_checks.create(to="+14155551212", code=user_input).status == "approved"
```

```xml
<!-- TwiML for an inbound call: forward to support, fall back to voicemail -->
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thanks for calling Acme. Connecting you to support.</Say>
  <Dial timeout="20" action="/voice/post-dial" record="record-from-answer">
    <Number>+14155550000</Number>
  </Dial>
  <Say>We're sorry we missed you. Please leave a message after the beep.</Say>
  <Record maxLength="120" transcribe="true" transcribeCallback="/voice/transcript"/>
</Response>
```

```javascript
// Webhook handler for inbound SMS — auto-reply + log
import Twilio from "twilio";

app.post("/twilio/sms", Twilio.webhook(), (req, res) => {
  const from = req.body.From;
  const body = req.body.Body.trim();
  log({ from, body });

  const twiml = new Twilio.twiml.MessagingResponse();
  if (/^STOP$/i.test(body)) {
    // Twilio handles opt-out automatically; we just ack
    twiml.message("You have been unsubscribed.");
  } else {
    twiml.message(`We got: ${body}`);
  }
  res.type("text/xml").send(twiml.toString());
});
```

## Architecture (Conceptual)
- **Carrier fabric** — Twilio's network of agreements with mobile carriers + voice providers globally.
- **Routing engine** — selects carrier path per destination, optimizing for delivery rate and cost.
- **Programmable layer** — REST APIs + TwiML interpreter + webhook engine.
- **Per-product services** — Messaging, Voice, Verify, Conversations, Video, Studio, Flex (contact center).
- **Webhook delivery** — at-least-once, retried with exponential backoff; status callbacks for delivery / failure.
- **Compliance layer** — opt-out (STOP/HELP), DNC, 10DLC registration in US, GDPR / regional rules.
- **Analytics + Insights** — dashboards for delivery rates, latency, error codes per route.

## Trade-offs

| Strength | Weakness |
|---|---|
| Global carrier reach in one API | Per-message / minute pricing adds up |
| All channels (SMS, voice, WhatsApp, email, video) | Vendor lock-in for phone-number portability |
| Verify abstracts OTP across channels | OTP via SMS is increasingly insecure; favor TOTP / passkeys |
| TwiML + Studio for low-code IVR | Studio limits — eventually you outgrow it |
| Strong delivery analytics | 10DLC / short-code registration is bureaucratic |
| WhatsApp Business via Twilio | WhatsApp template approval is slow |
| Conversations unifies multi-channel threads | Subscription pricing varies by feature |
| Webhooks + status callbacks rich | At-least-once webhooks → must be idempotent |

## Common HLD Patterns
- **OTP / 2FA flow:** app POSTs phone → Twilio Verify; user enters code → app calls Verify Check; success → mint session.
- **Transactional SMS:** event in your system (order shipped) → backend → Twilio Messages API → status callback updates DB.
- **Inbound SMS handling:** customer texts your number → Twilio webhooks your server → bot / human responds via TwiML or Messages API.
- **Programmable IVR:** PSTN call → Twilio answers → fetches TwiML from your URL → routes / records / transcribes.
- **WhatsApp customer support:** WhatsApp business number on Twilio → Conversations API → CRM agents reply.
- **Video for telemedicine:** server creates Twilio Video room; tokens for participants; recording + transcription on completion.
- **Notification fan-out:** SNS / EventBridge → Lambda → Twilio for SMS branch; SES / SendGrid for email branch.

## Common Pitfalls / Gotchas
- **10DLC registration in the US** — required for A2P SMS on long codes; setup is multi-week.
- **Opt-out handling** — Twilio honors STOP automatically; respect HELP; track in your DB.
- **Country-specific regulations** — some countries require sender ID / specific templates / opt-in proof.
- **OTP delivery delays** — international SMS can have 30+ second latency; offer voice/email fallback.
- **Webhook retries** — at-least-once; make handlers idempotent on `MessageSid` / `CallSid`.
- **Webhook signing** — validate `X-Twilio-Signature` to prevent spoofed callbacks.
- **Sticky sender vs random** — sticky improves user trust but reduces deliverability if number is throttled.
- **Cost surprises** — voice minutes + transcription + recording all bill; estimate carefully.
- **Sandbox WhatsApp number is for testing only** — production needs an approved Business number.
- **Account auth tokens** — rotate; never commit; subaccount tokens for blast radius.
- **Long messages** — > 160 GSM-7 chars segment into multiple billed messages.

## Interview Cheat Sheet
- **Tagline:** API-first communications cloud — SMS, voice, WhatsApp, email (SendGrid), video, verify; global carrier fabric behind a REST API.
- **Best at:** transactional SMS, OTP / 2FA, programmable IVR, multi-channel notifications, WhatsApp Business at scale.
- **Worst at:** ultra-cheap SMS (direct carriers), air-gapped systems, push-only mobile notifications.
- **Scale:** billions of messages per day across the platform; per-account scale via Messaging Services.
- **Distributes how:** global carrier routing engine; multi-region API endpoints; webhooks pushed to customer URLs.
- **Consistency / state:** at-least-once webhook delivery; idempotency keys for sends; service is multi-tenant managed.
- **Killer alternative:** AWS SNS + Pinpoint, MessageBird, Vonage (Nexmo), Sinch, Plivo, Bandwidth (cheaper US voice), direct carrier APIs at huge scale.

## Further Reading
- Official docs: <https://www.twilio.com/docs>
- Messaging best practices: <https://www.twilio.com/docs/messaging/guides/best-practices>
- Verify: <https://www.twilio.com/docs/verify>
- TwiML reference: <https://www.twilio.com/docs/voice/twiml>
