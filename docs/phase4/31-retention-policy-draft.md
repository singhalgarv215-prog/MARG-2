# Retention policy for goal deletion: what is known, what is not, what you must decide

Status: DRAFT for the founder. Nothing here is a promise to students. Every sentence marked **Verified** was checked in the repo or on MARG Staging in this phase. Everything marked **Not known** or **Decision** must not be shown to students until it is settled. This is not legal advice.

## 1. What the system does today (Verified)

| Item | What happens now | Source |
|---|---|---|
| Permanent deletion of a goal | Removes the goal, its diagnoses, tasks, attempts, evidence, conversations, messages (including messages whose link to the conversation was missing), uploaded question pages' database rows and extracted text, question state, response reviews, bring-in records, sharing choices, the adoption record and the Daily Loop focus, in one database transaction. | Real-API run on staging (checks D7 to D9), canary scan |
| Uploaded files in storage | The app deletes the files first. The database then refuses to delete the goal if any un-removed page remains. | check D5 |
| Tombstone (goal id, date, counts) | Kept with **no expiry**. No cleanup job exists. Contains no text. | `goal_tombstones`, no TTL in any migration |
| Event log (`goal_events`) | Counts only, kept with no expiry. Contains the goal id. A student can also write rows into it, so it is not audit evidence; only tombstones are. | reviewer finding 8, foundation migration |
| Canary scan after deletion | 234 text/JSON/uuid columns across all `public` tables searched for the deleted goal's text and conversation ids: only hits were the goal id inside `goal_events` (3 rows) and `goal_tombstones` (1 row). No student text. | SQL scan on staging |
| Account deletion | By email request to support@trymarg.com, processed within 7 business days. | privacy.html (last updated September 2026) |
| De-identified quality copies | Optional per report, copied only if the student allowed it. | privacy.html |

## 2. What is NOT removed by goal deletion (Verified by reading the function)

- Account profile fields (the profile is account level, not goal data).
- Check-ins, reminder (push queue) text and delivery records, shared question links, feedback text, engagement events.
- Uploads that are not linked to one of the goal's conversations.
- **Quality-test copies (`marg_eval_cases`)** made from a student's report with permission. Deleting the report only sets `source_review_id` to null; the copy stays. The table is empty on staging, so this was **not exercised**.
- Text already sent to Google's Gemini API for replies and question-image reading.
- Database backups.

## 3. Open points and who decides

### 3.1 Tombstone duration. **Decision (founder)**
The tombstone exists so a student's other devices can delete their own copies the next time they sign in. A device that does not sign in again for a long time still needs it.
- Option A: keep until account deletion (simplest; what is built; no student text is held).
- Option B: expire after a fixed period (for example 12 months, as proposed earlier). A device that signs in later than that would keep a local copy of a deleted goal.
Not built either way: there is no expiry job. Choose A or B; B needs a small scheduled cleanup and a sentence on the delete screen.

### 3.2 Backup expiry. **Not known**
The Supabase organization "Marg" reports plan `free`. Whether backups exist and for how long depends on the plan and settings, and **I could not read that from here**. Check the dashboard (Project settings, Backups) for both projects. Until the number is known, the screen's current wording "backups until they expire" is the only honest wording; do not state a period.

### 3.3 Legally required retention. **Not known**
Whether any record about a student must be kept after they delete (tax, consumer, or data-protection record-keeping, and the tombstone itself) is a question for counsel. I have not assumed any. If counsel says something must be kept, the delete screen has to say what and for how long.

### 3.4 Quality-test copies (model improvement). **Decision (founder, with counsel)**
Today's behaviour: the copy survives goal deletion and report deletion.
- Option A: keep them and say so plainly on the delete screen (already says "copies you allowed for model improvement" are not removed) and on the privacy page.
- Option B: delete them when the source goal is deleted. This needs the copy to remember which goal it came from, which it does not; it would be a new column and a backfill.
The privacy page says the copy is de-identified. Nobody has checked here that the stored text really is. Do not rely on that word until someone reads real rows.

### 3.5 Text processed by Google. **Not known**
How long Google keeps API requests depends on the Gemini API terms and plan in use. I did not check which applies. Marg cannot delete it.

### 3.6 The public privacy page. **Decision**
privacy.html (September 2026) does not mention goals, archiving, permanent deletion or tombstones. It must be updated before any student can use the feature. Draft wording is not provided here because it would state retention periods that are not decided.

## 4. Decisions needed before any student sees deletion

1. Tombstone: keep until account deletion, or expire after N months?
2. Backups: the figure from the dashboard, then wording.
3. Counsel's answer on mandatory retention.
4. Quality-test copies: keep and disclose, or delete with the goal?
5. Approve the update to privacy.html.
