# Arcadia Fixes - Session

## Bridge: Google Drive endpoints
- [ ] Add /v1/gdrive/list endpoint (list files in Google Drive workspace)
- [ ] Add /v1/gdrive/read endpoint (read file contents)
- [ ] Add /v1/gdrive/create endpoint (create new docs)
- [ ] Add /v1/gdrive/status endpoint (check if Google Drive is mounted)
- [ ] Bump bridge VERSION

## IntegrationsPanel: Bridge-based Google Drive
- [ ] Remove OAuth flow from Google Drive integration
- [ ] Replace with bridge-based connection (auto-detect via bridge)
- [ ] Add "Connect via Bridge" button that tests bridge /v1/gdrive/status
- [ ] Update requirements checklist
- [ ] Show connected status when bridge has Google Drive access

## Windows PowerShell fixes
- [ ] Fix SecondBrainPanel local connection command (line 460: && → OS-aware)
- [ ] Fix IntegrationsPanel bridge warning command (line 780: && → OS-aware)
- [ ] Fix SettingsPanel Windows run command ($HOME → $env:USERPROFILE)
- [ ] Fix USER_MANUAL alternative command for Windows
- [ ] Add Sandboxie warning in Windows instructions

## Bridge version check
- [ ] Add /v1/version endpoint to bridge with feature flags
- [ ] Add version check in SecondBrainPanel setup wizard
- [ ] Show "Bridge outdated" message instead of raw 404 errors

## Deploy
- [ ] Sync changes to Manus webdev project
- [ ] Push to GitHub
- [ ] Save checkpoint
