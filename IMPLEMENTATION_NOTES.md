# Implementation Notes

## Scroll Bug Analysis
- `.messagesArea` (line 37-43) has `overflow-y: auto` which should allow scrolling
- The issue is likely `contain: layout style` on `.simpleView` or `.messagesArea` 
- Or the auto-scroll to bottom `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })` 
  is preventing manual scroll-up by always snapping back
- Need to check SimpleView.tsx for the scrollIntoView behavior and make it only auto-scroll
  when the user is already near the bottom

## Validation Loop Plan
- Add a new endpoint to the bridge: POST /v1/validate
- Bridge runs lint/typecheck commands and returns results
- In EngineerView, after Claude responds with code, offer a "Validate" button
- If validation fails, automatically feed errors back to Claude
- Show a visual pipeline: Generate → Validate → Fix → Done

## Files to modify:
1. SimpleView.module.css - possibly remove `contain: layout style` 
2. SimpleView.tsx - fix auto-scroll behavior
3. bridge/arcadia-bridge.js - add /v1/validate endpoint
4. EngineerView.tsx - add validation loop UI
5. HelpPanel.tsx - update user manual
