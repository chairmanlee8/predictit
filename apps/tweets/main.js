require('module-alias/register');

const path = require('path');
const WebSocket = require('ws');
const { app, BrowserWindow } = require('electron');
const ipc = require('electron').ipcMain;

let win;
let ws;

console.log(module.paths);

ws = new WebSocket('ws+unix://localhost:7000');

ws.on('message', function incoming(data) {
  console.log(data);
  win.webContents.send('python', JSON.parse(data));
});

/**
 * Create the main window.
 */
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 960,
    webPreferences: {
      // CR: not secure, but I don't care right now
      nodeIntegration: true,
    },
  });

  //win.loadFile('app.html');
  win.loadFile('tweet-viewer.html');
  //win.setBackgroundColor('#ffffff');
  // win.webContents.openDevTools();

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

ipc.on('python', (event, data) => {
  ws.send(JSON.stringify(data));
});
