const electron = require('electron');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '../../../..');
const output = path.join(root, 'inspection/native-qa-result.json');
const source = fs.readFileSync(path.join(root, 'inspection/patched/out/main/index.js'), 'utf8');
const take = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
electron.app.setPath('userData', path.join(root, 'inspection/native-userdata'));
electron.app.whenReady().then(async () => {
  let win;
  const context = vm.createContext({ require$$1: electron, process, console,
    exports: {}, getAppConfig: async () => ({ minimizeToTray: true }),
    icoIcon: path.join(root, 'inspection/icon.ico'),
    buildContextMenu: async () => electron.Menu.buildFromTemplate([{ label: '显示窗口', click: () => context.showMainWindow() }]),
    quitTimeout: null, clearTimeout, icon: '', templateIcon: '' });
  try {
    win = new electron.BrowserWindow({ width: 800, height: 600, show: false });
    context.exports.mainWindow = win;
    vm.runInContext('let tray = null;\n' + take('async function createTray()', 'async function updateTrayMenu()') + take('async function showTrayIcon()', 'async function closeTrayIcon()') + take('function triggerMainWindow()', 'function closeMainWindow()') + take('  exports.mainWindow.on("close",', '  exports.mainWindow.on("resized",'), context);
    await win.loadURL('data:text/html,<meta charset="utf-8"><title>青山托盘验证</title><p>正在验证托盘最小化与恢复…</p>');
    win.show();
    await delay(700);
    win.minimize();
    await delay(1000);
    assert.equal(win.isMinimized(), true, 'minus keeps normal minimized state');
    assert.equal(vm.runInContext('tray === null', context), true, 'minus does not create tray');
    win.restore();
    await delay(300);
    win.close();
    await delay(700);
    assert.equal(win.isDestroyed(), false, 'close keeps window alive');
    assert.equal(win.isVisible(), false, 'close hides to tray');
    assert.equal(vm.runInContext('tray !== null && !tray.isDestroyed()', context), true);
    vm.runInContext('tray.emit("click")', context);
    await delay(700);
    assert.equal(win.isVisible(), true, 'tray click shows window');
    assert.equal(win.isMinimized(), false, 'tray click restores window');
    vm.runInContext('tray.emit("click")', context);
    await delay(300);
    assert.equal(win.isVisible(), false, 'second tray click hides without closing');
    assert.equal(win.isDestroyed(), false);
    vm.runInContext('tray.emit("click")', context);
    await delay(300);
    assert.equal(win.isVisible(), true);
    // Exercise the release floating-window lifecycle with a local fixture page.
    const floatingConfig = {};
    context.getAppConfig = async () => floatingConfig;
    context.patchAppConfig = async value => Object.assign(floatingConfig, value);
    context.path = path;
    context.__dirname = __dirname;
    context.windowStateKeeper = () => ({ manage() {}, saveState() {} });
    context.applyTheme = async () => {};
    context.utils = { is: { dev: false } };
    context.require$$1 = { ...electron, BrowserWindow: class extends electron.BrowserWindow {
      constructor(options) { super({ ...options, webPreferences: { sandbox: true } }); }
      loadFile() { return this.loadURL('data:text/html,<meta charset="utf-8"><body style="margin:0;background:%23245;color:white">悬浮窗测试</body>'); }
    } };
    vm.runInContext(take('let floatingWindow = null;', 'async function showContextMenu()'), context);
    await vm.runInContext('showFloatingWindow()', context);
    await delay(700);
    assert.equal(vm.runInContext('floatingWindow.isVisible()', context), true);
    assert.equal(vm.runInContext('floatingWindow.isAlwaysOnTop()', context), true);
    const previous = vm.runInContext('floatingWindow', context);
    await vm.runInContext('showFloatingWindow()', context);
    assert.equal(vm.runInContext('floatingWindow', context), previous);
    await vm.runInContext('closeFloatingWindow()', context);
    assert.equal(previous.isDestroyed(), true);
    assert.equal(vm.runInContext('floatingWindow === null', context), true);
    await vm.runInContext('showFloatingWindow()', context);
    await delay(500);
    assert.equal(vm.runInContext('floatingWindow.isVisible()', context), true);
    await vm.runInContext('closeFloatingWindow()', context);
    fs.writeFileSync(output, JSON.stringify({ passed: true, checks: ['minus minimizes normally', 'close hides window without destroying it', 'real Windows tray icon created', 'tray click restores native window', 'restored window is not minimized', 'tray toggle keeps window alive', 'floating window opens and stays on top', 'opening twice reuses window', 'floating window closes and can reopen'], limitation: 'Floating-window content uses a local fixture; actual network-speed rendering is not tested.' }, null, 2));
  } catch (e) {
    fs.writeFileSync(output, JSON.stringify({ passed: false, error: String(e), stack: e.stack }, null, 2));
  } finally {
    vm.runInContext('if (tray) tray.destroy()', context);
    if (win && !win.isDestroyed()) win.destroy();
    electron.app.exit();
  }
});
