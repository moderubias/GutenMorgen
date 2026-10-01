// ==UserScript==
// @name         GutenMorgen — ChatGPT Personal Workspace Framework
// @namespace    https://github.com/moderubias
// @version      0.2.0
// @description  Local UX layer for ChatGPT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
==========================================================
GutenMorgen

Local UI enhancement framework for ChatGPT.

Principles:
- Never modify server data.
- Only modify browser DOM/CSS.
- Keep features modular.
- Prefer resilient DOM detection.

Roadmap:
[x] Project themes
[x] Persistent config
[x] Debug mode
[ ] Settings UI
[ ] Custom icons
[ ] Import/export
[ ] Workspace groups
[ ] Command palette
==========================================================
*/

(() => {
"use strict";

const STORAGE_KEY = "gutenmorgen.config.v1";

const DEFAULT_CONFIG = {
    debug: true,

    projects: {
        "Kernix | Rust": {
            color: "#D34516",
            badge: "LIN ALG",
            icon: "⊕",
            glow: true,
            gradient: true
        }
    }
};

function loadConfig() {
    try {
        return {
            ...DEFAULT_CONFIG,
            ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
        };
    } catch {
        return DEFAULT_CONFIG;
    }
}

const CONFIG = loadConfig();

function log(...args) {
    if (CONFIG.debug) {
        console.log("[GutenMorgen]", ...args);
    }
}

function injectStyle() {
    if (document.getElementById("gutenmorgen-style")) return;

    const style = document.createElement("style");
    style.id = "gutenmorgen-style";
    style.textContent = `
    .gm-project {
        transition: all .15s ease !important;
    }

    .gm-project:hover {
        transform: translateX(2px);
    }

    .gm-badge {
        margin-left:auto;
        margin-right:8px;
        font-family:"JetBrains Mono", monospace;
        font-size:8px;
        font-weight:700;
    }

    .gm-icon {
        margin-right:5px;
    }
    `;

    document.head.appendChild(style);
}

function findProject(name) {
    for (const node of document.querySelectorAll("*")) {
        if (
            node.children.length === 0 &&
            node.textContent?.trim() === name
        ) {
            return node.closest("div.group") || node.parentElement;
        }
    }
    return null;
}

function applyProjectTheme(name, theme) {
    const row = findProject(name);
    if (!row) return;

    row.classList.add("gm-project");

    row.style.borderLeft = `3px solid ${theme.color}`;
    row.style.borderRadius = "10px";

    if (theme.gradient) {
        row.style.background =
            `linear-gradient(90deg, ${theme.color}33, transparent)`;
    }

    if (theme.glow) {
        row.style.boxShadow =
            `0 0 14px ${theme.color}33`;
    }

    if (!row.querySelector(".gm-badge")) {
        const badge = document.createElement("span");
        badge.className = "gm-badge";
        badge.style.color = theme.color;
        badge.textContent = theme.badge;
        row.appendChild(badge);
    }
}

function scan() {
    for (const [name, theme] of Object.entries(CONFIG.projects)) {
        applyProjectTheme(name, theme);
    }
}

injectStyle();
scan();

new MutationObserver(scan)
    .observe(document.body, {
        childList:true,
        subtree:true
    });

log("loaded");
})();
