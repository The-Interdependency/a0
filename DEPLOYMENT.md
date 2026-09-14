# a0p — Cloud Run Deployment Guide

## Overview

Every push to `main` runs release checks. After the explicit deployment opt-in is configured, GitHub Actions (`.github/workflows/deploy.yml`) builds the image and deploys it to Cloud Run.

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

After both secrets exist, add the repository Actions variable
**`GCP_DEPLOY_ENABLED=true`**. Until that explicit opt-in exists, CI reports the
deployment as `BLOCKED` and skips authentication, image publication, and Cloud
Run mutation. If the opt-in exists while either secret is absent, the readiness
gate fails and names only the missing configuration key; it never prints secret
values.

> Delete `sa-key.json` locally after uploading. Never commit it.

### 5. Store app secrets in Secret Manager

```bash
echo -n "postgres://..." | gcloud secrets create a0p-database-url --data-file=-
echo -n "your-session-secret" | gcloud secrets create a0p-session-secret --data-file=-
echo -n "your-separate-internal-api-secret" | gcloud secrets create a0p-internal-api-secret --data-file=-
echo -n "owner@example.com" | gcloud secrets create a0p-admin-email --data-file=-
echo -n "xai-key" | gcloud secrets create a0p-xai-api-key --data-file=-
echo -n "deepseek-key" | gcloud secrets create a0p-deepseek-api-key --data-file=-
echo -n "sk_live_..." | gcloud secrets create a0p-stripe-secret-key --data-file=-
echo -n "whsec_..." | gcloud secrets create a0p-stripe-webhook-secret --data-file=-
```

Grant the service account access to each secret:

```bash
for SECRET in a0p-database-url a0p-session-secret a0p-internal-api-secret a0p-admin-email a0p-xai-api-key a0p-deepseek-api-key a0p-stripe-secret-key a0p-stripe-webhook-secret; do
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

### 7. Authentication

a0p uses its repository-owned username/passphrase and PostgreSQL session flow;
it does not depend on Replit Auth. Set a unique production `SESSION_SECRET`,
keep `ADMIN_EMAIL` limited to the owner account, and verify registration,
sign-in, sign-out, and recovery against the production database before mapping
the public domain.

---

## Pre-deploy checks

Every push runs the provider adapter contracts and the **Console tab regression
guard** (`scripts/check-console-tabs.mjs`) as separate CI jobs before the
build/deploy job. The guard spins up an ephemeral
Postgres + Python backend in the runner, fetches `/api/v1/ui/structure`, and fails
the build if either:

1. a tab returned by the API has neither a custom renderer (in
   `client/src/pages/console.tsx`) nor any schema-driven sections, or
2. `CUSTOM_TAB_RENDERERS` registers a `tab_id` that the API no longer returns
   (an orphan / dead entry).

The deploy job needs both gates, so either failure blocks deployment entirely.

To run the same check locally against a running dev server:

```bash
node scripts/check-console-tabs.mjs                       # via Express on :5000
API_BASE=http://localhost:8001 \
  INTERNAL_API_SECRET="$INTERNAL_API_SECRET" \
  node scripts/check-console-tabs.mjs                     # direct against uvicorn
```

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
  -e INTERNAL_API_SECRET="a-different-random-secret" \
  -e XAI_API_KEY="..." \
  -e DEEPSEEK_API_KEY="..." \
  a0p:local
```

### Public-access controls

The donation-funded public boundary is conservative by default and can be
tuned without code changes:

| Variable | Default | Purpose |
|---|---:|---|
| `APP_ORIGIN` | canonical hostname | Trusted origin for Stripe returns; set explicitly in production |
| `PUBLIC_PROVIDER_ALLOWLIST` | economical built-ins | Comma-separated provider IDs available to free users |
| `PUBLIC_GUEST_PROVIDER` | active provider | Optional economical provider pinned for the guest preview |
| `PUBLIC_MAX_PROVIDER_LANES` | `2` | Maximum provider calls in one free-tier orchestration or Fleet run |
| `PUBLIC_MODEL_REQUEST_LIMIT` | `24` | Authenticated model-starting requests per window |
| `PUBLIC_MODEL_WINDOW_SECONDS` | `3600` | Authenticated request-limit window |
| `GUEST_TOKEN_LIMIT` | `2000` | Conservative pre-reserved guest tokens per hour and IP |
| `AUTH_LOGIN_ATTEMPT_LIMIT` | `10` | Sign-in attempts per 15-minute window |
| `AUTH_SIGNUP_ATTEMPT_LIMIT` | `5` | Account-creation attempts per hour |
| `A0_PERSISTENT_UPLOADS_ENABLED` | unset | Show and accept chat attachments only after `uploads/` is durable shared storage |
