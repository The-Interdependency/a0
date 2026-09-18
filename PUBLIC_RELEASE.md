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
4. Require current-head CodeQL to report zero new alerts in code changed by the
   release candidate. A green CodeQL check whose output still reports an alert
   is not a clean security acceptance witness.
5. Keep chat attachments disabled or visibly unavailable until `uploads/` is
   backed by durable shared storage. A Cloud Run container filesystem is
   ephemeral and cannot be treated as user storage.
6. Do not expose system-primary memory or cross-owner matching until the
   executable privacy, consent, audit, export, correction, retention, and
   deletion contracts in `docs/replit-backend-foundation.md` exist and pass.
7. Map the public hostname only after the staging revision is healthy, then
   verify TLS, security headers, error handling, and the Stripe webhook.

## Release evidence

Record the deployed commit SHA, Cloud Run revision, migration result, smoke-test
result, CodeQL current-head result, and rollback revision in the release issue.
If any item above is not true, describe a0p as a release candidate rather than a
live public service.

## PR #109 repair witnesses

The audit starting at `4b04abfad44df2a6f982559b57f1732ae8e78ccc` reproduced
all 16 open P1/P2 findings. Its current CodeQL annotation was **workflow token
permissions**, not the previously repaired Helmet CSP finding.

| Live finding | Owning repair / regression witness |
| --- | --- |
| Persisted orchestration mode bypass | Resolve preferences and provider IDs before gating; reject before message storage |
| Approval replay tier loss | Bind/reset tier in both replay paths, including provider failures |
| Attachment-only rejection | Require text or attachment IDs while retaining size bounds |
| Fonts blocked by CSP | Allow the existing Google stylesheet and font origins in their respective directives |
| Shared Cloud Run proxy bucket | Use the declared two-address ingress suffix; reject missing/invalid suffixes and ignore supplied prefixes |
| Guest reservation overcharging | Settle actual usage, release failed calls; serialize window creation so concurrent reservations share a balance |
| Expired rate-probe growth | Delete up to 100 expired rows of the current rate kind per request; preserve live and unrelated probes |
| Council/Fleet call amplification | Count actual one-round synthesis calls and aggregate the complete Fleet plan |
| CLI/Fleet tool tier loss | Bind/reset the resolved caller tier around inference |
| Missing admin bootstrap credential | Supply ADMIN_PASSWORD through Secret Manager; seed role and tier; reject unverified identity collisions |
| Missing built-in tool discovery | Keep admin no-filter reads; retain caller ownership for ordinary users |
| Unverified email privilege escalation | WS_USER_IDS names operator-verified account IDs; admin guards use stored roles/immutable IDs, never signup email |
| CLI request-limit bypass | Meter every CLI attempt by client IP before proxying; FastAPI owns bearer authentication |
| Encoded-path request-limit bypass | Match the once-decoded ASGI path; reject malformed escapes |
| Guest role-slot provider substitution | Pin the authorized provider and pass the free tier |
| Fleet role-slot provider substitution | Freeze resolved contestants, pin each single lane, and carry the caller tier |
| CodeQL workflow permission alert | Default deployment workflow token permissions to contents: read |

Usage: run `uv run pytest -q tests/test_publ_acce_poli_v0.0.0alpha.py` with
`DATABASE_URL` set. Provider calls and route storage are faked. Run
`node --import tsx scripts/chec_publ_rate_v0.0.0alpha.ts` against an **isolated
test database** after `npm run db:push` for concurrent rate/guest accounting,
backend-failure settlement, and admin-bootstrap checks. `--unit` runs just the
request/configuration checks without connecting to PostgreSQL. The existing
CI runs the full script and Python suite, production image, and console guard.

hmmm: passing source regressions does not prove live Cloud Run ingress shape,
historical account ownership, history purge, credential rotation, staging
health, or deployment. Record final exact-head CI/CodeQL and review standing
on the PR; keep the public-domain prerequisites above intact.
