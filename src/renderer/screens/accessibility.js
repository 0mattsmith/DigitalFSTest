// Accessibility settings: large text, high contrast, dark mode, and a
// dyslexia-friendly font. Each one is a boolean stored in localStorage and
// applied by toggling a CSS class on <body>.
//
// The keys are intentionally simple strings so the settings survive a
// version upgrade. The toggles are accessible from the home screen.
//
// Settings:
//   a11y-large-text      ~ +20% font size, taller line height
//   a11y-high-contrast   ~ stronger borders, near-black on white, no gradients
//   a11y-dark            ~ dark mode (uses high-contrast palette inverted)
//   a11y-dyslexia        ~ Verdana font, generous line height + letter spacing

import { h } from './components.js';

const STORAGE_KEY = 'dfsq.a11y.v1';

const DEFAULTS = {
  largeText: false,
  highContrast: false,
  dark: false,
  dyslexia: false,
};

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  catch {}
}

export function applyA11yToDocument(settings = read()) {
  const body = document.body;
  body.classList.toggle('a11y-large-text',    !!settings.largeText);
  body.classList.toggle('a11y-high-contrast', !!settings.highContrast);
  body.classList.toggle('a11y-dark',          !!settings.dark);
  body.classList.toggle('a11y-dyslexia',      !!settings.dyslexia);
}

export function getA11y() { return read(); }

export function setA11y(partial) {
  const next = { ...read(), ...partial };
  write(next);
  applyA11yToDocument(next);
  return next;
}

// Render an accessibility panel into the host element.
export function renderA11yPanel(host) {
  let s = read();

  function toggleRow(key, label, hint) {
    const checked = !!s[key];
    const input = h('input', {
      type: 'checkbox',
      id: 'a11y-' + key,
      checked: checked,
      onChange: (e) => { s = setA11y({ [key]: e.target.checked }); },
    });
    return h('label', { class: 'a11y-row', for: 'a11y-' + key },
      input,
      h('div', { class: 'a11y-row-text' },
        h('strong', {}, label),
        hint ? h('div', { class: 'muted' }, hint) : null));
  }

  const card = h('div', { class: 'a11y-panel' },
    h('h4', { class: 'a11y-h' }, 'Display options'),
    h('div', { class: 'muted', style: { marginBottom: '8px' } },
      'Stay closer to the official look, or turn on adjustments that work for you. ' +
      'Your choices are remembered for next time.'),
    toggleRow('largeText',   'Larger text',          'Increases text size across the app.'),
    toggleRow('highContrast','High contrast',        'Stronger borders, removes subtle backgrounds.'),
    toggleRow('dark',        'Dark mode',            'Dark background with light text. Easier on the eyes in low light.'),
    toggleRow('dyslexia',    'Dyslexia-friendly font','Switches to a more readable font with extra line spacing.'),
    h('div', { class: 'muted', style: { marginTop: '8px', fontSize: '11px' } },
      'Note: the real DFSQ test player has its own accessibility menu. These ' +
      'options are for practice and won\'t be available in the official assessment.'));

  host.appendChild(card);
}
