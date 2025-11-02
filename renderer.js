window.addEventListener('DOMContentLoaded', () => {
  const triggerButton = document.getElementById('backup-button');
  const pauseButton = document.getElementById('pause-button');
  const cancelButton = document.getElementById('cancel-button');
  const statusText = document.getElementById('status');
  const progressList = document.getElementById('progress');
  const progressBar = document.getElementById('progress-bar');
  const progressValue = document.getElementById('progress-value');

  if (
    !triggerButton ||
    !pauseButton ||
    !cancelButton ||
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
    statusText.textContent = message;
    statusText.dataset.state = type;
  };
  const resetProgress = () => {
    progressList.innerHTML = '';
    setProgress(0);
  };

  pauseButton.addEventListener('click', async () => {
    try {
      const result = await window.backup.togglePause();
      isPaused = result.isPaused;
      
      if (isPaused) {
        pauseButton.textContent = 'Continuar';
        pauseButton.style.backgroundColor = '#34c759';
        pauseButton.style.borderColor = '#34c759';
      } else {
        pauseButton.textContent = 'Pausar';
        pauseButton.style.backgroundColor = '#ff9500';
        pauseButton.style.borderColor = '#ff9500';
      }
    } catch (error) {
      console.error('Erro ao pausar/continuar:', error);
    }
  });

  cancelButton.addEventListener('click', async () => {
    try {
      await window.backup.cancel();
      setStatus('Backup cancelado pelo usuário', 'error');
      appendProgress('❌ Backup cancelado');
      pauseButton.style.display = 'none';
      cancelButton.style.display = 'none';
      triggerButton.disabled = false;
      isBackupRunning = false;
      isPaused = false;
    } catch (error) {
      console.error('Erro ao cancelar:', error);
    }
  });

  triggerButton.addEventListener('click', async () => {
    triggerButton.disabled = true;
    pauseButton.style.display = 'block';
    cancelButton.style.display = 'block';
    pauseButton.textContent = 'Pausar';
    pauseButton.style.backgroundColor = '#ff9500';
    pauseButton.style.borderColor = '#ff9500';
    isPaused = false;
    isBackupRunning = true;
    resetProgress();
    setStatus('Executando backup...', 'running');
    appendProgress('Solicitando backup...');

    try {
      const result = await window.backup.start();
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
      pauseButton.style.display = 'none';
      cancelButton.style.display = 'none';
      isBackupRunning = false;
      isPaused = false;
    }
  });
});
