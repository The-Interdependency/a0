#!/usr/bin/env python3
"""Build/check the DeepSeek handoff manifest, deterministic ZIP and receipt.

Usage from this directory: python3 build-packet.py --write
                          python3 build-packet.py --check

Authored packet files are inputs. SHA256SUMS covers those inputs.
The ZIP contains inputs plus SHA256SUMS. PACKET-RECEIPT.json stays outside
the ZIP so it can bind the ZIP digest without a circular reference.
This verifies packet consistency, not application correctness.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import zipfile
import zlib

ROOT = Path(__file__).resolve().parent
NAME = "a0-gui-deepseek-handoff"
ARCHIVE = NAME + ".zip"
RECEIPT = "PACKET-RECEIPT.json"
MANIFEST = "SHA256SUMS"
DERIVED = {ARCHIVE, RECEIPT, MANIFEST}
SOURCE_PINS = {
    "audited_application_commit": "de66778dd1d9073f6a8b3d532e73514868f94e3c",
    "audited_application_tree": "8e83504f18173b56a4addcdcf8b4ef7b707c7eba",
    "handoff_instruction_skill_lib_commit": "8ee77a6630379e48844350d8666515389b94f4c8",
}
REQUIRED = {
    "START-HERE.md", "README.md", "AUDIT-2026-11-10.md", "GUI-MSDMD.md",
    "reference/a0-gui-specification.png",
    "reference/a0-gui-specification.pdf",
    "evidence/2026-11-10/README.md",
    "evidence/2026-11-10/context-selection-repro.mjs",
    "evidence/2026-11-10/gui-repro.mjs",
    "evidence/2026-11-10/advanced-ui.test.mjs",
    "evidence/2026-11-10/advanced-routes.mjs",
    "evidence/2026-11-10/contrast.test.mjs",
    "evidence/2026-11-10/gui-gate-counterexample.mjs",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def read_inputs() -> dict[str, bytes]:
    result = {}
    for path in sorted(ROOT.rglob("*")):
        relative = path.relative_to(ROOT)
        if "__pycache__" in relative.parts:
            continue
        if path.is_symlink():
            raise ValueError(f"Packet inputs must not be symlinks: {relative}")
        if not path.is_file():
            continue
        if any(part.startswith(".") for part in relative.parts):
            raise ValueError(f"Unexpected hidden packet input: {relative}")
        name = relative.as_posix()
        if name in DERIVED:
            continue
        result[name] = path.read_bytes()
    missing = sorted(REQUIRED - result.keys())
    if missing:
        raise ValueError("Required inputs missing: " + ", ".join(missing))
    return result


def derive(inputs: dict[str, bytes], archive_bytes: bytes | None = None,
           executor: dict | None = None) -> dict[str, bytes]:
    manifest = "".join(
        f"{digest(body)}  {name}\n" for name, body in sorted(inputs.items())
    ).encode()
    members = {**inputs, MANIFEST: manifest}
    if archive_bytes is None:
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED,
                             compresslevel=9) as archive:
            for name, body in sorted(members.items()):
                info = zipfile.ZipInfo(f"{NAME}/{name}", (2026, 11, 10, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, body, compresslevel=9)
        archive_bytes = stream.getvalue()

    # Independent round-trip membership/byte check before publishing a receipt.
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        expected = {f"{NAME}/{name}": body for name, body in members.items()}
        if len(archive.namelist()) != len(expected):
            raise ValueError("Archive has duplicate or missing entries")
        if set(archive.namelist()) != set(expected):
            raise ValueError("Archive membership differs from its declared inputs")
        if archive.namelist() != sorted(expected):
            raise ValueError("Archive order differs from generation contract")
        for info in archive.infolist():
            if (info.date_time != (2026, 11, 10, 0, 0, 0)
                    or info.external_attr != 0o100644 << 16
                    or info.compress_type != zipfile.ZIP_DEFLATED):
                raise ValueError(f"Archive metadata differs: {info.filename}")
        if archive.testzip() is not None:
            raise ValueError("Archive CRC verification failed")
        for name, body in expected.items():
            if archive.read(name) != body:
                raise ValueError(f"Archive content differs: {name}")

    generator = {
        "path": "build-packet.py",
        "sha256": digest(inputs["build-packet.py"]),
        "contract": "sorted UTF-8 paths; fixed ZIP timestamp/mode; deflate level 9",
    }
    identity = {
        "schema": "a0.deepseek-handoff-packet/v1",
        "target": NAME,
        "source_pins": SOURCE_PINS,
        "inputs": [
            {"path": name, "sha256": digest(body), "bytes": len(body)}
            for name, body in sorted(inputs.items())
        ],
        "generator": generator,
        "verifier": {
            "path": "build-packet.py", "sha256": generator["sha256"],
            "command": "python3 build-packet.py --check",
        },
    }
    receipt = {
        **identity,
        "freshness_key_sha256": digest(canonical(identity)),
        "outputs": [
            {"path": MANIFEST, "sha256": digest(manifest), "bytes": len(manifest)},
            {"path": ARCHIVE, "sha256": digest(archive_bytes), "bytes": len(archive_bytes)},
        ],
        "executor": executor or {
            "python": sys.version.split()[0], "zlib": zlib.ZLIB_RUNTIME_VERSION,
        },
        "verification": "manifest, archive membership/CRC and exact round-trip bytes pass",
        "scope": "Packet derivation consistency; no application or deployment acceptance",
        "hmmm": [],
    }
    return {
        MANIFEST: manifest,
        ARCHIVE: archive_bytes,
        RECEIPT: (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode(),
    }


def atomic_write(path: Path, body: bytes) -> None:
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".packet-",
                                     delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(body)
    try:
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    inputs = read_inputs()
    if args.write:
        expected = derive(inputs)
    else:
        # Verify recorded output bytes directly, without requiring the verifier's
        # Python/zlib version to match the original archive-producing executor.
        recorded = json.loads((ROOT / RECEIPT).read_bytes())
        executor = recorded.get("executor")
        if not isinstance(executor, dict) or not all(
            isinstance(executor.get(key), str) and executor[key]
            for key in ("python", "zlib")
        ):
            raise ValueError("Receipt lacks its archive executor identity")
        expected = derive(inputs, (ROOT / ARCHIVE).read_bytes(), executor)
    if args.write:
        # Git publication commits this complete verified set atomically.
        for name, body in expected.items():
            atomic_write(ROOT / name, body)
    mismatched = [
        name for name, body in expected.items()
        if not (ROOT / name).is_file() or (ROOT / name).read_bytes() != body
    ]
    if mismatched:
        print(json.dumps({"result": "fail", "mismatched": mismatched}), file=sys.stderr)
        return 1
    receipt = json.loads(expected[RECEIPT])
    print(json.dumps({
        "result": "pass",
        "scope": receipt["scope"],
        "content_files": len(inputs),
        "archive_entries": len(inputs) + 1,
        "freshness_key_sha256": receipt["freshness_key_sha256"],
        "outputs": receipt["outputs"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"Packet verification failed: {exc}", file=sys.stderr)
        raise SystemExit(1)

