# 106:40 0:0 0:0
"""Export an exact Git commit as a deterministic source archive plus receipt.

Usage: python scripts/subm_src_pack_v0.0.0alpha.py --output-dir ../a0-source
This never uploads, tags, freezes, publishes, or claims runtime verification.
Only committed Git blobs are exported. Ignored/untracked files are not read.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_submission_source_export
#   module_name: submission_source_export
#   module_kind: instrument
#   summary: Exports an explicitly identified Git commit and binds the archive to its commit and tree without copying ignored or untracked local files.
#   owner: Erin Spencer
#   public_surface: command line archive and JSON receipt
#   internal_surface: export_source
#   auth_boundary: none
#   storage_boundary: write
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: python/tests/test_subm_tool_v0.0.0alpha.py
#   rollout: explicit local command only
#   rollback: remove the command; existing source history is unchanged
#   unresolved: Git object identity is not producer authentication or runtime proof; external LFS and submodule content is unsupported
# === END MODULE_BUILD ===

# === CONTRACTS ===
# id: submission_source_commit_identity
#   given: a clean checkout with an exact committed source tree
#   then: the archive contains that tree only and its receipt records the exact commit, tree, and archive SHA-256
#   class: evidence
# id: submission_source_fail_closed
#   given: uncommitted tracked changes, submodules, LFS pointers, or a preexisting output artifact
#   then: export refuses rather than omitting source dependencies, overwriting evidence, or claiming mixed-state provenance
#   class: correctness
# id: submission_source_excludes_local_files
#   given: ignored or untracked local credentials and runtime data exist beside the repository
#   then: they are never read or included in the exported archive
#   class: safety
# === END CONTRACTS ===

import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]


def git(root: Path, *arguments: str) -> bytes:
    # Ambient Git overrides must not redirect the requested repository or replace
    # its objects. No credential/network operations are needed for a local export.
    environment = {name: value for name, value in os.environ.items() if not name.startswith("GIT_")}
    result = subprocess.run(["git", "--no-replace-objects", "-C", str(root), *arguments],
                            capture_output=True, check=True, env=environment)
    return result.stdout


def export_source(root: Path, output: Path) -> dict:
    root, output = root.resolve(), output.resolve()
    if output == root or root in output.parents:
        raise ValueError("output directory must be outside the source checkout")
    if git(root, "status", "--porcelain", "--untracked-files=no").strip():
        raise ValueError("tracked changes must be committed before exporting source")
    commit = git(root, "rev-parse", "HEAD^{commit}").decode().strip()
    tree = git(root, "rev-parse", f"{commit}^{{tree}}").decode().strip()
    entries = git(root, "ls-tree", "-r", "-z", commit).split(b"\0")
    if any(entry.startswith(b"160000 ") for entry in entries):
        raise ValueError("submodule content is not included by git archive; resolve source packaging first")
    expected = {}
    for entry in filter(None, entries):
        metadata, path = entry.split(b"\t", 1)
        mode, kind, oid = metadata.decode("ascii").split()
        if kind != "blob":
            raise ValueError("unsupported Git source entry")
        expected[path.decode("utf-8")] = (mode, oid)
    object_format = git(root, "rev-parse", "--show-object-format").decode().strip()
    if object_format not in {"sha1", "sha256"}:
        raise ValueError("unsupported Git object format")
    archive = git(root, "archive", "--format=tar", f"--prefix=a0-{commit}/", commit)
    seen = set()
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as source:
        for member in source.getmembers():
            if member.isdir():
                continue
            path = member.name.removeprefix(f"a0-{commit}/")
            if path not in expected or path in seen:
                raise ValueError("archive contains an unexpected or duplicate source path")
            mode, oid = expected[path]
            if member.issym() and mode == "120000":
                data = member.linkname.encode("utf-8")
            elif member.isfile() and mode in {"100644", "100755"}:
                stream = source.extractfile(member)
                if stream is None:
                    raise ValueError("archive file cannot be read")
                data = stream.read()
                if data.startswith(b"version https://git-lfs.github.com/spec/v1\n"):
                    raise ValueError("LFS objects are not included by git archive; resolve source packaging first")
                if bool(member.mode & 0o111) != (mode == "100755"):
                    raise ValueError("archive executable mode differs from Git tree")
            else:
                raise ValueError("archive type differs from Git tree")
            identity = hashlib.new(object_format, f"blob {len(data)}\0".encode() + data).hexdigest()
            if identity != oid:
                raise ValueError("archive bytes differ from Git tree (for example export-subst)")
            seen.add(path)
    if seen != set(expected):
        raise ValueError("archive omits committed files (for example export-ignore)")
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, mode="wb", filename="", mtime=0) as stream:
        stream.write(archive)
    packed = compressed.getvalue()
    name = f"a0-{commit}-source.tar.gz"
    receipt = {
        "schema": 1,
        "source_kind": "committed_git_tree",
        "commit": commit,
        "tree": tree,
        "archive": name,
        "archive_sha256": hashlib.sha256(packed).hexdigest(),
        "tracked_file_count": len(seen),
        "excludes": ["ignored files", "untracked files", "Git history", "installed dependencies"],
        "verification": "source bytes only; not build, runtime, Replit parity, or eligibility proof",
    }
    output.mkdir(parents=True, exist_ok=True)
    archive_path = output / name
    receipt_path = output / f"a0-{commit}-source.json"
    if archive_path.exists() or receipt_path.exists():
        raise FileExistsError("output artifact already exists; choose a fresh output directory")
    # Exclusive creation preserves earlier receipts; never overwrite an artifact.
    with archive_path.open("xb") as stream:
        stream.write(packed)
    with receipt_path.open("x", encoding="utf-8") as stream:
        json.dump(receipt, stream, indent=2, sort_keys=True)
        stream.write("\n")
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(export_source(ROOT, args.output_dir), indent=2, sort_keys=True))
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print(f"Source export failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
# 106:40 0:0 0:0
