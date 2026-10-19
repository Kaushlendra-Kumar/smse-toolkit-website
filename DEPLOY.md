# Deploying SMSE AI Toolkit (free)

```
Browser ──► Vercel (Next.js frontend) ──/api/* proxy──► Render (FastAPI + models, Docker)
                         both deploy straight from this GitHub repository
```

Both free tiers are enough (the API container uses ~300 MB RAM; Render's free plan has 512 MB).
Free limits change over time, so check the current terms when signing up.
The free Render service sleeps after ~15 min idle; the next request takes ~1 min to wake it.

## 0. Before you start

- Code pushed to https://github.com/Kaushlendra-Kumar/smse-toolkit-website (`git push`).
- A new Materials Project API key from https://next-gen.materialsproject.org/api.
- **Revoke the old 2023 key** — it is inside `smse-toolkit-website.zip` at the repo root
  (it has been redacted from the git history).

## 1. Backend → Render

1. Sign up at https://render.com with **“GitHub”**.
2. Dashboard → **New** → **Blueprint** → select `smse-toolkit-website`.
   Render reads `render.yaml` and proposes the service `smse-toolkit-api` (plan: Free).
3. When asked for `MP_API_KEY`, paste your Materials Project key → **Apply**.
4. First build takes ~5 min. Then open `https://smse-toolkit-api.onrender.com/api/health`
   (use the URL Render shows if the name was taken) — it should return `"status": "ok"`.

Render redeploys automatically when files under `backend/` change on GitHub.

## 2. Frontend → Vercel

1. Sign up at https://vercel.com with **“Continue with GitHub”**.
2. https://vercel.com/new → **Import** `smse-toolkit-website`.
3. **Root Directory:** `frontend` (click *Edit*). Framework: Next.js (auto-detected).
4. **Environment Variables:** `API_URL` = your Render URL, e.g. `https://smse-toolkit-api.onrender.com`
5. **Deploy** → you get `https://<project>.vercel.app`. Every `git push` redeploys.

The older files at the repo root (`smse-toolkit-website.zip`, `Dragon Real Estates.ipynb`)
and the image dataset are not used by either deployment: Vercel builds only `frontend/`,
and Render builds only `backend/` (its `.dockerignore` excludes `data/`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| “The toolkit API is not reachable” | Render service asleep or building — open the health URL, wait ~1 min, retry. Check `API_URL` on Vercel (no trailing slash), then redeploy Vercel. |
| Materials Explorer: “API key is not configured” | Render → service → *Environment* → set `MP_API_KEY` → *Save* (it redeploys). |
| Render build out of memory / fails | Check the build log; `requirements.txt` must match `backend/models/` (scikit-learn version). |
