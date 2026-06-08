# DFSQ Practice

A practice exam application for the Pearson Edexcel **Digital Functional Skills Qualification** at Entry Level 3 and Level 1. The UI mimics the "Test Player Preview" window shown in the official Sample Assessment Materials so students can rehearse in an environment that feels close to the real thing.

- Section A: 10 multiple-choice questions per attempt (auto-marked)
- Section B: a practical scenario with several tasks — spreadsheet, document, email, form fill, file management, screenshot evidence, search
- Every test is generated from a **seed**. The same seed reproduces the exact same paper, so a teacher can hand out a seed to make sure every student takes the same test.
- Each attempt's edited files are saved into a per-attempt folder, and the score, grade and seed are written to a history log.
- Built-in editors by default. Each Section B task that has an external file equivalent also offers an **Open in default app** dropdown that exports the work as `.csv`/`.html`/`.txt` and opens it with the OS-registered application.

## Requirements

- Node.js 18 or newer
- npm 9 or newer
- Internet access on first run (`npm install` downloads Electron)

Works on macOS (Intel and Apple Silicon) and Windows 10/11.

## Quick start

```bash
cd dfsq-practice
npm install
npm start
```

The app launches a single window. Pick a level, enter your name, choose a seed (or take the random one), and click **Start practice test**.

### On macOS

The first time you start the app, macOS may ask you to allow it to run because the binary inside `node_modules/electron` isn't signed. Allow it from System Settings → Privacy & Security. After that it launches normally.

If `npm start` fails complaining about Electron downloads being blocked behind a proxy, set:

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
```

### On Windows

Open Command Prompt or PowerShell:

```cmd
cd dfsq-practice
npm install
npm start
```

If Windows SmartScreen warns about an unrecognised app, click **More info → Run anyway**.

## Building a Windows .exe (from macOS or Windows)

The project ships with `electron-builder` configured. From the `dfsq-practice` folder:

```bash
# Build a Windows portable .exe (single-file, no install needed)
npm run build:win-portable

# OR build both: an NSIS installer + portable .exe
npm run build:win
```

The first build downloads the Windows Electron binary (~80 MB), which takes a minute or so. After it finishes, look in the `dist/` folder:

- `dist/DFSQ-Practice-0.1.0-portable.exe` — single-file portable build. Copy to a Windows machine and double-click to run. No install required.
- `dist/DFSQ-Practice Setup 0.1.0.exe` — proper installer. Creates Start Menu and Desktop shortcuts, supports clean uninstall.

You can build the Windows .exe from a macOS machine — no Windows machine or VM needed. The first time you run the build, macOS may ask for permission for the build tools to access the network; allow it.

If the Electron binary download is blocked behind a proxy, set a mirror first:

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
npm run build:win-portable
```

## Automatic updates (GitHub Releases)

The app checks `https://github.com/0mattsmith/DigitalFSTest/releases` on every launch. If a newer version is published, a small "Update available" banner appears in the top-right corner of the window. Clicking Download fetches the new build in the background; clicking Restart afterwards installs it and relaunches.

Users never need to do anything manually — they just keep using the app.

### Publishing a new release (for the maintainer)

1. **One-time setup:** create the repo at `https://github.com/0mattsmith/DigitalFSTest`. Make it public. Push the project code to it.

2. **Create a GitHub personal access token** (classic) with `repo` scope:
   - Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**.
   - Click **Generate new token (classic)**.
   - Tick the `repo` scope.
   - Copy the token. (It looks like `ghp_…`.)

3. **Bump the version** in `package.json` (e.g. `0.1.0` → `0.1.1`). The version number is how the updater decides whether a build is newer.

4. **Run the release command from the project folder:**

   ```bash
   export GH_TOKEN=ghp_yourtokenhere
   npm run release:win
   ```

   `electron-builder` will:
   - Build the Windows .exe and installer
   - Create a draft GitHub Release named after the version
   - Upload `latest.yml`, the installer, and the portable .exe as release assets

5. **Publish the draft release** on GitHub: open the repo → Releases → edit the draft → click **Publish release**.

That's it. Every running copy of the app will see the new version within seconds of opening and offer the update.

### Notes on auto-updates

- **Only the NSIS installer build supports in-place auto-update.** The portable .exe can detect a new version and prompt you to download it, but Windows can't replace a running portable .exe — the user will need to manually replace it. Use the installer (`npm run build:win`) for the smooth path.
- **macOS:** auto-update works the same way once you also run `npm run release:mac` and publish the `.dmg`/`.zip` assets. The Mac build needs code-signing to auto-update without warnings, but it still works unsigned (with a Gatekeeper prompt the first time).
- **Disabling:** users can dismiss any update prompt with "Later" and the banner won't reappear until the next launch (or until a newer version is released).
- **Manual check:** the home screen has a "Check for updates" button that fires a check on demand.

## Where your work is stored

Edited files, screenshots, the `work-snapshot.json` for each task, and the final `results.json` are written to a per-attempt folder under the OS-standard userData directory.

- **macOS:** `~/Library/Application Support/dfsq-practice/dfsq-data/attempts/<attemptId>/`
- **Windows:** `%APPDATA%\dfsq-practice\dfsq-data\attempts\<attemptId>\`

The history index lives next to the attempts folder as `history.json`. The History screen inside the app has a button to open the folder directly in Finder/Explorer for any attempt.

## Seeds and history

Each attempt is tagged with its seed (e.g. `K3PXJN4Q`). To retake the same paper, either type the seed manually on the home screen or go to **History → Retake with this seed**. Picking the same seed produces the same Section A questions in the same order and the same Section B scenario.

## Content coverage

The bundled content covers all five DFSQ skill areas:

1. Using devices and handling information
2. Creating and editing
3. Communicating
4. Transacting
5. Being safe and responsible online

There are 63 MCQs in the Entry Level 3 bank and 64 in the Level 1 bank, distributed across all five skill areas. Section B has 10 scenarios per level. Picking 10 of ~60 questions plus 1 of 10 scenarios gives plenty of variety — students rarely see the same paper twice unless they choose to.

## Customising / adding your own questions

Question banks live as plain JSON:

- `assets/banks/e3.json` — Entry Level 3 MCQs
- `assets/banks/l1.json` — Level 1 MCQs

Scenarios live in:

- `assets/scenarios/e3.json`
- `assets/scenarios/l1.json`

Each scenario has tasks with a `kind` (`spreadsheet`, `document`, `email`, `form`, `search`, `contacts`, `file-management`, `screenshot`, `mcq-list`) and a `criteria` array. The criteria evaluator lives in `src/renderer/screens/section-b.js` (`evalCriterion`). Adding new criterion types is straightforward — add a `case` to the switch.

## Project layout

```
dfsq-practice/
├── package.json
├── README.md
├── src/
│   ├── main/
│   │   ├── main.js        Electron main process + IPC handlers
│   │   └── preload.js     contextBridge API
│   └── renderer/
│       ├── index.html     Single-page shell, includes the "Test Player Preview" chrome
│       ├── app.js         Router and footer controller
│       ├── styles/main.css
│       ├── screens/
│       │   ├── home.js
│       │   ├── history.js
│       │   ├── section-a.js   10-MCQ engine, seeded
│       │   ├── section-b.js   Practical task engine + auto-marking
│       │   ├── results.js
│       │   └── components.js  Seeded PRNG, DOM helpers, timer
│       └── editors/
│           ├── spreadsheet.js  Mini spreadsheet (formulas, sort, chart, merges)
│           ├── docx-editor.js  ContentEditable rich-text editor
│           ├── email-editor.js Composer with signature, attachments, Cc/Bcc
│           └── form.js         Web form renderer
└── assets/
    ├── banks/{e3,l1}.json
    └── scenarios/{e3,l1}.json
```

## Limitations

- The built-in spreadsheet supports only the formula functions the DFSQ marking requires (`SUM`, `AVERAGE`, `MAX`, `MIN`, `COUNT`, plus arithmetic and cell references). It is not a replacement for Excel.
- The doc editor uses `document.execCommand` and stores output as HTML, which is plenty for the marking criteria but is not a `.docx` writer. Exporting "Open in default app" writes the doc as HTML, which Word will happily open.
- The marking is intentionally lenient — DFSQ marking is positive, awarding marks for what the student demonstrated. The criteria are tuned for typical correct responses, not for every edge case.

## Testing

A smoke test that verifies the JSON banks load, the seeded PRNG is deterministic, and the criteria evaluator behaves as expected can be run with:

```bash
node smoke.test.mjs
```
