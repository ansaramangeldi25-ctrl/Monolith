// Minimal Express server that proxies uploads to the Python inference helper.
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const upload = multer({ dest: path.join(__dirname, 'uploads/') });
const PYTHON_BIN = process.env.PYTHON_BIN || 'python';

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing.html'));
});

app.use(express.static(__dirname));

async function callPythonWorkflow(imagePath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'inference_client.py');
    const proc = spawn(PYTHON_BIN, [scriptPath, imagePath], { cwd: __dirname });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => { stdout += chunk; });
    proc.stderr.on('data', chunk => { stderr += chunk; });

    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || stdout.trim() || `Python exited with code ${code}`));
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Invalid JSON from python: ${err.message}`));
      }
    });

    proc.on('error', err => reject(err));
  });
}

async function cleanupFile(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (_) {
    // ignore cleanup errors
  }
}

app.post('/api/scan', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });

  const info = {
    filename: req.file.originalname,
    savedAs: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype
  };

  let workflowResult;
  try {
    workflowResult = await callPythonWorkflow(req.file.path);
  } catch (err) {
    workflowResult = { error: err.message };
  } finally {
    cleanupFile(req.file.path);
  }

  res.json({ info, workflowResult });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
