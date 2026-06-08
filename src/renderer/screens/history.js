// History screen — shows previously taken attempts, lets the student
// retake one with the same seed or open the folder of saved files.
import { h, newAttemptId } from './components.js';

export async function showHistory(api, state) {
  const screen = document.getElementById('screen');
  screen.innerHTML = '';

  const list = await api.bridge.listHistory();
  const attempts = list.attempts || [];

  const back = h('button', { class: 'btn-mini', onClick: () => api.go('home') }, '← Back');

  const rows = attempts.length === 0
    ? [h('p', { class: 'muted' }, 'No attempts yet. Start a test from the home screen to see it here.')]
    : attempts.map(a => h('div', { class: 'history-row' },
        h('div', {},
          h('div', {}, `${a.level.toUpperCase()} — ${a.candidate || 'Anonymous'}`),
          h('div', { class: 'meta' },
            `${new Date(a.startedAt).toLocaleString()} · ` +
            `Seed: `, h('span', { class: 'kbd' }, a.seed), ` · ` +
            `Score: ${(a.sectionA?.score ?? 0) + (a.sectionB?.score ?? 0)} / ` +
            `${(a.sectionA?.total ?? 0) + (a.sectionB?.total ?? 0)}` +
            (a.grade ? ` · ${a.grade}` : '')
          )
        ),
        h('div', { class: 'history-actions' },
          h('button', { class: 'btn-mini', onClick: () => retake(a) }, 'Retake with this seed'),
          h('button', { class: 'btn-mini', onClick: () => api.bridge.openAttemptFolder(a.id) }, 'Open files'),
        )));

  const home = h('div', { class: 'home' },
    h('h1', {}, 'History'),
    h('div', { class: 'sub' }, 'Each attempt is saved with its seed so you can reproduce the same test.'),
    back,
    h('div', { style: { marginTop: '14px' } }, ...rows));
  screen.appendChild(home);
  api.setFooter('hidden');

  async function retake(prev) {
    const test = {
      id: newAttemptId(),
      seed: prev.seed,
      level: prev.level,
      candidate: prev.candidate,
      registration: prev.registration,
      centre: prev.centre,
      startedAt: new Date().toISOString(),
    };
    state.test = test;
    state.attempt = {
      id: test.id,
      seed: test.seed,
      level: test.level,
      candidate: test.candidate,
      registration: test.registration,
      centre: test.centre,
      startedAt: test.startedAt,
      sectionA: { questions: [], answers: {}, score: 0, total: 0 },
      sectionB: { scenarioId: null, taskResults: {}, files: [], score: 0, total: 0 },
    };
    state.bank = await api.bridge.loadBank(prev.level);
    state.scenarios = await api.bridge.loadScenarios(prev.level);
    api.go('sectionA');
  }
}
