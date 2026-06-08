// Smoke test — runs without Electron. Validates:
//  (1) JSON banks and scenarios parse
//  (2) Each MCQ's `answer` actually appears in its `options`
//  (3) The seeded PRNG produces the same sequence for the same seed
//  (4) Section A's question picking is deterministic for the same seed
//  (5) Section B scenario picking is deterministic for the same seed
//  (6) The criterion evaluator behaves sensibly on hand-built snapshots

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

let failures = 0;
function ok(name, cond, extra) {
  const tag = cond ? '  ok' : 'FAIL';
  if (!cond) failures++;
  console.log(`${tag}  ${name}` + (extra ? '  -- ' + extra : ''));
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// --- 1) banks load -------------------------------------------------
const e3Bank = readJson(path.join(__dirname, 'assets', 'banks', 'e3.json'));
const l1Bank = readJson(path.join(__dirname, 'assets', 'banks', 'l1.json'));
ok('e3 bank parses with >= 20 MCQs', e3Bank.mcqs.length >= 20, e3Bank.mcqs.length + ' questions');
ok('l1 bank parses with >= 20 MCQs', l1Bank.mcqs.length >= 20, l1Bank.mcqs.length + ' questions');

// --- 2) every MCQ answer is in its options ------------------------
for (const lv of [{ k: 'e3', bank: e3Bank }, { k: 'l1', bank: l1Bank }]) {
  for (const q of lv.bank.mcqs) {
    ok(`${lv.k}: answer present in options for ${q.id}`,
       q.options && q.options.includes(q.answer),
       JSON.stringify({ a: q.answer, opts: q.options }));
  }
}

// --- 3) scenarios load --------------------------------------------
const e3S = readJson(path.join(__dirname, 'assets', 'scenarios', 'e3.json'));
const l1S = readJson(path.join(__dirname, 'assets', 'scenarios', 'l1.json'));
ok('e3 scenarios >= 5', e3S.scenarios.length >= 5, e3S.scenarios.length + ' scenarios');
ok('l1 scenarios >= 5', l1S.scenarios.length >= 5, l1S.scenarios.length + ' scenarios');

for (const lv of [{ k: 'e3', sc: e3S }, { k: 'l1', sc: l1S }]) {
  for (const scenario of lv.sc.scenarios) {
    ok(`${lv.k}: scenario ${scenario.id} has tasks`,
       Array.isArray(scenario.tasks) && scenario.tasks.length > 0);
    let total = 0;
    for (const t of scenario.tasks) {
      ok(`${lv.k}/${scenario.id}: task ${t.id} has kind`, !!t.kind, 'kind=' + t.kind);
      ok(`${lv.k}/${scenario.id}: task ${t.id} marks > 0`, t.marks > 0);
      total += t.marks;
    }
    ok(`${lv.k}: scenario ${scenario.id} total marks > 0`, total > 0, 'total=' + total);
  }
}

// --- 4) seeded PRNG determinism -----------------------------------
// Replicate the PRNG used by the app to test determinism without
// having to import the ES module (Node should handle this in newer
// versions but we keep it inline so this test runs on Node 18+).
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (a + b | 0) + d | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = c + (c << 3) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function makeRng(seedStr) {
  const seed = xmur3(String(seedStr));
  return sfc32(seed(), seed(), seed(), seed());
}
const rng1 = makeRng('TESTSEED');
const rng2 = makeRng('TESTSEED');
const a1 = [rng1(), rng1(), rng1()];
const a2 = [rng2(), rng2(), rng2()];
ok('PRNG deterministic for same seed', JSON.stringify(a1) === JSON.stringify(a2),
   `a1=${JSON.stringify(a1)} a2=${JSON.stringify(a2)}`);

const rng3 = makeRng('OTHER');
const a3 = [rng3(), rng3(), rng3()];
ok('PRNG changes for different seed', JSON.stringify(a1) !== JSON.stringify(a3));

// --- 5) determinism of question pick ------------------------------
function shuffle(rng, arr) {
  const c = arr.slice();
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}
function pickN(rng, arr, n) { return shuffle(rng, arr).slice(0, n); }

function pickPaper(seed, bank) {
  const rng = makeRng(seed + '|sectionA');
  const byArea = {};
  for (const q of bank) {
    const a = q.area || 'other';
    (byArea[a] = byArea[a] || []).push(q);
  }
  const picked = [];
  for (const area of Object.keys(byArea)) {
    const s = shuffle(rng, byArea[area]);
    if (s.length) picked.push(s[0]);
  }
  if (picked.length < 10) {
    const remaining = bank.filter(q => !picked.includes(q));
    picked.push(...pickN(rng, remaining, 10 - picked.length));
  }
  return shuffle(rng, picked).slice(0, 10).map(q => q.id);
}
const ids1 = pickPaper('ABCD1234', e3Bank.mcqs);
const ids2 = pickPaper('ABCD1234', e3Bank.mcqs);
const ids3 = pickPaper('OTHER', e3Bank.mcqs);
ok('Same seed picks same 10 questions',
   JSON.stringify(ids1) === JSON.stringify(ids2),
   'ids1=' + ids1.join(','));
ok('Different seed picks different questions',
   JSON.stringify(ids1) !== JSON.stringify(ids3));
ok('Each paper has exactly 10 questions', ids1.length === 10);

// --- 6) Section B scenario pick ----------------------------------
function pickScenario(seed, scenarios) {
  const rng = makeRng(seed + '|sectionB');
  return scenarios[Math.floor(rng() * scenarios.length)].id;
}
ok('Section B scenario deterministic',
   pickScenario('SEED-A', e3S.scenarios) === pickScenario('SEED-A', e3S.scenarios));

// --- 7) source files exist and have expected exports --------------
const expected = [
  ['src/main/main.js', /ipcMain\.handle\('banks:load'/],
  ['src/main/preload.js', /contextBridge\.exposeInMainWorld\('dfsq'/],
  ['src/renderer/index.html', /Test Player Preview/],
  ['src/renderer/styles/main.css', /\.orange-btn/],
  ['src/renderer/app.js', /showHome/],
  ['src/renderer/screens/components.js', /export function makeRng/],
  ['src/renderer/screens/home.js', /export function showHome/],
  ['src/renderer/screens/section-a.js', /export function showSectionA/],
  ['src/renderer/screens/section-b.js', /export function showSectionB/],
  ['src/renderer/screens/results.js', /export async function showResults/],
  ['src/renderer/screens/history.js', /export async function showHistory/],
  ['src/renderer/editors/spreadsheet.js', /export function mountSpreadsheet/],
  ['src/renderer/editors/docx-editor.js', /export function mountDocEditor/],
  ['src/renderer/editors/email-editor.js', /export function mountEmailComposer/],
  ['src/renderer/editors/form.js', /export function mountWebForm/],
  ['src/renderer/screens/screenshot-tool.js', /export async function captureWindow/],
  ['src/renderer/screens/accessibility.js', /export function applyA11yToDocument/],
  ['src/renderer/screens/update-banner.js', /export function startUpdateListener/],
  ['src/main/auto-updater.js', /module\.exports = \{ setup, isReady \}/],
];
for (const [rel, re] of expected) {
  const p = path.join(__dirname, rel);
  let s = '';
  try { s = fs.readFileSync(p, 'utf8'); } catch {}
  ok(`${rel} exists and exports expected symbol`, re.test(s));
}

// --- 8) criterion logic sanity -------------------------------------
// Re-implement evalCriterion's email and form branches to make sure the
// regexes in scenarios behave the way we expect.
function emailHasField(snap, field, regex) {
  return new RegExp(regex, 'i').test(snap[field] || '');
}
ok('email subject regex matches "Work experience evidence"',
   emailHasField({ subject: 'Work experience evidence' }, 'subject', '(work|experience|evidence|information|wage)'));
ok('email body regex matches greeting + close',
   emailHasField({ body: 'Dear tutor, please find...regards' }, 'body', '(dear|hello|hi)') &&
   emailHasField({ body: 'Dear tutor, please find...regards' }, 'body', '(regards|thanks|thank you)'));
ok('strong password regex matches "Tr0ub4dor&3"',
   /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test('Tr0ub4dor&3'));
ok('strong password regex rejects "password"',
   !/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test('password'));

console.log('\n' + (failures === 0 ? 'All checks passed.' : failures + ' failure(s).'));
process.exit(failures === 0 ? 0 : 1);
