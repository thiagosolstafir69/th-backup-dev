window.addEventListener('DOMContentLoaded', async () => {
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
    return;
  }

  let isBackupRunning = false;
  let isPaused = false;
  let currentSourceDir = null;
  let currentDestDir = null;

  const setPauseButtonVisualState = (pausedState) => {
    if (pausedState) {
      pauseButton.textContent = 'Continuar';
      pauseButton.classList.remove('button-warning');
      pauseButton.classList.add('button-success');
    } else {
      pauseButton.textContent = 'Pausar';
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

  /**
   * Atualiza a exibição do caminho de origem
   * @param {string|null} path - Caminho a ser exibido
   */
  const updateSourcePath = (path) => {
    currentSourceDir = path;
    if (path) {
      sourcePathElement.textContent = path;
      sourcePathElement.classList.remove('empty');
    } else {
      sourcePathElement.textContent = 'Não configurada';
      sourcePathElement.classList.add('empty');
    }
    updateBackupButtonState();
  };

  /**
   * Atualiza a exibição do caminho de destino
   * @param {string|null} path - Caminho a ser exibido
   */
  const updateDestPath = (path) => {
    currentDestDir = path;
    if (path) {
      destPathElement.textContent = path;
      destPathElement.classList.remove('empty');
    } else {
      destPathElement.textContent = 'Não configurada';
      destPathElement.classList.add('empty');
    }
    updateBackupButtonState();
  };

  /**
   * Atualiza o estado do botão de backup baseado na configuração
   */
  const updateBackupButtonState = () => {
    // Sempre habilitado pois temos valores padrão
    triggerButton.disabled = false;
    triggerButton.title = '';
  };

  /**
   * Carrega a configuração salva ou usa valores padrão
   */
  const loadConfig = async () => {
    try {
      const config = await window.backup.getConfig();
      // Sempre mostra os valores padrão se não houver configuração
      const sourceDir = config.sourceDir || '/Users/thiago/Developer';
      const destDir =
        config.destDir ||
        '/Users/thiago/Library/CloudStorage/GoogleDrive-thiagowip@gmail.com/Meu Drive/Backup-developer';
      
      updateSourcePath(sourceDir);
      updateDestPath(destDir);
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
      // Em caso de erro, usa valores padrão
      updateSourcePath('/Users/thiago/Developer');
      updateDestPath(
        '/Users/thiago/Library/CloudStorage/GoogleDrive-thiagowip@gmail.com/Meu Drive/Backup-developer'
      );
    }
  };

  // Carrega configuração ao iniciar
  await loadConfig();
  hideControlButtons();

  const appendProgress = (message) => {
    const item = document.createElement('li');
    item.textContent = message;
    progressList.prepend(item);
  };

  const setProgress = (percent) => {
    const value =
      typeof percent === 'number' ? Math.max(0, Math.min(percent, 100)) : 0;
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
    statusText.textContent = message;
    statusText.dataset.state = type;
  };

  const resetProgress = () => {
    progressList.innerHTML = '';
    setProgress(0);
  };

  // Handler para selecionar pasta de origem
  selectSourceButton.addEventListener('click', async () => {
    try {
      const result = await window.backup.selectSourceDir();
      if (result.success) {
        updateSourcePath(result.path);
        setStatus('Pasta de origem configurada', 'success');
      }
    } catch (error) {
      console.error('Erro ao selecionar pasta de origem:', error);
      setStatus(`Erro ao selecionar pasta: ${error.message}`, 'error');
    }
  });

  // Handler para selecionar pasta de destino
  selectDestButton.addEventListener('click', async () => {
    try {
      const result = await window.backup.selectDestDir();
      if (result.success) {
        updateDestPath(result.path);
        setStatus('Pasta de destino configurada', 'success');
      }
    } catch (error) {
      console.error('Erro ao selecionar pasta de destino:', error);
      setStatus(`Erro ao selecionar pasta: ${error.message}`, 'error');
    }
  });

  pauseButton.addEventListener('click', async () => {
    try {
      const result = await window.backup.togglePause();
      isPaused = result.isPaused;
      setPauseButtonVisualState(isPaused);
    } catch (error) {
      console.error('Erro ao pausar/continuar:', error);
    }
  });

  cancelButton.addEventListener('click', async () => {
    try {
      await window.backup.cancel();
      setStatus('Backup cancelado pelo usuário', 'error');
      appendProgress('❌ Backup cancelado');
      hideControlButtons();
      setPauseButtonVisualState(false);
      triggerButton.disabled = false;
      isBackupRunning = false;
      isPaused = false;
      updateBackupButtonState();
    } catch (error) {
      console.error('Erro ao cancelar:', error);
    }
  });

  triggerButton.addEventListener('click', async () => {
    // Usa valores padrão se não houver configuração
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
    appendProgress('Solicitando backup...');

    try {
      const result = await window.backup.start(sourceDir, destDir);
      if (result.success) {
        setStatus('Backup concluído com sucesso!', 'success');
        appendProgress(`Arquivo criado em: ${result.path}`);
      } else {
        setStatus(`Erro: ${result.error}`, 'error');
      }
    } catch (error) {
      setStatus(`Erro ao executar backup: ${error.message}`, 'error');
    } finally {
      triggerButton.disabled = false;
      hideControlButtons();
      setPauseButtonVisualState(false);
      isBackupRunning = false;
      isPaused = false;
      updateBackupButtonState();
    }
  });
});
