"""Installer behaviour when rerun on a VM that already has vm-mcp installed.

Usage: PYTHONPATH=vm-mcp python -m unittest discover -s vm-mcp/tests
install.sh functions are extracted and run without root against temp paths and
stub commands; nothing touches the real system.
"""
from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INSTALLER = ROOT / "install.sh"
SETTINGS = ("read_previous_env", "resolve_previous_profile", "choose_settings")


def run_functions(body: str, names: tuple[str, ...], *, env: dict[str, str] | None = None,
                  path_prefix: str | None = None) -> subprocess.CompletedProcess:
    extract = "; ".join(f"source <(sed -n '/^{name}() {{/,/^}}/p' \"$1\")" for name in names)
    base = {k: v for k, v in os.environ.items() if not k.startswith("VM_MCP_")}
    base["PATH"] = f"{path_prefix}:{base['PATH']}" if path_prefix else base["PATH"]
    return subprocess.run(["bash", "-c", f"set -u; {extract}; {body}", "installer", str(INSTALLER)],
                          env=dict(base, **(env or {})), capture_output=True, text=True)


class TempDirCase(unittest.TestCase):
    def tmp(self) -> Path:
        directory = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, directory, True)
        return directory


class RerunDefaultsTests(TempDirCase):
    def settings(self, env_file: str | None, **env: str) -> subprocess.CompletedProcess:
        directory = self.tmp()
        path = directory / "vm-mcp.env"
        if env_file is not None:
            path.write_text(env_file, encoding="utf-8")
        body = (f'ENV_FILE="{path}"; INSTALL_ROOT="{directory}/opt"; SOURCE_ROOT="{ROOT}"; '
                'choose_settings; rc=$?; echo "rc=$rc"; '
                'printf "root=%s\\nprofile=%s\\nport=%s\\nsocket=%s\\n" "${WORK_ROOT-}" "${PROFILE-}" "${PORT-}" "${ADMIN_SOCKET-}"')
        return run_functions(body, SETTINGS, env=env)

    def values(self, result: subprocess.CompletedProcess) -> dict[str, str]:
        return dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)

    def test_fresh_install_keeps_the_old_defaults(self) -> None:
        values = self.values(self.settings(None))
        self.assertEqual({"rc": "0", "root": "/srv/vm-mcp/workspace", "profile": "read-only", "port": "8765",
                          "socket": "/run/vm-mcp/admin.sock"}, values)

    def test_rerun_defaults_come_from_the_existing_env_file(self) -> None:
        env_file = ('VM_MCP_ROOT="/data/a \\"b\\" \\\\c"\nVM_MCP_PROFILE=personal-console\nVM_MCP_PORT=9001\n'
                    'VM_MCP_ADMIN_SOCKET="/run/x/admin.sock"\n')
        result = self.settings(env_file)
        values = self.values(result)
        self.assertEqual("0", values["rc"], result.stderr)
        self.assertEqual('/data/a "b" \\c', values["root"])
        self.assertEqual(("personal-console", "9001", "/run/x/admin.sock"),
                         (values["profile"], values["port"], values["socket"]))
        self.assertIn("existing install found", result.stderr)
        # Restating the same values is not a change.
        result = self.settings(env_file, VM_MCP_PROFILE="personal-console", VM_MCP_ROOT='/data/a "b" \\c/')
        self.assertEqual("0", self.values(result)["rc"], result.stderr)

    def test_changing_root_or_profile_needs_the_explicit_flag(self) -> None:
        env_file = 'VM_MCP_ROOT="/srv/vm-mcp/workspace"\nVM_MCP_PROFILE=workspace\nVM_MCP_PORT=8765\n'
        for env, word in (({"VM_MCP_PROFILE": "read-only"}, "VM_MCP_PROFILE"),
                          ({"VM_MCP_ROOT": "/srv/other"}, "VM_MCP_ROOT")):
            with self.subTest(env=env):
                result = self.settings(env_file, **env)
                self.assertEqual("3", self.values(result)["rc"])
                self.assertIn(f"ERROR: {word}", result.stderr)
                self.assertIn("VM_MCP_ALLOW_RECONFIGURE=1", result.stderr)
                allowed = self.settings(env_file, VM_MCP_ALLOW_RECONFIGURE="1", **env)
                self.assertEqual("0", self.values(allowed)["rc"], allowed.stderr)
        result = self.settings(env_file, VM_MCP_ALLOW_RECONFIGURE="yes", VM_MCP_PROFILE="read-only")
        self.assertEqual("3", self.values(result)["rc"])
        self.assertIn("must be unset or 1", result.stderr)

    def test_legacy_shell_flag_resolves_through_profiles_and_is_not_downgraded(self) -> None:
        legacy = 'VM_MCP_ROOT="/srv/vm-mcp/workspace"\nVM_MCP_SHELL_ENABLED=1\nVM_MCP_PORT=8765\n'
        result = self.settings(legacy)
        self.assertEqual("workspace", self.values(result)["profile"], result.stderr)
        result = self.settings(legacy, VM_MCP_PROFILE="read-only")
        self.assertEqual("3", self.values(result)["rc"])  # a downgrade is a profile change
        result = self.settings('VM_MCP_PROFILE=" Personal-Console "\n')
        self.assertEqual("personal-console", self.values(result)["profile"], result.stderr)
        result = self.settings("VM_MCP_PROFILE=root\n")
        self.assertEqual("3", self.values(result)["rc"])
        self.assertIn("unknown profile", result.stderr)

    def test_installer_resolves_with_profiles_py_and_writes_the_resolved_profile(self) -> None:
        text = INSTALLER.read_text(encoding="utf-8")
        self.assertIn('"$python" -I "$SOURCE_ROOT/profiles.py"', text)
        self.assertIn("VM_MCP_PROFILE=$PROFILE\n", text)
        self.assertLess(text.index("choose_settings || exit 3"), text.index('check_work_root "$WORK_ROOT"'))
        result = subprocess.run([sys.executable, "-I", str(ROOT / "profiles.py")],
                                env={"VM_MCP_SHELL_ENABLED": "1"}, capture_output=True, text=True)
        self.assertEqual("workspace\n", result.stdout)
        result = subprocess.run([sys.executable, "-I", str(ROOT / "profiles.py")],
                                env={"VM_MCP_PROFILE": "bogus"}, capture_output=True, text=True)
        self.assertEqual(2, result.returncode)


class BusyServiceUserTests(TempDirCase):
    def run_user_step(self, current_home: str | None, work_root: str = "/srv/w") -> tuple[subprocess.CompletedProcess, str]:
        directory = self.tmp()
        bindir = directory / "bin"
        bindir.mkdir()
        log = directory / "calls"
        running = directory / "running"
        running.touch()
        stubs = {
            "id": f'echo "id $*" >> "{log}"; ' + ("exit 0" if current_home is not None else "exit 1"),
            "getent": f'echo "vmmcp:x:999:999::{current_home}:/usr/sbin/nologin"',
            "systemctl": f'echo "systemctl $*" >> "{log}"; [[ "$1" == stop ]] && rm -f "{running}"; exit 0',
            # usermod refuses while the service user has processes, like the real one (exit 8).
            "usermod": f'echo "usermod $*" >> "{log}"; [[ -e "{running}" ]] && {{ echo "usermod: user vmmcp is currently used by process 1" >&2; exit 8; }}; exit 0',
            "useradd": f'echo "useradd $*" >> "{log}"',
        }
        for name, body in stubs.items():
            (bindir / name).write_text("#!/bin/bash\n" + body + "\n", encoding="utf-8")
            (bindir / name).chmod(0o700)
        result = run_functions(f'SERVICE_USER=vmmcp; NOLOGIN=/bin/false; WORK_ROOT="{work_root}"; '
                               'prepare_service_user; echo "rc=$?"', ("prepare_service_user",),
                               path_prefix=str(bindir))
        return result, log.read_text(encoding="utf-8") if log.exists() else ""

    def test_unchanged_home_skips_usermod_and_keeps_services_running(self) -> None:
        result, calls = self.run_user_step("/srv/w/.vm-mcp-home")
        self.assertIn("rc=0", result.stdout, result.stderr)
        self.assertNotIn("usermod", calls)
        self.assertNotIn("systemctl", calls)

    def test_changed_home_stops_both_units_before_usermod(self) -> None:
        result, calls = self.run_user_step("/srv/old/.vm-mcp-home")
        self.assertIn("rc=0", result.stdout, result.stderr)
        lines = calls.splitlines()
        stop = lines.index("systemctl stop vm-mcp.service vm-mcp-admin.service")
        usermod = lines.index("usermod --home /srv/w/.vm-mcp-home vmmcp")
        self.assertLess(stop, usermod)

    def test_new_user_is_created_without_touching_services(self) -> None:
        result, calls = self.run_user_step(None)
        self.assertIn("rc=0", result.stdout, result.stderr)
        self.assertIn("useradd --system --home /srv/w/.vm-mcp-home --shell /bin/false vmmcp", calls)
        self.assertNotIn("systemctl", calls)


class PtraceConfOrderTests(TempDirCase):
    NAMES = ("arm_ptrace_conf_rollback", "on_install_exit", "finish_install")

    def run_install(self, previous: str | None, *, fail: bool) -> tuple[subprocess.CompletedProcess, Path]:
        directory = self.tmp()
        conf = directory / "99-zz-vm-mcp-ptrace.conf"
        if previous is not None:
            conf.write_text(previous, encoding="utf-8")
        body = (f'PTRACE_SYSCTL_CONF="{conf}"; PTRACE_CONF_SAVED=""; PTRACE_CONF_CREATED=0; INSTALL_DONE=0; '
                'arm_ptrace_conf_rollback; printf "kernel.yama.ptrace_scope = 1\\n" > "$PTRACE_SYSCTL_CONF"; '
                + ("false || exit 5" if fail else "finish_install; exit 0"))
        return run_functions(body, self.NAMES), conf

    def test_a_failed_install_removes_the_file_it_created(self) -> None:
        result, conf = self.run_install(None, fail=True)
        self.assertEqual(5, result.returncode)
        self.assertFalse(conf.exists())
        self.assertIn("removed", result.stderr)

    def test_a_failed_install_restores_the_previous_file(self) -> None:
        result, conf = self.run_install("previous\n", fail=True)
        self.assertEqual(5, result.returncode)
        self.assertEqual("previous\n", conf.read_text(encoding="utf-8"))

    def test_a_successful_install_keeps_the_new_file(self) -> None:
        result, conf = self.run_install("previous\n", fail=False)
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("kernel.yama.ptrace_scope = 1\n", conf.read_text(encoding="utf-8"))

    def test_sysctl_file_is_written_after_the_user_step(self) -> None:
        text = INSTALLER.read_text(encoding="utf-8")
        main = text[text.index('precheck_ptrace_scope "$PROFILE" || exit 7'):]
        order = ['precheck_ptrace_scope "$PROFILE" || exit 7', "backup_previous_install ||",
                 "prepare_service_user || exit 8", "arm_ptrace_conf_rollback || exit 7",
                 'ensure_ptrace_scope "$PROFILE" || exit 7', 'remove_own_ptrace_conf "$PROFILE"', "finish_install\n"]
        positions = [main.index(item) for item in order]
        self.assertEqual(sorted(positions), positions)
        self.assertEqual(1, text.count('ensure_ptrace_scope "$PROFILE"'))


class BackupTests(TempDirCase):
    def test_previous_install_is_copied_to_a_root_only_dir_before_overwrite(self) -> None:
        directory = self.tmp()
        install = directory / "opt" / "vm-mcp"
        (install / ".venv" / "bin").mkdir(parents=True)
        (install / ".venv" / "bin" / "python").write_text("venv", encoding="utf-8")
        (install / "server.py").write_text("old server", encoding="utf-8")
        (install / "systemd").mkdir()
        (install / "systemd" / "vm-mcp.service").write_text("old unit copy", encoding="utf-8")
        systemd = directory / "etc" / "systemd" / "system"
        (systemd / "vm-mcp.service.d").mkdir(parents=True)
        (systemd / "vm-mcp.service").write_text("old unit", encoding="utf-8")
        (systemd / "vm-mcp.service.d" / "workspace.conf").write_text("old drop-in", encoding="utf-8")
        env_file = directory / "etc" / "vm-mcp.env"
        env_file.write_text("VM_MCP_PROFILE=workspace\n", encoding="utf-8")
        env_file.chmod(0o600)
        base = directory / "backups"
        body = (f'INSTALL_ROOT="{install}"; SYSTEMD_DIR="{systemd}"; ENV_FILE="{env_file}"; '
                f'PTRACE_SYSCTL_CONF="{directory}/none.conf"; BACKUP_BASE="{base}"; BACKUP_DIR=""; '
                'backup_previous_install; echo "rc=$? dir=$BACKUP_DIR"')
        result = run_functions(body, ("backup_previous_install",))
        self.assertIn("rc=0", result.stdout, result.stderr)
        dest = Path(result.stdout.split("dir=", 1)[1].strip())
        self.assertEqual(base, dest.parent)
        self.assertIn(f"backed up to {dest}", result.stderr)
        for path in (base, dest):
            self.assertEqual(0o700, stat.S_IMODE(path.stat().st_mode), path)
        copy = lambda p: Path(str(dest) + str(p))  # noqa: E731
        self.assertEqual("old server", copy(install / "server.py").read_text(encoding="utf-8"))
        self.assertEqual("old unit copy", copy(install / "systemd" / "vm-mcp.service").read_text(encoding="utf-8"))
        self.assertFalse(copy(install / ".venv").exists())
        self.assertEqual("old unit", copy(systemd / "vm-mcp.service").read_text(encoding="utf-8"))
        self.assertEqual("old drop-in", copy(systemd / "vm-mcp.service.d" / "workspace.conf").read_text(encoding="utf-8"))
        self.assertEqual(0o600, stat.S_IMODE(copy(env_file).stat().st_mode))
        self.assertFalse(copy(directory / "none.conf").exists())

    def test_fresh_install_makes_no_backup_and_backup_precedes_overwrites(self) -> None:
        directory = self.tmp()
        body = (f'INSTALL_ROOT="{directory}/opt"; SYSTEMD_DIR="{directory}/sd"; ENV_FILE="{directory}/env"; '
                f'PTRACE_SYSCTL_CONF="{directory}/c"; BACKUP_BASE="{directory}/b"; BACKUP_DIR=""; '
                'backup_previous_install; echo "rc=$? dir=$BACKUP_DIR"')
        result = run_functions(body, ("backup_previous_install",))
        self.assertIn("rc=0 dir=\n", result.stdout)
        self.assertFalse((directory / "b").exists())
        text = INSTALLER.read_text(encoding="utf-8")
        backup = text.index("backup_previous_install || {")
        for later in ('install -d -o root -g root -m 0755 "$INSTALL_ROOT"', "prepare_service_user || exit 8",
                      'write_secret_file "$ENV_FILE" <<EOF', 'install -m 0644 "$SOURCE_ROOT/systemd/vm-mcp.service" /etc'):
            self.assertLess(backup, text.index(later), later)
        self.assertIn("printf '  backup:        %s\\n' \"$BACKUP_DIR\"", text)


if __name__ == "__main__":
    unittest.main()
