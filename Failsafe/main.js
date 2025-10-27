// main.js (COMPLETO E ATUALIZADO)
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os'); // NOVO: Para descobrir o IP local

const fetch = require('electron-fetch').default;

// --- Constantes ---
const SHARED_SERVER_DIR = path.join(__dirname, 'shared_server');
const SHARED_REPLICA_BASE_DIR = path.join(__dirname, 'replicas');
const CLIENT_REQUEST_TIMEOUT = 5000; 

if (!fs.existsSync(SHARED_SERVER_DIR)) fs.mkdirSync(SHARED_SERVER_DIR);
if (!fs.existsSync(SHARED_REPLICA_BASE_DIR)) fs.mkdirSync(SHARED_REPLICA_BASE_DIR);

let win;
let mainServerInstance = null;
let mainServerSockets = new Set();
let replicaServerInstances = {}; 
let replicaServerSockets = {};

// NOVO: Registro de Réplicas Ativas (só o Servidor Principal usa)
let activeReplicas = new Set();

// NOVO: Função para encontrar o IP da rede local
function findLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Pula endereços não-IPv4 e internos (ex: 127.0.0.1)
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost'; // Fallback
}


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

ipcMain.on('start-server', async (event, { port, role, replicaId, serverAddress }) => {
  if (role === 'Servidor') {
    if (mainServerInstance) {
        win.webContents.send('update-status', { role: 'Servidor', message: 'Servidor principal já está rodando.', type: 'danger' });
        return;
    }
    console.log('Iniciando Servidor Principal...');
    mainServerInstance = startServer(port, role, mainServerSockets); 
  
  } else if (role === 'Replica') {
    if (replicaServerInstances[replicaId]) {
        win.webContents.send('update-status', { role: 'Replica', message: `Réplica ${replicaId} já está rodando.`, type: 'danger', replicaId });
        return;
    }
    console.log(`Iniciando Réplica ${replicaId}...`);
    replicaServerSockets[replicaId] = new Set();
    const replicaInstance = startServer(port, role, replicaServerSockets[replicaId], replicaId);
    
    // NOVO: Registro automático
    if (replicaInstance) {
        replicaServerInstances[replicaId] = replicaInstance;
        // Tenta se registrar com o servidor principal
        try {
            const localIp = findLocalIp();
            const myAddress = `http://${localIp}:${port}`;
            await fetch(`${serverAddress}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: myAddress })
            });
            console.log(`Réplica ${replicaId} (${myAddress}) registrada em ${serverAddress}`);
        } catch (err) {
            console.error(`Réplica ${replicaId} falhou ao registrar: ${err.message}`);
            // Envia um erro, mas a réplica continua rodando
            win.webContents.send('update-status', { role: 'Replica', message: `Rodando, mas falhou ao registrar: ${err.message}`, type: 'warning', replicaId });
        }
    }
  }
});

// ATUALIZADO: Lida com 'replicaId' e desregistro
ipcMain.on('stop-server', async (event, role, replicaId, serverAddress) => {
    let instance = null;
    let sockets = null;
    let port = null;
    
    if (role === 'Servidor') {
        instance = mainServerInstance;
        sockets = mainServerSockets;
    } else if (role === 'Replica') {
        instance = replicaServerInstances[replicaId];
        sockets = replicaServerSockets[replicaId];
        if (instance) {
            port = instance.address().port; // Pega a porta antes de fechar
        }
    }

    if (instance) {
        // NOVO: Tenta se desregistrar do servidor principal
        if (role === 'Replica') {
            try {
                const localIp = findLocalIp();
                const myAddress = `http://${localIp}:${port}`;
                await fetch(`${serverAddress}/unregister`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: myAddress })
                });
                console.log(`Réplica ${replicaId} (${myAddress}) desregistrada.`);
            } catch (err) {
                console.error(`Réplica ${replicaId} falhou ao desregistrar: ${err.message}`);
            }
        }

        if (sockets) {
            for (const socket of sockets) {
                socket.destroy();
            }
            sockets.clear();
        }
        
        instance.close(() => {
            console.log(`${role} ${replicaId || ''} parado.`);
            if (role === 'Servidor') {
                mainServerInstance = null;
                activeReplicas.clear(); // Limpa o registro de réplicas
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

function startServer(port, role, sockets, replicaId = null) {
  const sharedDir = getDir(role, replicaId);
  
  const server = http.createServer((req, res) => {
    console.log(`[${role} ${replicaId || ''}] Request: ${req.method} ${req.url}`);

    // --- NOVO: Endpoints de Registro (Só para Servidor Principal) ---
    if (role === 'Servidor') {
        if (req.method === 'POST' && req.url === '/register') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                const { address } = JSON.parse(body);
                activeReplicas.add(address);
                console.log('REPLICA REGISTRADA:', address);
                console.log('LISTA ATUAL:', ...activeReplicas);
                res.writeHead(200).end();
            });
            return;
        }
        
        if (req.method === 'POST' && req.url === '/unregister') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                const { address } = JSON.parse(body);
                activeReplicas.delete(address);
                console.log('REPLICA DESREGISTRADA:', address);
                console.log('LISTA ATUAL:', ...activeReplicas);
                res.writeHead(200).end();
            });
            return;
        }

        if (req.method === 'GET' && req.url === '/replicas') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(Array.from(activeReplicas)));
            return;
        }
    }
    // --- Fim dos Endpoints de Registro ---

    
    // API: Listar Arquivos
    if (req.method === 'GET' && req.url === '/files') {
      fs.readdir(sharedDir, (err, files) => {
        if (err) { /* ... (erro) ... */ res.writeHead(500).end(); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(files));
      });
    }
    // API: Baixar Arquivo
    else if (req.method === 'GET' && req.url.startsWith('/download/')) {
      const filename = decodeURIComponent(req.url.split('/')[2]);
      const filePath = path.join(sharedDir, filename);
      if (!fs.existsSync(filePath)) { res.writeHead(404).end(); return; }
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;
      if (range) { 
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'application/octet-stream' }); 
        file.pipe(res);
      } else { 
        res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      }
    }
    // API: Propagação de Delete
    else if (req.method === 'DELETE' && req.url.startsWith('/files/')) {
        if (role !== 'Replica') { res.writeHead(403).end(); return; }
        const filename = decodeURIComponent(req.url.split('/')[2]);
        const filePath = path.join(sharedDir, filename);
        fs.unlink(filePath, (err) => {
            if (err) { res.writeHead(500).end(); } else {
                res.writeHead(200).end('Arquivo deletado.');
                win.webContents.send('file-list-updated', { role: 'Replica', replicaId });
            }
        });
    }
    // API: Upload
    else if (req.method === 'POST' && req.url.startsWith('/upload/')) {
        if (role !== 'Replica') { res.writeHead(403).end(); return; }
        const filename = decodeURIComponent(req.url.split('/')[2]);
        const filePath = path.join(sharedDir, filename);
        const fileStream = fs.createWriteStream(filePath);
        req.pipe(fileStream);
        req.on('end', () => {
            res.writeHead(200).end('Upload completo.');
            win.webContents.send('file-list-updated', { role: 'Replica', replicaId });
        });
        req.on('error', () => { res.writeHead(500).end(); });
    }
    else {
      res.writeHead(404).end('Endpoint nao encontrado.');
    }
    
  });
  
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => { sockets.delete(socket); });
  });

  server.listen(port, () => {
    let message = `${role} rodando na porta ${port}!`;
    // NOVO: Expõe o IP do servidor
    if (role === 'Servidor') {
        const localIp = findLocalIp();
        message = `Servidor rodando em: ${localIp}:${port}`;
    }
    
    win.webContents.send('update-status', { 
        role: role, 
        message: message, 
        type: 'success',
        replicaId: replicaId
    });
  });
  
  server.on('error', (err) => {
    if (role === 'Servidor') {
        mainServerInstance = null;
    } else if (role === 'Replica') {
        delete replicaServerInstances[replicaId];
        delete replicaServerSockets[replicaId];
    }
    win.webContents.send('update-status', { 
        role: role, 
        message: `Erro: ${err.message}`,
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

ipcMain.handle('get-local-files', (event, role, replicaId) => {
   const dir = getDir(role, replicaId);
   return fs.readdirSync(dir);
});

ipcMain.handle('delete-file', async (event, role, filename, replicaId) => {
    const filePath = path.join(getDir(role, replicaId), filename);
    try {
        fs.unlinkSync(filePath);
        if (role === 'Servidor') {
            // TODO: Esta lógica de push-delete é falha. A réplica deveria puxar.
            // Mas por enquanto, vamos deixar.
            // const replicaAddress = "http://localhost:8001"; 
            // await fetch(`${replicaAddress}/files/${encodeURIComponent(filename)}`, { method: 'DELETE' });
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

// ATUALIZADO: Busca a lista de réplicas do servidor
ipcMain.on('download-file', async (event, { serverAddress, filename }) => {
    
    // 1. Define o servidor principal
    const servers = [
        { name: 'Servidor Principal', url: `${serverAddress}/download/${encodeURIComponent(filename)}` },
    ];
    
    // 2. Tenta buscar a lista de réplicas do servidor
    try {
        const response = await fetch(`${serverAddress}/replicas`);
        if (response.ok) {
            const replicaAddrs = await response.json();
            replicaAddrs.forEach((addr, i) => {
                servers.push({
                    name: `Réplica 0${i + 1}`,
                    url: `${addr}/download/${encodeURIComponent(filename)}`
                });
            });
        }
        console.log('Lista de failover obtida:', servers.map(s => s.name));
    } catch (err) {
        console.warn(`Não foi possível buscar a lista de réplicas: ${err.message}`);
    }
    
    // O resto da lógica de failover (passos 3, 4, 5) é o mesmo de antes
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

// Sincronização da Réplica (PULL)
ipcMain.on('start-replica-sync', async (event, { serverAddress, replicaId }) => {
    // ... (função sem mudanças)
    try {
        const response = await fetch(`${serverAddress}/files`);
        if (!response.ok) throw new Error(`Servidor respondeu com ${response.status}`);
        const serverFiles = await response.json();
        const replicaDir = getDir('Replica', replicaId);
        const replicaFiles = fs.readdirSync(replicaDir);
        const missingOnReplica = serverFiles.filter(f => !replicaFiles.includes(f));
        win.webContents.send('sync-start', { files: missingOnReplica, replicaId });
        for (const file of missingOnReplica) {
            console.log(`Réplica ${replicaId} baixando ${file} do servidor...`);
            const fileUrl = `${serverAddress}/download/${encodeURIComponent(file)}`;
            const savePath = path.join(replicaDir, file);
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
    // ... (função sem mudanças)
    win.webContents.send('update-status', { role: 'Servidor', message: `Sincronizando com ${replicaAddress}...`, type: 'info' });
    try {
        const localFiles = fs.readdirSync(SHARED_SERVER_DIR);
        const response = await fetch(`${replicaAddress}/files`);
        if (!response.ok) throw new Error(`Réplica respondeu com ${response.status}`);
        const remoteFiles = await response.json();
        const missingOnReplica = localFiles.filter(f => !remoteFiles.includes(f));
        const missingOnServer = remoteFiles.filter(f => !localFiles.includes(f));
        for (const file of missingOnReplica) {
            console.log(`Servidor upando ${file} para a réplica...`);
            const filePath = path.join(SHARED_SERVER_DIR, file);
            const fileStream = fs.createReadStream(filePath);
            const uploadResponse = await fetch(`${replicaAddress}/upload/${encodeURIComponent(file)}`, { method: 'POST', body: fileStream });
            if (!uploadResponse.ok) throw new Error(`Falha ao upar ${file}`);
        }
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