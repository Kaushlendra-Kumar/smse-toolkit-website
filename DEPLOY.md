# Deploying SMSE AI Toolkit (free)

```
Browser ──► Vercel (Next.js frontend) ──/api/* proxy──► Hugging Face Space (FastAPI + models)
```

Both tiers are free. Limits change over time, so check the current terms when signing up.
The Space sleeps when idle; the first request afterwards takes ~30–60 s to wake it.

## 0. Before you start

- Accounts: [GitHub](https://github.com), [Hugging Face](https://huggingface.co/join), [Vercel](https://vercel.com/signup) (sign up *with GitHub*).
- A Materials Project API key in `backend/.env` (`MP_API_KEY=...`) from
  https://next-gen.materialsproject.org/api.
- **Revoke the old 2023 key.** It was hard-coded in the 2023 scripts and is still inside
  `smse-toolkit-website.zip` at the repo root (it has been redacted from the git history).
- Trained models in `backend/models/` (`steel.joblib`, `micrograph.onnx`,
  `micrograph_meta.json`) — already committed to the repository.

## 1. Backend → Hugging Face Space

1. Create a **write** token: https://huggingface.co/settings/tokens → *Create new token* → type *Write*.
2. Deploy:
   ```powershell
   cd backend
   $env:HF_TOKEN = "hf_..."          # the token from step 1
   .venv\Scripts\python deploy_space.py
   ```
   This creates `https://huggingface.co/spaces/<you>/smse-toolkit-api`, uploads the
   code and models, and stores `MP_API_KEY` as an encrypted secret.
3. Open the Space page → *Logs* tab and wait for the build (~3–5 min) to show
   `Uvicorn running`. Check `https://<you>-smse-toolkit-api.hf.space/api/health`.

Re-run the same command to redeploy after changes.

## 2. Code → GitHub

The code lives at https://github.com/Kaushlendra-Kumar/smse-toolkit-website.
Push changes with `git push`; Vercel redeploys automatically.

The older files at the repo root (`smse-toolkit-website.zip`, `Dragon Real Estates.ipynb`)
are ignored by both deployments: Vercel builds only `frontend/`, and `deploy_space.py`
uploads only the backend app and models.

## 3. Frontend → Vercel

1. https://vercel.com/new → *Import* `smse-toolkit-website`.
2. **Root Directory:** `frontend` (click *Edit*). Framework preset: Next.js (auto-detected).
3. **Environment Variables:** `API_URL` = `https://<you>-smse-toolkit-api.hf.space`
4. *Deploy*. You get `https://<project>.vercel.app`; every `git push` redeploys.

## Troubleshooting

| Symptom | Fix |
|---|---|
| “The toolkit API is not reachable” | Space is asleep or building — open the Space page, wait, retry. Check `API_URL` on Vercel (no trailing slash). |
| Materials Explorer: “API key is not configured” | Space → *Settings* → *Variables and secrets* → add secret `MP_API_KEY`, then *Restart*. |
| Space build fails on a model file | Make sure all three files exist in `backend/models/` before running `deploy_space.py`. |
