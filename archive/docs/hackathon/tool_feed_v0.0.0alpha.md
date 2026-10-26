# Product-feedback preparation

Draft for fields 28303–28307, not a statement that the submitter used every dependency or agrees with these opinions. Confirm each tool actually used in the chosen demo. Do not manufacture Amazon-tool experience from a README mention or package name.

## 1. Tools and purpose

Source-backed starting copy:

> a0 uses React and Vite for its web interface, Express for its authentication and request boundary, FastAPI for the Python orchestration service, and PostgreSQL for persisted application state. The continuous-work harness sits above provider adapters, including a registry-driven OpenAI-compatible transport. Pytest provides focused contract tests; the repository also includes TypeScript checking and Playwright browser tests.

Before final use, name the exact provider and any Amazon-track tool exercised in the recorded candidate, along with its role. Dependency presence is not proof of use. No qualifying AWS runtime or Kiro development use is verified in this preparation. Do not list AWS as used merely because an S3-related package exists.

## 2. What worked well

Evidence-based observation, not yet a personal endorsement:

> Separating the work harness from provider execution makes it possible to test continuity, explicit provider pinning, and safe fallback with controlled inputs. The contract tests can distinguish failures before a tool executes from failures after execution, rather than treating every error as safely repeatable.

The locked production build was exercised successfully in the implementation checkout. Add final-candidate results and the submitter's firsthand setup, documentation, performance, or reliability experience for each tool. Do not state that onboarding was easy or that live services were reliable without such evidence.

## 3. What needs work

Source-grounded project limitation:

> The full application has a multi-process setup with PostgreSQL and provider credentials. The legacy development launcher also stops processes on fixed ports, which is unsuitable for a casual trial on a shared workstation. Bounded continuity deliberately loses older detail; the full stored transcript remains necessary for authoritative inspection.

These are a0's integration/setup limitations, not claims that Amazon's tools are faulty. Describe any candidate-run failure with its exact tool, command, expected result, actual result, workaround, and severity. If a new isolated launcher resolves the port issue, describe it as a resolved integration lesson rather than a current defect.

## 4. Onboarding

**Owner answer required.** Record the actual path from installation to first working example for each tool: versions, elapsed effort if known, documentation used, blockers, and eventual result. A successful installation log can support a factual sequence; it cannot establish how the experience felt to the submitter.

No firsthand Amazon onboarding account has been supplied. Leave that gap visible until the chosen integration is exercised.

## 5. Would you use it again?

**Owner answer required: Yes/No, with a reason for each relevant device/service.** Do not infer an endorsement from current dependencies, previous project participation, or the decision to enter this event.

## Development AI and personal attestations

Field 29056 asks which AI development tools were used. Confirm their actual names and roles. Fields 29057 and 29058 ask the submitter's learning level and career value; neither can be completed from code inspection. This preparation does not answer those fields on the owner's behalf.

If supplying optional friction-log material, include only observed facts from this build. Do not reuse a different project's experience or put account identifiers, secrets, private conversations, or unrelated user data in a public log.
