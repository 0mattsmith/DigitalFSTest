// Firebase client — handles uploading attempt summaries to Firestore and
// querying them back for the teacher dashboard.
//
// The Firebase Web SDK is loaded lazily from gstatic CDN the first time
// any function is called. If `window.FIREBASE_CONFIG` is missing or its
// apiKey is empty, all functions become no-ops so the app continues to
// work entirely offline.
//
// On the student side we upload a per-attempt summary keyed by classCode.
// On the teacher side we subscribe to a live query filtered by classCode.
// Security comes from Firestore Security Rules (firestore.rules in the
// repo root) — the embedded config values are intentionally public.

let firebasePromise = null;

const SDK_BASE = 'https://www.gstatic.com/firebasejs/10.7.1';

export function isConfigured() {
  const c = window.FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.projectId);
}

async function loadFirebase() {
  if (firebasePromise) return firebasePromise;
  if (!isConfigured()) return null;
  firebasePromise = (async () => {
    const appMod = await import(SDK_BASE + '/firebase-app.js');
    const fsMod  = await import(SDK_BASE + '/firebase-firestore.js');
    const app = appMod.initializeApp(window.FIREBASE_CONFIG);
    const db  = fsMod.getFirestore(app);
    return {
      db,
      collection:    fsMod.collection,
      addDoc:        fsMod.addDoc,
      query:         fsMod.query,
      where:         fsMod.where,
      orderBy:       fsMod.orderBy,
      limit:         fsMod.limit,
      onSnapshot:    fsMod.onSnapshot,
      getDocs:       fsMod.getDocs,
      serverTimestamp: fsMod.serverTimestamp,
    };
  })().catch((err) => {
    console.warn('[firebase] init failed:', err);
    firebasePromise = null;
    return null;
  });
  return firebasePromise;
}

// ---------------------------------------------------------------------------
//  Student-side: upload an attempt summary after Section A / B finishes.
//  Idempotent — re-uploading the same attemptId is a no-op (we track sent
//  IDs in localStorage).
// ---------------------------------------------------------------------------
const UPLOADED_KEY = 'dfsq.uploadedAttempts.v1';

function readUploaded() {
  try { return new Set(JSON.parse(localStorage.getItem(UPLOADED_KEY) || '[]')); }
  catch { return new Set(); }
}
function markUploaded(attemptId) {
  if (!attemptId) return;
  try {
    const s = readUploaded();
    s.add(attemptId);
    localStorage.setItem(UPLOADED_KEY, JSON.stringify(Array.from(s)));
  } catch {}
}
export function hasBeenUploaded(attemptId) {
  return readUploaded().has(attemptId);
}

export async function uploadAttempt(attempt, classCode, opts = {}) {
  if (!classCode) return { skipped: 'no class code' };
  if (!opts.force && attempt.id && hasBeenUploaded(attempt.id)) {
    return { skipped: 'already uploaded' };
  }
  const fb = await loadFirebase();
  if (!fb) return { skipped: 'firebase not configured' };
  try {
    const summary = buildAttemptSummary(attempt, classCode);
    summary.attemptId = attempt.id || null;
    await fb.addDoc(fb.collection(fb.db, 'attempts'), summary);
    markUploaded(attempt.id);
    return { ok: true };
  } catch (err) {
    console.warn('[firebase] upload failed:', err);
    return { error: err.message };
  }
}

// Push every locally-saved attempt to Firestore. Returns counts so the
// caller can show a progress / summary message.
//
// The class code is OPTIONAL — if not set, attempts upload under
// "UNASSIGNED" so they still land in the admin's all-time history.
// This means every result a student has ever taken on this device
// makes it to the master dashboard regardless of whether the student
// has filled in a class code.
export const DEFAULT_CLASS_CODE = 'UNASSIGNED';

export async function syncAllHistory(classCode, onProgress) {
  if (!window.dfsq || !window.dfsq.listHistory) return { skipped: 'no history bridge' };
  const fb = await loadFirebase();
  if (!fb) return { skipped: 'firebase not configured' };

  const effectiveCode = ((classCode || '').trim().toUpperCase()) || DEFAULT_CLASS_CODE;

  const hist = await window.dfsq.listHistory();
  const attempts = (hist && hist.attempts) || [];
  let uploaded = 0, skipped = 0, failed = 0;
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    onProgress && onProgress({ index: i + 1, total: attempts.length, attempt: a });
    if (!a.totalMax || a.totalMax === 0) { skipped++; continue; }
    if (hasBeenUploaded(a.id)) { skipped++; continue; }
    try {
      const summary = buildAttemptSummary(a, effectiveCode);
      summary.attemptId = a.id || null;
      summary.backfilled = true;
      await fb.addDoc(fb.collection(fb.db, 'attempts'), summary);
      markUploaded(a.id);
      uploaded++;
    } catch (err) {
      console.warn('[firebase] sync failed for', a.id, err);
      failed++;
    }
  }
  return { uploaded, skipped, failed, total: attempts.length, classCode: effectiveCode };
}

// Build the shape we actually send to Firestore. Includes summary,
// per-area accuracy, and a "what to improve" list so the teacher can
// see at a glance where the student needs help.
export function buildAttemptSummary(attempt, classCode) {
  const sa = attempt.sectionA || {};
  const sb = attempt.sectionB || {};
  const areaStats = {};
  for (const q of (sa.questions || [])) {
    const area = q.area || 'other';
    if (!areaStats[area]) areaStats[area] = { correct: 0, total: 0 };
    areaStats[area].total++;
    const ans = (sa.answers || {})[q.id];
    if (ans !== undefined && String(ans) === String(q.answer)) {
      areaStats[area].correct++;
    }
  }
  const toImprove = Object.entries(areaStats)
    .filter(([_, s]) => s.total >= 1 && (s.correct / s.total) < 0.6)
    .map(([area, s]) => ({
      area, correct: s.correct, total: s.total,
      accuracy: s.total ? Math.round((s.correct / s.total) * 100) : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const totalScore = attempt.totalScore != null ? attempt.totalScore
                    : ((sa.score || 0) + (sb.score || 0));
  const totalMax   = attempt.totalMax != null ? attempt.totalMax
                    : ((sa.total || 0) + (sb.total || 0));

  return {
    classCode:    String(classCode).trim().toUpperCase(),
    studentName:  attempt.candidate || 'Anonymous',
    registration: attempt.registration || '',
    level:        attempt.level,
    seed:         attempt.seed,
    mode:         attempt.mode || 'both',
    startedAt:    attempt.startedAt || null,
    finishedAt:   attempt.finishedAt || new Date().toISOString(),
    totalScore, totalMax,
    pct:          totalMax ? Math.round((totalScore / totalMax) * 100) : 0,
    grade:        attempt.grade || 'Unknown',
    gradeNote:    attempt.gradeNote || '',
    sectionA: { score: sa.score || 0, total: sa.total || 0 },
    sectionB: { score: sb.score || 0, total: sb.total || 0 },
    areaStats,
    toImprove,
    appVersion:   'web',
    uploadedAt:   new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
//  Teacher-side: live query attempts for a class.
//  Returns an unsubscribe function.
// ---------------------------------------------------------------------------
export async function subscribeToClass(classCode, onUpdate, onError) {
  const fb = await loadFirebase();
  if (!fb) { onError && onError(new Error('Firebase not configured')); return () => {}; }
  try {
    const q = fb.query(
      fb.collection(fb.db, 'attempts'),
      fb.where('classCode', '==', String(classCode).trim().toUpperCase()),
      fb.orderBy('finishedAt', 'desc'),
      fb.limit(500),
    );
    return fb.onSnapshot(q, (snap) => {
      const items = [];
      snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      onUpdate(items);
    }, (err) => onError && onError(err));
  } catch (err) {
    onError && onError(err);
    return () => {};
  }
}

// Class-code persistence so students don't have to retype it every time.
const STORAGE_KEY = 'dfsq.classCode.v1';
export function getStoredClassCode() {
  try { return (localStorage.getItem(STORAGE_KEY) || '').trim(); }
  catch { return ''; }
}
export function setStoredClassCode(code) {
  try {
    if (code) localStorage.setItem(STORAGE_KEY, String(code).trim().toUpperCase());
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
