# SMSE AI Toolkit v2

AI tools for materials science, rebuilt from the 2023 B.Tech thesis
*“SMSE AI Toolkit: Material Class and Properties Prediction”* (School of Materials
Science and Engineering, NIT Calicut — Peeyush Mishra, Kaushlendra Kumar, Pawe
Dhananjay Manohar, Sushil Kumar Kumhar; guide Dr. Devendra K. Yadav). The thesis
is in [docs/](docs/SMSE_AI_Toolkit_Thesis_2023.pdf); the original Django code is
the first commit of this repository.

| Tool | What it does | How |
|---|---|---|
| **Micrograph Recognition** | Classifies SEM images into 10 nanoscience categories | ConvNeXt-Tiny fine-tuned on the NFFA-EUROPE SEM dataset (PyTorch), served with ONNX Runtime |
| **Steel Property Prediction** | 0.2% proof stress, tensile strength, elongation, reduction in area from composition + temperature, with uncertainty | Extra-Trees ensembles (scikit-learn) on NIMS MatNavi data, validated on unseen alloys |
| **Materials Explorer** | Search Materials Project by band gap, elasticity, magnetism, dielectric, piezoelectric and surface properties | Materials Project REST API |
| **Periodic Table** | Element data, links into the explorer | Static data |
| **Citation Generator** | DOI / title / manual entry → IEEE, APA, MLA, Chicago/Turabian, Harvard, Vancouver, BibTeX | Crossref + doi.org metadata, formatted with citation-js (citeproc-js) |

## Stack

```
frontend/   Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Recharts · citation-js
backend/    FastAPI · scikit-learn · ONNX Runtime · httpx
  app/        API (routers: materials, steel, micrograph, citations)
  ml/steel/        training script for steel models
  ml/micrograph/   dataset download + CNN training + ONNX export
  models/     trained artifacts (generated, not committed)
```

The frontend proxies `/api/*` to the backend (`next.config.ts`), so the browser only talks to one origin.

## Run it locally (Windows)

Prerequisites: Python 3.10+, Node 20+, pnpm.

```powershell
# 1. Backend
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env          # then put your Materials Project key in MP_API_KEY
.venv\Scripts\python -m ml.steel.train          # ~10 s, writes models/steel.joblib
.venv\Scripts\python -m uvicorn app.main:app --port 8000

# 2. Frontend (new terminal)
cd frontend
pnpm install
pnpm dev                        # http://localhost:3000
```

API docs: http://localhost:8000/docs

### Training the micrograph model (optional, needs ~2 GB disk and ideally an NVIDIA GPU)

```powershell
cd backend
.venv\Scripts\python -m pip install -r requirements-train.txt --index-url https://download.pytorch.org/whl/cu126 --extra-index-url https://pypi.org/simple
.venv\Scripts\python -m ml.micrograph.download   # ~11.5 GB fetched, stored downscaled (<1 GB)
.venv\Scripts\python -m ml.micrograph.train      # writes models/micrograph.onnx + micrograph_meta.json
```

Notes on the method:
- Images are stored at a 320 px short side; training runs at 224 px.
- The SEM data panel (scale bar, magnification, kV) at the bottom of each image is
  cropped before training and inference, so the model learns morphology rather than
  reading the instrument text.
- Random flips and 90° rotations replace the thesis's offline “data explosion”.
- Class-weighted loss handles the ~30× class imbalance; the reported numbers come
  from a stratified held-out test split never used for model selection.

### Tests

```powershell
cd backend;  .venv\Scripts\python -m pytest
cd frontend; pnpm lint; pnpm build
```

## Data and licences

- **NFFA-EUROPE SEM dataset** — Aversa et al., *Sci. Data* 5, 180172 (2018), CC-BY 4.0.
- **NIMS MatNavi low-alloy steel data** — via [Kaggle](https://www.kaggle.com/datasets/konghuanqing/matnavi-mechanical-properties-of-lowalloy-steels); `backend/data/raw/low_alloy_steels.csv`.
- **Materials Project** — Jain et al., *APL Materials* 1, 011002 (2013). Requires a free API key.
- **CSL styles** (`frontend/public/csl/`) — CC BY-SA 3.0, Citation Style Language project.
- **Element data** — [Periodic-Table-JSON](https://github.com/Bowserinator/Periodic-Table-JSON), CC BY-SA 3.0.
