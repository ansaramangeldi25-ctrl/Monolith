// app.js — handles camera, upload, and detection using OpenCV.js + jsQR

let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let logList = document.getElementById('logList');
let stream = null;
let currentImageBitmap = null;

const videoSelect = document.getElementById('videoSelect');
const startCameraBtn = document.getElementById('startCamera');
const stopCameraBtn = document.getElementById('stopCamera');
const captureBtn = document.getElementById('captureBtn');
const fileInput = document.getElementById('fileInput');
const processUploadBtn = document.getElementById('processUpload');
const runDetectBtn = document.getElementById('runDetect');
const clearCanvasBtn = document.getElementById('clearCanvas');

function log(msg) {
  let li = document.createElement('li');
  li.textContent = msg;
  logList.prepend(li);
}

// Populate camera devices
async function enumerateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    videoSelect.innerHTML = '';
    videoDevices.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Camera ${i+1}`;
      videoSelect.appendChild(opt);
    });
  } catch (e) {
    console.warn('Could not enumerate devices:', e);
  }
}

startCameraBtn.addEventListener('click', async () => {
  const deviceId = videoSelect.value || undefined;
  const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' } };
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    startCameraBtn.disabled = true;
    stopCameraBtn.disabled = false;
    captureBtn.disabled = false;
    runDetectBtn.disabled = false;
    log('Camera started');
  } catch (err) {
    console.error(err);
    log('Camera start failed: ' + err.message);
  }
});

stopCameraBtn.addEventListener('click', () => {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    stream = null;
  }
  startCameraBtn.disabled = false;
  stopCameraBtn.disabled = true;
  captureBtn.disabled = true;
  runDetectBtn.disabled = true;
  log('Camera stopped');
});

captureBtn.addEventListener('click', async () => {
  await drawVideoToCanvas();
  // Save current canvas as imageBitmap
  currentImageBitmap = await createImageBitmap(canvas);
  log('Captured image from camera');
});

processUploadBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) { log('No file selected'); return }
  const img = new Image();
  img.onload = async () => {
    resizeCanvasToImage(img.width, img.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    currentImageBitmap = await createImageBitmap(canvas);
    log('Loaded uploaded image');
    runDetectBtn.disabled = false;
  };
  img.src = URL.createObjectURL(file);
});

runDetectBtn.addEventListener('click', async () => {
  if (!currentImageBitmap) {
    // if webcam running, draw video
    if (video && !video.paused && !video.ended) {
      await drawVideoToCanvas();
      currentImageBitmap = await createImageBitmap(canvas);
    } else {
      log('Nothing to run detection on');
      return;
    }
  }
  // draw the currentImageBitmap onto canvas sized properly
  resizeCanvasToImage(currentImageBitmap.width, currentImageBitmap.height);
  ctx.drawImage(currentImageBitmap, 0, 0, canvas.width, canvas.height);
  await runDetections();
});

clearCanvasBtn.addEventListener('click', () => {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  log('Canvas cleared');
});

async function drawVideoToCanvas() {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;
  resizeCanvasToImage(w, h);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
}

function resizeCanvasToImage(w, h) {
  canvas.width = w;
  canvas.height = h;
  // ensure canvas overlays video element visually
  canvas.style.width = video.style.width || '100%';
}

// Wait for OpenCV runtime
function waitForOpenCV() {
  return new Promise((resolve) => {
    if (window.cv && cv.Mat) return resolve(cv);
    cv = window.cv || {};
    cv['onRuntimeInitialized'] = () => {
      log('OpenCV.js loaded');
      resolve(cv);
    };
  });
}

async function runDetections() {
  // Run QR detection first (jsQR)
  const imageData = ctx.getImageData(0,0,canvas.width,canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  clearOverlay();
  if (code) {
    drawPoly(code.location.topLeftCorner, code.location.topRightCorner, code.location.bottomRightCorner, code.location.bottomLeftCorner, 'cyan', 4);
    log(`QR code: ${code.data}`);
  } else {
    log('No QR code found');
  }

  // Contour-based detection via OpenCV
  const cvLib = await waitForOpenCV();
  try {
    let src = cvLib.matFromImageData(imageData);
    let gray = new cvLib.Mat();
    let blurred = new cvLib.Mat();
    let thresh = new cvLib.Mat();

    cvLib.cvtColor(src, gray, cvLib.COLOR_RGBA2GRAY, 0);
    cvLib.GaussianBlur(gray, blurred, new cvLib.Size(5,5), 0);
    cvLib.adaptiveThreshold(blurred, thresh, 255, cvLib.ADAPTIVE_THRESH_GAUSSIAN_C, cvLib.THRESH_BINARY_INV, 25, 9);

    // find contours
    let contours = new cvLib.MatVector();
    let hierarchy = new cvLib.Mat();
    cvLib.findContours(thresh, contours, hierarchy, cvLib.RETR_EXTERNAL, cvLib.CHAIN_APPROX_SIMPLE);

    let foundAny = false;
    for (let i = 0; i < contours.size(); ++i) {
      let cnt = contours.get(i);
      let area = cvLib.contourArea(cnt);
      if (area < 500) { cnt.delete(); continue; } // skip small

      let rect = cvLib.boundingRect(cnt);
      let aspect = rect.width / rect.height;

      // compute perimeter and circularity
      let perimeter = cvLib.arcLength(cnt, true);
      let circularity = 4 * Math.PI * area / (perimeter*perimeter + 1e-6);

      let classification = 'unknown';
      if (circularity > 0.5 && aspect > 0.6 && aspect < 1.6) {
        classification = 'stamp (circular)';
      } else if (aspect > 2.5 && rect.width > 150) {
        classification = 'signature (long)';
      } else if (area > 20000) {
        classification = 'large region (maybe stamp/header)';
      } else {
        classification = 'mark/ink region';
      }

      // Draw rectangle and label
      drawRect(rect.x, rect.y, rect.width, rect.height, classification);
      log(`${classification} — area: ${Math.round(area)}, aspect: ${aspect.toFixed(2)}, circ: ${circularity.toFixed(2)}`);
      cnt.delete();
      foundAny = true;
    }

    if (!foundAny) log('No significant ink regions found');

    // cleanup
    src.delete(); gray.delete(); blurred.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
  } catch (err) {
    console.error('OpenCV error:', err);
    log('OpenCV detection failed: ' + err.message);
  }
}

function clearOverlay() {
  // overlay is same canvas; we keep image underneath and draw overlay lines on top by re-drawing image then overlays.
  // We assume image already drawn; overlays are drawn on top of it.
}

function drawRect(x,y,w,h, label) {
  ctx.lineWidth = Math.max(2, Math.round(Math.min(canvas.width, canvas.height)/300));
  ctx.strokeStyle = 'lime';
  ctx.fillStyle = 'lime';
  ctx.strokeRect(x,y,w,h);
  ctx.font = `${Math.max(12, Math.round(canvas.width/60))}px sans-serif`;
  ctx.fillText(label, x+4, y+Math.min(20, Math.round(canvas.height/30)));
}

function drawPoly(a, b, c, d, color='cyan', width=3) {
  // points are objects with x,y
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.stroke();
}

// On load: enumerate devices
(async () => {
  await enumerateCameras();
  // try again when devices change
  navigator.mediaDevices.addEventListener('devicechange', enumerateCameras);
})();

// When the page is opened with a running camera and video element resizes, keep canvas overlays sized
window.addEventListener('resize', () => {
  // keep canvas width in sync with video element if video has natural size
  if (video.videoWidth && video.videoHeight) resizeCanvasToImage(video.videoWidth, video.videoHeight);
});

// If user clicks on video, capture current frame
video.addEventListener('click', async () => {
  await drawVideoToCanvas();
  currentImageBitmap = await createImageBitmap(canvas);
  log('Captured by clicking video');
});
