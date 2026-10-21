const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync(__dirname + '/../inspection/patched/out/main/index.js', 'utf8');
function extract(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
const close = extract('  exports.mainWindow.on("close",', '  exports.mainWindow.on("resized",');
assert.equal(source.includes('exports.mainWindow.on("minimize",'), false);
const restore = extract('function showMainWindow()', 'function closeMainWindow()');
const toggle = extract('function triggerMainWindow()', 'function showMainWindow()');
const patch = extract('async function patchAppConfig(patch)', 'let runtimeConfigStr;');
async function test() {
  let handler, hidden = 0, restored = 0, shown = 0, saved, exits = 0, stopped = 0;
  let config = { minimizeToTray: false, sysProxy: { enable: true }, other: 'retained' };
  let minimized = true, trayError = false, trayAlive = true;
  const window = { on: (_, fn) => handler = fn, isMinimized: () => minimized,
    isDestroyed: () => false, hide: () => hidden++, isVisible: () => true,
    restore: () => { minimized = false; restored++; }, show: () => shown++, focus() {}, focusOnWebView() {} };
  const context = vm.createContext({ exports: { mainWindow: window },
    getAppConfig: async () => config, tray: { isDestroyed: () => !trayAlive },
    showTrayIcon: async () => { if (trayError) throw Error('unavailable'); },
    console: { error() {} }, quitTimeout: null, clearTimeout,
    require$$1: { app: { exit: () => exits++ } }, triggerSysProxy: () => stopped++, stopCore: async () => {}, patchControledMihomoConfig: async () => {},
    appConfig: config, deepMerge: (a,b) => ({ ...a, ...b }),
    promises: { writeFile: async (_, value) => saved = value },
    appConfigPath: () => 'config.yaml', yaml: { stringify: JSON.stringify } });
  vm.runInContext(close + restore + toggle + patch, context);
  const event = { preventDefault() {} };
  await handler(event); assert.equal(hidden, 0); assert.equal(exits, 1); assert.equal(stopped, 1);
  exits = 0; stopped = 0;
  context.appConfig = config;
  config.minimizeToTray = true;
  await handler(event); assert.equal(hidden, 1); assert.equal(exits, 0); assert.equal(stopped, 0);
  vm.runInContext('showMainWindow()', context);
  assert.equal(restored, 1); assert.equal(shown, 1);
  minimized = true; trayError = true;
  await handler(event); assert.equal(hidden, 1); assert.equal(exits, 0);
  trayError = false; trayAlive = false;
  await handler(event); assert.equal(hidden, 1); assert.equal(exits, 0);
  await vm.runInContext('patchAppConfig({minimizeToTray:true})', context);
  assert.equal(JSON.parse(saved).disableTray, false);
  assert.equal(JSON.parse(saved).sysProxy.enable, true);
  assert.equal(JSON.parse(saved).other, 'retained');
  await vm.runInContext('patchAppConfig({disableTray:true})', context);
  assert.equal(JSON.parse(saved).minimizeToTray, false);
  vm.runInContext('triggerMainWindow()', context);
  assert.equal(restored, 2);
  const renderer = fs.readFileSync(__dirname + '/../inspection/patched/out/renderer/assets/index-B3u5x8yF.js', 'utf8');
  const component = renderer.slice(renderer.indexOf('const TrayMinimizeOption ='), renderer.indexOf('const App = () =>'));
  let props, patchValue, iconCalls = 0;
  const ui = vm.createContext({
    useAppConfig: () => ({ appConfig: { minimizeToTray: true }, patchAppConfig: async v => patchValue = v }),
    reactExports: { useState: () => [false, () => {}] },
    jsxRuntimeExports: { jsx: (_, p) => props = p }, switch_default: 'switch',
    showTrayIcon: async () => iconCalls++, window: { alert: e => { throw Error(e); } }
  });
  vm.runInContext(component + '\nTrayMinimizeOption();', ui);
  assert.equal(props.isSelected, true);
  assert.equal(props.children, '关闭到托盘');
  await props.onValueChange(true);
  assert.equal(iconCalls, 1); assert.equal(patchValue.disableTray, false);
  assert.equal(patchValue.minimizeToTray, true);
  await props.onValueChange(false); assert.equal(patchValue.minimizeToTray, false);
  let opened = 0, closed = 0;
  ui.showFloatingWindow = async () => opened++;
  ui.closeFloatingWindow = async () => closed++;
  vm.runInContext('FloatingWindowOption();', ui);
  assert.equal(props.children, '显示悬浮窗');
  assert.equal(props.isSelected, false);
  await props.onValueChange(true);
  assert.equal(opened, 1); assert.equal(patchValue.showFloatingWindow, true);
  await props.onValueChange(false);
  assert.equal(closed, 1); assert.equal(patchValue.showFloatingWindow, false);
  ui.useAppConfig = () => ({ appConfig: { showFloatingWindow: true } });
  vm.runInContext('FloatingWindowOption();', ui);
  assert.equal(props.isSelected, true);
  ui.useAppConfig = () => ({ appConfig: undefined });
  vm.runInContext('FloatingWindowOption();', ui);
  assert.equal(props.isDisabled, true);
  console.log('PASS: disabled close exits, enabled close hides without stopping proxy, normal minimize, restore, tray failures, config persistence, config preservation, conflicting settings, minimized tray click.');
  console.log('PASS: renderer switch initial value, Chinese label, enable/disable actions, and tray creation.');
  console.log('PASS: floating-window switch enable/disable actions, saved state and disabled loading state.');
}
test().catch(e => { console.error(e); process.exitCode = 1; });
