const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicit bridge for the onboarding window only — the main app
// window loads the real DeltaForm UI over HTTP and doesn't need this at all.
contextBridge.exposeInMainWorld('onboarding', {
  submitEmail: (email) => ipcRenderer.send('onboarding:submit-email', email),
});
