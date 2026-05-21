window.addEventListener('DOMContentLoaded', async () => {
  // Elementos padrão do backup
  const triggerButton = document.getElementById('backup-button');
  const pauseButton = document.getElementById('pause-button');
  const cancelButton = document.getElementById('cancel-button');
  const selectSourceButton = document.getElementById('select-source-button');
  const selectDestButton = document.getElementById('select-dest-button');
  const sourcePathElement = document.getElementById('source-path');
  const destPathElement = document.getElementById('dest-path');
  const statusText = document.getElementById('status');
  const statusTextContent = document.getElementById('status-text-content');
  const progressList = document.getElementById('progress');
  const progressBar = document.getElementById('progress-bar');
  const progressValue = document.getElementById('progress-value');
  const includeXamppCheckbox = document.getElementById('include-xampp-checkbox');
  const statusChipText = document.getElementById('status-chip-text');
  const actionCard = document.querySelector('.action-card');
  const actionOverview = document.getElementById('action-overview');
  const actionPrimaryState = document.getElementById('action-primary-state');
  const actionSecondaryState = document.getElementById('action-secondary-state');
  const terminalContainer = document.getElementById('terminal-container');
  const logsToggleButton = document.getElementById('logs-toggle-button');

  // Elementos de atualização
  const updateCard = document.getElementById('update-card');
  const updateStatus = document.getElementById('update-status');
  const updateProgressWrapper = document.getElementById('update-progress-wrapper');
  const updateProgressBar = document.getElementById('update-progress-bar');
  const updateProgressValue = document.getElementById('update-progress-value');
  const checkUpdatesButton = document.getElementById('check-updates-button');
  const installUpdateButton = document.getElementById('install-update-button');

  // Novos elementos de interação
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeToggleIcon = document.getElementById('theme-toggle-icon');
  const sourceDropZone = document.getElementById('source-drop-zone');
  const destDropZone = document.getElementById('dest-drop-zone');
  const ignoredTagsList = document.getElementById('ignored-tags-list');
  const newIgnoredInput = document.getElementById('new-ignored-input');
  const addIgnoredButton = document.getElementById('add-ignored-button');
  const historyList = document.getElementById('history-list');
  const clearHistoryButton = document.getElementById('clear-history-button');
  const compressionLevelSelect = document.getElementById('compression-level-select');

  if (
    !triggerButton ||
    !pauseButton ||
    !cancelButton ||
    !selectSourceButton ||
    !selectDestButton ||
    !sourcePathElement ||
    !destPathElement ||
    !statusText ||
    !progressList ||
    !progressBar ||
    !progressValue ||
    !window.backup
  ) {
    console.error('Elementos obrigatórios do DOM não foram encontrados.');
    return;
  }

  let isBackupRunning = false;
  let isPaused = false;
  let currentSourceDir = null;
  let currentDestDir = null;
  let currentIgnoredDirs = [];
  let activeTheme = 'auto';

  // SVG Icons para o alternador de temas
  const moonIconSvg = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';
  const sunIconSvg =
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>';

  // === CONTROLE DE TEMAS ===
  const applyTheme = (theme) => {
    activeTheme = theme;
    const isDarkSystem = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (theme === 'dark' || (theme === 'auto' && isDarkSystem)) {
      document.body.classList.add('theme-dark');
      document.body.classList.remove('theme-light');
      themeToggleIcon.innerHTML = sunIconSvg;
      themeToggleBtn.title = 'Mudar para tema claro';
    } else {
      document.body.classList.add('theme-light');
      document.body.classList.remove('theme-dark');
      themeToggleIcon.innerHTML = moonIconSvg;
      themeToggleBtn.title = 'Mudar para tema escuro';
    }
  };

  // Detecta mudança de tema no sistema operacional automaticamente
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (activeTheme === 'auto') {
      applyTheme('auto');
    }
  });

  themeToggleBtn.addEventListener('click', async () => {
    const newTheme = document.body.classList.contains('theme-dark') ? 'light' : 'dark';
    applyTheme(newTheme);
    await window.backup.setTheme(newTheme);
  });

  // === CONFIGURAÇÕES E ESTADO VISUAL ===
  const setActionSummary = (state, primary, secondary) => {
    if (actionOverview) {
      actionOverview.dataset.state = state;
    }
    if (actionPrimaryState) {
      actionPrimaryState.textContent = primary;
    }
    if (actionSecondaryState) {
      actionSecondaryState.textContent = secondary;
    }
  };

  const setPauseButtonVisualState = (pausedState) => {
    if (pausedState) {
      pauseButton.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Continuar
      `;
      pauseButton.classList.remove('button-primary', 'button-warning');
      pauseButton.classList.add('button-success');
    } else {
      pauseButton.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
        </svg>
        Pausar
      `;
      pauseButton.classList.remove('button-success', 'button-warning');
      pauseButton.classList.add('button-primary');
    }
  };

  const showControlButtons = () => {
    actionCard?.classList.add('is-active');
    pauseButton.hidden = false;
    cancelButton.hidden = false;
    cancelButton.classList.add('is-secondary-action');
  };

  const hideControlButtons = () => {
    actionCard?.classList.remove('is-active');
    pauseButton.hidden = true;
    cancelButton.hidden = true;
    cancelButton.classList.remove('is-secondary-action');
  };

  const renderPath = (element, path) => {
    if (path) {
      const segments = path.split('/').filter(Boolean);
      const name = segments[segments.length - 1] || path;
      const parent = path.slice(0, Math.max(1, path.lastIndexOf('/'))) || '/';
      element.innerHTML = '';
      const nameElement = document.createElement('span');
      const parentElement = document.createElement('span');
      nameElement.className = 'path-name';
      parentElement.className = 'path-parent';
      nameElement.textContent = name;
      parentElement.textContent = parent;
      element.append(nameElement, parentElement);
      element.title = path;
      element.classList.remove('empty');
    } else {
      element.innerHTML = '<span class="path-name">Não configurada</span>';
      element.removeAttribute('title');
      element.classList.add('empty');
    }
  };

  const updateSourcePath = (path) => {
    currentSourceDir = path;
    renderPath(sourcePathElement, path);
  };

  const updateDestPath = (path) => {
    currentDestDir = path;
    renderPath(destPathElement, path);
  };

  logsToggleButton?.addEventListener('click', () => {
    const isCollapsed = terminalContainer?.classList.toggle('is-collapsed');
    logsToggleButton.textContent = isCollapsed ? 'Expandir logs' : 'Recolher logs';
  });

  // === RENDERS INTERATIVOS (CHIPS E HISTÓRICO) ===
  const renderIgnoredDirs = (dirs) => {
    currentIgnoredDirs = dirs || [];
    ignoredTagsList.innerHTML = '';

    if (currentIgnoredDirs.length === 0) {
      ignoredTagsList.innerHTML =
        '<span style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">Nenhuma pasta ignorada</span>';
      return;
    }

    currentIgnoredDirs.forEach((dir) => {
      const chip = document.createElement('div');
      chip.className = 'ignored-tag';
      chip.innerHTML = `
        <span>${dir}</span>
        <button class="ignored-tag-remove" data-dir="${dir}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;

      // Evento para remover chip
      chip.querySelector('.ignored-tag-remove').addEventListener('click', async (e) => {
        e.preventDefault();
        const dirToRemove = e.currentTarget.dataset.dir;
        const updatedDirs = currentIgnoredDirs.filter((d) => d !== dirToRemove);
        await window.backup.setIgnoredDirs(updatedDirs);
        renderIgnoredDirs(updatedDirs);
        appendProgress(`Filtro de exclusão removido: ${dirToRemove}`);
      });

      ignoredTagsList.appendChild(chip);
    });
  };

  const renderBackupHistory = async () => {
    try {
      const res = await window.backup.getBackupHistory();
      if (!res.success) {
        throw new Error(res.error);
      }

      const history = res.history || [];
      historyList.innerHTML = '';

      if (history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">Nenhum backup realizado ainda.</div>';
        return;
      }

      history.forEach((item) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'history-item';

        const dateStr = new Date(item.timestamp).toLocaleString('pt-BR');

        itemEl.innerHTML = `
          <div class="history-item-details">
            <div class="history-item-title">${dateStr}</div>
            <div class="history-item-meta">
              <span><strong>Tamanho:</strong> ${item.size}</span>
              <span><strong>Destino:</strong> ${item.destDir}</span>
            </div>
          </div>
          <div class="history-actions-group">
            <button class="button button-tonal button-icon-only reveal-btn" title="Mostrar no Finder" data-path="${item.path}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
          </div>
        `;

        itemEl.querySelector('.reveal-btn').addEventListener('click', async (e) => {
          const path = e.currentTarget.dataset.path;
          const revealResult = await window.backup.revealInFinder(path);
          if (!revealResult.success) {
            setStatus(`Erro ao revelar arquivo: ${revealResult.error}`, 'error');
          }
        });

        historyList.appendChild(itemEl);
      });
    } catch (err) {
      console.error('Erro ao renderizar histórico de backups:', err);
      historyList.innerHTML =
        '<div class="history-empty" style="color: var(--danger);">Não foi possível carregar o histórico.</div>';
    }
  };

  // Limpar histórico
  clearHistoryButton.addEventListener('click', async () => {
    if (
      confirm(
        'Tem certeza que deseja limpar todo o histórico de backups da tela? Isso não excluirá os arquivos físicos.'
      )
    ) {
      await window.backup.clearBackupHistory();
      renderBackupHistory();
    }
  });

  // Adicionar pasta a ignorar
  const handleAddIgnored = async () => {
    const value = newIgnoredInput.value.trim();
    if (!value) {
      return;
    }

    if (currentIgnoredDirs.includes(value)) {
      newIgnoredInput.value = '';
      return;
    }

    const updatedDirs = [...currentIgnoredDirs, value];
    await window.backup.setIgnoredDirs(updatedDirs);
    renderIgnoredDirs(updatedDirs);
    newIgnoredInput.value = '';
    appendProgress(`Filtro de exclusão adicionado: ${value}`);
  };

  addIgnoredButton.addEventListener('click', handleAddIgnored);
  newIgnoredInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      handleAddIgnored();
    }
  });

  // === LÓGICA DE DRAG & DROP ===
  const setupDragAndDrop = () => {
    // Área de Origem
    sourceDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      sourceDropZone.classList.add('drag-active');
    });

    sourceDropZone.addEventListener('dragleave', () => {
      sourceDropZone.classList.remove('drag-active');
    });

    sourceDropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      sourceDropZone.classList.remove('drag-active');

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        setStatus('Validando pasta de origem...', 'idle');
        const res = await window.backup.setSourceDir(file.path);

        if (res.success) {
          updateSourcePath(res.path);
          setStatus('Pasta de origem configurada via Drag & Drop!', 'success');
          appendProgress(`📁 Origem alterada para: ${res.path}`);
        } else {
          setStatus(res.error, 'error');
        }
      }
    });

    // Área de Destino
    destDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      destDropZone.classList.add('drag-active');
    });

    destDropZone.addEventListener('dragleave', () => {
      destDropZone.classList.remove('drag-active');
    });

    destDropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      destDropZone.classList.remove('drag-active');

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        setStatus('Validando pasta de destino...', 'idle');
        const res = await window.backup.setDestDir(file.path);

        if (res.success) {
          updateDestPath(res.path);
          setStatus('Pasta de destino configurada via Drag & Drop!', 'success');
          appendProgress(`💾 Destino alterado para: ${res.path}`);
        } else {
          setStatus(res.error, 'error');
        }
      }
    });
  };

  setupDragAndDrop();

  // Nível de compactação
  compressionLevelSelect?.addEventListener('change', async () => {
    const level = Number(compressionLevelSelect.value);
    await window.backup.setCompressionLevel(level);
    appendProgress(`Nível de compactação alterado para: ${level}`);
  });

  // === CARREGAMENTO DA CONFIGURAÇÃO ===
  const loadConfig = async () => {
    try {
      const config = await window.backup.getConfig();
      const sourceDir = config.sourceDir || '/Users/thiago/Developer';
      const destDir =
        config.destDir ||
        '/Users/thiago/Library/CloudStorage/GoogleDrive-thiagowip@gmail.com/Meu Drive/Backup-developer';

      updateSourcePath(sourceDir);
      updateDestPath(destDir);
      renderIgnoredDirs(config.ignoredDirs);
      applyTheme(config.theme || 'auto');
      if (compressionLevelSelect) {
        compressionLevelSelect.value =
          config.compressionLevel !== undefined ? String(config.compressionLevel) : '1';
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
      updateSourcePath('/Users/thiago/Developer');
      updateDestPath(
        '/Users/thiago/Library/CloudStorage/GoogleDrive-thiagowip@gmail.com/Meu Drive/Backup-developer'
      );
      applyTheme('auto');
      if (compressionLevelSelect) {
        compressionLevelSelect.value = '1';
      }
    }
  };

  // Carrega configurações e histórico no início
  await loadConfig();
  await renderBackupHistory();
  hideControlButtons();

  // === AUTO-UPDATER LOGIC ===
  const setupUpdateHandlers = () => {
    if (!window.backup.onUpdateMessage) {
      return;
    }

    window.backup.onUpdateMessage((message) => {
      updateCard.style.display = 'block';

      switch (message.event) {
      case 'checking-for-update':
        updateStatus.textContent = 'Verificando atualizações...';
        updateStatus.className = 'update-status';
        updateProgressWrapper.style.display = 'none';
        installUpdateButton.style.display = 'none';
        break;

      case 'update-available':
        updateStatus.textContent = `Nova versão disponível: ${message.version}`;
        updateStatus.className = 'update-status update-available';
        updateProgressWrapper.style.display = 'none';
        installUpdateButton.style.display = 'block';
        installUpdateButton.dataset.downloadUrl = message.downloadUrl || '';
        statusChipText.textContent = 'Atualização disponível';
        break;

      case 'update-not-available':
        updateStatus.textContent = `Você está usando a versão mais recente (${message.version || 'atual'})`;
        updateStatus.className = 'update-status';
        updateProgressWrapper.style.display = 'none';
        installUpdateButton.style.display = 'none';
        statusChipText.textContent = 'Pronto para executar';
        break;

      case 'update-downloaded':
        updateStatus.textContent = `Atualização disponível! Versão ${message.version} pronta para baixar.`;
        updateStatus.className = 'update-status update-downloaded';
        updateProgressWrapper.style.display = 'none';
        installUpdateButton.style.display = 'block';
        installUpdateButton.dataset.downloadUrl = message.downloadUrl || '';
        statusChipText.textContent = 'Atualização pronta';
        break;

      case 'update-error':
        updateStatus.textContent = `Erro ao verificar atualizações: ${message.message}`;
        updateStatus.className = 'update-status update-error';
        updateProgressWrapper.style.display = 'none';
        installUpdateButton.style.display = 'none';
        break;
      }
    });
  };

  checkUpdatesButton?.addEventListener('click', async () => {
    try {
      checkUpdatesButton.disabled = true;
      checkUpdatesButton.innerHTML = 'Verificando...';
      await window.backup.checkForUpdates();
    } catch (error) {
      updateStatus.textContent = `Erro ao verificar atualizações: ${error.message}`;
      updateStatus.className = 'update-status update-error';
    } finally {
      checkUpdatesButton.disabled = false;
      checkUpdatesButton.innerHTML = 'Verificar atualizações';
    }
  });

  installUpdateButton?.addEventListener('click', async () => {
    try {
      installUpdateButton.disabled = true;
      installUpdateButton.innerHTML = 'Abrindo download...';
      const downloadUrl = installUpdateButton.dataset.downloadUrl;
      await window.backup.installUpdate(downloadUrl);
      installUpdateButton.innerHTML = 'Download aberto';
    } catch (error) {
      updateStatus.textContent = `Erro ao abrir download: ${error.message}`;
      updateStatus.className = 'update-status update-error';
      installUpdateButton.disabled = false;
      installUpdateButton.innerHTML = 'Baixar atualização';
    }
  });

  setupUpdateHandlers();

  // === BACKUP LOGIC ===
  const appendProgress = (message) => {
    const item = document.createElement('li');
    item.textContent = message;
    progressList.prepend(item);
  };

  const setProgress = (percent) => {
    const value = typeof percent === 'number' ? Math.max(0, Math.min(percent, 100)) : 0;
    progressBar.style.width = `${value}%`;
    progressValue.textContent = `${value}%`;
  };

  window.backup.onProgress((payload) => {
    const message =
      typeof payload === 'string'
        ? { text: payload }
        : {
          type: 'status',
          text: '',
          ...payload
        };

    if (typeof message.percent === 'number') {
      setProgress(message.percent);
    }

    if (message.text && message.type !== 'progress') {
      appendProgress(message.text);
      if (message.text.includes('Backup pausado')) {
        setStatus('Backup pausado. Aguardando continuar...', 'paused');
        setActionSummary('paused', 'Backup pausado', 'Clique em Continuar para retomar do ponto atual.');
        statusChipText.textContent = 'Backup pausado';
      }
    }
  });

  const setStatus = (message, type = 'idle') => {
    statusTextContent.textContent = message;
    statusText.dataset.state = type;
  };

  const resetProgress = () => {
    progressList.innerHTML = '';
    setProgress(0);
  };

  // Seletor de origem
  selectSourceButton.addEventListener('click', async () => {
    try {
      const result = await window.backup.selectSourceDir();
      if (result.success) {
        updateSourcePath(result.path);
        setStatus('Pasta de origem configurada', 'success');
        appendProgress(`📁 Origem alterada para: ${result.path}`);
      }
    } catch (error) {
      console.error('Erro ao selecionar pasta de origem:', error);
      setStatus(`Erro ao selecionar pasta: ${error.message}`, 'error');
    }
  });

  // Seletor de destino
  selectDestButton.addEventListener('click', async () => {
    try {
      const result = await window.backup.selectDestDir();
      if (result.success) {
        updateDestPath(result.path);
        setStatus('Pasta de destino configurada', 'success');
        appendProgress(`💾 Destino alterado para: ${result.path}`);
      }
    } catch (error) {
      console.error('Erro ao selecionar pasta de destino:', error);
      setStatus(`Erro ao selecionar pasta: ${error.message}`, 'error');
    }
  });

  // Pausar/Continuar
  pauseButton.addEventListener('click', async () => {
    try {
      const result = await window.backup.togglePause();
      isPaused = result.isPaused;
      setPauseButtonVisualState(isPaused);
      if (isPaused) {
        setStatus('Backup pausado. Aguardando continuar...', 'paused');
        setActionSummary('paused', 'Backup pausado', 'Clique em Continuar para retomar do ponto atual.');
        statusChipText.textContent = 'Backup pausado';
      } else {
        setStatus('Executando backup...', 'running');
        setActionSummary('running', 'Backup em andamento', 'Use Pausar se precisar congelar a operação temporariamente.');
        statusChipText.textContent = 'Executando backup';
      }
    } catch (error) {
      console.error('Erro ao pausar/continuar:', error);
    }
  });

  // Cancelar
  cancelButton.addEventListener('click', async () => {
    try {
      await window.backup.cancel();
      setStatus('Backup cancelado pelo usuário', 'error');
      setActionSummary('error', 'Backup cancelado', 'A operação foi interrompida antes da conclusão.');
      statusChipText.textContent = 'Backup cancelado';
      appendProgress('❌ Backup cancelado');
      hideControlButtons();
      setPauseButtonVisualState(false);
      triggerButton.disabled = false;
      isBackupRunning = false;
      isPaused = false;
    } catch (error) {
      console.error('Erro ao cancelar:', error);
    }
  });

  // Iniciar Backup
  triggerButton.addEventListener('click', async () => {
    const sourceDir = currentSourceDir || '/Users/thiago/Developer';
    const destDir =
      currentDestDir ||
      '/Users/thiago/Library/CloudStorage/GoogleDrive-thiagowip@gmail.com/Meu Drive/Backup-developer';

    triggerButton.disabled = true;
    showControlButtons();
    setPauseButtonVisualState(false);
    isPaused = false;
    isBackupRunning = true;
    resetProgress();
    setStatus('Executando backup...', 'running');
    setActionSummary('running', 'Backup em andamento', 'Use Pausar se precisar congelar a operação temporariamente.');
    statusChipText.textContent = 'Executando backup';
    appendProgress('Solicitando backup...');

    try {
      const includeXampp = includeXamppCheckbox ? includeXamppCheckbox.checked : false;
      const result = await window.backup.start(sourceDir, destDir, includeXampp);
      if (result.success) {
        setStatus('Backup concluído com sucesso!', 'success');
        setActionSummary('success', 'Backup concluído', 'O arquivo compactado foi salvo no destino configurado.');
        statusChipText.textContent = 'Backup concluído';
        appendProgress(`Arquivo criado em: ${result.path}`);
        await renderBackupHistory(); // Atualiza a tabela do histórico
      } else {
        setStatus(`Erro: ${result.error}`, 'error');
        setActionSummary('error', 'Falha no backup', result.error || 'Não foi possível concluir a operação.');
        statusChipText.textContent = 'Falha no backup';
      }
    } catch (error) {
      setStatus(`Erro ao executar backup: ${error.message}`, 'error');
      setActionSummary('error', 'Falha no backup', error.message || 'Não foi possível concluir a operação.');
      statusChipText.textContent = 'Falha no backup';
    } finally {
      triggerButton.disabled = false;
      hideControlButtons();
      setPauseButtonVisualState(false);
      isBackupRunning = false;
      isPaused = false;
    }
  });
});
