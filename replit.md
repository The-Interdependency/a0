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
- Comprehensive Console interface with 12 dedicated tabs: Heartbeat, Metrics, EDCM, Logs, Context, Bandit, Memory, System, Brain, Credentials, Export, and Custom Tools.
- Slider orientation toggle (vertical/horizontal) for all Console sliders, default vertical.
- Chat message word-wrap prevents horizontal overflow on mobile.
- Active conversation persists across page navigation via localStorage.
- Login gate redirects unauthenticated users to /login.

**Technical Implementations:**
- **a0p Engine (v1.0.2-S9):** The core engine incorporates EDCMBONE for operational vectors and metrics (CM, DA, DRIFT, DVG, INT, TBF), PCNA (53-node circular topology), and PTCA (4D tensor) for complex decision processing. It includes 9 sentinels for governance and evaluation.
- **Adaptive Intelligence:** Features a Multi-Armed Bandit (UCB1 + EMA decay) across tool, model, and routing domains, EDCM Behavioral Directives for dynamic prompt injection, and an 11-Seed External Memory Tensor for long-term knowledge retention and semantic analysis.
- **Brain Presets + Synthesis Pipeline:** Configurable model pipeline with saved presets (a0 Dual, Quick Answer, Grok Solo, Hub-First, Deep Research). Each preset defines ordered stages with model, role (generate/review/refine/synthesize), and input source. Pipeline executor supports parallel stages, hub model integration via stored credentials, and per-model merge weights. Controllable via Console UI and agent tool-calls.
- **Dual-Model Synthesis:** Default "a0 Dual" preset runs Gemini and Grok in parallel, with Gemini performing response merging and EDCM scoring.
- **Autonomous Research (Heartbeat):** A background task scheduler (30s tick) performs weighted task selection, including transcript analysis, GitHub repository search, and AI-AI social monitoring, routing findings to specific memory seeds. Custom tasks can be created/edited/deleted from the Console; built-in tasks are protected.
- **Activity Stats Dashboard:** Real-time aggregate counts at top of Heartbeat tab showing heartbeat runs, messages, conversations, chain events, discovery drafts, promotions, EDCM snapshots, and memory snapshots (auto-refresh 10s).
- **Custom Function Calls:** Supports user-defined tools with webhook, JavaScript, or template handlers, allowing per-model targeting and bandit-rewarded execution.
- **Logging:** Implements 8 append-only log streams: master, edcm, memory, sentinel, interference, attribution, transcripts, and ai-transcripts (verbatim model I/O). Per-stream toggles.
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
