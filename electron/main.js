const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'deltaform-settings.json');
const PORT = 8787;

let mainWindow = null;
let onboardingWindow = null;

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings));
}

/** Boots the Express server in-process (inside Electron's own Node runtime — the friend running this never needs Node installed separately). */
async function startServer(contactEmail) {
  process.env.SEC_CONTACT_EMAIL = contactEmail;
  process.env.PORT = String(PORT);
  // Keep all writable app state in the OS-standard per-user data directory
  // instead of inside the (read-only once installed) app bundle.
  process.env.DELTAFORM_CACHE_DIR = path.join(app.getPath('userData'), 'cache');
  process.env.DELTAFORM_DATA_DIR = path.join(app.getPath('userData'), 'data');
  await import(path.join(__dirname, '..', 'server', 'src', 'index.js'));
}

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  const url = `http://localhost:${PORT}/api/health`;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    backgroundColor: '#05080a',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.loadURL(`http://localhost:${PORT}`);
}

function createOnboardingWindow() {
  onboardingWindow = new BrowserWindow({
    width: 480,
    height: 340,
    resizable: false,
    backgroundColor: '#05080a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  onboardingWindow.loadFile(path.join(__dirname, 'onboarding.html'));
}

async function boot(contactEmail) {
  try {
    await startServer(contactEmail);
  } catch (err) {
    dialog.showErrorBox('DeltaForm failed to start', String(err?.stack || err));
    app.quit();
    return;
  }
  const up = await waitForServer();
  if (!up) {
    dialog.showErrorBox('DeltaForm failed to start', 'The local server did not respond in time.');
    app.quit();
    return;
  }
  createMainWindow();
}

ipcMain.on('onboarding:submit-email', (_event, email) => {
  saveSettings({ contactEmail: email });
  onboardingWindow?.close();
  onboardingWindow = null;
  boot(email);
});

app.whenReady().then(() => {
  const settings = loadSettings();
  if (settings.contactEmail) {
    boot(settings.contactEmail);
  } else {
    createOnboardingWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
