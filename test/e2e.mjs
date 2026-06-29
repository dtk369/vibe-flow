// test/e2e.mjs — end-to-end integration test of the vibe-flow DETERMINISTIC spine
// against a throwaway project. It builds a small real codebase in a temp dir, then
// walks one request through all five phases (understand → decide → plan → implement
// → review) and a second request to prove cross-request ADR awareness. The test
// plays the role of the subagents (it writes the artifact BODIES); the helper does
// every state transition, and we assert the advisory routing at each step.
//
//   node test/e2e.mjs                 # run + clean up
//   VIBE_KEEP=1 node test/e2e.mjs     # run + keep the throwaway project, print its path
//
// NOTE: this exercises the helper + artifacts + routing + indexes end-to-end. It does
// NOT run the live LLM subagents / AskUserQuestion / tool-conducting — that needs a
// real `/plugin install` session.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VIBE = fileURLToPath(new URL('../bin/vibe.mjs', import.meta.url));
const KEEP = !!process.env.VIBE_KEEP;

const read = (f) => fs.readFileSync(f, 'utf8');
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const tree = (dir, sub = '') => fs.readdirSync(path.join(dir, sub), { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? tree(dir, path.join(sub, d.name)) : [path.join(sub, d.name)])).sort();

// A tiny but real throwaway codebase the workflow reasons about.
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-'));
  write(path.join(dir, 'package.json'), JSON.stringify({ name: 'links-api', version: '0.0.0', type: 'module' }, null, 2) + '\n');
  write(path.join(dir, 'README.md'), '# links-api\n\nThrowaway URL-shortener used to exercise vibe-flow.\n');
  write(path.join(dir, 'src/store.mjs'), 'const links = new Map();\nexport const put = (s, u) => links.set(s, u);\nexport const get = (s) => links.get(s);\n');
  write(path.join(dir, 'src/api.mjs'), "import { put, get } from './store.mjs';\nexport function createLink(slug, url) { put(slug, url); return { slug, url }; }\nexport function resolve(slug) { return get(slug) ?? null; }\n");
  return dir;
}

function runner(dir) {
  const run = (args) => spawnSync(process.execPath, [VIBE, ...args, '--project-dir', dir], { encoding: 'utf8' });
  const json = (args) => { const r = run([...args, '--json']); let j; try { j = JSON.parse(r.stdout.trim()); } catch { /* */ } return { ...r, json: j }; };
  const phase = (id) => json(['status', '--request', id]).json.phase;
  return { run, json, phase };
}

function writePlan(dir, id, topStatus, steps) {
  const body = steps.map((s, i) => `  - id: s${i + 1}\n    intent: ${s.intent}\n    files: [${s.files.join(', ')}]\n    satisfies: [${s.satisfies.join(', ')}]\n    tests: [${s.tests.join(', ')}]\n    status: ${s.status}`).join('\n');
  write(path.join(dir, 'plans', `${id}.md`),
`---
id: ${id}
kind: plan
request: ${id}
status: ${topStatus}
created: 2026-06-29
steps:
${body}
---

# Plan — ${id}
`);
}

test('vibe-flow end-to-end on a throwaway project', async (t) => {
  const dir = makeProject();
  const V = runner(dir);
  console.log(`\n  throwaway project: ${dir}`);
  let id;
  try {
    await t.test('phase 1 — understand: new + clarify → routes to plan', () => {
      const r = V.json(['new', 'add per-IP rate limiting to the public API']);
      assert.equal(r.status, 0);
      id = r.json.id;
      // simulate vibe-clarifier writing a clarified understanding.md
      write(r.json.understanding,
`---
id: ${id}
kind: understanding
goal: "add per-IP rate limiting to the public API"
status: clarified
created: 2026-06-29
requirements: [R1, R2]
open_questions: []
scope_in: [src/api.mjs]
scope_out: [auth, persistence]
adrs: []
---

# Understanding — ${id}
- R1: createLink rejects callers over a per-IP budget.
- R2: limit is configurable; over-limit returns a clear error.
`);
      assert.equal(V.phase(id), 'plan', 'clarified + no ADR → plan');
      console.log(`  new → ${id}; clarified → status: ${V.phase(id)}`);
    });

    await t.test('phase 2 — decide: proposed ADR → decide; accepted → plan', () => {
      const a = V.json(['adr', '--request', id, '--title', 'Rate-limit algorithm: token bucket vs fixed window']);
      assert.match(a.json.id, /^A0001-/);
      assert.equal(V.phase(id), 'decide', 'a proposed ADR routes to decide');
      console.log(`  proposed ${a.json.id} → status: ${V.phase(id)}`);
      // human accepts on the main thread → record the decision
      write(a.json.path,
`---
id: ${a.json.id}
kind: adr
title: "Rate-limit algorithm: token bucket vs fixed window"
request: ${id}
status: accepted
created: 2026-06-29
principles: [tigerstyle:bounded, aposd:deep-modules]
supersedes:
related:
---

# ${a.json.id}
## Decision
Token-bucket per IP (cap 60, refill 1/s) behind one rateLimit(ip) module.
`);
      assert.equal(V.phase(id), 'plan', 'accepted ADR → plan');
      console.log(`  accepted → status: ${V.phase(id)}`);
    });

    await t.test('phase 3 — plan: draft → "review it"; reviewed → implement', () => {
      const p = V.json(['plan', '--request', id]);
      assert.equal(p.json.reused, false);
      assert.equal(V.phase(id), 'plan', 'a draft plan still says plan (review it)');
      writePlan(dir, id, 'reviewed', [
        { intent: 'add rateLimit(ip) token-bucket module', files: ['src/ratelimit.mjs'], satisfies: ['R1', 'R2'], tests: ['test/ratelimit.test.mjs'], status: 'todo' },
        { intent: 'enforce rateLimit in createLink', files: ['src/api.mjs'], satisfies: ['R1'], tests: ['test/api.test.mjs'], status: 'todo' },
      ]);
      assert.equal(V.phase(id), 'implement', 'reviewed plan → implement');
      console.log(`  plan reviewed → status: ${V.phase(id)}`);
    });

    await t.test('phase 4 — implement: implementing + steps done → review', () => {
      // implementer writes real code, flips plan to implementing, marks steps done
      write(path.join(dir, 'src/ratelimit.mjs'),
        '// token bucket per IP (A0001)\nconst buckets = new Map();\nexport function rateLimit(ip, cap = 60) {\n  const b = buckets.get(ip) ?? { tokens: cap };\n  if (b.tokens <= 0) return false;\n  b.tokens -= 1; buckets.set(ip, b); return true;\n}\n');
      writePlan(dir, id, 'implementing', [
        { intent: 'add rateLimit(ip) token-bucket module', files: ['src/ratelimit.mjs'], satisfies: ['R1', 'R2'], tests: ['test/ratelimit.test.mjs'], status: 'done' },
        { intent: 'enforce rateLimit in createLink', files: ['src/api.mjs'], satisfies: ['R1'], tests: ['test/api.test.mjs'], status: 'done' },
      ]);
      assert.equal(V.phase(id), 'review', 'implementing + all steps done → review');
      console.log(`  implemented (src/ratelimit.mjs) → status: ${V.phase(id)}`);
    });

    await t.test('phase 5 — review: pass → done', () => {
      const r = V.json(['review', '--request', id]);
      assert.equal(r.json.reused, false);
      write(r.json.path,
`---
id: ${id}
kind: review
request: ${id}
status: pass
created: 2026-06-29
checks: [tests, code-review, security-review, ponytail]
findings: []
---

# Review — ${id}
All requirements satisfied; A0001 honored; no over-engineering.
`);
      assert.equal(V.phase(id), 'done', 'review pass → done');
      console.log(`  review pass → status: ${V.phase(id)} ✓ full lifecycle complete`);
    });

    await t.test('continuity — a second request sees the first request\'s accepted ADR', () => {
      V.json(['sync']);
      const adrIndex = read(path.join(dir, 'docs', 'adrs', 'INDEX.md'));
      assert.match(adrIndex, /A0001-/);
      assert.match(adrIndex, /accepted/);
      const r2 = V.json(['new', 'add request logging middleware']);
      assert.match(r2.json.id, /^0002-/);
      // the clarifier for request 2 reads docs/adrs/INDEX.md — assert that record is present & correct
      assert.ok(read(path.join(dir, 'docs', 'adrs', 'INDEX.md')).includes('accepted'), 'architecture record is available to the new request');
      console.log(`  ${r2.json.id} can see A0001 (accepted) in the ADR index`);
    });

    await t.test('whole project validates clean (exit 0)', () => {
      const v = V.json(['validate']);
      assert.equal(v.status, 0, v.stderr);
      assert.equal(v.json.ok, true);
    });

    await t.test('artifact trail is complete', () => {
      const arts = tree(dir).filter((f) => /^(requests|docs|plans)\//.test(f));
      console.log('\n  vibe-flow artifacts produced:');
      for (const f of arts) console.log('    ' + f);
      assert.ok(arts.includes(`requests/${id}/understanding.md`));
      assert.ok(arts.includes(`requests/${id}/review.md`));
      assert.ok(arts.some((f) => /^docs\/adrs\/A0001-.*\.md$/.test(f)));
      assert.ok(arts.includes(`plans/${id}.md`));
      assert.ok(arts.includes('requests/INDEX.md') && arts.includes('docs/adrs/INDEX.md') && arts.includes('plans/INDEX.md'));
    });
  } finally {
    if (KEEP) console.log(`\n  VIBE_KEEP set — throwaway project kept at:\n    ${dir}\n`);
    else fs.rmSync(dir, { recursive: true, force: true });
  }
});
