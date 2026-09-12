# a0p public release gate

a0p is not considered publicly released merely because a hostname or repository
exists. A release is healthy only when the canonical GitHub-to-Cloud-Run path
passes the checks below.

## Implemented in the public-readiness slice

- One production image runs the Express boundary and its Python/Uvicorn child.
- Production refuses a missing internal API secret.
- Login, registration, guest chat, and authenticated model starts have durable
  or atomic abuse limits.
- Free inference is restricted to a configurable economical-provider set and
  at most two provider calls per orchestration or Fleet run.
- CLI model access remains working-set/operator-only.
- Tool tiers are enforced at model exposure and dispatch; shared-state,
  account-backed, shell, recursive, and high-cost tools are not public.
- Public request bodies are bounded and backend exception detail is not returned.
- Security headers are enabled, dependency audit is clean, and runtime uploads
  are excluded from source and container builds.

## Must pass before mapping the public domain

1. Purge historical runtime uploads and attachments from Git history, review the
   affected material without redisclosing it, and rotate any credential that
   might have appeared there. Removing files from the current tree is not a
   historical purge.
2. Configure the Cloud Run service, PostgreSQL database, Secret Manager values,
   and GitHub deployment opt-in described in [DEPLOYMENT.md](DEPLOYMENT.md).
3. Build the Docker image in CI, apply the database schema, run the public rate
   check, and smoke-test registration, session rotation, guest chat, signed-in
   chat, provider denial, and cross-user conversation denial against staging.
4. Keep chat attachments disabled or visibly unavailable until `uploads/` is
   backed by durable shared storage. A Cloud Run container filesystem is
   ephemeral and cannot be treated as user storage.
5. Do not expose system-primary memory or cross-owner matching until the
   executable privacy, consent, audit, export, correction, retention, and
   deletion contracts in `docs/replit-backend-foundation.md` exist and pass.
6. Map the public hostname only after the staging revision is healthy, then
   verify TLS, security headers, error handling, and the Stripe webhook.

## Release evidence

Record the deployed commit SHA, Cloud Run revision, migration result, smoke-test
result, and rollback revision in the release issue. If any item above is not
true, describe a0p as a release candidate rather than a live public service.
