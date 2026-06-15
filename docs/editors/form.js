// Simple web-form renderer for Section B tasks that ask the student to
// complete an HTML form (e.g. the Pearson WORK EXPERIENCE form and the
// Level 1 utility / meter reading form).

import { h } from '../screens/components.js';

export function mountWebForm(container, opts) {
  const { fields = [], initial = {}, onChange = () => {} } = opts;

  const state = { values: { ...initial } };

  container.innerHTML = '';
  const wrap = h('form', { class: 'webform' });

  for (const f of fields) {
    const wrapField = h('div', { class: 'field' },
      h('label', {}, f.label + (f.required ? ' *' : '')));
    let input;
    if (f.type === 'select') {
      input = h('select', { name: f.name });
      for (const opt of f.options) input.appendChild(h('option', { value: opt }, opt));
    } else if (f.type === 'checkbox-group') {
      input = h('div', {});
      for (const opt of f.options) {
        const cb = h('input', { type: 'checkbox', value: opt });
        cb.onchange = () => {
          const all = (state.values[f.name] || []).filter(x => x !== opt);
          if (cb.checked) all.push(opt);
          state.values[f.name] = all;
          onChange(getSnapshot());
        };
        if ((initial[f.name] || []).includes(opt)) cb.checked = true;
        input.appendChild(h('label', { style: { display: 'inline-flex', gap: '4px', marginRight: '12px' } }, cb, opt));
      }
    } else if (f.type === 'textarea') {
      input = h('textarea', { name: f.name, rows: 4 });
      input.value = initial[f.name] || '';
    } else if (f.type === 'file') {
      input = h('input', { type: 'file', accept: 'image/*' });
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          state.values[f.name] = { filename: file.name, dataUrl: reader.result };
          onChange(getSnapshot());
        };
        reader.readAsDataURL(file);
      };
    } else {
      input = h('input', { type: f.type || 'text', name: f.name, value: initial[f.name] || '', placeholder: f.placeholder || '' });
    }

    if (input.tagName === 'INPUT' || input.tagName === 'SELECT' || input.tagName === 'TEXTAREA') {
      if (f.type !== 'checkbox-group' && f.type !== 'file') {
        input.addEventListener('input', () => {
          state.values[f.name] = input.value;
          onChange(getSnapshot());
        });
        input.addEventListener('change', () => {
          state.values[f.name] = input.value;
          onChange(getSnapshot());
        });
      }
    }
    if (f.help) wrapField.appendChild(h('div', { class: 'muted', style: { fontSize: '11px' } }, f.help));
    wrapField.appendChild(input);
    wrap.appendChild(wrapField);
  }

  wrap.appendChild(h('div', {}, h('button', { type: 'button', class: 'orange-btn', onClick: () => {
    flash('Form submitted (saved as evidence).');
    state.submittedAt = new Date().toISOString();
    onChange(getSnapshot());
  } }, 'Submit form')));

  container.appendChild(wrap);

  function flash(msg) {
    const f = h('div', { class: 'pill ok', style: { position: 'fixed', top: '60px', right: '20px', zIndex: 200 } }, msg);
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1500);
  }

  function getSnapshot() {
    return JSON.parse(JSON.stringify(state));
  }
  return { getSnapshot };
}
