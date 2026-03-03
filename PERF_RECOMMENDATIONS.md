# Performance Recommendations Implementation Notes

## Current Architecture
- Bridge: Node.js HTTP server spawning `claude -p` CLI for each request
- Frontend: React app with SSE streaming, localStorage persistence
- Messages: Converted via `convertMessages()` in claude.ts, preserving contentBlocks if present

## 1. Fix Tool Use Loop
**Current**: `sendMessage` returns `toolCalls` array but the caller (SimpleView/EngineerView) doesn't send `tool_result` blocks back.
**Fix**: After receiving tool_calls, execute them (or simulate), then send a follow-up message with tool_result blocks. For the bridge (claude -p), tool use isn't directly supported since it's CLI mode. For direct API connections, implement the tool_result loop.
**Approach**: Add a `handleToolResults` loop in SimpleView.handleSend that detects tool_calls and re-sends with tool_result blocks.

## 2. Context Window Management
**Current**: All messages are sent to the API every time. No trimming.
**Fix**: Add a `trimMessages()` function that:
  - Counts approximate tokens (chars/4)
  - Keeps system prompt + last N messages within model's context limit
  - Optionally summarizes old messages using a cheap model
**Approach**: Add `trimMessages()` in claude.ts, call it before building the request body.

## 3. Preserve Message Structure in Bridge
**Current**: Bridge flattens all messages to a single text prompt via `claude -p` stdin.
**Fix**: The bridge already receives structured messages from the frontend. The issue is `claude -p` only accepts a single text prompt. We can't change that. But we CAN preserve structure by building a better prompt that includes role markers and content blocks.
**Approach**: Improve the prompt building in the bridge to include conversation context with role markers.

## 4. Retry with Exponential Backoff
**Current**: No retry logic. Single fetch call in claude.ts.
**Fix**: Wrap the fetch in a retry loop with exponential backoff for 429/5xx errors.
**Approach**: Add `fetchWithRetry()` wrapper in claude.ts.

## 5. Debounce localStorage Writes
**Current**: `storage.saveConversations()` is called on every state change via useEffect in ChatContext.
**Fix**: Debounce the save to avoid blocking the main thread during streaming.
**Approach**: Add debounce to the useEffect in ChatContext that saves conversations.

## 6. Lock Down the Bridge
**Current**: CORS allows all origins (`*`). No auth. No command allowlist for /v1/validate.
**Fix**:
  - Generate a random auth token on startup, display it in the banner
  - Restrict CORS to localhost and ikosoymeta.github.io
  - Add command allowlist for /v1/validate
**Approach**: Update bridge setCorsHeaders, add auth middleware, add command validation.
