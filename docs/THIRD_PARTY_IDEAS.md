# Third-party implementation ideas reviewed

All projects below were reviewed as implementation references. GutenMorgen v0.4 does not copy them wholesale. If direct source code is copied in later versions, preserve the applicable MIT copyright/license notices.

## ChatGPT TurboRender — MIT
https://github.com/mo2g/ChatGPT-TurboRender

Relevant ideas: fail-safe host adapters, local state, sliding-window architecture, archive fallback, IndexedDB cache, separation of runtime/UI layers.

## LongChat Perf — MIT
https://github.com/HanzheLee/longchat-perf

Relevant ideas: content-visibility, contain-intrinsic-size, streaming animation throttle, conservative folding, fail-safe fingerprints, CodeMirror batch mounting.

v0.4 adopts only the safe rendering/scheduling concepts, not the CodeMirror monkey patch.

## ChatGPT Conversation Pruner — MIT
https://github.com/slhaf/ChatGPT-Conversation-Pruner

Relevant ideas: stable-state detection, live/history state machine, scroll-root detection, IntersectionObserver restoration, DOM rebuild protection.

## ChatGPT Browser Memory Reducer — MIT
https://github.com/allenyllee/ChatGPT-Browser-Memory-Reducer

Relevant ideas: IndexedDB snapshots, compact previews, message numbering, bookmarks, jump navigation.

## ChatGPT Long Chat Booster — MIT
https://github.com/mrkwxopya/ChatGPT-Long-Chat-Booster

Relevant ideas: debounced MutationObserver handling, requestIdleCallback, pause while scrolling, streaming-aware scheduling, reversible rendering optimizations.
