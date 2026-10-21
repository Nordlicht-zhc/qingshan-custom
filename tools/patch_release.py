import copy
import hashlib
import json
import pathlib
import shutil
import struct

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASAR = ROOT / 'QingShan/resources/app.asar'
BACKUP = ROOT / 'backups/app.original.asar'


def entry(header, name):
    node = header
    for part in name.split('/'):
        node = node['files'][part]
    return node


def replace_once(text, old, new):
    assert text.count(old) == 1, (old[:100], text.count(old))
    return text.replace(old, new, 1)


def patch_main(s):
    s = replace_once(s, 'async function patchAppConfig(patch) {', '''async function patchAppConfig(patch) {
  if (patch.minimizeToTray === true) patch.disableTray = false;
  else if (patch.disableTray === true) patch.minimizeToTray = false;''')
    s = replace_once(s, '  if (!disableTray) {\n    await createTray();', '  if (!disableTray || (await getAppConfig()).minimizeToTray === true) {\n    await createTray();')
    s = replace_once(s, '    createFloatingWindow();\n  }\n}\nasync function triggerFloatingWindow()', '    await createFloatingWindow();\n  }\n}\nasync function triggerFloatingWindow()')
    s = replace_once(s, '  exports.mainWindow.on("close", async (event) => {\n    event.preventDefault();', '''  exports.mainWindow.on("close", async (event) => {
    event.preventDefault();
    const window = exports.mainWindow;
    try {
      // Retain the previous config key to preserve the saved switch value.
      if ((await getAppConfig()).minimizeToTray === true) {
        await showTrayIcon();
        if (!tray || tray.isDestroyed()) throw new Error("Tray icon unavailable");
        if (window && !window.isDestroyed()) window.hide();
        return;
      }
    } catch (error) {
      console.error("[Tray] Failed to close to tray:", error);
      return;
    }''')
    s = replace_once(s, '    exports.mainWindow.show();\n    exports.mainWindow.focusOnWebView();', '''    if (exports.mainWindow.isMinimized()) exports.mainWindow.restore();
    exports.mainWindow.show();
    exports.mainWindow.focus();
    exports.mainWindow.focusOnWebView();''')
    s = replace_once(s, '''  if (exports.mainWindow?.isVisible()) {
    closeMainWindow();
  } else {
    showMainWindow();
  }
}''', '''  if (exports.mainWindow?.isVisible() && !exports.mainWindow.isMinimized()) {
    exports.mainWindow.hide();
  } else {
    showMainWindow();
  }
}''')
    return s


def patch_renderer(s):
    component = '''const TrayMinimizeOption = () => {
  const { appConfig, patchAppConfig } = useAppConfig();
  const [busy, setBusy] = reactExports.useState(false);
  return jsxRuntimeExports.jsx(switch_default, {
    size: "sm",
    isSelected: appConfig?.minimizeToTray === true,
    isDisabled: busy || !appConfig,
    "aria-label": "关闭到托盘",
    onValueChange: async (enabled) => {
      setBusy(true);
      try {
        if (enabled) await showTrayIcon();
        await patchAppConfig(enabled ? { minimizeToTray: true, disableTray: false } : { minimizeToTray: false });
      } catch (error) {
        window.alert("托盘设置保存失败，请重试。" + String(error));
      } finally { setBusy(false); }
    },
    children: "关闭到托盘"
  });
};
const FloatingWindowOption = () => {
  const { appConfig, patchAppConfig } = useAppConfig();
  const [busy, setBusy] = reactExports.useState(false);
  return jsxRuntimeExports.jsx(switch_default, {
    size: "sm",
    isSelected: appConfig?.showFloatingWindow === true,
    isDisabled: busy || !appConfig,
    "aria-label": "显示悬浮窗",
    onValueChange: async (enabled) => {
      setBusy(true);
      try {
        if (enabled) await showFloatingWindow();
        else await closeFloatingWindow();
        await patchAppConfig({ showFloatingWindow: enabled });
      } catch (error) {
        window.alert("悬浮窗设置保存失败，请重试。" + String(error));
      } finally { setBusy(false); }
    },
    children: "显示悬浮窗"
  });
};
const LocalWindowOptions = () => jsxRuntimeExports.jsxs("div", {
  style: { display: "flex", flexDirection: "column", gap: "10px" },
  children: [
    jsxRuntimeExports.jsx("div", { title: "开启后，点击关闭按钮会隐藏到托盘；最小化按钮仍然正常最小化。退出程序请使用托盘菜单。", children: jsxRuntimeExports.jsx(TrayMinimizeOption, {}) }),
    jsxRuntimeExports.jsx("div", { title: "显示或关闭程序自带的置顶悬浮窗，下次启动继续生效。", children: jsxRuntimeExports.jsx(FloatingWindowOption, {}) })
  ]
});
'''
    s = replace_once(s, 'const App = () => {', component + 'const App = () => {')
    anchor = '            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-4" }),\n            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[12px] text-gray-400 text-center", children: ['
    s = replace_once(s, anchor, '''            jsxRuntimeExports.jsx("div", { style: { padding: "12px 16px", fontSize: "13px" }, title: "开启后，点击关闭按钮会隐藏到托盘；最小化按钮仍然正常最小化。退出程序请使用托盘菜单。", children: jsxRuntimeExports.jsx(LocalWindowOptions, {}) }),
''' + anchor)
    # The release has no settings entry on its login screen, so expose the same option there.
    anchor = 'const App = () => {'
    start = s.index(anchor)
    prefix, body = s[:start], s[start:]
    body = replace_once(body, '  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [', '''  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    userInfo?.token === undefined && jsxRuntimeExports.jsx("div", { style: { position: "fixed", left: "16px", bottom: "16px", zIndex: 101, padding: "8px 12px", borderRadius: "8px", background: "white", color: "#222", fontSize: "13px" }, title: "开启后，点击关闭按钮会隐藏到托盘；最小化按钮仍然正常最小化。退出程序请使用托盘菜单。", children: jsxRuntimeExports.jsx(LocalWindowOptions, {}) }),''')
    return prefix + body


def main():
    BACKUP.parent.mkdir(exist_ok=True)
    if not BACKUP.exists():
        shutil.copy2(ASAR, BACKUP)
    original = BACKUP.read_bytes()
    if hashlib.sha256(original).hexdigest() != "8e2f3afdfdae5738f32465536f2d89323bdef4d11114f6aba71aa2f01095b8d0":
        raise RuntimeError("Original app.asar does not match the supported base release")
    _, header_size, _, json_size = struct.unpack('<4I', original[:16])
    header = json.loads(original[16:16+json_size])
    base = 8 + header_size
    updates = {}
    for name, patch in [('out/main/index.js', patch_main), ('out/renderer/assets/index-B3u5x8yF.js', patch_renderer)]:
        e = entry(header, name)
        updated = patch(original[base+int(e['offset']):base+int(e['offset'])+e['size']].decode('utf-8')).encode('utf-8')
        updates[name] = updated
        target = ROOT / 'inspection/patched' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(updated)
    new_header = copy.deepcopy(header)
    chunks = []
    offset = 0

    def walk(node, prefix=''):
        nonlocal offset
        for key, value in node['files'].items():
            name = prefix + key
            if 'files' in value:
                walk(value, name + '/')
            elif not value.get('unpacked') and 'offset' in value:
                old = entry(header, name)
                content = updates.get(name, original[base+int(old['offset']):base+int(old['offset'])+old['size']])
                value['offset'] = str(offset)
                value['size'] = len(content)
                if name in updates and 'integrity' in value:
                    block_size = value['integrity'].get('blockSize', 4194304)
                    value['integrity'] = {'algorithm': 'SHA256', 'hash': hashlib.sha256(content).hexdigest(), 'blockSize': block_size, 'blocks': [hashlib.sha256(content[i:i+block_size]).hexdigest() for i in range(0, len(content), block_size)]}
                chunks.append(content)
                offset += len(content)
    walk(new_header)
    encoded = json.dumps(new_header, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    padding = b'\0' * ((-len(encoded)) % 4)
    pickle_size = 8 + len(encoded) + len(padding)
    result = struct.pack('<4I', 4, pickle_size, pickle_size-4, len(encoded)) + encoded + padding + b''.join(chunks)
    output = ROOT / 'inspection/app.patched.asar'
    output.write_bytes(result)
    print(json.dumps({'original_sha256': hashlib.sha256(original).hexdigest(), 'patched_sha256': hashlib.sha256(result).hexdigest(), 'changed_files': list(updates)}, indent=2))


if __name__ == '__main__':
    main()
