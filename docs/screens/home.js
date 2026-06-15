// Home screen — candidate enters their name, picks level, picks seed,
// and customises the test: full paper / just MCQs / just tasks, with
// sliders to choose how many questions and how many tasks.
import { h, randomSeed, newAttemptId } from './components.js';
import { renderA11yPanel } from './accessibility.js';
import { manualCheck, getCurrentVersion } from './update-banner.js';

export function showHome(api, state) {
  const screen = document.getElementById('screen');
  screen.innerHTML = '';

  // ---- Defaults / state ---------------------------------------------------
  let level = 'e3';
  let mode = 'both';        // 'both' | 'mcq' | 'tasks'
  let mcqCount = 10;        // 5 .. 50
  let taskCount = 6;        // 3 .. 20
  let seedInput = randomSeed();
  const candidateName = (state.test && state.test.candidate) || '';

  // ---- Helpers ------------------------------------------------------------
  function row(label, ...kids) {
    return h('div', { class: 'field' }, h('label', {}, label), ...kids);
  }

  // ---- Identity inputs ----------------------------------------------------
  const nameInput = h('input', { type: 'text', placeholder: 'Your name', value: candidateName });
  const regInput = h('input', { type: 'text', placeholder: 'Registration / Student ID (optional)' });
  const centreInput = h('input', { type: 'text', placeholder: 'Centre number (optional)' });
  const seedField = h('input', { type: 'text', value: seedInput, style: { fontFamily: 'Menlo,monospace' } });

  const startBtn = h('button', { class: 'orange-btn', onClick: start }, 'Start practice test ▶');
  const historyBtn = h('button', { class: 'btn-mini', onClick: () => api.go('history') }, 'View history');
  const workOnBtn = h('button', { class: 'btn-mini', onClick: () => api.go('workOn') }, 'What to work on');
  const newSeedBtn = h('button', { class: 'btn-mini', onClick: () => { seedField.value = randomSeed(); } }, 'New seed');

  // ---- Level cards --------------------------------------------------------
  const e3Card = h('div', { class: 'card', onClick: () => selectLevel('e3') },
    h('h3', {}, 'Entry Level 3'),
    h('p', {}, 'Multiple-choice questions plus practical tasks. ' +
      'Covers using devices, creating documents, communicating, transacting and online safety.'),
    h('span', { class: 'pill', id: 'pill-e3' }, 'Selected'));

  const l1Card = h('div', { class: 'card', onClick: () => selectLevel('l1') },
    h('h3', {}, 'Level 1'),
    h('p', {}, 'More advanced practical tasks including spreadsheet formulae, ' +
      'charts, formatted flyers and email signatures.'),
    h('span', { class: 'pill hide', id: 'pill-l1' }, 'Selected'));

  function selectLevel(lv) {
    level = lv;
    document.getElementById('pill-e3').classList.toggle('hide', lv !== 'e3');
    document.getElementById('pill-l1').classList.toggle('hide', lv !== 'l1');
    e3Card.style.outline = lv === 'e3' ? '2px solid #f0801f' : 'none';
    l1Card.style.outline = lv === 'l1' ? '2px solid #f0801f' : 'none';
  }

  // ---- Mode picker (segmented control) ------------------------------------
  const modeBoth   = h('button', { class: 'seg-btn',  id: 'mode-both',  onClick: () => setMode('both') },
    h('strong', {}, 'Full test'),
    h('div', { class: 'seg-sub' }, 'MCQs + practical tasks'));
  const modeMcq    = h('button', { class: 'seg-btn',  id: 'mode-mcq',   onClick: () => setMode('mcq') },
    h('strong', {}, 'Just MCQs'),
    h('div', { class: 'seg-sub' }, 'Multiple-choice only'));
  const modeTasks  = h('button', { class: 'seg-btn',  id: 'mode-tasks', onClick: () => setMode('tasks') },
    h('strong', {}, 'Just tasks'),
    h('div', { class: 'seg-sub' }, 'Practical only'));

  // Update the slider's --fill CSS variable so the orange-track gradient
  // reflects the current value.
  function syncFill(el, min, max) {
    const pct = ((parseInt(el.value, 10) - min) / (max - min)) * 100;
    el.style.setProperty('--fill', pct.toFixed(1) + '%');
  }

  const mcqSliderLabel = h('span', { id: 'mcq-count-label' }, String(mcqCount));
  const mcqSlider = h('input', {
    type: 'range', min: '5', max: '50', step: '1', value: String(mcqCount),
    class: 'slider', id: 'mcq-slider',
    onInput: (e) => {
      mcqCount = parseInt(e.target.value, 10);
      mcqSliderLabel.textContent = String(mcqCount);
      syncFill(e.target, 5, 50);
    },
  });

  const taskSliderLabel = h('span', { id: 'task-count-label' }, String(taskCount));
  const taskSlider = h('input', {
    type: 'range', min: '3', max: '20', step: '1', value: String(taskCount),
    class: 'slider', id: 'task-slider',
    onInput: (e) => {
      taskCount = parseInt(e.target.value, 10);
      taskSliderLabel.textContent = String(taskCount);
      syncFill(e.target, 3, 20);
    },
  });

  const mcqSliderRow = h('div', { class: 'slider-row', id: 'mcq-slider-row' },
    h('label', {}, 'Number of multiple-choice questions: ', mcqSliderLabel),
    mcqSlider,
    h('div', { class: 'slider-scale' },
      h('span', {}, '5'),
      h('span', {}, '15'),
      h('span', {}, '25'),
      h('span', {}, '35'),
      h('span', {}, '50')));

  const taskSliderRow = h('div', { class: 'slider-row', id: 'task-slider-row' },
    h('label', {}, 'Number of practical tasks: ', taskSliderLabel),
    taskSlider,
    h('div', { class: 'slider-scale' },
      h('span', {}, '3'),
      h('span', {}, '8'),
      h('span', {}, '12'),
      h('span', {}, '16'),
      h('span', {}, '20')));

  function setMode(m) {
    mode = m;
    for (const id of ['mode-both', 'mode-mcq', 'mode-tasks']) {
      document.getElementById(id).classList.toggle('is-active', id === 'mode-' + m);
    }
    document.getElementById('mcq-slider-row').classList.toggle('hide', m === 'tasks');
    document.getElementById('task-slider-row').classList.toggle('hide', m === 'mcq');
  }

  // ---- Layout -------------------------------------------------------------
  const home = h('div', { class: 'home' },
    h('h1', {}, 'DFSQ Practice'),
    h('div', { class: 'sub' }, "Practice the Pearson Edexcel Digital Functional Skills assessment. Pick a level, customise your test, give it a seed if you want it to match a friend's, and go."),
    row('Candidate name', nameInput),
    h('div', { class: 'row', style: { display: 'flex', gap: '12px' } },
      h('div', { class: 'field', style: { flex: '1' } },
        h('label', {}, 'Registration ID'),
        regInput),
      h('div', { class: 'field', style: { flex: '1' } },
        h('label', {}, 'Centre number'),
        centreInput)),

    h('h3', { class: 'section-h' }, 'Choose level'),
    h('div', { class: 'card-row' }, e3Card, l1Card),

    h('h3', { class: 'section-h' }, 'Customise your test'),
    h('div', { class: 'segmented' }, modeBoth, modeMcq, modeTasks),
    mcqSliderRow,
    taskSliderRow,

    h('h3', { class: 'section-h' }, 'Seed'),
    h('div', { class: 'field' },
      h('label', {}, 'Controls which questions/tasks you get. Share it to retake the same paper.'),
      h('div', { style: { display: 'flex', gap: '8px' } }, seedField, newSeedBtn)),

    h('div', { class: 'actions' }, startBtn, workOnBtn, historyBtn,
      h('span', { class: 'muted', style: { marginLeft: 'auto' } }, 'Your work is saved locally.'))
  );

  // Accessibility panel — collapsible "Display options" at the bottom of the
  // home screen. Toggles persist via localStorage and apply immediately.
  const a11yWrap = h('details', { class: 'a11y-details' },
    h('summary', { class: 'a11y-summary' }, 'Display options (accessibility)'));
  const a11yBody = h('div', { class: 'a11y-body' });
  renderA11yPanel(a11yBody);
  a11yWrap.appendChild(a11yBody);
  home.appendChild(a11yWrap);

  // Footer: version number + "Check for updates" button.
  const versionLabel = h('span', { class: 'muted', id: 'version-label' }, 'Version …');
  const checkBtn = h('button', { class: 'btn-mini', onClick: () => manualCheck() }, 'Check for updates');
  const footer = h('div', { class: 'home-footer' },
    versionLabel,
    h('span', { class: 'spacer' }),
    checkBtn);
  home.appendChild(footer);
  getCurrentVersion().then((v) => {
    if (v) versionLabel.textContent = 'DFSQ Practice v' + v.version;
    else   versionLabel.textContent = 'DFSQ Practice (dev)';
  }).catch(() => {});

  screen.appendChild(home);
  selectLevel(level);
  setMode(mode);
  // Initialise slider fill colour so it isn't stuck at 50% on first paint.
  syncFill(mcqSlider, 5, 50);
  syncFill(taskSlider, 3, 20);

  api.setFooter('hidden');

  // ---- Start --------------------------------------------------------------
  async function start() {
    const candidate = (nameInput.value || '').trim() || 'Anonymous';
    const seed = (seedField.value || '').trim() || randomSeed();
    const test = {
      id: newAttemptId(),
      seed,
      level,
      candidate,
      registration: regInput.value.trim(),
      centre: centreInput.value.trim(),
      startedAt: new Date().toISOString(),
      mode,
      mcqCount,
      taskCount,
    };
    state.test = test;
    state.attempt = {
      id: test.id,
      seed,
      level,
      candidate,
      registration: test.registration,
      centre: test.centre,
      startedAt: test.startedAt,
      mode,
      mcqCount,
      taskCount,
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

    // Honour the mode: skip Section A if tasks-only, skip Section B if MCQ-only.
    if (mode === 'tasks') api.go('sectionB');
    else                  api.go('sectionA');
  }
}
