const { app, BrowserWindow, ipcMain, Tray, Menu, desktopCapturer } = require('electron');
const path = require('path');

let mainWindow;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 700,
    minWidth: 400,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    show: false, // Wait until ready-to-show to prevent flickering
  });

  // In development, load from Vite dev server. In production, load from dist.
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();

  // Configure Auto-Launch (start minimized or silently on boot)
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe'),
  });

  // Configure System Tray
  const { nativeImage } = require('electron');
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Dashboard', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit ChronoTrack', click: () => {
      app.isQuitting = true;
      app.quit();
    }}
  ]);

  tray.setToolTip('ChronoTrack');
  tray.setContextMenu(contextMenu);

  // When double clicking tray, show the window
  tray.on('double-click', () => {
    mainWindow.show();
  });

  // Prevent app from closing when X is clicked, instead minimize to tray
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  ipcMain.handle('get-screen-source', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    // Return the primary screen
    if (sources && sources.length > 0) {
      return sources[0].id;
    }
    return null;
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
