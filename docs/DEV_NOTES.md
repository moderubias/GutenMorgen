# GutenMorgen v0.4 — DEV NOTES

## Архитектура

### Workspace UI
- 2px semantic accent rail
- fixed 16×16 custom icon slot
- plain metadata instead of bordered badge
- no decorative glow/gradient
- local labels

### Project collapse
Default-collapse intentionally works only when ChatGPT exposes a native `aria-expanded` control. If Debug shows `collapse toggles = 0`, GutenMorgen does nothing rather than hide arbitrary sibling DOM.

### Context Profiles
Context Profiles are not native Project Instructions. They are local instruction blocks injected into a user message, either manually or on the first send in Bootstrap mode. Their priority is therefore user-message context, not system/project context.

Composer adapter currently tries:
- `#prompt-textarea`
- Lexical contenteditable
- generic main contenteditable
- textarea fallback

### Safe Performance Engine
v0.4 only contains reversible optimizations:
- dirty-flag MutationObserver
- debounce
- requestIdleCallback
- scroll-aware deferral
- `content-visibility: auto`
- `contain-intrinsic-size`
- streaming animation/transition throttle

It does not prune React-owned message nodes, replace the transcript, intercept network payloads, or patch CodeMirror internals.

## Next v0.5 candidates
- Command Palette
- chat/project quick actions
- local workspace groups
- message index + bookmarks
- compact-history experiment behind an explicit opt-in
