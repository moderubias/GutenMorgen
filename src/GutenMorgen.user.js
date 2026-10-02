// ==UserScript==
// @name         GutenMorgen — ChatGPT Workspace Enhancer++
// @namespace    https://github.com/moderubias
// @version      0.4.0
// @description  Restrained workspace UI, local context profiles, project collapse, and safe long-chat performance optimizations for ChatGPT.
// @homepageURL  https://github.com/moderubias/GutenMorgen
// @supportURL   https://github.com/moderubias/GutenMorgen/issues
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
GutenMorgen v0.4.0 — Foundation

Layers:
- Workspace UI: restrained semantic accents, fixed icon slots, metadata, local labels.
- Project tree: default-collapse only when ChatGPT exposes a native aria-expanded control.
- Context Profiles: local reusable instructions, manual or bootstrap injection.
- Safe Performance Engine: idle/debounced scans, content-visibility, streaming throttle.

Invariants:
- local browser behavior only;
- no auth/session token access;
- no undocumented OpenAI API calls;
- fail safe when host DOM changes;
- versioned Violentmonkey storage.
*/

(() => {
  "use strict";

  const VERSION = 4;
  const STORAGE = "gutenmorgen.config";
  const SESSION_STORAGE = "gutenmorgen.session";

  const DEFAULTS = {
    version: VERSION,
    enabled: true,
    debug: false,
    ui: { launcher: true },
    labels: { projects: "Projects", pinned: "Pinned" },
    projectTree: { defaultCollapsed: true, rememberState: true, states: {} },
    projects: {
      "Kernix | Rust": {
        enabled: true,
        alias: "",
        color: "#D34516",
        metadata: "RUST · LA",
        icon: { type: "text", value: "⊕", replaceNative: true, fit: "contain" }
      }
    },
    contextProfiles: {
      enabled: true,
      active: "",
      mode: "manual",
      profiles: {
        Design: {
          enabled: true,
          title: "Design",
          instructions: [
            "Design this as a real production interface, not an AI-generated concept.",
            "Prefer restrained, editorial, product-first UI.",
            "Use an 8px spacing system with 4px subdivisions.",
            "Use borders and spacing before shadows.",
            "Avoid excessive cards, pills, gradients, blur, decorative glows, and oversized headings.",
            "Use clear hierarchy, keyboard-visible focus states, and explicit interaction states.",
            "When uncertain, prefer simpler composition and fewer visual elements."
          ].join("\n")
        }
      }
    },
    performance: {
      enabled: true,
      offscreenRendering: true,
      streamingThrottle: true,
      pauseWhileScrolling: true,
      turnIntrinsicSize: 640
    }
  };

  const clone = v => JSON.parse(JSON.stringify(v));
  const plain = v => !!v && typeof v === "object" && !Array.isArray(v);

  function merge(base, incoming) {
    const out = clone(base);
    if (!plain(incoming)) return out;
    for (const [k, v] of Object.entries(incoming)) {
      out[k] = plain(v) && plain(out[k]) ? merge(out[k], v) : v;
    }
    return out;
  }

  function migrate(raw) {
    const next = merge(DEFAULTS, raw || {});
    for (const [name, project] of Object.entries(next.projects || {})) {
      const old = raw?.projects?.[name];
      if (!project.metadata && old?.badge) project.metadata = old.badge;
      if (raw?.version < 4 && old?.icon?.type) project.icon.replaceNative = true;
      delete project.badge;
      delete project.gradient;
      delete project.glow;
    }
    next.version = VERSION;
    return next;
  }

  let config = migrate(GM_getValue(STORAGE, {}));
  let session = GM_getValue(SESSION_STORAGE, { injectedRoutes: {}, lastRoute: "" });

  function save(next) {
    config = migrate(next);
    GM_setValue(STORAGE, config);
    refreshUI();
    scheduleScan("config-save");
  }

  function saveSession() { GM_setValue(SESSION_STORAGE, session); }
  function log(...a) { if (config.debug) console.info("[GutenMorgen]", ...a); }
  const norm = v => String(v ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

  function rgba(hex, a) {
    if (!/^#[0-9a-f]{6}$/i.test(hex || "")) return `rgba(139,92,246,${a})`;
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  GM_addStyle(`
    .gm-project-row{--gm-accent:#8b5cf6;--gm-soft:rgba(139,92,246,.075);position:relative!important;border-radius:7px!important;background:transparent!important;box-shadow:none!important;transition:background-color 120ms ease!important}
    .gm-project-row::before{content:"";position:absolute;left:1px;top:7px;bottom:7px;width:2px;border-radius:2px;background:var(--gm-accent);opacity:.72;pointer-events:none}
    .gm-project-row:hover{background:var(--gm-soft)!important;transform:none!important}
    .gm-project-icon-slot{display:inline-flex;align-items:center;justify-content:center;flex:0 0 16px;width:16px;height:16px;margin-inline-end:6px;color:var(--gm-accent);font:700 13px/1 "JetBrains Mono","Cascadia Code",monospace;pointer-events:none}
    .gm-project-icon-slot img{width:16px;height:16px;object-fit:var(--gm-icon-fit,contain);border-radius:4px}
    .gm-project-meta{margin-left:auto;padding-left:8px;padding-right:8px;color:var(--gm-accent);font:650 8px/1.1 "JetBrains Mono","Cascadia Code",monospace;letter-spacing:.055em;white-space:nowrap;opacity:.72;pointer-events:none}
    .gm-native-icon-hidden{display:none!important}
    .gm-perf-turn{content-visibility:auto;contain-intrinsic-size:auto var(--gm-turn-intrinsic,640px)}
    html[data-gm-streaming="true"] main .gm-perf-turn,html[data-gm-streaming="true"] main .gm-perf-turn *{animation-duration:0s!important;transition-duration:0s!important}
    @media(prefers-reduced-motion:reduce){.gm-project-row{transition:none!important}}
  `);

  function leaf(text, scope=document) {
    const wanted = norm(text); if (!wanted) return null;
    for (const n of scope.querySelectorAll("span,div,p,h1,h2,h3,h4")) {
      if (n.children.length === 0 && norm(n.textContent) === wanted) return n;
    }
    return null;
  }

  function rowOf(node) {
    return node?.closest("div.group.relative.cursor-interaction") || node?.closest("div.group") || node?.closest('[role="button"]') || node?.closest("a") || node?.parentElement || null;
  }

  function clearOwned(row) {
    row.querySelectorAll('[data-gm-generated="true"]').forEach(n => n.remove());
    row.querySelectorAll(".gm-native-icon-hidden").forEach(n => n.classList.remove("gm-native-icon-hidden"));
  }

  function findProject(key, p) {
    const annotated = [...document.querySelectorAll("[data-gm-project-key]")].find(r => r.dataset.gmProjectKey === key);
    if (annotated) return { row: annotated, text: annotated.querySelector('[data-gm-project-text="true"]') || leaf(p.alias || key, annotated) };
    const text = leaf(key) || (p.alias ? leaf(p.alias) : null);
    return text ? { row: rowOf(text), text } : null;
  }

  function renderProject(key, p) {
    if (!p?.enabled) return null;
    const found = findProject(key, p); if (!found?.row) return null;
    const row = found.row;
    const text = found.text || row.querySelector('[data-gm-project-text="true"]') || leaf(key, row) || (p.alias ? leaf(p.alias, row) : null);
    row.dataset.gmProjectKey = key;
    row.classList.add("gm-project-row");
    row.style.setProperty("--gm-accent", p.color || "#8B5CF6");
    row.style.setProperty("--gm-soft", rgba(p.color || "#8B5CF6", .075));
    clearOwned(row);

    if (text) {
      text.dataset.gmProjectText = "true";
      text.dataset.gmOriginalName = key;
      text.textContent = p.alias || key;
    }

    if (text && p.icon?.type !== "none" && p.icon?.value) {
      const slot = document.createElement("span");
      slot.dataset.gmGenerated = "true";
      slot.className = "gm-project-icon-slot";
      slot.setAttribute("aria-hidden", "true");
      slot.style.setProperty("--gm-icon-fit", p.icon.fit === "cover" ? "cover" : "contain");
      if (p.icon.type === "image") {
        const img = document.createElement("img"); img.src = p.icon.value; img.alt = ""; slot.appendChild(img);
      } else slot.textContent = p.icon.value;
      (text.parentElement || row).insertBefore(slot, text);
      if (p.icon.replaceNative) {
        const native = row.querySelector("svg") || row.querySelector("img:not(.gm-project-icon-slot img)");
        native?.classList.add("gm-native-icon-hidden");
      }
    }

    if (p.metadata) {
      const meta = document.createElement("span");
      meta.dataset.gmGenerated = "true";
      meta.className = "gm-project-meta";
      meta.setAttribute("aria-hidden", "true");
      meta.textContent = p.metadata;
      row.appendChild(meta);
    }
    return row;
  }

  function findHeading(original, replacement) {
    for (const x of [original, replacement].filter(Boolean)) { const n = leaf(x); if (n) return n; }
    return [...document.querySelectorAll("[data-gm-section-original]")].find(n => n.dataset.gmSectionOriginal === original) || null;
  }

  function labelSection(original, replacement) {
    const n = findHeading(original, replacement); if (!n) return null;
    n.dataset.gmSectionOriginal = original;
    n.textContent = replacement || original;
    return n;
  }

  function sectionContainer(heading) {
    let cur = heading?.parentElement || null;
    for (let i=0; cur && i<7; i++, cur=cur.parentElement) {
      const count = cur.querySelectorAll('div.group.relative.cursor-interaction,[aria-expanded]').length;
      if (count >= 1 && count <= 80) return cur;
    }
    return null;
  }

  function collapseProjects(projectsHeading) {
    if (!config.projectTree.defaultCollapsed || !projectsHeading) return { detected:0, collapsed:0 };
    const container = sectionContainer(projectsHeading); if (!container) return { detected:0, collapsed:0 };
    const toggles = [...container.querySelectorAll('[aria-expanded]')];
    let detected=0, collapsed=0;
    toggles.forEach((toggle, i) => {
      const row = rowOf(toggle); if (!row || !container.contains(row)) return;
      const name = row.dataset.gmProjectKey || norm([...row.querySelectorAll("span,div")].find(n => n.children.length===0 && norm(n.textContent))?.textContent) || `project-${i}`;
      const desired = config.projectTree.states[name] === undefined ? true : !!config.projectTree.states[name];
      detected++;
      if (desired && toggle.getAttribute("aria-expanded") === "true" && !toggle.dataset.gmCollapseApplied) {
        toggle.dataset.gmCollapseApplied = "true";
        try { toggle.click(); collapsed++; } catch {}
        setTimeout(() => delete toggle.dataset.gmCollapseApplied, 350);
      }
      if (!toggle.dataset.gmCollapseListener) {
        toggle.dataset.gmCollapseListener = "true";
        toggle.addEventListener("click", () => {
          if (!config.projectTree.rememberState) return;
          setTimeout(() => {
            const next = clone(config);
            next.projectTree.states[name] = toggle.getAttribute("aria-expanded") !== "true";
            config = migrate(next); GM_setValue(STORAGE, config);
          }, 80);
        }, true);
      }
    });
    return { detected, collapsed };
  }

  const perf = { scrolling:false, timer:null, turns:0, streaming:false };
  function getTurns() {
    for (const s of ['article[data-testid^="conversation-turn"]','article[data-turn]','main article']) {
      const a = [...document.querySelectorAll(s)]; if (a.length >= 2) return a;
    }
    return [];
  }
  function isStreaming() {
    return !!document.querySelector('button[data-testid="stop-button"],button[aria-label*="Stop" i],[data-testid*="stop" i]');
  }
  function applyPerformance() {
    if (!config.performance.enabled) {
      document.documentElement.removeAttribute("data-gm-streaming");
      document.querySelectorAll(".gm-perf-turn").forEach(n => n.classList.remove("gm-perf-turn"));
      perf.turns=0; perf.streaming=false; return;
    }
    const turns = getTurns();
    if (config.performance.offscreenRendering) turns.forEach(t => {
      t.classList.add("gm-perf-turn");
      t.style.setProperty("--gm-turn-intrinsic", `${Math.max(240, Number(config.performance.turnIntrinsicSize)||640)}px`);
    });
    perf.turns = turns.length;
    perf.streaming = config.performance.streamingThrottle && isStreaming();
    document.documentElement.dataset.gmStreaming = perf.streaming ? "true" : "false";
  }

  window.addEventListener("scroll", () => {
    if (!config.performance.pauseWhileScrolling) return;
    perf.scrolling = true; clearTimeout(perf.timer);
    perf.timer = setTimeout(() => { perf.scrolling=false; scheduleScan("scroll-settled"); }, 180);
  }, { passive:true, capture:true });

  function routeKey() {
    const c = location.pathname.match(/^\/c\/([^/]+)/); if (c) return `c:${c[1]}`;
    const g = location.pathname.match(/^\/g\/([^/]+)/); if (g) return `g:${g[1]}`;
    return `path:${location.pathname}`;
  }

  function activeProfile() {
    const key = config.contextProfiles.active;
    const p = key ? config.contextProfiles.profiles?.[key] : null;
    return config.contextProfiles.enabled && p?.enabled && norm(p.instructions) ? { key, ...p } : null;
  }

  function envelope(profile, original) {
    return [`[GutenMorgen Context Profile: ${profile.title || profile.key}]`,"","Use the following instructions for this conversation:",profile.instructions.trim(),"","---","",original].join("\n");
  }

  function composer() {
    return document.querySelector("#prompt-textarea") || document.querySelector('[contenteditable="true"][data-lexical-editor="true"]') || document.querySelector('main [contenteditable="true"]') || document.querySelector('textarea[placeholder]');
  }
  function composerText(c) { return c instanceof HTMLTextAreaElement || c instanceof HTMLInputElement ? c.value : (c?.innerText || c?.textContent || ""); }
  function setComposer(c, text) {
    if (!c) return false; c.focus();
    if (c instanceof HTMLTextAreaElement || c instanceof HTMLInputElement) {
      const proto = c instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,"value")?.set?.call(c,text);
      c.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:text})); return true;
    }
    const sel=window.getSelection(), r=document.createRange(); r.selectNodeContents(c); sel.removeAllRanges(); sel.addRange(r);
    let ok=false; try { ok=document.execCommand("insertText",false,text); } catch {}
    if (!ok) c.textContent=text;
    c.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:text})); return true;
  }
  function injectContext() {
    const p=activeProfile(), c=composer(); if (!p || !c) return false;
    const original=composerText(c).trim(); if (!original) return false;
    if (original.startsWith("[GutenMorgen Context Profile:")) return true;
    return setComposer(c,envelope(p,original));
  }
  function injected() { return !!session.injectedRoutes[routeKey()]; }
  function markInjected() { session.injectedRoutes[routeKey()] = true; session.lastRoute=routeKey(); saveSession(); }
  function reconcileInjectedRoute() {
    const current = routeKey();
    const previous = session.lastRoute;
    if (previous && previous !== current && session.injectedRoutes[previous] && !session.injectedRoutes[current]) {
      if (previous.startsWith("path:/") && current.startsWith("c:")) {
        session.injectedRoutes[current] = true;
        session.lastRoute = current;
        saveSession();
      }
    }
  }
  function shouldBootstrap() { return config.contextProfiles.enabled && config.contextProfiles.mode === "bootstrap" && !!activeProfile() && !injected(); }
  function sendButton() { return document.querySelector('button[data-testid="send-button"],button[aria-label*="Send" i]'); }
  let bypass=false;
  function bootstrap(event) {
    if (bypass || !shouldBootstrap()) return false;
    const c=composer(), current=composerText(c).trim(); if (!c || !current) return false;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!injectContext()) return false;
    markInjected(); bypass=true;
    setTimeout(() => {
      const b=sendButton();
      if (b && !b.disabled) b.click();
      else c.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true,cancelable:true}));
      setTimeout(()=>{bypass=false;},80);
    },60);
    return true;
  }
  document.addEventListener("click", e => {
    const b=e.target instanceof Element ? e.target.closest('button[data-testid="send-button"],button[aria-label*="Send" i]') : null;
    if (b) bootstrap(e);
  }, true);
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const c=composer(); if (c && (e.target===c || c.contains?.(e.target))) bootstrap(e);
    }
  }, true);

  const stats = { projects:0, collapseDetected:0, collapseApplied:0, turns:0, streaming:false, reason:"not-run", time:"—" };
  let dirty=false, scanTimer=null;
  function idle(cb) { "requestIdleCallback" in window ? requestIdleCallback(cb,{timeout:900}) : setTimeout(cb,80); }
  function scheduleScan(reason="mutation") {
    dirty=true; clearTimeout(scanTimer);
    scanTimer=setTimeout(() => {
      if (config.performance.enabled && config.performance.pauseWhileScrolling && perf.scrolling) { scheduleScan("deferred-by-scroll"); return; }
      idle(() => { if (!dirty) return; dirty=false; scan(reason); });
    },120);
  }
  function scan(reason="scan") {
    reconcileInjectedRoute();
    if (!config.enabled) return updateDebug();
    const projectsHeading=labelSection("Projects",config.labels.projects);
    labelSection("Pinned",config.labels.pinned);
    let projects=0;
    for (const [key,p] of Object.entries(config.projects)) if (renderProject(key,p)) projects++;
    const collapsed=collapseProjects(projectsHeading);
    applyPerformance();
    Object.assign(stats,{projects,collapseDetected:collapsed.detected,collapseApplied:collapsed.collapsed,turns:perf.turns,streaming:perf.streaming,reason,time:new Date().toLocaleTimeString()});
    log("scan",stats); updateDebug(); updateContextChip();
  }

  let ui=null, view="workspace", selectedProject=Object.keys(config.projects)[0]||"", selectedProfile=config.contextProfiles.active||Object.keys(config.contextProfiles.profiles)[0]||"";
  function ensureUI() {
    if (ui) return;
    const host=document.createElement("div"); host.id="gutenmorgen-ui-host"; document.documentElement.appendChild(host);
    const shadow=host.attachShadow({mode:"open"});
    shadow.innerHTML=`
<style>
:host{all:initial;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}*{box-sizing:border-box}button,input,select,textarea{font:inherit}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #8b5cf6;outline-offset:2px}
#launcher{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:32px;height:32px;border:1px solid #ffffff1a;border-radius:8px;background:#171717;color:#ffffffb8;cursor:pointer;font-size:10px;font-weight:750}#launcher:hover{border-color:#ffffff29;color:#fff}
#overlay{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;padding:24px;background:#0000008a}#overlay.open{display:flex}
#settings{display:grid;grid-template-columns:184px minmax(0,1fr);width:min(860px,calc(100vw - 32px));height:min(680px,calc(100vh - 40px));overflow:hidden;border:1px solid #ffffff29;border-radius:12px;background:#171717;color:#f5f5f5}
#nav{display:flex;flex-direction:column;border-right:1px solid #ffffff1a;padding:12px 8px}.brand{padding:8px;margin-bottom:8px;font-size:13px;font-weight:720}.brand small{display:block;margin-top:3px;color:#ffffff7a;font-size:10px;font-weight:500}.nav-button{height:32px;border:0;border-radius:6px;padding:0 8px;background:transparent;color:#ffffffb8;text-align:left;cursor:pointer}.nav-button:hover,.nav-button.active{background:#ffffff0d;color:#fff}.nav-spacer{flex:1}#close{border:0;background:transparent;color:#ffffff7a;cursor:pointer;text-align:left;padding:8px}
#main{display:grid;grid-template-rows:48px minmax(0,1fr) 56px;min-width:0}#topbar{display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid #ffffff1a}#view-title{font-size:13px;font-weight:700}#context-chip{display:none;color:#ffffff7a;font-size:10px}#content{overflow:auto;padding:16px}#footer{display:flex;justify-content:flex-end;gap:8px;align-items:center;padding:0 16px;border-top:1px solid #ffffff1a}
.view{display:none}.view.active{display:block}.section{max-width:660px;padding:0 0 20px}.section+.section{padding-top:20px;border-top:1px solid #ffffff1a}h3{margin:0 0 4px;font-size:12px}.description{margin:0 0 12px;color:#ffffff7a;font-size:10px;line-height:1.5}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.row{display:flex;align-items:center;gap:8px}label{display:grid;gap:5px;margin:10px 0;color:#ffffffb8;font-size:10px}.checkbox{display:flex;align-items:center;gap:8px}input[type=text],input[type=number],select,textarea{width:100%;min-height:32px;border:1px solid #ffffff1a;border-radius:6px;background:#111113;color:#fff;padding:7px 8px}textarea{min-height:210px;resize:vertical;line-height:1.45}input[type=color]{width:100%;height:32px;border:1px solid #ffffff1a;border-radius:6px;background:#111113}.action{min-height:32px;border:1px solid #ffffff1a;border-radius:6px;background:transparent;color:#ffffffb8;padding:0 10px;cursor:pointer}.action:hover{border-color:#ffffff29;color:#fff}.primary{border-color:#8b5cf6;background:#8b5cf6;color:#fff}.danger{color:#fca5a5}.meta{color:#ffffff7a;font-size:10px;line-height:1.5}#icon-preview{display:flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;border:1px solid #ffffff1a;border-radius:6px;background:#111113;overflow:hidden}#icon-preview img{width:16px;height:16px;object-fit:contain}#debug-status{white-space:pre-wrap;font:10px/1.6 "JetBrains Mono","Cascadia Code",monospace;color:#ffffffb8}@media(max-width:720px){#settings{grid-template-columns:132px minmax(0,1fr)}.grid2{grid-template-columns:1fr}}
</style>
<button id="launcher" title="GutenMorgen settings">GM</button>
<div id="overlay"><section id="settings" role="dialog" aria-modal="true">
<nav id="nav"><div class="brand">GutenMorgen<small>v0.4.0 · Foundation</small></div><button class="nav-button active" data-view="workspace">Workspace</button><button class="nav-button" data-view="context">Context</button><button class="nav-button" data-view="performance">Performance</button><button class="nav-button" data-view="backup">Backup</button><button class="nav-button" data-view="debug">Debug</button><div class="nav-spacer"></div><button id="close">Close</button></nav>
<div id="main"><header id="topbar"><span id="view-title">Workspace</span><span id="context-chip"></span></header><div id="content">
<div class="view active" data-view="workspace"><section class="section"><h3>Sidebar</h3><p class="description">Native hierarchy, restrained semantic accents.</p><div class="grid2"><label>Projects label<input id="projects-label" type="text"></label><label>Pinned label<input id="pinned-label" type="text"></label></div><label class="checkbox"><input id="default-collapsed" type="checkbox">Collapse Projects by default when a native toggle is safely detectable</label><label class="checkbox"><input id="remember-collapse" type="checkbox">Remember manual expansion state</label></section><section class="section"><div class="row" style="justify-content:space-between"><div><h3>Project appearance</h3><p class="description">Accent rail, icon slot, optional metadata. No glow/gradient.</p></div><div class="row"><button id="add-project" class="action">Add project</button><button id="delete-project" class="action danger">Delete local profile</button></div></div><label>Project<select id="project-select"></select></label><div class="grid2"><label>Local alias<input id="project-alias" type="text"></label><label>Metadata<input id="project-metadata" type="text" placeholder="RUST · LA"></label></div><div class="grid2"><label>Accent<input id="project-color" type="color"></label><label>Text icon<input id="project-icon-text" type="text" maxlength="8"></label></div><div class="row"><label class="checkbox" style="flex:1"><input id="project-enabled" type="checkbox">Enable profile</label><label class="checkbox" style="flex:1"><input id="replace-native" type="checkbox">Replace native icon</label></div><div class="row"><label style="flex:1">Custom icon<input id="project-icon-file" type="file" accept=".png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/svg+xml,image/webp"></label><div id="icon-preview"></div><button id="use-text-icon" class="action">Use text icon</button></div><p class="meta">Image icons: max 512 KiB. SVG is rendered as an image; raw markup is not injected.</p></section></div>
<div class="view" data-view="context"><section class="section"><h3>Context Profiles</h3><p class="description">Local reusable instructions for ordinary chats. Bootstrap prepends them to the first outgoing user message; this is not equivalent to native Project Instructions.</p><div class="grid2"><label>Active profile<select id="profile-select"></select></label><label>Injection mode<select id="context-mode"><option value="manual">Manual</option><option value="bootstrap">Bootstrap first message</option></select></label></div><div class="row"><label class="checkbox" style="flex:1"><input id="context-enabled" type="checkbox">Enable Context Profiles</label><button id="inject-context" class="action">Inject into composer</button><button id="add-profile" class="action">Add profile</button><button id="delete-profile" class="action danger">Delete</button></div></section><section class="section"><label>Display name<input id="profile-title" type="text"></label><label>Instructions<textarea id="profile-instructions"></textarea></label><p class="meta">If ChatGPT changes its composer DOM, switch to Manual mode until the adapter is updated.</p></section></div>
<div class="view" data-view="performance"><section class="section"><h3>Safe Performance Engine</h3><p class="description">Reversible rendering optimizations only. No message deletion or network interception.</p><label class="checkbox"><input id="perf-enabled" type="checkbox">Enable performance engine</label><label class="checkbox"><input id="offscreen-rendering" type="checkbox">Skip off-screen turn layout/paint work</label><label class="checkbox"><input id="streaming-throttle" type="checkbox">Suspend turn animations/transitions while streaming</label><label class="checkbox"><input id="pause-scroll" type="checkbox">Defer GutenMorgen rescans while scrolling</label><label>Intrinsic off-screen turn height<input id="intrinsic-size" type="number" min="240" max="1800" step="20"></label><p class="meta">Pruning and IndexedDB virtualization are deliberately not part of v0.4.</p></section></div>
<div class="view" data-view="backup"><section class="section"><h3>Configuration backup</h3><p class="description">Export includes project icons and Context Profiles.</p><div class="row"><button id="export-json" class="action">Export JSON</button><button id="import-json" class="action">Import JSON</button><input id="import-file" type="file" accept=".json,application/json" hidden></div></section><section class="section"><h3>Reset</h3><button id="reset-config" class="action danger">Reset GutenMorgen settings</button></section></div>
<div class="view" data-view="debug"><section class="section"><h3>Diagnostics</h3><label class="checkbox"><input id="debug-toggle" type="checkbox">Console debug logging</label><pre id="debug-status">Waiting for scan…</pre></section></div>
</div><footer id="footer"><button id="save" class="action primary">Save & apply</button></footer></div></section></div>`;
    ui={host,shadow,$:id=>shadow.getElementById(id)}; bindUI(); refreshUI();
  }

  function openUI(v=view){ensureUI(); switchView(v); refreshUI(); ui.$("overlay").classList.add("open");}
  function closeUI(){ui?.$("overlay").classList.remove("open");}
  function switchView(v){if(!ui)return;view=v;ui.shadow.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("active",b.dataset.view===v));ui.shadow.querySelectorAll(".view").forEach(p=>p.classList.toggle("active",p.dataset.view===v));ui.$("view-title").textContent={workspace:"Workspace",context:"Context",performance:"Performance",backup:"Backup",debug:"Debug"}[v]||"GutenMorgen";}
  function currentProject(){return config.projects[selectedProject]||null;}
  function currentProfile(){return config.contextProfiles.profiles[selectedProfile]||null;}

  function refreshProjectEditor(){
    if(!ui)return; const keys=Object.keys(config.projects); if(!keys.includes(selectedProject))selectedProject=keys[0]||""; const s=ui.$("project-select");s.innerHTML="";keys.forEach(k=>{const o=document.createElement("option");o.value=k;o.textContent=k;o.selected=k===selectedProject;s.appendChild(o)});const p=currentProject();if(!p)return;ui.$("project-enabled").checked=!!p.enabled;ui.$("project-alias").value=p.alias||"";ui.$("project-metadata").value=p.metadata||"";ui.$("project-color").value=p.color||"#8B5CF6";ui.$("replace-native").checked=!!p.icon?.replaceNative;ui.$("project-icon-text").value=p.icon?.type==="text"?(p.icon.value||""):"";const pv=ui.$("icon-preview");pv.innerHTML="";if(p.icon?.type==="image"&&p.icon.value){const img=document.createElement("img");img.src=p.icon.value;pv.appendChild(img)}else pv.textContent=p.icon?.type==="text"?(p.icon.value||"—"):"—";
  }
  function refreshProfileEditor(){
    if(!ui)return;const profiles=config.contextProfiles.profiles||{},keys=Object.keys(profiles);if(!keys.includes(selectedProfile))selectedProfile=config.contextProfiles.active&&keys.includes(config.contextProfiles.active)?config.contextProfiles.active:(keys[0]||"");const s=ui.$("profile-select");s.innerHTML="";const none=document.createElement("option");none.value="";none.textContent="No active profile";s.appendChild(none);keys.forEach(k=>{const o=document.createElement("option");o.value=k;o.textContent=k;o.selected=k===config.contextProfiles.active;s.appendChild(o)});const p=profiles[selectedProfile]||profiles[config.contextProfiles.active];ui.$("profile-title").value=p?.title||"";ui.$("profile-instructions").value=p?.instructions||"";
  }
  function refreshUI(){
    if(!ui)return;ui.$("launcher").style.display=config.ui.launcher?"block":"none";ui.$("projects-label").value=config.labels.projects||"Projects";ui.$("pinned-label").value=config.labels.pinned||"Pinned";ui.$("default-collapsed").checked=!!config.projectTree.defaultCollapsed;ui.$("remember-collapse").checked=!!config.projectTree.rememberState;ui.$("context-enabled").checked=!!config.contextProfiles.enabled;ui.$("context-mode").value=config.contextProfiles.mode||"manual";ui.$("perf-enabled").checked=!!config.performance.enabled;ui.$("offscreen-rendering").checked=!!config.performance.offscreenRendering;ui.$("streaming-throttle").checked=!!config.performance.streamingThrottle;ui.$("pause-scroll").checked=!!config.performance.pauseWhileScrolling;ui.$("intrinsic-size").value=Number(config.performance.turnIntrinsicSize)||640;ui.$("debug-toggle").checked=!!config.debug;refreshProjectEditor();refreshProfileEditor();updateDebug();updateContextChip();
  }
  function updateContextChip(){if(!ui)return;const p=activeProfile(),chip=ui.$("context-chip");chip.style.display=p?"block":"none";chip.textContent=p?`Context: ${p.title||p.key} · ${config.contextProfiles.mode}`:"";}
  function readUI(){
    const n=clone(config);n.labels.projects=ui.$("projects-label").value.trim()||"Projects";n.labels.pinned=ui.$("pinned-label").value.trim()||"Pinned";n.projectTree.defaultCollapsed=ui.$("default-collapsed").checked;n.projectTree.rememberState=ui.$("remember-collapse").checked;
    if(selectedProject&&n.projects[selectedProject]){const p=n.projects[selectedProject];p.enabled=ui.$("project-enabled").checked;p.alias=ui.$("project-alias").value.trim();p.metadata=ui.$("project-metadata").value.trim();p.color=ui.$("project-color").value;p.icon=p.icon||{type:"none",value:"",replaceNative:true,fit:"contain"};p.icon.replaceNative=ui.$("replace-native").checked;if(p.icon.type!=="image"){const v=ui.$("project-icon-text").value.trim();p.icon.type=v?"text":"none";p.icon.value=v;}}
    n.contextProfiles.enabled=ui.$("context-enabled").checked;n.contextProfiles.mode=ui.$("context-mode").value;n.contextProfiles.active=ui.$("profile-select").value;if(selectedProfile&&n.contextProfiles.profiles[selectedProfile]){const p=n.contextProfiles.profiles[selectedProfile];p.title=ui.$("profile-title").value.trim()||selectedProfile;p.instructions=ui.$("profile-instructions").value;}
    n.performance.enabled=ui.$("perf-enabled").checked;n.performance.offscreenRendering=ui.$("offscreen-rendering").checked;n.performance.streamingThrottle=ui.$("streaming-throttle").checked;n.performance.pauseWhileScrolling=ui.$("pause-scroll").checked;n.performance.turnIntrinsicSize=Math.max(240,Math.min(1800,Number(ui.$("intrinsic-size").value)||640));n.debug=ui.$("debug-toggle").checked;return n;
  }
  function updateDebug(){if(!ui)return;const p=activeProfile();ui.$("debug-status").textContent=[`projects matched      ${stats.projects}`,`collapse toggles      ${stats.collapseDetected}`,`collapsed this scan   ${stats.collapseApplied}`,`conversation turns    ${stats.turns}`,`streaming             ${stats.streaming?"yes":"no"}`,`context profile       ${p?.title||"none"}`,`context mode          ${config.contextProfiles.mode}`,`route injected        ${injected()?"yes":"no"}`,`last scan reason      ${stats.reason}`,`last scan             ${stats.time}`].join("\n");}

  function bindUI(){
    ui.$("launcher").addEventListener("click",()=>openUI("workspace"));ui.$("close").addEventListener("click",closeUI);ui.$("overlay").addEventListener("click",e=>{if(e.target===ui.$("overlay"))closeUI()});ui.shadow.querySelectorAll(".nav-button").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
    ui.$("project-select").addEventListener("change",e=>{selectedProject=e.target.value;refreshProjectEditor()});
    ui.$("profile-select").addEventListener("change",e=>{const n=readUI();n.contextProfiles.active=e.target.value;if(e.target.value)selectedProfile=e.target.value;save(n)});
    ui.$("add-project").addEventListener("click",()=>{const name=prompt("Exact ChatGPT Project name:")?.trim();if(!name)return;const n=readUI();n.projects[name] ||= {enabled:true,alias:"",color:"#8B5CF6",metadata:"",icon:{type:"none",value:"",replaceNative:true,fit:"contain"}};selectedProject=name;save(n)});
    ui.$("delete-project").addEventListener("click",()=>{if(!selectedProject||!confirm(`Delete local profile for \"${selectedProject}\"?`))return;const n=readUI();delete n.projects[selectedProject];selectedProject=Object.keys(n.projects)[0]||"";save(n)});
    ui.$("project-icon-file").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f||!selectedProject)return;if(!["image/png","image/jpeg","image/svg+xml","image/webp"].includes(f.type)){alert("Use PNG, JPG/JPEG, SVG, or WebP.");e.target.value="";return}if(f.size>512*1024){alert("Keep icons under 512 KiB.");e.target.value="";return}const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result));r.onerror=rej;r.readAsDataURL(f)});const n=readUI();n.projects[selectedProject].icon={type:"image",value:data,replaceNative:ui.$("replace-native").checked,fit:"contain"};save(n);e.target.value=""});
    ui.$("use-text-icon").addEventListener("click",()=>{if(!selectedProject)return;const n=readUI(),v=ui.$("project-icon-text").value.trim();n.projects[selectedProject].icon={type:v?"text":"none",value:v,replaceNative:ui.$("replace-native").checked,fit:"contain"};save(n)});
    ui.$("add-profile").addEventListener("click",()=>{const name=prompt("Context Profile name:")?.trim();if(!name)return;const n=readUI();n.contextProfiles.profiles[name] ||= {enabled:true,title:name,instructions:""};selectedProfile=name;n.contextProfiles.active=name;save(n)});
    ui.$("delete-profile").addEventListener("click",()=>{if(!selectedProfile||!confirm(`Delete Context Profile \"${selectedProfile}\"?`))return;const n=readUI();delete n.contextProfiles.profiles[selectedProfile];selectedProfile=Object.keys(n.contextProfiles.profiles)[0]||"";n.contextProfiles.active=selectedProfile;save(n)});
    ui.$("inject-context").addEventListener("click",()=>{const n=readUI();save(n);if(injectContext()){markInjected();closeUI()}else alert("Could not inject context. Select a profile and put text in the composer first.")});
    ui.$("save").addEventListener("click",()=>{save(readUI());closeUI()});
    ui.$("export-json").addEventListener("click",()=>{const blob=new Blob([JSON.stringify(config,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="gutenmorgen-settings-v0.4.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
    ui.$("import-json").addEventListener("click",()=>ui.$("import-file").click());ui.$("import-file").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{save(JSON.parse(await f.text()))}catch(err){alert(`Invalid JSON: ${err.message}`)}e.target.value=""});
    ui.$("reset-config").addEventListener("click",()=>{if(!confirm("Reset all GutenMorgen settings?"))return;selectedProject="Kernix | Rust";selectedProfile="Design";save(clone(DEFAULTS))});
  }

  document.addEventListener("keydown",e=>{
    if(e.ctrlKey&&e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="g"){e.preventDefault();openUI()}
    if(e.ctrlKey&&e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="i"){e.preventDefault();if(injectContext())markInjected()}
    if(e.key==="Escape"&&ui?.$("overlay").classList.contains("open"))closeUI();
  },true);
  GM_registerMenuCommand("Open GutenMorgen settings",()=>openUI("workspace"));
  GM_registerMenuCommand("Inject active Context Profile",()=>{if(injectContext())markInjected()});

  ensureUI();
  new MutationObserver(()=>scheduleScan("dom-mutation")).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener("popstate",()=>scheduleScan("popstate"));
  window.addEventListener("hashchange",()=>scheduleScan("hashchange"));
  scan("initial");setTimeout(()=>scan("500ms"),500);setTimeout(()=>scan("1500ms"),1500);
  console.info("%c[GutenMorgen] v0.4.0 loaded","color:#D34516;font-weight:800");
})();
