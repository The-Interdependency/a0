# a0p — Cloud Run Deployment Guide

## Overview

Every push to `main` automatically builds a Docker image and deploys to Cloud Run via GitHub Actions (`.github/workflows/deploy.yml`). Alternatively, use `cloudbuild.yaml` for a GCP-native trigger.

---

## One-time GCP Setup

Replace `YOUR_PROJECT_ID` throughout with your actual GCP project ID.

### 1. Enable APIs

```bash
gcloud config set project YOUR_PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

### 2. Create Artifact Registry repository

```bash
gcloud artifacts repositories create a0p \
  --repository-format=docker \
  --location=us-central1 \
  --description="a0p container images"
```

### 3. Create a service account for CI/CD

```bash
gcloud iam service-accounts create a0p-deployer \
  --display-name="a0p GitHub Actions deployer"

SA=a0p-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" --role="roles/run.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
```

### 4. Export service account key → GitHub secret

```bash
gcloud iam service-accounts keys create sa-key.json --iam-account=$SA
```

Add the content of `sa-key.json` as a GitHub Actions secret named **`GCP_SA_KEY`**.  
Also add your project ID as **`GCP_PROJECT_ID`**.

> Delete `sa-key.json` locally after uploading. Never commit it.

### 5. Store app secrets in Secret Manager

```bash
echo -n "postgres://..." | gcloud secrets create a0p-database-url --data-file=-
echo -n "your-session-secret" | gcloud secrets create a0p-session-secret --data-file=-
echo -n "xai-key" | gcloud secrets create a0p-xai-api-key --data-file=-
echo -n "sk_live_..." | gcloud secrets create a0p-stripe-secret-key --data-file=-
echo -n "whsec_..." | gcloud secrets create a0p-stripe-webhook-secret --data-file=-
```

Grant the service account access to each secret:

```bash
for SECRET in a0p-database-url a0p-session-secret a0p-xai-api-key a0p-stripe-secret-key a0p-stripe-webhook-secret; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 6. Database

Cloud Run needs a PostgreSQL instance accessible from the internet (or via Cloud SQL connector).  
Options:
- **Neon** (recommended for serverless): provision a database, copy the connection string into `a0p-database-url`
- **Cloud SQL**: add `--add-cloudsql-instances` to the `gcloud run deploy` command and use the Unix socket path

### 7. Auth provider (important)

Replit Auth (OIDC) will not work outside Replit. Before going live on Cloud Run you must:
1. Add a Google OAuth 2.0 client ID in GCP Console → APIs & Services → Credentials
2. Swap the auth provider in `server/replit_integrations/auth.ts` to use `passport-google-oauth20`

---

## Deploying

Push to `main` — GitHub Actions handles the rest. Watch progress at:
```
https://github.com/The-Interdependency/a0/actions
```

After first deploy, get the service URL:
```bash
gcloud run services describe a0p --region=us-central1 --format="value(status.url)"
```

Update your Stripe webhook endpoint to `https://YOUR-SERVICE-URL/api/stripe/webhook`.

---

## Local build test

```bash
docker build -t a0p:local .
docker run -p 5000:5000 \
  -e DATABASE_URL="..." \
  -e SESSION_SECRET="..." \
  -e XAI_API_KEY="..." \
  a0p:local
```
