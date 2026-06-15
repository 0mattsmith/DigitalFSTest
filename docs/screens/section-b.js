// Section B — practical scenarios.
// Picks one scenario from the pool using the seed, walks the student
// through the brief + tasks. Each task has a `kind` that decides which
// editor to mount: spreadsheet / docEditor / email / form / screenshot.
//
// A "Open in default app" dropdown is shown when a task has externalFile
// support — clicking exports the current state to the user's default
// Excel/Word/etc. via the OS file association.

import { h, makeRng, pickOne, shuffle, makeCountdown, formatTime } from './components.js';
import { mountSpreadsheet } from '../editors/spreadsheet.js';
import { mountDocEditor } from '../editors/docx-editor.js';
import { mountEmailComposer } from '../editors/email-editor.js';
import { mountWebForm } from '../editors/form.js';
import { captureWindow, showScreenshotModal } from './screenshot-tool.js';

export function showSectionB(api, state) {
  const screen = document.getElementById('screen');
  screen.innerHTML = '';

  // Pick a scenario deterministically based on seed.
  const pool = state.scenarios?.scenarios || [];
  if (!pool.length) {
    screen.appendChild(h('p', {}, 'No Section B scenarios available for this level.'));
    return;
  }
  const rng = makeRng(state.test.seed + '|sectionB');

  // Two modes:
  //  (1) Default — pick ONE scenario, walk through all its tasks (mirrors the
  //      real DFSQ assessment).
  //  (2) Tasks-only with a custom taskCount — build a custom paper by sampling
  //      tasks from across multiple scenarios so the student can practise a
  //      lot of tasks in one sitting.
  let scenario;
  let tasks;
  const mode = state.attempt.mode || 'both';
  const taskCount = state.attempt.taskCount || 0;
  if (mode === 'tasks' && taskCount > 0) {
    // Flatten every task across every scenario, tag them with their scenario
    // so the brief panel can still show context, then deterministically shuffle.
    const allTasks = [];
    for (const sc of pool) {
      for (const t of sc.tasks) {
        allTasks.push({
          ...t,
          id: sc.id + '__' + t.id,
          _parentScenario: sc,
        });
      }
    }
    const target = Math.min(taskCount, allTasks.length);
    tasks = shuffle(rng, allTasks).slice(0, target);
    // Synthetic "scenario" wrapper so the rest of the screen keeps working.
    scenario = {
      id: 'custom-task-set',
      title: 'Custom task set',
      scenario: `${target} task${target === 1 ? '' : 's'} drawn from across the ${pool.length} scenarios in this level. ` +
        'Each task shows its own original scenario brief above.',
      briefHtml: '',
      tasks,
      _isCustom: true,
    };
  } else {
    scenario = pickOne(rng, pool);
    tasks = scenario.tasks;
  }
  state.attempt.sectionB.scenarioId = scenario.id;

  let currentTask = 0;

  // Snapshots keyed by task.id for editor outputs.
  const snapshots = state.attempt.sectionB.taskResults;

  // Section B time limit ≈ 1h 30m. Use 60 minutes for practice by default.
  const countdown = makeCountdown(60 * 60,
    (text) => api.setFooter({ ...footerOpts(), timerText: text }),
    () => { countdown.stop(); alert('Time up for Section B.'); finishSection(); });

  function footerOpts() {
    return {
      counter: `${currentTask + 1} / ${tasks.length}`,
      onPrev: () => { if (currentTask > 0) { currentTask--; render(); } },
      onNext: () => {
        if (currentTask < tasks.length - 1) { currentTask++; render(); }
        else finishSection();
      },
      disablePrev: currentTask === 0,
      highlightNext: true,
      onMarks: () => alert(`Task ${tasks[currentTask].label} is worth ${tasks[currentTask].marks} marks.\n` +
        `Scenario total: ${tasks.reduce((s, t) => s + t.marks, 0)} marks.`),
      onSave: async () => { await save(); flash('Saved.'); },
      showTimer: true,
    };
  }

  function render() {
    const task = tasks[currentTask];
    screen.innerHTML = '';

    // Brief / context panel on the left. In custom-task-set mode each task
    // can come from a different scenario, so we show that task's parent
    // scenario brief instead of the synthetic wrapper.
    const ctxScenario = task._parentScenario || scenario;
    const brief = h('div', { class: 'b-brief' },
      h('h2', {}, scenario._isCustom ? scenario.title : ctxScenario.title),
      scenario._isCustom
        ? h('div', { class: 'muted', style: { marginBottom: '6px' } }, scenario.scenario)
        : null,
      scenario._isCustom
        ? h('div', { class: 'pill', style: { background: '#003057', color: '#fff', display: 'inline-block', marginBottom: '8px' } },
            'Task from: ', ctxScenario.title)
        : h('div', { class: 'muted' }, ctxScenario.scenario || ''),
      ctxScenario.briefHtml ? h('div', { class: 'doc-frame', html: ctxScenario.briefHtml }) : null,
      h('h3', {}, scenario._isCustom ? 'All tasks in this paper' : 'Tasks'),
      ...tasks.map((t, i) => {
        const tagSrc = scenario._isCustom && t._parentScenario ? ' · ' + t._parentScenario.title : '';
        const card = h('div', { class: 'task-card' + (i === currentTask ? ' is-active' : ''),
          onClick: () => { currentTask = i; render(); } },
          h('div', { class: 'task-num' }, t.label, ' · ', String(t.marks), ' marks', tagSrc),
          h('div', { html: t.brief }));
        return card;
      }));

    const workarea = h('div', { class: 'b-workarea' });
    // Toolbar with "Open in default app" dropdown (when supported)
    const openSelect = h('select', { onChange: (e) => {
      handleOpenIn(e.target.value, task); e.target.value = '';
    } },
      h('option', { value: '' }, 'Open in…'),
      task.externalFile ? h('option', { value: 'default' }, 'Default app (' + task.externalFile.kind + ')') : null,
      task.externalFile ? h('option', { value: 'export' }, 'Export to chosen location') : null);

    const completeBtn = h('button', { class: 'orange-btn', onClick: () => completeTask(task) }, 'Mark task complete');
    const screenshotBtn = task.allowScreenshot
      ? h('button', { class: 'btn-mini', onClick: () => attachScreenshot(task) }, 'Add screenshot evidence')
      : null;
    const toolbarTop = h('div', { class: 'tool-bar' },
      h('strong', {}, 'Working on: ', task.label),
      h('span', { class: 'spacer', style: { flex: 1 } }),
      task.externalFile ? openSelect : null,
      screenshotBtn,
      completeBtn);
    workarea.appendChild(toolbarTop);

    const workBody = h('div', { class: 'workarea-body' });
    workarea.appendChild(workBody);

    // Clear any previous "active screenshot task" hook — the renderer will
    // re-set it inside renderScreenshotTask if the current task is one.
    state.__activeScreenshotTask = null;

    // Mount the right editor for this task kind
    mountTaskEditor(task, workBody);

    const layout = h('div', { class: 'b-layout' }, brief, workarea);
    screen.appendChild(layout);

    api.setFooter({ ...footerOpts(), timerText: formatTime(countdown.getRemaining()) });
  }

  function mountTaskEditor(task, host) {
    const onChange = (snap) => {
      snapshots[task.id] = snapshots[task.id] || {};
      snapshots[task.id].editor = snap;
    };
    const existing = snapshots[task.id]?.editor;
    if (task.kind === 'mcq-list') {
      // For multi-step lists of small subtasks (e.g. file management)
      renderChecklistTask(task, host);
      return;
    }
    if (task.kind === 'spreadsheet') {
      mountSpreadsheet(host, {
        rows: task.rows || 14, cols: task.cols || 8,
        initial: existing || task.initial || {},
        onChange,
      });
    } else if (task.kind === 'document') {
      mountDocEditor(host, {
        initialHtml: (existing && existing.html) || task.initialHtml || '',
        initialLandscape: (existing && existing.landscape) ?? task.initialLandscape ?? false,
        images: task.images || [],
        onChange,
      });
    } else if (task.kind === 'email') {
      mountEmailComposer(host, {
        contacts: task.contacts || [],
        attachments: collectAttachments(task),
        initial: existing || {},
        onChange,
      });
    } else if (task.kind === 'form') {
      mountWebForm(host, {
        fields: task.fields || [],
        initial: existing?.values || task.initial || {},
        onChange: (snap) => { snapshots[task.id] = { ...(snapshots[task.id] || {}), editor: snap }; },
      });
    } else if (task.kind === 'screenshot') {
      renderScreenshotTask(task, host);
    } else if (task.kind === 'contacts') {
      renderContactsTask(task, host);
    } else if (task.kind === 'search') {
      renderSearchTask(task, host);
    } else if (task.kind === 'file-management') {
      renderFileManagementTask(task, host);
    } else {
      host.innerHTML = '<div style="padding:14px">No editor implemented for "' + task.kind + '" yet.</div>';
    }
  }

  function collectAttachments(task) {
    // Pull files from earlier tasks (e.g. a doc the student edited, then attaches).
    const out = [];
    if (task.suggestedAttachments) {
      for (const sa of task.suggestedAttachments) {
        const prev = snapshots[sa.fromTaskId]?.editor;
        if (prev) out.push({ filename: sa.filename, kind: sa.kind, payload: prev });
      }
    }
    return out;
  }

  // --- Bespoke task UIs --------------------------------------------
  function renderChecklistTask(task, host) {
    host.innerHTML = '';
    const wrap = h('div', { style: { padding: '14px' } });
    snapshots[task.id] = snapshots[task.id] || { editor: { steps: {} } };
    for (const step of task.steps) {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = !!snapshots[task.id].editor.steps[step.id];
      cb.onchange = () => {
        snapshots[task.id].editor.steps[step.id] = cb.checked;
      };
      const row = h('label', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '4px 0' } },
        cb, h('div', { html: step.text }));
      wrap.appendChild(row);
    }
    host.appendChild(wrap);
  }

  function renderScreenshotTask(task, host) {
    host.innerHTML = '';
    snapshots[task.id] = snapshots[task.id] || { editor: { screenshots: [] } };
    const wrap = h('div', { style: { padding: '14px' } });
    wrap.appendChild(h('p', { html: task.prompt || 'Take a screenshot showing the requested action.' }));

    // Attach helper used by both the built-in capture button AND the global
    // title-bar Screenshot button when this task is the active one.
    async function attachSnap(snap) {
      // Already saved to attempt folder by captureWindow().
      snapshots[task.id].editor.screenshots.push({ filename: snap.filename, dataUrl: snap.dataUrl });
      renderList();
    }

    // 1) Built-in capture — captures the app window
    const captureBtn = h('button', { class: 'orange-btn', onClick: async () => {
      const snap = await captureWindow(state, { filename: `${task.id}_${Date.now()}.png` });
      if (!snap) return;
      showScreenshotModal(snap, {
        taskLabel: task.label,
        onSaveToTask: attachSnap,
      });
    } }, '◉ Take a screenshot');

    // 2) Fallback — upload an existing image file
    const fileInput = h('input', { type: 'file', accept: 'image/*', id: 'ss-file-' + task.id });
    fileInput.onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        const base64 = dataUrl.split(',')[1];
        const ext = f.name.split('.').pop();
        const filename = `${task.id}_${Date.now()}.${ext}`;
        await api.bridge.saveAttemptFile({
          attemptId: state.attempt.id, filename, content: base64, encoding: 'base64',
        });
        attachSnap({ filename, dataUrl });
      };
      reader.readAsDataURL(f);
    };

    const buttonRow = h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' } },
      captureBtn,
      h('span', { class: 'muted' }, 'or upload an existing image:'),
      fileInput);
    wrap.appendChild(buttonRow);

    const gallery = h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' } });
    wrap.appendChild(gallery);
    function renderList() {
      gallery.innerHTML = '';
      if (!snapshots[task.id].editor.screenshots.length) {
        gallery.appendChild(h('div', { class: 'muted', style: { fontStyle: 'italic' } },
          'No screenshots yet. Use the orange button above to capture, or upload one.'));
        return;
      }
      for (const s of snapshots[task.id].editor.screenshots) {
        const card = h('div', { style: { width: '180px', position: 'relative' } },
          h('img', { src: s.dataUrl, style: { width: '100%', border: '1px solid #c8c5be', borderRadius: '4px' } }),
          h('div', { class: 'muted', style: { fontSize: '11px', wordBreak: 'break-all' } }, s.filename),
          h('button', { class: 'btn-mini', style: { position: 'absolute', top: '4px', right: '4px', padding: '2px 6px' },
            onClick: () => {
              snapshots[task.id].editor.screenshots = snapshots[task.id].editor.screenshots.filter(x => x !== s);
              renderList();
            } }, '✕'));
        gallery.appendChild(card);
      }
    }
    renderList();

    // Register this task with the app so the global Screenshot button knows
    // captures should route here. Cleared when we leave this task.
    state.__activeScreenshotTask = {
      taskId: task.id,
      label: task.label,
      attach: attachSnap,
    };

    host.appendChild(wrap);
  }

  function renderContactsTask(task, host) {
    host.innerHTML = '';
    snapshots[task.id] = snapshots[task.id] || { editor: { contacts: [] } };
    const wrap = h('div', { style: { padding: '14px', maxWidth: '500px' } });
    wrap.appendChild(h('h3', {}, 'Contacts'));
    const list = h('div', {});
    wrap.appendChild(list);
    const nameI = h('input', { type: 'text', placeholder: 'Name' });
    const emailI = h('input', { type: 'email', placeholder: 'Email' });
    const phoneI = h('input', { type: 'tel', placeholder: 'Phone (optional)' });
    const addBtn = h('button', { class: 'btn-mini', onClick: () => {
      if (!nameI.value || !emailI.value) return;
      snapshots[task.id].editor.contacts.push({ name: nameI.value, email: emailI.value, phone: phoneI.value });
      nameI.value = emailI.value = phoneI.value = '';
      renderList();
    } }, 'Add contact');
    wrap.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '6px', marginTop: '8px' } },
      nameI, emailI, phoneI, addBtn));
    function renderList() {
      list.innerHTML = '';
      for (const c of snapshots[task.id].editor.contacts) {
        list.appendChild(h('div', { style: { padding: '4px 0', borderBottom: '1px solid #eee' } },
          h('strong', {}, c.name), ' — ', c.email, c.phone ? ' · ' + c.phone : ''));
      }
    }
    renderList();
    host.appendChild(wrap);
  }

  function renderSearchTask(task, host) {
    host.innerHTML = '';
    snapshots[task.id] = snapshots[task.id] || { editor: { search: '', finding: '' } };
    const wrap = h('div', { style: { padding: '14px', maxWidth: '600px' } });
    wrap.appendChild(h('div', { class: 'muted' }, task.prompt || 'Use the search bar to find the information requested.'));
    const sInput = h('input', { type: 'text', placeholder: 'Search terms', value: snapshots[task.id].editor.search });
    sInput.oninput = () => { snapshots[task.id].editor.search = sInput.value; };
    const fakeBrowser = h('div', { style: { border: '1px solid #c8c5be', borderRadius: '6px', marginTop: '10px' } },
      h('div', { class: 'tool-bar' }, '← → ⟳', h('input', { type: 'text', value: 'https://www.search-practice.local', style: { flex: 1 } })),
      h('div', { style: { padding: '14px' } },
        h('h3', {}, 'Practice search'),
        h('p', { class: 'muted' }, 'In the real exam you would browse a real search engine. ' +
          'Here, please record the search terms you used and the information you found.')));
    const findInput = h('textarea', { rows: 4, placeholder: 'Type the information you found here…', class: 'email-body', style: { marginTop: '10px' } });
    findInput.value = snapshots[task.id].editor.finding || '';
    findInput.oninput = () => { snapshots[task.id].editor.finding = findInput.value; };
    wrap.appendChild(h('div', { style: { display: 'flex', gap: '6px' } }, sInput));
    wrap.appendChild(fakeBrowser);
    wrap.appendChild(findInput);
    host.appendChild(wrap);
  }

  function renderFileManagementTask(task, host) {
    host.innerHTML = '';
    snapshots[task.id] = snapshots[task.id] || { editor: { folders: [], filenames: [] } };
    const wrap = h('div', { style: { padding: '14px' } });
    const newFolderI = h('input', { type: 'text', placeholder: 'Folder name (e.g. Devices)' });
    const newSubfolderI = h('input', { type: 'text', placeholder: 'Subfolder name (optional)' });
    const newFileI = h('input', { type: 'text', placeholder: 'File name (e.g. Problem.txt)' });
    const folderList = h('div', {});
    function renderFolderList() {
      folderList.innerHTML = '';
      for (const f of snapshots[task.id].editor.folders) {
        folderList.appendChild(h('div', {}, '📁 ', f.name, f.subfolder ? (' / 📁 ' + f.subfolder) : ''));
      }
      for (const fn of snapshots[task.id].editor.filenames) {
        folderList.appendChild(h('div', {}, '📄 ', fn));
      }
    }
    const addFolderBtn = h('button', { class: 'btn-mini', onClick: () => {
      if (!newFolderI.value) return;
      snapshots[task.id].editor.folders.push({ name: newFolderI.value, subfolder: newSubfolderI.value || null });
      newFolderI.value = ''; newSubfolderI.value = ''; renderFolderList();
    } }, 'Create folder');
    const addFileBtn = h('button', { class: 'btn-mini', onClick: () => {
      if (!newFileI.value) return;
      snapshots[task.id].editor.filenames.push(newFileI.value);
      newFileI.value = ''; renderFolderList();
    } }, 'Create file');

    wrap.appendChild(h('div', { class: 'muted' }, task.prompt || 'Create the folders and files described in the brief.'));
    wrap.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px', marginTop: '8px' } },
      newFolderI, newSubfolderI, addFolderBtn));
    wrap.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px', marginTop: '8px' } },
      newFileI, addFileBtn));
    wrap.appendChild(h('div', { style: { marginTop: '10px' } }, folderList));
    renderFolderList();
    host.appendChild(wrap);
  }

  // --- Open-in-default ----------------------------------------------
  async function handleOpenIn(option, task) {
    if (!option) return;
    const snap = snapshots[task.id]?.editor;
    if (!snap) { alert('Nothing to export yet — make changes first.'); return; }
    const ext = task.externalFile.kind === 'xlsx' ? 'csv'
              : task.externalFile.kind === 'docx' ? 'html'
              : 'txt';
    const filename = (task.externalFile.filename || task.id) + '.' + ext;
    let content = '';
    if (task.externalFile.kind === 'xlsx') content = csvFromSpreadsheet(snap);
    else if (task.externalFile.kind === 'docx') content = htmlDocFromEditor(snap);
    else content = JSON.stringify(snap, null, 2);

    if (option === 'default') {
      // Save into attempt folder, then ask OS to open it.
      const res = await api.bridge.saveAttemptFile({
        attemptId: state.attempt.id, filename, content, encoding: 'utf8',
      });
      await api.bridge.openExternalFile(res.path);
    } else if (option === 'export') {
      await api.bridge.exportToDownloads({ defaultName: filename, content, encoding: 'utf8' });
    }
  }

  function csvFromSpreadsheet(snap) {
    const cells = snap.cells || {};
    let maxR = 0, maxC = 0;
    for (const addr of Object.keys(cells)) {
      const m = addr.match(/^([A-Z]+)(\d+)$/);
      if (!m) continue;
      const c = m[1].charCodeAt(0) - 65;
      const r = parseInt(m[2], 10) - 1;
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
    let out = '';
    for (let r = 0; r <= maxR; r++) {
      const row = [];
      for (let c = 0; c <= maxC; c++) {
        const addr = String.fromCharCode(65 + c) + (r + 1);
        const cell = cells[addr];
        if (!cell) { row.push(''); continue; }
        let v = cell.raw;
        if (typeof v === 'string' && (v.includes(',') || v.includes('"'))) {
          v = '"' + v.replace(/"/g, '""') + '"';
        }
        row.push(v == null ? '' : v);
      }
      out += row.join(',') + '\n';
    }
    return out;
  }
  function htmlDocFromEditor(snap) {
    const orient = snap.landscape ? 'landscape' : 'portrait';
    return `<!doctype html><meta charset="utf-8"><style>body{font-family:Georgia,serif;font-size:14px;padding:40px;max-width:${snap.landscape?'920':'720'}px;margin:auto;${snap.border?'border:2px solid #003057;':''}}</style><body>${snap.html||''}</body>`;
  }

  function attachScreenshot(task) {
    // delegate to the screenshot task renderer pattern
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const ext = f.name.split('.').pop();
        const filename = `${task.id}_${Date.now()}.${ext}`;
        await api.bridge.saveAttemptFile({
          attemptId: state.attempt.id, filename, content: base64, encoding: 'base64',
        });
        snapshots[task.id] = snapshots[task.id] || { editor: {} };
        snapshots[task.id].editor.screenshots = snapshots[task.id].editor.screenshots || [];
        snapshots[task.id].editor.screenshots.push({ filename });
        flash('Screenshot attached.');
      };
      reader.readAsDataURL(f);
    };
    inp.click();
  }

  function completeTask(task) {
    snapshots[task.id] = snapshots[task.id] || {};
    snapshots[task.id].completedAt = new Date().toISOString();
    flash('Task ' + task.label + ' marked complete.');
  }

  async function save() {
    // Persist editor snapshots into the attempt folder as JSON
    await api.bridge.saveAttemptFile({
      attemptId: state.attempt.id,
      filename: 'work-snapshot.json',
      content: JSON.stringify({
        scenarioId: scenario.id,
        results: snapshots,
      }, null, 2),
      encoding: 'utf8',
    });
    await api.bridge.saveHistory(state.attempt);
  }

  async function finishSection() {
    countdown.stop();
    // Mark each task with simple, deterministic rules using its `mark` function definition.
    let score = 0, total = 0;
    const breakdown = [];
    for (const task of tasks) {
      total += task.marks;
      const got = markTask(task, snapshots[task.id]?.editor);
      score += got;
      breakdown.push({ id: task.id, label: task.label, got, max: task.marks });
    }
    state.attempt.sectionB.score = score;
    state.attempt.sectionB.total = total;
    state.attempt.sectionB.breakdown = breakdown;
    await save();
    api.go('results');
  }

  function flash(msg) {
    const f = h('div', { class: 'pill ok', style: { position: 'fixed', top: '60px', right: '20px', zIndex: 200 } }, msg);
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1500);
  }

  render();
}

// --- Auto-marking rules ------------------------------------------------
// Each task can specify mark criteria. We keep the rules central and
// straightforward so they are easy to tweak. Returns marks awarded.
function markTask(task, snap) {
  if (!snap) return 0;
  let m = 0;
  for (const crit of (task.criteria || [])) {
    if (evalCriterion(crit, snap)) m += crit.marks ?? 1;
    if (m > task.marks) m = task.marks;
  }
  return m;
}

function evalCriterion(crit, snap) {
  // Supported tests: containsText / equals / cellEquals / fieldEquals / has*
  switch (crit.test) {
    case 'emailHasField': {
      const v = (snap[crit.field] || '').toString();
      if (crit.contains) {
        return crit.contains.every(t => v.toLowerCase().includes(t.toLowerCase()));
      }
      if (crit.regex) return new RegExp(crit.regex, 'i').test(v);
      return !!v.trim();
    }
    case 'emailHasAttachment':
      return (snap.attached || []).some(a => a.filename === crit.filename || (crit.any && true));
    case 'emailHasSignature':
      return !!(snap.signature && snap.signature.trim().length > 4);
    case 'emailWasSent':
      return !!snap.sentAt;
    case 'docContains':
      return (snap.html || '').toLowerCase().includes((crit.text || '').toLowerCase());
    case 'docMatchesRegex':
      return new RegExp(crit.regex, 'i').test(snap.html || '');
    case 'docIsLandscape':
      return !!snap.landscape;
    case 'docHasBorder':
      return !!snap.border;
    case 'sheetCellRaw': {
      const cell = (snap.cells || {})[crit.cell];
      const raw = cell ? String(cell.raw) : '';
      if (crit.contains) return raw.toLowerCase().includes(crit.contains.toLowerCase());
      if (crit.regex) return new RegExp(crit.regex, 'i').test(raw);
      if (crit.equals != null) return String(crit.equals) === raw;
      return !!raw;
    }
    case 'sheetCellFormatted': {
      const f = (snap.formats || {})[crit.cell] || {};
      if (crit.numFmt) return f.numFmt === crit.numFmt;
      if (crit.bg) return !!f.bg;
      if (crit.fontSize) return f.fontSize === crit.fontSize;
      return false;
    }
    case 'sheetHasMerge':
      return Object.values(snap.merges || {}).includes(crit.range);
    case 'sheetHasChart':
      return !!snap.chart;
    case 'sheetChartType':
      return snap.chart && snap.chart.type === crit.type;
    case 'sheetChartOnNewSheet':
      return snap.activeSheet && snap.activeSheet !== 'Sheet1';
    case 'sheetSorted':
      return snap.sortInfo && snap.sortInfo.range === crit.range && snap.sortInfo.direction === crit.direction;
    case 'formFieldEquals': {
      const v = ((snap.values || {})[crit.field] || '').toString().trim().toLowerCase();
      return String(crit.value).toLowerCase() === v;
    }
    case 'formFieldHasImage':
      return !!((snap.values || {})[crit.field]?.dataUrl);
    case 'formFieldCheckboxIncludes': {
      const arr = (snap.values || {})[crit.field] || [];
      return crit.values.every(v => arr.includes(v));
    }
    case 'hasScreenshots':
      return (snap.screenshots || []).length >= (crit.min || 1);
    case 'checklistStep':
      return !!(snap.steps && snap.steps[crit.step]);
    case 'hasContact':
      return (snap.contacts || []).some(c =>
        c.email && c.email.toLowerCase() === (crit.email || '').toLowerCase());
    case 'fileManagementHasFolder':
      return (snap.folders || []).some(f => f.name.toLowerCase() === crit.name.toLowerCase());
    case 'fileManagementHasSubfolder':
      return (snap.folders || []).some(f => f.subfolder && f.subfolder.toLowerCase() === crit.name.toLowerCase());
    case 'searchHasFinding':
      return (snap.finding || '').toLowerCase().includes((crit.text || '').toLowerCase());
    case 'searchHasTerm':
      return (snap.search || '').toLowerCase().includes((crit.text || '').toLowerCase());
    default:
      return false;
  }
}
