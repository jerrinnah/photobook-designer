const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0c0c0c',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Pass ?app=1 so the SPA router skips the marketing landing page —
  // anyone running the desktop app has already chosen to use AutoBook
  // and shouldn't be re-pitched at every launch.
  win.loadFile(path.join(__dirname, '../dist/index.html'), { search: 'app=1' });
  win.once('ready-to-show', () => win.show());

  // Open any <a target="_blank"> links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
