\# Test-Writing Agent



`agent/generate-tests.js` reads a real function from the target app's source

code and uses the Claude API to generate Playwright tests grounded in that

function's actual logic.



\## How it works



1\. \*\*Read real code, not the whole file.\*\* The agent locates the target

&#x20;  function (`createArticle` in `article.service.ts`) by name and extracts

&#x20;  just that function via brace-depth matching, rather than dumping the

&#x20;  entire file at the model. This keeps the prompt focused and makes it easy

&#x20;  to verify exactly what the model saw.

2\. \*\*Prompt the model with explicit grounding rules.\*\* The prompt instructs

&#x20;  Claude to assert specific, verifiable details (exact status codes, exact

&#x20;  error message strings, the route handler's real auth pattern) and

&#x20;  explicitly says not to invent behavior that isn't shown in the code.

3\. \*\*Validate before trusting.\*\* Before writing anything to disk,

&#x20;  `validateOutput()` runs cheap structural checks: does the output import

&#x20;  Playwright correctly, does every `test()` block have a real `expect()`

&#x20;  call (catching the "assert true" failure mode), does the output reference

&#x20;  the real field names the function is built around (`title`, `slug`,

&#x20;  `errors`). These are a first filter, not a substitute for human review.

4\. \*\*A human reads and runs the output.\*\* This step is not automated, and

&#x20;  shouldn't be -- see the worked example below.



\## Run it



\\`\\`\\`bash

ANTHROPIC\_API\_KEY=sk-ant-... node agent/generate-tests.js \\

&#x20; --source ../backend/src/app/routes/article/article.service.ts \\

&#x20; --function createArticle \\

&#x20; --out tests/generated/article-creation.generated.spec.ts

\\`\\`\\`



Then run the generated test like any other:

\\`\\`\\`bash

npx playwright test tests/generated

\\`\\`\\`



\## A worked example of "keeping output honest"



On the run used for this assignment, the agent generated 9 tests against

`createArticle`. 8 were correct on the first try -- including a genuinely

subtle one (asserting `tagList` falls back to `\[]` when the input isn't an

array, which mirrors `Array.isArray(tagList) ? tagList : \[]` in the real

code).



One test was wrong: it asserted the generated slug would be lowercase

(`test-article-title-21`), assuming the `slugify()` import lowercases its

input. The actual backend's `slugify` is case-preserving --

running the test against the live server showed the real slug is

`Test-Article-Title-21`. The agent had no visibility into `slugify`'s

implementation (it's a third-party import, not shown in the extracted

function), so it filled the gap with a plausible-but-wrong assumption.



This is exactly the kind of "plausible but worthless" output the assignment

warns about, and it's also exactly why this agent does not auto-merge or

auto-trust its own output: the test was run, the failure was real and

specific (not flaky), and a human (not the agent) corrected the assertion

based on observed live behavior, leaving a comment in the test file

documenting why.



\## How I'd stop this class of failure with more time



\- Extract and include the \*imports\* a target function relies on (here,

&#x20; `slugify`'s own source or its npm README) so the model has grounding for

&#x20; third-party behavior, not just the function under test.

\- Add a second validation pass: actually run the generated test once in a

&#x20; "dry mode" immediately after generation and flag (not silently fix) any

&#x20; failures back to the person running the agent, rather than waiting for a

&#x20; manual `npx playwright test` to surface it.

\- Track a small log of "agent generated this, human corrected this" pairs

&#x20; over time -- if certain kinds of guesses (slug casing, date formatting,

&#x20; ID generation schemes) keep recurring, that's a signal to hardcode those

&#x20; facts into the prompt rather than re-discovering them every run.

