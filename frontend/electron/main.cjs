// Electron 主进程：只做三件事——开一个窗口、加载 dist、把窗口标题固定。
// 注意：页面里没有任何数据库/网络访问权限，桌面壳不改变"前端只调 HTTP 接口"的分工。
const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

const isDev = process.env.VITE_DEV_SERVER_URL

// 部分 Windows 机器上 GPU 初始化会直接让进程退出，关掉硬件加速最稳
app.disableHardwareAcceleration()

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#F5F7FA',
    title: '绿色出行 · 碳积分',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.setMenuBarVisibility(false)

  // 外部链接一律丢给系统浏览器，不在应用内开新窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL(isDev)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist-app', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
