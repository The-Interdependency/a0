# Integrated native reader support

This matrix describes shipped extraction, not certification against entire
standards. `msdmd/readers.py` owns executable selection and machine manifests;
`tests/test_native_collection.py` and `tests/test_native_standards.py` exercise
these readers through the default schema-2 collector. No MSDMD redeclaration is
required. Pin dependencies from `msdmd/requirements.txt` and `package-lock.json`.

| Owning convention | Implemented extraction | Explicit limit |
|---|---|---|
| Python AST/tokenize, PEP 257 | Qualified symbols, signatures, decorators, structurally attached comments/docstrings, imports, literal `__all__`, SPDX headers | Running Python grammar; no target import, call graph, dynamic exports or rename inference |
| ReST/Sphinx, Google and NumPy docstrings | Structured parameters/returns/raises and descriptive fields with raw text, using docstring-parser 0.18.0 | Parser-supported dialect fields; ambiguous/custom constructs retain source and diagnostics |
| JavaScript/TypeScript/JSDoc | TypeScript 5.8.3 AST, nested declarations, multiline signatures, static imports/exports, compiler-attached repeated documentation tags, actual comments | No target config, module resolution, decorators or runtime execution; full TSDoc validation not claimed |
| Rustdoc / Java Javadoc / C and C++ Doxygen source | Pinned tree-sitter grammar declarations, lexical scope, attached raw docs and repeated tags, source attributes/imports, SPDX | Grammar subsets, not compiler semantics. Macros/conditional compilation unresolved. `.h` is ambiguous, not guessed |
| JSON / TOML | Complete typed document tree; duplicate/nonfinite JSON rejection; TOML dates/times explicitly tagged | Syntax preservation is not domain-schema validation |
| YAML / Markdown frontmatter | Maintained PyYAML syntax parser, explicit YAML 1.2 core resolution, nested/flow structures, block strings, bounded acyclic aliases; typed scalar-key maps tagged for JSON | No custom tags, cycles, merge-key dialect or complex keys; errors remain visible |
| Python / npm / Cargo manifests | Package identity, dependency classes, Cargo conditional dependencies, raw owning trees | No installation, resolution or scripts; Python imports are not calls |
| npm lockfile 2/3; Cargo/Poetry/uv locks; pnpm document | Recorded package metadata; per-package rows for supported npm and TOML lock structures | Version/dialect fields retained; pnpm semantic graph and cross-lock resolution not claimed |
| GitHub CODEOWNERS | Ordered patterns, repeated owners, ownerless exemptions, authoritative-file precedence and shadowed rules | No path matching, team permission lookup or inferred operational ownership |
| SPDX / REUSE | Actual code headers, `.license` and SPDX tag-value lines, REUSE.toml annotations; SPDX 2.2/2.3 JSON document/packages/files/relationships | Tag-value is a line subset, not complete multiline SPDX; no license-compliance conclusion |
| CITATION.cff 1.2.0 | Nested citation metadata, contributors, identifiers and unknown fields | No citation validation or DOI resolution |
| OpenAPI 3.0/3.1; Swagger 2.0 | Owning document, operations, native operation IDs, path/webhook scope and refs | No request/response validator; unknown versions retained but unresolved |
| JSON Schema drafts 4/6/7/2019-09/2020-12 | Schema document, identity, unknown keywords and unresolved references | No remote references or instance validation |
| SARIF 2.1.0 / JUnit XML | Producer-linked analysis results and reported pass/failure/error/skipped tests | Reports are reported evidence, never independent verification |
| Doxygen XML / .NET XML docs / Maven POM | Namespace-aware document tree, documented-symbol identities and dependency declarations | Producer-specific XML extras preserved; no build or complete schema validation |
| CycloneDX 1.4–1.6 JSON | BOM and nested component identities | No vulnerability conclusion; duplicate native identifiers diagnosed |
| in-toto Statement v0.1/v1 / DSSE | Statements, subjects, preserved predicates, bounded DSSE base64 decoding | Signatures explicitly unverified; no authenticated provenance claim |
| Jupyter metadata | Notebook/cell metadata and native cell IDs | Owning JSON includes other notebook content; apply disclosure policy before publication |
| Shell / systemd / Git ignore / requirements / SVG / llms.txt | Declared shebang/directives, ordered unit settings, ignore lines, requirements, XML title/description and instruction-file structure | Extraction only; no shell/systemd/browser execution or ignore-rule applicability |
| Supplemental MSDMD / RATIOS | Existing grammar, source-qualified addresses/edges, duplicate-ID diagnostics, syntax-aware comments in supported code languages | Block adoption is independent of native information coverage |

## Coverage and acceptance

`--require-source` rejects unmatched or incompletely extracted required sources.
`--require-fact 'GLOB::NAMESPACE::KIND'` requires named source-linked witnesses;
it does not invent obligations. Missing packages produce unsupported diagnostics.
Read errors, parse errors and identity conflicts invalidate strict output.
Other optional unknowns remain visible rather than blocking unrelated evidence.
Native fields are never forced into the schema-1 flat block map. Large generated
TypeScript fact arrays use typed chunks to bound compiler inference; the
visualizer decodes only those literal JSON chunks, never arbitrary expressions.

No parser executes inspected programs, follows remote references, expands
macros/templates or treats source instructions as agent instructions. Structured
secrets/URL credentials are redacted and secret-named files excluded; neither
mechanism is a general secret scanner. XML excludes DTD/entities and non-UTF-8.
Resource limits are declared before extraction; all excluded scope is reported.

## Validation

```bash
python -m unittest tests.test_native_collection tests.test_native_standards
python -m unittest tests.test_module_projection tests.test_collect tests.test_visualize
python -m msdmd.collect --root . --repo The-Interdependency/skill-lib \
  --snapshot-identity --import-path ./msdmd/collection --out skill-lib_msdmd.ts --strict --check
node msdmd/node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck \
  --target ES2022 --module commonjs msdmd/collection.ts skill-lib_msdmd.ts
```

## hmmm

A new convention requires a fixture-backed reader and declared authority/scope,
not another catalogue entry or a guessed universal mapping. Source extraction
and application semantics remain separate. Necessary additional policy includes
path applicability for ownership, cross-source semantic conflicts, build-context
resolution, arbitrary-language support and independent evidence verification.

## Regression-qualified boundaries

`tests/test_native_review_regressions.py` exercises these acceptance cases:

- When a native comment parser is missing or ambiguous, block-shaped candidates survive in source-qualified diagnostics with unverified standing. They are not promoted to declarations; strict collection fails instead of silently dropping them.
- JSON numeric values outside safe integer/exact binary64 representation use `{ "$type": "json-number", "lexeme": "..." }`, preserving the original numeric lexeme across TypeScript/JavaScript. Nonfinite overflow remains rejected. This is an explicit tagged representation, not a claim that JavaScript arithmetic is exact.
- Systemd continuation backslashes become spaces and intervening comments are ignored. Environment assignments are checked individually. Plain words and whole-word quotes are supported; unimplemented escaping/quoting withholds the entire value and reports partial scope. No systemd expansion is executed.
- Requirements include/constraint directives remain source-owned records and are explicitly unresolved; required-source coverage fails until their information obligation is satisfied.
- TypeScript local export lists retain public aliases, type-only flags and source-local declaration links. Compiler/build-context resolution remains out of scope.
- Maven XML recognition requires its POM namespace or an unnamespaced project with modelVersion 4.0.0. Other project XML stays generic XML.
- SVG uses the same bounded, UTF-8, DTD/entity-rejecting parser as other XML inputs.
- Explicit YAML `!!float 1` is supported and is a regression control, not an outstanding defect.
