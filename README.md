# DocScan.ai — Demo

This workspace contains a small demo showing a landing page and a document scanning workflow (upload PDF/JPG or capture from camera) that sends files to a local backend endpoint and returns detection results.

Files added/updated:

- `landing.html` — attractive landing page (root served by the Node server)
- `workflow.html` — upload / camera workflow UI
- `workflow.js` — front-end logic for uploads, camera capture, and sending files to the backend
- `styles.css` — shared styles (existing)
- `server.js` — small Express server to serve the site and accept uploads at `/api/scan`
- `package.json` — start script and dependencies

Run the demo (Node.js required):

```powershell
# from the project folder c:\Users\Ару\Desktop\test1
npm install
npm start
# Open http://localhost:3000 in your browser
```

Notes:
- `/` serves the landing page. Click "Start Scanning" to open the workflow.
- `/api/scan` accepts a multipart form file field named `file` and returns mock detection JSON (replace with real processing in server.js as needed).
- This is a demo. For production, validate file types, add authentication, scan for malware, and implement real CV processing.

Want me to replace the mock server logic with a real Python/Node-based CV pipeline (e.g., use OpenCV, Tesseract, or a TF model)? I can scaffold that next.
