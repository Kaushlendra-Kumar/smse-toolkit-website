# Deploying SMSE AI Toolkit (free, no credit card)

The whole site deploys to **Vercel** from this GitHub repository — no separate backend server:

```
Browser ──► Vercel
             ├─ static pages + model files (public/models, public/ort)
             │    • Micrograph CNN runs in the browser (ONNX Runtime Web) — images never leave the device
             │    • Steel tree ensembles run in the browser (src/lib/steel-model.ts)
             └─ Route Handlers (src/app/api) — serverless functions
                  • /api/materials/*  → Materials Project (API key kept server-side)
                  • /api/citations/*  → doi.org / Crossref
```

Vercel's Hobby plan is free for non-commercial use and needs no card. Limits change over time,
so check the current terms when signing up. The Python `backend/` folder is only for training
models and local development; it is not deployed.

## Steps

1. Get a new Materials Project API key: https://next-gen.materialsproject.org/api
   (and **revoke the old 2023 key** — it is inside `smse-toolkit-website.zip` at the repo root).
2. Sign up at https://vercel.com with **“Continue with GitHub”**.
3. https://vercel.com/new → **Import** `smse-toolkit-website`.
4. **Root Directory:** `frontend` (click *Edit*). Framework preset: Next.js (auto-detected).
5. **Environment Variables:**
   - `MP_API_KEY` = your Materials Project key
   - `CROSSREF_MAILTO` = your email (optional; Crossref etiquette, faster responses)
6. **Deploy** → `https://<project>.vercel.app`. Every `git push` to `main` redeploys.

The repository's other contents (the image dataset, `smse-toolkit-website.zip`,
`Dragon Real Estates.ipynb`, `backend/`) are not part of the deployment: Vercel builds only `frontend/`.

## Updating the models

Retrain in `backend/` (see README). The training scripts write the browser models straight into
`frontend/public/models/`; commit and push, and Vercel redeploys.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Materials Explorer: “API key is not configured” | Vercel → Project → *Settings* → *Environment Variables* → add `MP_API_KEY` → *Deployments* → *Redeploy*. |
| Micrograph page stuck on “Analysing…” the first time | The model (~17 MB) and runtime (~14 MB) load once, then the browser caches them. Slow connections take a while. |
| “This browser can't read that image format” | Convert TIFF micrographs to PNG/JPG first (browsers can't decode TIFF). |

## Optional: run the Python API instead

`backend/` still contains the FastAPI version of the API and a `Dockerfile`, e.g. for a
university server. The website itself no longer needs it.
