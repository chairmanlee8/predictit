require('module-alias/register');

const { app, BrowserWindow } = require('electron');
const path = require('path');

let win;

console.log(module.paths);

/**
 * Create the main window.
 */
function createWindow() {
  win = new BrowserWindow({
    width: 1024,
    height: 960,
    webPreferences: {
      // CR alee: not secure, but I don't care right now
      nodeIntegration: true
    }
  });

  win.loadFile('app.html');
  win.setBackgroundColor('#ffffff');
  win.webContents.openDevTools();

  win.on('closed', () => {
    win = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow();
  }
});
