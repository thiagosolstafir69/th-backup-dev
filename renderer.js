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
  const backupSummary = document.getElementById('backup-summary');
  const backupSummaryMain = document.getElementById('backup-summary-main');
  const backupSummaryDetail = document.getElementById('backup-summary-detail');
  const includeXamppCheckbox = document.getElementById('include-xampp-checkbox');

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

  let isPaused = false;
  let currentSourceDir = null;
  let currentDestDir = null;
  let currentIgnoredDirs = [];
  let activeTheme = 'auto';

  const formatBytes = (bytes) => {
    if (!bytes) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** index;
    const precision = value >= 10 || index === 0 ? 0 : 1;

    return `${value.toFixed(precision)} ${units[index]}`;
  };

  const formatDuration = (durationMs) => {
    if (!durationMs) {
      return 'Duração não registrada';
    }

    const seconds = Math.round(durationMs / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}min ${remainingSeconds}s`;
  };

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
  const setPauseButtonVisualState = (pausedState) => {
    if (pausedState) {
      pauseButton.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Continuar
      `;
      pauseButton.classList.remove('button-warning');
      pauseButton.classList.add('button-success');
    } else {
      pauseButton.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
        </svg>
        Pausar
      `;
      pauseButton.classList.remove('button-success');
      pauseButton.classList.add('button-warning');
    }
  };

  const showControlButtons = () => {
    pauseButton.hidden = false;
    cancelButton.hidden = false;
  };

  const hideControlButtons = () => {
    pauseButton.hidden = true;
    cancelButton.hidden = true;
  };

  const updateSourcePath = (path) => {
    currentSourceDir = path;
    if (path) {
      sourcePathElement.textContent = path;
      sourcePathElement.classList.remove('empty');
    } else {
      sourcePathElement.textContent = 'Não configurada';
      sourcePathElement.classList.add('empty');
    }
    triggerButton.disabled = !(currentSourceDir && currentDestDir);
  };

  const updateDestPath = (path) => {
    currentDestDir = path;
    if (path) {
      destPathElement.textContent = path;
      destPathElement.classList.remove('empty');
    } else {
      destPathElement.textContent = 'Não configurada';
      destPathElement.classList.add('empty');
    }
    triggerButton.disabled = !(currentSourceDir && currentDestDir);
  };

  const renderBackupSummary = (summary) => {
    if (!backupSummary || !backupSummaryMain || !backupSummaryDetail) {
      return;
    }

    backupSummary.hidden = false;
    backupSummaryMain.textContent = `${summary.totalFiles} arquivos, ${formatBytes(
      summary.totalSize
    )}`;
    backupSummaryDetail.textContent = [
      `Destino: ${summary.destDir}`,
      `Pastas ignoradas: ${summary.ignoredDirs.join(', ') || 'nenhuma'}`,
      summary.skippedCount > 0 ? `${summary.skippedCount} item(ns) serão pulados` : null
    ]
      .filter(Boolean)
      .join(' • ');
  };

  const clearBackupSummary = () => {
    if (backupSummary) {
      backupSummary.hidden = true;
    }
  };

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
        clearBackupSummary();
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
              <span><strong>Duração:</strong> ${formatDuration(item.durationMs)}</span>
              <span><strong>Origem:</strong> ${item.sourceDir || 'Não registrada'}</span>
              <span><strong>Destino:</strong> ${item.destDir || 'Não registrado'}</span>
            </div>
          </div>
          <div class="history-actions-group">
            <button class="button button-tonal button-icon-only open-btn" title="Abrir ZIP" data-path="${item.path}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>
              </svg>
            </button>
            <button class="button button-tonal button-icon-only reveal-btn" title="Mostrar no Finder" data-path="${item.path}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
            <button class="button button-tonal button-icon-only copy-btn" title="Copiar caminho" data-path="${item.path}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            <button class="button button-tonal button-icon-only repeat-btn" title="Usar esta configuração" data-source="${item.sourceDir || ''}" data-dest="${item.destDir || ''}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </button>
          </div>
        `;

        itemEl.querySelector('.open-btn').addEventListener('click', async (e) => {
          const path = e.currentTarget.dataset.path;
          const openResult = await window.backup.openBackupFile(path);
          if (!openResult.success) {
            setStatus(`Erro ao abrir arquivo: ${openResult.error}`, 'error');
          }
        });

        itemEl.querySelector('.reveal-btn').addEventListener('click', async (e) => {
          const path = e.currentTarget.dataset.path;
          const revealResult = await window.backup.revealInFinder(path);
          if (!revealResult.success) {
            setStatus(`Erro ao revelar arquivo: ${revealResult.error}`, 'error');
          }
        });

        itemEl.querySelector('.copy-btn').addEventListener('click', async (e) => {
          const path = e.currentTarget.dataset.path;
          const copyResult = await window.backup.copyText(path);
          if (copyResult.success) {
            setStatus('Caminho copiado.', 'success');
          } else {
            setStatus(`Erro ao copiar caminho: ${copyResult.error}`, 'error');
          }
        });

        itemEl.querySelector('.repeat-btn').addEventListener('click', async (e) => {
          const source = e.currentTarget.dataset.source;
          const dest = e.currentTarget.dataset.dest;
          if (source) {
            const sourceResult = await window.backup.setSourceDir(source);
            if (sourceResult.success) {
              updateSourcePath(sourceResult.path);
            }
          }
          if (dest) {
            const destResult = await window.backup.setDestDir(dest);
            if (destResult.success) {
              updateDestPath(destResult.path);
            }
          }
          clearBackupSummary();
          setStatus('Configuração do histórico aplicada.', 'success');
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
    clearBackupSummary();
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
          clearBackupSummary();
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
          clearBackupSummary();
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
    clearBackupSummary();
    appendProgress(`Nível de compactação alterado para: ${level}`);
  });

  // === CARREGAMENTO DA CONFIGURAÇÃO ===
  const loadConfig = async () => {
    try {
      const config = await window.backup.getConfig();

      updateSourcePath(config.sourceDir || null);
      updateDestPath(config.destDir || null);
      renderIgnoredDirs(config.ignoredDirs);
      applyTheme(config.theme || 'auto');
      if (compressionLevelSelect) {
        compressionLevelSelect.value =
          config.compressionLevel !== undefined ? String(config.compressionLevel) : '1';
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
      updateSourcePath(null);
      updateDestPath(null);
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
        clearBackupSummary();
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
        clearBackupSummary();
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
    } catch (error) {
      console.error('Erro ao pausar/continuar:', error);
    }
  });

  // Cancelar
  cancelButton.addEventListener('click', async () => {
    try {
      cancelButton.disabled = true;
      pauseButton.disabled = true;
      setStatus('Cancelando backup...', 'running');
      appendProgress('Cancelamento solicitado...');
      await window.backup.cancel();
    } catch (error) {
      console.error('Erro ao cancelar:', error);
      cancelButton.disabled = false;
      pauseButton.disabled = false;
    }
  });

  // Iniciar Backup
  triggerButton.addEventListener('click', async () => {
    const sourceDir = currentSourceDir;
    const destDir = currentDestDir;

    if (!sourceDir || !destDir) {
      setStatus('Selecione a pasta de origem e a pasta de destino.', 'error');
      return;
    }

    triggerButton.disabled = true;
    resetProgress();
    clearBackupSummary();
    setStatus('Calculando resumo do backup...', 'running');
    appendProgress('Calculando resumo do backup...');

    try {
      const includeXampp = includeXamppCheckbox ? includeXamppCheckbox.checked : false;
      const previewResult = await window.backup.preview(sourceDir, destDir, includeXampp);

      if (!previewResult.success) {
        setStatus(`Erro: ${previewResult.error}`, 'error');
        return;
      }

      renderBackupSummary(previewResult.summary);

      const shouldContinue = confirm(
        `Executar backup de ${previewResult.summary.totalFiles} arquivos (${formatBytes(
          previewResult.summary.totalSize
        )})?\n\nDestino: ${previewResult.summary.destDir}`
      );

      if (!shouldContinue) {
        setStatus('Backup não iniciado.', 'idle');
        appendProgress('Backup não iniciado pelo usuário.');
        return;
      }

      showControlButtons();
      setPauseButtonVisualState(false);
      pauseButton.disabled = false;
      cancelButton.disabled = false;
      isPaused = false;
      setStatus('Executando backup...', 'running');
      appendProgress('Solicitando backup...');

      const result = await window.backup.start(sourceDir, destDir, includeXampp);
      if (result.success) {
        setStatus('Backup concluído com sucesso!', 'success');
        appendProgress(`Arquivo criado em: ${result.path}`);
        await renderBackupHistory(); // Atualiza a tabela do histórico
      } else {
        setStatus(`Erro: ${result.error}`, 'error');
      }
    } catch (error) {
      setStatus(`Erro ao executar backup: ${error.message}`, 'error');
    } finally {
      triggerButton.disabled = !(currentSourceDir && currentDestDir);
      hideControlButtons();
      pauseButton.disabled = false;
      cancelButton.disabled = false;
      setPauseButtonVisualState(false);
      isPaused = false;
    }
  });
});
