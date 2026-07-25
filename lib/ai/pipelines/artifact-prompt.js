// Pure prompt builder for interactive artifacts (Plan P7.3).
// Alias-free so it is unit-testable under `node --test`.
//
// The generated HTML is rendered in a SANDBOXED iframe with no same-origin
// access (ArtifactFrame.jsx), but we still instruct the model toward a
// self-contained, network-free widget to keep it safe and offline-friendly.

export function buildArtifactPrompt({ topicTitle, difficulty = 3 }) {
  return `Create a small INTERACTIVE learning widget for the topic "${topicTitle}" (difficulty ${difficulty}/5).

    Return:
    - title: a short name for the widget.
    - description: 1 sentence on what the learner does with it.
    - html: a COMPLETE, self-contained HTML document.

    HARD REQUIREMENTS for the html:
    - A single document with inline <style> and <script> ONLY. Vanilla JavaScript, no libraries.
    - NO external resources whatsoever: no CDN scripts/styles, no web fonts, no images by URL, no fetch/XHR/WebSocket, no network of any kind.
    - It must be INTERACTIVE: let the learner change a parameter (slider/input/button) and see the concept update live — a small simulation, visualization, or interactive demo of "${topicTitle}".
    - Do NOT use cookies, localStorage, or top-level navigation.
    - Lightweight and mobile-friendly (responsive, works at 320px wide).
    - Inline any small SVG/canvas drawing you need; do not reference external assets.`
}
