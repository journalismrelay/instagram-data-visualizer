const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { startServer, stopServer } = require('./protocol');
const { processData } = require('./processor');

let mainWindow;
let tmpDir = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Instagram Data Visualizer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Open external links in the default browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (process.env.DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// IPC: Select folder (supports multiple)
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'multiSelections'],
    title: 'Select your Instagram data export folder(s)',
    message: 'If your export was split into multiple folders, select them all at once.',
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { paths: null };
  }
  return { paths: result.filePaths };
});

// IPC: Process data (accepts array of folder paths)
ipcMain.handle('process-data', async (_event, folderPaths) => {
  cleanupTmpDir();
  tmpDir = path.join(os.tmpdir(), `instagram-visualizer-${Date.now()}`);

  try {
    const result = processData(folderPaths, tmpDir, (progress) => {
      mainWindow.webContents.send('processing-progress', progress);
    });

    if (!result.success) return result;

    console.log('Processing done. Data dir:', tmpDir);

    // Start local server — serve media from all resolved data dirs
    const baseUrl = await startServer(tmpDir, result.resolvedDirs || folderPaths);

    return { success: true, baseUrl, htmlOnly: result.htmlOnly || false };
  } catch (e) {
    console.error('Processing error:', e);
    return { success: false, error: e.message };
  }
});

function cleanupTmpDir() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  stopServer();
  cleanupTmpDir();
});
