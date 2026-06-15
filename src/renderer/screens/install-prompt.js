// Chromium-style browsers (Chrome, Edge, Brave, Opera) used to show a
// "+ Install" icon in the address bar automatically. They now require an
// explicit user gesture — and Brave goes further and suppresses the auto
// prompt entirely for privacy.
//
// This module intercepts `beforeinstallprompt`, stashes the event, and
// surfaces an Install button on the home screen. Tapping the button calls
// `prompt()` which shows the OS install dialog directly.
//
// On platforms where the event never fires (iOS Safari, the Electron build,
// browsers that don't support it) the helper returns helpful instructions
// instead of an install button.

let deferredPrompt = null;

// Listen as early as possible — the event can fire before the home
// screen has rendered.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Tell the home screen to re-render its install row if it's already
  // mounted.
  window.dispatchEvent(new CustomEvent('dfsq:install-available'));
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  window.dispatchEvent(new CustomEvent('dfsq:install-done'));
});

export function canInstall() {
  return !!deferredPrompt;
}

export function isStandalone() {
  // True if the app is already running as an installed PWA.
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    // iOS Safari sets navigator.standalone when launched from the home
    // screen icon.
    (typeof navigator !== 'undefined' && navigator.standalone === true)
  );
}

// Detect platform for the "how to install" fallback message.
function detectInstallPath() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)) {
    return 'ios-safari';
  }
  if (/Android/.test(ua)) return 'android-chrome';
  if (/Edg\//.test(ua)) return 'desktop-edge';
  if (/Brave/.test(ua) || (navigator.brave && navigator.brave.isBrave)) return 'desktop-brave';
  if (/Chrome\//.test(ua)) return 'desktop-chrome';
  if (/Firefox\//.test(ua)) return 'desktop-firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'desktop-safari';
  return 'unknown';
}

// Trigger the install prompt. Returns a status string for diagnostics.
export async function triggerInstall() {
  if (!deferredPrompt) return 'not-available';
  const evt = deferredPrompt;
  deferredPrompt = null;
  try {
    evt.prompt();
    const choice = await evt.userChoice;
    return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch (err) {
    return 'error:' + err.message;
  }
}

// Friendly per-browser instructions when the auto-prompt isn't available.
export function manualInstallHint() {
  switch (detectInstallPath()) {
    case 'ios-safari':
      return 'Tap the Share button (square with an up-arrow) at the bottom of Safari, then choose "Add to Home Screen".';
    case 'android-chrome':
      return 'Open the menu (three dots, top-right), then tap "Install app" or "Add to home screen".';
    case 'desktop-brave':
      return 'Brave hides the auto-install prompt. Open the menu (☰ at the top-right) and choose "Install DFSQ Practice…", or look for the install icon in the address bar.';
    case 'desktop-chrome':
      return 'Look for the install icon (a small monitor with an arrow) at the right of the address bar, or open the menu (⋮) and choose "Install DFSQ Practice…"';
    case 'desktop-edge':
      return 'Click the install icon (app+arrow) in the address bar, or open the menu (…) → Apps → Install this site as an app.';
    case 'desktop-firefox':
      return 'Firefox on desktop doesn\'t yet support installing web apps. Try Chrome, Edge or Brave for the installable experience — the site still works fine in Firefox.';
    case 'desktop-safari':
      return 'On macOS Safari, click File → Add to Dock to install this site as an app.';
    default:
      return 'Look for an "Install" or "Add to Home Screen" option in your browser\'s menu.';
  }
}
