\# Conduit Tester Repo



A central, independent test suite for the Conduit app (Medium-clone reference app:

\[backend](https://github.com/gothinkster/node-express-realworld-example-app) +

\[frontend](https://github.com/gothinkster/react-redux-realworld-example-app)),

maintained separately from both application repos.



\## Why this exists



The team ships to `main` on the frontend and backend repos many times a day.

This repo is the guardrail: it holds the cross-cutting tests that prove a given

frontend + backend combination actually works together, and it's the thing that

gates merges -- not a copy of unit tests already living in each app repo.



\## What's here



\- `tests/api/` -- tests that hit the backend's REST API directly (no browser).

&#x20; Fast, and they pin down the \*contract\* (status codes, error shapes, slug

&#x20; format) that the frontend depends on.

\- `tests/e2e/` -- Playwright tests that drive the real frontend in a browser

&#x20; against the real backend. Slower, but they catch integration breaks that API

&#x20; tests alone would miss (a frontend selector change, a broken redirect after

&#x20; a successful API call, etc.).



Run locally:

```bash

npm install

npx playwright install

npm test            # both suites

npm run test:api    # API only

npm run test:e2e    # E2E only

```

(Assumes the backend is running on :3000 and frontend on :4100 -- see

`.github/workflows/test.yml` for the full boot sequence including Postgres.)



\## Gating strategy



The goal: PRs in the FE/BE repos can't reach `main` unless this suite is green

against the resulting combination, and a human (the automation engineer) is in

the loop for changes to the suite itself.



Concretely, this is what I'd actually wire up:



\*\*1. Required status check on the FE/BE repos.\*\*

Each app repo's CI workflow, on every PR, triggers this tester repo's workflow

via `workflow\_dispatch`, passing the PR's branch/ref as input (see the

`backend\_ref` / `frontend\_ref` inputs in `test.yml` -- the other side defaults

to `master` so a backend-only PR is tested against the frontend's current main,

and vice versa). The tester repo posts its result back as a commit status on

the originating PR. Branch protection on `main` in both FE and BE repos marks

that status check as \*\*required\*\* -- the PR cannot merge until it's green.



\*\*2. CODEOWNERS in this repo.\*\*

A `CODEOWNERS` file here names the automation engineer as a required reviewer

for any change under `tests/` or `.github/workflows/`. This means nobody can

quietly weaken or delete a test to force a merge through -- changes to the gate

itself get the same scrutiny as changes to production code.



\*\*3. PR template on the FE/BE repos.\*\*

A short checklist item -- "Does this change affect article creation, auth, or

the editor flow? If so, has the tester repo been checked/updated?" -- keeps the

suite from silently going stale as features evolve.



\*\*4. Keeping the suite from becoming the bottleneck.\*\*

The suite is intentionally small (a handful of high-value tests, not exhaustive

coverage) so it stays fast and reviewable. If it starts flaking or growing

without bound, that's a signal to prune, not to bolt on more retries.



\## What I'd build next with more time



\- Real `repository\_dispatch`/`workflow\_dispatch` wiring from the FE/BE repos'

&#x20; own CI into this repo (stubbed conceptually above, not implemented -- out of

&#x20; scope for a one-day exercise).

\- A nightly/scheduled run against `master` of both app repos, independent of

&#x20; any single PR, to catch breakage from two PRs that each passed individually

&#x20; but conflict in combination.

\- A lightweight dashboard or notification summarizing suite health over time.

