# Courtside

Live NBA scores, standings, the NBA Cup and playoff brackets, your teams' schedules and players, and league leaders. Data comes from ESPN's public NBA feeds. Unofficial: not affiliated with the NBA or ESPN.

## Windows 下载 · Download for Windows

到 **[Releases](../../releases/latest)** 页面下载：

- `Courtside_…_x64-setup.exe`：安装版（推荐）。装好后会自动提示更新
- `Courtside-portable.exe`：免安装版，双击直接运行

第一次打开时，Windows 可能提示「Windows 已保护你的电脑」。点 **更多信息**，再点 **仍要运行**。Courtside 没有付费签名，新软件都会出现这个提示。

关掉窗口后 Courtside 会留在右下角托盘里：鼠标移到篮球图标上可以看到你球队的实时比分，你的球队开赛和结束时会弹出通知。右键托盘图标可以退出。

## What's in this repo

| Folder | What it is |
|---|---|
| `extension/` | The Chrome / Edge extension. Its popup is also the Windows app's window. |
| `desktop/` | The Windows app (Tauri), which wraps `extension/` with a tray icon, notifications and auto-update. |
| `index.html`, `sw.js`, `manifest.webmanifest`, `icons/` | The original web version. |
| `guide/` | Install guide for the extension. |

## Releasing a new Windows version

1. Bump `version` in `desktop/src-tauri/tauri.conf.json` (and `extension/manifest.json` to match).
2. Push to GitHub.
3. Actions → **Release Windows app** → Run workflow. It builds on Windows and publishes release `v<version>`; installed copies offer the update on their next launch.
