// Workflow interactions: upload preview, toggle JSON/visual views, copy JSON.

const fileInput = document.getElementById('fileInput');
const scanBtn = document.getElementById('scanBtn');
const previewImg = document.getElementById('uploadPreview');
const previewPlaceholder = document.getElementById('previewPlaceholder');
const jsonOutput = document.getElementById('jsonOutput');
const visualOutput = document.getElementById('visualOutput');
const visualImage = document.getElementById('visualImage');
const visualPlaceholder = document.getElementById('visualPlaceholder');
const resultStatus = document.getElementById('resultStatus');
const copyJsonBtn = document.getElementById('copyJsonBtn');
const viewButtons = document.querySelectorAll('.view-toggle .btn');

let currentResult = null;
let activeView = 'json';
let copyTimeout = null;

function setStatus(message) {
  resultStatus.textContent = message;
}

function setActiveView(view) {
  activeView = view;
  viewButtons.forEach(btn => {
    const isActive = btn.dataset.view === view;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });
  if (view === 'json') {
    jsonOutput.classList.remove('hidden');
    visualOutput.classList.add('hidden');
  } else {
    jsonOutput.classList.add('hidden');
    visualOutput.classList.remove('hidden');
  }
}

function updateJsonOutput(payload) {
  if (!payload) {
    jsonOutput.textContent = 'No scan yet.';
    return;
  }
  jsonOutput.textContent = JSON.stringify(payload, null, 2);
}

function extractLabelVisualization(payload) {
  if (!payload || !payload.workflowResult) return null;
  const { workflowResult } = payload;
  if (typeof workflowResult.label_visualization === 'string') return workflowResult.label_visualization;
  if (workflowResult.output && typeof workflowResult.output.label_visualization === 'string') {
    return workflowResult.output.label_visualization;
  }
  if (workflowResult.visualizations && typeof workflowResult.visualizations.label === 'string') {
    return workflowResult.visualizations.label;
  }
  return null;
}

function updateVisualOutput(payload) {
  const base64 = extractLabelVisualization(payload);
  if (base64) {
    visualPlaceholder.textContent = '';
    visualImage.src = `data:image/jpeg;base64,${base64}`;
    visualImage.classList.add('visible');
  } else {
    visualImage.removeAttribute('src');
    visualImage.classList.remove('visible');
    visualPlaceholder.textContent = 'Response did not include a label visualization.';
  }
}

function showPreview(file) {
  if (!file) {
    previewImg.removeAttribute('src');
    previewImg.classList.remove('visible');
    previewPlaceholder.textContent = 'Awaiting file';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    previewImg.src = reader.result;
    previewImg.classList.add('visible');
    previewPlaceholder.textContent = 'Ready to analyze';
  };
  reader.readAsDataURL(file);
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  showPreview(file);
});

viewButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    setActiveView(btn.dataset.view);
  });
});

copyJsonBtn.addEventListener('click', async () => {
  if (!currentResult) {
    setStatus('Nothing to copy yet.');
    return;
  }
  const text = JSON.stringify(currentResult, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    copyJsonBtn.textContent = 'Copied';
    copyJsonBtn.disabled = true;
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      copyJsonBtn.textContent = 'Copy JSON';
      copyJsonBtn.disabled = false;
    }, 1500);
  } catch (err) {
    setStatus('Clipboard unavailable: ' + err.message);
  }
});

scanBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    setStatus('Please select a JPEG or PNG first.');
    return;
  }
  const payload = new FormData();
  payload.append('file', file, file.name);

  scanBtn.disabled = true;
  scanBtn.textContent = 'Analyzing...';
  setStatus('Uploading and analyzing...');
  currentResult = null;
  updateJsonOutput(null);
  updateVisualOutput(null);

  try {
    const res = await fetch('/api/scan', { method: 'POST', body: payload });
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const json = await res.json();
    currentResult = json;
    setStatus('Scan complete · JSON view ready.');
    updateJsonOutput(json);
    updateVisualOutput(json);
  } catch (err) {
    currentResult = null;
    updateJsonOutput(null);
    updateVisualOutput(null);
    setStatus('Error: ' + err.message);
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = 'Analyze';
  }
});

setActiveView(activeView);
