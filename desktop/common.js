const ipc = require('node-ipc')
const path = require('path')
const sh = require('shelljs')
const fs = require('fs-extra')
const spawn = require('child_process').spawn
const { BrowserWindow } = require('electron')

const _name = 'carmelstudio'

sh.config.execPath = sh.which('node')

const HOME = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME']
const CARMEL_HOME = path.resolve(HOME, '.carmel')
const CARMEL_HOME_CONTEXT = path.resolve(CARMEL_HOME, 'context', 'index.json')
const CARMEL_HOME_PRODUCTS = path.resolve(CARMEL_HOME, 'products')
const CARMEL_HOME_TEMPLATE = path.resolve(__dirname, 'templates', 'home')

const productExists = (name) => {
  return fs.existsSync(path.resolve(CARMEL_HOME_PRODUCTS, name))
}

const clientData = (mainWindow, client, data) => {
  mainWindow && mainWindow.webContents.send(client, data)
}

const clientLog = (mainWindow, client, text) => {
  mainWindow && mainWindow.webContents.send(client, { log: `${text}` })
}

const clientError = (mainWindow, client, error) => {
  mainWindow && mainWindow.webContents.send(client, { error: `${error}` })
}

const clientDone = (mainWindow, client, error) => {
  mainWindow && mainWindow.webContents.send(client, Object.assign({}, { done: true }, error && { error: `${error}` }))
}

const exec = ({ mainWindow, cmd, args, client }) => {
  const proc = spawn(cmd, args, { cwd: CARMEL_HOME })

  proc.stdout.on('data', (data) => {
    clientLog(mainWindow, client, data)
  })

  proc.stderr.on('data', (data) => {
    clientError(mainWindow, client, data)
  })

  proc.on('close', (code) => {
    clientDone(mainWindow, client, (code === 0 ? false : `Exited with code ${code}`))
  })
}

const terminalExec = (props) => {
  ipc.of.carmelhyper && ipc.of.carmelhyper.emit('command', Object.assign({}, { from: _name }, props))
}

const isTerminalConnected = () => {
  return ipc.of.carmelhyper
}

const closeTerminal = () => {
  updateContext({ hyper: false, ssh: false })
  terminalExec({ cmd: 'exit' })
}

const cmdls = (cmd, regex, ids) => {
  return sh.exec(cmd, { silent: true }).split('\n').filter(m => m).map(m => {
    if (!regex) {
      return m
    }
    var result = {}
    var id = 0
    m.match(regex).slice(1).map(m => { result[ids[id++]] = m.trim() })
    return result
  })
}

const loadMachinesState = () => {
  const boxes = cmdls('vagrant box list', /(.*)\s*\((.*)\s*,\s*(.*)\)/, ['name', 'type', 'version'])
  const imported = cmdls('vboxmanage list vms', /"(.*)"\s*{(.*)}/, ['name', 'id'])
  const running = cmdls('vboxmanage list runningvms', /"(.*)"\s*{(.*)}/, ['name', 'id'])

  return ({ boxes, imported, running })
}

const loadContext = () => {
  try {
    return JSON.parse(fs.readfileSync(CARMEL_HOME_CONTEXT, 'utf8'))
  } catch (e) {
    return {}
  }
}

const updateContext = (updates) => {
  var context = loadContext()

  if (!updates) {
    return context
  }

  try {
    const newContext = Object.assign({}, context, updates)
    fs.writeFileSync(CARMEL_HOME_CONTEXT, JSON.stringify(newContext, null, 2))
    return newContext
  } catch (e) {
    return context
  }
}

const initContext = () => {
  if (!fs.existsSync(CARMEL_HOME)) {
    fs.copySync(CARMEL_HOME_TEMPLATE, CARMEL_HOME)
  }

  fs.copySync(path.resolve(CARMEL_HOME_TEMPLATE, 'bin'), path.resolve(CARMEL_HOME, 'bin'))

  updateContext({ timestamp: `${Date.now()}`})
}

var _previewBrowser

const startPreview = () => {
  if (_previewBrowser) {
    return
  }

  _previewBrowser = new BrowserWindow({
    width: 960,
    height: 800,
    minWidth: 960,
    minHeight: 800,
    show: false,
    backgroundColor: '#0bbcd4'
  })
  _previewBrowser.loadURL('http://localhost:18082')
  _previewBrowser.on('ready-to-show', () => {
    _previewBrowser.show()
  })
}

const stopPreview = () => {
  if (!_previewBrowser) {
    return
  }

  updateContext({ preview: false})

  if (_previewBrowser.isVisible()) {
    _previewBrowser.close()
  }
}

module.exports = {
  CARMEL_HOME,
  CARMEL_HOME_PRODUCTS,
  sh,
  exec,
  clientData,
  clientLog,
  clientDone,
  startPreview,
  stopPreview,
  clientError,
  productExists,
  terminalExec,
  isTerminalConnected,
  loadMachinesState,
  closeTerminal,
  initContext,
  updateContext,
  loadContext
}
