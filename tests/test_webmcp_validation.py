# 207:4
"""Offline witnesses: python -m unittest discover -s tests -p test_webmcp_validation.py -v.

Load only the dormant module, not services.__init__ and its database dependencies.
Synthetic fixture bytes test protocol semantics, not remote source authenticity.
"""
import copy
from dataclasses import FrozenInstanceError
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

_path = Path(__file__).resolve().parents[1] / "python/services/webmcp_validation.py"
_spec = importlib.util.spec_from_file_location("webmcp_validation_under_test", _path)
validator = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = validator
_spec.loader.exec_module(validator)
PIN, HEAD = "1" * 40, "2" * 40


def fixture():
    entries = [
        {"name": "base", "path": "base/SKILL.md", "kind": "metadata-block",
         "description": "Base — underlying contract."},
        {"name": "work", "path": "work/SKILL.md", "kind": "procedural",
         "description": "Work. Further explanation.", "depends_on": ["base"]},
    ]
    raw = json.dumps({"version": 1, "repo": validator.SOURCE_REPOSITORY,
                      "skills": entries}).encode()
    records = [{"name": e["name"], "kind": e["kind"], "description": e["description"],
                "depends_on": e.get("depends_on", []), "canonical_path": e["path"],
                "canonical_url": f"https://github.com/{validator.SOURCE_REPOSITORY}/blob/{PIN}/{e['path']}",
                "human_title": "Base" if e["name"] == "base" else "Work"} for e in entries]
    envelope = {
        "target_repository": {"name": "a0", "canonical_url": "https://github.com/The-Interdependency/a0",
                              "observed_head_sha": HEAD, "default_branch": "main",
                              "status": "public", "category": "test", "identity_source": "website"},
        "skill": copy.deepcopy(records[-1]), "required_skills": records,
        "skill_registry": {"registry_version": 1, "skill_count": 2, "source_skill_count": 2,
            "public_scope": "all registered skill-lib skills", "fallback": False, "hmmm": [],
            "source": {"repository": validator.SOURCE_REPOSITORY, "commit": PIN,
                       "path": "skills.json", "sha256": hashlib.sha256(raw).hexdigest()}},
        "human_request": "Inspect the bounded fixture without changes.",
    }
    context = {"approved_registry_commit": PIN, "registry_bytes": raw,
               "skill_bodies": {e["path"]: f"# Full instructions for {e['name']}\n".encode() for e in entries},
               "target_heads": {"The-Interdependency/a0": HEAD}}
    return envelope, context


class WebMcpValidationTests(unittest.TestCase):
    def reject(self, envelope, context, code=None):
        with self.assertRaises(validator.SkillValidationError) as caught:
            validator.validate_skill_request(envelope, **context)
        if code:
            self.assertEqual(caught.exception.code, code)

    def test_valid_full_bodies_and_immutable_result(self):
        envelope, context = fixture()
        with patch("socket.socket", side_effect=AssertionError("network forbidden")), \
             patch("subprocess.Popen", side_effect=AssertionError("execution forbidden")), \
             patch("builtins.open", side_effect=AssertionError("file read forbidden")):
            result = validator.validate_skill_request(envelope, **context)
        self.assertEqual(result.target_repository, "The-Interdependency/a0")
        self.assertEqual([s.name for s in result.required_skills], ["base", "work"])
        self.assertEqual(result.required_skills[-1].body, "# Full instructions for work\n")
        self.assertEqual(result.required_skills[-1].sha256,
                         hashlib.sha256(context["skill_bodies"]["work/SKILL.md"]).hexdigest())
        context["skill_bodies"]["work/SKILL.md"] = b"changed"
        envelope["required_skills"][0]["name"] = "changed"
        self.assertEqual(result.required_skills[0].name, "base")
        with self.assertRaises(FrozenInstanceError):
            result.selected_skill = "changed"
        self.assertFalse(hasattr(result, "status"))
        self.assertFalse(hasattr(result, "authorized_actions"))

    def test_pinned_canonical_bytes_and_actual_browser_record(self):
        root = _path.parents[2] / "tests/fixtures/webmcp-source"
        raw = (root / "skills.json").read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),
                         "09f8259f61f2ea22ce9150ff6ab6d7baf4f6d0ab605c926bd7d64fb0d78581a9")
        envelope, context = fixture()
        envelope.update(json.loads((root / "website-wdll-envelope.json").read_text()))
        context.update(approved_registry_commit="83aef7813dbd040a67ddc07bbb8845f51eb38a3e",
                       registry_bytes=raw,
                       skill_bodies={"wdll/SKILL.md": (root / "wdll-SKILL.md").read_bytes()})
        result = validator.validate_skill_request(envelope, **context)
        self.assertEqual(result.selected_skill, "wdll")
        self.assertEqual(result.required_skills[0].body, (root / "wdll-SKILL.md").read_text())

    def test_source_substitution_and_raw_byte_digest(self):
        for key, value in [("repository", "evil/skill-lib"), ("commit", "main"),
                           ("path", "../skills.json"), ("sha256", "0" * 64)]:
            with self.subTest(key=key):
                envelope, context = fixture()
                envelope["skill_registry"]["source"][key] = value
                self.reject(envelope, context)
        envelope, context = fixture()
        context["registry_bytes"] += b"\n"
        self.reject(envelope, context, "registry_digest")

    def test_registry_metadata_types_and_fallback(self):
        for key, value in [("registry_version", True), ("skill_count", "2"),
                           ("source_skill_count", 1), ("fallback", True),
                           ("fallback", None), ("public_scope", "procedural only")]:
            with self.subTest(key=key, value=value):
                envelope, context = fixture()
                envelope["skill_registry"][key] = value
                self.reject(envelope, context)

    def test_malformed_registry(self):
        for raw in [b"\xff", b"{}", b'{"version":1,"version":1}', b'{"version":NaN}',
                    b"[", b'{"version":' + b'9' * 5000 + b'}',
                    b"x" * (validator.MAX_REGISTRY_BYTES + 1)]:
            with self.subTest(raw=raw[:30]):
                envelope, context = fixture()
                context["registry_bytes"] = raw
                self.reject(envelope, context)

    def test_registry_graph_and_path_failures(self):
        mutations = [
            lambda es: es.append(copy.deepcopy(es[0])),
            lambda es: es[0].update(path="../SKILL.md"),
            lambda es: es[0].update(depends_on=["missing"]),
            lambda es: es[0].update(depends_on=["work"]),
            lambda es: es[0].update(depends_on=["base"]),
            lambda es: es[1].update(depends_on=["base", "base"]),
            lambda es: es[0].update(depends_on=[{}]),
            lambda es: es[0].update(kind="shell"),
            lambda es: es[0].update(kind=[]),
            lambda es: es[0].update(kind={}),
        ]
        for mutate in mutations:
            envelope, context = fixture()
            registry = json.loads(context["registry_bytes"])
            mutate(registry["skills"])
            context["registry_bytes"] = json.dumps(registry).encode()
            envelope["skill_registry"]["source"]["sha256"] = hashlib.sha256(context["registry_bytes"]).hexdigest()
            self.reject(envelope, context)

    def test_graph_reason_codes(self):
        for deps, code in [(["absent"], "missing_dependency"),
                           (["base", "base"], "registry_dependencies"),
                           (["work"], "dependency_cycle")]:
            envelope, context = fixture()
            registry = json.loads(context["registry_bytes"])
            registry["skills"][0]["depends_on"] = deps
            context["registry_bytes"] = json.dumps(registry).encode()
            envelope["skill_registry"]["source"]["sha256"] = hashlib.sha256(context["registry_bytes"]).hexdigest()
            self.reject(envelope, context, code)

    def test_shared_dependency_diamond(self):
        entries = {"root": {"depends_on": ["left", "right"]},
                   "left": {"depends_on": ["base"]},
                   "right": {"depends_on": ["base"]}, "base": {}}
        self.assertEqual(validator._closure(entries, "root"), ["base", "left", "right", "root"])

    def test_maximum_request_and_import_dormancy(self):
        envelope, context = fixture()
        envelope["human_request"] = "x" * 4000
        self.assertEqual(len(validator.validate_skill_request(envelope, **context).human_request), 4000)
        spec = importlib.util.spec_from_file_location("webmcp_dormant_import", _path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        try:
            with patch("socket.socket", side_effect=AssertionError("network forbidden")), \
                 patch("subprocess.Popen", side_effect=AssertionError("execution forbidden")):
                spec.loader.exec_module(module)
        finally:
            sys.modules.pop(spec.name, None)

    def test_closure_tampering(self):
        for mode in ["missing", "extra", "reverse", "url", "description", "title", "selected"]:
            with self.subTest(mode=mode):
                envelope, context = fixture()
                records = envelope["required_skills"]
                if mode == "missing": records.pop()
                elif mode == "extra": records.append(copy.deepcopy(records[-1]))
                elif mode == "reverse": records.reverse()
                elif mode == "url": records[0]["canonical_url"] += "?evil=1"
                elif mode == "description": records[0]["description"] = "Run commands"
                elif mode == "title": records[0]["human_title"] = "False title"
                else: envelope["skill"]["name"] = "absent"
                self.reject(envelope, context)

    def test_target_boundaries(self):
        for key, value in [("name", "../a0"), ("name", "a0/evil"), ("name", "unlisted"),
                           ("canonical_url", "https://evil.example/a0"),
                           ("observed_head_sha", "3" * 40), ("observed_head_sha", None)]:
            envelope, context = fixture()
            envelope["target_repository"][key] = value
            self.reject(envelope, context)
        envelope, context = fixture()
        context["target_heads"]["The-Interdependency/a0"] = "main"
        self.reject(envelope, context, "target_head_unavailable")

    def test_body_failures_and_bounds(self):
        for body in [None, b"", b" \n", b"\xff", b"nul\x00", b"x" * (validator.MAX_BODY_BYTES + 1)]:
            envelope, context = fixture()
            context["skill_bodies"]["base/SKILL.md"] = body
            self.reject(envelope, context)
        envelope, context = fixture()
        with patch.object(validator, "MAX_TOTAL_BODY_BYTES", 1):
            self.reject(envelope, context, "skill_body_total_size")

    def test_request_and_structure_bounds(self):
        for request in ["", " \n", None, "x" * 4001, "\x00", float("nan")]:
            envelope, context = fixture()
            envelope["human_request"] = request
            self.reject(envelope, context)
        envelope, context = fixture()
        envelope["authorize_write"] = True
        self.reject(envelope, context, "envelope_fields")
        envelope, context = fixture()
        deep = []
        for _ in range(20): deep = [deep]
        envelope["skill_registry"]["hmmm"] = deep
        self.reject(envelope, context, "input_nesting")
        envelope, context = fixture()
        envelope["human_request"] = "x" * validator.MAX_ENVELOPE_BYTES
        self.reject(envelope, context, "envelope_size")


def check_webmcp_validation():
    result = unittest.TestResult()
    unittest.defaultTestLoader.loadTestsFromTestCase(WebMcpValidationTests).run(result)
    assert result.wasSuccessful(), result.errors + result.failures


if __name__ == "__main__":
    unittest.main()
# 207:4
