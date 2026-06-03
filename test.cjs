const { app, BrowserWindow } = require("electron");
app.whenReady().then(() => {
  const win = new BrowserWindow();
  win.loadFile("studio-dist/index.html");
  win.webContents.on("did-finish-load", () => {
    setTimeout(async () => {
      const html = await win.webContents.executeJavaScript('document.body.innerHTML');
      console.log("BODY HTML:", html);
    }, 3000);
  });
  setTimeout(() => app.quit(), 5000);
});
