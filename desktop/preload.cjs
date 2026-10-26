const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("stageSetDesktop", {
  selectStemDeck: () => ipcRenderer.invoke("stemdeck:select"),
  launchStemDeck: () => ipcRenderer.invoke("stemdeck:launch"),
});
