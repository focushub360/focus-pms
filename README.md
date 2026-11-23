# TaskBoard — Sales & Marketing Performance Management System

Production-ready enterprise Performance Management System (PMS) and TaskBoard. Built with FastAPI, MongoDB, and React. Responsive across Web, Mobile, and Desktop.

---

## 🏛 Architecture Overview

- **Backend (`/backend`)**: FastAPI, Motor (Async MongoDB), PyJWT authentication, bcrypt password hashing, Gunicorn + Uvicorn workers.
- **Frontend (`/frontend`)**: React 19, React Router 7, Tailwind CSS, Lucide icons, Sonner notifications, Recharts. Fully responsive with mobile bottom thumb bar, slide-over drawer, and adaptive layouts.
- **Database**: MongoDB (Atlas or self-hosted) with connection pooling and comprehensive index coverage.
- **Deployment**:
  - **Backend API**: Render (Web Service / Docker)
  - **Frontend UI**: Netlify (Static SPA with automatic redirects)

---

## 🚀 Quick Deployment Guide

### Step 1: MongoDB Database (Production Ready)

TaskBoard requires a MongoDB 6.0+ or MongoDB Atlas cluster.

1. **Create MongoDB Atlas Cluster**:
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and create a free or dedicated cluster.
   - In **Database Access**, create a user with read/write access (e.g. `pms_admin`).
   - In **Network Access**, add an IP access rule: `0.0.0.0/0` (Allow access from anywhere, required for Render dynamic IP egress).
2. **Obtain Connection String**:
   - Click **Connect** → **Drivers** (Python).
   - Copy connection URI, for example:
     ```
     mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/focus_pms?retryWrites=true&w=majority
     ```
3. **Database Readiness Features Included**:
   - **Connection Pooling**: Pre-configured with min 5, max 50 connections and socket timeouts.
   - **Automated Startup Indexing**: Automatically creates 17+ essential performance and uniqueness indexes on boot (`db_indexes.py`).
   - **Active Ping Healthcheck**: `/health` actively pings MongoDB and reports database health.
   - **Idempotent Seeding**: Automatically initializes Super Admin, seed team, roles, and default FY2026-27 KPIs without duplicating records.

---

### Step 2: Deploy Backend to Render

You can deploy the backend to Render in minutes using the pre-configured `render.yaml` or manually.

#### Option A: 1-Click Render Blueprint
1. Push this repository to GitHub/GitLab.
2. In [Render Dashboard](https://dashboard.render.com), click **New** → **Blueprint**.
3. Select your repository. Render reads `render.yaml` and configures the web service automatically.
4. Fill in the required environment variables:
   - `MONGO_URL`: Your MongoDB Atlas URI.
   - `APP_PUBLIC_URL`: URL of your Netlify frontend (e.g. `https://focus-pms.netlify.app`).

#### Option B: Manual Web Service on Render
1. Click **New** → **Web Service** → Connect your repository.
2. Configure settings:
   - **Name**: `focus-pms-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn server:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:$PORT`
   - **Health Check Path**: `/health`
3. Add Environment Variables:
   | Key | Value / Example | Notes |
   |---|---|---|
   | `MONGO_URL` | `mongodb+srv://user:pass@cluster.mongodb.net/focus_pms?retryWrites=true&w=majority` | Required |
   | `DB_NAME` | `focus_pms` | Database name |
   | `JWT_SECRET` | Strong 64-char random string | `python -c "import secrets; print(secrets.token_hex(32))"` |
   | `CORS_ORIGINS` | `*` or `https://your-app.netlify.app` | Restrict in production |
   | `APP_PUBLIC_URL` | `https://your-app.netlify.app` | URL of frontend |
   | `BOOTSTRAP_ADMIN_EMAIL` | `kiran@focusengineering.in` | Initial super admin email |
   | `BOOTSTRAP_ADMIN_PASSWORD` | `YourSecurePassword123` | First login forces password change |
   | `RESEND_API_KEY` | `re_12345...` | Optional: for email invites |
   | `EMAIL_FROM_NAME` | `Focus Engineering PMS` | Email sender name |
   | `EMAIL_FROM_ADDRESS` | `onboarding@resend.dev` | Verified sending domain/address |

---

### Step 3: Deploy Frontend to Netlify

Netlify is pre-configured with `netlify.toml` and `public/_redirects` for React Router SPA deep-linking.

1. Go to [Netlify Dashboard](https://app.netlify.com) and click **Add new site** → **Import an existing project**.
2. Select your repository.
3. Configure Build Settings:
   - **Base directory**: `frontend`
   - **Build command**: `yarn build` (or `npm run build`)
   - **Publish directory**: `build` (or `frontend/build` if base directory is root)
4. Set Environment Variables:
   | Key | Value | Example |
   |---|---|---|
   | `REACT_APP_BACKEND_URL` | Your Render Backend URL | `https://focus-pms-backend.onrender.com` |
5. Click **Deploy Site**.

> 💡 **Important**: After your Netlify site is deployed (e.g. `https://focus-pms.netlify.app`), update `APP_PUBLIC_URL` and `CORS_ORIGINS` on Render to match your Netlify site URL!

---

## 🛠 Local Development

### Run with Docker Compose
```bash
docker compose up -d
```
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`
- MongoDB: `localhost:27017`

### Run Manually

#### Backend:
```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env

# Start dev server
uvicorn server:app --reload --port 8000
```

#### Frontend:
```bash
cd frontend
yarn install
cp .env.example .env
yarn start
```

---

## 🗄 Database Management Utilities (`scripts/db_ops.py`)

A database management CLI is provided in `scripts/`:

```bash
# Check connectivity & MongoDB version
python scripts/db_ops.py ping

# Verify and create all performance indexes
python scripts/db_ops.py indexes

# Inspect collection document counts
python scripts/db_ops.py stats

# Run idempotent initial seeding
python scripts/db_ops.py seed

# Export database snapshot to JSON backup
python scripts/db_ops.py export
```

---

## 🔑 Initial Super Admin Credentials

- **Email**: `kiran@focusengineering.in` (or your `BOOTSTRAP_ADMIN_EMAIL`)
- **Default Password**: `Kiran@123` (or your `BOOTSTRAP_ADMIN_PASSWORD`)
- *Note*: First login immediately prompts for a password change.

---

## 🛡 Production Verification Checklist

- [x] Unwanted files and sensitive test tokens removed
- [x] Netlify SPA `_redirects` and `netlify.toml` verified
- [x] Render `render.yaml` Blueprint and `Procfile` configured
- [x] Multi-worker Gunicorn + Uvicorn concurrency configured
- [x] Active database ping healthchecks at `/health` and `/api/health`
- [x] Comprehensive database indexes configured on startup
- [x] Database connection pooling, timeouts, and URI parsing enabled
- [x] Direct Resend API & console fallback for invitations enabled
- [x] Strict CORS filtering with Netlify origin support
