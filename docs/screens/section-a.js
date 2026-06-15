// Section A — 10 multiple choice questions, styled like the Pearson
// "Test Player Preview" window. Picks 10 questions from the bank using
// the seed so the same seed reproduces the same paper.
import { h, makeRng, pickN, shuffle, makeCountdown, formatTime } from './components.js';

export function showSectionA(api, state) {
  const screen = document.getElementById('screen');
  screen.innerHTML = '';

  const rng = makeRng(state.test.seed + '|sectionA');
  const bank = state.bank?.mcqs || [];

  // How many questions does the candidate want? Clamp to the bank size.
  const requested = state.attempt.mcqCount || 10;
  const target = Math.min(requested, bank.length);
  if (bank.length < 5) {
    screen.appendChild(h('p', {}, `Question bank too small (${bank.length}). Need at least 5 questions.`));
    return;
  }

  // Try to spread the picks across skill areas. Group by area, then pull one
  // from each area in turn (round-robin) until we hit the target.
  const byArea = {};
  for (const q of bank) {
    const a = q.area || 'other';
    (byArea[a] = byArea[a] || []).push(q);
  }
  // Shuffle each area independently for variety
  const areaQueues = {};
  for (const a of Object.keys(byArea)) areaQueues[a] = shuffle(rng, byArea[a]).slice();
  const picked = [];
  const areaKeys = shuffle(rng, Object.keys(byArea));
  while (picked.length < target) {
    let pickedThisRound = false;
    for (const a of areaKeys) {
      if (picked.length >= target) break;
      const q = areaQueues[a].shift();
      if (q) { picked.push(q); pickedThisRound = true; }
    }
    if (!pickedThisRound) break; // exhausted all areas
  }
  const questions = shuffle(rng, picked).slice(0, target).map(q => ({
    ...q,
    shuffledOptions: shuffle(rng, q.options),
  }));

  state.attempt.sectionA.questions = questions.map(q => ({
    id: q.id,
    area: q.area,
    stem: q.stem,
    context: q.context || '',
    options: q.shuffledOptions,
    answer: q.answer,
  }));
  // Total marks
  state.attempt.sectionA.total = questions.length;

  let current = 0;

  // Section A has a 25 minute time limit on the real assessment for some
  // papers. We use 30 minutes here as a sensible practice value.
  const countdown = makeCountdown(30 * 60,
    (text) => api.setFooter({ ...footerOpts(), timerText: text }),
    () => {
      countdown.stop();
      alert('Time up for Section A. Moving on to Section B.');
      finishSection();
    });

  function footerOpts() {
    return {
      counter: `${current + 1} / ${questions.length}`,
      onPrev: () => { if (current > 0) { current--; render(); } },
      onNext: () => {
        if (current < questions.length - 1) { current++; render(); }
        else finishSection();
      },
      disablePrev: current === 0,
      highlightNext: true,
      onMarks: () => alert(`Each Section A question is worth 1 mark.\nSection A total: ${questions.length} marks.`),
      onSave: () => {
        api.bridge.saveHistory(state.attempt);
        flash('Progress saved.');
      },
      showTimer: true,
    };
  }

  function flash(msg) {
    const f = h('div', { class: 'pill ok', style: { position: 'fixed', top: '60px', right: '20px', zIndex: 200 } }, msg);
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }

  function render() {
    const q = questions[current];
    screen.innerHTML = '';

    // Optional context line above the question chip
    const blocks = [];
    if (q.context) blocks.push(h('div', { class: 'q-context' }, q.context));

    blocks.push(h('div', { class: 'q-stem' }, q.stem, h('span', { class: 'marks' }, '(1)')));
    blocks.push(h('div', { class: 'q-instruction' }, 'Select ',
      h('strong', {}, 'one'), ' option.'));

    // Image-based question? Render hotspots; otherwise render pill options.
    if (q.image && q.hotspots) {
      const wrap = h('div', { class: 'q-hotspots' });
      const img = h('img', { src: q.image, class: 'q-image' });
      wrap.appendChild(img);
      img.onload = () => {
        for (const hs of q.hotspots) {
          const btn = h('div', { class: 'q-hotspot', style: {
            left: hs.x + '%', top: hs.y + '%',
            width: hs.w + '%', height: hs.h + '%',
          }, onClick: () => selectHotspot(hs.id) });
          if (state.attempt.sectionA.answers[q.id] === hs.id) btn.classList.add('is-selected');
          wrap.appendChild(btn);
        }
      };
      blocks.push(wrap);
    } else {
      const opts = h('div', { class: 'q-options' });
      for (const opt of q.shuffledOptions) {
        const ob = h('div', { class: 'q-option', onClick: () => select(opt) }, opt);
        if (state.attempt.sectionA.answers[q.id] === opt) ob.classList.add('is-selected');
        opts.appendChild(ob);
      }
      blocks.push(opts);
    }

    blocks.forEach(b => screen.appendChild(b));

    api.setFooter({ ...footerOpts(), timerText: formatTime(countdown.getRemaining()) });
  }

  function select(opt) {
    state.attempt.sectionA.answers[questions[current].id] = opt;
    render();
  }
  function selectHotspot(id) {
    state.attempt.sectionA.answers[questions[current].id] = id;
    render();
  }

  function finishSection() {
    countdown.stop();
    // Mark and proceed to Section B (or straight to results if MCQ-only)
    let score = 0;
    for (const q of questions) {
      const ans = state.attempt.sectionA.answers[q.id];
      if (ans !== undefined && String(ans) === String(q.answer)) score++;
    }
    state.attempt.sectionA.score = score;
    api.bridge.saveHistory(state.attempt);
    if (state.attempt.mode === 'mcq') api.go('results');
    else                              api.go('sectionB');
  }

  render();
}
