#!/usr/bin/env node
// vibe-flow state helper — zero-dependency, Node >=18, ESM.
// NOT a state machine: just IDs + indexes + frontmatter skeletons.
// The model writes artifact BODIES; this helper writes SKELETONS and INDEXES.
//
// Subcommands (every one accepts --project-dir <dir> [default cwd] and --json):
//   new "<goal>"                      -> allocate request, write understanding.md skeleton
//   adr --request <id> --title "<t>"  -> allocate ADR skeleton (status: proposed)
//   plan --request <id>               -> write plan skeleton (status: draft)
//   review --request <id>             -> write review.md skeleton (status: partial)
//   sync                              -> regenerate INDEX files + advisory validation; ALWAYS exit 0
//   status [--request <id>] [--hook session]
//   validate [--path <f>]             -> nonzero exit on findings (manual/CI)
//   help
//
// Self-check (manual):
//   D=$(mktemp -d)
//   node bin/vibe.mjs new "rate limit the public api" --project-dir "$D" --json
//   node bin/vibe.mjs status --project-dir "$D"
//   node bin/vibe.mjs sync   --project-dir "$D"
//   node bin/vibe.mjs validate --project-dir "$D" ; echo "exit=$?"

import fs from 'node:fs';
import path from 'node:path';

// ---------- tiny utils ----------
const join = path.join;
const exists = (f) => { try { fs.accessSync(f); return true; } catch { return false; } };
const isDir = (f) => { try { return fs.statSync(f).isDirectory(); } catch { return false; } };
const readFile = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const today = () => new Date().toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(4, '0');

function mkdirp(dir) { fs.mkdirSync(dir, { recursive: true }); }

function writeAtomic(file, content) {
  mkdirp(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function slugify(s) {
  const out = String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(/\s+/).filter(Boolean).slice(0, 6).join('-').replace(/^-+|-+$/g, '');
  return out || 'item';
}

function unquote(s) {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

// Always double-quote frontmatter values that may contain ':' or quotes (goal/title).
function yq(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

function cell(s) {
  const v = String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
  return v || '—';
}

// ---------- frontmatter (scalar reader + two targeted scans) ----------
function fmBlock(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : '';
}

// Read top-level scalar `key: value` lines only (no leading indent, non-list values).
function readScalars(text) {
  const out = {};
  for (const line of fmBlock(text).split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][\w-]*):[ \t]*(.*)$/);
    if (!m) continue;
    const v = m[2].trim();
    if (v === '' || v.startsWith('[') || v.startsWith('{')) continue; // list/empty -> not a tracked scalar
    out[m[1]] = unquote(v);
  }
  return out;
}

// Targeted scan: is a top-level list key non-empty? Handles `key: []`, `key: [a, b]`,
// and a following block of `  - item` lines.
function listNonEmpty(text, key) {
  const block = fmBlock(text);
  const lines = block.split(/\r?\n/);
  const re = new RegExp(`^${key}:[ \\t]*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const v = m[1].trim();
    if (v.startsWith('[')) return v.slice(1, -1).trim().length > 0; // inline array
    if (v !== '') return true;                                       // unexpected scalar -> treat as present
    // empty inline: look for following indented `- ` items until next top-level key
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j];
      if (t.trim() === '') continue;
      if (/^\S/.test(t)) return false;          // next top-level key
      if (t.trim().startsWith('-')) return true; // a list item
    }
    return false;
  }
  return false;
}

// Targeted scan: step statuses are the only INDENTED `status:` lines in a plan.
function stepStatuses(text) {
  return [...fmBlock(text).matchAll(/^[ \t]+status:[ \t]*([A-Za-z]+)/gm)].map((m) => m[1].toLowerCase());
}

// ---------- scanning ----------
function scanRequests(p) {
  const dir = join(p, 'requests');
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => /^\d{4}-/.test(n) && isDir(join(dir, n)))
    .map((n) => {
      const file = join(dir, n, 'understanding.md');
      const s = readScalars(readFile(file));
      return { id: n, goal: s.goal || '', status: s.status || '', dir: join(dir, n), file };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function scanAdrs(p) {
  const dir = join(p, 'docs', 'adrs');
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => /^A\d{4}-.*\.md$/.test(n))
    .map((n) => {
      const file = join(dir, n);
      const s = readScalars(readFile(file));
      return { id: s.id || n.replace(/\.md$/, ''), title: s.title || '', request: s.request || '', status: s.status || '', file };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function scanPlans(p) {
  const dir = join(p, 'plans');
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => /^\d{4}-.*\.md$/.test(n))
    .map((n) => {
      const file = join(dir, n);
      const s = readScalars(readFile(file));
      return { id: s.id || n.replace(/\.md$/, ''), request: s.request || '', status: s.status || '', file };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function nextNum(dir, re) {
  let max = 0;
  if (isDir(dir)) for (const n of fs.readdirSync(dir)) { const m = n.match(re); if (m) max = Math.max(max, +m[1]); }
  return max + 1;
}

// ---------- skeleton writers ----------
function skUnderstanding(id, goal, created) {
  return `---
id: ${id}
kind: understanding
goal: ${yq(goal)}
status: draft
created: ${created}
requirements: []
open_questions: []
scope_in: []
scope_out: []
adrs: []
---

# Understanding — ${id}

## Goal
${goal}

## Requirements
<!-- one bullet per requirement; mirror them into frontmatter \`requirements:\` -->

## Open questions
<!-- blocking unknowns; mirror into \`open_questions:\` — empty list once clarified -->

## Scope — in

## Scope — out
`;
}

function skAdr(id, title, request, created) {
  return `---
id: ${id}
kind: adr
title: ${yq(title)}
request: ${request}
status: proposed
created: ${created}
principles: []
supersedes: []
related: []
---

# ${id} — ${title}

## Context

## Decision

## Principles (APoSD / TigerStyle)
<!-- cite the bundled digests under reference/ -->

## Consequences
`;
}

function skPlan(id, request, created) {
  return `---
id: ${id}
kind: plan
request: ${request}
status: draft
created: ${created}
steps: []
---

# Plan — ${id}

## Steps
<!-- one entry per step; mirror into frontmatter \`steps:\`
steps:
  - id: s1
    intent: <what this step achieves>
    files: []
    satisfies: []
    tests: []
    status: todo
-->
`;
}

function skReview(id, request, created) {
  return `---
id: ${id}
kind: review
request: ${request}
status: partial
created: ${created}
checks: []
findings: []
---

# Review — ${id}

## Checks

## Findings
`;
}

// ---------- advisory status mapping ----------
function computeNext(p, id) {
  const uf = join(p, 'requests', id, 'understanding.md');
  if (!exists(uf)) return { phase: 'understand', next: '/vibe-flow:understand', reason: 'no understanding.md' };
  const ut = readFile(uf);
  const u = readScalars(ut);
  // zero requirements blocks progression — keep routing honest with the documented invariant.
  if (u.status !== 'clarified' || listNonEmpty(ut, 'open_questions') || !listNonEmpty(ut, 'requirements'))
    return { phase: 'understand', next: '/vibe-flow:understand', reason: 'clarify requirements' };

  const proposed = scanAdrs(p).some((a) => a.request === id && a.status === 'proposed');
  if (proposed) return { phase: 'decide', next: '/vibe-flow:decide', reason: 'ADR awaiting decision' };

  const pf = join(p, 'plans', id + '.md');
  if (!exists(pf)) return { phase: 'plan', next: '/vibe-flow:plan', reason: 'no plan yet' };
  const pt = readFile(pf);
  const pl = readScalars(pt);
  if (pl.status === 'draft') return { phase: 'plan', next: '/vibe-flow:plan', reason: 'review the plan' };

  const statuses = stepStatuses(pt);
  if (statuses.length === 0) return { phase: 'plan', next: '/vibe-flow:plan', reason: 'plan has no steps' };
  if (pl.status === 'reviewed') return { phase: 'implement', next: '/vibe-flow:implement', reason: 'start implementation' };
  if (statuses.some((s) => s !== 'done')) return { phase: 'implement', next: '/vibe-flow:implement', reason: 'finish remaining steps' };

  const rf = join(p, 'requests', id, 'review.md');
  if (!exists(rf)) return { phase: 'review', next: '/vibe-flow:review', reason: 'run QA/QC' };
  const r = readScalars(readFile(rf));
  if (r.status === 'pass') return { phase: 'done', next: '(complete)', reason: 'request complete' };
  if (r.status === 'fail') return { phase: 'implement', next: '/vibe-flow:implement', reason: 'fix review findings' };
  return { phase: 'review', next: '/vibe-flow:review', reason: 'review in progress' };
}

function pickActive(p) {
  const reqs = scanRequests(p);
  if (!reqs.length) return null;
  for (let i = reqs.length - 1; i >= 0; i--) {
    if (computeNext(p, reqs[i].id).phase !== 'done') return reqs[i].id;
  }
  return reqs[reqs.length - 1].id; // all done -> latest
}

// ---------- indexes ----------
function renderRequests(p, reqs) {
  const rows = reqs.map((r) => {
    const n = computeNext(p, r.id);
    return `| [${cell(r.id)}](${r.id}/understanding.md) | ${cell(r.goal)} | ${cell(r.status)} | ${cell(n.phase)} | ${cell(n.next)} |`;
  });
  return `# Requests\n\n| id | goal | status | phase | next |\n|----|------|--------|-------|------|\n${rows.join('\n')}\n`;
}

function renderAdrs(adrs) {
  const rows = adrs.map((a) => `| [${cell(a.id)}](${path.basename(a.file)}) | ${cell(a.title)} | ${cell(a.request)} | ${cell(a.status)} |`);
  return `# ADRs\n\n| id | title | request | status |\n|----|-------|---------|--------|\n${rows.join('\n')}\n`;
}

function renderPlans(plans) {
  const rows = plans.map((pl) => `| [${cell(pl.id)}](${path.basename(pl.file)}) | ${cell(pl.request)} | ${cell(pl.status)} |`);
  return `# Plans\n\n| id | request | status |\n|----|---------|--------|\n${rows.join('\n')}\n`;
}

function syncIndexes(p) {
  const reqs = scanRequests(p);
  if (reqs.length || isDir(join(p, 'requests'))) writeAtomic(join(p, 'requests', 'INDEX.md'), renderRequests(p, reqs));
  const adrs = scanAdrs(p);
  if (adrs.length || isDir(join(p, 'docs', 'adrs'))) writeAtomic(join(p, 'docs', 'adrs', 'INDEX.md'), renderAdrs(adrs));
  const plans = scanPlans(p);
  if (plans.length || isDir(join(p, 'plans'))) writeAtomic(join(p, 'plans', 'INDEX.md'), renderPlans(plans));
}

// ---------- validation ----------
const SPECS = {
  understanding: { required: ['id', 'kind', 'goal', 'status', 'created'], status: ['draft', 'clarified'] },
  adr: { required: ['id', 'kind', 'title', 'request', 'status', 'created'], status: ['proposed', 'accepted', 'rejected', 'superseded'] },
  plan: { required: ['id', 'kind', 'request', 'status', 'created'], status: ['draft', 'reviewed', 'implementing'] },
  review: { required: ['id', 'kind', 'request', 'status', 'created'], status: ['pass', 'fail', 'partial'] },
};

function validateFile(p, file) {
  const rel = path.relative(p, file) || file;
  const s = readScalars(readFile(file));
  if (!s.kind) return [`${rel}: missing 'kind'`];
  const spec = SPECS[s.kind];
  if (!spec) return [`${rel}: unknown kind '${s.kind}'`];
  const f = [];
  for (const field of spec.required) if (!s[field]) f.push(`${rel}: missing '${field}'`);
  if (s.status && !spec.status.includes(s.status)) f.push(`${rel}: invalid status '${s.status}'`);
  return f;
}

function allArtifacts(p) {
  const files = [];
  for (const r of scanRequests(p)) {
    files.push(r.file);
    const rev = join(r.dir, 'review.md');
    if (exists(rev)) files.push(rev);
  }
  for (const a of scanAdrs(p)) files.push(a.file);
  for (const pl of scanPlans(p)) files.push(pl.file);
  return files;
}

function validateAll(p) {
  const out = [];
  for (const f of allArtifacts(p)) out.push(...validateFile(p, f));
  return out;
}

// ---------- args ----------
const BOOL = new Set(['json']);
function parseArgs(argv) {
  const flags = {}; const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      let key = a.slice(2); let val;
      const eq = key.indexOf('=');
      if (eq >= 0) { val = key.slice(eq + 1); key = key.slice(0, eq); }
      if (BOOL.has(key)) flags[key] = true;
      else { if (val === undefined) val = argv[++i]; flags[key] = val; }
    } else pos.push(a);
  }
  return { pos, flags };
}

function emit(json, obj, human) {
  if (json) console.log(JSON.stringify(obj));
  else if (human) console.log(human);
}

function die(msg) { console.error(`vibe: ${msg}`); process.exit(1); }

const HELP = `vibe-flow state helper

Usage: vibe <command> [--project-dir <dir>] [--json]

  new "<goal>"                      allocate request + understanding.md skeleton
  adr --request <id> --title "<t>"  allocate ADR skeleton (status: proposed)
  plan --request <id>               write plan skeleton (status: draft)
  review --request <id>             write review.md skeleton (status: partial)
  sync                              regenerate INDEX.md files + advisory validation (always exit 0)
  status [--request <id>] [--hook session]   advisory current phase + next command
  validate [--path <f>]             check frontmatter (nonzero exit on findings)
  help
`;

// ---------- main ----------
function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const cmd = pos[0];
  const p = path.resolve(flags['project-dir'] || process.cwd());
  const json = !!flags.json;

  switch (cmd) {
    case 'new': {
      const goal = pos[1];
      if (!goal) die('new requires a "<goal>"');
      const num = nextNum(join(p, 'requests'), /^(\d{4})-/);
      const id = `${pad(num)}-${slugify(goal)}`;
      const dir = join(p, 'requests', id);
      const understanding = join(dir, 'understanding.md');
      writeAtomic(understanding, skUnderstanding(id, goal, today()));
      syncIndexes(p);
      emit(json, { id, dir, understanding }, `created ${id}\n  ${understanding}`);
      break;
    }
    case 'adr': {
      const request = flags.request;
      const title = flags.title;
      if (!request) die('adr requires --request <id>');
      if (!title) die('adr requires --title "<t>"');
      const num = nextNum(join(p, 'docs', 'adrs'), /^A(\d{4})-/);
      const id = `A${pad(num)}-${slugify(title)}`;
      const file = join(p, 'docs', 'adrs', `${id}.md`);
      writeAtomic(file, skAdr(id, title, request, today()));
      syncIndexes(p);
      emit(json, { id, path: file }, `created ADR ${id}\n  ${file}`);
      break;
    }
    case 'plan': {
      const request = flags.request;
      if (!request) die('plan requires --request <id>');
      const file = join(p, 'plans', `${request}.md`);
      const reused = exists(file);
      if (!reused) writeAtomic(file, skPlan(request, request, today())); // idempotent: never clobber a written plan body
      syncIndexes(p);
      emit(json, { path: file, reused }, `${reused ? 'reusing' : 'created'} plan\n  ${file}`);
      break;
    }
    case 'review': {
      const request = flags.request;
      if (!request) die('review requires --request <id>');
      const file = join(p, 'requests', request, 'review.md');
      const reused = exists(file);
      if (!reused) writeAtomic(file, skReview(request, request, today())); // idempotent: never clobber a written review body
      syncIndexes(p);
      emit(json, { path: file, reused }, `${reused ? 'reusing' : 'created'} review\n  ${file}`);
      break;
    }
    case 'sync': {
      syncIndexes(p);
      const warnings = validateAll(p);
      for (const w of warnings) console.error(`warn: ${w}`);
      if (json) console.log(JSON.stringify({ synced: true, warnings }));
      process.exit(0); // ALWAYS
    }
    case 'status': {
      if (flags.hook === 'session') {
        const reqs = scanRequests(p);
        for (let i = reqs.length - 1; i >= 0; i--) {
          const n = computeNext(p, reqs[i].id);
          if (n.phase !== 'done') { console.log(`[vibe-flow] ${reqs[i].id}: next → ${n.next} (${n.reason})`); break; }
        }
        process.exit(0);
      }
      const id = flags.request || pickActive(p);
      if (!id) { emit(json, { requests: 0, next: '/vibe-flow:understand' }, 'no requests yet — run /vibe-flow:understand (vibe new "<goal>")'); break; }
      const n = computeNext(p, id);
      emit(json, { request: id, ...n }, `[vibe-flow] ${id}: phase ${n.phase} — next → ${n.next} (${n.reason})`);
      break;
    }
    case 'validate': {
      const findings = flags.path ? validateFile(p, path.resolve(flags.path)) : validateAll(p);
      if (json) console.log(JSON.stringify({ ok: findings.length === 0, findings }));
      else if (findings.length) for (const f of findings) console.error(f);
      else console.log('ok');
      process.exit(findings.length ? 1 : 0);
    }
    case 'help':
    case undefined:
      console.log(HELP);
      break;
    default:
      die(`unknown command '${cmd}' (try: help)`);
  }
}

main();
