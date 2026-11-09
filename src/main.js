const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

// የትምህርት መጽሐፍት ማዕከል (Offline RAG Knowledge Base)
const knowledgeBase = require('./knowledge.json');

let mainWindow;
let llamaProcess = null;

// የሞዴሉ እና የllama-server ፋይሎች የሚቀመጡበት መንገድ (App Data Storage)
const userDataPath = app.getPath('userData');
const modelsDir = path.join(userDataPath, 'models');
const modelFilePath = path.join(modelsDir, 'gemma-2-2b-it-q4_k_m.gguf');

// የ Hugging Face የሞዴል ማውረጃ Direct Link
const MODEL_DOWNLOAD_URL = 'https://huggingface.co/unsloth/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 1. የሞዴሉን መኖር መፈተሽ
ipcMain.handle('check-model-status', () => {
  if (fs.existsSync(modelFilePath)) {
    // ሞዴሉ ካለ የ llama-server ጀምር
    startLlamaServer();
    return { exists: true, status: 'ready' };
  }
  return { exists: false, status: 'missing' };
});

// 2. ከ Hugging Face ሞዴሉን ማውረድ (ተማሪው በ UI ላይ button ሲነካ ይነሳል)
ipcMain.on('start-model-download', (event) => {
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const file = fs.createWriteStream(modelFilePath);
  
  // Redirect ከነበረ በደንብ እንዲያወርድ የሚረዳ ተግባር
  const downloadFile = (url) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location);
      }

      if (response.statusCode !== 200) {
        mainWindow.webContents.send('status-update', { type: 'error', message: 'ዳውንሎድ አልተሳካም (HTTP Error)' });
        return;
      }

      const totalBytes = parseInt(response.headers['content-length'], 10);
      let downloadedBytes = 0;

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const progress = Math.round((downloadedBytes / totalBytes) * 100);
        mainWindow.webContents.send('download-progress', progress);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          mainWindow.webContents.send('status-update', { type: 'success', message: 'ሞዴሉ ተወርዶ ተጠናቋል!' });
          startLlamaServer();
        });
      });
    }).on('error', (err) => {
      fs.unlink(modelFilePath, () => {});
      mainWindow.webContents.send('status-update', { type: 'error', message: `ስህተት ተፈጠረ: ${err.message}` });
    });
  };

  downloadFile(MODEL_DOWNLOAD_URL);
});

// 3. llama-server.exe ን በጀርባ (Background Process) ማስነሳት
function startLlamaServer() {
  if (llamaProcess) return;

  // የ llama-server.exe የሚገኝበት መንገድ (Production vs Development)
  const serverExecutable = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'llama-server.exe')
    : path.join(__dirname, '..', 'bin', 'llama-server.exe');

  const args = [
    '-m', modelFilePath,
    '--port', '8080',
    '--ctx-size', '2048', // ለደካማ RAM የተገደበ Context Size
    '--threads', '3'      // ላፕቶፑ እንዳይጨናነቅ 3 CPU Thread ብቻ
  ];

  llamaProcess = spawn(serverExecutable, args);

  llamaProcess.stdout.on('data', (data) => {
    console.log(`[llama.cpp]: ${data}`);
  });

  llamaProcess.stderr.on('data', (data) => {
    console.error(`[llama.cpp log]: ${data}`);
  });

  llamaProcess.on('close', (code) => {
    console.log(`llama-server exited with code ${code}`);
    llamaProcess = null;
  });
}

// 4. ተማሪው ጥያቄ ሲልክ RAG (Knowledge Base) ተጠቅሞ ወደ llama-server መላክ
ipcMain.handle('send-chat-message', async (event, userPrompt) => {
  try {
    // ከ Knowledge Base ውስጥ ከጥያቄው ጋር የሚዛመደውን ጽሁፍ መፈለግ
    let matchedContext = "";
    const lowerPrompt = userPrompt.toLowerCase();
    
    for (const item of knowledgeBase) {
      if (lowerPrompt.includes(item.topic) || lowerPrompt.includes(item.subject) || lowerPrompt.includes(item.grade)) {
        matchedContext += `[ከመማሪያ መጽሐፍ የተወሰደ]: ${item.content}\n`;
      }
    }

    // ለ AI ሞዴል የሚላከው Prompt (ማብራሪያ እና የትምህርት መጽሐፍ ጽሁፍ)
    const systemPrompt = `System: አንተ "Ethio Edu AI" የኢትዮጵያ 9-12ኛ ክፍል ተማሪዎች የትምህርት አማካሪ ነህ። ከተሰጠው የመማሪያ መጽሐፍ መረጃ በመነሳት ለተማሪው በአማርኛ እና በ LaTeX ቀመር ($...$) ደረጃ በደረጃ አብራራ።\n\n${matchedContext}\nUser: ${userPrompt}\nAssistant:`;

    const response = await fetch('http://127.0.0.1:8080/completion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: systemPrompt,
        n_predict: 512,
        temperature: 0.7
      })
    });

    const data = await response.json();
    return { success: true, text: data.content };
  } catch (error) {
    return { success: false, error: 'ከ AI ሞዴሉ ጋር መገናኘት አልተቻለም። ሰርቨሩ እየሰራ መሆኑን ያረጋግጡ።' };
  }
});

// አፕሊኬሽኑ ሲዘጋ llama-server.exe ቆሞ RAM እንዲለቅ ማድረግ
app.on('will-quit', () => {
  if (llamaProcess) {
    llamaProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
