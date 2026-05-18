const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Determine user data path for writable directories
const userDataPath = app.getPath('userData');
const collectionsDir = path.join(userDataPath, 'collections');
const environmentsDir = path.join(userDataPath, 'environments');
const reportsDir = path.join(userDataPath, 'reports');

// Ensure writable directories exist
[collectionsDir, environmentsDir, reportsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Set paths as environment variables so server.js can use them
process.env.NEWMAN_COLLECTIONS_DIR = collectionsDir;
process.env.NEWMAN_ENVIRONMENTS_DIR = environmentsDir;
process.env.NEWMAN_REPORTS_DIR = reportsDir;
process.env.NEWMAN_PUBLIC_DIR = path.join(__dirname, 'public');

// Start the Express server
require('./server.js');

const PORT = 4500;
let mainWindow;
let actualPort = PORT;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    title: 'Newman Runner',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  mainWindow.loadURL(`http://localhost:${actualPort}`);

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
