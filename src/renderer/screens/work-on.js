// "What do I need to work on?" screen.
//
// Reads the entire history of attempts, totals up which Section A
// questions were answered correctly versus incorrectly, groups the
// mistakes by the official Pearson content area (e.g. 5.4-malware),
// and surfaces:
//   - Per-area accuracy (with a colour-coded bar)
//   - Recently-missed questions with the correct answer alongside
//   - A "Practice my weak areas" button that builds a custom-targeted
//     mock paper using only questions from the topics the student is
//     getting wrong most often.
//
// Aggregation is per-level (E3 and L1 are different qualifications and
// share no content areas), so a level toggle sits at the top of the
// page.

import { h, makeRng, newAttemptId, randomSeed } from './components.js';

// Friendly human labels for the official Pearson area codes used in the
// bank JSON. If a new code appears that isn't in this map, we fall back
// to the raw code so nothing breaks.
const AREA_LABELS = {
  '1.1-devices':            'Using devices (input/output, storage)',
  '1.2-applications':       'Types of application software',
  '1.3-settings':           'System settings (E3) / Sponsored results (L1)',
  '1.3-sponsored':          'Sponsored search results',
  '1.4-search-files':       'Searching for files',
  '1.5-search':             'Searching the internet',
  '1.5-folders':            'Folder structure & file naming',
  '1.6-cloud':              'Cloud storage',
  '1.6-files':              'Reading and storing files',
  '1.7-files':              'Files, folders, extensions',
  '1.7-storage':            'Storage units (KB, MB, GB, TB)',
  '1.8-problems':           'System vs. user errors',
  '1.8-compression':        'File size & compression',
  '1.9-problems':           'Simple technical problem solving',
  '1.9-online-help':        'Using online resources to fix problems',
  '1.2-reliable':           'Currency, reliability and copyright',
  '2.2-layout':             'Document layout (orientation, headings)',
  '2.3-image-edit':         'Image editing (crop, resize, contrast)',
  '2.4-formulae':           'Spreadsheet formulae',
  '2.5-sort':               'Sorting and filtering data',
  '2.6-format':             'Number formatting (currency, %)',
  '2.7-charts':             'Charts and labels',
  '3.1-contacts':           'Managing contacts',
  '3.1-email':              'Composing emails',
  '3.2-email':              'Email structure (To/Cc/Bcc, subject)',
  '3.2-messages':           'Online messages (tone, audience)',
  '3.3-video':              'Video calls',
  '3.3-footprint':          'Limiting your digital footprint',
  '3.4-footprint':          'Digital footprint',
  '4.1-account':            'Account settings',
  '4.1-transacting':        'Buying and forms online',
  '4.2-verification':       'Form verification checks',
  '4.3-transaction-safety': 'Safe online transactions',
  '5.1-data-rights':        'Data protection rights',
  '5.1-safety':             'Staying safe online',
  '5.2-personal-info':      'Protecting personal info',
  '5.2-protect':            'Privacy and 2FA',
  '5.3-authentication':     'Authentication methods',
  '5.3-cloud-backup':       'Cloud backup',
  '5.4-security-software':  'Anti-virus / security software',
  '5.4-malware':            'Malware (worms, trojans, ransomware)',
  '5.5-stress':             'Physical strain (RSI, posture, eye care)',
  '5.5-health':             'Health and screen time',
};

function labelForArea(code) {
  return AREA_LABELS[code] || code;
}

// Bucket weak / improving / strong by accuracy. The numbers are deliberately
// generous because students aiming for a 60% pass mark don't need 95% on
// every topic — we just want to highlight areas of real concern.
function tierFor(accuracy, attempts) {
  if (attempts < 2)     return 'untested';
  if (accuracy < 0.50)  return 'weak';
  if (accuracy < 0.75)  return 'improving';
  return 'strong';
}

const TIER_INFO = {
  weak:      { label: 'Needs work',  bg: '#f6dada', fg: '#721c24', stripe: '#b81f1f' },
  improving: { label: 'Improving',   bg: '#fff3cd', fg: '#664400', stripe: '#d9a300' },
  strong:    { label: 'Strong',      bg: '#d8efde', fg: '#155724', stripe: '#168f3a' },
  untested:  { label: 'Not yet tested', bg: '#eee', fg: '#555',  stripe: '#aaa' },
};

// ---------------------------------------------------------------------------
//  Main render
// ---------------------------------------------------------------------------
export async function showWorkOn(api, state) {
  const screen = document.getElementById('screen');
  screen.innerHTML = '';
  api.setFooter('hidden');

  const wrap = h('div', { class: 'work-on' });
  wrap.appendChild(h('h1', {}, 'What do I need to work on?'));
  wrap.appendChild(h('div', { class: 'sub' },
    'Based on every Section A question you\'ve answered in this app, here are the topics where you\'re missing the most marks. ' +
    'Use the Practice button on a topic — or "Practice all my weak areas" at the bottom — to generate a fresh test focused on what you need.'));

  // Level toggle
  const levelRow = h('div', { class: 'work-on-level-row' });
  let level = inferDefaultLevel(state) || 'e3';
  function levelBtn(lv, name) {
    const b = h('button', { class: 'seg-btn' + (lv === level ? ' is-active' : ''),
      onClick: () => { level = lv; render(); } }, name);
    return b;
  }
  levelRow.appendChild(h('div', { style: { fontWeight: 600, marginRight: '12px', alignSelf: 'center' } }, 'Level:'));
  levelRow.appendChild(h('div', { class: 'segmented', style: { maxWidth: '320px', margin: '0' } },
    levelBtn('e3', 'Entry Level 3'),
    levelBtn('l1', 'Level 1')));
  wrap.appendChild(levelRow);

  const body = h('div', {});
  wrap.appendChild(body);
  screen.appendChild(wrap);

  await render();

  async function render() {
    // Refresh the level toggle active state
    levelRow.querySelectorAll('.seg-btn').forEach((b, i) => {
      const target = i === 0 ? 'e3' : 'l1';
      b.classList.toggle('is-active', target === level);
    });

    body.innerHTML = '';
    body.appendChild(h('div', { class: 'muted', style: { padding: '8px 0' } }, 'Loading your history…'));

    const history = await api.bridge.listHistory();
    const attempts = (history.attempts || []).filter(a => a.level === level);

    body.innerHTML = '';

    if (!attempts.length) {
      body.appendChild(h('div', { class: 'work-on-empty' },
        h('h3', {}, 'No history yet for this level'),
        h('p', { class: 'muted' },
          'Take at least one Section A test at ' + (level === 'e3' ? 'Entry Level 3' : 'Level 1') +
          ' and your weak areas will appear here.'),
        h('button', { class: 'orange-btn', onClick: () => api.go('home') }, 'Back to home')));
      return;
    }

    // ----- Aggregate per-area stats -----------------------------------
    const areaStats = {};       // area → { correct, total }
    const missedById = {};      // qId → { question, attempts: [...], lastWrongAt }
    for (const a of attempts) {
      const qs = (a.sectionA && a.sectionA.questions) || [];
      const ans = (a.sectionA && a.sectionA.answers) || {};
      for (const q of qs) {
        const area = q.area || 'other';
        if (!areaStats[area]) areaStats[area] = { correct: 0, total: 0 };
        areaStats[area].total++;
        const userAns = ans[q.id];
        const wasCorrect = userAns !== undefined && String(userAns) === String(q.answer);
        if (wasCorrect) areaStats[area].correct++;
        else {
          if (!missedById[q.id]) missedById[q.id] = { question: q, attempts: [] };
          missedById[q.id].attempts.push({ attemptId: a.id, finishedAt: a.finishedAt, userAns });
        }
      }
    }

    const overall = {
      attemptCount: attempts.length,
      questionCount: Object.values(areaStats).reduce((s, x) => s + x.total, 0),
      correct: Object.values(areaStats).reduce((s, x) => s + x.correct, 0),
    };
    overall.accuracy = overall.questionCount
      ? overall.correct / overall.questionCount : 0;

    // ----- Summary card ----------------------------------------------
    const overallPct = Math.round(overall.accuracy * 100);
    body.appendChild(h('div', { class: 'work-on-summary' },
      h('div', { class: 'work-on-summary-num' }, overallPct + '%'),
      h('div', { class: 'work-on-summary-text' },
        h('strong', {}, overall.correct + ' / ' + overall.questionCount + ' correct'),
        h('div', { class: 'muted' },
          'Across ' + overall.attemptCount + ' attempt' + (overall.attemptCount === 1 ? '' : 's') +
          ' at ' + (level === 'e3' ? 'Entry Level 3' : 'Level 1') + '.'))));

    // ----- Areas table -----------------------------------------------
    const areaRows = Object.entries(areaStats).map(([area, s]) => {
      const accuracy = s.total ? s.correct / s.total : 0;
      return { area, ...s, accuracy, tier: tierFor(accuracy, s.total) };
    });
    // Sort: weak first, then improving, then strong, then untested
    const tierOrder = { weak: 0, improving: 1, strong: 2, untested: 3 };
    areaRows.sort((a, b) => {
      const t = tierOrder[a.tier] - tierOrder[b.tier];
      if (t !== 0) return t;
      return a.accuracy - b.accuracy;
    });

    body.appendChild(h('h3', { class: 'section-h' }, 'Topics by accuracy'));
    const tbl = h('div', { class: 'work-on-areas' });
    for (const row of areaRows) {
      const tier = TIER_INFO[row.tier];
      const card = h('div', { class: 'work-on-area-row', style: { borderLeftColor: tier.stripe } },
        h('div', { class: 'work-on-area-label' },
          h('strong', {}, labelForArea(row.area)),
          h('div', { class: 'muted', style: { fontSize: '11px' } }, row.area)),
        h('div', { class: 'work-on-area-stat' },
          h('div', { class: 'work-on-bar' },
            h('div', { class: 'work-on-bar-fill', style: {
              width: Math.round(row.accuracy * 100) + '%',
              background: tier.stripe,
            } })),
          h('div', { class: 'work-on-area-num' },
            row.correct + ' / ' + row.total + ' (' + Math.round(row.accuracy * 100) + '%)')),
        h('div', { class: 'work-on-tier', style: { background: tier.bg, color: tier.fg } }, tier.label),
        h('button', { class: 'btn-mini',
          onClick: () => startTargetedPractice([row.area]) },
          'Practice this topic'));
      tbl.appendChild(card);
    }
    body.appendChild(tbl);

    // ----- Most-recently-missed questions ----------------------------
    const missedList = Object.values(missedById)
      .map(m => ({
        ...m,
        lastWrongAt: m.attempts.map(a => a.finishedAt || '').sort().reverse()[0],
        missedCount: m.attempts.length,
      }))
      .sort((a, b) => (b.lastWrongAt || '').localeCompare(a.lastWrongAt || ''))
      .slice(0, 15);

    if (missedList.length) {
      body.appendChild(h('h3', { class: 'section-h' }, 'Questions you\'ve missed'));
      body.appendChild(h('div', { class: 'muted', style: { marginBottom: '8px' } },
        'The 15 most recent questions you got wrong, with the correct answer alongside.'));
      const list = h('div', { class: 'work-on-missed' });
      for (const m of missedList) {
        const q = m.question;
        const lastAns = m.attempts[m.attempts.length - 1].userAns;
        const card = h('div', { class: 'work-on-missed-row' },
          h('div', { class: 'work-on-missed-stem' },
            q.context ? h('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '4px' } }, q.context) : null,
            h('div', {}, q.stem),
            h('div', { class: 'muted', style: { marginTop: '4px', fontSize: '12px' } },
              labelForArea(q.area) + (m.missedCount > 1 ? ' · missed ' + m.missedCount + ' times' : ''))),
          h('div', { class: 'work-on-missed-ans' },
            h('div', {},
              h('span', { class: 'pill bad' }, 'Your answer: '),
              ' ', lastAns !== undefined ? String(lastAns) : '(no answer)'),
            h('div', { style: { marginTop: '4px' } },
              h('span', { class: 'pill ok' }, 'Correct: '),
              ' ', q.answer)));
        list.appendChild(card);
      }
      body.appendChild(list);
    }

    // ----- Big "Practice all my weak areas" CTA ----------------------
    const weakAreas = areaRows.filter(r => r.tier === 'weak' || r.tier === 'improving')
      .map(r => r.area);
    if (weakAreas.length) {
      const cta = h('div', { class: 'work-on-cta' },
        h('h3', {}, 'Practice all my weak areas'),
        h('div', { class: 'muted', style: { marginBottom: '10px' } },
          'Builds a fresh ' + (level === 'e3' ? 'Entry Level 3' : 'Level 1') + ' Section A paper with ' +
          'questions drawn only from the ' + weakAreas.length + ' topic' +
          (weakAreas.length === 1 ? '' : 's') + ' you\'re missing marks on. ' +
          'Same look and feel as the full exam — just focused on what you need to improve.'),
        h('button', { class: 'orange-btn', onClick: () => startTargetedPractice(weakAreas, 10) },
          'Start 10-question practice ▶'),
        h('button', { class: 'btn-mini', style: { marginLeft: '8px' },
          onClick: () => startTargetedPractice(weakAreas, 20) },
          '20 questions'));
      body.appendChild(cta);
    }

    // Back button always
    body.appendChild(h('div', { style: { marginTop: '24px' } },
      h('button', { class: 'btn-mini', onClick: () => api.go('home') }, '◀ Back to home')));
  }

  // -----------------------------------------------------------------
  //  Build a fresh attempt restricted to specific areas, then start it.
  // -----------------------------------------------------------------
  async function startTargetedPractice(areas, count = 10) {
    const candidate = (state.attempt && state.attempt.candidate) ||
                      (state.test && state.test.candidate) || 'Practice';
    const seed = randomSeed();
    const test = {
      id: newAttemptId(),
      seed, level,
      candidate,
      startedAt: new Date().toISOString(),
      mode: 'mcq',
      mcqCount: count,
      areasFilter: areas,
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
}

// Inspect history briefly to guess which level the student last attempted.
function inferDefaultLevel(state) {
  // If they've got an in-progress test, use its level.
  if (state.attempt && state.attempt.level) return state.attempt.level;
  return null;
}
