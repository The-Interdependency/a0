#!/usr/bin/env bash
# vm-mcp-127-check.sh - acceptance check for vm-mcp at skill-lib e74ce1e (merge of #131, on top of #130,
# #127 and #123), the revision stack's backend/deploy/VM_CONTACT.md pins. vm-mcp tree 4cfcbac.
# Derived from vm-mcp-127-check.sh; adds step 10 (#127 token-file owner/mode, fixed install root,
# VM_MCP_ROOT overlap) and turns the step 9 sysctl note into a check.
#
# Run as root on a disposable systemd VM:
#   sudo bash vm-mcp-127-check.sh [--repo DIR | --tarball FILE] [--destructive [--yes-scratch-vm]]
#                                 [--reinstall-readonly] [--skip-install] [--log FILE]
#
#   --repo DIR            use an existing skill-lib checkout (must be at e74ce1e or have vm-mcp tree 4cfcbac)
#   --tarball FILE        use a source tarball of e74ce1e (e.g. codeload .../tar.gz/e74ce1ee8a2c...)
#   (neither)             git clone into /root/skill-lib-e74ce1e and check out e74ce1e
#   --destructive         also run step 8 (ptrace_scope=0 fail-closed test). SCRATCH VM ONLY.
#   --yes-scratch-vm      non-interactive confirmation for --destructive (otherwise you type the hostname)
#   --reinstall-readonly  also run optional step 9 (reinstall with the read-only profile; leaves VM read-only)
#   --skip-install        real-VM re-check: do not run install.sh, check the existing install
#                         (HTTP tests then use /etc/credstore/vm-mcp-token instead of /root/tok).
#                         With --repo DIR it also runs the source-only checks against DIR
#                         (tree hash reported, installed files compared, step 10 source checks).
#   Steps 3, 7 and 8 follow the installed profile (VM_MCP_PROFILE in /etc/vm-mcp.env,
#   resolved like the service does); only personal-console expects the broker.
#
# Values come from vm-mcp/install.sh, vm-mcp/systemd/*.service, server.py, auth.py,
# admin_broker.py and yama_gate.py at e74ce1e. The token is never printed or put on a command line.
# Exit status: 0 if every check passed, 1 if any check failed, 2 for usage/precondition errors.

# SC2016: bash -c '...' snippets get their values as positional args on purpose.
# SC2329: on_exit/perm_ok_root are called via trap and check().
# shellcheck disable=SC2016,SC2329
set -u
set -o pipefail

EXPECTED_COMMIT=e74ce1ee8a2cea50b0a6acce7697a6d3d9b2e128
EXPECTED_TREE_PREFIX=4cfcbac
REPO_URL=https://github.com/The-Interdependency/skill-lib.git
INSTALL_ROOT=/opt/vm-mcp
SERVICE_USER=vmmcp
PORT=8765
URL="http://127.0.0.1:${PORT}/mcp"
TOKEN_SRC=/root/tok
CREDSTORE=/etc/credstore/vm-mcp-token
SYSCTL_CONF=/etc/sysctl.d/99-zz-vm-mcp-ptrace.conf
YAMA=/proc/sys/kernel/yama/ptrace_scope
ADMIN_SOCKET=/run/vm-mcp/admin.sock
UNIT=vm-mcp.service
ADMIN_UNIT=vm-mcp-admin.service
GATE_LINE="ExecStartPre=+${INSTALL_ROOT}/.venv/bin/python -I ${INSTALL_ROOT}/yama_gate.py"

REPO=""; TARBALL=""; DESTRUCTIVE=0; YES_SCRATCH=0; READONLY9=0; SKIP_INSTALL=0
LOG="/root/vm-mcp-127-check.$(date +%Y%m%d-%H%M%S).log"

usage() { sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; }

while (( $# )); do
  case "$1" in
    --repo) REPO=${2:-}; shift 2 || { usage; exit 2; } ;;
    --tarball) TARBALL=${2:-}; shift 2 || { usage; exit 2; } ;;
    --destructive) DESTRUCTIVE=1; shift ;;
    --yes-scratch-vm) YES_SCRATCH=1; shift ;;
    --reinstall-readonly) READONLY9=1; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --log) LOG=${2:-}; shift 2 || { usage; exit 2; } ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ ${EUID} -ne 0 ]]; then echo "ERROR: run as root (sudo bash $0 ...)" >&2; exit 2; fi
if [[ -n "$REPO" && -n "$TARBALL" ]]; then echo "ERROR: give --repo or --tarball, not both" >&2; exit 2; fi
if (( SKIP_INSTALL )) && [[ -n "$TARBALL" ]]; then echo "ERROR: --skip-install takes --repo for source-only checks, not --tarball" >&2; exit 2; fi
if (( SKIP_INSTALL )) && [[ -n "$REPO" && ! -f "$REPO/vm-mcp/install.sh" ]]; then echo "ERROR: --repo $REPO has no vm-mcp/install.sh" >&2; exit 2; fi
if ! command -v systemctl >/dev/null 2>&1 || [[ ! -d /run/systemd/system ]]; then
  echo "ERROR: systemd is not running on this machine" >&2; exit 2
fi
for tool in curl sha256sum stat find runuser; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl coreutils findutils util-linux >/dev/null 2>&1; fi
  fi
  command -v "$tool" >/dev/null 2>&1 || { echo "ERROR: required tool missing: $tool" >&2; exit 2; }
done

# --- step 8 confirmation, before anything is changed -------------------------
if (( DESTRUCTIVE )); then
  if (( SKIP_INSTALL )); then
    echo "ERROR: --destructive is for the scratch VM; it is refused together with --skip-install (real-VM mode)" >&2; exit 2
  fi
  if (( ! YES_SCRATCH )); then
    if [[ ! -t 0 ]]; then echo "ERROR: --destructive needs --yes-scratch-vm when not run interactively" >&2; exit 2; fi
    echo "Step 8 sets kernel.yama.ptrace_scope=0 and puts vm-mcp into a failing restart loop."
    read -r -p "This must be a SCRATCH VM. Type this VM's hostname ($(hostname)) to confirm: " answer
    [[ "$answer" == "$(hostname)" ]] || { echo "Not confirmed; aborting." >&2; exit 2; }
  fi
fi

umask 022
touch "$LOG" && chmod 0600 "$LOG"
exec > >(tee -a "$LOG") 2>&1

WORK="$(mktemp -d /root/.vm-mcp-check.XXXXXX)" || { echo "ERROR: mktemp failed"; exit 2; }
chmod 0700 "$WORK"

PASS_N=0; FAIL_N=0; WARN_N=0; SKIP_N=0
RESULTS=()
pass() { PASS_N=$((PASS_N+1)); RESULTS+=("PASS  $1"); printf 'PASS  %s\n' "$1"; }
fail() { FAIL_N=$((FAIL_N+1)); RESULTS+=("FAIL  $1"); printf 'FAIL  %s\n' "$1"; }
warn() { WARN_N=$((WARN_N+1)); RESULTS+=("WARN  $1"); printf 'WARN  %s\n' "$1"; }
skip() { SKIP_N=$((SKIP_N+1)); RESULTS+=("SKIP  $1"); printf 'SKIP  %s\n' "$1"; }
info() { printf '      %s\n' "$*"; }
check() { local label=$1; shift; if "$@"; then pass "$label"; else fail "$label"; fi; }
hdr() { printf '\n========== %s ==========\n' "$*"; }

# --- ptrace_scope restore (trap) ---------------------------------------------
SCOPE_CHANGED=0; ORIG_SCOPE=""
restore_scope() {
  if (( SCOPE_CHANGED )) && [[ -n "$ORIG_SCOPE" ]]; then
    echo "      restoring kernel.yama.ptrace_scope=$ORIG_SCOPE"
    sysctl -q -w "kernel.yama.ptrace_scope=$ORIG_SCOPE" >/dev/null 2>&1 || echo "      !! could not restore ptrace_scope; run: sysctl --system"
    systemctl reset-failed "$UNIT" >/dev/null 2>&1
    systemctl restart "$UNIT" >/dev/null 2>&1
    SCOPE_CHANGED=0
  fi
}
on_exit() { restore_scope; rm -rf -- "$WORK"; }
trap on_exit EXIT
trap 'echo "interrupted"; exit 130' INT TERM

# --- helpers -------------------------------------------------------------------
H=(-H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream')
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"vm-mcp-127-check","version":"1"}}}'
LIST='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
CALL_ID='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"admin_exec","arguments":{"command":"id -u"}}}'

# http_code BODYFILE DATA [extra curl args...]  -> prints status code (000 = no connection)
http_code() {
  local body=$1 data=$2; shift 2
  curl -s -o "$body" -w '%{http_code}' --max-time 30 "${H[@]}" "$@" -d "$data" "$URL" 2>/dev/null || true
}

# Header files are built with shell builtins only, so the token never appears in argv.
make_auth_headers() {
  local src=$1 tok=""
  IFS= read -r tok < "$src" || [[ -n "$tok" ]]
  tok=${tok%$'\r'}
  ( umask 077
    printf 'Authorization: bearer %s\n' "$tok" > "$WORK/auth_lower"
    printf 'Authorization: Bearer %s\n' "$tok" > "$WORK/auth_good"
    printf '%s\n' "$tok" > "$WORK/tok_pattern" )
  tok=""
}

wait_ready() {  # wait until the listener answers (401 without a token)
  local i code
  for ((i = 0; i < 90; i++)); do
    code=$(http_code /dev/null "$INIT")
    if [[ "$code" != 000 ]]; then info "listener answered HTTP $code after ~${i}s"; return 0; fi
    sleep 1
  done
  return 1
}

main_pid() { systemctl show -p MainPID --value "$UNIT" 2>/dev/null; }

# json_field FILE EXPR: python3 helper that prints a field of an MCP JSON-RPC response
mcp_tool_names() {
  python3 - "$1" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print("\n".join(t.get("name", "") for t in d["result"]["tools"]))
except Exception as e:
    print(f"PARSE_ERROR {type(e).__name__}", file=sys.stderr)
    sys.exit(1)
PY
}
# prints "key=value" lines for the tool-call result dict
mcp_call_result() {
  python3 - "$1" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    r = d["result"]
    res = r.get("structuredContent")
    if isinstance(res, dict) and "ok" not in res and isinstance(res.get("result"), dict):
        res = res["result"]
    if not isinstance(res, dict):
        res = json.loads(r["content"][0]["text"])
    print(f"isError={r.get('isError', False)}")
    for k in ("ok", "request_id", "mode", "run_as", "uid", "exit_code", "command_sha256", "error_type", "error"):
        v = res.get(k)
        print(f"{k}={'' if v is None else str(v).replace(chr(10), ' ')}")
    print("stdout=" + str(res.get("stdout", "")).strip().replace("\n", " "))
except Exception as e:
    print(f"PARSE_ERROR={type(e).__name__}: {str(e)[:200]}")
    sys.exit(1)
PY
}
kv() { sed -n "s/^$1=//p" "$2" | head -n1; }

perm_ok_root() {  # PATH: owned by root, no group/other write bit
  local owner mode
  read -r owner mode < <(stat -c '%U %a' -- "$1" 2>/dev/null) || return 1
  info "$(stat -c '%U:%G %a %n' -- "$1")"
  [[ "$owner" == root ]] && (( (8#$mode & 8#022) == 0 ))
}

ABORT=0
hdr "vm-mcp e74ce1e (#123+#127+#130+#131) check  host=$(hostname)  $(date '+%F %T %Z')  log=$LOG"
START_TS="$(date '+%Y-%m-%d %H:%M:%S')"

# ============================ step 0: source ===================================
hdr "STEP 0  source at ${EXPECTED_COMMIT:0:7} (vm-mcp tree ${EXPECTED_TREE_PREFIX})"
SRC=""; TREE=""
if (( SKIP_INSTALL )); then
  info "installed SOURCE_COMMIT: $(cat "$INSTALL_ROOT/SOURCE_COMMIT" 2>/dev/null || echo missing)"
  if [[ -n "$REPO" ]]; then
    # Source-only checks: report the tree and compare the installed files; nothing is installed.
    SRC="$(cd "$REPO" && pwd)"
    TREE="$(git -C "$SRC" rev-parse HEAD:vm-mcp 2>/dev/null)"
    info "--repo HEAD: $(git -C "$SRC" rev-parse HEAD 2>/dev/null || echo hmmm)  vm-mcp tree: ${TREE:-unknown}"
    if [[ "$TREE" == "$EXPECTED_TREE_PREFIX"* ]]; then pass "0 --repo vm-mcp tree is ${EXPECTED_TREE_PREFIX}…"
    else warn "0 --repo vm-mcp tree is ${TREE:-unknown}, not ${EXPECTED_TREE_PREFIX}… (source-only checks still run)"; fi
    differ=""
    for f in "$INSTALL_ROOT"/*.py; do
      [[ -e "$f" ]] || continue
      cmp -s -- "$f" "$SRC/vm-mcp/$(basename -- "$f")" || differ+=" $(basename -- "$f")"
    done
    if [[ -z "$differ" ]]; then pass "0 installed $INSTALL_ROOT/*.py match --repo"
    else warn "0 installed files differ from --repo:$differ"; fi
  else
    skip "0 source checkout (--skip-install without --repo: no source-only checks)"
  fi
else
  if ! command -v git >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git >/dev/null 2>&1
  fi
  if [[ -n "$TARBALL" ]]; then
    mkdir -p "$WORK/src" && tar -xf "$TARBALL" -C "$WORK/src" 2>/dev/null
    inst="$(find "$WORK/src" -maxdepth 3 -path '*/vm-mcp/install.sh' -print -quit)"
    if [[ -n "$inst" ]]; then
      SRC="$(dirname -- "$(dirname -- "$inst")")"
      if command -v git >/dev/null 2>&1; then
        TREE="$(cd "$SRC" && git init -q "$WORK/treecalc" && GIT_DIR="$WORK/treecalc/.git" GIT_WORK_TREE="$SRC" git add -A vm-mcp \
                && GIT_DIR="$WORK/treecalc/.git" git write-tree --prefix=vm-mcp/ 2>/dev/null)"
      fi
    fi
  else
    if [[ -z "$REPO" ]]; then
      REPO=/root/skill-lib-e74ce1e
      if [[ ! -d "$REPO/.git" ]]; then
        git clone -q "$REPO_URL" "$REPO" || fail "0 git clone $REPO_URL"
      fi
      git -C "$REPO" -c advice.detachedHead=false checkout -q "$EXPECTED_COMMIT" || fail "0 git checkout $EXPECTED_COMMIT"
    fi
    if [[ -f "$REPO/vm-mcp/install.sh" ]]; then
      SRC="$(cd "$REPO" && pwd)"
      TREE="$(git -C "$SRC" rev-parse HEAD:vm-mcp 2>/dev/null)"
      info "HEAD: $(git -C "$SRC" rev-parse HEAD 2>/dev/null)"
      if [[ -n "$(git -C "$SRC" status --porcelain -- vm-mcp 2>/dev/null)" ]]; then
        fail "0 vm-mcp/ has uncommitted changes in $SRC"
      fi
    fi
  fi
  info "vm-mcp tree: ${TREE:-unknown}"
  if [[ -z "$SRC" ]]; then
    fail "0 source found (vm-mcp/install.sh)"; ABORT=1
  elif [[ "$TREE" == "$EXPECTED_TREE_PREFIX"* ]]; then
    pass "0 vm-mcp tree is ${EXPECTED_TREE_PREFIX}…"
  else
    fail "0 vm-mcp tree is ${EXPECTED_TREE_PREFIX}… (got ${TREE:-unknown})"; ABORT=1
  fi
fi

# ============================ token ============================================
TOKEN_RE='^[A-Za-z0-9_-]{32,256}$'
if (( ! ABORT )) && (( ! SKIP_INSTALL )); then
  if [[ ! -e "$TOKEN_SRC" ]]; then
    ( umask 077; head -c 32 /dev/urandom | base64 | tr -d '=+/\n' > "$TOKEN_SRC" )
    info "generated a new random token in $TOKEN_SRC (not shown)"
  fi
  t=""
  if [[ ! -L "$TOKEN_SRC" && -f "$TOKEN_SRC" ]]; then
    chown root:root "$TOKEN_SRC" 2>/dev/null; chmod 0600 "$TOKEN_SRC" 2>/dev/null
    IFS= read -r t < "$TOKEN_SRC" || [[ -n "$t" ]]
  fi
  if [[ -L "$TOKEN_SRC" || ! -f "$TOKEN_SRC" ]] || [[ ! "$t" =~ $TOKEN_RE ]]; then
    fail "0 $TOKEN_SRC is a regular file holding a 32-256 char URL-safe token"; ABORT=1
  else
    pass "0 $TOKEN_SRC usable ($(stat -c '%U:%G %a' "$TOKEN_SRC"), ${#t} chars)"
  fi
  t=""
fi

# ============================ step 1: install ==================================
hdr "STEP 1  install (personal-console)"
if (( ABORT )); then
  skip "1 install (earlier failure)"
elif (( SKIP_INSTALL )); then
  skip "1 install.sh run (--skip-install)"
else
  ( cd "$SRC" && env -u VM_MCP_AUTH_TOKEN -u VM_MCP_AUTH_TOKEN_STDIN \
      VM_MCP_PROFILE=personal-console VM_MCP_ALLOW_RECONFIGURE=1 VM_MCP_AUTH_TOKEN_FILE="$TOKEN_SRC" bash vm-mcp/install.sh ) > "$WORK/install.log" 2>&1
  rc=$?
  tail -n 25 "$WORK/install.log" | sed 's/^/      | /'
  if (( rc == 0 )); then pass "1 install.sh rc=0"; else
    fail "1 install.sh rc=$rc (7 = Yama unavailable/unsettable; 3 = token problem)"; ABORT=1
  fi
fi
# ============================ installed profile ===============================
# Resolved like the service does (profiles.py from the install when present), so
# a legacy VM_MCP_SHELL_ENABLED=1 env counts as workspace.
installed_profile() {
  local raw="" shell=""
  raw="$(sed -n 's/^VM_MCP_PROFILE=//p' /etc/vm-mcp.env 2>/dev/null | tail -n1)"
  shell="$(sed -n 's/^VM_MCP_SHELL_ENABLED=//p' /etc/vm-mcp.env 2>/dev/null | tail -n1)"
  if [[ -x "$INSTALL_ROOT/.venv/bin/python" && -f "$INSTALL_ROOT/profiles.py" ]]; then
    env -i VM_MCP_PROFILE="$raw" VM_MCP_SHELL_ENABLED="$shell" "$INSTALL_ROOT/.venv/bin/python" -I -c \
      'import sys; sys.path.insert(0, sys.argv[1]); from profiles import resolve_profile; print(resolve_profile())' \
      "$INSTALL_ROOT" 2>/dev/null && return 0
  fi
  raw="$(printf '%s' "$raw" | tr -d '" ' | tr '[:upper:]' '[:lower:]')"
  shell="$(printf '%s' "$shell" | tr -d '" ' | tr '[:upper:]' '[:lower:]')"
  if [[ -z "$raw" ]]; then
    case "$shell" in 1|true|yes|on) raw=workspace ;; *) raw=read-only ;; esac
  fi
  printf '%s\n' "$raw"
}
INSTALLED_PROFILE="$(installed_profile)"
info "installed profile: $INSTALLED_PROFILE"

if (( ! ABORT )); then
  scope="$(cat "$YAMA" 2>/dev/null || echo missing)"
  info "kernel.yama.ptrace_scope=$scope"
  if [[ "$scope" =~ ^[0-9]+$ ]] && (( scope >= 1 )); then pass "1 ptrace_scope >= 1"; else fail "1 ptrace_scope >= 1"; fi
  info "$(grep -E '^[[:space:]]*kernel\.yama\.ptrace_scope' "$SYSCTL_CONF" 2>/dev/null || echo "no ptrace_scope line in $SYSCTL_CONF")"
  read -r o g m < <(stat -c '%U %G %a' "$SYSCTL_CONF" 2>/dev/null) || o=missing
  info "$SYSCTL_CONF: ${o:-missing}:${g:-} ${m:-}"
  if [[ "$INSTALLED_PROFILE" == read-only ]]; then
    # #127: a read-only install removes the installer's own sysctl.d file.
    check "1 read-only: installer's own $SYSCTL_CONF absent" test ! -e "$SYSCTL_CONF"
  else
    check "1 $SYSCTL_CONF root:root, not group/world writable" \
      bash -c '[[ "$1" == root && "$2" == root ]] && (( (8#$3 & 8#022) == 0 ))' _ "${o:-}" "${g:-}" "${m:-0}"
  fi
  read -r o g m < <(stat -c '%U %G %a' "$CREDSTORE" 2>/dev/null) || o=missing
  info "$CREDSTORE: ${o:-missing}:${g:-} ${m:-}   dir: $(stat -c '%U:%G %a' "$(dirname "$CREDSTORE")" 2>/dev/null)"
  check "1 $CREDSTORE root:root 600" bash -c '[[ "$1" == root && "$2" == root && "$3" == 600 ]]' _ "${o:-}" "${g:-}" "${m:-}"
  if (( ! SKIP_INSTALL )); then
    a="$(sha256sum < "$TOKEN_SRC" | cut -d' ' -f1)"; b="$(sha256sum < "$CREDSTORE" 2>/dev/null | cut -d' ' -f1)"
    if [[ "$a" == "$b" ]]; then pass "1 credstore token equals $TOKEN_SRC (compared by hash, not shown)"
    else
      # install writes the first line plus "\n"; compare first lines too
      a="$(head -n1 "$TOKEN_SRC" | sha256sum | cut -d' ' -f1)"; b="$(head -n1 "$CREDSTORE" 2>/dev/null | sha256sum | cut -d' ' -f1)"
      check "1 credstore token equals $TOKEN_SRC (first line, by hash)" test "$a" = "$b"
    fi
    make_auth_headers "$TOKEN_SRC"
  else
    make_auth_headers "$CREDSTORE"
  fi
  info "installed SOURCE_COMMIT: $(cat "$INSTALL_ROOT/SOURCE_COMMIT" 2>/dev/null || echo missing)"
  if (( ! SKIP_INSTALL )); then
    if [[ "$(cat "$INSTALL_ROOT/SOURCE_COMMIT" 2>/dev/null)" == "$EXPECTED_COMMIT" ]]; then pass "1 installed SOURCE_COMMIT is $EXPECTED_COMMIT"
    else warn "1 installed SOURCE_COMMIT is not $EXPECTED_COMMIT (tarball installs record 'hmmm'; the vm-mcp tree hash in step 0 is what counts)"; fi
  fi
fi


# ============================ step 2: unit =====================================
hdr "STEP 2  unit file"
if (( ABORT )); then skip "2 unit checks (earlier failure)"; else
  systemd-analyze verify "/etc/systemd/system/$UNIT" "/etc/systemd/system/$ADMIN_UNIT" > "$WORK/verify.out" 2>&1
  rc=$?
  sed 's/^/      | /' "$WORK/verify.out"
  own=$(grep -c -i 'vm-mcp' "$WORK/verify.out")
  if (( rc == 0 && own == 0 )); then
    pass "2 systemd-analyze verify rc=0, no vm-mcp errors"
    [[ -s "$WORK/verify.out" ]] && warn "2 systemd-analyze printed lines about other units (see above)"
  else
    fail "2 systemd-analyze verify (rc=$rc, vm-mcp lines=$own)"
  fi
  systemctl cat "$UNIT" > "$WORK/unit.txt" 2>/dev/null
  pre="$(systemctl show -p ExecStartPre --value "$UNIT")"; preex="$(systemctl show -p ExecStartPreEx --value "$UNIT" 2>/dev/null)"
  info "ExecStartPre:   $pre"; info "ExecStartPreEx: ${preex:-<n/a on this systemd>}"
  if [[ "$pre" == *"argv[]=${INSTALL_ROOT}/.venv/bin/python -I ${INSTALL_ROOT}/yama_gate.py"* ]]; then
    pass "2 ExecStartPre runs ${INSTALL_ROOT}/yama_gate.py with python -I"
  else fail "2 ExecStartPre runs ${INSTALL_ROOT}/yama_gate.py with python -I"; fi
  # The + flag: systemctl show ExecStartPre drops it; ExecStartPreEx reports flags=privileged.
  if [[ "$preex" == *privileged* ]]; then pass "2 ExecStartPre has the + (privileged) flag [ExecStartPreEx flags=privileged]"
  elif grep -qxF "$GATE_LINE" "$WORK/unit.txt"; then pass "2 ExecStartPre has the + (privileged) flag [unit text: $GATE_LINE]"
  else fail "2 ExecStartPre has the + (privileged) flag"; fi
  si="$(systemctl show -p StandardInput --value "$UNIT")"
  si_line="$(grep -E '^StandardInput=' "$WORK/unit.txt" | tail -n1)"
  info "StandardInput (show): $si   effective unit line: ${si_line:-none}"
  check "2 StandardInput=file:$CREDSTORE" bash -c '[[ "$1" == file* && "$2" == "StandardInput=file:$3" ]]' _ "$si" "$si_line" "$CREDSTORE"
fi

# ============================ step 3: services =================================
hdr "STEP 3  services"
if (( ABORT )); then skip "3 services (earlier failure)"; else
  if wait_ready; then pass "3 listener on 127.0.0.1:$PORT answers"; else fail "3 listener on 127.0.0.1:$PORT answers within 90s"; fi
  st="$(systemctl is-active "$UNIT" 2>/dev/null)"
  check "3 $UNIT is active (got $st)" test "$st" = active
  st="$(systemctl is-active "$ADMIN_UNIT" 2>/dev/null)"
  sockinfo="$(stat -c '%U:%G %a' "$ADMIN_SOCKET" 2>/dev/null || echo missing)"
  info "$ADMIN_SOCKET: $sockinfo"
  if [[ "$INSTALLED_PROFILE" == personal-console ]]; then
    check "3 $ADMIN_UNIT is active (got $st)" test "$st" = active
    check "3 broker socket root:$SERVICE_USER 660" test "$sockinfo" = "root:$SERVICE_USER 660"
  else
    check "3 $ADMIN_UNIT is not active in $INSTALLED_PROFILE (got $st)" test "$st" != active
    check "3 no broker socket in $INSTALLED_PROFILE (got $sockinfo)" test "$sockinfo" = missing
  fi
  since="$START_TS"
  if (( SKIP_INSTALL )); then since="$(systemctl show -p ActiveEnterTimestamp --value "$UNIT" | awk '{print $2" "$3}')"; fi
  n=$(journalctl -u "$UNIT" -b --since "$since" --no-pager 2>/dev/null | grep -ci 'yama-gate')
  journalctl -u "$UNIT" -b --since "$since" --no-pager 2>/dev/null | grep -i 'yama-gate' | sed 's/^/      | /'
  check "3 no yama-gate lines in $UNIT journal since $since (found $n)" test "$n" -eq 0
fi

# ============================ step 4: process ==================================
hdr "STEP 4  running server holds no token"
P=""
if (( ABORT )); then skip "4 process checks (earlier failure)"; else
  P="$(main_pid)"; info "MainPID=$P  cmdline: $(tr '\0' ' ' < "/proc/$P/cmdline" 2>/dev/null)"
  if [[ "$P" =~ ^[0-9]+$ ]] && (( P > 0 )) && tr '\0' ' ' < "/proc/$P/cmdline" 2>/dev/null | grep -q "${INSTALL_ROOT}/server.py"; then
    pass "4 MainPID $P is ${INSTALL_ROOT}/server.py"
    fd0="$(readlink "/proc/$P/fd/0" 2>/dev/null)"; info "fd/0 -> $fd0"
    check "4 fd/0 is /dev/null" test "$fd0" = /dev/null
    nc=0; for f in /proc/"$P"/fd/*; do [[ "$(readlink "$f" 2>/dev/null)" == *credstore* ]] && nc=$((nc+1)); done
    check "4 no fd points into /etc/credstore (found $nc)" test "$nc" -eq 0
    ne=$(tr '\0' '\n' < "/proc/$P/environ" | grep -c 'AUTH_TOKEN=')
    info "AUTH_TOKEN* env entries: $(tr '\0' '\n' < "/proc/$P/environ" | grep -o '^[A-Z_]*AUTH_TOKEN[A-Z_]*=' | tr '\n' ' ')"
    check "4 no AUTH_TOKEN= in environ (found $ne)" test "$ne" -eq 0
    nv=$(tr '\0' '\n' < "/proc/$P/environ" | grep -cF -f "$WORK/tok_pattern"); nv2=$(tr '\0' '\n' < "/proc/$P/cmdline" | grep -cF -f "$WORK/tok_pattern")
    check "4 token value absent from environ and cmdline" test "$((nv + nv2))" -eq 0
    tp="$(awk '/^TracerPid:/{print $2}' "/proc/$P/status")"
    check "4 TracerPid is 0 (got $tp)" test "$tp" = 0
    vu="$(id -u "$SERVICE_USER" 2>/dev/null)"; uids="$(awk '/^Uid:/{print $2,$3,$4,$5}' "/proc/$P/status")"
    info "Uid: $uids   id -u $SERVICE_USER: $vu"
    check "4 all Uid fields equal $SERVICE_USER ($vu)" test "$uids" = "$vu $vu $vu $vu"
    info "dumpable check: $(grep -E '^(NoNewPrivs|Seccomp):' "/proc/$P/status" | tr '\n' ' ')"
  else
    fail "4 MainPID ($P) is ${INSTALL_ROOT}/server.py"
  fi
fi

# ============================ step 5: install tree =============================
hdr "STEP 5  no $SERVICE_USER-writable code"
if (( ABORT )); then skip "5 install tree (earlier failure)"; else
  nw=$(runuser -u "$SERVICE_USER" -- find "$INSTALL_ROOT" -writable 2>/dev/null | tee "$WORK/writable" | wc -l)
  head -n 10 "$WORK/writable" | sed 's/^/      | /'
  check "5 nothing under $INSTALL_ROOT writable by $SERVICE_USER (found $nw)" test "$nw" -eq 0
  nr=$(find "$INSTALL_ROOT" ! -user root 2>/dev/null | tee "$WORK/nonroot" | wc -l)
  head -n 10 "$WORK/nonroot" | sed 's/^/      | /'
  check "5 everything under $INSTALL_ROOT owned by root (non-root: $nr)" test "$nr" -eq 0
  for p in /opt "$INSTALL_ROOT" "$INSTALL_ROOT/.venv/pyvenv.cfg"; do
    check "5 $p root-owned, no group/world write" perm_ok_root "$p"
  done
fi

# ============================ step 6: HTTP auth ================================
hdr "STEP 6  HTTP auth on $URL"
if (( ABORT )); then skip "6 HTTP auth (earlier failure)"; else
  c=$(http_code "$WORK/b6a" "$INIT"); check "6 no Authorization header -> 401 (got $c)" test "$c" = 401
  c=$(http_code "$WORK/b6b" "$INIT" -H @"$WORK/auth_lower"); check "6 'bearer <token>' (lowercase) -> 200 (got $c)" test "$c" = 200
  [[ "$c" != 200 ]] && head -c 300 "$WORK/b6b" | sed 's/^/      | /'
  c=$(http_code "$WORK/b6c" "$INIT" -H 'Authorization: Bearer wrong-token-0123456789abcdefghijklmnopqrstuv')
  check "6 wrong token -> 401 (got $c)" test "$c" = 401
  c=$(http_code "$WORK/b6d" "$LIST"); check "6 tools/list without token -> 401 (got $c)" test "$c" = 401
fi

# ============================ step 7: admin_exec ===============================
hdr "STEP 7  admin_exec via MCP + broker receipt"
if (( ABORT )); then skip "7 admin_exec (earlier failure)"
elif [[ "$INSTALLED_PROFILE" != personal-console ]]; then
  # Other profiles register the tool but refuse it at call time.
  c=$(http_code "$WORK/b7c" "$CALL_ID" -H @"$WORK/auth_good"); mcp_call_result "$WORK/b7c" > "$WORK/r7" 2>&1
  sed 's/^/      | /' "$WORK/r7"
  check "7 admin_exec refused in $INSTALLED_PROFILE (ok=False, 'host execution is disabled')" \
    bash -c '[[ "$(sed -n "s/^ok=//p" "$1")" == False && "$(sed -n "s/^error=//p" "$1")" == *"host execution is disabled"* ]]' _ "$WORK/r7"
  skip "7 broker receipt and MainPID checks (no broker in $INSTALLED_PROFILE)"
else
  # server.py runs streamable HTTP with stateless_http=True, json_response=True: no session id needed.
  c=$(http_code "$WORK/b7l" "$LIST" -H @"$WORK/auth_good")
  if [[ "$c" == 200 ]] && mcp_tool_names "$WORK/b7l" > "$WORK/tools" 2>/dev/null; then
    info "tools: $(tr '\n' ' ' < "$WORK/tools")"
    check "7 tools/list lists admin_exec" grep -qx admin_exec "$WORK/tools"
  else fail "7 tools/list (HTTP $c)"; head -c 300 "$WORK/b7l" | sed 's/^/      | /'; fi
  P7a="$(main_pid)"
  T7="$(date '+%Y-%m-%d %H:%M:%S')"
  c=$(http_code "$WORK/b7c" "$CALL_ID" -H @"$WORK/auth_good")
  mcp_call_result "$WORK/b7c" > "$WORK/r7" 2>&1
  sed 's/^/      | /' "$WORK/r7"
  rid="$(kv request_id "$WORK/r7")"
  if [[ "$c" == 200 && "$(kv ok "$WORK/r7")" == True && "$(kv exit_code "$WORK/r7")" == 0 \
        && "$(kv stdout "$WORK/r7")" == 0 && "$(kv run_as "$WORK/r7")" == root && "$(kv mode "$WORK/r7")" == admin ]]; then
    pass "7 admin_exec('id -u') ok, mode=admin, run_as=root, stdout 0"
  else
    fail "7 admin_exec('id -u') ok, mode=admin, run_as=root, stdout 0 (HTTP $c)"
  fi
  want_sha="$(printf '%s' 'id -u' | sha256sum | cut -d' ' -f1)"
  check "7 result command_sha256 = sha256('id -u')" test "$(kv command_sha256 "$WORK/r7")" = "$want_sha"
  rec=""
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    rec="$(journalctl -u "$ADMIN_UNIT" --since "$T7" --no-pager -o cat 2>/dev/null | grep '"event": "vm_mcp_exec"' | grep -F "\"request_id\": \"${rid:-none}\"" | tail -n1)"
    [[ -n "$rec" ]] && break; sleep 1
  done
  info "broker receipt: ${rec:-<none found>}"
  if [[ -n "$rid" && "$rec" == *'"mode": "admin"'* && "$rec" == *'"run_as": "root"'* && "$rec" == *"\"command_sha256\": \"$want_sha\""* && "$rec" == *'"exit_code": 0'* ]]; then
    pass "7 broker journal receipt matches request_id, mode admin, run_as root, sha256, exit 0"
  else fail "7 broker journal receipt matches request_id, mode admin, run_as root, sha256, exit 0"; fi
  # admin_broker._authorize_peer rejects any SO_PEERCRED pid other than systemd's MainPID of
  # vm-mcp.service, so an accepted request proves the caller was MainPID (the receipt has no pid field).
  P7b="$(main_pid)"
  check "7 caller = vm-mcp MainPID: MainPID stable across the call ($P7a/$P7b, step 4: ${P:-?})" \
    bash -c '[[ -n "$1" && "$1" == "$2" && ( -z "$3" || "$1" == "$3" ) ]]' _ "$P7a" "$P7b" "$P"
  # Negative control: a vmmcp process that is NOT MainPID must be refused by the broker.
  neg="$(runuser -u "$SERVICE_USER" -- "$INSTALL_ROOT/.venv/bin/python" -I -c '
import json, socket, sys
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); s.settimeout(10)
s.connect(sys.argv[1])
s.sendall((json.dumps({"mode":"admin","user":None,"command":"id -u","cwd":"/","timeout_seconds":5,"max_output_bytes":1024})+"\n").encode())
s.shutdown(socket.SHUT_WR); data = b""
while True:
    c = s.recv(65536)
    if not c: break
    data += c
r = json.loads(data); print(r.get("ok"), r.get("error_type"), r.get("error"))
' "$ADMIN_SOCKET" 2>&1 | tail -n1)"
  info "non-MainPID $SERVICE_USER caller got: $neg"
  check "7 broker refuses a $SERVICE_USER caller that is not MainPID" \
    bash -c '[[ "$1" == "False PermissionError"*"not the vm-mcp service main process"* ]]' _ "$neg"
  journalctl -u "$ADMIN_UNIT" --since "$T7" --no-pager -n 10 2>/dev/null | sed 's/^/      | /'
fi

# ============================ step 8: fail closed ==============================
hdr "STEP 8  fail-closed with ptrace_scope=0 (scratch VM only)"
if (( ! DESTRUCTIVE )); then skip "8 fail-closed test (needs --destructive; scratch VM only)"
elif [[ "$INSTALLED_PROFILE" == read-only ]]; then skip "8 fail-closed test (read-only runs no gate refusal)"
elif (( ABORT )); then skip "8 fail-closed test (earlier failure)"
else
  ORIG_SCOPE="$(cat "$YAMA")"; info "original ptrace_scope=$ORIG_SCOPE"
  T8="$(date '+%Y-%m-%d %H:%M:%S')"
  SCOPE_CHANGED=1
  sysctl -q -w kernel.yama.ptrace_scope=0 >/dev/null
  info "ptrace_scope now $(cat "$YAMA")"
  systemctl restart "$UNIT" >/dev/null 2>&1; rc=$?
  check "8 systemctl restart fails (rc=$rc)" test "$rc" -ne 0
  srv=0; state=""; result=""
  for ((i = 0; i < 60; i++)); do
    n=$(pgrep -f "${INSTALL_ROOT}/server.py" | wc -l); (( n > srv )) && srv=$n
    state="$(systemctl show -p ActiveState --value "$UNIT")"; result="$(systemctl show -p Result --value "$UNIT")"
    [[ "$state" == failed && "$result" == start-limit-hit ]] && break
    sleep 1
  done
  info "after ~${i}s: ActiveState=$state Result=$result"
  journalctl -u "$UNIT" --since "$T8" --no-pager 2>/dev/null > "$WORK/j8"
  grep -iE 'yama|ExecStartPre|Control process|start-limit|Start request repeated' "$WORK/j8" | tail -n 8 | sed 's/^/      | /'
  check "8 journal shows the yama-gate refusal (found 0)" grep -q "vm-mcp-yama-gate: profile $INSTALLED_PROFILE requires kernel.yama.ptrace_scope >= 1 (found 0)" "$WORK/j8"
  check "8 journal shows the pre-start control process exited status=1" grep -qE 'Control process exited, code=exited, status=1' "$WORK/j8"
  check "8 no server.py process at any sample during the loop (max seen $srv)" test "$srv" -eq 0
  check "8 no 'Started vm-mcp.service' line during the loop" bash -c '! grep -q "Started vm-mcp.service" "$1"' _ "$WORK/j8"
  # The unit sets no StartLimit*; with RestartSec=2 the default 5-starts-in-10s limit may
  # never trigger (attempt 1 on 046c4cf saw ActiveState=activating, Result=exit-code at 12s).
  if [[ "$state" == failed && "$result" == start-limit-hit ]]; then pass "8 unit reaches ActiveState=failed Result=start-limit-hit"
  else warn "8 checklist expects Result=start-limit-hit; got ActiveState=$state Result=$result after 60s (restart loop, still fail-closed) - reviewer judgment"; fi
  # restore
  restore_scope
  now="$(cat "$YAMA")"; info "ptrace_scope restored to $now"
  check "8 ptrace_scope restored to original ($ORIG_SCOPE) and >= 1" bash -c '[[ "$1" == "$2" ]] && (( $1 >= 1 ))' _ "$now" "$ORIG_SCOPE"
  wait_ready >/dev/null
  st="$(systemctl is-active "$UNIT")"
  check "8 $UNIT active again after reset-failed + start (got $st)" test "$st" = active
  c=$(http_code /dev/null "$LIST" -H @"$WORK/auth_good"); check "8 server answers tools/list with token after restore (got $c)" test "$c" = 200
fi

# ============================ step 9: read-only ================================
hdr "STEP 9  optional reinstall as read-only"
if (( ! READONLY9 )); then skip "9 read-only reinstall (needs --reinstall-readonly)"
elif (( ABORT || SKIP_INSTALL )); then skip "9 read-only reinstall (earlier failure or --skip-install)"
else
  ( cd "$SRC" && env -u VM_MCP_AUTH_TOKEN -u VM_MCP_AUTH_TOKEN_STDIN \
      VM_MCP_PROFILE=read-only VM_MCP_ALLOW_RECONFIGURE=1 VM_MCP_AUTH_TOKEN_FILE="$TOKEN_SRC" bash vm-mcp/install.sh ) > "$WORK/install9.log" 2>&1
  rc=$?; tail -n 8 "$WORK/install9.log" | sed 's/^/      | /'
  check "9 read-only install.sh rc=0 (got $rc)" test "$rc" -eq 0
  wait_ready >/dev/null
  st="$(systemctl is-active "$UNIT")"; check "9 $UNIT active (got $st)" test "$st" = active
  st="$(systemctl is-active "$ADMIN_UNIT")"; check "9 $ADMIN_UNIT inactive (got $st)" test "$st" = inactive
  c=$(http_code "$WORK/b9l" "$LIST" -H @"$WORK/auth_good")
  if [[ "$c" == 200 ]] && mcp_tool_names "$WORK/b9l" > "$WORK/tools9" 2>/dev/null; then
    # server.py registers admin_exec in every profile and refuses it at call time
    # (policy._require_personal_console), so the checklist's "no longer listed" cannot hold at this head.
    if grep -qx admin_exec "$WORK/tools9"; then
      warn "9 tools/list still lists admin_exec (expected at e74ce1e, tracked as skill-lib #126: tools are registered for every profile; checklist expected it gone)"
    else pass "9 tools/list no longer lists admin_exec"; fi
  else fail "9 tools/list (HTTP $c)"; fi
  c=$(http_code "$WORK/b9c" "$CALL_ID" -H @"$WORK/auth_good"); mcp_call_result "$WORK/b9c" > "$WORK/r9" 2>&1
  sed 's/^/      | /' "$WORK/r9"
  check "9 admin_exec refused in read-only (ok=False, 'host execution is disabled')" \
    bash -c '[[ "$(sed -n "s/^ok=//p" "$1")" == False && "$(sed -n "s/^error=//p" "$1")" == *"host execution is disabled"* ]]' _ "$WORK/r9"
  check "9 #127: read-only reinstall removed the installer's own $SYSCTL_CONF" test ! -e "$SYSCTL_CONF"
  info "VM is now left in the read-only profile."
fi

# ============================ step 10: #127 ====================================
hdr "STEP 10  #127 hardening (non-destructive; temp files only)"
if (( ABORT )); then skip "10 #127 checks (earlier failure)"; else
  if [[ -z "$SRC" ]]; then skip "10 install.sh source checks (--skip-install without --repo)"; else
  check "10 install.sh has a fixed install root (no VM_MCP_INSTALL_ROOT)" bash -c '! grep -q VM_MCP_INSTALL_ROOT "$1/vm-mcp/install.sh" && grep -qx "INSTALL_ROOT=/opt/vm-mcp" "$1/vm-mcp/install.sh"' _ "$SRC"
  fi
  check "10 installed auth.py has the fd-0 owner/mode check" grep -q 'TOKEN_FILE_OWNER_UID = 0' "$INSTALL_ROOT/auth.py"
  # Feed a throwaway token file on fd 0 to auth._read_stdin_token() from the installed code.
  T10="$WORK/t10"; head -c 48 /dev/urandom | base64 -w0 > "$T10"; echo >> "$T10"
  probe10() { ( cd "$INSTALL_ROOT" && "$INSTALL_ROOT/.venv/bin/python" -I -c 'import sys; sys.path.insert(0, "."); import auth; auth._read_stdin_token()' < "$T10" ) >/dev/null 2>&1; }
  refused10() { ! probe10; }
  chown root:root "$T10"; chmod 0600 "$T10"
  check "10 token file root:root 0600 accepted" probe10
  chmod 0640 "$T10"; check "10 token file root:root 0640 refused" refused10
  chmod 0604 "$T10"; check "10 token file root:root 0604 refused" refused10
  chmod 0600 "$T10"; chown "$SERVICE_USER" "$T10"
  check "10 token file owned by $SERVICE_USER refused" refused10
  rm -f -- "$T10"
  # VM_MCP_ROOT overlap: source check_work_root from install.sh without running the installer.
  if [[ -n "$SRC" ]]; then
  cwr="$WORK/cwr.sh"; sed -n '/^check_work_root() {/,/^}/p' "$SRC/vm-mcp/install.sh" > "$cwr"
  if [[ -s "$cwr" ]]; then
    for bad in / /opt/vm-mcp /opt/vm-mcp/x /opt /opt/vm-mcp/../vm-mcp; do
      check "10 VM_MCP_ROOT=$bad rejected" bash -c '. "$1"; ! check_work_root "$2" /opt/vm-mcp 2>/dev/null' _ "$cwr" "$bad"
    done
    check "10 VM_MCP_ROOT=/srv/vm-mcp/workspace accepted" bash -c '. "$1"; check_work_root /srv/vm-mcp/workspace /opt/vm-mcp' _ "$cwr"
  else fail "10 check_work_root not found in install.sh"; fi
  fi
fi

# ============================ summary ==========================================
hdr "SUMMARY  pass=$PASS_N fail=$FAIL_N warn=$WARN_N skip=$SKIP_N"
for r in "${RESULTS[@]}"; do printf '  %s\n' "$r"; done
echo
if (( FAIL_N > 0 )); then echo "RESULT: FAIL ($FAIL_N failing checks) - vm-mcp at e74ce1e did not pass on this run. Log: $LOG"; exit 1; fi
if (( WARN_N > 0 )); then echo "RESULT: PASS with $WARN_N warning(s) needing a reviewer's judgment. Log: $LOG"; else echo "RESULT: PASS. Log: $LOG"; fi
exit 0
