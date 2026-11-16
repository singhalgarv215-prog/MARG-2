# 25 — Phase 4, P4.2: read-only goals client, flag off

Branch `claude/phase4-goals` (worktree). Nothing committed, pushed, merged or deployed. Production Supabase was not touched in this phase. No database changes in P4.2.

## Plain-English summary and decision needed
The app can now, behind a switch that is off everywhere by default, read the student's saved goals and show a count of earlier learning records that could one day be attached to a goal. It cannot create, change, move or delete anything. In production the switch can never turn on: it needs the staging environment *and* a local opt-in. With the switch off, the app's requests are exactly what they were before.

**Decision:** approve P4.3 (create and adopt, scoped accessors, goal threads, contract tests I1–I10), or ask for changes. I have also not yet applied the F1 revoke anywhere.

## What was done
- **`marg-goals.js` (new):** the flag; scope helpers; a client that does one `GET goals` and one `POST rpc/preview_workspace_adoption`; whitelisting of what comes back; a read-only panel.
- **Scope plumbing (`marg-app.js`):** `margReadScopeFilter()` adds a goal filter to the four mentor reads (diagnoses, tasks, attempts, evidence). Off: adds an empty string. On with no goal chosen: General, meaning rows with no goal. An unknown or invalid scope matches no rows rather than all rows.
- **My Goals tab:** when the flag is on, a "Saved goals (preview, read only)" block appears at the top, with goal titles and counts. It has no buttons or links. Errors show "could not be loaded", never "you have no goals".
- **Account safety:** if the signed-in account changes while a request is in flight, the answer is discarded.
- `index.html` loads the script; `scripts/run-marg-tests.cjs` loads it for the harness.

## Files
New: `marg-goals.js`, `goals-client.test.mjs`. Modified (this phase): `marg-app.js` (helper block before `sbFetch`, one line in `renderGoalsTab`, four read URLs), `index.html` (+1 script tag), `scripts/run-marg-tests.cjs` (+1 file in load list). DB objects: none changed.

## Tests
- `goals-client.test.mjs`: **36/36**. Covers flag (production, no opt-in, storage failure), scope filters (fail-closed, uuid validation), preview shape (counts only, bad values rejected), "no network call when off or signed out", "exactly one GET and one POST, nothing else", HTTP/network/shape errors, account switch mid-load, HTML escaping, no buttons, honest empty/unavailable text, no exam names in the module, scope filter on all four reads, filter is an empty string when off.
- **Mutation check: 15/15 mutants killed** (flag ignores environment, no opt-in, fail-open scope, no stale check, escaping removed, a button or PATCH added, a read left unscoped, and so on).
- Existing: harness all selected suites pass (0 failures); goals-nav 14/14, journey-log 10/10, inline-cards 11/11, cat-pyq-bank 8/8, predictor-claims 59/59, batch2 20/20, cat-correctness 50/50, daily-practice 103/103, staging-guard 34/34.
- `worker-ledger` still not re-run (unchanged Worker file).

## What these tests do NOT cover
- **No browser run (no LIVE check at 390px or desktop).** The panel's layout is unseen. It reuses existing `goals-note` / `goals-empty` classes, but I have not looked at it.
- **No real HTTP call to staging.** The goals read and the preview function work under RLS in the SQL tests from P4.1 (including anon denied), but the browser-to-REST path with a real sign-in has not run. Doing it needs a staging sign-in (see below). I did not paste the staging key into a command to test anonymously.
- The scope filter on a *goal* scope is tested as a string and never used yet: no UI can select a goal, and with no adopted data every row has no goal, so General reads return the same rows as before.
- Writes (mentor upserts) still do not set a goal. That is P4.3.

## Risks and limits
1. Once goals exist (P4.3), General reads hide goal rows and goal reads hide General rows. Any read I did not scope (other mentor reads, check-ins, Journey) would still see everything. I scoped only the four reads in `loadMentorExecutionLoop`; P4.3 must audit the rest.
2. The existing "goal workspaces" on My Goals are derived from local history, not saved goals. The two lists will appear together when the flag is on; wording distinguishes them but a student could be confused.
3. Turning it on for yourself on staging needs: a `staging-config.local.js`, a staging sign-in method, and `localStorage.setItem('marg_persistent_goals_v1','on')`.
4. The F1 revoke (reviews/24) is drafted only.

## Approval needed
Reply "Approve P4.3" to continue. Goal-aware slash commands stay blocked until P4.3 isolation tests are approved.

---

# Addendum: browser check (requested before P4.3)

**Method (CODE + mocked data, not a real sign-in):** served the worktree on localhost, loaded `index.html` with a fake staging config (a key with the staging project reference and role `anon`, no real key) and a stub that answered staging requests with canned data. The page ran in staging mode with the banner. Nothing was sent to production. Viewport: the tool's mobile preset is **375px wide, not 390px**; desktop was the pane's default size. I looked at the screenshot at 375px, and at desktop in the first run only.

**What I saw**
| State | Result |
|---|---|
| Flag off (live page) | No goals or preview request made; the four mentor reads carry no `goal_id` filter; My Goals unchanged. LIVE. |
| Flag on, goals present | Panel shows both goals and counts. Titles with `<b>` are shown as text, not markup. No horizontal overflow at 375px. A long title wraps. |
| Flag on, no goals | "You have no saved goals yet" plus counts. |
| Flag on, request fails | "could not be loaded"; nothing claims an empty account. |
| Flag on, scope | The four mentor reads carry `goal_id=is.null` (General). |

**Bugs the browser check found (all fixed, tests added)**
1. **HIGH (wrong information shown):** with saved goals on screen, the old text below still said "No goals yet. Marg has no saved goal for you". It also said so when the load failed. The panel now removes those lines when goals are shown or the load failed. Test X8.
2. **MINOR:** the staging banner and the goal list's separator showed garbled characters when a server sent scripts without a charset. The two new-this-phase files are now plain ASCII (escapes). Test X9. My own test page was the likely trigger, so this may not have affected a real server, but the fix is harmless.
3. **MODERATE (staging guard gap):** my test page sent three Google Analytics page-view hits from `127.0.0.1` to the **production** analytics property (G-VZ0N5RH912) before I noticed. These were test page views with no account data (the fake user id is not sent by that tag), but staging should not write to production analytics. `marg-env.js` now sets Google's documented opt-out flag in staging; a later run showed 0 analytics requests. Test W7. The hits already sent cannot be removed by me; they are three page views from a `127.0.0.1` address.

**Tests after fixes:** goals-client 38/38, staging-guard 35/35 (16/16 mutants still killed), full harness passes.

**Still not verified**
- Real sign-in and real staging responses through the REST API (data was stubbed).
- 390px exactly (tested 375px).
- Desktop after the fixes (looked at before them; the fixes change only text and list margin).
- The page was built by rewriting the document, so scripts loaded with a cache-busting parameter; real deploy needs the version strings in `index.html` and the loader bumped (`marg-app.js` still loads as `?v=20261015-vision2`). Without a bump, browsers and the service worker can keep the old app.
- Empty-state text is slightly repetitive (two "no goals" lines).

Local test servers I started have been stopped. Nothing else was changed.

---

# Addendum 2: remaining P4.2 verification

**Status: items 1 and the real-API parts of "verify" are NOT done. They need a staging sign-in that I may not create or type (see "What I need from you"). Everything else is done.**

## Done
| Item | Result |
|---|---|
| Duplicate empty-state message | Fixed. With saved goals enabled and none present, one message shows. The older line is removed whenever the panel loads or fails. Tests X8, X10. |
| 390px (exact) and 1280px (exact) | Viewport set to 390x844 and 1280x800. No horizontal overflow at either. Empty state, goals list with a long title, counts all fit. CODE + stubbed data, not real staging responses. |
| Failed requests never look like an empty list | Unit tests L7-L9, R5, plus the screen earlier showing "could not be loaded" with the old "no goals" lines removed. Real-API version is S14-S16 in the new script (not yet run). |
| Analytics | `ga-disable-G-VZ0N5RH912` is set by the app itself in staging. In the page: 0 analytics collect requests at 390px and at 1280px. The analytics library file itself (gtag.js) still downloads from Google, which sends no page view. LIVE. |
| Requests only to staging | Staging mode refuses production hosts (tests). In the page only the staging host was used for app data, but I stubbed those calls, so this is not proof of real traffic. Other hosts the page contacts, all pre-existing: Google Fonts, Google Tag Manager (script only), raw.githubusercontent.com. None carry account data from my test. |
| Real-API checker | `scripts/staging-rest-check.mjs`, self-tested by `staging-rest-check.test.mjs` against an in-memory fake: 8/8, including that it catches a leaking list, cross-account edit, forged owner, signed-out reads, and refuses a production URL before sending anything. |
| Other tests | goals-client 39/39, staging-guard 35/35, goals-nav 14/14, journey-log 10/10, inline-cards 11/11, full harness passes, 15/15 mutants killed. |

## NOT verified (needs your action)
- Authenticated test account in staging, the goals client against the real staging REST API, and "Account A cannot read Account B's goals" over REST.
  - I did not create accounts. Creating users and typing passwords to sign in are things I must not do, and the staging address is not labelled as a test host by name, so the test-account exception does not clearly apply. P4.1 showed two-account isolation in SQL under row-level security; the REST path has not run.

## What I need from you (about 5 minutes)
1. In the **MARG Staging** dashboard (not production): Authentication, Providers, enable **Email**, and turn **Confirm email** off.
2. Authentication, Users, **Add user**: two users, e.g. `a@example.test` and `b@example.test`, with passwords you choose. Test addresses only.
3. Project Settings, API: copy the project URL and the **anon (public)** key. Do not use the service-role key.
4. In your terminal, from the worktree folder, run (typing the passwords at the hidden prompts):
```bash
read -s A_PASSWORD; read -s B_PASSWORD; export A_PASSWORD B_PASSWORD
STAGING_URL=https://hmgdzkszzuaivyqeeitu.supabase.co STAGING_ANON_KEY=<staging anon key> A_EMAIL=a@example.test B_EMAIL=b@example.test node scripts/staging-rest-check.mjs
```
5. Paste back only the PASS/FAIL lines. The script prints no tokens or passwords, refuses any URL that is production, and writes two goal rows to staging (ids printed). Users cannot delete goals, so I will remove those two rows in staging SQL afterwards.
6. Optional, for a visual check with real data: add `staging-config.local.js` (git-ignored) with the same URL and key, sign in as A yourself in the staging build, and run `localStorage.setItem('marg_persistent_goals_v1','on')`.
