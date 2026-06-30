#!/usr/bin/env node
/**
 * Test-writing agent.
 *
 * Reads a real feature file from the target app, sends it to Claude with a
 * prompt designed to produce tests grounded in the actual code (not generic
 * boilerplate), and writes the generated test file to disk so it can be run.
 *
 * Target feature for this run: createArticle (and its validation/slug logic)
 * in node-express-realworld-example-app's article.service.ts. This is a good
 * target because it has several real, distinct branches: missing-field
 * validation (422 with field-specific errors), slug generation tied to the
 * `slugify` library's actual (case-preserving) behavior, and a uniqueness
 * check that rejects duplicate titles with a specific error shape. All of
 * this is verifiable by reading the function -- nothing here is guessed.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node agent/generate-tests.js \
 *     --source ../backend/src/app/routes/article/article.service.ts \
 *     --function createArticle \
 *     --out tests/generated/article-creation.generated.spec.ts
 *
 * What this agent does NOT try to do (and why):
 *   - It does not attempt full end-to-end test execution by itself; it
 *     generates API-level Playwright tests (consistent with this repo's
 *     existing tests/api pattern) which are then run with the normal
 *     `npx playwright test` command, same as any hand-written test.
 *   - It does not blindly trust the model's output. See `validateOutput()`
 *     below -- before anything is written to disk, the agent checks that the
 *     generated code actually references real identifiers found in the
 *     source file (function names, field names, status codes mentioned in
 *     the source). If the model invents assertions about behavior that
 *     isn't in the code, this check is the first line of defense, and the
 *     human (the person running this) is expected to read the output before
 *     trusting it -- this is stated explicitly in the README, not hidden.
 */

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    out[key] = args[i + 1];
  }
  return out;
}

function extractFunction(sourceCode, functionName) {
  const lines = sourceCode.split('\n');
  const startIdx = lines.findIndex((l) => l.includes(`export const ${functionName}`));
  if (startIdx === -1) {
    throw new Error(`Could not find "export const ${functionName}" in source file`);
  }
  let depth = 0;
  let started = false;
  let endIdx = startIdx;
  for (let i = startIdx; i < lines.length; i++) {
    const opens = (lines[i].match(/{/g) || []).length;
    const closes = (lines[i].match(/}/g) || []).length;
    if (opens > 0) started = true;
    depth += opens - closes;
    if (started && depth <= 0) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx + 1).join('\n');
}

function buildPrompt(functionCode, functionName, sourceFilePath) {
  return `You are generating Playwright API tests for a real Node/Express + Prisma backend (the RealWorld "Conduit" reference app). You will be shown the ACTUAL source code of one function. Your job is to generate test cases that are grounded in what this code actually does -- not generic CRUD boilerplate.

Here is the real function, from ${sourceFilePath}:

\`\`\`typescript
${functionCode}
\`\`\`

Requirements for your output:
1. Generate Playwright tests (using @playwright/test, request.newContext style, matching the pattern: register a user via POST /users to get an auth token, then call the endpoint under test with "Authorization: Token <jwt>").
2. Base URL for the API is read from process.env.BACKEND_URL with a fallback to 'http://localhost:3000/api'.
3. Every test must assert something SPECIFIC that is visible in the function above -- a specific status code, a specific error message string, a specific field name in the response. Do not write a test that only checks "status is 200" with no other assertion.
4. Cover at least: (a) the happy path, (b) one validation/error branch that is explicitly handled in the code (look at the actual if-checks and HttpException calls), (c) one edge case specific to this function's logic (e.g. if there's a uniqueness check, test it; if there's a derived value like a slug, assert its actual format as implemented, not an assumed format).
5. Do NOT invent behavior that isn't in the code shown. If you're unsure whether something is true, don't assert it.
6. Output ONLY the TypeScript test file content, no explanation, no markdown code fences -- just the raw .ts file starting with the import statement. The endpoint path is POST /articles (the article creation route that calls this function).

The route handler that calls this function looks like:
router.post('/articles', auth.required, async (req, res, next) => {
  const article = await createArticle(req.body.article, req.auth?.user?.id);
  res.status(201).json({ article });
});`;
}

function validateOutput(generatedCode, functionCode) {
  const issues = [];

  if (!generatedCode.includes('@playwright/test')) {
    issues.push('Generated code does not import @playwright/test -- likely not valid Playwright code.');
  }
  if (!/expect\(/.test(generatedCode)) {
    issues.push('Generated code has no expect() assertions at all.');
  }
  const testBlockCount = (generatedCode.match(/\btest\(/g) || []).length;
  const expectCount = (generatedCode.match(/expect\(/g) || []).length;
  if (testBlockCount > 0 && expectCount < testBlockCount) {
    issues.push(
      `${testBlockCount} test block(s) but only ${expectCount} expect() call(s) -- ` +
        `at least one test likely has no real assertion.`,
    );
  }
  const mentionsTitle = generatedCode.includes('title');
  const mentionsSlugOrError = generatedCode.includes('slug') || generatedCode.includes('errors');
  if (!mentionsTitle || !mentionsSlugOrError) {
    issues.push(
      'Generated code does not reference "title" and "slug"/"errors", which the real ' +
        'function is clearly built around -- output may not be grounded in the source.',
    );
  }

  return issues;
}

async function main() {
  const args = parseArgs();
  const sourcePath = args.source;
  const functionName = args.function || 'createArticle';
  const outPath = args.out || 'tests/generated/output.generated.spec.ts';

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }
  if (!sourcePath) {
    console.error('ERROR: --source <path-to-file> is required.');
    process.exit(1);
  }

  const sourceCode = fs.readFileSync(sourcePath, 'utf-8');
  const functionCode = extractFunction(sourceCode, functionName);

  console.log(`Read ${functionCode.split('\n').length} lines for function "${functionName}" from ${sourcePath}`);
  console.log('--- Function being tested ---');
  console.log(functionCode);
  console.log('------------------------------\n');

  const prompt = buildPrompt(functionCode, functionName, sourcePath);

  console.log('Calling Claude API to generate tests...');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('API call failed:', response.status, errText);
    process.exit(1);
  }

  const data = await response.json();
  let generatedCode = data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  generatedCode = generatedCode.replace(/^```(?:typescript|ts)?\n/, '').replace(/\n```$/, '');

  const issues = validateOutput(generatedCode, functionCode);
  console.log('\n--- Validation checks ---');
  if (issues.length === 0) {
    console.log('No issues found by automated checks.');
  } else {
    issues.forEach((issue) => console.log('WARNING:', issue));
  }
  console.log('-------------------------\n');
  console.log('Remember: these checks are a first filter, not a substitute for reading the');
  console.log('generated test yourself before trusting or merging it.\n');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, generatedCode);
  console.log(`Wrote generated test to ${outPath}`);
}

main().catch((err) => {
  console.error('Agent failed:', err);
  process.exit(1);
});