window.addEventListener('DOMContentLoaded', () => {
  const triggerButton = document.getElementById('backup-button');
  const statusText = document.getElementById('status');
  const progressList = document.getElementById('progress');
  const progressBar = document.getElementById('progress-bar');
  const progressValue = document.getElementById('progress-value');

  if (
    !triggerButton ||
    !statusText ||
    !progressList ||
    !progressBar ||
    !progressValue ||
    !window.backup
  ) {
    return;
  }

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

  triggerButton.addEventListener('click', async () => {
    triggerButton.disabled = true;
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
    }
  });
});
