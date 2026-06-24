// Results screen — totals up Section A and Section B, picks a level
// descriptor (Working towards / Pass / Distinction-style for practice),
// shows the per-question and per-task breakdown, and persists the
// attempt to history. Also exposes a button to open the attempt folder
// in Finder/Explorer to see saved files.

import { h } from './components.js';
import { uploadAttempt, isConfigured as firebaseConfigured, getStoredClassCode } from './firebase-client.js';
import { isMilestoneAttempt, buildMilestoneSummary, renderMilestonePanel, startBespokeRevision } from './milestone-review.js';

export async function showResults(api, state) {
  const screen = document.getElementById('screen');
  screen.innerHTML = '';

  const a = state.attempt.sectionA || {};
  const b = state.attempt.sectionB || {};

  const totalScore = (a.score || 0) + (b.score || 0);
  const totalMax = (a.total || 0) + (b.total || 0);
  const pct = totalMax ? Math.round((totalScore / totalMax) * 100) : 0;

  // Pearson DFSQ is a Pass / Fail qualification — there are no grades like
  // Merit or Distinction on the real assessment. The pass mark sits around
  // 60% of the total marks (it can vary slightly between series). We
  // surface a clear Pass / Not yet achieved verdict plus a "comfortable /
  // borderline" note so practice students know how close they are.
  const PASS_THRESHOLD = 0.60;
  const passed = totalMax > 0 && (totalScore / totalMax) >= PASS_THRESHOLD;
  let grade = passed ? 'Pass' : 'Not yet achieved';
  let note = '';
  if (passed && pct >= 75) note = 'Comfortable pass';
  else if (passed) note = 'Just over the pass mark';
  else if (pct >= 50) note = 'Close — review the topics you missed';
  else note = 'More practice needed';
  state.attempt.grade = grade;
  state.attempt.gradeNote = note;
  state.attempt.finishedAt = new Date().toISOString();
  state.attempt.totalScore = totalScore;
  state.attempt.totalMax = totalMax;

  await api.bridge.saveHistory(state.attempt);
  // Save a final results snapshot as a file in the attempt folder.
  await api.bridge.saveAttemptFile({
    attemptId: state.attempt.id,
    filename: 'results.json',
    content: JSON.stringify(state.attempt, null, 2),
    encoding: 'utf8',
  });

  // Upload to Firebase (if configured and a class code is set). Runs in
  // the background — the page still renders straight away. We surface a
  // small banner with the result once the upload completes or fails.
  const classCode = getStoredClassCode();
  let uploadStatus = null;
  if (firebaseConfigured() && classCode) {
    uploadStatus = 'pending';
    uploadAttempt(state.attempt, classCode).then((res) => {
      uploadStatus = res && res.ok ? 'ok' : (res && res.error ? 'error:' + res.error : 'skipped');
      const el = document.getElementById('upload-status-pill');
      if (!el) return;
      if (uploadStatus === 'ok') {
        el.textContent = '✓ Result sent to class ' + classCode;
        el.className = 'pill ok';
      } else if (uploadStatus.startsWith('error')) {
        el.textContent = 'Could not upload to class ' + classCode + ' — ' + uploadStatus.slice(6);
        el.className = 'pill bad';
      } else {
        el.textContent = 'Result saved locally only';
        el.className = 'pill';
      }
    });
  }

  // Section A breakdown
  const aBreakdown = (a.questions || []).map((q, i) => {
    const ans = a.answers?.[q.id];
    const correct = String(ans) === String(q.answer);
    return h('tr', {},
      h('td', { style: { width: '36px' } }, String(i + 1)),
      h('td', {}, q.stem),
      h('td', { class: correct ? 'ok' : 'bad' }, correct ? '✓' : '✗'),
      h('td', { class: 'muted' }, `Ans: ${q.answer}` + (ans && !correct ? ` (you: ${ans})` : '')));
  });

  const bBreakdown = (b.breakdown || []).map(t => h('tr', {},
    h('td', { style: { width: '60px' } }, t.label),
    h('td', {}, t.id),
    h('td', { class: t.got === t.max ? 'ok' : (t.got === 0 ? 'bad' : '') }, t.got + ' / ' + t.max)));

  const results = h('div', { class: 'results' },
    h('div', { class: 'score-card' },
      h('div', {},
        h('span', { class: 'score' }, totalScore + ' / ' + totalMax),
        h('span', { class: 'grade', style: { background: passed ? '#168f3a' : '#b81f1f' } }, grade)),
      h('div', { style: { marginTop: '6px', color: passed ? '#168f3a' : '#b81f1f', fontWeight: 600 } },
        `${note} (${pct}%)`),
      h('div', { class: 'muted', style: { marginTop: '4px' } },
        `Pass mark: 60% · Level: ${state.attempt.level.toUpperCase()} · Seed: `,
        h('span', { class: 'kbd' }, state.attempt.seed)),
      h('div', { class: 'muted', style: { marginTop: '2px' } },
        `Candidate: ${state.attempt.candidate}` +
        (state.attempt.registration ? ` · Reg: ${state.attempt.registration}` : '')),
      uploadStatus ? h('div', { style: { marginTop: '8px' } },
        h('span', { id: 'upload-status-pill', class: 'pill' },
          uploadStatus === 'pending' ? 'Uploading to class ' + classCode + '…' : '')) : null),
    h('h3', {}, 'Section A — Knowledge test'),
    h('p', { class: 'muted' }, `Score: ${a.score} / ${a.total}`),
    h('table', {}, ...aBreakdown),
    h('h3', { style: { marginTop: '14px' } }, 'Section B — Practical tasks'),
    h('p', { class: 'muted' }, `Score: ${b.score || 0} / ${b.total || 0}` +
      (b.scenarioId ? ` · Scenario: ${b.scenarioId}` : '')),
    h('table', {}, ...bBreakdown),
    h('div', { class: 'actions', style: { marginTop: '20px' } },
      h('button', { class: 'orange-btn', onClick: () => api.go('home') }, 'New test'),
      h('button', { class: 'orange-btn', onClick: () => api.go('workOn') }, 'What to work on ▶'),
      h('button', { class: 'btn-mini', onClick: () => api.go('history') }, 'View history'),
      h('button', { class: 'btn-mini', onClick: () => api.bridge.openAttemptFolder(state.attempt.id) }, 'Open saved files')));
  // Milestone review: every 5th attempt at this level, surface a panel
  // summarising the last 5 + a button to start a bespoke revision exam
  // built only from the topics the student is missing marks on.
  try {
    const history = await api.bridge.listHistory();
    if (isMilestoneAttempt(history, state.attempt.level)) {
      const summary = buildMilestoneSummary(history, state.attempt.level);
      if (summary) {
        const wrap = h('div', { class: 'milestone-wrap' });
        renderMilestonePanel(wrap, summary, () => startBespokeRevision(api, state, summary));
        // Insert at the top of the results so the student sees it first
        results.insertBefore(wrap, results.firstChild);
      }
    }
  } catch (err) {
    console.warn('[milestone] failed:', err);
  }

  screen.appendChild(results);
  api.setFooter('hidden');
}
