# Claude Code at Meta - Auth Findings

## Key Facts
- Claude Code version: 2.1.45 (Claude Code at Meta)
- Binary: /usr/local/bin/claude
- No API key stored anywhere (no keychain, no env vars, no credentials file)
- No LDAR proxy running on localhost:8087
- Auth is handled internally by the `meta@Meta` plugin
- The `.reporting_chain_cache` contains Meta employee IDs (reporting chain)
- Claude Code uses Meta's internal certificate/SSO system for auth
- No way to extract the auth token from outside Claude Code

## Approach: Use Claude Code CLI as a backend proxy
Since we can't extract the auth mechanism, we'll use Claude Code itself as the backend:
- Run `claude` CLI in API/pipe mode to forward requests
- Claude Code has a `--print` flag and can accept stdin
- We can create a tiny HTTP server that pipes requests to `claude` CLI
