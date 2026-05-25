const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');

// Custom URL scheme that mimics http origin — fixes "online features
// don't work" issues that hit Electron apps loaded from file:// because
// Supabase + some fetch APIs treat file:// as a null origin and reject
// cross-origin requests. With a registered http-like scheme the origin
// becomes something Supabase can accept and respond to normally.
const { protocol } = require('electron');
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

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
      // Allow fetch from this origin to call out to https://supabase.co etc.
      webSecurity: true,
    },
  });

  // Load via the app:// custom protocol so the page origin is "app://"
  // instead of "file://". Supabase + most fetch APIs behave correctly
  // against a real origin; file:// causes silent network failures.
  win.loadURL('app://photobook/index.html?app=1').catch((err) => {
    console.error('[Electron] loadURL failed', err);
    dialog.showErrorBox(
      'Failed to load Photobook Designer',
      `${err.message}\n\nTry reinstalling. If the problem persists, contact support@autobookbynej.online.`
    );
  });

  win.once('ready-to-show', () => win.show());

  // Open any <a target="_blank"> links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // F12 / ⌘⌥I opens DevTools so end-users can capture diagnostics when
  // something doesn't work (we ask them to paste console errors).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
    }
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
    }
  });

  // Surface load failures in the system error dialog so the user knows
  // something broke instead of staring at a blank window.
  win.webContents.on('did-fail-load', (_evt, errCode, errDesc, url) => {
    if (errCode === -3) return; // -3 = ABORTED (user-triggered nav), ignore
    dialog.showErrorBox(
      'Photobook Designer could not load',
      `Error ${errCode}: ${errDesc}\nURL: ${url}\n\nMake sure you have internet, then close and reopen the app. Press F12 inside the app to see details in DevTools.`
    );
  });
}

// Register the app:// protocol → resolves to files in dist/.
function registerAppProtocol() {
  const distRoot = path.join(__dirname, '..', 'dist');
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    // url.hostname is "photobook" (the host part of app://photobook/...)
    // url.pathname is "/index.html" etc.
    let relPath = decodeURIComponent(url.pathname);
    if (relPath === '/' || relPath === '') relPath = '/index.html';
    const absPath = path.join(distRoot, relPath);
    try {
      const { readFile } = require('fs/promises');
      const data = await readFile(absPath);
      const ext = path.extname(absPath).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      return new Response(data, { headers: { 'content-type': mime } });
    } catch (err) {
      console.error('[Electron] file not found:', absPath, err.message);
      return new Response(`Not found: ${relPath}`, { status: 404 });
    }
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.map':  'application/json',
};

app.whenReady().then(() => {
  registerAppProtocol();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
