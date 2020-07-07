const fs = require('fs')
const path = require('path')
const spawn = require('child_process').spawn;
const { app, BrowserWindow, dialog,
        Menu, MenuItem, screen } = require('electron')
const fetch = require('node-fetch')
const { getLogger } = require('./logger')

const logger = getLogger('main')

const isDevMode = function() {
  return process.argv[2] == '--dev'
};
if (isDevMode()) {
  // load the '.env' file from the project root
  const dotenv = require('dotenv');
  dotenv.config();
}

function buildMenu() {
  const menuAbout = new MenuItem({
    label: 'About',
    submenu: [
      {
        label: 'About InVEST Workbench',
        click: async () => {
          dialog.showMessageBox({
            message: "About InVEST Workbench \n",
            detail: `version ${app.getVersion()}`,
            type: 'info',
            buttons: ['OK']
          })
        }
      }
    ]
  })

  const menu = Menu.getApplicationMenu()
  console.log(menu)
  console.log(menu.getMenuItemById(2))
  // menu.items.pop()  // discard the default Help menu
  // console.log(menu)
  menu.append(menuAbout)
  Menu.setApplicationMenu(menu)
}

// Binding to the invest server binary:
let serverExe;

// A) look for a local registry of available invest installations
const investRegistryPath = path.join(
  app.getPath('userData'), 'invest_registry.json')
if (fs.existsSync(investRegistryPath)) {
  const investRegistry = JSON.parse(fs.readFileSync(investRegistryPath))
  const activeVersion = investRegistry['active']
  serverExe = investRegistry['registry'][activeVersion]['server']

// B) check for dev mode and an environment variable from dotenv
} else if (isDevMode()) {
  serverExe = process.env.SERVER

// C) point to binaries included in this app's installation.
} else {
  const binary = (process.platform === 'win32') ? 'server.exe' : 'server'
  // serverExe = path.join(__dirname, 'invest', binary)
  logger.debug(process.resourcesPath)
  serverExe = path.join(
    process.resourcesPath, 'app.asar.unpacked', 'build', 'invest', binary)
  logger.debug(serverExe)
}

let PORT = (process.env.PORT || '5000').trim();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
const createWindow = async () => {
  /** Much of this is electron app boilerplate, but here is also
  * where we fire up the python flask server.
  */
  createPythonFlaskProcess();

  // Create the browser window.
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  logger.debug(width + ' ' + height)
  mainWindow = new BrowserWindow({
    width: width * 0.75,
    height: height,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: true
    }
  });

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/index.html`);

  buildMenu()

  // Open the DevTools.
  if (isDevMode()) {
    const { default: installExtension, REACT_DEVELOPER_TOOLS } = require('electron-devtools-installer');
    await installExtension(REACT_DEVELOPER_TOOLS);
    // enableLiveReload({ strategy: 'react-hmr' });
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
};

function createPythonFlaskProcess() {
  /** Spawn a child process running the Python Flask server.*/
  if (serverExe) {
    // The most reliable, cross-platform way to make sure spawn
    // can find the exe is to pass only the command name while
    // also putting it's location on the PATH:
    const pythonServerProcess = spawn(path.basename(serverExe), {
        env: {PATH: path.dirname(serverExe)}
      });

    logger.debug('Started python process as PID ' + pythonServerProcess.pid);
    logger.debug(serverExe)
    pythonServerProcess.stdout.on('data', (data) => {
      logger.debug(`${data}`);
    });
    pythonServerProcess.stderr.on('data', (data) => {
      logger.debug(`${data}`);
    });
    pythonServerProcess.on('error', (err) => {
      logger.debug('Process failed.');
      logger.debug(err);
    });
    pythonServerProcess.on('close', (code, signal) => {
      logger.debug(code);
      logger.debug('Child process terminated due to signal ' + signal);
    });
  } else {
    logger.debug('no existing invest installations found')
  }
}

function shutdownPythonProcess() {
  return(
    fetch(`http://localhost:${PORT}/shutdown`, {
      method: 'get',
    })
    .then((response) => { return response.text() })
    .then((text) => { logger.debug(text) })
    .catch((error) => { logger.debug(error) })
  )
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', async () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    // It's crucial to await here, otherwise the parent
    // process dies before flask has time to kill its server.
    await shutdownPythonProcess();
    app.quit()
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

// TODO: I haven't actually tested this yet on MacOS
app.on('will-quit', async () => {
  if (process.platform === 'darwin') {
    await shutdownPythonProcess();
  }
});
