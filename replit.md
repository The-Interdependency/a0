# a0p — AI Agent

## Overview
a0p is a mobile-first autonomous AI agent application leveraging multi-model AI brains (Grok, Gemini, and configurable hub models). It features an advanced orchestration engine (EDCMBONE), an adaptive intelligence layer for dynamic decision-making, autonomous research capabilities, seamless integration with Google services, and comprehensive cost telemetry. The project aims to provide an intelligent, self-improving agent experience, with a strong focus on mobile usability and robust, observable operations.

## User Preferences
- I prefer clear and concise explanations.
- I value iterative development and continuous feedback.
- I want the agent to ask for confirmation before making significant changes to the codebase or external systems.
- I expect detailed logging and transparency into the agent's decision-making process.
- I prefer to have control over AI model selection and custom tool definitions.
- I want to be able to toggle features and adjust parameters to fine-tune the agent's behavior.
- I prefer a mobile-first UI with a dark mode by default.
- I want configurable "brain presets" for different model orderings/pipeline strategies.
- I want full token accounting with per-model, per-stage, per-conversation cost tracking.
- I want a general-purpose secrets/credentials manager for Google Cloud, AI hubs, and any other services.
- I want all AI model conversations logged verbatim.
- I want to be able to download/export all data (transcripts, conversations, credentials list, system config).

## System Architecture
The application is built with a React + Vite + TypeScript frontend, an Express.js + TypeScript backend, and a PostgreSQL database managed by Drizzle ORM. Authentication is handled via Replit Auth (OpenID Connect). Payments are integrated with Stripe (sandbox) using managed webhooks.

**UI/UX Decisions:**
- Mobile-first design with bottom-tab navigation.
- Dark mode enabled by default across the application.
- Real-time display of agent tool actions with visual indicators.
- Comprehensive Console interface with 15 dedicated tabs: Heartbeat, Metrics, EDCM, Logs, Context, Bandit, Memory, System, Brain, Credentials, Export, Custom Tools, Omega (PTCA-Ω dimension gauges, bias sliders, goal stack, energy sparkline, mode selector), and Psi (PTCA-Ψ sentinel→Ψ→Ω bridge visualization, dimension energy bars with threshold markers, bias sliders, self-model mode selector, triad energy summary, energy history sparkline).
- Slider orientation toggle (vertical/horizontal) for all Console sliders, default vertical.
- Chat message word-wrap prevents horizontal overflow on mobile.
- Active conversation persists across page navigation via localStorage.
- Login gate redirects unauthenticated users to /login.

**Technical Implementations:**
- **a0p Engine (v1.0.2-S11):** The core engine incorporates EDCMBONE for operational vectors and metrics (CM, DA, DRIFT, DVG, INT, TBF), PCNA (53-node circular topology), and a three-tensor triad architecture: PTCA (cognitive, 53×11×8×7=32,648), PTCA-Ψ (self-model), and PTCA-Ω (autonomy). 11 zero-indexed sentinels S0–S10 for governance, with S9_AUTONOMY monitoring Ω health and S10_SELFMODEL monitoring Ψ health.
- **Sentinel Numbering (S0–S10):** Zero-indexed ordinal: S0_PROVENANCE, S1_POLICY, S2_BOUNDS, S3_APPROVAL, S4_CONTEXT, S5_IDENTITY, S6_MEMORY, S7_RISK, S8_AUDIT, S9_AUTONOMY (Ω only), S10_SELFMODEL (Ψ only). Each sentinel monitors exactly one concern. Sentinel→Ψ mapping is trivial ordinal (index i → Ψ dimension i).
- **PTCA-Ψ (Self-Model Tensor):** A 53×11×8×7=32,648-element tensor modeling the AI's introspective state. 11 dimensions: Ψ0 Integrity, Ψ1 Compliance, Ψ2 Prudence, Ψ3 Confidence, Ψ4 Clarity, Ψ5 Identity, Ψ6 Recall, Ψ7 Vigilance, Ψ8 Coherence, Ψ9 Agency, Ψ10 Self-Awareness. Each bridges a Sentinel (governance) to an Ω Autonomy dimension (behavior) via PSI_OMEGA_MAP=[0,3,7,1,2,9,6,8,4,5,-1]. Ψ7 Vigilance↔A9 Exploration is INVERSE coupling. Ψ10 is a global Ω modulator. 4 self-model modes: reflective, operational, transparent, guarded. Constants: alpha=0.25, beta=0.2, gamma=0.2, coupling=0.04. Sentinel feedback: pass→boost(0.03), fail→decay(0.05), S7 fail→large boost. Persisted as psi_tensor_state in system_toggles. Agent tool-calls: get_psi_state, boost_psi_dimension, set_selfmodel_mode, get_triad_state. All operations logged to psi stream.
- **PTCA-Ω (Autonomy Tensor):** A 53×10×8×7 = 29,680-element tensor dedicated to self-directed behavior. 10 autonomy dimensions: A1 Goal Persistence, A2 Initiative, A3 Planning Depth, A4 Verification, A5 Scheduling, A6 Outreach, A7 Learning, A8 Resource Awareness, A9 Exploration, A10 Delegation. Cross-coupled to PTCA (coupling=0.05), PTCA-Ψ (coupling=0.04), memory seeds (A1↔Seed8, A9↔Seed7, A7↔Seed10), bandit epsilon (A9), and EDCM (drift→A4). S9_AUTONOMY monitors Ω energy bounds and goal stack. Supports 4 autonomy modes: active, passive, economy, research. Goal stack stored in system toggles. Agent tool-calls: set_goal, complete_goal, list_goals, get_omega_state, boost_dimension, set_autonomy_mode. Heartbeat uses omega-weighted task selection. All operations append-only logged to omega stream.
- **Triad Synchronization:** Heartbeat tick runs: psiSolve() → omegaSolve() → applyPsiOmegaCoupling() → applyCrossTensorCoupling() → applyMemoryBridge(). Sentinel results feed Ψ via applySentinelFeedback() on every request. Both Ψ and Ω persist across restarts.
- **Autonomous Tool Generation (Ψ-Gated):** a0 can autonomously create custom tools from hub model connections, gated by Ψ self-assessment (Ψ3 Confidence≥0.4, Ψ4 Clarity≥0.3, Ψ5 Identity≥0.4). Max 20 generated tools. Generated tools marked `isGenerated: true` in custom_tools table, displayed with "Generated" badge in Console. Heartbeat can auto-generate hub tools when A9 Exploration is above threshold. Agent tool-calls: generate_tool, list_hub_connections. Bandit-tracked for relevance. All operations logged.
- **Adaptive Intelligence:** Features a Multi-Armed Bandit (UCB1 + EMA decay) across tool, model, and routing domains, EDCM Behavioral Directives for dynamic prompt injection, and an 11-Seed External Memory Tensor for long-term knowledge retention and semantic analysis.
- **Brain Presets + Synthesis Pipeline:** Configurable model pipeline with saved presets (a0 Dual, Quick Answer, Grok Solo, Hub-First, Deep Research). Each preset defines ordered stages with model, role (generate/review/refine/synthesize), and input source. Pipeline executor supports parallel stages, hub model integration via stored credentials, and per-model merge weights. Controllable via Console UI and agent tool-calls.
- **Dual-Model Synthesis:** Default "a0 Dual" preset runs Gemini and Grok in parallel, with Gemini performing response merging and EDCM scoring.
- **Autonomous Research (Heartbeat):** A background task scheduler (30s tick) performs weighted task selection, including transcript analysis, GitHub repository search, and AI-AI social monitoring, routing findings to specific memory seeds. Custom tasks can be created/edited/deleted from the Console; built-in tasks are protected.
- **Activity Stats Dashboard:** Real-time aggregate counts at top of Heartbeat tab showing heartbeat runs, messages, conversations, chain events, discovery drafts, promotions, EDCM snapshots, and memory snapshots (auto-refresh 10s).
- **Custom Function Calls:** Supports user-defined tools with webhook, JavaScript, or template handlers, allowing per-model targeting and bandit-rewarded execution.
- **Logging:** Implements 10 append-only log streams: master, edcm, memory, sentinel, interference, attribution, transcripts, ai-transcripts (verbatim model I/O), omega (autonomy tensor operations), and psi (self-model tensor operations). Per-stream toggles. Omega stream viewable in Console Logs tab (orange badge), psi stream viewable (pink badge).
- **Verbatim AI Transcript Logging:** Every AI model call (Gemini, Grok, hub, synthesis-merge) is logged with full request, response, tokens, latency, and conversation attribution to `logs/ai-transcripts/` with daily rotation. Viewable in Console Logs tab filtered by model/date.
- **Token Accounting:** Enhanced cost_metrics with conversationId, stage, pipelinePreset, and cacheTokens fields. Configurable rate cards per model (DB-backed, not hardcoded). Server-side spend limit enforcement with hard-stop/warn-only modes. Enhanced Metrics tab with per-model breakdown, per-stage breakdown, per-conversation costs, daily time series, rate card editor, and spend limit controls.
- **Secrets & Credentials Manager:** Console "Credentials" tab with three sections: AI Provider Keys (5 built-in providers), Service Credentials (multi-field groups with templates for AI Hub, Google Cloud, Firebase, AWS, Custom), and Quick Secrets (key-value pairs). Values stored encrypted in DB, always masked on frontend, accessible server-side via `getUserCredential()` and `getUserSecret()` helpers.
- **Data Export:** Console "Export" tab with individual downloads (AI transcripts, conversations, credentials inventory, system config) and combined ZIP archive. Supports date/model filtering for transcripts.
- **Data Persistence:** All user context, BYO API keys, credentials, secrets, bandit arms, memory seeds, brain presets, and heartbeat tasks are persisted in the PostgreSQL database.
- **hmmm Doctrine:** A persistent footer providing consistent contextual information across pages.
- **a0 Email:** `wayseer00@gmail.com` stored as `A0P_EMAIL` environment variable, also configurable via Credentials Manager.

**Feature Specifications:**
- **Splash (`/splash`):** Full-screen dark landing page with "Agent Zero" branding, values statement, hmmm invariant definition, placeholder slots for logos/images, "Enter" button leads to login.
- **Login (`/login`):** OAuth sign-in page (Replit, Google, GitHub — all route through Replit OIDC), redirects to `/` if already authenticated. Login gate protects all other routes.
- **Agent (`/`):** Autonomous AI with up to 8 tool rounds per request, utilizing 23+ predefined tools for file operations, command execution, email, drive, GitHub interactions, and brain preset control. EDCM directives and memory context are dynamically injected into the prompt. Active conversation persists via localStorage.
- **Terminal:** Provides sandboxed shell execution with allowlisted commands.
- **Files:** Allows browsing, reading, and editing project files, direct file uploads, and phone snapshot analysis.
- **Console:** A multi-tab interface for monitoring engine status, metrics, EDCM evaluations, logs, managing credentials and secrets, configuring bandit parameters, managing external memory, configuring brain presets/pipeline, viewing activity stats, exporting data, and adjusting system toggles. Slider orientation toggleable between vertical and horizontal.
- **Account/Pricing:** Handles Replit OAuth, subscription management via Stripe, and one-time payments for optional support and compute credits.

## External Dependencies
- **AI Integrations:**
    - Gemini 2.5 Flash (via Replit AI Integrations)
    - Grok-3 Mini (via xAI `XAI_API_KEY`)
    - BYO Providers (user-supplied keys): OpenAI, Anthropic, Mistral, Cohere, Perplexity
    - Hub Models (via Credentials Manager): any OpenAI-compatible API endpoint
- **Google Integrations (via Replit Connectors):**
    - Gmail: Read inbox, open emails, compose & send.
    - Google Drive: Browse folders, list files.
- **GitHub Integration (via Replit GitHub Connector & `@octokit/rest` v22):**
    - Tools for repository listing, file operations (get, list, create/update, delete), zip push, and Codespace management (list, create, start, stop, delete, execute).
    - Manages GitHub Pages deployments.
- **Authentication:**
    - Replit Auth (OpenID Connect via `passport`).
- **Payments:**
    - Stripe (sandbox) via `stripe-replit-sync`.
- **Database:**
    - PostgreSQL via Drizzle ORM.
