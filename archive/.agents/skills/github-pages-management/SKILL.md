---
name: github-pages-management
description: Manage, configure, and troubleshoot GitHub Pages for the a0p / Interdependency project. Covers the dual-repo pattern (a0 repo as Pages source + wayseer.github.io), Jekyll/minima build, custom domain interdependentway.org, CNAME handling, DNS records, Pages settings, build failures, and push/sync issues. Use when the user mentions GitHub Pages, interdependentway.org, the static site, CNAME, Jekyll, DNS, domain not resolving, site not updating, or push/pull sync problems.
---

# GitHub Pages Management — a0p / The Interdependency

## Project-specific topology

```
Repo:   The-Interdependency/a0  (this codebase)
│
├── _config.yml        Jekyll config — title, theme (minima), url, excludes
├── CNAME              one line: interdependentway.org
├── index.html / *.md  static pages served by GitHub Pages
└── push-to-github.sh  manual sync script (uses GITHUB_PAT env var)

Related repo: wayseer/wayseer.github.io
└── index.html, CNAME, README.md  (mirror / landing)

Live URLs:
  Static site:  https://interdependentway.org        (GitHub Pages)
  App:          https://replit.interdependentway.org  (Cloud Run / Replit deploy)
```

GitHub Pages is served from the **main branch root** of `The-Interdependency/a0`.
The `CNAME` file at the repo root is the authoritative custom-domain record.
Never delete or overwrite `CNAME` in a push/merge — it disables the custom domain instantly.

---

## Common management tasks

### Check Pages status
1. Go to `https://github.com/The-Interdependency/a0/settings/pages`
2. Confirm: Source = `Deploy from a branch`, Branch = `main`, Folder = `/ (root)`
3. Green checkmark = deployed. Yellow = building. Red = failed (click for build log).

### Force a rebuild without a code change
```
# Trigger a no-op commit to kick Pages
git commit --allow-empty -m "trigger pages rebuild"
git push origin main
```

### Verify CNAME is intact after a push
```bash
curl -s https://raw.githubusercontent.com/The-Interdependency/a0/main/CNAME
# Expected output: interdependentway.org
```

### Check DNS records (apex domain)
GitHub Pages apex domain requires **A records** pointing to all four IPs:
```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```
Check current records:
```bash
dig interdependentway.org A +short
# Should return all four IPs above
```
AAAA records (IPv6) are optional but recommended:
```
2606:50c0:8000::153
2606:50c0:8001::153
2606:50c0:8002::153
2606:50c0:8003::153
```

### Check HTTPS certificate status
```bash
curl -sI https://interdependentway.org | grep -E "HTTP|strict"
# Expect: HTTP/2 200 and strict-transport-security header
```
If cert is not provisioning: wait up to 24h after DNS changes. HTTPS cannot be enabled until DNS propagates and GitHub validates the domain (Settings → Pages → "Enforce HTTPS" checkbox).

---

## Jekyll build — `_config.yml` rules

Current config summary:
```yaml
title: The Interdependency
theme: minima
url: https://interdependentway.org
baseurl: ""
exclude: [CNAME, .gitignore, Gemfile, node_modules, vendor/, .git, .github, README.md, LICENSE]
```

**Critical exclude rules:**
- `CNAME` is excluded from Jekyll processing but must still exist at the repo root for Pages to honor the custom domain. Do NOT move it.
- Add any new build artifacts or tool directories to `exclude` to keep build times down.
- `README.md` is excluded — the Pages site does not use it as the index. Use `index.html` or `index.md` instead.

**Jekyll build failure signals:**
- GitHub sends an email to the repo owner on build failure
- Settings → Pages shows a red "Your site failed to build" banner with a link to the Actions log
- Common causes: invalid YAML front matter, liquid template syntax errors, gem missing from Gemfile

---

## Push/sync — `push-to-github.sh`

The script uses `GITHUB_PAT` env var (must be set as a secret, never hardcoded):
```bash
GITHUB_PAT=<token> bash push-to-github.sh
```

**What it does:**
1. Removes stale `.git/index.lock`
2. Stages CI/CD files (Dockerfile, .github/, cloudbuild.yaml, DEPLOYMENT.md)
3. Commits and force-pushes to `The-Interdependency/a0` main

⚠️ **Force-push warning:** `git push --force origin main` will overwrite history. Use only when you are certain the local main is authoritative. Prefer `git push origin main` (no force) for normal syncs.

**Normal sync (no force):**
```bash
git fetch origin
git pull --no-rebase origin main   # merge remote into local
git push origin main               # push local ahead commits
```

---

## Troubleshooting quick reference

### Site not updating after a push
1. Check build status: Settings → Pages → look for build action in progress
2. Check Actions tab: `github.com/The-Interdependency/a0/actions` — look for "pages build and deployment"
3. CDN cache: GitHub Pages CDN can take 5–10 min to propagate after a successful build
4. Hard-reload the browser (Ctrl+Shift+R) to bypass local cache

### Custom domain stopped working / shows github.io URL
**Most likely cause:** `CNAME` file was deleted or overwritten in a push.
```bash
# Verify CNAME exists on remote
curl -s https://raw.githubusercontent.com/The-Interdependency/a0/main/CNAME
# If empty or missing → re-add the file
echo "interdependentway.org" > CNAME
git add CNAME && git commit -m "restore CNAME" && git push origin main
```
Then re-verify in Settings → Pages → Custom domain field shows `interdependentway.org`.

### "Domain's DNS record could not be retrieved" in Pages settings
DNS has not propagated or records are wrong. Steps:
1. `dig interdependentway.org A +short` — confirm all four GitHub IPs are returned
2. If records are missing: add them at your DNS registrar (not at GitHub)
3. Wait for TTL to expire (check `dig interdependentway.org A +ttl` for remaining time)
4. Re-verify domain in Settings → Pages after propagation

### HTTPS not provisioning
1. Custom domain must be verified in DNS first (A records correct)
2. Go to Settings → Pages → "Enforce HTTPS" — if greyed out, domain isn't verified yet
3. Certificate provisioning can take up to 24h after DNS change
4. If stuck > 24h: remove and re-add the custom domain in Pages settings to trigger a new cert request

### "Your site failed to build"
1. Go to Actions tab → "pages build and deployment" → failing step
2. Common: YAML front matter error (`---` block malformed in a .md file)
3. Common: Liquid template tag `{{ }}` or `{% %}` in content that Jekyll tries to process — escape with `{% raw %}...{% endraw %}`
4. Common: gem not in Gemfile — add it and commit `Gemfile.lock`

### Merge conflict left a broken CNAME
After any merge that touches the root directory, always verify:
```bash
cat CNAME
# Must be exactly: interdependentway.org
# No trailing whitespace, no extra lines, no merge conflict markers
```

### wayseer/wayseer.github.io out of sync
If the `wayseer.github.io` mirror repo drifts from the main site:
1. Check `github_repo_contents.json` for last known state
2. Manually push updated `index.html` and `CNAME` to `wayseer/wayseer.github.io`
3. That repo's Pages serves `wayseer.github.io` — the CNAME there must also say `interdependentway.org` if it's meant to alias the same domain (only one repo can own the apex domain at a time)

---

## Files to know

```
_config.yml               Jekyll build configuration
CNAME                     Custom domain — single line, no trailing slash
push-to-github.sh         Manual sync script — requires GITHUB_PAT env var
github_repo_contents.json Cached GitHub API snapshot of wayseer.github.io
Gemfile / Gemfile.lock    Jekyll gem dependencies (minima theme)
```

---

## Prevention checklist (run after any merge to main)

- [ ] `cat CNAME` — still says `interdependentway.org`, no conflict markers
- [ ] Settings → Pages shows green build status within 5 min
- [ ] `curl -sI https://interdependentway.org` returns HTTP 200
- [ ] `dig interdependentway.org A +short` returns all four GitHub IPs
- [ ] `_config.yml` `exclude:` list still contains `CNAME`
