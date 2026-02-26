# a0p — AI Agent

A mobile-first AI agent app that runs in Termux/browser, uses Grok (xAI) and Gemini as dual AI brains, and provides full access to your Google infrastructure.

## Architecture

- **Frontend**: React + Vite + TypeScript, mobile-first bottom-tab navigation, dark mode by default
- **Backend**: Express.js + TypeScript on port 5000
- **Database**: PostgreSQL via Drizzle ORM

## AI Integrations

- **Gemini 2.5 Flash** (Replit AI Integrations — no user API key needed)
- **Grok-3 Mini** (xAI — requires `XAI_API_KEY` secret)
- Switchable per conversation in chat header

## Google Integrations

- **Gmail**: Read inbox, open full emails, compose & send (via Replit Connector `google-mail`)
- **Google Drive**: Browse folders, list files by type (via Replit Connector `google-drive`)

## Features

### Chat (`/`)
- Streaming AI chat with conversation history
- Switch between Gemini and Grok per conversation
- Sidebar with conversation list, delete, auto-title
- Markdown rendering with code block support

### Terminal (`/terminal`)
- Sandboxed shell execution (allowlisted commands only)
- Arrow-key history navigation
- Persistent command log in database

### Files (`/files`)
- Browse project directory tree
- Read and edit files inline
- Move/rename files

### Drive (`/drive`)
- Browse Google Drive folders
- Navigate with breadcrumb path history

### Mail (`/mail`)
- View Gmail inbox (last 15 messages)
- Open full email bodies
- Compose and send emails

### Automation (`/automation`)
- Paste a `spec.md` to create an automation task
- Gemini analyzes spec and produces a step-by-step cloud implementation plan
- Streaming output, expandable results, run/retry/delete

## Database Schema

- `users` — auth (unused in MVP)
- `conversations` — chat conversation records (title, model)
- `messages` — individual messages (role, content, model)
- `automation_tasks` — spec.md tasks with status + result
- `command_history` — terminal command log

## Key Files

- `server/routes.ts` — all API routes
- `server/storage.ts` — database storage layer
- `server/gmail.ts` — Gmail client factory
- `server/drive.ts` — Google Drive client factory
- `server/xai.ts` — Grok/xAI client factory
- `client/src/pages/chat.tsx` — main chat UI
- `client/src/pages/terminal.tsx` — terminal UI
- `client/src/pages/files.tsx` — file manager UI
- `client/src/pages/drive.tsx` — Drive browser UI
- `client/src/pages/mail.tsx` — Gmail UI
- `client/src/pages/automation.tsx` — spec.md automation UI
- `client/src/components/bottom-nav.tsx` — mobile bottom navigation
- `shared/schema.ts` — Drizzle schema + Zod types

## Environment Variables / Secrets

- `DATABASE_URL` — PostgreSQL (auto-provisioned)
- `XAI_API_KEY` — xAI/Grok API key (user-provided)
- `AI_INTEGRATIONS_GEMINI_API_KEY` / `AI_INTEGRATIONS_GEMINI_BASE_URL` — Gemini (Replit-managed)
- `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY` — Google OAuth connectors (Replit-managed)
