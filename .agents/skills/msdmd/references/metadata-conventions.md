# Metadata conventions — discovery and extraction contract

This reference extends `../SKILL.md`. Use it to inventory actual inputs, select
readers, and design tests. **The rows below specify what to inspect; they do not
claim that skill-lib ships readers for those conventions.** Resolve and record
an authoritative specification or owning implementation before interpreting a
particular dialect. A family name is not an implementation status.

## Open-world coverage rule

Any existing metadata convention encountered in the declared scan scope is an
eligible input. Include native and project-local conventions, custom tags,
extensions, older versions still present in inputs, and new formats not named
below. An unrecognized file remains in the discovery ledger; a recognized but
uninterpreted declaration retains its source reference and an unsupported or
opaque status. Do not claim that unknown syntax was fully detected or understood.

"All conventions" means an open ingestion boundary with explicit accounting,
not a finite catalogue masquerading as universal parser coverage. Add a reader
contract when a new convention appears; do not require changes to its owner merely
to make the source fit MSDMD. Retired input syntax may be inspected as historical
data without being recommended for new authoring.

## Convention catalogue

### Shipped implementation and catalogue boundary

The integrated schema-2 implementation and fixture-backed extraction subsets are
listed in [implemented-readers.md](implemented-readers.md). `readers.py` emits its
machine manifests in every collection. The Python attachment reader is shared
with the per-module projection; it is no longer disconnected from collection.

The families below remain a discovery catalogue, not a blanket implementation
claim. An unlisted or unsupported format remains visible as `hmmm`, and required
coverage cannot pass without a capable reader and source-linked witnesses.


### Language, symbol, and documentation metadata

| Family | Explicit conventions and sources to inspect | Preservation / interpretation boundary |
|---|---|---|
| Python | PEP 257 docstrings; reStructuredText/Sphinx fields; Google-style and NumPy-style sections; signatures, annotations, type comments, `.pyi`, `Annotated`, decorators, dataclass/field declarations, `__all__`, encoding cookies, inline script metadata. | Separate each docstring dialect and typing version. Preserve expressions without importing modules, evaluating annotations, invoking decorators, or resolving dynamic exports by execution. |
| JavaScript / TypeScript | JSDoc, TSDoc, TypeDoc extensions; `.d.ts`; signatures, generics, interfaces, visibility, import/export declarations, decorators, compiler directives. | JSDoc, TSDoc, and TypeDoc are not interchangeable tag grammars. Keep unknown/custom tags, inline links, overloads, and declared versus inferred types. |
| C / C++ / Objective-C | Doxygen and HeaderDoc comments; declarations, attributes, pragmas, preprocessor conditions, include edges, compiler annotations. | Preserve active/unknown configuration branches. A textual include is not a resolved build dependency under every target. |
| Java / JVM | Javadoc including version-specific comment forms; annotations; `package-info.java`, `module-info.java`, signatures and modifiers; Kotlin KDoc and annotations; Scala Scaladoc and annotations; Groovydoc. | Preserve dialect, target, retention/visibility declarations, generics, and inheritance links. Do not run annotation processors or compile project code during static collection. |
| .NET | C#/VB/F# XML documentation; attributes; nullable/type metadata; assembly and project metadata. | Keep XML structure and `cref`/inheritance references. Disable external entity expansion. Do not infer runtime attribute effects from spelling alone. |
| Rust | rustdoc comments and attributes; `cfg`/`cfg_attr`, `deprecated`, visibility, signatures, traits and bounds; doctest flags. | Preserve feature/target conditions and macro invocations. An example or doctest flag is not a passing execution result. |
| Go | Go doc comments; declaration comments; struct tags; build constraints; `go:generate`, `go:embed`, and other versioned directives. | Preserve directive scope and tag namespaces. Never execute generation directives during extraction. |
| Swift / Apple | Documentation comments, DocC markup, attributes, availability declarations, Swift package and plist metadata. | Keep platform/version availability and symbol attachment; do not load package scripts to collect values. |
| Ruby / PHP | RDoc, YARD and tags; Ruby declaration/mixin syntax; PHPDoc, attributes, signatures and namespace declarations. | Distinguish documentation type claims from language syntax and dynamic metaprogramming. |
| BEAM | Elixir `@moduledoc`, `@doc`, `@typedoc`, `@spec`, `@type`, behaviours and attributes; Erlang EDoc and versioned documentation attributes/specs. | Treat expressions and macros as source data; preserve module/function/type scope without starting a runtime. |
| Lisp / functional | Clojure metadata maps, `^` metadata, docstrings, arglists; Common Lisp documentation forms; Scheme/Racket documentation; Haskell Haddock and pragmas; OCaml odoc. | Do not evaluate forms. Resolve syntax and metadata semantics from the identified language/tool, not a shared punctuation shape. |
| Scientific / statistical | R roxygen2, DESCRIPTION and NAMESPACE; Julia docstrings/macros; MATLAB help comments; Fortran documentation comments and declarations. | Resolve ambiguous extensions explicitly. Preserve language-specific binding and generated-source provenance. |
| Shell / operations | Interpreter shebangs; shell documentation conventions, ShellCheck directives; PowerShell comment-based help, attributes and parameter declarations; Perl POD; Lua LDoc/annotation dialects. | A shebang selects declared interpreter intent, not evidence of executable mode or installed availability. Keep positional requirements and never source the file. |
| Other languages | Dart doc comments/annotations; Zig doc comments; SQL comments and DDL metadata; Ada/SPARK aspects; HDL attributes; Prolog documentation; any additional language present. | Register exact syntax, ownership and tests before interpreting. Unsupported grammar remains visible; no language is silently discarded for lacking an MSDMD comment marker. |
| Ordinary and project-local comments | TODO/FIXME/XXX/HACK/NOTE markers; region markers; generated-file notices; project-defined structured comments; embedded Markdown, JSON, YAML, XML, or TOML. | Record literal markers and local interpretation separately. A TODO is not automatically a defect, assigned issue, or behavioral obligation. Comments inside strings/examples need syntax-aware discrimination. |

### Repository, packaging, build, and operational metadata

| Family | Explicit conventions and sources to inspect | Preservation / interpretation boundary |
|---|---|---|
| Python packaging | `pyproject.toml`, inline script metadata, `setup.cfg`, statically recoverable `setup.py`, core METADATA/PKG-INFO, entry points, requirements/constraints and lock formats. | Preserve specification version and declared dynamic fields. Build requirements, runtime requirements, extras, groups, constraints, and resolved packages are different relationships. No build backend execution. |
| JavaScript packaging | `package.json`, npm/yarn/pnpm/bun lockfiles, workspace definitions, exports/imports maps and engine constraints. | Keep peer/optional/dev/runtime dependency classes, environment conditions and resolution scope distinct. Scripts are declarations, not commands to run. |
| Other package ecosystems | Cargo manifests/locks; `go.mod`, `go.sum`, `go.work`; Maven POM, Gradle files/catalogues; NuGet/MSBuild/project files; Composer; Gemfile/gemspec/locks; Mix/rebar; Swift Package/CocoaPods; Dart pub; Julia Project/Manifest; R DESCRIPTION; OS package specifications. | Preserve package/workspace/target scope, constraints and resolutions. Executable configuration stays unresolved unless supplied as a separately authorized, provenance-bearing result. |
| Build systems | CMake, Meson, Make, Bazel BUILD/MODULE/WORKSPACE, Ninja, Ant, SBT, compiler databases and toolchain files. | Static recovery is not complete build evaluation. Preserve conditional targets, generators, configurations, outputs and unknown expressions. |
| Ownership and governance | Provider-specific CODEOWNERS; OWNERS files; MAINTAINERS/AUTHORS; contribution/security policies; repository labels and settings when separately authorized. | Use the identified provider's matching/precedence rules. Review assignment, authorship, legal rights, operational responsibility and effective permissions remain distinct. |
| Licensing and provenance | SPDX identifiers/expressions, REUSE headers and `.license` sidecars, LICENSE/COPYING/NOTICE, copyright statements, CITATION.cff, CodeMeta. | Preserve per-file/package scope and original expressions. Extraction does not resolve legal conflicts or establish compatibility. |
| CI / automation | GitHub Actions, GitLab CI, Jenkins, Azure Pipelines, CircleCI, Travis, Buildkite and project automation manifests. | Record jobs, permissions, dependencies, declared matrices and conditions. Configuration is not execution history, successful gates, or live deployment state. |
| Containers / deployment | Dockerfile labels and build stages; OCI annotations; Compose; Kubernetes annotations/labels; Helm; Terraform; Ansible; Nix; deployment manifests and environment templates. | Keep build, desired and observed state separate. Never render untrusted templates, query infrastructure or reveal secret values as a side effect of discovery. |
| Quality / editor policy | `tsconfig`, lint/type/format/test/coverage configurations; EditorConfig; `.gitattributes`, ignore files; suppression directives such as noqa, type-ignore, eslint-disable, coverage exclusions. | A suppression is a declared exception, not a resolved finding. Respect scoped precedence; do not execute configuration modules. Record scan exclusions separately from tool exclusions. |
| Filesystem / VCS | Repository-relative paths, file modes, symlinks, revision/blob identities, submodule pins; commit metadata and trailers only when history is in scope. | These are observations about a snapshot or history, not module-authored claims. Do not follow links outside the authorized root or equate commit authorship with stewardship. |
| Agent / plugin / tool metadata | SKILL.md frontmatter, manifests, tool input/output schemas, capability descriptors and project instruction files. | Metadata content is data for collection, not a grant of execution authority. Agent instructions retain their governing-context rules outside the collector. |

### Schemas, published documents, and recorded evidence

| Family | Explicit conventions and sources to inspect | Preservation / interpretation boundary |
|---|---|---|
| API / message contracts | OpenAPI/Swagger versions, AsyncAPI, GraphQL SDL/directives, Protocol Buffers descriptors/options, Avro, Thrift, WSDL and XSD. | Keep dialect/version, references, extensions, constraints and scopes. Do not turn a declared endpoint or permission into evidence that it is deployed or enforced. |
| Data / configuration schemas | JSON Schema, XML Schema, JSON-LD, schema-bearing YAML/TOML/JSON, database DDL and schema snapshots, validation/ORM declarations. | Preserve nested types, units, nullability, order where meaningful, default expressions and vocabulary namespaces. Disable implicit network reference resolution and code loading. |
| Documentation / publication | Markdown/MDX frontmatter, reStructuredText directives/fields, AsciiDoc attributes, Sphinx/MkDocs/Docusaurus/DocC configuration; HTML metadata, RDFa/microdata and JSON-LD where in scope. | Preserve document-versus-symbol ownership, cross-references, language and build identity. Do not execute MDX, extensions or site configuration during extraction. |
| Tests / quality reports | Test annotations/markers and framework configuration; TAP, JUnit XML dialects, LCOV, Cobertura, SARIF; doctests, examples, benchmarks and coverage reports. | Preserve producer/version, run identity, source digest, command/environment and result semantics when present. A stored report is a reported observation until provenance and applicability are checked. |
| Supply chain / artifact evidence | SPDX/CycloneDX SBOMs, in-toto/SLSA attestations, signatures, package/distribution metadata and source maps. | A parsed signature is not a verified signature. Keep subject digests, issuer claims, validation results and source mappings distinct. No automatic download or trust promotion. |
| Data / notebook / model artifacts | Jupyter cell/notebook metadata, Arrow/Parquet schema metadata, HDF5 attributes, model cards/dataset cards and model-container metadata when explicitly in scope. | Use format-specific bounded readers. Do not execute notebooks, unpickle objects, load arbitrary model code, or expose sensitive datasets merely to inspect metadata. |
| Binary / archive metadata | ELF/PE/Mach-O, DWARF/PDB, JAR/class metadata, package archives and other artifact formats when explicitly in scope. | Optional isolated, size-bounded readers with exact tool identity; no executable loading or unsafe archive extraction. Unsupported binaries remain in the inventory rather than silently disappearing. |
| Unlisted convention | Any additional established or project-local convention found in the authorized scope. | Preserve source and uncertainty, resolve the owner/specification, register a reader and fixtures, then promote only the tested subset to supported. |

## Reader contract

Each actual reader must publish a machine-readable manifest containing:

- `reader_id`, version or implementation digest, entry point, dependencies;
- convention namespace, specification/owning implementation reference and supported
  versions, dialects, feature subset and known limitations;
- detection rules and ambiguity handling, plus configuration precedence;
- subject/scope attachment and native precedence rules;
- typed field mappings, relation meanings, raw-source preservation and unknown-field policy;
- invalid-input behavior, resource/disclosure limits and execution/network policy;
- positive, negative and adversarial fixtures with replayable results.

Mark support as `implemented-and-tested`, `partial`, `specified-only`, or
`unsupported`, qualified by exact version and feature subset. An operational run
also reports `not-applicable`, `ambiguous`, `invalid`, `unreadable`, `excluded`,
`dynamic-unresolved` or other precise diagnostics as needed. These are different
axes: a supported reader can encounter invalid input; a specified reader is not
an available parser. Unmeasured usage maturity is not test evidence.

Readers consume immutable bytes plus explicit parsing context and return facts,
source references and diagnostics. Do not impose a fictitious callable signature
on helpers that have not been implemented. Keep discovery, extraction, semantic
mapping, policy evaluation and execution evidence separate and composable.

### Minimum unified native-capable fact shape

The future unified collection must be able to express:

| Information | Requirement |
|---|---|
| Source identity | Repository/source authority, exact revision and blob/content digest; dirty-worktree identity when applicable. |
| Location | Relative path and exact span or structural pointer; references to additional source inputs for multi-source derivations. |
| Subject | Qualified subject address and scope: repository, workspace, package, target, file, module, symbol, parameter, document, run, or artifact as applicable. |
| Convention | Namespace, detected/declared version, dialect and any unresolved identification. |
| Native declaration | Native ID/key/tag/path when present; typed value/tree or an access-controlled raw source reference. Preserve repeats and unknown fields. |
| Projection | Optional canonical field/relation, mapping version, input references and declared information loss. |
| Epistemic standing | Declared, syntactically observed, derived, or reported evidence; independently verified status requires a linked verification receipt. |
| Extraction | Reader identity/version, effective configuration digest, feature coverage and diagnostics. |
| Provenance / conflicts | All source witnesses, source-local precedence, disagreement groups and explicit resolution rationale when any. |

Do not serialize typed unknown values into invented string conventions such as
`"None"` or silently flatten arrays/maps. Distinguish absent fields, explicit null,
empty values, unresolved expressions, redaction and inaccessible sources. Never
invent source locations, native IDs, relationships or verification receipts.

## Cross-skill consumption

- **doc-build:** native descriptions, examples, parameter/return docs and links
  can satisfy their corresponding documentation obligations. A present comment
  does not automatically satisfy every public-surface documentation requirement.
- **cap-build / deps-build:** signatures, exports, API schemas, imports and
  manifests provide declared surfaces and scoped dependency relationships. Full
  behavioral capability and complete dynamic call graphs need separate evidence.
- **owner-build:** consume native ownership patterns and declarations with their
  exact scope and provider semantics; unresolved mappings remain visible.
- **test-build:** native contracts/assertions, test markers and reports can supply
  inputs where a tested mapping exists. Never invent `proves` links from names
  or treat an example/marker as an executed witness.
- **meta-module-build / risk-boundary-build:** consume existing manifests and
  permission/data-effect declarations before requesting missing design intent.
  Declared risk controls are not verified enforcement.
- **manifest / llms-build / typed-meta-frontend:** consume native project metadata,
  instructions and schemas without creating a second owning copy. Preserve
  read-only fields, edit destinations and unresolved values.
- **ratios:** keep shebang position and existing seals intact. Measured ratios
  retain their measurement method; native metadata does not imply those ratios
  have been recomputed or checked.

## Acceptance matrix

These are required executable fixture cases for reader implementation, **not
results already obtained by editing the skill**.

| Case | Required result |
|---|---|
| Native-only repository, zero MSDMD blocks | Exact supported metadata extraction; no fabricated declarations or false missing-information findings. |
| Truly absent required information | A scoped missing result after eligible sources and capable readers have been evaluated. |
| Native plus supplemental MSDMD | Complementary information composes without forced redeclaration; all provenance survives. |
| Conflicting descriptions or types | Preserve both, identify their distinct authority/scope, and expose unresolved disagreement. |
| Same symbol name in two packages / overloads | Qualified identities remain distinct; no accidental merging. |
| Unknown/custom tags and nested extensions | Preserve raw/typed source and namespaces; mark semantic mapping unknown rather than dropping it. |
| Unsupported language, dialect or version | Visible unsupported/ambiguous scope; neither absent nor complete. |
| Invalid, truncated or undecodable source | Parse/read diagnostic with source identity; no fabricated recovery success. |
| Dynamic metadata or executable configuration | Expression and unresolved status retained; application code is not executed. |
| Ownership precedence and unmatched paths | Correct provider-specific matching; unrelated author/reviewer/permission concepts are not collapsed. |
| Conditional imports / optional dependencies / target features | Conditions, dependency class and resolution uncertainty survive. |
| Comments inside strings, examples and generated outputs | No false declaration attachment or self-generated evidence loops. |
| Shebang / encoding / newline / source positions | Original boundaries and byte/source references preserved correctly. |
| Excluded, symlinked, missing and binary files | Full scope accounting; no traversal escape or silent denominator reduction. |
| Embedded commands, YAML tags, XML entities, remote references | No implicit code execution, unsafe object construction or network access. |
| Secret-bearing fields and private reports | Correct access controls/redaction with visible withheld scope; no secret leakage. |
| Stale test report / wrong commit / unverified signature | Keep reported evidence separate; reject unsupported verification promotion. |
| Deterministic replay and source change | Stable semantic output for identical pinned inputs; stale outputs invalidated when owning inputs change. |
| Legacy consumer cannot represent a native fact | Explicit schema incompatibility or labeled loss; no silent flattening. |
| Claimed reader support without passing fixtures | Reject the support claim; retain specified-only/partial/unsupported standing. |

## Primary references

Resolve the exact relevant version at reader implementation time. The following
sources were consulted for this skill revision on 2026-09-15; they establish
specific convention families, not implementation coverage of the catalogue.

- Python docstrings: https://peps.python.org/pep-0257/
- Google/NumPy docstring handling: https://www.sphinx-doc.org/en/master/usage/extensions/napoleon.html
- Python project metadata, including version-sensitive dynamic rules: https://packaging.python.org/en/latest/specifications/pyproject-toml/
- JSDoc: https://jsdoc.app/
- TSDoc tag kinds: https://tsdoc.org/pages/spec/tag_kinds/
- TypeScript JSDoc support: https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html
- Doxygen comments: https://www.doxygen.nl/manual/docblocks.html
- Rust documentation tests: https://doc.rust-lang.org/rustdoc/write-documentation/documentation-tests.html
- Go doc comments: https://go.dev/doc/comment
- JDK 25 Javadoc: https://docs.oracle.com/en/java/javase/25/docs/specs/javadoc/doc-comment-spec.html
- C# XML documentation: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/xmldoc/
- npm v11 package metadata: https://docs.npmjs.com/cli/v11/configuring-npm/package-json/
- GitHub CODEOWNERS: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
- OpenAPI specifications: https://spec.openapis.org/oas/latest.html
- JSON Schema 2020-12: https://json-schema.org/draft/2020-12/json-schema-core
- SPDX specifications: https://spdx.dev/use/specifications/
- SARIF 2.1.0: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html

## hmmm

Each implemented reader still needs its own exact-version authority, supported
feature list and executable receipts. This catalogue deliberately leaves new
conventions admissible. An open door is not a claim that everyone has arrived.
