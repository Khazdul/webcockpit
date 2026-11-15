# Sending e-mail from a Worker (Cloudflare, read 2026-11-15)

Research for the owner's mail on every report (stage 64, ADR 0154 "As
built ... mail on reports"). The old Email Routing pages now redirect to
the newer "Email Service" docs; both paths are given.

## The binding

Source: https://developers.cloudflare.com/workers/wrangler/configuration/
("Email bindings") and
https://developers.cloudflare.com/email-service/configuration/send-bindings/

- Declared as `send_email: [{ name, destination_address?,
  allowed_destination_addresses?, allowed_sender_addresses? }]`.
  (`allowed_sender_addresses` is only on the send-bindings page.)
- "No restriction attribute: The binding can send to any verified
  destination address in your account."
- `destination_address`: only that one address; `allowed_destination_addresses`:
  only the listed ones; `allowed_sender_addresses`: only from the listed ones.
- Prerequisite: "you need to enable Email Routing and have at least one
  verified email address."
- Bindings are not inherited by an environment ("Bindings, such as vars
  or kv_namespaces, are not inheritable and need to be defined
  explicitly"); `send_email` is not named in the list of non-inheritable
  keys, but it is a binding, so `env.staging` declares its own.

## Recipient and sender

Source: https://developers.cloudflare.com/email-service/platform/limits/
(was https://developers.cloudflare.com/email-routing/limits/),
https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/

- "Before you onboard a sending domain, you can send emails only to
  verified destination addresses in your account. After you onboard a
  sending domain, you can send to any recipient immediately."
- Whether a Worker may send to an address that is only a routing rule on
  the zone (e.g. `abuse@mumecockpit.com`) is not documented; sends are
  described as going to destination addresses. So we send to the
  verified destination address itself.
- Sender: "You can only send from your routing domains." The
  send-bindings page: "The sender address must belong to an onboarded
  Email Service domain." Errors `E_SENDER_NOT_VERIFIED`,
  `E_SENDER_DOMAIN_NOT_AVAILABLE` ("Domain not onboarded to Email
  Service"). The sender address need not exist as a routing rule (no
  page asks for that).

## Message format

Source: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
(was https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)

- `env.BINDING.send(message)` takes either a structured builder
  (`{ to, from, subject, text?, html?, headers? }`, "For new code, prefer
  the structured send() method") or the legacy raw form:
  `import { EmailMessage } from "cloudflare:email"`,
  `new EmailMessage(from, to, raw)` with raw an RFC 5322 message
  (`string | ReadableStream` in @cloudflare/workers-types). Both resolve
  to `{ messageId }`; errors are thrown with a `code`.
- The docs' raw example uses the `mimetext` package (needs
  `nodejs_compat`); no header is documented as required. We build the
  message by hand (worker/mail.ts): From, To, Subject (RFC 2047), Date,
  Message-ID, MIME-Version, a base64 UTF-8 text/plain body.
- Custom headers in the structured form are allowlisted
  (`E_HEADER_NOT_ALLOWED`, at most 20, 16 KB).

## Limits, pricing, local development

Sources: https://developers.cloudflare.com/email-service/platform/limits/ ,
https://developers.cloudflare.com/email-service/platform/pricing/ ,
https://developers.cloudflare.com/email-service/observability/local-development/sending/

- Per message: 50 recipients, subject 998 characters, 25 MiB.
  Destination addresses per account: 200. New accounts have "a
  conservative daily quota" (no number given).
- Pricing: sending to arbitrary recipients needs Workers Paid (3,000 a
  month included). "Sends to verified destination addresses are free and
  do not count toward the included quota" (free on all plans; the Free
  column of the same table says "Not available" for arbitrary sending).
  Our mails go only to a verified destination, at most ~21 an hour.
- `wrangler dev` simulates the binding: it logs the mail and sends
  nothing, unless the binding has `"remote": true`.
- Mails sent by a Worker "appear in the Email Routing summary as
  dropped, even when they were delivered successfully."
