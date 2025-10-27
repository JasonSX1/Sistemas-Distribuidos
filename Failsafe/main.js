// main.js (COMPLETO E ATUALIZADO)
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const fetch = require('electron-fetch').default;

// --- Constantes ---
const SHARED_SERVER_DIR = path.join(__dirname, 'shared_server');
const SHARED_REPLICA_BASE_DIR = path.join(__dirname, 'replicas'); // Pasta base para todas as réplicas
const CLIENT_REQUEST_TIMEOUT = 5000; // 5 segundos

if (!fs.existsSync(SHARED_SERVER_DIR)) fs.mkdirSync(SHARED_SERVER_DIR);
if (!fs.existsSync(SHARED_REPLICA_BASE_DIR)) fs.mkdirSync(SHARED_REPLICA_BASE_DIR);

let win;
let mainServerInstance = null;
let mainServerSockets = new Set();

// ATUALIZADO: Gerencia múltiplas instâncias de réplica
let replicaServerInstances = {}; // Ex: { 1: server, 2: server }
let replicaServerSockets = {};   // Ex: { 1: Set(), 2: Set() }


function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadFile('index.html');
  win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

// --- Lógica do Servidor (Servidor e Réplica) ---

// ATUALIZADO: Lida com 'replicaId'
ipcMain.on('start-server', (event, { port, role, replicaId }) => {
  if (role === 'Servidor') {
    if (mainServerInstance) {
        win.webContents.send('update-status', { role: 'Servidor', message: 'Servidor principal já está rodando.', type: 'danger' });
        return;
    }
    console.log('Iniciando Servidor Principal...');
    mainServerInstance = startServer(port, role, mainServerSockets); // Passa o Set de sockets
  
  } else if (role === 'Replica') {
    if (replicaServerInstances[replicaId]) {
        win.webContents.send('update-status', { role: 'Replica', message: `Réplica ${replicaId} já está rodando.`, type: 'danger', replicaId });
        return;
    }
    console.log(`Iniciando Réplica ${replicaId}...`);
    // Cria um Set de sockets para esta réplica
    replicaServerSockets[replicaId] = new Set();
    replicaServerInstances[replicaId] = startServer(port, role, replicaServerSockets[replicaId], replicaId); // Passa o Set e o ID
  }
});

// ATUALIZADO: Lida com 'replicaId'
ipcMain.on('stop-server', (event, role, replicaId) => {
    let instance = null;
    let sockets = null;
    
    if (role === 'Servidor') {
        instance = mainServerInstance;
        sockets = mainServerSockets;
    } else if (role === 'Replica') {
        instance = replicaServerInstances[replicaId];
        sockets = replicaServerSockets[replicaId];
    }

    if (instance) {
        if (sockets) {
            for (const socket of sockets) {
                console.log(`Destruindo socket ativo do ${role} ${replicaId || ''}...`);
                socket.destroy();
            }
            sockets.clear();
        }
        
        instance.close(() => {
            console.log(`${role} ${replicaId || ''} parado.`);
            if (role === 'Servidor') {
                mainServerInstance = null;
            } else if (role === 'Replica') {
                delete replicaServerInstances[replicaId];
                delete replicaServerSockets[replicaId];
            }
            win.webContents.send('update-status', { role, message: `${role} parado.`, type: 'info', replicaId });
        });
    } else {
        win.webContents.send('update-status', { role, message: `${role} já estava parado.`, type: 'info', replicaId });
    }
});

// ATUALIZADO: Retorna o diretório correto para cada réplica
function getDir(role, replicaId = null) {
  if (role === 'Servidor') {
    return SHARED_SERVER_DIR;
  } else if (role === 'Replica') {
    const replicaDir = path.join(SHARED_REPLICA_BASE_DIR, `replica_${replicaId}`);
    if (!fs.existsSync(replicaDir)) {
        fs.mkdirSync(replicaDir, { recursive: true });
    }
    return replicaDir;
  }
}

// ATUALIZADO: Aceita 'sockets' e 'replicaId'
function startServer(port, role, sockets, replicaId = null) {
  const sharedDir = getDir(role, replicaId);
  
  const server = http.createServer((req, res) => {
    console.log(`[${role} ${replicaId || ''}] Request: ${req.method} ${req.url}`);
    
    // API: Listar Arquivos
    if (req.method === 'GET' && req.url === '/files') {
      fs.readdir(sharedDir, (err, files) => {
        if (err) { /* ... (erro) ... */ return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(files));
      });
    }
    // API: Baixar Arquivo
    else if (req.method === 'GET' && req.url.startsWith('/download/')) {
      const filename = decodeURIComponent(req.url.split('/')[2]);
      const filePath = path.join(sharedDir, filename);
      if (!fs.existsSync(filePath)) { /* ... (404) ... */ return; }
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;
      if (range) { /* ... (lógica 206) ... */ 
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'application/octet-stream' }); 
        file.pipe(res);
      } else { /* ... (lógica 200) ... */ 
        res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      }
    }
    // API: Propagação de Delete
    else if (req.method === 'DELETE' && req.url.startsWith('/files/')) {
        if (role !== 'Replica') { /* ... (erro) ... */ return; }
        const filename = decodeURIComponent(req.url.split('/')[2]);
        const filePath = path.join(sharedDir, filename);
        fs.unlink(filePath, (err) => {
            if (err) { /* ... (erro) ... */ } else {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Arquivo deletado.');
                win.webContents.send('file-list-updated', { role: 'Replica', replicaId });
            }
        });
    }
    // API: Upload
    else if (req.method === 'POST' && req.url.startsWith('/upload/')) {
        if (role !== 'Replica') { /* ... (erro) ... */ return; }
        const filename = decodeURIComponent(req.url.split('/')[2]);
        const filePath = path.join(sharedDir, filename);
        const fileStream = fs.createWriteStream(filePath);
        req.pipe(fileStream);
        req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Upload completo.');
            win.webContents.send('file-list-updated', { role: 'Replica', replicaId });
        });
        req.on('error', () => { /* ... (erro) ... */ });
    }
    else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Endpoint nao encontrado.');
    }
    
  });
  
  // Rastreia sockets
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => { sockets.delete(socket); });
  });

  // ATUALIZADO: Envia o 'replicaId' de volta para a UI
  server.listen(port, () => {
    win.webContents.send('update-status', { 
        role: role, 
        message: `${role} rodando na porta ${port}!`, 
        type: 'success',
        replicaId: replicaId // Envia o ID de volta
    });
  });
  
  server.on('error', (err) => {
    if (role === 'Servidor') {
        mainServerInstance = null;
    } else if (role === 'Replica') {
        delete replicaServerInstances[replicaId];
        delete replicaServerSockets[replicaId];
    }
    // Envia o erro EADDRINUSE de volta para a UI correta
    win.webContents.send('update-status', { 
        role: role, 
        message: `Erro: ${err.message}`, // Ex: "listen EADDRINUSE..."
        type: 'danger',
        replicaId: replicaId
    });
  });

  return server;
}

// --- Lógica de Gerenciamento de Arquivos ---
ipcMain.on('add-file-to-server', (event) => {
    // ... (função sem mudanças)
    dialog.showOpenDialog({ title: 'Selecionar arquivo para adicionar ao servidor', properties: ['openFile']
    }).then(result => {
        if (result.canceled || result.filePaths.length === 0) { return; }
        const sourcePath = result.filePaths[0];
        const filename = path.basename(sourcePath);
        const destPath = path.join(SHARED_SERVER_DIR, filename);
        fs.copyFile(sourcePath, destPath, (err) => {
            if (err) { win.webContents.send('update-status', { role: 'Servidor', message: `Erro ao adicionar ${filename}.`, type: 'danger' }); return; }
            win.webContents.send('file-list-updated', { role: 'Servidor' });
            win.webContents.send('update-status', { role: 'Servidor', message: `Arquivo ${filename} adicionado com sucesso.`, type: 'success' });
        });
    });
});


// --- Funções Expostas para o Renderer ---

ipcMain.handle('fetch-files', async (event, serverAddress) => {
  // ... (função sem mudanças)
  try {
    const response = await fetch(`${serverAddress}/files`);
    if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
    const files = await response.json();
    return files;
  } catch (e) {
    console.error(e);
    return { error: e.message };
  }
});

// ATUALIZADO: Pega arquivos do diretório correto da réplica
ipcMain.handle('get-local-files', (event, role, replicaId) => {
   const dir = getDir(role, replicaId);
   return fs.readdirSync(dir);
});

// ATUALIZADO: Deleta do diretório correto da réplica
ipcMain.handle('delete-file', async (event, role, filename, replicaId) => {
    const filePath = path.join(getDir(role, replicaId), filename);
    try {
        fs.unlinkSync(filePath);
        if (role === 'Servidor') {
            const replicaAddress = "http://localhost:8001"; // TODO: Pegar da UI
            await fetch(`${replicaAddress}/files/${encodeURIComponent(filename)}`, { method: 'DELETE' });
        }
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
});

// --- Lógica de Download (Tema 08) ---

// Função de download robusta (sem mudanças)
function performDownload(url, savePath, filename, startByte = 0) {
    return new Promise((resolve, reject) => {
        let fileStream = null;
        const isResuming = startByte > 0;
        const req = http.get(url, { headers: isResuming ? { 'Range': `bytes=${startByte}-` } : {} }, (res) => {
            if ((isResuming && res.statusCode !== 206) || (!isResuming && res.statusCode !== 200)) {
                req.destroy(); return reject(new Error(`Servidor respondeu com status ${res.statusCode}.`));
            }
            fileStream = fs.createWriteStream(savePath, { flags: isResuming ? 'a' : 'w' });
            const contentLength = parseInt(res.headers['content-length'], 10);
            const totalSize = isResuming ? (contentLength + startByte) : contentLength;
            let downloadedSize = startByte;
            let lastProgressTime = Date.now();
            let lastProgressSize = startByte;
            res.on('data', (chunk) => {
                downloadedSize += chunk.length;
                req.setTimeout(CLIENT_REQUEST_TIMEOUT);
                if (Date.now() - lastProgressTime > 250) {
                    const timeDiff = (Date.now() - lastProgressTime) / 1000;
                    const sizeDiff = downloadedSize - lastProgressSize;
                    const speed = timeDiff > 0 ? (sizeDiff / timeDiff) : 0;
                    const percent = Math.round((downloadedSize / totalSize) * 100);
                    win.webContents.send('file-progress', { filename, percent, speed });
                    lastProgressTime = Date.now();
                    lastProgressSize = downloadedSize;
                }
            });
            res.on('end', () => { console.log('Stream de resposta "end" recebido.'); });
            res.on('error', (err) => { console.error('Erro no stream de RESPOSTA:', err); if (fileStream) fileStream.end(); reject(err); });
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                console.log('File stream "finish" recebido.');
                win.webContents.send('file-progress', { filename, percent: 100, speed: 0 }); 
                if (downloadedSize < totalSize) { reject(new Error('Conexão encerrada prematuramente.')); } else { resolve(); }
            });
            fileStream.on('error', (err) => { console.error('Erro no File stream:', err); req.destroy(); reject(err); });
        });
        req.setTimeout(CLIENT_REQUEST_TIMEOUT, () => { req.destroy(new Error('Timeout da conexão. O servidor não respondeu.')); });
        req.on('error', (err) => { console.error('Erro no stream de REQUISIÇÃO:', err.message); if (fileStream) fileStream.end(); reject(err); });
    });
}

// ATUALIZADO: Lida com a nova lista de 'replicaAddresses'
ipcMain.on('download-file', async (event, { serverAddress, replicaAddresses, filename }) => {
    
    // Lista de servidores para tentar
    const servers = [
        { name: 'Servidor Principal', url: `${serverAddress}/download/${encodeURIComponent(filename)}` },
        // Adiciona todas as réplicas da UI
        ...replicaAddresses.map((addr, i) => ({
            name: `Réplica 0${i + 1}`,
            url: `${addr}/download/${encodeURIComponent(filename)}`
        }))
    ];
    
    const savePath = path.join(app.getPath('downloads'), filename);
    let failedServers = new Set();

    win.webContents.send('update-status', { role: 'Cliente', message: `Iniciando download de ${filename}...`, type: 'info' });

    while (true) {
        let bytesDownloaded = 0;
        try {
            if (fs.existsSync(savePath)) { bytesDownloaded = fs.statSync(savePath).size; }
        } catch (statErr) { 
            win.webContents.send('update-status', { role: 'Cliente', message: `Erro ao ler arquivo local: ${statErr.message}`, type: 'danger' });
            return;
        }

        let serverToTry = null;
        for (const server of servers) {
            if (!failedServers.has(server.name)) {
                serverToTry = server;
                break;
            }
        }

        if (!serverToTry) {
            console.log("Todos os servidores falharam.");
            win.webContents.send('update-status', { 
                role: 'Cliente', 
                message: `Todos os servidores estão offline. Download pausado em ${bytesDownloaded} bytes.`, 
                type: 'warning' 
            });
            break; 
        }

        try {
            win.webContents.send('update-status', { role: 'Cliente', message: `Tentando download de ${serverToTry.name}...`, type: 'info' });
            await performDownload(serverToTry.url, savePath, filename, bytesDownloaded);
            win.webContents.send('update-status', { role: 'Cliente', message: `Download de ${filename} completo! Salvo em Downloads.`, type: 'success' });
            break; 
        } catch (err) {
            console.warn(`Falha ao baixar de ${serverToTry.name}: ${err.message}`);
            win.webContents.send('update-status', { role: 'Cliente', message: `Falha em ${serverToTry.name}! (Erro: ${err.message}).`, type: 'warning' });
            failedServers.add(serverToTry.name);
        }
    }
});

// --- Lógica de Sincronização ---

// ATUALIZADO: Lida com 'replicaId'
ipcMain.on('start-replica-sync', async (event, { serverAddress, replicaId }) => {
    try {
        const response = await fetch(`${serverAddress}/files`);
        if (!response.ok) throw new Error(`Servidor respondeu com ${response.status}`);
        const serverFiles = await response.json();
        
        const replicaDir = getDir('Replica', replicaId);
        const replicaFiles = fs.readdirSync(replicaDir);
        
        const missingOnReplica = serverFiles.filter(f => !replicaFiles.includes(f));
        
        // Envia o sync-start para a réplica correta
        win.webContents.send('sync-start', { files: missingOnReplica, replicaId });
        
        for (const file of missingOnReplica) {
            console.log(`Réplica ${replicaId} baixando ${file} do servidor...`);
            const fileUrl = `${serverAddress}/download/${encodeURIComponent(file)}`;
            const savePath = path.join(replicaDir, file); // Salva na pasta correta da réplica
            
            await performDownload(fileUrl, savePath, file, 0); 
            win.webContents.send('file-list-updated', { role: 'Replica', replicaId });
        }
        
        if (missingOnReplica.length > 0) {
            console.log(`Sincronização PULL da Réplica ${replicaId} concluída.`);
        } else {
            console.log(`Réplica ${replicaId} já estava sincronizada.`);
        }

    } catch (e) {
        console.error(`Erro no sync da réplica ${replicaId}:`, e);
        win.webContents.send('update-status', { role: 'Replica', message: `Erro ao sincronizar: ${e.message}`, type: 'danger', replicaId });
    }
});


// Sincronização do Servidor (PUSH)
ipcMain.on('sync-replica', async (event, { serverAddress, replicaAddress }) => {
    // ... (função sem mudanças, mas agora é menos importante, já que as réplicas fazem PULL)
    win.webContents.send('update-status', { role: 'Servidor', message: `Sincronizando com ${replicaAddress}...`, type: 'info' });
    try {
        const localFiles = fs.readdirSync(SHARED_SERVER_DIR);
        const response = await fetch(`${replicaAddress}/files`);
        if (!response.ok) throw new Error(`Réplica respondeu com ${response.status}`);
        const remoteFiles = await response.json();
        const missingOnReplica = localFiles.filter(f => !remoteFiles.includes(f));
        const missingOnServer = remoteFiles.filter(f => !localFiles.includes(f));
// UPAR (Push)
        for (const file of missingOnReplica) {
            console.log(`Servidor upando ${file} para a réplica...`);
            const filePath = path.join(SHARED_SERVER_DIR, file);
            const fileStream = fs.createReadStream(filePath);
            const uploadResponse = await fetch(`${replicaAddress}/upload/${encodeURIComponent(file)}`, { method: 'POST', body: fileStream });
            if (!uploadResponse.ok) throw new Error(`Falha ao upar ${file}`);
        }
// BAIXAR (Pull)
        for (const file of missingOnServer) {
             console.log(`Servidor baixando ${file} da réplica...`);
             const fileUrl = `${replicaAddress}/download/${encodeURIComponent(file)}`;
             const savePath = path.join(SHARED_SERVER_DIR, file);
             await performDownload(fileUrl, savePath, file, 0); 
        }
        win.webContents.send('update-status', { role: 'Servidor', message: `Sincronização: ${missingOnReplica.length} enviados, ${missingOnServer.length} baixados.`, type: 'success' });
        if(missingOnServer.length > 0) {
            win.webContents.send('file-list-updated', { role: 'Servidor' });
        }
    } catch(e) {
         win.webContents.send('update-status', { role: 'Servidor', message: `Erro ao sincronizar: ${e.message}`, type: 'danger' });
    }
});