// Milestone review.
//
// After every 5th attempt a student completes at a given level (5, 10,
// 15, …), this module surfaces a summary panel on the results screen:
//   - Average % across the last 5 attempts
//   - Trend (are they improving, holding, or sliding back?)
//   - The topics they kept getting wrong across the 5
//   - A big "Start a custom revision exam" button that builds a fresh
//     paper drawing ONLY from those weak topics, so they can drill
//     exactly the areas they need.
//
// All analysis runs purely off the local attempt history — no network
// dependency, works regardless of whether Firebase is configured.

import { h, makeRng, newAttemptId, randomSeed } from './components.js';

// Friendly labels (the same ones used by work-on.js).
const AREA_LABELS = {
  '1.1-devices': 'Using devices', '1.2-applications': 'Application software',
  '1.3-settings': 'System settings', '1.3-sponsored': 'Sponsored search results',
  '1.4-search-files': 'Searching for files', '1.5-search': 'Searching the internet',
  '1.5-folders': 'Folder structure & file naming', '1.6-cloud': 'Cloud storage',
  '1.6-files': 'Reading and storing files', '1.7-files': 'Files & extensions',
  '1.7-storage': 'Storage units (KB/MB/GB/TB)', '1.8-problems': 'System vs user errors',
  '1.8-compression': 'File size & compression', '1.9-problems': 'Simple technical problem solving',
  '1.9-online-help': 'Using online resources to fix problems', '1.2-reliable': 'Currency, reliability & copyright',
  '2.2-layout': 'Document layout', '2.3-image-edit': 'Image editing',
  '2.4-formulae': 'Spreadsheet formulae', '2.5-sort': 'Sorting and filtering',
  '2.6-format': 'Number formatting', '2.7-charts': 'Charts and labels',
  '3.1-contacts': 'Managing contacts', '3.1-email': 'Composing emails',
  '3.2-email': 'Email structure (To/Cc/Bcc, subject)', '3.2-messages': 'Online messages',
  '3.3-video': 'Video calls', '3.3-footprint': 'Limiting digital footprint',
  '3.4-footprint': 'Digital footprint', '4.1-account': 'Account settings',
  '4.1-transacting': 'Buying online & forms', '4.2-verification': 'Form verification checks',
  '4.3-transaction-safety': 'Safe online transactions', '5.1-data-rights': 'Data protection rights',
  '5.1-safety': 'Staying safe online', '5.2-personal-info': 'Protecting personal info',
  '5.2-protect': 'Privacy and 2FA', '5.3-authentication': 'Authentication methods',
  '5.3-cloud-backup': 'Cloud backup', '5.4-security-software': 'Anti-virus / security software',
  '5.4-malware': 'Malware (worms, trojans, ransomware)', '5.5-stress': 'Physical strain (RSI, posture, eye care)',
  '5.5-health': 'Health and screen time',
};
const labelFor = (code) => AREA_LABELS[code] || code;

// Did the just-finished attempt make their count at this level a multiple
// of 5? If so we're at a milestone and the panel should appear on the
// results screen.
export function isMilestoneAttempt(history, level) {
  const list = (history && history.attempts || []).filter(a => a.level === level);
  return list.length > 0 && list.length % 5 === 0;
}

export function buildMilestoneSummary(history, level) {
  const all = (history && history.attempts || []).filter(a => a.level === level);
  // history.attempts is prepended on save, so the newest is at index 0.
  const last5 = all.slice(0, 5);
  if (last5.length < 5) return null;

  const areaStats = {};
  let totalScore = 0, totalMax = 0;

  for (const a of last5) {
    totalScore += a.totalScore || 0;
    totalMax   += a.totalMax   || 0;
    const qs = (a.sectionA && a.sectionA.questions) || [];
    const ans = (a.sectionA && a.sectionA.answers) || {};
    for (const q of qs) {
      const area = q.area || 'other';
      if (!areaStats[area]) areaStats[area] = { correct: 0, total: 0 };
      areaStats[area].total++;
      if (ans[q.id] !== undefined && String(ans[q.id]) === String(q.answer)) {
        areaStats[area].correct++;
      }
    }
  }

  const averagePct = totalMax ? Math.round((totalScore / totalMax) * 100) : 0;

  // Trend: compare oldest 2 of the 5 with newest 2.
  const newest = last5.slice(0, 2);
  const oldest = last5.slice(3, 5);
  const avg = (arr) => {
    let s = 0, m = 0;
    for (const a of arr) { s += a.totalScore || 0; m += a.totalMax || 0; }
    return m ? (s / m) : 0;
  };
  const newestAvg = avg(newest);
  const oldestAvg = avg(oldest);
  const delta = newestAvg - oldestAvg;
  let trend;
  if (delta > 0.05)      trend = { tag: 'up',    label: 'Improving', detail: '+' + Math.round(delta * 100) + ' pts vs your first attempts of the five' };
  else if (delta < -0.05) trend = { tag: 'down', label: 'Slipping', detail: Math.round(delta * 100) + ' pts vs your first attempts of the five' };
  else                   trend = { tag: 'flat', label: 'Steady',   detail: 'Within ' + Math.round(Math.abs(delta) * 100) + ' pts across the five' };

  // Bucket areas by accuracy.
  const rows = Object.entries(areaStats)
    .filter(([_, s]) => s.total >= 2)
    .map(([area, s]) => ({ area, ...s, accuracy: s.total ? s.correct / s.total : 0 }));
  rows.sort((a, b) => a.accuracy - b.accuracy);
  const weak      = rows.filter(r => r.accuracy < 0.5);
  const improving = rows.filter(r => r.accuracy >= 0.5 && r.accuracy < 0.75);
  const strong    = rows.filter(r => r.accuracy >= 0.75);

  // Pick the topics for the bespoke revision: all weak topics, plus the
  // 3 weakest improving ones to round out a varied paper.
  const focusAreas = [
    ...weak.map(r => r.area),
    ...improving.slice(0, 3).map(r => r.area),
  ];

  return {
    level,
    count: all.length,                 // milestone number (5, 10, 15…)
    averagePct,
    totalScore, totalMax,
    trend,
    weak, improving, strong,
    focusAreas,
    last5,
  };
}

// Render the milestone summary as a single panel suitable for inserting
// at the top of the results screen.
export function renderMilestonePanel(host, summary, onStartRevision) {
  if (!summary) return;

  const trendClass = summary.trend.tag === 'up' ? 'ok' :
                     summary.trend.tag === 'down' ? 'bad' : '';

  const panel = h('div', { class: 'milestone-panel' },
    h('div', { class: 'milestone-head' },
      h('div', {},
        h('div', { class: 'milestone-eyebrow' }, '⭐ ' + summary.count + '-attempt milestone'),
        h('h2', {}, 'Your last 5 ' + (summary.level === 'e3' ? 'Entry Level 3' : 'Level 1') + ' attempts')),
      h('div', { class: 'milestone-stat' },
        h('div', { class: 'milestone-num' }, summary.averagePct + '%'),
        h('div', { class: 'muted' }, 'average across 5'))),

    h('div', { class: 'milestone-trend pill ' + trendClass }, '↗ ' + summary.trend.label + ' · ' + summary.trend.detail),

    h('h3', {}, 'What to work on'),
    summary.weak.length || summary.improving.length
      ? h('div', { class: 'milestone-topics' },
          ...summary.weak.map(r =>
            h('div', { class: 'milestone-topic tier-weak' },
              h('strong', {}, labelFor(r.area)),
              h('span', { class: 'muted', style: { marginLeft: '8px' } },
                Math.round(r.accuracy * 100) + '%  (' + r.correct + ' / ' + r.total + ' across the five)'))),
          ...summary.improving.slice(0, 3).map(r =>
            h('div', { class: 'milestone-topic tier-improving' },
              h('strong', {}, labelFor(r.area)),
              h('span', { class: 'muted', style: { marginLeft: '8px' } },
                Math.round(r.accuracy * 100) + '%  (' + r.correct + ' / ' + r.total + ')'))))
      : h('p', { class: 'muted' }, 'No clear weak areas — you\'re hitting most topics. Strong work!'),

    summary.focusAreas.length
      ? h('div', { class: 'milestone-cta' },
          h('h3', {}, 'Bespoke revision exam'),
          h('p', {},
            'Take a brand-new ', h('strong', {}, '15-question'),
            ' practice paper, drawn only from the ' + summary.focusAreas.length +
            ' topic' + (summary.focusAreas.length === 1 ? '' : 's') +
            ' you\'re missing marks on. Same look and feel as the full exam, just focused on what you need to improve.'),
          h('button', { class: 'orange-btn', onClick: () => onStartRevision() },
            'Start bespoke revision ▶'))
      : null);

  host.appendChild(panel);
}

// Build an attempt + navigate the router to Section A for the bespoke
// revision exam.
export async function startBespokeRevision(api, state, summary) {
  const candidate = (state.attempt && state.attempt.candidate) ||
                    (state.test && state.test.candidate) || 'Practice';
  const seed = randomSeed();
  const level = summary.level;
  const test = {
    id: newAttemptId(),
    seed, level,
    candidate,
    startedAt: new Date().toISOString(),
    mode: 'mcq',
    mcqCount: 15,
    areasFilter: summary.focusAreas.slice(),
    bespokeRevision: true,
    milestoneBase: summary.count,
  };
  state.test = test;
  state.attempt = {
    ...test,
    sectionA: { questions: [], answers: {}, score: 0, total: 0 },
    sectionB: { scenarioId: null, taskResults: {}, files: [], score: 0, total: 0 },
  };
  try {
    state.bank = await api.bridge.loadBank(level);
    state.scenarios = await api.bridge.loadScenarios(level);
  } catch (err) {
    alert('Failed to load question bank: ' + err.message);
    return;
  }
  api.go('sectionA');
}
