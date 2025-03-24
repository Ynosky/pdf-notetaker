const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,  // セキュリティ上注意が必要です
      contextIsolation: false // 必要に応じて設定を変更してください
    }
  });

  win.loadFile('index.html');
  // 必要に応じて、デバッグ用に以下を有効化
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// PDF保存機能の IPC イベントハンドラー（async/await で実装）
ipcMain.on('save-pdf', async (event) => {
  try {
    // 現在のアクティブウィンドウを取得
    let win = BrowserWindow.getFocusedWindow();
    if (!win) {
      const wins = BrowserWindow.getAllWindows();
      if (wins.length > 0) {
        win = wins[0];
      } else {
        event.sender.send('save-pdf-response', { success: false, error: 'No active window available.' });
        return;
      }
    }

    // PDF生成用オプション
    const pdfOptions = {
      marginsType: 1,
      pageSize: 'A4',
      printBackground: true,
      printSelectionOnly: false,
      landscape: false
    };

    // 現在のウィンドウ内容を PDF データとして生成
    const pdfData = await win.webContents.printToPDF(pdfOptions);
    console.log('PDF data generated.');

    // 保存ダイアログを表示して保存先を選択
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'PDFとして保存',
      defaultPath: 'document.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (canceled) {
      console.log('User canceled the save dialog.');
      event.sender.send('save-pdf-response', { success: false, error: 'Save canceled' });
      return;
    }

    if (!filePath) {
      console.log('No file path returned from save dialog.');
      event.sender.send('save-pdf-response', { success: false, error: 'No file path provided' });
      return;
    }

    // 選択したパスに PDF データを書き込む
    fs.writeFile(filePath, pdfData, (err) => {
      if (err) {
        console.error('Error saving PDF:', err);
        event.sender.send('save-pdf-response', { success: false, error: err.message });
      } else {
        console.log('PDF successfully saved to', filePath);
        event.sender.send('   ', { success: true });
      }
    });
  } catch (error) {
    console.error('Error in save-pdf handler:', error);
    event.sender.send('save-pdf-response', { success: false, error: error.message });
  }
});

ipcMain.on('save-doc-pdf', async (event, docHtml) => {
  try {
    // 非表示ウィンドウを作成（ドキュメント専用）
    const docWindow = new BrowserWindow({
      show: false,
      webPreferences: { 
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    // ドキュメントのHTMLを data URL として読み込む
    await docWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(docHtml));

    // PDF生成用オプション（必要に応じて調整）
    const pdfOptions = {
      marginsType: 1,
      pageSize: 'A4',
      printBackground: true,
      printSelectionOnly: false,
      landscape: false
    };

    // 非表示ウィンドウから PDF を生成
    const pdfData = await docWindow.webContents.printToPDF(pdfOptions);
    docWindow.close();

    // 保存ダイアログの表示
    const { canceled, filePath } = await dialog.showSaveDialog(null, {
      title: 'ドキュメントPDFとして保存',
      defaultPath: 'document.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) {
      event.sender.send('save-doc-pdf-response', { success: false, error: 'Save canceled or no file path provided' });
      return;
    }

    fs.writeFile(filePath, pdfData, (err) => {
      if (err) {
        console.error('Error saving document PDF:', err);
        event.sender.send('save-doc-pdf-response', { success: false, error: err.message });
      } else {
        console.log('Document PDF successfully saved to', filePath);
        event.sender.send('save-doc-pdf-response', { success: true });
      }
    });
  } catch (error) {
    console.error('Error in save-doc-pdf handler:', error);
    event.sender.send('save-doc-pdf-response', { success: false, error: error.message });
  }
});