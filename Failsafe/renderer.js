// renderer.js

// --- Funções Helper ---

// Formata bytes para KB/s, MB/s, etc.
function formatSpeed(bytes) {
    if (bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ATUALIZADO: Controla os botões Iniciar/Parar e IDs de réplica
function updateStatus(role, message, type = 'info', replicaId = null) {
    let elementId, startBtnId, stopBtnId;

    if (role === 'Servidor') {
        elementId = 'server-status';
        startBtnId = 'server-start-btn';
        stopBtnId = 'server-stop-btn';
    } else if (role === 'Replica') {
        elementId = `replica-status-${replicaId}`;
        startBtnId = `replica-start-btn-${replicaId}`;
        stopBtnId = `replica-stop-btn-${replicaId}`;
    } else {
        elementId = 'client-status';
    }
    
    const statusEl = document.getElementById(elementId);
    if (statusEl) {
        statusEl.className = `alert alert-${type}`;
        statusEl.textContent = message;
    }

    // Controla a visibilidade dos botões
    if (startBtnId && stopBtnId) {
        const startBtn = document.getElementById(startBtnId);
        const stopBtn = document.getElementById(stopBtnId);
        
        // CORREÇÃO: Só mostra o botão "Parar" em SUCESSO.
        // Se der erro (como EADDRINUSE), o botão "Iniciar" continua visível.
        if (type === 'success') { // Rodando
            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';
        } else { // Parado ou Erro
            startBtn.style.display = 'block';
            stopBtn.style.display = 'none';
        }
    }
}

// Renderiza a lista de arquivos
function renderFileList(listId, files, showDeleteButton = false, role = '', replicaId = null) {
    const listEl = document.getElementById(listId);
    listEl.innerHTML = '';
    
    if (files.length === 0) {
        listEl.innerHTML = '<div class="list-group-item">Nenhum arquivo encontrado.</div>';
        return;
    }

    files.forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-list-item';
        
        const fileName = document.createElement('span');
        fileName.textContent = file;
        item.appendChild(fileName);

        if (showDeleteButton) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-danger btn-sm';
            deleteBtn.textContent = 'Excluir';
            deleteBtn.onclick = async () => {
                if (confirm(`Tem certeza que quer deletar ${file}?`)) {
                    // Passa o ID da réplica, se houver
                    const result = await window.electronAPI.deleteFile(role, file, replicaId);
                    if (result.success) {
                        updateStatus(role, `Arquivo ${file} deletado.`, 'success', replicaId);
                        refreshLocalFiles(role, replicaId);
                    } else {
                        updateStatus(role, `Erro ao deletar ${file}: ${result.error}`, 'danger', replicaId);
                    }
                }
            };
            item.appendChild(deleteBtn);
        } else {
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn btn-primary btn-sm';
            downloadBtn.textContent = 'Baixar';
            downloadBtn.onclick = () => {
                 const server = document.getElementById('client-server-address').value;
                 // Pega a lista de réplicas do novo campo
                 const replicas = document.getElementById('client-replicas-list').value
                                      .split(',')
                                      .map(url => url.trim())
                                      .filter(url => url.length > 0);
                 
                 const clientProgressBar = document.getElementById('client-progress-bar');
                 const clientProgressText = document.getElementById('client-progress-text');
                 clientProgressBar.dataset.filename = file;
                 clientProgressBar.style.width = '0%';
                 clientProgressText.textContent = '0% (0 B/s)';
                 
                 window.electronAPI.downloadFile({
                     serverAddress: server,
                     replicaAddresses: replicas, // Envia a lista de réplicas
                     filename: file
                 });
            };
            item.appendChild(downloadBtn);
        }
        
        listEl.appendChild(item);
    });
}

// Atualiza a lista de arquivos local (Servidor/Réplica)
async function refreshLocalFiles(role, replicaId = null) {
    const files = await window.electronAPI.getLocalFiles(role, replicaId);
    
    let listId;
    if (role === 'Servidor') {
        listId = 'server-file-list';
    } else if (role === 'Replica') {
        listId = `replica-file-list-${replicaId}`;
    } else {
        return;
    }
    
    renderFileList(listId, files, true, role, replicaId);
}

// --- Callbacks do Main Process ---
window.electronAPI.onUpdateStatus(({ role, message, type, replicaId }) => {
    updateStatus(role, message, type, replicaId);
});

// ATUALIZADO: Mostra porcentagem e velocidade no texto EXTERNO
window.electronAPI.onFileProgress(({ filename, percent, speed }) => {
    const formattedSpeed = formatSpeed(speed);

    // Progresso do CLIENTE
    const clientProgressBar = document.getElementById('client-progress-bar');
    const clientProgressText = document.getElementById('client-progress-text');
    if (clientProgressBar && clientProgressBar.dataset.filename === filename) {
        clientProgressBar.style.width = `${percent}%`;
        clientProgressText.textContent = `${percent}% (${formattedSpeed})`; // Atualiza o texto externo
    }

    // Progresso da RÉPLICA (Sync)
    const syncProgressBar = document.getElementById(`sync-progress-${filename}`);
    const syncProgressText = document.getElementById(`sync-text-${filename}`);
    if (syncProgressBar) {
        syncProgressBar.style.width = `${percent}%`;
        syncProgressText.textContent = `${percent}% (${formattedSpeed})`; // Atualiza o texto externo
    }
});

// ATUALIZADO: Cria as barras de progresso na réplica correta
window.electronAPI.onSyncStart(({ files, replicaId }) => {
    const syncStatusDiv = document.getElementById(`replica-sync-status-${replicaId}`);
    if (!syncStatusDiv) return;

    if (files.length === 0) {
        syncStatusDiv.innerHTML = 'Réplica já está sincronizada.';
        return;
    }

    syncStatusDiv.innerHTML = 'Sincronizando arquivos...';
    files.forEach(file => {
        const fileProgress = document.createElement('div');
        fileProgress.className = 'mb-2';
        
        // ATUALIZADO: Texto externo para a barra de sync
        fileProgress.innerHTML = `
            <div class="d-flex justify-content-between">
                <small>${file}</small>
                <small class="sync-progress-text" id="sync-text-${file}">0% (0 B/s)</small>
            </div>
            <div class="progress" role="progressbar" style="height: 10px;">
                <div class="progress-bar" id="sync-progress-${file}" style="width: 0%;"></div>
            </div>
        `;
        syncStatusDiv.appendChild(fileProgress);
    });
});

// ATUALIZADO: Atualiza a lista de arquivos da réplica correta
window.electronAPI.onFileListUpdated(({ role, replicaId }) => {
    refreshLocalFiles(role, replicaId);
});


// --- Eventos da UI ---

// Cliente
document.getElementById('client-connect-btn').addEventListener('click', async () => {
    const serverAddress = document.getElementById('client-server-address').value;
    updateStatus('Cliente', `Buscando arquivos de ${serverAddress}...`, 'info');
    const result = await window.electronAPI.fetchFiles(serverAddress);
    if (result.error) {
        updateStatus('Cliente', `Erro: ${result.error}`, 'danger');
        renderFileList('client-file-list', []);
    } else {
        updateStatus('Cliente', `Arquivos listados com sucesso.`, 'success');
        renderFileList('client-file-list', result, false);
    }
});

// Servidor
document.getElementById('server-start-btn').addEventListener('click', () => {
    const port = parseInt(document.getElementById('server-port').value, 10);
    window.electronAPI.startServer({ port, role: 'Servidor' });
    setTimeout(() => refreshLocalFiles('Servidor'), 500);
});

document.getElementById('server-stop-btn').addEventListener('click', () => {
    window.electronAPI.stopServer('Servidor');
});

document.getElementById('server-add-file-btn').addEventListener('click', () => {
    window.electronAPI.addFileToServer();
});

document.getElementById('server-sync-btn').addEventListener('click', () => {
    const serverAddress = `http://localhost:${document.getElementById('server-port').value}`;
    const replicaAddress = document.getElementById('server-replica-address').value;
    window.electronAPI.syncReplica({ serverAddress, replicaAddress });
});

// ATUALIZADO: Listeners para as 3 Réplicas
[1, 2, 3].forEach(id => {
    // Botão Iniciar Réplica
    document.getElementById(`replica-start-btn-${id}`).addEventListener('click', () => {
        const port = parseInt(document.getElementById(`replica-port-${id}`).value, 10);
        
        // 1. Inicia o servidor da Réplica
        window.electronAPI.startServer({ port, role: 'Replica', replicaId: id });
        
        // 2. Atualiza a lista de arquivos locais
        setTimeout(() => refreshLocalFiles('Replica', id), 500); 
        
        // 3. Pede para iniciar a sincronização (pull)
        const serverAddress = document.getElementById(`replica-server-address-${id}`).value; 
        window.electronAPI.startReplicaSync({ serverAddress, replicaId: id });
    });

    // Botão Parar Réplica
    document.getElementById(`replica-stop-btn-${id}`).addEventListener('click', () => {
        window.electronAPI.stopServer('Replica', id);
    });
});