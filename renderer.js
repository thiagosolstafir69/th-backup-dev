window.addEventListener('DOMContentLoaded', async () => {
  const DEFAULT_SOURCE_DIR = '/Users/thiago/Developer';
  const DEFAULT_DEST_DIR =
    '/Users/thiago/Library/CloudStorage/GoogleDrive-thiagowip@gmail.com/Meu Drive/Backup-developer';

  const triggerButton = document.getElementById('backup-button');
  const pauseButton = document.getElementById('pause-button');
  const cancelButton = document.getElementById('cancel-button');
  const selectSourceButton = document.getElementById('select-source-button');
  const selectDestButton = document.getElementById('select-dest-button');
  const sourcePathElement = document.getElementById('source-path');
  const destPathElement = document.getElementById('dest-path');
  const statusText = document.getElementById('status');
  const progressList = document.getElementById('progress');
  const progressBar = document.getElementById('progress-bar');
  const progressValue = document.getElementById('progress-value');
  const includeXamppCheckbox = document.getElementById('include-xampp-checkbox');
  const statusChipText = document.getElementById('status-chip-text');
  const heroStateLabel = document.getElementById('hero-state-label');
  const progressStage = document.getElementById('progress-stage');
  const selectionSummary = document.getElementById('selection-summary');
  const controlTip = document.getElementById('control-tip');
  const xamppState = document.getElementById('xampp-state');
  const heroSummaryText = document.getElementById('hero-summary-text');
  const logEmptyState = document.getElementById('log-empty-state');

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
    !includeXamppCheckbox ||
    !window.backup
  ) {
    return;
  }

  const STATUS_META = {
    idle: {
      chip: 'Pronto',
      title: 'v1.1.15',
      stage: 'Nenhuma operação ativa',
      helper: 'O status e os próximos passos do processo aparecem neste painel.'
    },
    running: {
      chip: 'Executando',
      title: 'Backup em andamento',
      stage: 'Aguardando eventos do processo',
      helper: 'Pausa e cancelamento ficam disponíveis enquanto o ZIP é montado.'
    },
    success: {
      chip: 'Concluído',
      title: 'Backup finalizado',
      stage: 'Processo encerrado',
      helper: 'O arquivo foi salvo com sucesso no destino configurado.'
    },
    error: {
      chip: 'Erro',
      title: 'Intervenção necessária',
      stage: 'Processo interrompido',
      helper: 'Revise a mensagem mais recente e tente novamente.'
    }
  };

  let isBackupRunning = false;
  let isPaused = false;
  let currentSourceDir = DEFAULT_SOURCE_DIR;
  let currentDestDir = DEFAULT_DEST_DIR;

  const shortenPath = (value) => value.replace(/^\/Users\/thiago/, '~');

  const getPathLabel = (value, fallback) => {
    if (!value) {
      return fallback;
    }

    const parts = value.replace(/\/+$/, '').split('/').filter(Boolean);
    return parts[parts.length - 1] || fallback;
  };

  const syncSelections = () => {
    const includeXampp = includeXamppCheckbox.checked;

    const sourcePathSpan = sourcePathElement.querySelector('span') || sourcePathElement;
    const destPathSpan = destPathElement.querySelector('span') || destPathElement;

    sourcePathSpan.textContent = currentSourceDir;
    sourcePathElement.classList.toggle('empty', !currentSourceDir);
    destPathSpan.textContent = currentDestDir;
    destPathElement.classList.toggle('empty', !currentDestDir);

    if (selectionSummary) {
      selectionSummary.textContent = `${getPathLabel(currentSourceDir, 'Origem')} -> ${getPathLabel(
        currentDestDir,
        'Destino'
      )}`;
    }

    if (controlTip) {
      controlTip.textContent = `Destino atual: ${shortenPath(currentDestDir)}`;
    }

    if (xamppState) {
      xamppState.textContent = includeXampp ? 'XAMPP ativado' : 'XAMPP desativado';
    }
  };

  const updatePrimaryButton = () => {
    triggerButton.disabled = isBackupRunning;
    triggerButton.textContent = isBackupRunning ? 'Backup em andamento' : 'Iniciar backup';
  };

  const showControlButtons = () => {
    pauseButton.hidden = false;
    cancelButton.hidden = false;
  };

  const hideControlButtons = () => {
    pauseButton.hidden = true;
    cancelButton.hidden = true;
  };

  const setPauseButtonVisualState = (pausedState) => {
    if (pausedState) {
      pauseButton.textContent = 'Continuar';
      pauseButton.classList.remove('button-warning');
      pauseButton.classList.add('button-success');
      if (statusChipText) {
        statusChipText.textContent = 'Pausado';
      }
      if (heroStateLabel) {
        heroStateLabel.textContent = 'Pausa manual';
      }
      if (progressStage) {
        progressStage.textContent = 'Operação pausada';
      }
    } else {
      pauseButton.textContent = 'Pausar';
      pauseButton.classList.remove('button-success');
      pauseButton.classList.add('button-warning');
    }
  };

  const setProgress = (percent) => {
    const value = typeof percent === 'number' ? Math.max(0, Math.min(percent, 100)) : 0;
    progressBar.style.width = `${value}%`;
    progressValue.textContent = `${value}%`;
  };

  const resetProgress = () => {
    progressList.innerHTML = '';
    setProgress(0);

    if (progressStage) {
      progressStage.textContent = STATUS_META.idle.stage;
    }
    if (logEmptyState) {
      logEmptyState.hidden = false;
    }
  };

  const setStatus = (message, type = 'idle') => {
    const meta = STATUS_META[type] || STATUS_META.idle;

    document.body.dataset.appState = type;
    const statusSpan = statusText.querySelector('span') || statusText;
    statusSpan.textContent = message;
    statusText.dataset.state = type;

    if (statusChipText) {
      statusChipText.textContent = isPaused && type === 'running' ? 'Pausado' : meta.chip;
    }
    if (heroStateLabel) {
      heroStateLabel.textContent = isPaused && type === 'running' ? 'Pausa manual' : meta.title;
    }
    if (progressStage && !isPaused) {
      progressStage.textContent = meta.stage;
    }
    if (heroSummaryText) {
      heroSummaryText.textContent = meta.helper;
    }
  };

  const appendProgress = (message) => {
    const item = document.createElement('li');
    const stamp = document.createElement('span');
    const copy = document.createElement('span');

    stamp.className = 'log-stamp';
    stamp.textContent = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    copy.className = 'log-copy';
    copy.textContent = message;

    item.append(stamp, copy);
    progressList.prepend(item);

    if (logEmptyState) {
      logEmptyState.hidden = true;
    }
  };

  const loadConfig = async () => {
    try {
      const config = await window.backup.getConfig();
      currentSourceDir = config.sourceDir || DEFAULT_SOURCE_DIR;
      currentDestDir = config.destDir || DEFAULT_DEST_DIR;
    } catch (error) {
      currentSourceDir = DEFAULT_SOURCE_DIR;
      currentDestDir = DEFAULT_DEST_DIR;
      console.error('Erro ao carregar configuração:', error);
    }

    syncSelections();
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

    if (message.text && progressStage) {
      progressStage.textContent = message.text;
    }

    if (message.text && message.type !== 'progress') {
      appendProgress(message.text);
    }
  });

  includeXamppCheckbox.addEventListener('change', () => {
    syncSelections();
  });

  selectSourceButton.addEventListener('click', async () => {
    try {
      const result = await window.backup.selectSourceDir();
      if (result.success) {
        currentSourceDir = result.path;
        syncSelections();
        setStatus('Origem configurada com sucesso.', 'success');
      }
    } catch (error) {
      console.error('Erro ao selecionar pasta de origem:', error);
      setStatus(`Erro ao selecionar a origem: ${error.message}`, 'error');
    }
  });

  selectDestButton.addEventListener('click', async () => {
    try {
      const result = await window.backup.selectDestDir();
      if (result.success) {
        currentDestDir = result.path;
        syncSelections();
        setStatus('Destino configurado com sucesso.', 'success');
      }
    } catch (error) {
      console.error('Erro ao selecionar pasta de destino:', error);
      setStatus(`Erro ao selecionar o destino: ${error.message}`, 'error');
    }
  });

  pauseButton.addEventListener('click', async () => {
    try {
      const result = await window.backup.togglePause();
      isPaused = result.isPaused;
      setPauseButtonVisualState(isPaused);

      if (!isPaused) {
        setStatus('Backup retomado.', 'running');
      }
    } catch (error) {
      console.error('Erro ao pausar/continuar:', error);
    }
  });

  cancelButton.addEventListener('click', async () => {
    try {
      await window.backup.cancel();
      isBackupRunning = false;
      isPaused = false;
      hideControlButtons();
      setPauseButtonVisualState(false);
      updatePrimaryButton();
      setStatus('Backup cancelado pelo usuário.', 'error');
      appendProgress('Backup cancelado');
    } catch (error) {
      console.error('Erro ao cancelar:', error);
    }
  });

  triggerButton.addEventListener('click', async () => {
    isBackupRunning = true;
    isPaused = false;
    updatePrimaryButton();
    showControlButtons();
    setPauseButtonVisualState(false);
    resetProgress();
    setStatus('Executando backup...', 'running');
    appendProgress('Solicitando backup...');

    try {
      const result = await window.backup.start(
        currentSourceDir,
        currentDestDir,
        includeXamppCheckbox.checked
      );

      if (result.success) {
        setStatus('Backup concluído com sucesso!', 'success');
        appendProgress(`Arquivo criado em: ${result.path}`);
      } else {
        setStatus(`Erro: ${result.error}`, 'error');
      }
    } catch (error) {
      setStatus(`Erro ao executar backup: ${error.message}`, 'error');
    } finally {
      isBackupRunning = false;
      isPaused = false;
      hideControlButtons();
      setPauseButtonVisualState(false);
      updatePrimaryButton();
    }
  });

  await loadConfig();
  updatePrimaryButton();
  hideControlButtons();
  resetProgress();
  setStatus('Aguardando ação.', 'idle');
});
