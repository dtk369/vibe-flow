// test/run.mjs — zero-dependency tests for bin/vibe.mjs (node:test, node >=18).
//
//   node --test          # discovers this file (matches **/test/**/*.mjs)
//   node test/run.mjs    # runs it directly
//
// Each test runs the real helper as a subprocess against an isolated temp
// project dir, so we exercise the actual CLI surface and exit-code contract —
// not internal functions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VIBE = fileURLToPath(new URL('../bin/vibe.mjs', import.meta.url));

// A fresh, auto-cleaned project dir + helpers bound to it.
function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (args) => spawnSync(process.execPath, [VIBE, ...args, '--project-dir', dir], { encoding: 'utf8' });
  const json = (args) => {
    const r = run([...args, '--json']);
    let parsed;
    try { parsed = JSON.parse(r.stdout.trim()); } catch { /* leave undefined */ }
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json: parsed };
  };
  return { dir, run, json };
}

const read = (f) => fs.readFileSync(f, 'utf8');
const write = (f, s) => fs.writeFileSync(f, s);
const understandingPath = (dir, id) => path.join(dir, 'requests', id, 'understanding.md');
const reviewPath = (dir, id) => path.join(dir, 'requests', id, 'review.md');

// Replace the single top-level `status:` frontmatter line (not indented step ones).
const setTopStatus = (f, v) => write(f, read(f).replace(/^status:.*$/m, `status: ${v}`));

// Mark an understanding clarified WITH a requirement — routing past `understand`
// requires both `status: clarified` and a non-empty `requirements` list.
const clarify = (f) => write(f, read(f)
  .replace(/^requirements:.*$/m, 'requirements: [R1]')
  .replace(/^status:.*$/m, 'status: clarified'));

// Write a plan with a chosen top-level status and a set of step statuses.
function writePlan(dir, id, topStatus, stepStatuses) {
  fs.mkdirSync(path.join(dir, 'plans'), { recursive: true });
  const steps = stepStatuses
    .map((s, i) => `  - id: s${i + 1}\n    intent: step ${i + 1}\n    files: []\n    satisfies: []\n    tests: []\n    status: ${s}`)
    .join('\n');
  const body = `---\nid: ${id}\nkind: plan\nrequest: ${id}\nstatus: ${topStatus}\ncreated: 2026-06-29\nsteps:\n${steps}\n---\n\n# Plan ${id}\n`;
  write(path.join(dir, 'plans', `${id}.md`), body);
}

function newReq(P, goal = 'rate limit the public api') {
  const r = P.json(['new', goal]);
  assert.equal(r.status, 0, 'new should exit 0');
  return r.json.id;
}

// ---------------------------------------------------------------- allocation

test('empty project advises /vibe-flow:understand', (t) => {
  const P = project(t);
  const r = P.json(['status']);
  assert.equal(r.status, 0);
  assert.equal(r.json.requests, 0);
  assert.match(r.json.next, /understand/);
});

test('new allocates 0001 and writes a valid understanding skeleton', (t) => {
  const P = project(t);
  const r = P.json(['new', 'rate limit the public api']);
  assert.equal(r.status, 0);
  assert.equal(r.json.id, '0001-rate-limit-the-public-api');
  const u = read(r.json.understanding);
  assert.match(u, /kind: understanding/);
  assert.match(u, /status: draft/);
  assert.ok(fs.existsSync(path.join(P.dir, 'requests', 'INDEX.md')), 'requests index generated');
});

test('request ids are monotonic and never clobber a prior request', (t) => {
  const P = project(t);
  const a = P.json(['new', 'first goal here']).json.id;
  const b = P.json(['new', 'second goal here']).json.id;
  assert.match(a, /^0001-/);
  assert.match(b, /^0002-/);
  assert.ok(fs.existsSync(understandingPath(P.dir, a)));
  assert.ok(fs.existsSync(understandingPath(P.dir, b)));
});

test('adr allocates A0001 (proposed, request set), then A0002', (t) => {
  const P = project(t);
  const id = newReq(P);
  const a1 = P.json(['adr', '--request', id, '--title', 'Token Bucket vs Sliding Window']);
  assert.equal(a1.status, 0);
  assert.match(a1.json.id, /^A0001-/);
  const adr = read(a1.json.path);
  assert.match(adr, /status: proposed/);
  assert.match(adr, new RegExp(`request: ${id}`));
  const a2 = P.json(['adr', '--request', id, '--title', 'Cache eviction policy']);
  assert.match(a2.json.id, /^A0002-/);
});

// ------------------------------------------------------- idempotency (no data loss)

test('plan is idempotent and never clobbers a written body', (t) => {
  const P = project(t);
  const id = newReq(P);
  const first = P.json(['plan', '--request', id]);
  assert.equal(first.json.reused, false);
  fs.appendFileSync(first.json.path, '\nBODY_MARKER_PLAN\n');
  const second = P.json(['plan', '--request', id]);
  assert.equal(second.json.reused, true, 're-running plan reuses the file');
  assert.match(read(first.json.path), /BODY_MARKER_PLAN/, 'plan body survives re-entry');
});

test('review is idempotent and never clobbers a written body', (t) => {
  const P = project(t);
  const id = newReq(P);
  const first = P.json(['review', '--request', id]);
  assert.equal(first.json.reused, false);
  fs.appendFileSync(first.json.path, '\nBODY_MARKER_REVIEW\n');
  const second = P.json(['review', '--request', id]);
  assert.equal(second.json.reused, true);
  assert.match(read(first.json.path), /BODY_MARKER_REVIEW/, 'review body survives re-entry');
});

// ------------------------------------------------------- advisory status routing

test('draft understanding → understand; clarified → plan', (t) => {
  const P = project(t);
  const id = newReq(P);
  assert.equal(P.json(['status', '--request', id]).json.phase, 'understand');
  clarify(understandingPath(P.dir, id));
  assert.equal(P.json(['status', '--request', id]).json.phase, 'plan');
});

test('clarified but zero requirements stays in understand', (t) => {
  const P = project(t);
  const id = newReq(P);
  setTopStatus(understandingPath(P.dir, id), 'clarified'); // skeleton has requirements: []
  assert.equal(P.json(['status', '--request', id]).json.phase, 'understand', 'no requirements blocks progression');
});

test('a proposed ADR (once clarified) → decide', (t) => {
  const P = project(t);
  const id = newReq(P);
  clarify(understandingPath(P.dir, id));
  P.json(['adr', '--request', id, '--title', 'Some decision']);
  assert.equal(P.json(['status', '--request', id]).json.phase, 'decide');
});

test('ADR accepted IN PLACE clears decide; a second allocation orphans it and re-blocks', (t) => {
  const P = project(t);
  const id = newReq(P);
  clarify(understandingPath(P.dir, id));
  const a = P.json(['adr', '--request', id, '--title', 'Some decision']);
  assert.equal(P.json(['status', '--request', id]).json.phase, 'decide', 'a proposed ADR gates at decide');
  // The documented flow EDITS the staged ADR in place to accepted — it must NOT call `vibe adr` again.
  setTopStatus(a.json.path, 'accepted');
  assert.equal(P.json(['status', '--request', id]).json.phase, 'plan', 'accepted in place → plan');
  // Re-allocating (the bug the prose fix prevents) leaves an orphan `proposed` ADR that re-wedges decide.
  P.json(['adr', '--request', id, '--title', 'Some decision']);
  assert.equal(P.json(['status', '--request', id]).json.phase, 'decide', 'a second allocation re-blocks at decide');
});

test('reviewed plan → implement; implementing+all-done → review; implementing+todo → implement', (t) => {
  const P = project(t);
  const id = newReq(P);
  clarify(understandingPath(P.dir, id));

  // A `reviewed` plan means "not started yet" → implement.
  writePlan(P.dir, id, 'reviewed', ['done']);
  assert.equal(P.json(['status', '--request', id]).json.phase, 'implement', 'reviewed → implement');

  // The fix: only `implementing` (not `reviewed`) with all steps done advances to review.
  writePlan(P.dir, id, 'implementing', ['done']);
  assert.equal(P.json(['status', '--request', id]).json.phase, 'review', 'implementing + all done → review');

  // A remaining step keeps it in implement.
  writePlan(P.dir, id, 'implementing', ['todo', 'done']);
  assert.equal(P.json(['status', '--request', id]).json.phase, 'implement', 'implementing + a todo → implement');
});

test('review pass → done; fail → implement', (t) => {
  const P = project(t);
  const id = newReq(P);
  clarify(understandingPath(P.dir, id));
  writePlan(P.dir, id, 'implementing', ['done']);
  P.json(['review', '--request', id]);
  const rev = reviewPath(P.dir, id);
  setTopStatus(rev, 'pass');
  assert.equal(P.json(['status', '--request', id]).json.phase, 'done');
  setTopStatus(rev, 'fail');
  assert.equal(P.json(['status', '--request', id]).json.phase, 'implement');
});

// ------------------------------------------------------------ validate / sync

test('validate: clean project ok (exit 0); invalid status → finding (exit 1)', (t) => {
  const P = project(t);
  const id = newReq(P);
  let v = P.json(['validate']);
  assert.equal(v.status, 0);
  assert.equal(v.json.ok, true);
  setTopStatus(understandingPath(P.dir, id), 'bogus');
  v = P.json(['validate']);
  assert.equal(v.status, 1, 'invalid frontmatter fails validate');
  assert.equal(v.json.ok, false);
  assert.ok(v.json.findings.length > 0);
});

test('sync always exits 0 even with invalid frontmatter, and regenerates indexes', (t) => {
  const P = project(t);
  const id = newReq(P);
  setTopStatus(understandingPath(P.dir, id), 'bogus');
  const s = P.json(['sync']);
  assert.equal(s.status, 0, 'sync is advisory — never blocks');
  assert.equal(s.json.synced, true);
  assert.ok(fs.existsSync(path.join(P.dir, 'requests', 'INDEX.md')));
});

test('status --hook session prints one advisory line and exits 0', (t) => {
  const P = project(t);
  const id = newReq(P);
  const r = P.run(['status', '--hook', 'session']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[vibe-flow\]/);
  assert.match(r.stdout, new RegExp(id));
});

// --------------------------------------------------------- exit-code contract

test('unknown command and missing required args fail (exit 1)', (t) => {
  const P = project(t);
  assert.equal(P.run(['bogus']).status, 1, 'unknown command');
  assert.equal(P.run(['new']).status, 1, 'new without goal');
  assert.equal(P.run(['adr', '--request', 'x']).status, 1, 'adr without title');
  assert.equal(P.run(['adr', '--title', 'y']).status, 1, 'adr without request');
  assert.equal(P.run(['plan']).status, 1, 'plan without request');
});

test('help exits 0 and prints usage', (t) => {
  const P = project(t);
  const r = P.run(['help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: vibe/);
});
