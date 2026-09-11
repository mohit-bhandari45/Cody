# Diffie (AI PR Review Bot) — Project Plan

A living document tracking what's been built, how it works, and what's left. Covers the original v1 build (Parts 1–8) and the v2 feature set built on top of it.

---

## What this project is

A GitHub App that automatically reviews pull requests using an LLM. On PR open or new commits, it fetches the diff, sends it to Gemini for analysis, and posts feedback back on the PR — as inline line comments where possible, and a summary comment covering everything else. It tracks state per PR so repeat reviews are incremental (only reviewing what's new) rather than starting from scratch every time.

**Stack:** Node.js, TypeScript, Express, BullMQ + Redis (Upstash), PostgreSQL (Supabase, local dev via Docker), Socket.IO, Google Gemini (`@google/genai`), GitHub Apps (`@octokit/auth-app`), deployed on Render.

---

## Part 1 — Webhook Receiver ✅

- Express server with a `/webhook` POST endpoint and a `/health` check
- HMAC-SHA256 signature verification (`verifyGithubSignature`) using the raw request body, compared with `crypto.timingSafeEqual` to avoid timing attacks
- Filters events to only `pull_request` type, actions `opened`/`synchronize` (later extended with `closed`/`reopened`)
- Verified against real GitHub `ping` and `pull_request.opened` events via an ngrok tunnel before ever touching a real deployment

## Part 2 — Fetch PR Diff ✅

- `fetchPullRequestFiles()` calls GitHub's `GET /pulls/{number}/files` to get per-file diffs (`patch` field), not just metadata
- Originally authenticated via a fine-grained Personal Access Token (later replaced — see GitHub App section)

## Part 3 — LLM Integration ✅

- `reviewDiff()` in `src/llm/client.ts` using Google's Gemini API (`@google/genai` SDK, model `gemini-3.6-flash`)
- Returns structured JSON (`{ summary, issues: [{ severity, description }] }`), not free text — parsed with a fallback for malformed JSON and markdown-fence stripping
- **Prompt engineering iteration:** an initial seeded-bug test (3 known bugs planted) caught only 1 of 3. Prompt was rewritten with an explicit 6-category checklist (input validation, edge cases, hardcoded values, error handling, security, logic errors) — re-tested and confirmed improved recall

## Part 4 — Post Review Comment ✅

- `postPullRequestComment()` posts to GitHub's `/issues/{number}/comments` endpoint (PRs are "issues" for commenting purposes)
- Full loop verified end-to-end: webhook → verify → fetch diff → LLM review → format → post comment, on a real test PR

## Part 5 — BullMQ Queue + Worker ✅

- Webhook handler enqueues a job and responds to GitHub immediately, rather than doing slow work (LLM calls) inline — avoids GitHub's webhook timeout and disables-on-repeated-failure behavior
- Separate `worker.ts` process consumes the queue with `concurrency: 2`
- Retry config added after inspecting the code and finding jobs had no retries by default: `attempts: 3` with exponential backoff
- Fixed real setup issues along the way: missing `ioredis` peer dependency, a Redis connection (`ECONNRESET`) issue

## Part 6 — Large Diff Handling ✅

- Noise-file filtering (`isNoiseFile`): skips lockfiles, minified/generated code, binaries, via regex patterns
- Character budget (`MAX_DIFF_CHARACTERS = 12000`) with incremental building — stops before exceeding the limit rather than truncating mid-file, appends a note to the prompt when truncated
- **Bug found and fixed:** the noise-filtered `relevantFiles` array was computed but the actual combine loop iterated over the original unfiltered `files` array — noise filtering wasn't actually being applied until this was caught

## Part 7 — Socket.IO Live Dashboard ✅

- Worker publishes job-stage events (`started`, `fetched`, `reviewed`, `completed`) via Redis Pub/Sub on a `job-updates` channel
- Server subscribes to that channel and re-broadcasts via Socket.IO to any connected browser
- Static dashboard (`public/index.html`) redesigned with a git-log-style timeline (nodes + connecting rail per job), live stats strip (jobs today, in progress, issues found, avg review time), per-job progress bar, and a connection status indicator

## Part 8 — Deploy ✅

- Deployed to Render (web service running both `server.ts` and `worker.ts` via `concurrently`, combined into one service for cost/simplicity)
- Real production issues hit and fixed:
  - `tsconfig.json` `moduleResolution` value deprecated by a newer TypeScript version
  - `concurrently` was in `devDependencies` but needed at runtime — moved to `dependencies`
  - Webhook secret mismatch between local `.env` and Render env vars caused `401 Invalid signature` — diagnosed via GitHub's "Recent Deliveries" response inspection

---

# V2 Feature Set

Built after v1 was complete and confirmed working, to make the project more substantial and production-realistic.

## V2.1 — Sharpened LLM Prompt ✅

Replaced vague "check for bugs" instruction with an explicit checklist (input validation, edge cases, hardcoded values, error handling, security, logic errors) after a seeded-bug test exposed under-detection.

## V2.2 — Incremental Review + Persistent History (Postgres) ✅

The biggest single addition. Originally scoped as "handle new commits on a PR" but grew into full stateful review tracking after working through edge cases (PR closed/reopened, force-push, concurrent job races, retry-caused duplicates, empty diffs).

**Schema (`docker/postgres/init.sql`):**
- `pr_reviews` — one row per PR: `owner`, `repo`, `pr_number`, `status` (open/closed/merged), `last_reviewed_sha`, `last_comment_id`, `last_issues` (JSONB). Mutable — represents current state, always overwritten.
- `review_runs` — append-only history: one row per actual review performed, with `commit_sha`, `comment_id`, `summary`, `issues`, `file_count`. `UNIQUE (pr_review_id, commit_sha)` constraint doubles as an idempotency guard against BullMQ retries.

**Local dev:** Postgres via Docker (`docker-compose.yml` + custom Dockerfile baking in `init.sql` on first boot). **Production:** Supabase (had to manually run the schema once via Supabase's SQL editor, and disable RLS — Row Level Security is for untrusted browser clients, not a trusted backend connection like this bot's).

**The flow:**
1. Webhook fires → worker looks up `pr_reviews` for this PR
2. **No row exists** → full diff (base vs. head), review, post comment, create the row
3. **Row exists** → `compareCommits(lastReviewedSha, headSha)` fetches only what's new since last time
   - If GitHub's compare API 404s (force-push/rebase made the old SHA unreachable), fall back to a full diff instead of crashing
4. Issues from this run are compared against `last_issues` (`compareIssues()` — severity + word-overlap heuristic) to classify **new / resolved / still-present**
5. Comment posted reflects that breakdown (strikethrough for resolved, bold for new/still-present)
6. Row updated, and a permanent `review_runs` entry inserted (skipped safely if it's a duplicate retry)

**`closed`/`reopened` webhook actions** now update `status` (distinguishing `merged` vs plain `closed` via `pr.merged`) rather than being ignored; reopening resumes incremental tracking since the row is never deleted.

**Known limitation:** the resolved/new/still-present matching is a heuristic (same severity + ≥2 shared meaningful words), not semantic — it can occasionally mismatch reworded issues. Acceptable for v1 of this sub-feature; a proper fix would need embedding-based similarity, not needed at current scale.

## V2.3 — Convert to a Real Installable GitHub App ✅

Replaced the PAT (acts-as-you, one static long-lived token) with a proper GitHub App (own bot identity, installable by anyone, short-lived auto-rotating tokens).

- Created the App on GitHub (webhook config, permissions: PR read/write, contents read, issues read/write)
- `appAuth.ts` uses `@octokit/auth-app` — `getInstallationToken(installationId)` mints a fresh ~1-hour token per call rather than reading one static `GITHUB_TOKEN`
- Every GitHub API function (`fetchPullRequestFiles`, `postPullRequestComment`, `compareCommits`, `postReviewComments`) now takes `installationId` and fetches its own token
- `installationId` flows from the webhook payload (`req.body.installation.id`) → job data → worker

**Production deploy issues hit and fixed:**
- Private key can't be a file path on Render (no persistent filesystem to pre-place it on) — switched to storing the key's full text content as an env var instead of a file path
- Supabase RLS blocking the backend's own queries — disabled on both tables
- Stale queued jobs (enqueued before `installationId` was added to job data) kept failing on retry — cleared with `reviewQueue.obliterate({ force: true })`

## V2.4 — Inline PR Line Comments ✅

Instead of one summary comment, issues the LLM can confidently place appear as real inline comments on the exact diff line — same UI as a human reviewer clicking a line.

- Extended `ReviewResult` so each issue optionally carries `file` and `line`
- Prompt explicitly teaches unified diff line-counting mechanics: hunk header `+newStart`, count `+`/context lines forward, skip `-` lines, **reset the counter at every new file/hunk** (added after reasoning through the multi-file risk explicitly)
- Verified by hand-counting expected line numbers against real seeded-bug diffs before trusting the feature — single-file, then multi-file with a distinct bug in each file — both attributed correctly
- `postReviewComments()` uses GitHub's batch `/pulls/{number}/reviews` endpoint; if the batch is rejected (one bad line can fail the whole batch), falls back to posting each comment individually so one bad line only costs that one comment
- Worker splits issues into lineable (attempt inline) vs. non-lineable/failed-to-post (merged into the summary comment) — nothing is ever silently dropped
- Confirmed working end-to-end on a real test PR with seeded bugs

**Known limitation:** `compareIssues` (resolved/new/still-present tracking) currently only runs against the issues that end up in the summary comment, not ones that succeeded as inline comments — a gap worth closing later, most naturally by upgrading the matching to use `file`+`line` as the primary signal now that it's available.

---

# Remaining Work

## V2.5 — Per-Repo Config File (in progress)

Let a repo owner drop a `.pr-bot.yml` in their repo to customize behavior, instead of everyone getting identical hardcoded settings — same pattern as `.eslintrc`/`.prettierrc`.

**Design so far:**
- `RepoConfig` type: `ignoreFiles`, `minSeverity`, `inlineComments` (on/off), `maxDiffCharacters`
- `getRepoConfig()` fetches `.pr-bot.yml` via GitHub's contents API (base64-decoded), parses with `js-yaml`, merges over `DEFAULT_CONFIG` via `{ ...DEFAULT_CONFIG, ...parsed }` so a config file only needs to specify overrides
- **Core design principle:** a repo with no config file must behave identically to current behavior (`DEFAULT_CONFIG` matches existing hardcoded values) — this feature must be purely additive, never disruptive to existing installs
- Fails safe: missing file (404) → defaults; malformed YAML → catch, warn, defaults. Never crashes a review over an optional file being wrong.

**Still to do:**
- Write `getRepoConfig()` and wire it into `worker.ts`
- Apply `minSeverity` as a filter on `review.issues` before anything else happens
- Respect the `inlineComments` toggle (skip `postReviewComments` entirely if off)
- Merge `ignoreFiles` into the existing `IGNORED_FILE_PATTERNS` noise filter
- Test with a real `.pr-bot.yml` in the test repo, including a deliberately malformed one to confirm the fail-safe path works

## V2.6 — Multi-Model Comparison (not started)

Wire in a second LLM provider (Groq/Llama, or GPT) and run both against the same diff, to give the seeded-bug evaluation methodology discussed earlier (recall, false positives, review time) a real, demonstrable feature rather than a one-off manual test script.

**Not yet designed in detail** — open questions to resolve before building:
- Run both models on every PR, or only on request/for comparison mode?
- Where do results get shown — both in the same comment, side by side? On the dashboard?
- Does this feed into `compareIssues`/incremental tracking, or stay a separate, parallel path?

## Explicitly deferred / discussed and set aside

- **GitHub Actions-based version** (run as a workflow file instead of a hosted service) — discussed as a legitimate, architecturally different alternative (zero hosting cost, bring-your-own-API-key, no queue/DB/dashboard possible since Actions runners are stateless/ephemeral). Decided to keep as a documented idea, not build alongside the current hosted version, to avoid diluting focus.
- **Vector DB / embedding-based retrieval** — discussed and deliberately not used. The project's actual needs (exact state lookup for one known PR) are a "filing cabinet" problem, not a "search a large corpus for similar things" problem. Flagged as a legitimate future direction specifically for *cross-PR* pattern detection ("has this bug pattern shown up in other PRs before"), which is a genuine similarity-search use case — just not needed for anything currently built.
- **Bring-your-own-API-key for real multi-tenant use** — currently every installation's LLM calls run on the project owner's personal Gemini quota. Identified as the realistic blocker to this being usable by strangers at real scale, not yet solved.

---

# Known Limitations (honest list)

1. Issue matching across reviews (`compareIssues`) is a word-overlap heuristic, not semantic — can mismatch reworded issues
2. Inline-comment issues aren't currently included in the resolved/new/still-present comparison, only summary-comment issues
3. All installations currently share the project owner's Gemini API key/quota — not sustainable at real multi-user scale
4. Line-number accuracy from the LLM, while tested and currently reliable in testing, is not guaranteed on arbitrarily complex diffs — the per-comment fallback exists specifically because this can fail
5. Server and worker are deployed as one combined Render service (via `concurrently`) for cost/simplicity — the architecture supports splitting them for independent scaling, but they aren't currently deployed that way