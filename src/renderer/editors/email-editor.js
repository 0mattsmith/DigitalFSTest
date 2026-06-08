// Email composer — the practical tasks frequently ask the student to
// "email the finished product to the teacher". This editor lets them
// fill To / CC / BCC / Subject / Body, attach generated files, and
// also set up an automated signature (a Level 1 task).

import { h } from '../screens/components.js';

export function mountEmailComposer(container, opts) {
  const { contacts = [], attachments = [], initial = {}, onChange = () => {} } = opts;

  const state = {
    to: initial.to || '',
    cc: initial.cc || '',
    bcc: initial.bcc || '',
    subject: initial.subject || '',
    body: initial.body || '',
    showCc: false, showBcc: false,
    signature: initial.signature || '',
    sentAt: null,
    attached: [...(initial.attached || [])],
  };

  // Toolbar with signature setup and contacts dropdown
  const sigBtn = h('button', { onClick: () => {
    const sig = prompt('Set up your automated signature:', state.signature || 'Kind regards,\nYour name');
    if (sig != null) {
      state.signature = sig;
      // Append signature to body if it isn't already there
      if (!state.body.endsWith(sig)) {
        state.body = (state.body || '') + '\n\n' + sig;
        bodyEl.value = state.body;
      }
      flash('Signature saved.');
      onChange(getSnapshot());
    }
  } }, 'Set signature');

  const contactsBtn = h('button', { onClick: () => {
    if (!contacts.length) { alert('No saved contacts.'); return; }
    const pick = prompt('Add to (paste the email):\n' + contacts.map(c => c.name + ' <' + c.email + '>').join('\n'));
    if (pick) {
      state.to = state.to ? state.to + '; ' + pick : pick;
      toInput.value = state.to;
      onChange(getSnapshot());
    }
  } }, 'Add contact');

  const attachBtn = h('button', { onClick: () => {
    if (!attachments.length) { alert('No files available for attachment yet.'); return; }
    const list = attachments.map(a => a.filename).join('\n');
    const pick = prompt('Available attachments:\n' + list + '\nType filename:');
    const found = attachments.find(a => a.filename === pick);
    if (found && !state.attached.find(x => x.filename === found.filename)) {
      state.attached.push(found);
      renderAttach();
      onChange(getSnapshot());
    }
  } }, 'Attach file');

  const toolbar = h('div', { class: 'tool-bar' }, sigBtn, contactsBtn, attachBtn);

  const toInput = h('input', { type: 'text', value: state.to, oninput: e => { state.to = e.target.value; onChange(getSnapshot()); } });
  const subjectInput = h('input', { type: 'text', value: state.subject, oninput: e => { state.subject = e.target.value; onChange(getSnapshot()); } });
  const ccInput = h('input', { type: 'text', value: state.cc, oninput: e => { state.cc = e.target.value; onChange(getSnapshot()); } });
  const bccInput = h('input', { type: 'text', value: state.bcc, oninput: e => { state.bcc = e.target.value; onChange(getSnapshot()); } });
  const bodyEl = h('textarea', { class: 'email-body', oninput: e => { state.body = e.target.value; onChange(getSnapshot()); } });
  bodyEl.value = state.body;

  const ccRow = h('div', { class: 'email-row hide' },
    h('span', { class: 'label' }, 'Cc'),
    ccInput);
  const bccRow = h('div', { class: 'email-row hide' },
    h('span', { class: 'label' }, 'Bcc'),
    bccInput);

  const ccToggle = h('span', { class: 'cc-toggle', onClick: () => {
    state.showCc = !state.showCc; ccRow.classList.toggle('hide', !state.showCc); onChange(getSnapshot());
  } }, 'Cc');
  const bccToggle = h('span', { class: 'cc-toggle', onClick: () => {
    state.showBcc = !state.showBcc; bccRow.classList.toggle('hide', !state.showBcc); onChange(getSnapshot());
  } }, 'Bcc');

  const attachRow = h('div', { class: 'email-attach' });
  function renderAttach() {
    attachRow.innerHTML = '';
    for (const att of state.attached) {
      attachRow.appendChild(h('span', { class: 'att-chip' }, '📎 ', att.filename,
        h('span', { style: { marginLeft: '6px', cursor: 'pointer' }, onClick: () => {
          state.attached = state.attached.filter(a => a.filename !== att.filename);
          renderAttach(); onChange(getSnapshot());
        } }, '×')));
    }
  }
  renderAttach();

  const sendBtn = h('button', { class: 'orange-btn', onClick: () => {
    state.sentAt = new Date().toISOString();
    flash('Email "sent" to teacher (saved as evidence).');
    onChange(getSnapshot());
  } }, 'Send to teacher');

  const ed = h('div', { class: 'email-composer' },
    h('div', { class: 'email-row' },
      h('span', { class: 'label' }, 'To'),
      toInput,
      ccToggle, bccToggle),
    ccRow, bccRow,
    h('div', { class: 'email-row' },
      h('span', { class: 'label' }, 'Subject'),
      subjectInput),
    bodyEl,
    attachRow,
    h('div', { class: 'email-actions' }, sendBtn,
      h('span', { class: 'muted', style: { marginLeft: '8px' } }, 'Sending saves this as evidence in your attempt folder.'))
  );

  container.innerHTML = '';
  container.appendChild(toolbar);
  container.appendChild(ed);

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
