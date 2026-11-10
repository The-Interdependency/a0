#!/usr/bin/env python3
"""Provision existing A0 OpenBao and pair its reliability Site without printing secrets.

Usage: sudo python3 operations/configure-vault.py --cli-user "$(id -un)"
Fresh-store initialization requires --initialize and an observed uninitialized store.
Pairing: sudo ... --pair-site --cli-user USER < a0-site-connection.json
Renewal: the installed hourly timer runs --renew using scoped tokens, never root.
Recovery: backup.sh/restore.sh use --check-recovery, --backup-canary VALUE and
--restore-canary DIRECTORY [--restore-port PORT]. Only nonsecret receipts leave
this process; recovery credentials never enter shell variables or arguments.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ETC = Path("/etc/a0")
PROVIDERS = ("openai", "xai", "deepseek", "anthropic")


class SetupError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SetupError("OpenBao redirected the request; refusing credential forwarding.")


def read_private(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        mode = os.fstat(fd)
        if not stat.S_ISREG(mode.st_mode) or mode.st_uid != 0 or mode.st_mode & 0o027:
            raise SetupError("Configuration must be a root-owned private regular file.")
        with os.fdopen(fd, closefd=False) as stream:
            value = stream.read(65537)
        if len(value) > 65536:
            raise SetupError("Configuration exceeds size limit.")
        return value
    finally:
        os.close(fd)


def atomic(path, value, group=0, mode=0o600):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=".a0-stage-")
    try:
        os.fchmod(fd, mode)
        os.fchown(fd, 0, group)
        with os.fdopen(fd, "w") as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def env_values(text):
    result = {}
    for line in text.splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise SetupError("Unsupported environment-file syntax; no shell evaluation is performed.")
        result[key] = value
    return result


def api(addr, method, path, token=None, payload=None, missing=False):
    url = urllib.parse.urlsplit(addr)
    if url.username or url.password or url.query or url.fragment or url.path not in ("", "/") or not (
        url.scheme == "https" or url.scheme == "http" and url.hostname in ("127.0.0.1", "::1")):
        raise SetupError("OpenBao requires HTTPS or literal loopback HTTP.")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Vault-Token"] = token
    req = urllib.request.Request(addr.rstrip("/") + "/v1" + path, method=method,
        headers=headers, data=None if payload is None else json.dumps(payload).encode())
    try:
        with urllib.request.build_opener(NoRedirect, urllib.request.ProxyHandler({})).open(req, timeout=10) as res:
            raw = res.read(262145)
            if len(raw) > 262144:
                raise SetupError("OpenBao response too large.")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        if missing and err.code == 404:
            return None
        raise SetupError(f"OpenBao HTTP {err.code}; no response body or credentials are logged.") from None
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise SetupError("OpenBao transport/JSON failure; no initialization or fallback attempted.") from None


def inspect_store(addr, expected=None):
    data = api(addr, "GET", "/sys/seal-status")
    if not isinstance(data, dict) or type(data.get("initialized")) is not bool or type(data.get("sealed")) is not bool:
        raise SetupError("OpenBao status is malformed; initialization is forbidden.")
    if expected and data.get("cluster_id") != expected:
        raise SetupError("OpenBao cluster identity mismatch; keeping existing credentials/store.")
    return data


def policy(mount, cli=False):
    if not re.fullmatch(r"[A-Za-z0-9_-]+", mount):
        raise SetupError("Invalid KV mount.")
    paths = [f"{mount}/data/provider/{p}" for p in PROVIDERS] if cli else [f"{mount}/data/*"]
    caps = '["read"]' if cli else '["create","read","update","delete"]'
    rules = [f'path "{path}" {{ capabilities = {caps} }}' for path in paths]
    if not cli:
        rules.append(f'path "{mount}/metadata/*" {{ capabilities = ["list","read"] }}')
    rules.extend(['path "auth/token/lookup-self" { capabilities = ["read"] }',
                  'path "auth/token/renew-self" { capabilities = ["update"] }'])
    return "\n".join(rules)


def scoped_token(addr, root, role, path, group, previous=""):
    token = read_private(path).strip() if path.exists() else previous
    if token:
        try:
            info = api(addr, "GET", "/auth/token/lookup-self", token).get("data", {})
            if set(info.get("policies", [])) == {role} and info.get("period", 0) >= 86400:
                api(addr, "POST", "/auth/token/renew-self", token, {})
                atomic(path, token + "\n", group, 0o640)
                return
        except SetupError:
            # This explicit provisioning command may replace an unusable credential.
            # Automatic renewal below never uses a root token or creates a replacement.
            pass
    created = api(addr, "POST", "/auth/token/create", root,
        {"policies": [role], "period": "24h", "renewable": True,
         "no_default_policy": True, "display_name": role})
    token = created.get("auth", {}).get("client_token")
    if not isinstance(token, str) or not token:
        raise SetupError("OpenBao did not return a scoped credential.")
    atomic(path, token + "\n", group, 0o640)


def root_material(path):
    """Read JSON or historical key=value data, never executable shell syntax.

    Reject ambiguous/empty/header-unsafe credentials with fixed redacted errors.
    JSON-looking invalid data cannot fall back to a legacy root_token line.
    """
    text = read_private(path)
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise SetupError("Duplicate recovery field; refusing ambiguous credentials.")
            result[key] = value
        return result

    if text.lstrip().startswith(("{", "[")):
        material = json.loads(text, object_pairs_hook=unique)
    else:
        pairs = []
        for line in text.splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if "=" not in line:
                raise SetupError("Invalid recovery material; expected JSON or key=value data.")
            key, value = line.split("=", 1)
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
                raise SetupError("Invalid recovery field; shell syntax is not supported.")
            pairs.append((key, value))
        material = unique(pairs)
    token = material.get("root_token") if isinstance(material, dict) else None
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9._~+/=-]{1,4096}", token):
        raise SetupError("Recovery root token is missing or invalid; no credentials are logged.")
    return material


def recovery_canary(config, *, write=None, directory=None, port=8203):
    """Write a backup witness or verify an isolated restored store, fail closed.

    New archives carry a nonsecret cluster/mount receipt. Old archives require
    the independently pinned BAO_CLUSTER_ID in protected configuration.
    No initialization, unseal, provisioning, renewal or service mutation occurs.
    """
    root = root_material(Path("/etc/openbao/init.json"))["root_token"]
    mount = config.get("BAO_KV_MOUNT", "a0")
    expected = config.get("BAO_CLUSTER_ID")
    addr = config.get("BAO_ADDR", "http://127.0.0.1:8200")
    if directory is not None:
        if not 1024 <= port <= 65535 or port == 8200:
            raise SetupError("Restore requires a separate unprivileged loopback port.")
        directory = Path(directory)
        identity_file = directory / "vault-identity.json"
        if identity_file.exists():
            identity = json.loads(identity_file.read_text())
            if expected and identity.get("cluster_id") != expected:
                raise SetupError("Backup cluster differs from the configured vault; recovery stopped.")
            expected, mount = identity.get("cluster_id"), identity.get("mount")
        if not isinstance(expected, str) or not expected:
            raise SetupError("Recovery requires a backup identity receipt or an independently pinned cluster.")
        addr = f"http://127.0.0.1:{port}"
        expected_canary = (directory / "canary.txt").read_text().strip()
        if not re.fullmatch(r"canary=a0-backup-canary-[0-9-]+", expected_canary):
            raise SetupError("Backup canary witness is missing or malformed.")
        expected_canary = expected_canary.split("=", 1)[1]
    elif not isinstance(write, str) or not re.fullmatch(r"a0-backup-canary-[0-9-]+", write):
        raise SetupError("Invalid nonsecret backup canary.")
    if not isinstance(mount, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", mount):
        raise SetupError("Invalid recovery KV mount.")
    seal = inspect_store(addr, expected)
    if not seal["initialized"] or seal["sealed"] or not seal.get("cluster_id"):
        raise SetupError("Recovery requires an initialized, unsealed, identified store.")
    api(addr, "GET", "/auth/token/lookup-self", root)
    path = f"/{mount}/data/backup-canary"
    if directory is None:
        api(addr, "POST", path, root, {"data": {"value": write}})
        print(json.dumps({"cluster_id": seal["cluster_id"], "mount": mount}))
    else:
        value = api(addr, "GET", path, root).get("data", {}).get("data", {}).get("value")
        if value != expected_canary:
            raise SetupError("Restored vault canary mismatch; recovery stopped.")
        print("[restore] CANARY_OK: restored cluster identity and original canary verified.")


def provision(config, user, initialize=False):
    account = pwd.getpwnam(user) if user else None
    if account and account.pw_uid == 0:
        raise SetupError("Select the non-root VM coding account.")
    addr = config.get("BAO_ADDR", "http://127.0.0.1:8200")
    mount = config.get("BAO_KV_MOUNT", "a0")
    seal = inspect_store(addr, config.get("BAO_CLUSTER_ID"))
    recovery = Path("/etc/openbao/init.json")
    if not seal["initialized"]:
        if not initialize or recovery.exists() or config.get("BAO_CLUSTER_ID"):
            raise SetupError("Uninitialized store: explicit --initialize on a confirmed new store is required.")
        material = api(addr, "POST", "/sys/init", payload={"recovery_shares": 1, "recovery_threshold": 1})
        if not material.get("root_token") or not material.get("recovery_keys_b64"):
            raise SetupError("Unexpected initialization result; preserve the store and investigate privately.")
        atomic(recovery, json.dumps(material) + "\n")
        seal = inspect_store(addr)
    if seal["sealed"] or not seal.get("cluster_id"):
        raise SetupError("Vault must be unsealed and have a cluster identity; no auto-unseal changes made.")
    root = root_material(recovery).get("root_token")
    if not root:
        raise SetupError("Administrative provisioning credential unavailable; normal runtime never needs it.")
    # Authenticating this local store precedes pinning its first cluster identity.
    api(addr, "GET", "/auth/token/lookup-self", root)
    mounts = api(addr, "GET", "/sys/mounts", root)
    data = mounts.get("data", mounts)
    existing = data.get(mount + "/")
    if existing is None:
        api(addr, "POST", f"/sys/mounts/{mount}", root, {"type": "kv", "options": {"version": "2"}})
    elif existing.get("type") != "kv" or str(existing.get("options", {}).get("version")) != "2":
        raise SetupError("Existing mount is not KV v2; refusing replacement/migration.")
    for role, cli in (("a0-app", False), ("a0-cli", True)):
        api(addr, "PUT", f"/sys/policies/acl/{role}", root, {"policy": policy(mount, cli)})
    app_group = pwd.getpwnam("a0app").pw_gid
    app_token = ETC / "vault-app.token"
    scoped_token(addr, root, "a0-app", app_token, app_group, config.get("BAO_TOKEN", ""))
    config.pop("BAO_TOKEN", None)
    config.update(BAO_TOKEN_FILE=str(app_token), BAO_CLUSTER_ID=seal["cluster_id"])
    if account:
        # Directory traversal is public; each file is root:account 0640.
        # Explicit mode avoids sudo inheriting umask 077 and blocking the CLI.
        (ETC / "cli").mkdir(exist_ok=True)
        (ETC / "cli").chmod(0o755)
        token_file = ETC / "cli" / f"{account.pw_uid}.token"
        scoped_token(addr, root, "a0-cli", token_file, account.pw_gid)
        cli = {"schema": "a0.cli-vault/1", "addr": addr, "mount": mount,
               "cluster_id": seal["cluster_id"], "token_file": str(token_file)}
        config_file = ETC / "cli" / f"{account.pw_uid}.json"
        if config_file.exists():
            previous = json.loads(read_private(config_file))
            if previous.get("bridge"):
                cli["bridge"] = previous["bridge"]
        atomic(config_file, json.dumps(cli) + "\n", account.pw_gid, 0o640)
    atomic(ETC / "a0.env", "".join(f"{k}={v}\n" for k, v in config.items()), app_group, 0o640)
    # A renewal target carries only non-secret file references and the pinned store.
    token_paths = [str(app_token)] + [str(p) for p in sorted((ETC / "cli").glob("*.token"))]
    atomic(ETC / "vault-renew.json", json.dumps({"addr": addr, "cluster_id": seal["cluster_id"], "tokens": token_paths}) + "\n")
    print("OpenBao policies, pinned identity and renewable scoped credentials configured. Provider values were not printed.")


def renew():
    data = json.loads(read_private(ETC / "vault-renew.json"))
    health = inspect_store(data["addr"], data["cluster_id"])
    if not health["initialized"] or health["sealed"]:
        raise SetupError("Vault is unavailable; renewal stopped.")
    failures = 0
    for path in data["tokens"]:
        try:
            api(data["addr"], "POST", "/auth/token/renew-self", read_private(path).strip(), {})
        except (SetupError, OSError):
            failures += 1
    if failures:
        raise SetupError(f"{failures} scoped credential renewal(s) failed; explicit reprovisioning may be required.")
    print("Scoped vault credentials renewed.")


def pair_site(config, user, raw):
    if not user:
        raise SetupError("Pairing requires --cli-user for the non-root coding account.")
    account = pwd.getpwnam(user)
    if account.pw_uid == 0:
        raise SetupError("Select the non-root VM coding account.")
    data = json.loads(raw)
    if data.get("schema") != "a0.site-pairing/1" or not re.fullmatch(r"[a-f0-9]{64}", data.get("token", "")):
        raise SetupError("Invalid Site pairing file.")
    site = urllib.parse.urlsplit(data.get("siteOrigin", ""))
    if site.scheme != "https" or not site.hostname or site.username or site.password or site.path not in ("", "/") or site.query or site.fragment:
        raise SetupError("Pairing file must name an HTTPS Site origin.")
    if data.get("vmOrigin", "").rstrip("/") != config.get("A0_PUBLIC_ORIGIN", "").rstrip("/"):
        raise SetupError("Pairing file targets a different A0 public origin.")
    cli_file = ETC / "cli" / f"{account.pw_uid}.json"
    cli = json.loads(read_private(cli_file))  # Requires prior CLI provisioning.
    app_group = pwd.getpwnam("a0app").pw_gid
    token_file = ETC / "site-bridge.token"
    atomic(token_file, data["token"] + "\n", app_group, 0o640)
    cli_token = ETC / "cli" / f"{account.pw_uid}.site-token"
    atomic(cli_token, data["token"] + "\n", account.pw_gid, 0o640)
    cli["bridge"] = {"addr": "http://127.0.0.1:" + config.get("A0_PORT", "8787"), "token_file": str(cli_token)}
    atomic(cli_file, json.dumps(cli) + "\n", account.pw_gid, 0o640)
    config["A0_BRIDGE_TOKEN_FILE"] = str(token_file)
    config["A0_BRIDGE_SITE_ORIGIN"] = data["siteOrigin"].rstrip("/")
    atomic(ETC / "a0.env", "".join(f"{k}={v}\n" for k, v in config.items()), app_group, 0o640)
    print("Site bridge paired. Credential remains in protected files; provider keys were not shared.")


def readiness(config):
    """A0 must serve health after asynchronous migrations/vault checks, within 60s."""
    url = "http://127.0.0.1:" + config.get("A0_PORT", "8787") + "/api/health"
    opener = urllib.request.build_opener(NoRedirect, urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            with opener.open(url, timeout=2) as response:
                data = json.loads(response.read(16384))
            if data.get("ok") is True and data.get("name") == "a0":
                print("A0 passed local HTTP readiness. External Site/phone acceptance remains separate.")
                return
        except (OSError, ValueError, SetupError):
            # Migrations and vault startup may delay HTTP readiness. Retry after
            # the same one-second pause, without logging a private response body.
            pass
        time.sleep(1)
    raise SetupError("A0 did not become HTTP-ready within 60 seconds; inspect the service before claiming deployment.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cli-user")
    parser.add_argument("--initialize", action="store_true")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--renew", action="store_true")
    modes.add_argument("--pair-site", action="store_true")
    modes.add_argument("--check-recovery", action="store_true")
    modes.add_argument("--backup-canary")
    modes.add_argument("--restore-canary", type=Path)
    parser.add_argument("--restore-port", type=int, default=8203)
    args = parser.parse_args()
    try:
        if os.geteuid() != 0:
            raise SetupError("Run this provisioning command through the VM's authorized sudo path.")
        if args.check_recovery:
            root_material(Path("/etc/openbao/init.json"))
            print("Recovery material validated; no credentials are logged.")
            return 0
        if args.renew:
            renew()
            return 0
        config = env_values(read_private(ETC / "a0.env"))
        if args.backup_canary is not None or args.restore_canary is not None:
            recovery_canary(config, write=args.backup_canary,
                            directory=args.restore_canary, port=args.restore_port)
            return 0
        if args.pair_site:
            raw = sys.stdin.read(8193)
            if len(raw) > 8192:
                raise SetupError("Pairing file exceeds size limit.")
            pair_site(config, args.cli_user, raw)
        else:
            provision(config, args.cli_user, args.initialize)
            for name in ("a0-vault-renew.service", "a0-vault-renew.timer"):
                source = Path(__file__).parent / name
                atomic(Path("/etc/systemd/system") / name, source.read_text(), mode=0o644)
            subprocess.run(["systemctl", "daemon-reload"], check=True)
            subprocess.run(["systemctl", "enable", "--now", "a0-vault-renew.timer"], check=True)
        subprocess.run(["systemctl", "restart", "a0.service"], check=True)
        subprocess.run(["systemctl", "is-active", "--quiet", "a0.service"], check=True)
        readiness(config)
        return 0
    except SetupError as err:
        print(f"A0 setup: {err}", file=sys.stderr)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, subprocess.CalledProcessError):
        print("A0 setup: private configuration, account or service check failed; no credentials are logged.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
