# 青山自用修改版

基于青山 Windows 4.10.2 release 的窗口行为补丁。此仓库维护修改脚本和补丁，并通过 Releases 提供可解压运行的完整程序。它不是完整上游源码工程，也不是官方发布渠道。

## 修改内容

- 增加“关闭到托盘”：开启后点“×”隐藏到托盘，点“－”始终正常最小化。托盘菜单的“退出”正常退出程序；关闭开关后点“×”正常退出。
- 增加“显示悬浮窗”：复用原程序置顶悬浮窗，可开启、关闭并保存状态，下次启动继续生效。
- 两个开关均位于登录页左下角，以及登录后左侧栏的联系邮箱上方；点击托盘图标可恢复或隐藏主窗口。

## 使用

从 Releases 下载 `QingShan-4.10.2-custom-windows-x64.zip`，解压后运行 `QingShan/青山.exe`。须保留整个程序目录，不能只复制 EXE。此包继续使用原程序的数据目录；新电脑上仍需本人登录，包内不带账户、订阅或节点凭据。

这是本地补丁，原程序自动更新可能覆盖修改。账户权限、订阅接口和网络协议按原程序行为运行。之前尝试的通用节点导出不属于本仓库功能，也未验证能在小火箭中连接。

## 补丁复现

需要 Python 3，以及与 `verification/build-manifest.json` 中原始 SHA256 一致的 4.10.2 `app.asar`。在仓库根目录放入原版 `QingShan/` 完整目录后运行：

```powershell
python tools/patch_release.py
node tools/verify_tray.cjs
node --check inspection/patched/out/main/index.js
```

补丁脚本将原文件备份到 `backups/app.original.asar`，输出到 `inspection/app.patched.asar`；脚本不会自动安装。退出青山后，将输出文件复制到 `QingShan/resources/app.asar` 即可。重复生成时始终以原始备份为基础，避免叠加补丁。若原始文件不匹配，脚本会拒绝处理。

## 验证及限制

已完成主进程和渲染进程 JavaScript 语法检查、开关状态与配置逻辑检查，以及隔离 Windows Electron 环境中的托盘最小化、关闭隐藏、恢复、悬浮窗创建、置顶、关闭和重新打开检查。归档对比确认仅两个 JavaScript 条目发生变化，其余归档条目保留。

悬浮窗生命周期测试使用本地占位页面，实际网速内容与登录后界面的人工视觉检查未覆盖；没有把手机导入或代理节点连通性作为本补丁的验证结果。验证记录见 `verification/`。

## 原项目与许可证

程序包标识为 QingShan，版本 4.10.2，主页元数据为 <https://mihomo.party>；原包更新配置指向 <https://github.com/tutu-a11y/ape-party>。此处链接来自原包元数据，并不表示本修改版由上游维护或认可。原包内 LICENSE 已原样保留，Electron、Chromium 及依赖许可证随完整程序保留，参见 `LICENSE` 与 `UPSTREAM_NOTICE.md`。
