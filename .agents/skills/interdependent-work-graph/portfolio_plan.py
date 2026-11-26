# ratios: loc_comments=hmmm imports_exports=hmmm calls_definitions=hmmm
"""Validate repo-owned plan reports and derive one deterministic portfolio plan.

No network access and no third-party packages are required. Repository reports
remain authoritative for their own claims; this program only validates,
orders, hashes, and projects them into a cross-repository view.

Usage guidance:
    python interdependent-work-graph/portfolio_plan.py \
      ../a0/docs/work-graphs/repository-plan-report.json \
      ../edcm/docs/work-graphs/repository-plan-report.json \
      --output portfolio-plan.json

Supply only the repositories intentionally included in the portfolio view.
Missing repositories are not auto-discovered or synthesized. A report must pin
the exact frozen report-schema blob and the source commit it describes.
"""

# === MODULE_BUILD ===
# id: interdependent_work_graph_portfolio_plan
#   module_name: portfolio_plan
#   module_kind: instrument
#   summary: validates repo-owned plan reports and derives a deterministic cross-repository portfolio projection without transferring authority
#   owner: The-Interdependency/skill-lib maintainers
#   public_surface: load_report, build_portfolio, main
#   internal_surface: validate_report, canonical_bytes, digest
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: tests/test_interdependent_work_graph_portfolio_plan.py
#   rollout: explicit CLI or library invocation after repo reports are supplied
#   rollback: remove the aggregator, schemas, companion docs, and portfolio projection section without changing repo-owned source claims
#   unresolved: automatic portfolio membership discovery, persistent live service, cryptographic producer authentication
# === END MODULE_BUILD ===

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

REPORT_SCHEMA = "the-interdependency.repository-plan-report"
REPORT_VERSION = "1.0.0"
PLAN_SCHEMA = "the-interdependency.portfolio-plan"
PLAN_VERSION = "1.0.0"
CONTRACT_REPOSITORY = "The-Interdependency/skill-lib"
CONTRACT_PATH = "interdependent-work-graph/repository-plan-report.schema.json"
CONTRACT_BLOB_SHA = "9b347b2dff7692054b571602f30ee6d00c2e7265"
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _string_list(value: Any, field: str) -> list[str]:
    _require(isinstance(value, list), f"{field} must be an array")
    _require(all(isinstance(item, str) and item for item in value), f"{field} must contain non-empty strings")
    return value


def validate_report(report: dict[str, Any], source_path: Path) -> None:
    _require(report.get("schema") == REPORT_SCHEMA, f"{source_path}: unsupported schema")
    _require(report.get("version") == REPORT_VERSION, f"{source_path}: unsupported version")
    repository = report.get("repository")
    _require(isinstance(repository, str) and repository.count("/") == 1, f"{source_path}: invalid repository")

    contract = report.get("contract")
    _require(isinstance(contract, dict), f"{source_path}: contract must be an object")
    _require(contract.get("repository") == CONTRACT_REPOSITORY, f"{source_path}: wrong contract repository")
    _require(contract.get("path") == CONTRACT_PATH, f"{source_path}: wrong contract path")
    _require(contract.get("version") == REPORT_VERSION, f"{source_path}: wrong contract version")
    _require(contract.get("blob_sha") == CONTRACT_BLOB_SHA, f"{source_path}: report is not pinned to the frozen contract blob")

    source = report.get("source")
    _require(isinstance(source, dict), f"{source_path}: source must be an object")
    _require(COMMIT_RE.fullmatch(str(source.get("commit", ""))) is not None, f"{source_path}: source.commit must be 40 lowercase hex characters")
    for field in ("branch", "generated_at", "note"):
        _require(isinstance(source.get(field), str) and source[field], f"{source_path}: source.{field} is required")

    authority = report.get("authority")
    _require(isinstance(authority, dict), f"{source_path}: authority must be an object")
    _require(bool(_string_list(authority.get("owns"), "authority.owns")), f"{source_path}: authority.owns may not be empty")
    _string_list(authority.get("does_not_own"), "authority.does_not_own")
    _require(bool(_string_list(authority.get("non_transfer"), "authority.non_transfer")), f"{source_path}: authority.non_transfer may not be empty")

    portfolio_role = report.get("portfolio_role")
    _require(isinstance(portfolio_role, dict), f"{source_path}: portfolio_role must be an object")
    _require(isinstance(portfolio_role.get("summary"), str) and portfolio_role["summary"], f"{source_path}: portfolio_role.summary is required")
    reports_to = portfolio_role.get("reports_to")
    _require(isinstance(reports_to, dict), f"{source_path}: portfolio_role.reports_to must be an object")
    _require(reports_to.get("repository") == CONTRACT_REPOSITORY, f"{source_path}: reports_to.repository must be skill-lib")
    _require(reports_to.get("skill") == "interdependent-work-graph", f"{source_path}: reports_to.skill must be interdependent-work-graph")
    _require(isinstance(reports_to.get("relation"), str) and reports_to["relation"], f"{source_path}: reports_to.relation is required")

    status = report.get("status")
    _require(isinstance(status, dict), f"{source_path}: status must be an object")
    for field in ("state", "current_claim"):
        _require(isinstance(status.get(field), str) and status[field], f"{source_path}: status.{field} is required")

    delivered = report.get("delivered")
    _require(isinstance(delivered, list), f"{source_path}: delivered must be an array")
    for index, item in enumerate(delivered):
        _require(isinstance(item, dict), f"{source_path}: delivered[{index}] must be an object")
        for field in ("surface", "status", "boundary"):
            _require(isinstance(item.get(field), str) and item[field], f"{source_path}: delivered[{index}].{field} is required")

    _string_list(report.get("active_frontier"), "active_frontier")
    _string_list(report.get("blocked"), "blocked")
    _string_list(report.get("hmmm"), "hmmm")

    actions = report.get("next_actions")
    _require(isinstance(actions, list), f"{source_path}: next_actions must be an array")
    for index, action in enumerate(actions):
        _require(isinstance(action, dict), f"{source_path}: next_actions[{index}] must be an object")
        _require(set(action) == {"action", "owner", "dependency"}, f"{source_path}: next_actions[{index}] has missing or unknown fields")
        for field in ("action", "owner", "dependency"):
            _require(isinstance(action.get(field), str), f"{source_path}: next_actions[{index}].{field} must be a string")
        _require(bool(action["action"] and action["owner"]), f"{source_path}: next_actions[{index}] requires action and owner")

    relations = report.get("cross_repository_relations")
    _require(isinstance(relations, list), f"{source_path}: cross_repository_relations must be an array")
    for index, relation in enumerate(relations):
        _require(isinstance(relation, dict), f"{source_path}: cross_repository_relations[{index}] must be an object")
        _require(isinstance(relation.get("repository"), str) and relation["repository"].count("/") == 1, f"{source_path}: invalid relation repository")
        _require(isinstance(relation.get("relation"), str) and relation["relation"], f"{source_path}: relation text is required")
        _require(relation.get("authority_transfer") is False, f"{source_path}: authority transfer must be false")

    entrypoints = report.get("machine_entrypoints")
    _require(isinstance(entrypoints, dict) and entrypoints, f"{source_path}: machine_entrypoints must be a non-empty object")
    _require(all(isinstance(k, str) and k and isinstance(v, str) and v for k, v in entrypoints.items()), f"{source_path}: machine_entrypoints keys and values must be non-empty strings")


def load_report(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    _require(isinstance(value, dict), f"{path}: report root must be an object")
    validate_report(value, path)
    return value


def build_portfolio(reports_with_paths: list[tuple[Path, dict[str, Any]]]) -> dict[str, Any]:
    ordered = sorted(reports_with_paths, key=lambda item: item[1]["repository"])
    repository_names = [report["repository"] for _, report in ordered]
    _require(len(repository_names) == len(set(repository_names)), "duplicate repository reports are not allowed")

    generated_from: list[dict[str, Any]] = []
    repository_views: list[dict[str, Any]] = []
    relations: list[dict[str, Any]] = []
    active_frontier: list[dict[str, str]] = []
    next_actions: list[dict[str, Any]] = []
    blocked: list[dict[str, str]] = []
    hmmm: list[dict[str, str]] = []

    for _, report in ordered:
        repository = report["repository"]
        generated_from.append({
            "repository": repository,
            "source_commit": report["source"]["commit"],
            "report_sha256": digest(report),
        })
        repository_views.append({
            "repository": repository,
            "authority": report["authority"],
            "portfolio_role": report["portfolio_role"],
            "status": report["status"],
            "delivered": report["delivered"],
            "machine_entrypoints": report["machine_entrypoints"],
        })
        for relation in report["cross_repository_relations"]:
            relation_details = {k: v for k, v in relation.items() if k not in {"repository", "from", "to"}}
            relations.append({**relation_details, "from": repository, "to": relation["repository"]})
        active_frontier.extend({"repository": repository, "item": item} for item in report["active_frontier"])
        next_actions.extend({**action, "repository": repository} for action in report["next_actions"])
        blocked.extend({"repository": repository, "item": item} for item in report["blocked"])
        hmmm.extend({"repository": repository, "item": item} for item in report["hmmm"])

    body = {
        "schema": PLAN_SCHEMA,
        "version": PLAN_VERSION,
        "contract": {
            "repository": CONTRACT_REPOSITORY,
            "report_schema_path": CONTRACT_PATH,
            "report_schema_version": REPORT_VERSION,
            "report_schema_blob_sha": CONTRACT_BLOB_SHA,
        },
        "generated_from": generated_from,
        "repositories": repository_views,
        "cross_repository_dependencies": sorted(relations, key=lambda item: (item["from"], item["to"], item["relation"])),
        "active_frontier": active_frontier,
        "next_actions": next_actions,
        "blocked": blocked,
        "hmmm": hmmm,
    }
    return {**body, "portfolio_plan_sha256": digest(body)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", nargs="+", type=Path, help="repo-owned repository-plan-report.json files")
    parser.add_argument("--output", type=Path, help="write JSON to this path instead of stdout")
    args = parser.parse_args()

    reports = [(path, load_report(path)) for path in args.reports]
    portfolio = build_portfolio(reports)
    rendered = json.dumps(portfolio, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# ratios: loc_comments=hmmm imports_exports=hmmm calls_definitions=hmmm
