# Worker spend protection

This is the beta design that the Worker now implements. Nothing here has been deployed. No production variable, binding, secret, or Wrangler file was changed.

The Durable Object ledger is the authority for model spend. Token ceilings still apply when prices are missing or turned off. Spending controls are Worker variables only. The browser never receives a limit, a price, or a remaining balance it could edit.

## Initial beta defaults

These are starting points, not a permanent policy. Each one is a Worker variable.

| Who | Requests / minute | Model calls / day | Tokens / day | Estimated spend / day |
| --- | --- | --- | --- | --- |
| Signed-in student | 30 | 100 | 750,000 | $1.50 |
| Guest | 10 | 5 | 40,000 | $0.10 |
| Everyone together | — | — | 5,000,000 | $10 |

The guest minute limit is per signed guest session. The shared-network ceiling is 120 requests a minute, and a network’s guest daily pool is 8 times one guest (40 calls, 320,000 tokens, $0.80) so a hostel is not treated as one person. A day changes at midnight in `Asia/Kolkata`.

A normal mentor turn asks for about 2,048 output tokens and fits a guest’s $0.10 hold. A guest turn whose worst-case hold exceeds $0.10 or 40,000 tokens is refused before Gemini. That includes a 16,384-token guest request. The refusal is a quota response, not a model error.

## Authentication

- A valid Supabase session is a signed-in student. The id comes from Supabase, never from the request body.
- No bearer token is a restricted guest.
- An invalid or expired bearer token is HTTP 401 `SESSION_INVALID`. Gemini is not called.
- If Supabase cannot be reached, the response is HTTP 503 `AUTH_UNAVAILABLE`. Gemini is not called.
- Invalid sessions are not turned into guests.
- `MARG_AUTH_STRICT` is no longer the switch for this. It is still written on the log line and does not change the decision.
- `MARG_GUEST_CAPABILITIES` stays at its current default, `log`. Do not set it to `enforce`. That would block guest images and JSON that the app still uses. Guests are never grounded, in `log` or `enforce`. A guest request that asks for web lookup gets HTTP 503 `GROUNDING_UNAVAILABLE` and is not sent to Gemini.

## Guest identity

The browser visitor id (`X-Marg-Client-Id`) is an abuse signal only. It is hashed into the ledger and is not the allowance key. Changing it does not reset the guest budget.

When `MARG_GUEST_SIGNING_KEY` is set, the Worker mints an HMAC guest token (`X-Marg-Guest-Token`, version `v1`, 30-day lifetime). The daily budget is stored on that session id. The app keeps the token in `localStorage` under `marg_guest_token` and sends it back. A bad or expired token is HTTP 401 `GUEST_SESSION_INVALID` and is not silently replaced on that request.

Without the signing key, guests fall back to one stricter budget per IP bucket. They are still capped. They are not unlimited.

The outer rate-limit binding still keys guests by IP. That is a network backstop. Personal daily limits and the 10-per-minute guest burst live in the ledger.

## Idempotency

Clients may send `X-Marg-Idempotency-Key`. The same body within 10 minutes reuses one key. The app does this for Worker calls that can reach Gemini.

| Situation | Result | Gemini |
| --- | --- | --- |
| Same key and same body while the first request is running | 409 `DUPLICATE_IN_PROGRESS` | Not called again |
| Same key and same body after a stored HTTP 200, and the response fit in the ledger | Stored JSON, header `X-Marg-Idempotent-Replay: 1` | Not called again |
| Same key and same body after a stored HTTP 200 that was too large to keep | 409 `ALREADY_COMPLETED`, `replayed: false` | Not called again. No invented answer |
| Same key and a different body, same student | 409 `IDEMPOTENCY_CONFLICT` | Not called again |
| Same key used by another student, a guest, or an invalid session | No replay, no block, and no conflict with the first student. An invalid session is 401 before the ledger | The second caller is handled on their own row |
| HTTP 503, 502, timeout, client disconnect, quota refusal, or a retryable per-minute 429 | The row is removed. The next send of the same key runs again and is reserved again | Called again on the next send |
| Client disconnect or timeout after the upstream call has started | The reservation is kept as spent. The closing response is not replayed | The same key can be sent again, and it is refused if the daily call was already spent |
| A `running` row whose reservation TTL has passed | The row is cleared. A crashed request cannot block its key | The next send is reserved normally |
| Gemini 429/503 retry or the 3.5 Flash location fallback | The extra attempt is reserved before it is sent. If it does not fit, it is not sent | Only attempts that were reserved |

A request that never reaches Gemini releases its hold. A request that does, and then loses its usage metadata, keeps the whole reservation. Retries add tokens and micro-dollars. They do not add a second daily call.

## Ledger

`UsageLedger` is one Durable Object, obtained with `idFromName('marg-usage-ledger')`. It does not store one `usage-state` blob. Each operation reads and writes only the keys it needs:

- `day` — that day’s global counters, the open-reservation ids, and the idempotency list head
- `res:<id>` — one open reservation
- `bal:<day>:<subject>` — one subject’s counters. A refused request does not create this key
- `min:<day>:<window>:<scope>` — one minute slot. The previous window’s key is deleted when the next window is accepted. A refused request does not create one
- `idem:` plus the subject, a NUL byte, and the client key — one stored reply or in-progress row. Another subject cannot read it
- `iidx:<subject>` and `inode:<seq>` — the per-subject and oldest-first eviction indexes

`IDEMPOTENCY_PER_SUBJECT_CAP` (32) and `IDEMPOTENCY_TOTAL_CAP` (4096) are storage bounds, not student or guest allowances. The oldest completed row is dropped first. `IDEMPOTENCY_VALUE_CAP` (96 KiB) keeps one stored reply under Cloudflare’s 128 KiB key-value value limit. The memory double also refuses any single put whose JSON exceeds 2 MiB, which is Cloudflare’s documented limit for one SQLite-backed value. A put that throws rolls the transaction back and the Worker returns 503 `SPENDING_CONTROL_UNAVAILABLE`. Counters already committed are left as they were.

Reserve, extend, settle, release, and idempotency updates still happen in one storage transaction. Tests use an in-memory double with the same serialisation. A normal begin’s read and write count does not grow with the number of subjects.

Open reservations older than 3 minutes are settled at their estimate on the next ledger operation, so a crashed request cannot hold budget forever and cannot become free. A day change carries those open reservations forward as holds on the new day. It does not charge them yet and it does not drop the id. The previous day’s `bal:` and `min:` keys are deleted by prefix. If the Durable Object is missing, a put fails, or the ledger replies with anything other than `mode: "owner"` and a reservation id, the Worker returns 503 `SPENDING_CONTROL_UNAVAILABLE` and does not call Gemini. There is no unlimited fallback.

The handler calls Gemini only after that owner reply. `{}`, `{ok:false}`, an unknown mode, `{ok:true}` with no reservation id, and a 200 that is not JSON all stop before Gemini.

One global object still serialises every model call. Personal counters are separate keys, but the object’s transaction queue is still a single line. Do not shard in this change. Scale later by sharding personal counters with `idFromName(subject)` and keeping one global object. Lock the subject first and the global object second.

Measured on the in-memory double, not on Cloudflare. 100,000 refused guest begins took 1.96 seconds and created no subject or minute key. 100,000 accepted guest sessions, each reserved and released, took 6.54 seconds. The largest value in that run was 243 bytes. 5,000 stored successes stayed at or under 256 bytes. One begin did 7 reads and 7 writes, and that count was the same after the number of subject keys grew from 100 to 5,000. The hotspot is the queue in front of this one object: every call waits for the previous transaction, even though one transaction no longer rewrites every subject. Do not shard until that queue is the measured limit in production.

## Prices

Integer micro-dollars. One dollar is 1,000,000 micros.

The Worker calls only these models. Rates below are the Gemini Developer API introductory prices checked on 31 Oct 2026. They run through 31 Dec 2026. On 1 Jan 2027, gemini-3.6-flash list price becomes input $1.50 / 1M and output $7.50 / 1M. That is still below gemini-3.5-flash. Change the variables then. Do not wait for a code deploy if the variables are set.

| Model | Role | Input / 1M | Output, including thinking / 1M | Cache / 1M |
| --- | --- | --- | --- | --- |
| gemini-3.6-flash | Primary | $0.75 | $3.75 | $0.075 |
| gemini-3.5-flash | Location fallback | $1.50 | $9.00 | $0.15 |

The first hold uses 3.5 Flash prices, because a location fallback must not cost more than the reservation. Settlement uses the model that actually ran. Uncached input is `prompt − cached`. Cached input uses the cache rate. `toolUsePromptTokenCount` uses the input rate. Visible output and thinking tokens are both charged at the output rate, because Google reports them separately and prices thinking as output. If `totalTokenCount` is larger than prompt + candidates + thoughts + tool-use, the unexplained remainder is charged at the output rate. If the usage object contains only `totalTokenCount`, all of it is charged at the output rate. The token cap uses `totalTokenCount` when Gemini sends it, so thinking is not counted twice there. Missing usage keeps the whole reservation.

Each image is estimated at 1,024 input tokens until usage arrives. Grounding with Google Search is not inside the token price. Gemini 3 reports the queries it executed in `candidates[0].groundingMetadata.webSearchQueries` (https://ai.google.dev/gemini-api/docs/google-search, checked 31 Oct 2026). A grounded attempt reserves one query. Settlement charges the configured price times the number of unique non-empty queries, and at least one if the metadata is missing. `MARG_GROUNDING_MICROS_PER_REQUEST` has no built-in price. When it is unset or 0, a grounded request returns HTTP 503 `GROUNDING_UNAVAILABLE` and Gemini is not called. That is not an answer and not a charge. Set it to `14000` to reserve $0.014 per query ($14 / 1,000). Leaving it unset means web lookup stays off.

## Guest pool inside the global ceiling

`MARG_GLOBAL_GUEST_TOKENS_PER_DAY` and `MARG_GLOBAL_GUEST_SPEND_MICROS_PER_DAY` are optional. They have no built-in value. When both are unset, guests and signed-in students still share the global ceiling, the log field `guestPoolConfigured` is `false`, and finding F3 stays open. A zero or blank value is treated as unset. A malformed value is logged by name only and treated as unset.

When either variable is set, a guest session and a guest-ip subject draw from that guest pool and from the global ceiling at the same time. The reservation is refused with `guest_global_daily_tokens` or `guest_global_daily_spend` when the pool is spent, even if the global ceiling still has room. A signed-in student is checked only against that student’s own caps and the global ceiling. The guest pool never refuses a student. Guest holds are included in the global held total, so guest reservations and student reservations together cannot pass the global ceiling.

Arithmetic for one new hold of `T` tokens and `M` micros:

- Subject spent + subject held + the new hold must fit the personal caps.
- Global spent + global held + the new hold must fit the global ceiling.
- If the caller is a guest and the pool is configured, guest-pool spent + guest-pool held + the new hold must also fit the pool. The same hold is then added to both the guest-pool held counters and the global held counters.
- Settlement moves the hold to spent on the same counters the reservation was drawn from. A stale reservation is moved at its estimate. A day roll keeps an open reservation as a hold; it does not forget it and it does not spend it early.

`MARG_PRICING_ENABLED=off`, or a missing price, skips the dollar check. Token and call caps remain.

## What the student sees

A limit is HTTP 429 `QUOTA_EXCEEDED`, with `quota`, `resetsAt`, `retryable`, and `signInRequired`. It is not `RATE_LIMITED` and it is not an answer from the model.

The composer keeps the student’s text, leaves the message in the chat, and says when the allowance resets in IST. Guests are pointed at Save progress. The Gemini retry cooldown is not started. A duplicate send says the message is already being answered. Daily Practice treats a 429 `QUOTA_EXCEEDED` with `retryable: false` as “today’s allowance is used”, shows the reset time when the body has one, and does not start a countdown. Other 429s stay on the short retry. A grounded request that cannot be priced says web lookup is unavailable and points the student at the official source. The local mentor recovery that replaces a grounded turn is not used for that refusal, because the protected-request notice handles it first and keeps the student’s message.

## Production configuration to apply later

Do this only after review. This repository does not contain the deploy config.

1. Add a Durable Object binding named `MARG_USAGE_LEDGER`, class `UsageLedger`, exported from `cloudflare-worker.js`. New Cloudflare classes are SQLite-backed. A binding of that shape looks like this and must be checked against the account’s Durable Object plan before it is relied on:

```toml
[[durable_objects.bindings]]
name = "MARG_USAGE_LEDGER"
class_name = "UsageLedger"

[[migrations]]
tag = "marg-usage-ledger"
new_sqlite_classes = ["UsageLedger"]
```

2. Create a Worker secret `MARG_GUEST_SIGNING_KEY`. Use a long random value. Do not commit it. Without it, guests share one IP budget.

3. The numeric defaults are already in the code. Set them as Worker variables only if you want to change them without deploying again:

```text
MARG_USER_REQUESTS_PER_MINUTE=30
MARG_USER_CALLS_PER_DAY=100
MARG_USER_TOKENS_PER_DAY=750000
MARG_USER_SPEND_MICROS_PER_DAY=1500000
MARG_GUEST_REQUESTS_PER_MINUTE=10
MARG_GUEST_CALLS_PER_DAY=5
MARG_GUEST_TOKENS_PER_DAY=40000
MARG_GUEST_SPEND_MICROS_PER_DAY=100000
MARG_GLOBAL_TOKENS_PER_DAY=5000000
MARG_GLOBAL_SPEND_MICROS_PER_DAY=10000000
MARG_GLOBAL_GUEST_TOKENS_PER_DAY=
MARG_GLOBAL_GUEST_SPEND_MICROS_PER_DAY=
MARG_GUEST_IP_SHARE_FACTOR=8
MARG_IP_REQUESTS_PER_MINUTE=120
MARG_USAGE_TIMEZONE=Asia/Kolkata
MARG_GUEST_TOKEN_TTL_SECONDS=2592000
MARG_RESERVATION_TTL_MS=180000
MARG_IDEMPOTENCY_TTL_MS=600000
MARG_IDEMPOTENCY_MAX_BYTES=524288
MARG_IMAGE_INPUT_TOKENS=1024
MARG_PRICING_ENABLED=on
MARG_PRICE_36_INPUT_PER_MILLION=750000
MARG_PRICE_36_OUTPUT_PER_MILLION=3750000
MARG_PRICE_36_CACHED_PER_MILLION=75000
MARG_PRICE_35_INPUT_PER_MILLION=1500000
MARG_PRICE_35_OUTPUT_PER_MILLION=9000000
MARG_PRICE_35_CACHED_PER_MILLION=150000
MARG_GROUNDING_MICROS_PER_REQUEST=14000
```

`MARG_GROUNDING_MICROS_PER_REQUEST` has no built-in price. Leave it unset and web lookup returns `GROUNDING_UNAVAILABLE`. Set it to 14000 when grounded prompts should reserve the paid Search rate.

`MARG_GLOBAL_GUEST_TOKENS_PER_DAY` and `MARG_GLOBAL_GUEST_SPEND_MICROS_PER_DAY` have no built-in value. Deploying without them leaves guests and students on one shared ceiling. Set both before a public beta if guest traffic must not consume the student allocation. The blank lines above are not values; omit the variables entirely to leave them unset.

4. Rate-limit bindings, if they already exist, are an extra outer guard. The ledger still enforces the table above when a binding is looser or absent. A binding that is stricter than the ledger answers with `RATE_LIMITED` before the quota message. Prefer an IP binding of 120 per minute. If `MARG_RATE_LIMITER` uses one limit for every key, set that limit to 120 as well so a shared network is not squeezed down to one student’s minute allowance. Personal limits stay in the ledger.

5. Leave `MARG_GUEST_CAPABILITIES` unset or `log`. Leave the Gemini API key where it already is, as a Worker secret. Do not put any of these variables in the frontend.

6. In Google AI Studio, keep a project spend cap, and keep a Cloud Billing budget alert. Those alerts do not stop a request that has already been sent. The Worker limits are what refuse the call first.

## What is not in this change

No Wrangler file, no secret, no dashboard edit, no deploy, and no merge. The branch is local until you approve a push.
