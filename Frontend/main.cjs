const { app, BrowserWindow, ipcMain, Tray, Menu, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

function logEvent(message) {
  try {
    const logPath = path.join(app.getPath('userData'), 'app-security.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
  } catch (e) {
    console.error("Failed to write log", e);
  }
}

let mainWindow;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 700,
    minWidth: 400,
    minHeight: 600,
    frame: false,
    transparent: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    backgroundColor: '#00000000', // transparent
    show: false,
  });

  logEvent('Window created');

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

  // Enable Developer Tools on F12
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
    }
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
  let iconPath = path.join(__dirname, 'build', 'icon.png');
  // Fallback if build directory doesn't exist during dev
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, 'public', 'favicon.svg'); 
  }
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Dashboard', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit Exiomra Tracking System', click: () => {
      app.isQuitting = true;
      app.quit();
    }}
  ]);

  tray.setToolTip('Exiomra Tracking System');
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

  ipcMain.on('window-minimize', () => {
    if (mainWindow) {
      logEvent('User minimized window, hiding to tray');
      mainWindow.hide();
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) {
      logEvent('User clicked custom close button, minimizing to tray');
      mainWindow.hide();
    }
  });

  ipcMain.on('window-set-mini-mode', (event, isMini) => {
    if (mainWindow) {
      if (isMini) {
        mainWindow.setMinimumSize(220, 60);
        mainWindow.setSize(220, 60);
        mainWindow.setAlwaysOnTop(true, 'floating');
      } else {
        mainWindow.setMinimumSize(400, 600);
        mainWindow.setSize(450, 700);
        mainWindow.setAlwaysOnTop(false);
      }
    }
  });

  ipcMain.on('open-external-url', (event, url) => {
    require('electron').shell.openExternal(url);
  });

  logEvent('App initialization complete');
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
