# ArcadIA Editor — Project Summary

## Overview

ArcadIA Editor is a client-side web application for chatting with Claude AI, with real-time code/HTML preview, a simulated code workspace, benchmarking, and team features. It is built with React 19, TypeScript 5.9, and Vite 7. There is no backend server — all state is persisted in `localStorage` and API calls go directly from the browser to the Claude API endpoint.

**Repository**: https://github.com/ikosoymeta/Arcadia/
**Deployment target**: GitHub Pages at `https://ikosoymeta.github.io/Arcadia/`
**Base URL**: `/Arcadia/` (configured in `vite.config.ts`)

---

## Current Status & Known Issues

### Blocking Issue: No Working API Endpoint

The app defaults to connecting to a Meta internal LDAR proxy at `http://localhost:8087`. This proxy is only available on Meta devservers. Without it, all chat functionality fails with:

```
POST http://localhost:8087/v1/messages net::ERR_CONNECTION_REFUSED
```

**The app shows a user-friendly error**: "Cannot reach http://localhost:8087. Make sure LDAR is running on your devserver, or switch to API Key mode in Settings."

**To fix**: Either:
1. Run the app on a Meta devserver where LDAR is running, OR
2. Go to Settings > + Add Connection > select "API Key" > enter an Anthropic API key (`sk-ant-...`) > Save, then click the new connection to activate it

### GitHub Pages Deployment

The deploy workflow (`.github/workflows/deploy.yml`) requires GitHub Pages to be manually enabled first:
1. Go to https://github.com/ikosoymeta/Arcadia/settings/pages
2. Under "Source", select "GitHub Actions"
3. Save
4. Push a commit or manually trigger the workflow

Without this, the CI fails with `HttpError: Not Found` at the `actions/configure-pages@v5` step.

### Other Resolved Issues
- **Favicon 404**: Fixed — added `public/favicon.svg` and `<link rel="icon">` in `index.html`
- **SSE stream parsing**: Fixed — buffered incomplete lines across TCP chunk boundaries to prevent silent token loss
- **Error messages**: Improved — actionable messages for proxy unreachable, missing API key, and network failures

---

## Architecture

### Tech Stack
- **React 19** with functional components and hooks
- **TypeScript 5.9** (strict mode)
- **Vite 7** for dev server and bundling
- **CSS Modules** for component-scoped styling
- **No router** — view switching via React state (`viewMode`)
- **No backend** — localStorage for persistence, direct API calls from browser
- **Code splitting** — 6 of 7 view panels lazy-loaded via `React.lazy`

### Runtime Dependencies
```json
{
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "react-markdown": "^10.1.0",
  "remark-gfm": "^4.0.1",
  "web-vitals": "^5.1.0"
}
```

### Build Commands
```bash
npm run dev       # Start dev server on port 5173
npm run build     # TypeScript check + Vite production build (output: dist/)
npm run preview   # Preview production build locally
npm run lint      # ESLint
```

---

## File Structure

```
claude-web-editor/
├── index.html                          # HTML entry point
├── package.json                        # Dependencies and scripts
├── vite.config.ts                      # Vite config + dev proxy plugin
├── tsconfig.json                       # TypeScript project references
├── tsconfig.app.json                   # App TypeScript config (ES2022, react-jsx)
├── tsconfig.node.json                  # Node TypeScript config (for vite.config.ts)
├── eslint.config.js                    # ESLint flat config
├── public/
│   └── favicon.svg                     # App favicon (purple "A" icon)
├── .github/workflows/
│   └── deploy.yml                      # GitHub Pages deployment workflow
└── src/
    ├── main.tsx                         # React entry point (renders <App />)
    ├── App.tsx                          # Root component, view routing, provider tree
    ├── App.module.css                   # Root layout (flexbox, full viewport)
    ├── index.css                        # Global CSS, theme variables, scrollbar styles
    ├── types/
    │   └── index.ts                     # All TypeScript interfaces (18 types)
    ├── store/
    │   ├── ChatContext.tsx              # Chat state (conversations, folders, streaming, cowork)
    │   ├── ConnectionContext.tsx        # API connection state (CRUD, test, active selection)
    │   └── PreviewContext.tsx           # Artifact/preview state (ephemeral, per-session)
    ├── services/
    │   ├── claude.ts                    # Claude API client (streaming, benchmarks, test)
    │   ├── benchmark.ts                 # Benchmark suite runner + analysis
    │   └── storage.ts                   # localStorage wrapper (all keys prefixed "arcadia-")
    └── components/
        ├── Onboarding/
        │   ├── OnboardingWizard.tsx     # First-run welcome, auto-configures Meta Proxy
        │   └── Onboarding.module.css
        ├── Sidebar/
        │   ├── Sidebar.tsx             # Left nav: views, conversations, folders, cowork tasks
        │   └── Sidebar.module.css
        ├── Chat/
        │   ├── ChatPanel.tsx           # Main chat: messages, input, streaming, quick actions
        │   └── ChatPanel.module.css
        ├── Preview/
        │   ├── PreviewPanel.tsx        # Right panel: code viewer, HTML iframe, markdown
        │   └── PreviewPanel.module.css
        ├── CodeWorkspace/
        │   ├── CodeWorkspace.tsx        # VS Code-like editor, terminal, debug, file explorer
        │   └── CodeWorkspace.module.css
        ├── Settings/
        │   ├── SettingsPanel.tsx        # Connection management (proxy/API key modes)
        │   └── Settings.module.css
        ├── Benchmark/
        │   ├── BenchmarkPanel.tsx       # Performance benchmarks with charts and web vitals
        │   └── Benchmark.module.css
        ├── Skills/
        │   └── SkillsPanel.tsx          # Reusable prompt templates (inline styles)
        ├── Team/
        │   └── TeamPanel.tsx            # Team pod management (inline styles)
        └── Help/
            └── HelpPanel.tsx            # Searchable user manual (inline styles)
```

---

## Component & Data Flow

### Provider Hierarchy (in App.tsx)
```
<ConnectionProvider>          ← API connections (persisted to localStorage)
  <ChatProvider>              ← Conversations, folders, streaming state (persisted)
    <PreviewProvider>         ← Extracted artifacts (ephemeral, per-session)
      <OnboardingWizard />    ← Conditional overlay on first run
      <Sidebar />             ← Always rendered, drives navigation
      <main panel>            ← Switches based on viewMode state
```

### View Routing (no router library)
`App.tsx` holds a `viewMode` state of type `ViewMode`:
```typescript
type ViewMode = 'chat' | 'settings' | 'benchmarks' | 'code-workspace' | 'skills' | 'team' | 'help';
```
The Sidebar calls `onViewChange(mode)` to switch views. All non-chat views are lazy-loaded with `React.lazy` + `Suspense`.

### API Call Flow
All API calls route through `buildRequest()` in `src/services/claude.ts`. This function has three code paths:

1. **Custom baseUrl (Meta LDAR proxy)**: When `baseUrl` is set (e.g., `http://localhost:8087`):
   - URL: `{baseUrl}/v1/messages`
   - Headers: `Content-Type`, `anthropic-version: 2023-06-01`
   - No API key header (proxy handles auth via AWS Bedrock)

2. **Dev mode (Vite proxy)**: When `import.meta.env.DEV` is true and no `baseUrl`:
   - URL: `/api/claude`
   - The `claudeProxyPlugin` in `vite.config.ts` proxies to `https://api.anthropic.com/v1/messages`
   - API key is sent in the request body, extracted by the proxy, and forwarded as `x-api-key` header

3. **Production (direct API)**: When deployed and no `baseUrl`:
   - URL: `https://api.anthropic.com/v1/messages`
   - Headers: `x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access: true`

### Streaming Flow (SSE)
1. `ChatPanel.handleSend()` calls `sendMessage()` with `stream: true`
2. Response is parsed as Server-Sent Events (SSE): lines starting with `data: `
3. Each `content_block_delta` event's `delta.text` is appended to streaming state
4. On completion, `extractArtifacts()` parses code blocks from the full response text
5. Artifacts (code, HTML) are pushed to PreviewContext and displayed in PreviewPanel
6. Incomplete SSE lines are buffered across TCP chunks to prevent token loss

### Data Persistence
All persistence uses `localStorage` via `src/services/storage.ts`:
| Key | Data | Managed By |
|-----|------|------------|
| `arcadia-conversations` | `Conversation[]` | ChatContext |
| `arcadia-folders` | `Folder[]` | ChatContext |
| `arcadia-connections` | `Connection[]` | ConnectionContext |
| `arcadia-active-connection` | `string` (ID) | ConnectionContext |
| `arcadia-benchmarks` | `BenchmarkSuite[]` | BenchmarkPanel |
| `arcadia-skills` | `Skill[]` | SkillsPanel |
| `arcadia-teams` | `TeamPod[]` | TeamPanel |
| `arcadia-onboarding-complete` | `"true"` | OnboardingWizard |
| `arcadia-chat-mode` | `"chat" \| "cowork"` | ChatContext |
| `arcadia-global-instructions` | `string` | ChatContext |

---

## Key Type Definitions (src/types/index.ts)

### Connection
```typescript
interface Connection {
  id: string;
  label: string;           // Display name (e.g., "Meta Proxy", "My API Key")
  apiKey: string;           // Anthropic API key (empty for proxy connections)
  model: string;            // e.g., "claude-sonnet-4-20250514"
  maxTokens: number;        // Default: 4096
  temperature: number;      // Default: 0.7
  isActive: boolean;        // Only one connection is active at a time
  status: 'connected' | 'disconnected' | 'error';
  lastUsed?: number;
  baseUrl?: string;         // Custom API endpoint (e.g., "http://localhost:8087")
}
```

### Message
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;          // Raw text including markdown/code blocks
  timestamp: number;
  tokens?: number;          // Token count from API response
  artifacts?: Artifact[];   // Extracted code/HTML artifacts
}
```

### Artifact
```typescript
interface Artifact {
  id: string;
  type: 'code' | 'markdown' | 'html' | 'image' | 'file';
  language?: string;        // e.g., "typescript", "html", "python"
  title?: string;
  content: string;
  filename?: string;
}
```

### Conversation
```typescript
interface Conversation {
  id: string;
  title: string;            // Auto-set from first user message (first 50 chars)
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model: string;
  folderId: string | null;
  isPinned: boolean;
  visibility: 'private' | 'team' | 'public';
  ownerId: string;
  ownerName: string;
  shareUrl?: string;
  collaborators: Collaborator[];
  checkpoints: Checkpoint[];
  tags: string[];
}
```

### Available Models (in SettingsPanel)
```typescript
const MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-haiku-35-20241022', label: 'Claude 3.5 Haiku' },
];
```

---

## Feature Details

### 1. Chat (ChatPanel.tsx)
- **Chat mode**: Standard conversation with Claude
- **Cowork mode**: Tasks broken into steps with progress tracking (planning → in_progress → completed)
- **Quick actions** (empty state buttons):
  - Chat: "Write a React component", "Create an HTML page", "Explain a concept", "Debug my code"
  - Cowork: "Build a landing page with form and validation", "Create a REST API with documentation", etc.
- **Global instructions**: System prompt prepended to all messages
- **Folder instructions**: Per-folder system prompts (for Cowork mode)
- **Streaming**: Real-time token display with animated dots, abort button
- **Markdown rendering**: `react-markdown` with `remark-gfm` for tables, strikethrough, etc.
- **Code block interaction**: Clicking a code block in chat pushes it to the Preview panel
- **Auto-title**: First user message (truncated to 50 chars) becomes the conversation title

### 2. Preview (PreviewPanel.tsx)
- **Code view**: Syntax-highlighted with line numbers, copy button
- **HTML view**: Rendered in sandboxed iframe (`allow-scripts allow-same-origin`), "Open in new tab" button
- **Markdown view**: Rendered with react-markdown
- **Tabbed**: Multiple artifacts shown as tabs, auto-selects newest
- **Collapsible**: Right panel can be collapsed

### 3. Code Workspace (CodeWorkspace.tsx)
- **File explorer**: Tree view with sample files + artifacts from chat
- **Tabbed editor**: Open multiple files, line numbers, close tabs
- **Simulated terminal**: Supports `ls`, `pwd`, `cat <file>`, `npm run dev`, `git status`, `npm test`, `clear`, `help`
- **Debug panel**: Variables, watch expressions, breakpoints, call stack, performance metrics (all simulated)
- **AI Assistant dock**: Placeholder UI for code-aware AI assistance
- **Home button**: "← Home" in toolbar navigates back to chat view

### 4. Settings (SettingsPanel.tsx)
- **Connection types**: "Meta Proxy (LDAR)" or "API Key"
- **Meta Proxy**: Pre-fills `http://localhost:8087`, no API key needed
- **API Key**: Standard Anthropic key input
- **Connection management**: Add, delete, test, switch active connection
- **Configuration display**: Shows active model, endpoint, max tokens, temperature, status

### 5. Benchmarks (BenchmarkPanel.tsx)
- **6 benchmark prompts**: Simple Q&A, Code Generation, Long Output, Complex Reasoning, HTML Generation, Multi-step Analysis
- **Metrics**: TTFT (time to first token), total time, tokens/second, render time
- **Web Vitals**: LCP, FID, CLS, TTFB, INP (via `web-vitals` library)
- **Issue detection**: Flags slow TTFT (>3s), low throughput (<15 t/s), slow rendering (>500ms)
- **Visualization**: Bar chart + detailed result cards

### 6. Skills (SkillsPanel.tsx)
- **Pre-built skills**: React Component Generator, API Documentation Writer, Code Review Assistant, Test Generator, SQL Query Builder
- **Custom skills**: Create with name, description, prompt template, category, tags
- **Prompt templates**: Support `[PLACEHOLDER]` syntax
- **Search/filter**: By name, category, tags
- **Usage tracking**: Counts how many times each skill is used

### 7. Team Pods (TeamPanel.tsx)
- **Pod management**: Create pods with name, description, members
- **Roles**: Admin, Member
- **AI agents**: Can add AI agent members (marked with `isAiAgent` flag)
- **Meta SSO**: Banner indicating authentication is via Meta SSO (placeholder)

### 8. Help (HelpPanel.tsx)
- **9 sections**: Getting Started, Conversations, Cowork Mode, Preview, Code Workspace, Skills, Team, Benchmarks, Keyboard Shortcuts
- **Searchable**: Full-text search across all Q&A entries
- **Left nav**: Section navigation with main content area

### 9. Sidebar (Sidebar.tsx)
- **View navigation**: Chat, Code Workspace, Skills, Team, Benchmarks, Settings, Help
- **New chat button**: Creates conversation with active model
- **Conversation list**: Pinned conversations first, then by recency
- **Folder management**: Create, rename, delete folders; drag conversations into folders
- **Context menu**: Right-click on conversations for rename, pin, share URL, visibility, delete
- **Delete confirmation**: Modal dialog before deleting conversations
- **Cowork tasks**: Shows active tasks with status indicators when in Cowork mode
- **Collapsible**: Can be collapsed to save space

### 10. Onboarding (OnboardingWizard.tsx)
- **Single-screen welcome**: Shows ArcadIA branding and 3 feature highlights
- **One-click setup**: "Start Chatting" button auto-configures:
  - Meta Proxy connection at `http://localhost:8087`
  - Model: `claude-sonnet-4-20250514`
  - Max tokens: 4096, Temperature: 0.7
  - Creates first conversation
  - Sets `arcadia-onboarding-complete` in localStorage
- **Shown once**: Only displayed if `arcadia-onboarding-complete` is not in localStorage

---

## Theming

Dark theme by default. Light theme available via `data-theme="light"` on the `<html>` element (no UI toggle currently implemented).

CSS custom properties defined in `src/index.css`:
```css
--bg-primary: #0f0f0f;      /* Main background */
--bg-secondary: #171717;    /* Card/panel backgrounds */
--bg-tertiary: #1a1a1a;     /* Nested backgrounds */
--bg-hover: #262626;        /* Hover states */
--border: #2a2a2a;          /* Borders and dividers */
--text-primary: #e5e5e5;    /* Main text */
--text-secondary: #a3a3a3;  /* Secondary text */
--text-tertiary: #525252;   /* Muted text */
--accent: #6366f1;          /* Indigo accent (buttons, highlights) */
--accent-dim: rgba(99, 102, 241, 0.12);
--success: #22c55e;         /* Green */
--error: #ef4444;           /* Red */
--warning: #eab308;         /* Yellow */
```

---

## Error Handling

### API Errors (in claude.ts sendMessage)
```
"Failed to fetch" / TypeError:
  ├── If baseUrl is set:
  │     "Cannot reach {baseUrl}. Make sure LDAR is running..." (if localhost:8087)
  │     "Check that the proxy URL is correct in Settings." (other URLs)
  ├── If no apiKey:
  │     "No API key configured. Go to Settings to add one."
  └── Otherwise:
        "Network error. Check your internet connection and try again."

AbortError: silently ignored (user cancelled)
Other errors: error.message passed through
```

### Connection Testing (in ConnectionContext.tsx)
- Calls `testConnection()` which sends a minimal request ("Say connected in one word")
- Updates connection `status` to `'connected'` or `'error'`
- Wrapped in try/catch to handle network failures gracefully

---

## Vite Dev Proxy (vite.config.ts)

A custom Vite plugin `claudeProxyPlugin` handles API calls during development:
- Listens on `POST /api/claude`
- Extracts `apiKey` from the JSON request body
- Forwards the request to `https://api.anthropic.com/v1/messages` with proper headers
- Streams SSE responses back to the browser
- This avoids CORS issues since the browser talks to `localhost:5173` (same origin)

This proxy is **only active during development** (`npm run dev`). In production, the app calls the API directly with `anthropic-dangerous-direct-browser-access: true` header.

---

## Deployment (GitHub Actions)

Workflow: `.github/workflows/deploy.yml`
- Triggers on push to `main` or manual dispatch
- Steps: checkout → Node 20 setup → `npm ci` → `npm run build` → configure-pages → upload `dist/` → deploy

**Prerequisites**:
1. GitHub Pages must be enabled manually in repo Settings > Pages > Source: GitHub Actions
2. The repo needs `pages: write` and `id-token: write` permissions (already configured in workflow)

---

## Troubleshooting Checklist

### "Cannot reach localhost:8087" / ERR_CONNECTION_REFUSED
- The Meta LDAR proxy isn't running
- **Fix**: Add an API Key connection in Settings, or run on a devserver

### "No API connection configured"
- No active connection exists
- **Fix**: Go to Settings, add a connection (proxy or API key), it auto-activates if first

### Chat messages not appearing / tokens seem lost
- Possible SSE chunk boundary issue (fixed in latest commit)
- Verify you're on the latest build

### Favicon 404
- Fixed in latest commit — `public/favicon.svg` + `<link>` tag in `index.html`

### GitHub Pages deploy fails with "Not Found"
- Pages not enabled in repo settings
- **Fix**: Settings > Pages > Source: GitHub Actions

### GitHub Pages deploy fails with "Resource not accessible by integration"
- Tried `enablement: true` on configure-pages, which requires admin token
- **Fix**: Don't use `enablement: true`, enable Pages manually instead

### Blank page on GitHub Pages
- Check that `base: '/Arcadia/'` matches the repo name in `vite.config.ts`
- All asset paths must be relative to this base

### localStorage full or corrupted
- Clear all `arcadia-*` keys from localStorage
- Or run in DevTools console: `Object.keys(localStorage).filter(k => k.startsWith('arcadia-')).forEach(k => localStorage.removeItem(k))`

### Onboarding keeps reappearing
- Check that `localStorage.getItem('arcadia-onboarding-complete')` returns `"true"`
- If not, the wizard will show on every page load

### Build fails with TypeScript errors
- Run `npx tsc -b` to see the errors
- Ensure `@types/react` and `@types/react-dom` versions match React 19

---

## Recent Git History
```
13b4734 Add home button to Code Workspace toolbar
cdce7a4 Fix favicon 404 and SSE stream parsing bug
2beec0d Improve error messages for unreachable proxy and network failures
4503e83 Simplify onboarding to single-click Meta Proxy setup
84d72bb Add Meta internal proxy (LDAR) support for Claude API access
36f5166 Remove enablement flag from configure-pages (requires manual setup)
734c21c Fix regression issues and enable GitHub Pages auto-setup
```
