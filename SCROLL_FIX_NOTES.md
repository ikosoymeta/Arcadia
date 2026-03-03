# Scroll Bug Analysis

## Layout hierarchy:
1. `.app` - 100vw x 100vh, overflow: hidden
2. `.mainContent` - flex: 1, overflow: hidden, height: 100vh, contain: layout style
3. `.modeHeader` - height: 44px, flex-shrink: 0
4. `.chatLayout` - flex: 1, overflow: hidden, contain: layout style
5. `.simpleView` (used as `styles.container` in JSX) - flex column, height: 100%
6. `.messagesArea` - flex: 1, overflow-y: auto

## Root cause:
The `.simpleView` class uses `height: 100%` but the CSS module doesn't have a `.container` class.
The JSX uses `styles.container` which doesn't exist in the CSS module, so the wrapper div has NO styles.
Without proper height constraints, the messagesArea can't calculate its scroll height correctly.

Actually wait - CSS modules map class names. Let me check if `.simpleView` is exported as `container`.
No - the JSX uses `styles.container` but the CSS only has `.simpleView`.
This means the container div has NO class applied, so it has no height constraint.
Without a height constraint, overflow-y: auto on messagesArea won't work properly.

## Also:
The auto-scroll `scrollIntoView` fires on every `messages` and `streamingText` change,
which snaps to bottom constantly during streaming, preventing manual scroll-up.

## Fix needed:
1. Either rename `.simpleView` to `.container` in CSS, or change JSX to use `styles.simpleView`
2. Make auto-scroll smart: only auto-scroll if user is near bottom
