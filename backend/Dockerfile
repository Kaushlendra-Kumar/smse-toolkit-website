# SMSE AI Toolkit API — container for Hugging Face Spaces (Docker SDK) or any container host.
# Build context: backend/. Trained models must exist in models/ (steel.joblib,
# micrograph.onnx, micrograph_meta.json) — see DEPLOY.md.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Hugging Face Spaces run containers as uid 1000.
RUN useradd --create-home --uid 1000 app
WORKDIR /home/app/api

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY --chown=app:app app ./app
COPY --chown=app:app models/steel.joblib models/micrograph.onnx models/micrograph_meta.json ./models/

USER app
EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--proxy-headers"]
