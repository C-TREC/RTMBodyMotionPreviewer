// 只開放預覽器需要的檔案操作給畫面端
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("host", {
  openText: (filters) => ipcRenderer.invoke("open-text", { filters }),
  openScripts: () => ipcRenderer.invoke("open-scripts"),
  openModel: () => ipcRenderer.invoke("open-model"),
  saveText: (name, text, filters) => ipcRenderer.invoke("save-text", { name, text, filters }),
  savePng: (name, dataUrl) => ipcRenderer.invoke("save-png", { name, dataUrl }),
  info: () => ipcRenderer.invoke("app-info"),
  testInfo: () => ipcRenderer.invoke("test-info"),
  testModel: () => ipcRenderer.invoke("test-model"),
  testDone: () => ipcRenderer.invoke("test-done"),
});
