# SMSE AI Toolkit API — container for Render (see render.yaml) or any container host.
# Build context: backend/. The trained models in models/ are committed to the repo.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN useradd --create-home --uid 1000 app
WORKDIR /home/app/api

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY --chown=app:app app ./app
COPY --chown=app:app models/steel.joblib models/micrograph.onnx models/micrograph_meta.json ./models/

USER app
# Hosts like Render inject PORT; default to 8000 elsewhere.
ENV PORT=8000
EXPOSE 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers
