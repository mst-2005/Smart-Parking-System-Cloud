# ParkSpot+ Cloud 🅿️⚡

**ParkSpot+ Cloud** is a lightweight, single-process, cloud-deployable edition of the Smart City Parking System. Designed for high availability, zero configuration overhead, and seamless deployment on modern cloud platforms (Render, Vercel, Railway, GCP Cloud Run, Heroku, AWS, Docker).

---

## 🚀 Key Improvements & Architecture

| Feature | Legacy Local App | ParkSpot+ Cloud |
| :--- | :--- | :--- |
| **Process Model** | 3 separate servers (Ports 3001, 8000, 5173) | **1 Single Node Process** (`PORT` variable) |
| **AI Engine** | Heavy Python (FastAPI + CatBoost + Scikit-Learn ~1.5GB RAM) | **Native JS AI Machine Learning Engine** (<50MB RAM) |
| **API Endpoints** | Hardcoded `http://localhost:3001` / `:8000` | Relative `/api` endpoints (HTTPS & custom domain ready) |
| **Deployment** | Requires local bash script & Python venv | **Single-command build & containerized Cloud deploy** |
| **Docker Size** | N/A | **~100 MB Alpine Image** |

---

## ⚙️ Quick Start (Local)

### Prerequisites
* [Node.js](https://nodejs.org/en/) (v18.x or higher)

### 1-Step Build & Run
```bash
# Navigate into the cloud app directory
cd smart-city-parking-cloud

# Install root backend dependencies
npm install

# Build frontend and start unified server
npm run build
npm start
```
Open **`http://localhost:3000`** in your browser!

---

## ☁️ Cloud Deployment Options

### 🐳 1. Docker / GCP Cloud Run / Fly.io / AWS App Runner
Build and run the lightweight Docker container:
```bash
docker build -t parkspot-cloud .
docker run -p 3000:3000 parkspot-cloud
```
* **GCP Cloud Run**: `gcloud run deploy --source .`
* **Fly.io**: `fly launch`

---

### 🟣 2. Render.com
1. Connect your repository to Render.
2. Select **Web Service**.
3. Render automatically picks up `render.yaml` or set:
   * **Build Command**: `npm run build`
   * **Start Command**: `npm start`

---

### ▲ 3. Vercel
1. Run `vercel` in the root of `smart-city-parking-cloud`.
2. Vercel automatically deploys using the included `vercel.json` routing configuration.

---

### 🚂 4. Railway / Heroku
1. Push to Railway / Heroku.
2. The included `Procfile` (`web: npm start`) will automatically boot the server on `$PORT`.

---

## 🔑 Demo Credentials

* **User Login**: `user@gmail.com` / `user123`
* **Admin Dashboard**: `admin@gmail.com` / `admin123`

---

## 📂 Project Structure

```
smart-city-parking-cloud/
├── server.js              # Express server (Serves API + React SPA)
├── ai-engine.js           # Native JS Machine Learning & Sensor Fusion Engine
├── package.json           # Root package & deployment scripts
├── Dockerfile             # Multi-stage Docker production build
├── render.yaml            # Render deployment blueprint
├── vercel.json            # Vercel deployment configuration
├── Procfile               # Heroku/Railway process entrypoint
├── data/
│   ├── db.json            # Persistent JSON database (Users, Bookings, Pricing, Zones)
│   └── occupancy_data.json# Pre-computed IoT sensor analytics dataset
└── frontend/
    ├── src/               # React UI Application
    │   ├── api.js         # Relative /api dynamic client
    │   └── App.jsx        # Full-featured parking UI
    └── vite.config.js     # Build pipeline (outputs directly to ../public)
```
