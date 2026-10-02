// ==UserScript==
// @name         GutenMorgen — ChatGPT Workspace Enhancer++
// @namespace    https://github.com/moderubias
// @version      0.3.0
// @description  Local UX/UI workspace layer for ChatGPT
// @match        https://chatgpt.com/*
// @match        https://www.chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://www.chat.openai.com/*
// @run-at       document-idle
// @noframes
// @inject-into  content
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

/*
GutenMorgen v0.3.0

Local-only UX/UI layer for ChatGPT.

Rules for future iterations:
- no undocumented OpenAI backend APIs;
- never read auth/session tokens;
- DOM/CSS only for presentation features;
- keep the Violentmonkey build as one pasteable file;
- treat ChatGPT as an SPA;
- use data-gm-* markers for owned nodes;
- keep the storage schema versioned;
- degrade safely when ChatGPT changes its DOM.

Current:
- per-project themes;
- local project aliases;
- badges;
- text/custom image icons;
- Projects/Pinned local labels;
- optional Pinned highlighting;
- settings panel;
- JSON import/export;
- debug status.
*/

(() => {
    "use strict";

    const CONFIG_VERSION = 3;
    const STORAGE_KEY = "gutenmorgen.config";

    const DEFAULT_CONFIG = {
        version: CONFIG_VERSION,
        enabled: true,
        debug: false,
        labels: {
            projects: "Projects",
            pinned: "Pinned"
        },
        pinned: {
            enabled: true,
            accent: "#8B5CF6",
            underline: true
        },
        behavior: {
            animations: true
        },
        projects: {
            "Kernix | Rust": {
                enabled: true,
                alias: "",
                color: "#D34516",
                badge: "LIN ALG",
                gradient: true,
                glow: true,
                icon: {
                    type: "text",
                    value: "⊕",
                    replaceNative: false
                }
            }
        }
    };

    const clone = x => JSON.parse(JSON.stringify(x));

    function isObject(x) {
        return x && typeof x === "object" && !Array.isArray(x);
    }

    function merge(base, incoming) {
        const out = clone(base);

        if (!isObject(incoming)) return out;

        for (const [k, v] of Object.entries(incoming)) {
            out[k] = isObject(v) && isObject(out[k])
                ? merge(out[k], v)
                : v;
        }

        return out;
    }

    function normalize(value) {
        return String(value ?? "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function rgba(hex, alpha) {
        if (!/^#[0-9a-f]{6}$/i.test(hex || "")) {
            return `rgba(139,92,246,${alpha})`;
        }

        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        return `rgba(${r},${g},${b},${alpha})`;
    }

    function loadConfig() {
        try {
            return merge(
                DEFAULT_CONFIG,
                GM_getValue(STORAGE_KEY, {})
            );
        } catch (error) {
            console.error("[GutenMorgen] config load failed", error);
            return clone(DEFAULT_CONFIG);
        }
    }

    let config = loadConfig();

    function saveConfig(next) {
        config = merge(DEFAULT_CONFIG, next);
        config.version = CONFIG_VERSION;
        GM_setValue(STORAGE_KEY, config);
        refreshUI();
        scheduleScan("config-save");
    }

    function log(...args) {
        if (config.debug) {
            console.info("[GutenMorgen]", ...args);
        }
    }

    GM_addStyle(`
        .gm-project-row {
            position: relative !important;
            border-radius: 10px !important;
            border-left: 3px solid var(--gm-color,#8B5CF6) !important;
            transition:
                background 150ms ease,
                box-shadow 150ms ease,
                transform 150ms ease !important;
        }

        html[data-gm-animations="off"] .gm-project-row,
        html[data-gm-animations="off"] .gm-pinned-row {
            transition: none !important;
        }

        .gm-project-row:not(.gm-no-gradient) {
            background:
                linear-gradient(
                    90deg,
                    var(--gm-soft,rgba(139,92,246,.18)),
                    var(--gm-faint,rgba(139,92,246,.06)),
                    transparent
                ) !important;
        }

        .gm-project-row.gm-glow {
            box-shadow:
                inset 0 0 0 1px var(--gm-border,rgba(139,92,246,.25)),
                0 2px 12px var(--gm-glow,rgba(139,92,246,.12)) !important;
        }

        .gm-project-row:hover {
            transform: translateX(2px);
        }

        .gm-badge {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            z-index: 3;
            padding: 1px 5px;
            border-radius: 5px;
            border: 1px solid var(--gm-border,rgba(139,92,246,.3));
            background: var(--gm-faint,rgba(139,92,246,.08));
            color: var(--gm-color,#8B5CF6);
            font: 700 8px/13px "JetBrains Mono","Cascadia Code",monospace;
            letter-spacing: .04em;
            pointer-events: none;
            white-space: nowrap;
        }

        .gm-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            min-width: 18px;
            margin-inline-end: 5px;
            color: var(--gm-color,#8B5CF6);
            font: 750 14px/1 "JetBrains Mono","Cascadia Code",monospace;
            pointer-events: none;
        }

        .gm-icon img {
            width: 18px;
            height: 18px;
            object-fit: cover;
            border-radius: 4px;
        }

        .gm-native-icon-hidden {
            display: none !important;
        }

        .gm-pinned-row {
            position: relative !important;
        }

        .gm-pinned-row::before {
            content: "";
            position: absolute;
            left: 0;
            top: 25%;
            bottom: 25%;
            width: 2px;
            border-radius: 2px;
            background: var(--gm-pinned-accent,#8B5CF6);
            opacity: .65;
            pointer-events: none;
        }

        .gm-pinned-row.gm-pinned-underline {
            box-shadow:
                inset 0 -1px 0 var(--gm-pinned-line,rgba(139,92,246,.5)) !important;
        }

        @media (prefers-reduced-motion: reduce) {
            .gm-project-row,
            .gm-pinned-row {
                transition: none !important;
                transform: none !important;
            }
        }
    `);

    function exactLeaf(text) {
        const wanted = normalize(text);

        for (const node of document.querySelectorAll("span,div,p,h1,h2,h3,h4")) {
            if (
                node.children.length === 0 &&
                normalize(node.textContent) === wanted
            ) {
                return node;
            }
        }

        return null;
    }

    function rowFromNode(node) {
        return (
            node?.closest("div.group.relative.cursor-interaction") ||
            node?.closest("div.group") ||
            node?.closest('[role="button"]') ||
            node?.closest("a") ||
            node?.parentElement ||
            null
        );
    }

    function findProject(key, project) {
        const existing = [...document.querySelectorAll("[data-gm-project-key]")]
            .find(row => row.dataset.gmProjectKey === key);

        if (existing) {
            const text =
                existing.querySelector('[data-gm-project-text="true"]') ||
                exactLeaf(project.alias || key);

            return { row: existing, text };
        }

        const text =
            exactLeaf(key) ||
            (project.alias ? exactLeaf(project.alias) : null);

        if (!text) return null;

        return {
            row: rowFromNode(text),
            text
        };
    }

    function cleanGenerated(row) {
        row.querySelectorAll('[data-gm-generated="true"]')
            .forEach(node => node.remove());

        row.querySelectorAll(".gm-native-icon-hidden")
            .forEach(node => node.classList.remove("gm-native-icon-hidden"));
    }

    function applyProject(key, project) {
        if (!project.enabled) return false;

        const found = findProject(key, project);
        if (!found?.row) return false;

        const { row } = found;
        let { text } = found;

        row.dataset.gmProjectKey = key;
        row.classList.add("gm-project-row");
        row.classList.toggle("gm-glow", !!project.glow);
        row.classList.toggle("gm-no-gradient", !project.gradient);

        const color = project.color || "#8B5CF6";

        row.style.setProperty("--gm-color", color);
        row.style.setProperty("--gm-soft", rgba(color, .19));
        row.style.setProperty("--gm-faint", rgba(color, .07));
        row.style.setProperty("--gm-border", rgba(color, .30));
        row.style.setProperty("--gm-glow", rgba(color, .14));

        if (!text) {
            text =
                row.querySelector('[data-gm-project-text="true"]') ||
                exactLeaf(key) ||
                (project.alias ? exactLeaf(project.alias) : null);
        }

        if (text) {
            text.dataset.gmProjectText = "true";
            text.dataset.gmOriginalName = key;
            text.textContent = project.alias || key;
        }

        cleanGenerated(row);

        if (project.badge) {
            const badge = document.createElement("span");
            badge.className = "gm-badge";
            badge.dataset.gmGenerated = "true";
            badge.setAttribute("aria-hidden", "true");
            badge.textContent = project.badge;
            row.appendChild(badge);
        }

        const icon = project.icon || {};

        if (text && icon.type !== "none" && icon.value) {
            const custom = document.createElement("span");
            custom.className = "gm-icon";
            custom.dataset.gmGenerated = "true";
            custom.setAttribute("aria-hidden", "true");

            if (icon.type === "image") {
                const img = document.createElement("img");
                img.src = icon.value;
                img.alt = "";
                custom.appendChild(img);
            } else {
                custom.textContent = icon.value;
            }

            const parent = text.parentElement || row;
            parent.insertBefore(custom, text);

            if (icon.replaceNative) {
                const svg = row.querySelector("svg");

                if (svg) {
                    svg.classList.add("gm-native-icon-hidden");
                }
            }
        }

        return true;
    }

    function findHeading(original, current) {
        for (const name of [original, current].filter(Boolean)) {
            const node = exactLeaf(name);
            if (node) return node;
        }

        for (const node of document.querySelectorAll("[data-gm-section-original]")) {
            if (node.dataset.gmSectionOriginal === original) {
                return node;
            }
        }

        return null;
    }

    function setSectionLabel(original, replacement) {
        const node = findHeading(original, replacement);

        if (!node) return null;

        node.dataset.gmSectionOriginal = original;
        node.textContent = replacement || original;

        return node;
    }

    function clearPinned() {
        document.querySelectorAll(".gm-pinned-row").forEach(row => {
            row.classList.remove("gm-pinned-row", "gm-pinned-underline");
            row.style.removeProperty("--gm-pinned-accent");
            row.style.removeProperty("--gm-pinned-line");
        });
    }

    function pinnedContainer(heading) {
        let current = heading?.parentElement || null;

        for (let depth = 0; current && depth < 7; depth++, current = current.parentElement) {
            const rows = current.querySelectorAll(
                "div.group.relative.cursor-interaction"
            );

            if (rows.length >= 1 && rows.length <= 30) {
                return current;
            }
        }

        return null;
    }

    function applyPinned(heading) {
        clearPinned();

        if (!config.pinned.enabled || !heading) return 0;

        const container = pinnedContainer(heading);
        if (!container) return 0;

        const rows = [
            ...container.querySelectorAll(
                "div.group.relative.cursor-interaction"
            )
        ];

        for (const row of rows) {
            row.classList.add("gm-pinned-row");
            row.classList.toggle(
                "gm-pinned-underline",
                !!config.pinned.underline
            );
            row.style.setProperty(
                "--gm-pinned-accent",
                config.pinned.accent
            );
            row.style.setProperty(
                "--gm-pinned-line",
                rgba(config.pinned.accent, .52)
            );
        }

        return rows.length;
    }

    let stats = {
        matched: 0,
        pinned: 0,
        projectsHeading: false,
        pinnedHeading: false,
        reason: "not-run",
        time: "—"
    };

    function scan(reason = "scan") {
        document.documentElement.dataset.gmAnimations =
            config.behavior.animations ? "on" : "off";

        if (!config.enabled) {
            updateDebug();
            return;
        }

        const projectsHeading = setSectionLabel(
            "Projects",
            config.labels.projects
        );

        const pinnedHeading = setSectionLabel(
            "Pinned",
            config.labels.pinned
        );

        let matched = 0;

        for (const [key, project] of Object.entries(config.projects)) {
            if (applyProject(key, project)) matched++;
        }

        const pinned = applyPinned(pinnedHeading);

        stats = {
            matched,
            pinned,
            projectsHeading: !!projectsHeading,
            pinnedHeading: !!pinnedHeading,
            reason,
            time: new Date().toLocaleTimeString()
        };

        log("scan", stats);
        updateDebug();
    }

    let scheduled = false;

    function scheduleScan(reason = "mutation") {
        if (scheduled) return;

        scheduled = true;

        requestAnimationFrame(() => {
            scheduled = false;
            scan(reason);
        });
    }

    // -------------------------------------------------------------------------
    // Settings UI
    // -------------------------------------------------------------------------

    let ui = null;
    let selectedProject = Object.keys(config.projects)[0] || "";

    function ensureUI() {
        if (ui) return;

        const host = document.createElement("div");
        host.id = "gutenmorgen-ui";
        document.documentElement.appendChild(host);

        const shadow = host.attachShadow({ mode: "open" });

        shadow.innerHTML = `
<style>
:host{all:initial;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
*{box-sizing:border-box}
#launcher{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:40px;height:40px;border:1px solid #ffffff24;border-radius:12px;background:#18181be8;color:#fff;box-shadow:0 8px 28px #0005;cursor:pointer;font-weight:800;opacity:.72}
#launcher:hover{opacity:1}
#backdrop{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;padding:24px;background:#0008;backdrop-filter:blur(5px)}
#backdrop.open{display:flex}
#panel{width:min(760px,calc(100vw - 32px));max-height:min(760px,calc(100vh - 42px));overflow:auto;border:1px solid #ffffff1f;border-radius:18px;background:#171717;color:#f5f5f5;box-shadow:0 28px 80px #0007}
header,footer{position:sticky;z-index:5;display:flex;align-items:center;gap:8px;padding:14px 16px;background:#171717f2;backdrop-filter:blur(12px)}
header{top:0;justify-content:space-between;border-bottom:1px solid #ffffff14}
footer{bottom:0;justify-content:flex-end;border-top:1px solid #ffffff14}
.body{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:16px}
.card{border:1px solid #ffffff14;border-radius:13px;background:#ffffff08;padding:14px}
.wide{grid-column:1/-1}
h3{margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;opacity:.72}
label{display:grid;gap:5px;margin:9px 0;font-size:11px;color:#ffffffb8}
.check{display:flex;align-items:center;gap:8px}
input[type=text],select{width:100%;border:1px solid #ffffff1a;border-radius:8px;background:#0f0f10;color:#fff;padding:8px 9px;outline:0}
input[type=color]{width:100%;height:36px;border:0;border-radius:8px;padding:0;background:transparent}
.row{display:flex;gap:8px;align-items:center}.row>*{flex:1}
button{border:1px solid #ffffff1a;border-radius:8px;padding:8px 10px;background:#ffffff0f;color:#fff;cursor:pointer;font:650 11px/1.2 inherit}
button:hover{background:#ffffff1a}.primary{background:#8b5cf6!important}.danger{color:#fca5a5}
.hint{margin-top:6px;font-size:10px;line-height:1.45;opacity:.52}
#debug{font:10px/1.55 "JetBrains Mono","Cascadia Code",monospace;white-space:pre-wrap;opacity:.7}
#preview{width:36px;height:36px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #ffffff1a;border-radius:8px;background:#0f0f10;font-weight:800}
#preview img{width:100%;height:100%;object-fit:cover}
@media(max-width:680px){.body{grid-template-columns:1fr}.wide{grid-column:auto}}
</style>

<button id="launcher" title="GutenMorgen settings">GM</button>

<div id="backdrop">
<section id="panel">
<header>
    <strong>GutenMorgen <span style="opacity:.45">v0.3.0</span></strong>
    <button id="close">Close</button>
</header>

<div class="body">

<div class="card">
<h3>General</h3>
<label class="check"><input id="enabled" type="checkbox">Enable GutenMorgen</label>
<label class="check"><input id="animations" type="checkbox">Animations</label>
<label class="check"><input id="debug-toggle" type="checkbox">Debug logging</label>
<label>Projects label<input id="projects-label" type="text"></label>
<label>Pinned label<input id="pinned-label" type="text"></label>
</div>

<div class="card">
<h3>Pinned</h3>
<label class="check"><input id="pinned-enabled" type="checkbox">Style detected Pinned section</label>
<label class="check"><input id="pinned-underline" type="checkbox">Underline Pinned rows</label>
<label>Pinned accent<input id="pinned-accent" type="color"></label>
<div class="hint">If ChatGPT changes its sidebar markup and detection becomes inaccurate, disable this feature until the detector is updated.</div>
</div>

<div class="card wide">
<h3>Project Theme</h3>

<div class="row">
<label>Project<select id="project-select"></select></label>
<div style="flex:0 0 auto;align-self:end;display:flex;gap:6px;padding-bottom:9px">
<button id="add-project">Add</button>
<button id="delete-project" class="danger">Delete</button>
</div>
</div>

<div class="row">
<label>Local alias<input id="alias" type="text" placeholder="Leave empty to keep real name"></label>
<label>Accent<input id="color" type="color"></label>
</div>

<div class="row">
<label>Badge<input id="badge" type="text" placeholder="LIN ALG"></label>
<label>Text icon<input id="icon-text" type="text" maxlength="8" placeholder="⊕"></label>
</div>

<div class="row">
<label class="check"><input id="project-enabled" type="checkbox">Enabled</label>
<label class="check"><input id="gradient" type="checkbox">Gradient</label>
<label class="check"><input id="glow" type="checkbox">Glow</label>
<label class="check"><input id="replace-native" type="checkbox">Replace native icon</label>
</div>

<div class="row">
<label>PNG/JPG/SVG/WebP icon<input id="icon-file" type="file" accept=".png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/svg+xml,image/webp"></label>
<div style="flex:0 0 42px;align-self:end;padding-bottom:9px"><div id="preview"></div></div>
<div style="flex:0 0 auto;align-self:end;padding-bottom:9px"><button id="text-icon">Use text icon</button></div>
</div>

<div class="hint">Alias/icon changes are local only; OpenAI project data is untouched.</div>
</div>

<div class="card">
<h3>Backup</h3>
<div class="row">
<button id="export">Export JSON</button>
<button id="import">Import JSON</button>
</div>
<input id="import-file" type="file" accept=".json,application/json" hidden>
</div>

<div class="card">
<h3>Debug</h3>
<div id="debug">Waiting for scan…</div>
</div>

</div>

<footer>
<button id="reset" class="danger">Reset</button>
<button id="save" class="primary">Save & Apply</button>
</footer>
</section>
</div>
`;

        ui = { host, shadow };

        const $ = id => shadow.getElementById(id);

        $("launcher").addEventListener("click", openSettings);
        $("close").addEventListener("click", closeSettings);

        $("backdrop").addEventListener("click", event => {
            if (event.target === $("backdrop")) closeSettings();
        });

        $("project-select").addEventListener("change", event => {
            selectedProject = event.target.value;
            refreshProjectEditor();
        });

        $("add-project").addEventListener("click", () => {
            const name = prompt("Exact ChatGPT Project name:");
            if (!name?.trim()) return;

            const key = name.trim();
            const next = clone(config);

            if (!next.projects[key]) {
                next.projects[key] = {
                    enabled: true,
                    alias: "",
                    color: "#8B5CF6",
                    badge: "",
                    gradient: true,
                    glow: false,
                    icon: {
                        type: "none",
                        value: "",
                        replaceNative: false
                    }
                };
            }

            selectedProject = key;
            saveConfig(next);
        });

        $("delete-project").addEventListener("click", () => {
            if (!selectedProject) return;

            if (!confirm(`Delete local GutenMorgen profile for "${selectedProject}"?`)) {
                return;
            }

            const next = clone(config);
            delete next.projects[selectedProject];
            selectedProject = Object.keys(next.projects)[0] || "";
            saveConfig(next);
        });

        $("icon-file").addEventListener("change", async event => {
            const file = event.target.files?.[0];
            if (!file || !selectedProject) return;

            if (!["image/png","image/jpeg","image/svg+xml","image/webp"].includes(file.type)) {
                alert("Use PNG, JPG/JPEG, SVG, or WebP.");
                event.target.value = "";
                return;
            }

            if (file.size > 512 * 1024) {
                alert("Keep icons under 512 KiB.");
                event.target.value = "";
                return;
            }

            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const next = readUI();

            next.projects[selectedProject].icon = {
                type: "image",
                value: dataUrl,
                replaceNative: $("replace-native").checked
            };

            saveConfig(next);
            event.target.value = "";
        });

        $("text-icon").addEventListener("click", () => {
            if (!selectedProject) return;

            const next = readUI();
            const value = $("icon-text").value.trim();

            next.projects[selectedProject].icon = {
                type: value ? "text" : "none",
                value,
                replaceNative: $("replace-native").checked
            };

            saveConfig(next);
        });

        $("save").addEventListener("click", () => {
            saveConfig(readUI());
            closeSettings();
        });

        $("reset").addEventListener("click", () => {
            if (!confirm("Reset all GutenMorgen settings?")) return;
            selectedProject = "Kernix | Rust";
            saveConfig(clone(DEFAULT_CONFIG));
        });

        $("export").addEventListener("click", () => {
            const blob = new Blob(
                [JSON.stringify(config, null, 2)],
                { type: "application/json" }
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "gutenmorgen-settings.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });

        $("import").addEventListener("click", () => $("import-file").click());

        $("import-file").addEventListener("change", async event => {
            const file = event.target.files?.[0];
            if (!file) return;

            try {
                saveConfig(JSON.parse(await file.text()));
            } catch (error) {
                alert(`Invalid JSON: ${error.message}`);
            }

            event.target.value = "";
        });

        refreshUI();
    }

    function openSettings() {
        ensureUI();
        refreshUI();
        ui.shadow.getElementById("backdrop").classList.add("open");
    }

    function closeSettings() {
        ui?.shadow.getElementById("backdrop").classList.remove("open");
    }

    function refreshProjectEditor() {
        if (!ui) return;

        const $ = id => ui.shadow.getElementById(id);
        const keys = Object.keys(config.projects);

        if (!keys.includes(selectedProject)) {
            selectedProject = keys[0] || "";
        }

        $("project-select").innerHTML = "";

        for (const key of keys) {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = key;
            option.selected = key === selectedProject;
            $("project-select").appendChild(option);
        }

        const p = config.projects[selectedProject];
        if (!p) return;

        $("project-enabled").checked = !!p.enabled;
        $("alias").value = p.alias || "";
        $("color").value = p.color || "#8B5CF6";
        $("badge").value = p.badge || "";
        $("gradient").checked = !!p.gradient;
        $("glow").checked = !!p.glow;
        $("replace-native").checked = !!p.icon?.replaceNative;
        $("icon-text").value =
            p.icon?.type === "text" ? (p.icon.value || "") : "";

        const preview = $("preview");
        preview.innerHTML = "";

        if (p.icon?.type === "image" && p.icon.value) {
            const img = document.createElement("img");
            img.src = p.icon.value;
            preview.appendChild(img);
        } else {
            preview.textContent =
                p.icon?.type === "text" ? (p.icon.value || "—") : "—";
        }
    }

    function refreshUI() {
        if (!ui) return;

        const $ = id => ui.shadow.getElementById(id);

        $("enabled").checked = !!config.enabled;
        $("animations").checked = !!config.behavior.animations;
        $("debug-toggle").checked = !!config.debug;
        $("projects-label").value = config.labels.projects;
        $("pinned-label").value = config.labels.pinned;
        $("pinned-enabled").checked = !!config.pinned.enabled;
        $("pinned-underline").checked = !!config.pinned.underline;
        $("pinned-accent").value = config.pinned.accent;

        refreshProjectEditor();
        updateDebug();
    }

    function readUI() {
        const $ = id => ui.shadow.getElementById(id);
        const next = clone(config);

        next.enabled = $("enabled").checked;
        next.behavior.animations = $("animations").checked;
        next.debug = $("debug-toggle").checked;
        next.labels.projects = $("projects-label").value.trim() || "Projects";
        next.labels.pinned = $("pinned-label").value.trim() || "Pinned";
        next.pinned.enabled = $("pinned-enabled").checked;
        next.pinned.underline = $("pinned-underline").checked;
        next.pinned.accent = $("pinned-accent").value;

        if (selectedProject && next.projects[selectedProject]) {
            const p = next.projects[selectedProject];

            p.enabled = $("project-enabled").checked;
            p.alias = $("alias").value.trim();
            p.color = $("color").value;
            p.badge = $("badge").value.trim();
            p.gradient = $("gradient").checked;
            p.glow = $("glow").checked;

            p.icon = p.icon || {
                type: "none",
                value: "",
                replaceNative: false
            };

            p.icon.replaceNative = $("replace-native").checked;

            if (p.icon.type !== "image") {
                const value = $("icon-text").value.trim();
                p.icon.type = value ? "text" : "none";
                p.icon.value = value;
            }
        }

        return next;
    }

    function updateDebug() {
        if (!ui) return;

        ui.shadow.getElementById("debug").textContent = [
            `matched projects : ${stats.matched}`,
            `pinned rows      : ${stats.pinned}`,
            `Projects heading : ${stats.projectsHeading ? "yes" : "no"}`,
            `Pinned heading   : ${stats.pinnedHeading ? "yes" : "no"}`,
            `last reason      : ${stats.reason}`,
            `last run         : ${stats.time}`
        ].join("\n");
    }

    document.addEventListener("keydown", event => {
        if (
            event.ctrlKey &&
            event.altKey &&
            !event.shiftKey &&
            event.key.toLowerCase() === "g"
        ) {
            event.preventDefault();
            openSettings();
        }

        if (
            event.key === "Escape" &&
            ui?.shadow.getElementById("backdrop").classList.contains("open")
        ) {
            closeSettings();
        }
    }, true);

    GM_registerMenuCommand(
        "Open GutenMorgen settings",
        openSettings
    );

    ensureUI();

    new MutationObserver(() => scheduleScan("dom-mutation"))
        .observe(document.documentElement, {
            childList: true,
            subtree: true
        });

    window.addEventListener(
        "popstate",
        () => scheduleScan("popstate")
    );

    window.addEventListener(
        "hashchange",
        () => scheduleScan("hashchange")
    );

    scan("initial");
    setTimeout(() => scan("500ms"), 500);
    setTimeout(() => scan("1500ms"), 1500);

    console.info(
        "%c[GutenMorgen] v0.3.0 loaded",
        "color:#D34516;font-weight:800"
    );
})();
