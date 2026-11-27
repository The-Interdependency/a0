# Primary sources for GitHub testing

Reviewed 2026-11-03. Recheck mutable platform/framework behavior before edits.
Use these sources for mechanics and repository contracts for expected behavior.
Portfolio ordering, the evidence table, and risk-based lane selection are
workflow synthesis, not GitHub requirements.

| Source | Applied guidance |
|---|---|
| [GitHub: required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks) | Revision/event identity, skipped jobs, pending filtered workflows, dependent gates. |
| [GitHub: workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) | PR and merge-group triggers. |
| [GitHub: secure use](https://docs.github.com/en/actions/reference/security/secure-use) | Minimum permissions, action pinning, untrusted code, input handling, secrets. |
| [GitHub: workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) | Matrices, needs, conditions, execution limits. |
| [pytest: good integration practices](https://docs.pytest.org/en/stable/explanation/goodpractices.html) | Isolation, discovery, import paths, installed distributions. |
| [pytest: exit codes](https://docs.pytest.org/en/stable/reference/exit-codes.html) | Assertion failures, runner errors, empty discovery. |
| [pytest: flaky tests](https://docs.pytest.org/en/stable/explanation/flaky.html) | Nondeterminism, isolation, retry limitations. |
| [Playwright: best practices](https://playwright.dev/docs/best-practices) | Observable behavior, isolation, resilient assertions, failure traces. |
| [Playwright: retries](https://playwright.dev/docs/test-retries) | Passed, failed, and flaky outcomes. |
| [Google Testing: behavior over implementation](https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html) | Public-behavior tests and justified implementation-specific exceptions. |
| [Google Testing: how much testing](https://testing.googleblog.com/2021/06/how-much-testing-is-enough.html) | Coverage limits, behavior/feature coverage, critical journeys. |

## Usage

Read the relevant primary page when a finding depends on a platform semantic.
Cite the exact repository file/run for repository findings. Keep observed results
separate from guidance motivating improvements.
