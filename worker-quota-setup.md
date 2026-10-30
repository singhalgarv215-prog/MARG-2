# Usage quotas and Gemini budget controls

The Worker can count and, when you turn enforcement on, refuse Gemini calls that would pass a daily call cap, a daily token cap, an in-flight cap, or a global token budget. Counting lives in a Durable Object named `MargQuota`, one object per hashed student or guest bucket and one object named for the global budget. The browser client id is not an identity. Guests are bucketed by the Worker from `CF-Connecting-IP` (IPv4 as itself, IPv6 by /64).

This repository does not know how the Worker is deployed. Nothing here creates a Wrangler config, a secret, or a dashboard change. Add the binding in the same place you already deploy `cloudflare-worker.js`.

## Rollout order

1. Create the Durable Object binding and migration. Leave the mode unset.
2. Turn log mode on and set the day offset and hash salt. Leave the limits unset.
3. Read Workers Logs.
4. Set the limits and the failure policy from what those logs show.
5. Turn enforcement on.

Do not start at step 5. Enforcement with a missing or invalid limits document, day offset, or failure policy does not guess a number. It stays in log behaviour and writes `MARG_QUOTA configuration invalid`.

## What you configure

### Binding

Durable Object namespace binding `MARG_QUOTA`. The class name is `MargQuota`. It is a plain class exported from `cloudflare-worker.js`. It does not import `cloudflare:workers`.

If the binding is absent, quotas stay off no matter what the mode says. The isolate logs one warning, `MARG_QUOTA binding is absent; usage quotas are off`, and requests behave as they did before this change.

### Migration

The class must be created as a SQLite-backed Durable Object. In the deploy config you already use, the migration is a new SQLite class named `MargQuota`. A Wrangler snippet with that shape looks like this. Do not add this file to the repo until you know it matches your deploy path:

```toml
[[durable_objects.bindings]]
name = "MARG_QUOTA"
class_name = "MargQuota"

[[migrations]]
tag = "marg-quota"
new_sqlite_classes = ["MargQuota"]
```

Confirm in the Cloudflare dashboard, before you rely on it, that the account can create SQLite-backed Durable Objects.

### Check plan limits before enforcement

Open the Cloudflare dashboard for this account and read the current Durable Objects limits for requests, duration, and stored data. You want one object per active student, one per active guest IP bucket, and one global object. The global object is a single writer for every Gemini call, so read the per-object throughput limit as well. Do this before setting the mode to `enforce`. This repo cannot see those plan numbers.

### Environment variables

All of these are optional. An omitted limit is counted and logged and is not enforced.

| Name | Values |
| --- | --- |
| `MARG_QUOTA_MODE` | `off`, `log`, or `enforce`. Unset means `off`. |
| `MARG_QUOTA_LIMITS` | JSON string. Shape below. Every key is optional. A non-integer or a number that is not positive makes enforcement fall back to log. |
| `MARG_QUOTA_DAY_OFFSET_MINUTES` | Integer minutes from UTC. This is when the daily counters roll. Required for `enforce`. There is no built-in timezone. As a worked example only, a day that starts at 00:00 in UTC+5:30 uses `330`. That example is not a default. |
| `MARG_QUOTA_FAILURE` | `closed` or `open_registered`. Required for `enforce`. If the Durable Object cannot be reached, `closed` returns 503 `QUOTA_UNAVAILABLE` for everyone. `open_registered` still serves registered students on the existing per-minute rate limits and rejects guests. |
| `MARG_QUOTA_EXEMPT` | Comma-separated Supabase user ids. They skip their own caps. They are still counted, still pay the global budget, and still hit the per-minute rate limits. |
| `MARG_GEMINI_PAUSED` | `1` makes every Gemini-bound request return 503 `SERVICE_PAUSED`. This does not need the Durable Object. |
| `MARG_GUESTS_PAUSED` | `1` does that for guests only. |

`MARG_QUOTA_LIMITS` shape:

```json
{
  "user": { "calls_per_day": 0, "tokens_per_day": 0, "max_in_flight": 0 },
  "guest": { "calls_per_day": 0, "tokens_per_day": 0, "max_in_flight": 0 },
  "global": { "tokens_per_day": 0, "tokens_per_month": 0, "guest_tokens_per_day": 0 },
  "estimate": { "image_tokens": 0 }
}
```

The zeros above are placeholders for “put your integer here”, not values the Worker will use. Delete any key you do not want to enforce. `guest` limits apply per IP bucket. `guest_tokens_per_day` is a shared pool: when it is exhausted, guests stop and registered students continue. If a request contains an image and `estimate.image_tokens` is missing, enforcement treats the configuration as invalid and does not invent an image price.

### Secret

`QUOTA_HASH_SALT`. The name sent to the Durable Object is the hex SHA-256 of the subject concatenated with this salt. Raw user ids and IP addresses are not stored. Create it as a Worker secret in the same deploy path. Do not commit it. If you leave it unset, the hash is still a SHA-256 of the subject and the raw id is still not written into the object.

## Log mode first

Set `MARG_QUOTA_MODE` to `log` after the binding exists. Requests are not refused for quota. Each request still writes one `marg_worker_request` log line. New fields on that line are only:

- `quotaMode`
- `quotaOutcome` (`allowed`, `rejected_<status>`, `skipped`, `failed_open`, `failed_closed`)
- `reservedTokens`
- `settledTokens`
- `remainingCalls` for that student or guest, never the global remainder

The line already has `subjectHash` (12 hex characters). It does not add the raw id, the IP, the token, or the message.

In the Cloudflare dashboard, open Workers Logs for this Worker. Filter for the event `marg_worker_request`. Useful reads, in whatever query form the dashboard gives you:

- Sum `settledTokens` per day. The day boundary is the offset you set, not the log product’s default timezone.
- Count rows by `quotaOutcome`. Rejections are `rejected_USER_DAILY_QUOTA`, `rejected_GUEST_DAILY_QUOTA`, `rejected_GLOBAL_DAILY_BUDGET`, `rejected_GLOBAL_MONTHLY_BUDGET`, and `rejected_TOO_MANY_IN_FLIGHT`.
- Group by `subjectHash` and sort by the sum of `settledTokens` to see the heaviest callers without seeing who they are.

`daily_article` is rate-limited only. Its `quotaOutcome` is `skipped`. It does not call Gemini.

## Google-side controls (outside this repo)

The Worker cap is not a bill. Also set:

- A project spend cap in Google AI Studio for the Gemini project this Worker uses.
- Cloud Billing budget alerts on the billing account that pays that project.

Standard Cloud Billing budgets only send an alert. They do not stop usage. Spend caps can still overshoot, because Google often records the charge after the request has already run. Use them together with the Worker limits, not instead of them.

## Behaviour you should expect

- One student message can call this Worker several times (the reply, continuations, and sometimes a check or a list refill). Each of those calls is metered on its own. Retries inside a single Worker request are one reservation.
- A rejected quota response is HTTP 429 with `retryable: false`, except `TOO_MANY_IN_FLIGHT`, which is retryable. `Retry-After` is the seconds until the reset named in `reset_at`. The in-flight value is a short mechanical wait (`IN_FLIGHT_RETRY_AFTER_SECONDS` in `cloudflare-worker.js`), not a daily policy.
- A reservation that never settles expires after the request’s upstream deadline plus `RESERVATION_SETTLE_MARGIN_MS` (five seconds). That margin is only so a crashed request cannot hold a slot forever. It is not a quota.
- Pause switches and `QUOTA_UNAVAILABLE` are HTTP 503.
- With the binding absent, the mode `off`, or log mode with no limits configured, the HTTP response and the Gemini request body stay the same as before this change.

The app still treats every HTTP 429 as a short retry cooldown until a later change maps these quota codes. Do not promise students a reset time in the client until that wording is reviewed.
