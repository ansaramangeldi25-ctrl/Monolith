"""Small helper to call the Roboflow workflow via inference-sdk.

The script prints JSON to stdout so other runtimes (Node) can consume it.
Environment variables allow overriding the defaults without editing the file.
"""

from __future__ import annotations

import base64
import json
import os
import sys
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List

from inference_sdk import InferenceHTTPClient

try:
  import matplotlib

  matplotlib.use("Agg")
  import matplotlib.pyplot as plt
  from matplotlib import patches
except Exception:  # pragma: no cover - matplotlib is optional
  plt = None

API_URL = os.environ.get("ROBOFLOW_API_URL", "https://serverless.roboflow.com")
API_KEY = os.environ.get("ROBOFLOW_API_KEY", "owWk9BAAmS9SHcNUGfxy")
WORKSPACE = os.environ.get("ROBOFLOW_WORKSPACE", "ansar-rnlir")
WORKFLOW_ID = os.environ.get("ROBOFLOW_WORKFLOW_ID", "detect-count-and-visualize")


def _client() -> InferenceHTTPClient:
  return InferenceHTTPClient(api_url=API_URL, api_key=API_KEY)


def run_remote_workflow(image_path: str) -> dict:
  """Executes the configured workflow for the given image path."""
  client = _client()
  response = client.run_workflow(
      workspace_name=WORKSPACE,
      workflow_id=WORKFLOW_ID,
      images={"image": image_path},
      use_cache=True,
  )
  return response


def _flatten_predictions(workflow_result: Any) -> List[Dict[str, Any]]:
  preds: List[Dict[str, Any]] = []
  if isinstance(workflow_result, list):
    for step in workflow_result:
      preds.extend(_flatten_predictions(step))
    return preds
  if isinstance(workflow_result, dict):
    for value in workflow_result.values():
      if isinstance(value, dict) and "predictions" in value and isinstance(value["predictions"], list):
        preds.extend(value["predictions"])
      elif isinstance(value, (list, dict)):
        preds.extend(_flatten_predictions(value))
  return preds


def _create_overlay(image_path: Path, predictions: List[Dict[str, Any]]) -> str | None:
  if not plt or not predictions:
    return None

  img = plt.imread(image_path)
  fig, ax = plt.subplots(figsize=(img.shape[1] / 100, img.shape[0] / 100), dpi=100)
  ax.imshow(img)
  for pred in predictions:
    try:
      w = float(pred["width"])
      h = float(pred["height"])
      x = float(pred["x"])
      y = float(pred["y"])
    except (KeyError, TypeError, ValueError):
      continue
    rect = patches.Rectangle(
        (x - w / 2, y - h / 2),
        w,
        h,
        linewidth=2,
        edgecolor="tab:blue",
        facecolor="none",
    )
    ax.add_patch(rect)
    label = pred.get("class") or "detection"
    ax.text(x - w / 2, y - h / 2 - 6, label, color="tab:blue", fontsize=8, backgroundcolor=(0, 0, 0, 0.4))
  ax.axis("off")
  fig.tight_layout(pad=0)
  buffer = BytesIO()
  fig.savefig(buffer, format="jpeg", bbox_inches="tight", pad_inches=0)
  plt.close(fig)
  return base64.b64encode(buffer.getvalue()).decode("utf-8")


def main() -> None:
  if len(sys.argv) < 2:
    raise SystemExit("Usage: python inference_client.py path/to/image.jpg")

  image_path = Path(sys.argv[1])
  if not image_path.exists():
    raise SystemExit(f"File not found: {image_path}")

  result = run_remote_workflow(str(image_path))
  try:
    predictions = _flatten_predictions(result.get("workflowResult"))
    overlay = _create_overlay(image_path, predictions)
    if overlay:
      result["docscan_visualization"] = overlay
  except Exception:
    # Overlay generation is best-effort; ignore errors.
    pass
  print(json.dumps(result))


if __name__ == "__main__":
  try:
    main()
  except SystemExit:
    raise
  except Exception as exc:  # pragma: no cover - simple CLI fallback
    # Ensure the caller sees an error message.
    print(json.dumps({"error": str(exc)}))
    sys.exit(1)
