\# Writeup



\## What I chose and why



I built against Conduit, the RealWorld reference app

(\[backend](https://github.com/gothinkster/node-express-realworld-example-app),

\[frontend](https://github.com/gothinkster/react-redux-realworld-example-app)).

It's a genuine separate-repo FE/BE setup with real business logic -- auth,

JWT, article CRUD with slug generation and uniqueness checks, favoriting --

small enough to read end-to-end in a few hours, but with enough real branches

(validation errors, derived fields, uniqueness constraints) to make both the

tests and the agent meaningful rather than trivial.



\## The biggest trade-off I made



The frontend's dev server (`react-scripts@1.1.1`, from 2018) crashes outright

on current Node versions -- it hits a removed internal Node API

(`process.binding('http\_parser')`) inside its `webpack-dev-server` dependency

chain. Rather than downgrade Node system-wide or vendor-patch the dependency

(both real options, but high time-cost for a one-day exercise), I built the

frontend to a static production bundle (`npm run build`) and served it with

a plain static server (`serve -s build`). This is something a real team would

likely flag as a known issue and either fix properly (pin Node via `.nvmrc`,

or upgrade `react-scripts`) or explicitly accept as a documented constraint --

I chose to document and route around it rather than spend an hour on a

dependency upgrade unrelated to the actual assignment.



\## The single biggest threat to this suite's reliability



Tests creating their own fresh data (random usernames/emails via timestamps)

makes the suite self-contained and re-runnable, which is good -- but the

real risk is the suite silently growing stale as the FE/BE repos evolve

without a forcing function to update it. A PR could change the Editor's

placeholder text, or change `createArticle`'s validation order, and nothing

in either app repo's own CI would catch that this tester repo's selectors or

assertions are now wrong -- it would just start failing for what looks like

an unrelated reason, and get treated as flaky rather than a real signal. The

gating mechanism in this repo's README (required status checks triggered

from the app repos, CODEOWNERS review on test changes) is aimed directly at

this: keeping the suite in the loop on every relevant change, not just

catching breaks after the fact.



\## What I'd build next with more time



Real `workflow\_dispatch`/`repository\_dispatch` wiring from the FE/BE repos'

own CI into this tester repo (currently described in the README but not

implemented, since it requires write access to repos I don't own); a

scheduled nightly run against both repos' `master` independent of any single

PR, to catch breakage from two independently-passing PRs that conflict in

combination; and extending the agent to read a function's actual imports

(not just the function body) so it stops guessing at third-party library

behavior, as documented in `agent/README.md`.

