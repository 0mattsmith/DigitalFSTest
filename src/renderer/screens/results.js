// Results screen — totals up Section A and Section B, picks a level
// descriptor (Working towards / Pass / Distinction-style for practice),
// shows the per-question and per-task breakdown, and persists the
// attempt to history. Also exposes a button to open the attempt folder
// in Finder/Explorer to see saved files.

import { h } from './components.js';

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
        (state.attempt.registration ? ` · Reg: ${state.attempt.registration}` : ''))),
    h('h3', {}, 'Section A — Knowledge test'),
    h('p', { class: 'muted' }, `Score: ${a.score} / ${a.total}`),
    h('table', {}, ...aBreakdown),
    h('h3', { style: { marginTop: '14px' } }, 'Section B — Practical tasks'),
    h('p', { class: 'muted' }, `Score: ${b.score || 0} / ${b.total || 0}` +
      (b.scenarioId ? ` · Scenario: ${b.scenarioId}` : '')),
    h('table', {}, ...bBreakdown),
    h('div', { class: 'actions', style: { marginTop: '20px' } },
      h('button', { class: 'orange-btn', onClick: () => api.go('home') }, 'New test'),
      h('button', { class: 'btn-mini', onClick: () => api.go('history') }, 'View history'),
      h('button', { class: 'btn-mini', onClick: () => api.bridge.openAttemptFolder(state.attempt.id) }, 'Open saved files')));
  screen.appendChild(results);
  api.setFooter('hidden');
}
