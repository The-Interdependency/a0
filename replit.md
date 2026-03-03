# a0p — AI Agent

## Overview
a0p is a mobile-first autonomous AI agent application leveraging dual AI brains (Grok + Gemini). It features an advanced orchestration engine (EDCMBONE), an adaptive intelligence layer for dynamic decision-making, autonomous research capabilities, seamless integration with Google services, and comprehensive cost telemetry. The project aims to provide an intelligent, self-improving agent experience, with a strong focus on mobile usability and robust, observable operations.

## User Preferences
- I prefer clear and concise explanations.
- I value iterative development and continuous feedback.
- I want the agent to ask for confirmation before making significant changes to the codebase or external systems.
- I expect detailed logging and transparency into the agent's decision-making process.
- I prefer to have control over AI model selection and custom tool definitions.
- I want to be able to toggle features and adjust parameters to fine-tune the agent's behavior.
- I prefer a mobile-first UI with a dark mode by default.

## System Architecture
The application is built with a React + Vite + TypeScript frontend, an Express.js + TypeScript backend, and a PostgreSQL database managed by Drizzle ORM. Authentication is handled via Replit Auth (OpenID Connect). Payments are integrated with Stripe (sandbox) using managed webhooks.

**UI/UX Decisions:**
- Mobile-first design with bottom-tab navigation.
- Dark mode enabled by default across the application.
- Real-time display of agent tool actions with visual indicators.
- Comprehensive Console interface with 8 dedicated tabs for workflow, metrics, EDCM, logs, context, bandit, memory, and system configurations.

**Technical Implementations:**
- **a0p Engine (v1.0.2-S9):** The core engine incorporates EDCMBONE for operational vectors and metrics (CM, DA, DRIFT, DVG, INT, TBF), PCNA (53-node circular topology), and PTCA (4D tensor) for complex decision processing. It includes 9 sentinels for governance and evaluation.
- **Adaptive Intelligence:** Features a Multi-Armed Bandit (UCB1 + EMA decay) across tool, model, and routing domains, EDCM Behavioral Directives for dynamic prompt injection, and an 11-Seed External Memory Tensor for long-term knowledge retention and semantic analysis.
- **Dual-Model Synthesis:** Enables parallel execution of Gemini and Grok, with Gemini performing response merging and subsequent EDCM scoring and bandit rewarding.
- **Autonomous Research (Heartbeat):** A background task scheduler (30s tick) performs weighted task selection, including transcript analysis, GitHub repository search, and AI-AI social monitoring, routing findings to specific memory seeds.
- **Custom Function Calls:** Supports user-defined tools with webhook, JavaScript, or template handlers, allowing per-model targeting and bandit-rewarded execution.
- **Logging:** Implements 7 append-only JSONL log streams (master, edcm, memory, sentinel, interference, attribution, transcripts) with per-stream toggles.
- **Data Persistence:** All user context, BYO API keys, bandit arms, memory seeds, and heartbeat tasks are persisted in the PostgreSQL database.
- **hmmm Doctrine:** A persistent footer providing consistent contextual information across pages.

**Feature Specifications:**
- **Splash (`/splash`):** Full-screen dark landing page with "Agent Zero" branding, values statement, hmmm invariant definition, placeholder slots for logos/images, "Enter" button leads to login.
- **Login (`/login`):** OAuth sign-in page (Replit, Google, GitHub — all route through Replit OIDC), redirects to `/` if already authenticated.
- **Agent (`/`):** Autonomous AI with up to 8 tool rounds per request, utilizing 23 predefined tools for file operations, command execution, email, drive, and GitHub interactions. EDCM directives and memory context are dynamically injected into the prompt.
- **Terminal:** Provides sandboxed shell execution with allowlisted commands.
- **Files:** Allows browsing, reading, and editing project files, direct file uploads, and phone snapshot analysis.
- **Console:** A multi-tab interface for monitoring engine status, metrics, EDCM evaluations, logs, managing context and API keys, configuring bandit parameters, managing external memory, and adjusting system toggles.
- **Account/Pricing:** Handles Replit OAuth, subscription management via Stripe, and one-time payments for optional support and compute credits.

## External Dependencies
- **AI Integrations:**
    - Gemini 2.5 Flash (via Replit AI Integrations)
    - Grok-3 Mini (via xAI `XAI_API_KEY`)
    - BYO Providers (user-supplied keys): OpenAI, Anthropic, Mistral, Cohere, Perplexity
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