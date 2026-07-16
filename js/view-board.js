/**
 * view-board.js — Campaign graph board view
 * True extraction of dm-board.html — minimal changes:
 *   document.getElementById → _$(id) scoped to container
 *   campaignId from URL param → passed as argument
 *   import paths adjusted for js/ directory
 * 
 * Usage:
 *   import { initBoard, destroyBoard } from './js/view-board.js';
 *   const cleanup = initBoard(containerEl, { campaignId: 'default', onSelectPlace: node => ... });
 *   cleanup(); // unsubscribes Firebase listeners, removes HTML
 */

import { ref, onValue, set, update, remove, push, get }
  from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { db } from "./firebase.js";
import { buildSheetCard, loadSheetApi, setSheetToastFn } from "./sheet.js";

// Inject CSS once
const STYLE_ID = 'view-board-css';
function injectCSS() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = '\n  :root{\n    --ink:        #14161c;\n    --ink-panel:  #1b1e27;\n    --ink-raised: #232733;\n    --parchment:  #e8dcc4;\n    --parchment-dim: #b9ad91;\n    --string:     #a8433d;\n    --string-dim: #6b3230;\n    --gold:       #c9a04e;\n    --muted:      #6f7585;\n    --line:       #2a2e3a;\n  }\n  *{ box-sizing:border-box; }\n  html,body{ height:100%; margin:0; }\n  #board-root{\n    background:var(--ink);\n    color:var(--parchment);\n    font-family:\'Inter\',sans-serif;\n    overflow:hidden;\n    position:relative;\n  }\n  /* subtle corkboard texture via layered radial noise */\n  #board-root::before{\n    content:"";\n    position:fixed; inset:0;\n    background-image:\n      radial-gradient(circle at 20% 30%, rgba(255,255,255,0.015) 0, transparent 40%),\n      radial-gradient(circle at 80% 70%, rgba(255,255,255,0.012) 0, transparent 45%);\n    pointer-events:none;\n    z-index:0;\n  }\n\n  /* ---------- top bar ---------- */\n  #topbar{\n    position:fixed; top:0; left:0; right:0; height:56px;\n    display:flex; align-items:center; justify-content:space-between;\n    padding:0 20px;\n    background:linear-gradient(to bottom, rgba(20,22,28,0.95), rgba(20,22,28,0.75));\n    border-bottom:1px solid var(--line);\n    z-index:50;\n    backdrop-filter: blur(6px);\n  }\n  #topbar .brand{\n    font-family:\'Cinzel\', serif;\n    font-size:15px;\n    letter-spacing:0.12em;\n    color:var(--gold);\n    text-transform:uppercase;\n  }\n  #topbar .brand span{ color:var(--parchment-dim); font-weight:500; }\n  #topbar .hint{\n    font-family:\'IBM Plex Mono\', monospace;\n    font-size:11px;\n    color:var(--muted);\n    letter-spacing:0.02em;\n  }\n  #topbar .status{\n    font-family:\'IBM Plex Mono\', monospace;\n    font-size:11px;\n    color:var(--muted);\n    display:flex; align-items:center; gap:6px;\n  }\n  #topbar .status .dot{\n    width:6px; height:6px; border-radius:50%;\n    background:var(--muted);\n  }\n  #topbar .status.live .dot{ background:#6ea86f; }\n  #topbar .status.error .dot{ background:var(--string); }\n\n  /* ---------- canvas ---------- */\n  #canvas-wrap{\n    position:absolute; inset:0; top:56px;\n    cursor:grab;\n  }\n  #canvas-wrap.panning{ cursor:grabbing; }\n  #world{\n    position:absolute; top:0; left:0;\n    width:6000px; height:6000px;\n    transform-origin:0 0;\n    background-image: radial-gradient(var(--line) 1px, transparent 1px);\n    background-size:28px 28px;\n  }\n  svg#edge-layer{\n    position:absolute; top:0; left:0;\n    width:6000px; height:6000px;\n    pointer-events:none;\n    overflow:visible;\n  }\n  .edge-path{\n    fill:none;\n    stroke:var(--string-dim);\n    stroke-width:1.6;\n    pointer-events:stroke;\n    cursor:pointer;\n  }\n  .edge-path:hover{ stroke:var(--string); stroke-width:2.2; }\n  .edge-label-group{ pointer-events:auto; cursor:pointer; }\n  .edge-label-bg{\n    fill:var(--ink-panel);\n    stroke:var(--line);\n    stroke-width:1;\n  }\n  .edge-label-text{\n    font-family:\'IBM Plex Mono\', monospace;\n    font-size:10px;\n    fill:var(--parchment-dim);\n  }\n  .edge-label-group:hover .edge-label-bg{ stroke:var(--gold); }\n  .edge-label-group:hover .edge-label-text{ fill:var(--gold); }\n\n  /* ---------- bubbles ---------- */\n  .bubble{\n    position:absolute;\n    min-width:150px; max-width:220px;\n    background:var(--ink-panel);\n    border:1px solid var(--line);\n    border-radius:9px;\n    padding:11px 13px 10px;\n    box-shadow:0 6px 18px rgba(0,0,0,0.35);\n    cursor:grab;\n    user-select:none;\n    transition:border-color .12s, box-shadow .12s;\n  }\n  .bubble:active{ cursor:grabbing; }\n  .bubble.selected{\n    border-color:var(--gold);\n    box-shadow:0 6px 18px rgba(0,0,0,0.4), 0 0 0 1px rgba(201,160,78,0.3);\n  }\n  .bubble.link-source{\n    border-color:var(--string);\n    box-shadow:0 0 0 1px rgba(168,67,61,0.5), 0 6px 18px rgba(0,0,0,0.4);\n  }\n  .bubble .pin{\n    position:absolute; top:-5px; left:14px;\n    width:8px; height:8px; border-radius:50%;\n    background:var(--gold);\n    box-shadow:0 1px 3px rgba(0,0,0,0.6);\n  }\n  .bubble .tag-chip{\n    display:inline-block;\n    font-family:\'IBM Plex Mono\', monospace;\n    font-size:9px;\n    letter-spacing:0.06em;\n    text-transform:uppercase;\n    padding:2px 6px;\n    border-radius:4px;\n    margin-bottom:6px;\n    color:var(--ink);\n    font-weight:500;\n  }\n  .bubble .tag-chip.untagged{\n    background:transparent;\n    border:1px dashed var(--muted);\n    color:var(--muted);\n  }\n  .bubble .name{\n    font-family:\'Cinzel\', serif;\n    font-size:14px;\n    font-weight:600;\n    color:var(--parchment);\n    line-height:1.3;\n    word-break:break-word;\n  }\n  .bubble .name[contenteditable="true"]{\n    outline:none;\n    border-bottom:1px dashed var(--gold);\n  }\n  .bubble .meta-preview{\n    margin-top:5px;\n    font-size:11px;\n    color:var(--muted);\n    line-height:1.4;\n    max-height:34px;\n    overflow:hidden;\n  }\n  .bubble .attach-strip{\n    display:flex; gap:4px; flex-wrap:wrap; margin-top:7px;\n  }\n  .bubble .attach-strip img{\n    width:34px; height:34px; object-fit:cover; border-radius:4px; border:1px solid var(--line);\n  }\n  .bubble .attach-strip .attach-file{\n    width:34px; height:34px; border-radius:4px; border:1px solid var(--line);\n    background:var(--ink); display:flex; align-items:center; justify-content:center;\n    font-family:\'IBM Plex Mono\', monospace; font-size:8px; color:var(--muted); text-align:center;\n    overflow:hidden; padding:2px;\n  }\n  .bubble.drag-over{\n    border-color:var(--gold); border-style:dashed;\n    box-shadow:0 0 0 2px rgba(201,160,78,0.35), 0 6px 18px rgba(0,0,0,0.4);\n  }\n  .bubble .map-badge{\n    position:absolute; top:-5px; right:10px;\n    font-size:11px; background:var(--ink); border:1px solid var(--gold);\n    border-radius:4px; padding:1px 4px; line-height:1.4;\n  }\n\n  /* tag colors */\n  /* tag chip colors are now set inline from tagDefs (see JS) rather than fixed classes */\n  #ctx-menu .ctx-tags button.add-tag-btn{\n    background:transparent; border:1px dashed var(--muted); color:var(--muted); opacity:1;\n  }\n  #ctx-menu .ctx-tags button.add-tag-btn:hover{ border-color:var(--gold); color:var(--gold); }\n\n  /* ---------- floating toolbar (bottom-left) ---------- */\n  #toolbar{\n    position:fixed; bottom:20px; left:20px;\n    display:flex; gap:8px;\n    z-index:40;\n  }\n  #toolbar button{\n    font-family:\'Inter\',sans-serif;\n    font-size:12px; font-weight:500;\n    background:var(--ink-panel);\n    border:1px solid var(--line);\n    color:var(--parchment-dim);\n    padding:9px 14px;\n    border-radius:7px;\n    cursor:pointer;\n    display:flex; align-items:center; gap:6px;\n    transition:border-color .12s, color .12s;\n  }\n  #toolbar button:hover{ border-color:var(--gold); color:var(--gold); }\n  #toolbar button.armed{ border-color:var(--string); color:var(--string); background:rgba(168,67,61,0.08); }\n  #toolbar .zoom-group{\n    display:flex; align-items:center; gap:2px;\n    background:var(--ink-panel); border:1px solid var(--line); border-radius:7px;\n    padding:2px;\n  }\n  #toolbar .zoom-group button{ border:none; background:transparent; padding:7px 10px; }\n  #toolbar .zoom-group button:hover{ background:var(--ink-raised); }\n  #toolbar .zoom-pct{\n    font-family:\'IBM Plex Mono\', monospace;\n    font-size:11px; color:var(--muted); padding:0 4px;\n  }\n\n  /* ---------- create-bubble form ---------- */\n  #create-form{\n    position:fixed; z-index:55; display:none;\n    width:260px;\n    background:var(--ink-panel);\n    border:1px solid var(--gold);\n    border-radius:10px;\n    box-shadow:0 14px 34px rgba(0,0,0,0.55);\n    padding:14px;\n  }\n  #create-form label{\n    display:block; font-size:10px; letter-spacing:0.06em; text-transform:uppercase;\n    color:var(--muted); margin:10px 0 5px; font-family:\'IBM Plex Mono\', monospace;\n  }\n  #create-form label:first-of-type{ margin-top:0; }\n  #create-form input[type=text], #create-form select, #create-form textarea{\n    width:100%; background:var(--ink); border:1px solid var(--line);\n    border-radius:6px; color:var(--parchment); font-family:\'Inter\',sans-serif;\n    font-size:13px; padding:8px 9px;\n  }\n  #create-form select{\n    appearance:none; -webkit-appearance:none;\n    background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236f7585\'/%3E%3C/svg%3E");\n    background-repeat:no-repeat; background-position:right 10px center;\n    cursor:pointer;\n  }\n  #create-form textarea{ min-height:58px; line-height:1.5; resize:vertical; font-family:\'Inter\',sans-serif; }\n  #cf-suggestions{\n    position:absolute; top:100%; left:0; right:0; z-index:5;\n    background:var(--ink-raised); border:1px solid var(--gold);\n    border-top:none; border-radius:0 0 6px 6px;\n    max-height:180px; overflow-y:auto; display:none;\n  }\n  #cf-suggestions .sugg-row{\n    padding:8px 10px; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:8px;\n    border-bottom:1px solid var(--line);\n  }\n  #cf-suggestions .sugg-row:last-child{ border-bottom:none; }\n  #cf-suggestions .sugg-row:hover, #cf-suggestions .sugg-row.active{ background:rgba(201,160,78,0.12); }\n  #cf-suggestions .sugg-name{ font-size:12px; color:var(--parchment); }\n  #cf-suggestions .sugg-tag{\n    font-family:\'IBM Plex Mono\', monospace; font-size:9px; text-transform:uppercase; letter-spacing:0.05em;\n    color:var(--muted); border:1px solid var(--line); border-radius:4px; padding:2px 5px; flex-shrink:0;\n  }\n  #create-form input:focus, #create-form select:focus, #create-form textarea:focus{\n    outline:none; border-color:var(--gold);\n  }\n  #create-form .cf-actions{\n    display:flex; justify-content:flex-end; gap:8px; margin-top:14px;\n  }\n  #create-form .cf-btn-ghost, #create-form .cf-btn-solid{\n    font-family:\'Inter\',sans-serif; font-size:12px; font-weight:500;\n    padding:7px 13px; border-radius:6px; cursor:pointer; border:1px solid var(--line);\n  }\n  #create-form .cf-btn-ghost{ background:transparent; color:var(--muted); }\n  #create-form .cf-btn-ghost:hover{ color:var(--parchment); }\n  #create-form .cf-btn-solid{ background:var(--gold); color:var(--ink); border-color:var(--gold); font-weight:600; }\n  #create-form .cf-btn-solid:hover{ filter:brightness(1.08); }\n\n  /* ---------- connector handle (drag to link, Visio-style) ---------- */\n  .connector-handle{\n    position:absolute; top:50%; right:-8px; transform:translateY(-50%);\n    width:15px; height:15px; border-radius:50%;\n    background:var(--ink);\n    border:2px solid var(--gold);\n    cursor:crosshair;\n    opacity:0; transition:opacity .12s, transform .12s;\n    z-index:2;\n  }\n  .bubble:hover .connector-handle{ opacity:0.9; }\n  .connector-handle:hover{ opacity:1 !important; transform:translateY(-50%) scale(1.25); background:var(--gold); }\n  .temp-link-line{\n    stroke:var(--gold); stroke-width:2; stroke-dasharray:5 4;\n    fill:none; pointer-events:none;\n  }\n  .align-guide{\n    stroke:var(--gold); stroke-width:1; stroke-dasharray:4 3;\n    opacity:0.85; pointer-events:none;\n  }\n  .align-guide-tick{\n    fill:var(--gold); opacity:0.9; pointer-events:none;\n  }\n  #marquee{\n    position:fixed; z-index:35; display:none;\n    border:1px solid var(--gold);\n    background:rgba(201,160,78,0.12);\n    pointer-events:none;\n  }\n  .bubble.multi-selected{\n    border-color:var(--gold);\n    box-shadow:0 0 0 1px rgba(201,160,78,0.55), 0 6px 18px rgba(0,0,0,0.4);\n  }\n  #board-root.connecting .bubble{ cursor:crosshair; }\n  .bubble.connect-target{ border-color:var(--gold); box-shadow:0 0 0 2px rgba(201,160,78,0.4); }\n  #ctx-menu{\n    position:fixed; z-index:55; display:none;\n    width:280px;\n    background:var(--ink-panel);\n    border:1px solid var(--line);\n    border-radius:10px;\n    box-shadow:0 14px 34px rgba(0,0,0,0.55);\n    padding:16px;\n    max-height:calc(100vh - 90px);\n    overflow-y:auto;\n  }\n  #ctx-menu .ctx-tags{\n    display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;\n  }\n  #ctx-menu .ctx-tags button{\n    font-family:\'IBM Plex Mono\', monospace;\n    font-size:9px; letter-spacing:0.05em; text-transform:uppercase;\n    border:none; padding:6px 9px; border-radius:5px;\n    cursor:pointer; color:var(--ink); font-weight:600;\n    opacity:0.75; transition:opacity .12s;\n  }\n  #ctx-menu .ctx-tags button:hover{ opacity:1; }\n  #ctx-menu .ctx-tags button.active{ box-shadow:0 0 0 2px var(--parchment) inset; opacity:1; }\n  #ctx-menu h2{\n    font-family:\'Cinzel\', serif; font-size:17px; margin:0 0 2px;\n    color:var(--parchment); outline:none;\n  }\n  #ctx-menu h2[contenteditable="true"]:focus{ border-bottom:1px dashed var(--gold); }\n  #ctx-menu .ctx-id{\n    font-size:10px; color:var(--muted); margin-bottom:14px;\n    font-family:\'IBM Plex Mono\', monospace;\n  }\n  #ctx-menu label{\n    display:block; font-size:10px; letter-spacing:0.06em; text-transform:uppercase;\n    color:var(--muted); margin:12px 0 5px; font-family:\'IBM Plex Mono\', monospace;\n  }\n  #ctx-menu textarea, #ctx-menu input[type=text]{\n    width:100%; background:var(--ink); border:1px solid var(--line);\n    border-radius:6px; color:var(--parchment); font-family:\'Inter\',sans-serif;\n    font-size:13px; padding:8px 9px; resize:vertical;\n  }\n  #sb-actions .action-row{\n    background:var(--ink); border:1px solid var(--line); border-radius:6px;\n    padding:8px; margin-bottom:6px;\n  }\n  #sb-actions .action-row-top{\n    display:flex; gap:6px; margin-bottom:6px;\n  }\n  #sb-actions .action-row input{\n    background:var(--ink-raised); border:1px solid var(--line); border-radius:5px;\n    color:var(--parchment); font-family:\'Inter\',sans-serif; font-size:12px; padding:6px 7px;\n  }\n  #sb-actions .action-name{ flex:2; }\n  #sb-actions .action-tohit{ flex:1; }\n  #sb-actions .action-damage{ flex:1; }\n  #sb-actions .action-row textarea{\n    width:100%; background:var(--ink-raised); border:1px solid var(--line); border-radius:5px;\n    color:var(--parchment); font-family:\'Inter\',sans-serif; font-size:11px; padding:6px 7px;\n    min-height:34px; resize:vertical;\n  }\n  #sb-actions .action-del{\n    color:var(--muted); cursor:pointer; font-size:12px; text-align:right; margin-top:4px;\n  }\n  #sb-actions .action-del:hover{ color:var(--string); }\n  #ctx-menu textarea{ min-height:64px; line-height:1.5; }\n  #ctx-menu textarea:focus, #ctx-menu input:focus{ outline:none; border-color:var(--gold); }\n  .edge-row{\n    display:flex; align-items:center; justify-content:space-between;\n    padding:7px 0; border-bottom:1px solid var(--line);\n    font-size:12px;\n  }\n  .edge-row .role{ color:var(--gold); font-family:\'IBM Plex Mono\', monospace; font-size:10px; text-transform:uppercase; }\n  .edge-row .other{ color:var(--parchment-dim); cursor:pointer; }\n  .edge-row .other:hover{ color:var(--gold); }\n  .edge-row .del{ color:var(--muted); cursor:pointer; font-size:14px; }\n  .edge-row .del:hover{ color:var(--string); }\n  .attach-row{\n    display:flex; align-items:center; gap:8px;\n    padding:6px 0; border-bottom:1px solid var(--line);\n  }\n  .attach-row img{ width:32px; height:32px; object-fit:cover; border-radius:4px; border:1px solid var(--line); }\n  .attach-row .attach-file-icon{\n    width:32px; height:32px; border-radius:4px; border:1px solid var(--line);\n    background:var(--ink); display:flex; align-items:center; justify-content:center;\n    font-family:\'IBM Plex Mono\', monospace; font-size:8px; color:var(--muted);\n  }\n  .attach-row a{ color:var(--parchment-dim); font-size:12px; flex:1; text-decoration:none; word-break:break-all; }\n  .attach-row a:hover{ color:var(--gold); }\n  .attach-row .del{ color:var(--muted); cursor:pointer; font-size:14px; }\n  .attach-row .del:hover{ color:var(--string); }\n  #ctx-menu .close-btn{\n    position:absolute; top:12px; right:12px;\n    background:none; border:none; color:var(--muted);\n    font-size:16px; cursor:pointer; line-height:1;\n  }\n  #ctx-menu .close-btn:hover{ color:var(--parchment); }\n  #ctx-menu .delete-node-btn{\n    margin-top:16px; width:100%;\n    background:transparent; border:1px solid var(--string-dim);\n    color:var(--string); padding:8px; border-radius:6px;\n    font-family:\'Inter\',sans-serif; font-size:12px; cursor:pointer;\n  }\n  #ctx-menu .delete-node-btn:hover{ background:rgba(168,67,61,0.1); border-color:var(--string); }\n\n  /* ---------- link-label prompt ---------- */\n  #link-prompt{\n    position:fixed; z-index:60; display:none;\n    background:var(--ink-raised); border:1px solid var(--gold);\n    border-radius:8px; padding:10px;\n    box-shadow:0 8px 24px rgba(0,0,0,0.6);\n  }\n  #link-prompt input{\n    background:var(--ink); border:1px solid var(--line); border-radius:5px;\n    color:var(--parchment); font-family:\'IBM Plex Mono\', monospace;\n    font-size:12px; padding:7px 9px; width:170px;\n  }\n  #link-prompt input:focus{ outline:none; border-color:var(--gold); }\n  #link-prompt .suggestions{\n    display:flex; flex-wrap:wrap; gap:4px; margin-top:7px; max-width:220px;\n  }\n  #link-prompt .suggestions span{\n    font-family:\'IBM Plex Mono\', monospace; font-size:9px;\n    color:var(--muted); background:var(--ink);\n    padding:3px 6px; border-radius:4px; cursor:pointer;\n    border:1px solid var(--line);\n  }\n  #link-prompt .suggestions span:hover{ border-color:var(--gold); color:var(--gold); }\n\n  /* ---------- empty state ---------- */\n  #empty-hint{\n    position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);\n    text-align:center; color:var(--muted); z-index:5; pointer-events:none;\n    font-family:\'Inter\',sans-serif;\n  }\n  #empty-hint .big{\n    font-family:\'Cinzel\', serif; font-size:22px; color:var(--parchment-dim);\n    margin-bottom:8px;\n  }\n  #empty-hint .small{ font-size:12px; font-family:\'IBM Plex Mono\', monospace; }\n\n  /* ---------- character-sheet card (shared with mapeditor.html via js/sheet.js) ---------- */\n  #sb-card-view{\n    --panel: var(--ink-panel);\n    --panel2: var(--ink-raised);\n    --border: var(--line);\n    --dim: var(--muted);\n    --text: var(--parchment);\n    margin-top: 10px;\n    border: 1px solid var(--line);\n    border-radius: 8px;\n    overflow: hidden;\n  }\n  #sb-card-view .card{background:transparent;border:none;border-radius:0;width:100%;flex-shrink:0;overflow:visible}\n  #sb-card-view .card-header{padding:12px 12px 8px;border-bottom:1px solid var(--border)}\n  #sb-card-view .char-name{font-family:\'Cinzel\',serif;font-size:1rem;font-weight:700;color:var(--gold);margin-bottom:2px}\n  #sb-card-view .char-sub{font-size:.68rem;color:var(--dim);font-family:\'JetBrains Mono\',monospace}\n  #sb-card-view .char-role-badge{display:inline-block;font-family:\'Cinzel\',serif;font-size:.56rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:rgba(200,168,75,.1);border:1px solid rgba(200,168,75,.3);color:var(--gold);margin-top:4px}\n  #sb-card-view .hp-row{display:flex;align-items:center;gap:6px;margin-top:8px}\n  #sb-card-view .hp-label{font-family:\'Cinzel\',serif;font-size:.58rem;font-weight:700;color:var(--dim);letter-spacing:.08em;text-transform:uppercase;width:16px}\n  #sb-card-view .hp-bar-wrap{flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden}\n  #sb-card-view .hp-bar{height:100%;border-radius:999px;transition:width .4s,background-color .4s}\n  #sb-card-view .hp-val{font-size:.7rem;font-weight:700;font-family:\'JetBrains Mono\',monospace;color:var(--text);white-space:nowrap;min-width:48px;text-align:right}\n  #sb-card-view .temp-badge{font-size:.58rem;font-family:\'JetBrains Mono\',monospace;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.35);color:#c084fc;border-radius:999px;padding:1px 6px;white-space:nowrap}\n  #sb-card-view .hp-controls{display:flex;align-items:center;gap:5px;margin-top:6px}\n  #sb-card-view .hp-delta{flex:1;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:4px 6px;font-size:.76rem;font-family:\'JetBrains Mono\',monospace;outline:none;text-align:center;min-width:0}\n  #sb-card-view .hp-delta:focus{border-color:var(--gold-dim)}\n  #sb-card-view .hp-btn{border-radius:4px;padding:4px 8px;font-size:.68rem;font-weight:700;font-family:\'Cinzel\',serif;cursor:pointer;transition:all .12s;white-space:nowrap;letter-spacing:.04em}\n  #sb-card-view .hp-btn.heal{background:rgba(74,154,74,.12);border:1px solid rgba(74,154,74,.3);color:#5a9a5a}\n  #sb-card-view .hp-btn.heal:hover{background:rgba(74,154,74,.22)}\n  #sb-card-view .hp-btn.dmg{background:rgba(224,64,64,.12);border:1px solid rgba(224,64,64,.3);color:#fca5a5}\n  #sb-card-view .hp-btn.dmg:hover{background:rgba(224,64,64,.22)}\n  #sb-card-view .stats-row{display:flex;border-bottom:1px solid var(--border)}\n  #sb-card-view .stat-cell{flex:1;padding:6px 2px;text-align:center;border-right:1px solid var(--border)}\n  #sb-card-view .stat-cell:last-child{border-right:none}\n  #sb-card-view .stat-label{font-family:\'Cinzel\',serif;font-size:.52rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);margin-bottom:2px}\n  #sb-card-view .stat-val{font-size:.84rem;font-weight:700;font-family:\'JetBrains Mono\',monospace;color:var(--text)}\n  #sb-card-view .ability-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:3px;padding:8px;border-bottom:1px solid var(--border)}\n  #sb-card-view .ab-box{background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:5px;padding:5px 2px;text-align:center}\n  #sb-card-view .ab-name{font-family:\'Cinzel\',serif;font-size:.5rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--dim);margin-bottom:1px}\n  #sb-card-view .ab-score{font-size:.84rem;font-weight:700;font-family:\'JetBrains Mono\',monospace;color:var(--text);line-height:1}\n  #sb-card-view .ab-mod{font-size:.62rem;font-family:\'JetBrains Mono\',monospace;color:var(--gold);margin-top:1px}\n  #sb-card-view .conditions-row{display:flex;flex-wrap:wrap;gap:3px;padding:5px 8px;border-bottom:1px solid var(--border)}\n  #sb-card-view .conditions-row:empty{display:none}\n  #sb-card-view .cond-pill{font-family:\'Cinzel\',serif;font-size:.55rem;font-weight:700;padding:2px 7px;border-radius:999px;background:rgba(224,64,64,.12);border:1px solid rgba(224,64,64,.3);color:#fca5a5}\n  #sb-card-view .card-footer{padding:6px;display:flex;flex-direction:column;gap:4px}\n  #sb-card-view .panel-btn{width:100%;border-radius:5px;color:var(--dim);font-family:\'Cinzel\',serif;font-size:.68rem;font-weight:700;letter-spacing:.04em;padding:6px 8px;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .15s;border:1px solid var(--border);background:rgba(255,255,255,.02)}\n  #sb-card-view .panel-btn .chevron{margin-left:auto;transition:transform .2s}\n  #sb-card-view .panel-btn.open .chevron{transform:rotate(180deg)}\n  #sb-card-view .panel-btn:hover,#sb-card-view .panel-btn.open{border-color:var(--gold-dim);color:var(--text);background:rgba(200,168,75,.05)}\n  #sb-card-view .panel-btn.spell-btn:hover,#sb-card-view .panel-btn.spell-btn.open{border-color:#8b5cf6;color:#c084fc;background:rgba(139,92,246,.08)}\n  #sb-card-view .panel-btn.skill-btn:hover,#sb-card-view .panel-btn.skill-btn.open{border-color:#0ea5e9;color:#38bdf8;background:rgba(14,165,233,.08)}\n  #sb-card-view .panel-btn.weapon-btn:hover,#sb-card-view .panel-btn.weapon-btn.open{border-color:#e8834a;color:#f5a87b;background:rgba(232,131,74,.08)}\n  #sb-card-view .panel-btn.tip-btn:hover,#sb-card-view .panel-btn.tip-btn.open{border-color:#22c55e;color:#4ade80;background:rgba(34,197,94,.05)}\n  #sb-card-view .panel-btn.inv-btn:hover,#sb-card-view .panel-btn.inv-btn.open{border-color:var(--gold-dim);color:var(--gold);background:rgba(200,168,75,.06)}\n  #sb-card-view .expand-panel{display:none;border-top:1px solid var(--border);padding:10px;background:rgba(12,9,8,.5)}\n  #sb-card-view .expand-panel.open{display:block}\n  #sb-card-view .sp-section-title{font-family:\'Cinzel\',serif;font-size:.58rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:5px;margin-top:8px}\n  #sb-card-view .sp-section-title:first-child{margin-top:0}\n  #sb-card-view .slot-levels{display:flex;flex-direction:column;gap:5px;margin-bottom:10px}\n  #sb-card-view .slot-level-row{display:flex;align-items:center;gap:6px}\n  #sb-card-view .slot-level-label{font-family:\'Cinzel\',serif;font-size:.58rem;color:var(--dim);width:38px;flex-shrink:0}\n  #sb-card-view .slot-pips{display:flex;gap:4px;flex-wrap:wrap}\n  #sb-card-view .slot-pip{width:14px;height:14px;border-radius:50%;border:1.5px solid var(--gold-dim);background:rgba(200,168,75,.15);cursor:pointer;transition:all .12s;flex-shrink:0}\n  #sb-card-view .slot-pip:hover{transform:scale(1.15)}\n  #sb-card-view .slot-pip.used{background:rgba(255,255,255,.04);border-color:var(--border)}\n  #sb-card-view .spell-list{display:flex;flex-direction:column;gap:3px}\n  #sb-card-view .spell-item{padding:5px 7px;border-radius:4px;background:rgba(255,255,255,.02);border:1px solid var(--border)}\n  #sb-card-view .spell-item-top{display:flex;align-items:baseline;justify-content:space-between;gap:5px}\n  #sb-card-view .spell-name{font-family:\'Cinzel\',serif;font-size:.7rem;font-weight:700;color:var(--text)}\n  #sb-card-view .spell-level-tag{font-size:.58rem;font-family:\'JetBrains Mono\',monospace;color:var(--dim);white-space:nowrap}\n  #sb-card-view .spell-desc{font-size:.64rem;color:var(--dim);line-height:1.5;margin-top:2px;font-family:\'JetBrains Mono\',monospace}\n  #sb-card-view .skill-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-bottom:6px}\n  #sb-card-view .skill-row-item{display:flex;align-items:center;justify-content:space-between;gap:5px;padding:3px 7px;border-radius:4px;background:rgba(255,255,255,.02);border:1px solid var(--border);font-size:.66rem}\n  #sb-card-view .skill-name{color:var(--dim)}\n  #sb-card-view .skill-val{font-family:\'JetBrains Mono\',monospace;font-weight:700;color:var(--text)}\n  #sb-card-view .skill-row-item.prof .skill-name{color:#38bdf8}\n  #sb-card-view .skill-row-item.expert .skill-name{color:#4ade80}\n  #sb-card-view .save-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:3px;margin-bottom:6px}\n  #sb-card-view .save-row-item{display:flex;align-items:center;justify-content:space-between;flex-direction:column;gap:2px;padding:4px 3px;border-radius:4px;background:rgba(255,255,255,.02);border:1px solid var(--border);font-size:.62rem;text-align:center}\n  #sb-card-view .save-row-item.prof .skill-name{color:var(--gold)}\n  #sb-card-view .senses-block{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px}\n  #sb-card-view .sense-pill{font-family:\'JetBrains Mono\',monospace;font-size:.62rem;padding:2px 7px;border-radius:4px;border:1px solid rgba(14,165,233,.25);background:rgba(14,165,233,.05);color:#38bdf8}\n  #sb-card-view .feat-item{padding:5px 7px;border-radius:4px;border:1px solid var(--border);background:rgba(255,255,255,.02);margin-bottom:3px}\n  #sb-card-view .feat-name{font-family:\'Cinzel\',serif;font-size:.7rem;font-weight:700;color:var(--text);margin-bottom:1px}\n  #sb-card-view .feat-desc{font-size:.64rem;color:var(--dim);line-height:1.5;font-family:\'JetBrains Mono\',monospace}\n  #sb-card-view .weapon-list{display:flex;flex-direction:column;gap:4px}\n  #sb-card-view .weapon-item{border:1px solid var(--border);border-radius:5px;background:rgba(255,255,255,.02);overflow:hidden}\n  #sb-card-view .weapon-top{display:flex;align-items:center;gap:6px;padding:6px 8px}\n  #sb-card-view .weapon-name{font-family:\'Cinzel\',serif;font-size:.74rem;font-weight:700;color:var(--text);flex:1}\n  #sb-card-view .weapon-type{font-size:.56rem;font-family:\'JetBrains Mono\',monospace;color:var(--dim);padding:1px 5px;border:1px solid var(--border);border-radius:999px;white-space:nowrap}\n  #sb-card-view .weapon-stats{display:flex;gap:4px;padding:0 8px 6px;flex-wrap:wrap}\n  #sb-card-view .wstat{display:flex;flex-direction:column;align-items:center;background:rgba(232,131,74,.06);border:1px solid rgba(232,131,74,.2);border-radius:4px;padding:3px 8px;min-width:48px}\n  #sb-card-view .wstat-label{font-family:\'Cinzel\',serif;font-size:.5rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#e8834a;margin-bottom:1px}\n  #sb-card-view .wstat-val{font-size:.8rem;font-weight:700;font-family:\'JetBrains Mono\',monospace;color:#f5a87b}\n  #sb-card-view .weapon-notes{font-size:.62rem;font-family:\'JetBrains Mono\',monospace;color:var(--dim);padding:0 8px 6px;line-height:1.5}\n  #sb-card-view .inv-item{padding:6px 7px;border-radius:4px;border:1px solid var(--border);background:rgba(255,255,255,.02);margin-bottom:3px}\n  #sb-card-view .inv-item-top{display:flex;align-items:center;justify-content:space-between;gap:5px}\n  #sb-card-view .inv-name{font-family:\'Cinzel\',serif;font-size:.7rem;font-weight:700;color:var(--text);flex:1}\n  #sb-card-view .inv-qty{font-family:\'JetBrains Mono\',monospace;font-size:.62rem;color:var(--gold);white-space:nowrap}\n  #sb-card-view .inv-cat{font-size:.56rem;font-family:\'JetBrains Mono\',monospace;color:var(--dim);margin-top:1px;padding:1px 5px;border:1px solid var(--border);border-radius:999px;display:inline-block}\n  #sb-card-view .inv-desc{font-size:.64rem;color:var(--dim);line-height:1.5;margin-top:3px;font-family:\'JetBrains Mono\',monospace}\n  #sb-card-view .inv-notes{font-size:.62rem;font-family:\'JetBrains Mono\',monospace;color:var(--gold-dim);margin-top:2px;font-style:italic}\n  #sb-card-view .equipped-row{display:flex;align-items:center;gap:5px;padding:4px 8px;border-bottom:1px solid var(--border);flex-wrap:wrap}\n  #sb-card-view .equipped-badge{font-family:\'JetBrains Mono\',monospace;font-size:.62rem;padding:2px 7px;border-radius:4px;border:1px solid rgba(200,168,75,.25);background:rgba(200,168,75,.05);color:var(--gold-dim)}\n  #sb-card-view .equipped-badge span{color:var(--text)}\n  #sb-card-view .coin-row{display:flex;align-items:center;gap:5px;padding:4px 8px;border-bottom:1px solid var(--border);flex-wrap:wrap}\n  #sb-card-view .coin-label{font-family:\'Cinzel\',serif;font-size:.54rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);margin-right:1px}\n  #sb-card-view .coin{display:flex;align-items:center;gap:2px;font-family:\'JetBrains Mono\',monospace;font-size:.66rem;font-weight:700;padding:1px 6px;border-radius:999px;border:1px solid}\n  #sb-card-view .coin.pp{color:#c4b5fd;border-color:rgba(196,181,253,.3);background:rgba(196,181,253,.07)}\n  #sb-card-view .coin.gp{color:var(--gold);border-color:rgba(200,168,75,.3);background:rgba(200,168,75,.07)}\n  #sb-card-view .coin.ep{color:#67e8f9;border-color:rgba(103,232,249,.3);background:rgba(103,232,249,.07)}\n  #sb-card-view .coin.sp{color:#94a3b8;border-color:rgba(148,163,184,.3);background:rgba(148,163,184,.07)}\n  #sb-card-view .coin.cp{color:#b45309;border-color:rgba(180,83,9,.3);background:rgba(180,83,9,.07)}\n  #sb-card-view .ability-charge{padding:6px 7px;border-radius:4px;border:1px solid var(--border);background:rgba(255,255,255,.02);margin-bottom:3px}\n  #sb-card-view .ability-charge-top{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-bottom:4px}\n  #sb-card-view .ability-charge-name{font-family:\'Cinzel\',serif;font-size:.7rem;font-weight:700;color:var(--text)}\n  #sb-card-view .ability-charge-meta{font-family:\'JetBrains Mono\',monospace;font-size:.58rem;color:var(--dim)}\n  #sb-card-view .charge-pips{display:flex;gap:4px;flex-wrap:wrap}\n  #sb-card-view .charge-pip{width:14px;height:14px;border-radius:50%;border:1.5px solid var(--gold-dim);background:rgba(200,168,75,.2);cursor:pointer;transition:all .12s;flex-shrink:0}\n  #sb-card-view .charge-pip:hover{transform:scale(1.15)}\n  #sb-card-view .charge-pip.used{background:rgba(255,255,255,.04);border-color:var(--border)}\n  #sb-card-view .empty-panel{font-family:\'Cinzel\',serif;font-size:.68rem;color:var(--dim);text-align:center;padding:8px 0}\n  #sb-card-view .combat-guide-wrap{background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:6px;padding:8px 10px}\n  #sb-card-view .combat-guide{font-size:.68rem;font-family:\'JetBrains Mono\',monospace;color:#4ade80;line-height:1.7;white-space:pre-wrap}\n  #sb-card-view .spell-meta{font-size:.6rem;font-family:\'JetBrains Mono\',monospace;color:var(--dim);margin-top:2px;display:flex;gap:6px;flex-wrap:wrap}\n  #sb-card-view .spell-meta span{color:var(--text)}\n  #sb-card-view .spell-tip{display:flex;align-items:flex-start;gap:4px;margin-top:3px;padding:3px 6px;border-radius:3px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2)}\n  #sb-card-view .spell-tip-text{font-size:.62rem;font-family:\'JetBrains Mono\',monospace;color:#4ade80;line-height:1.5}\n  #sb-card-view .sp-meta{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}\n  #sb-card-view .sp-meta-item{font-size:.62rem;font-family:\'JetBrains Mono\',monospace;color:var(--dim)}\n  #sb-card-view .sp-meta-item span{color:var(--gold);font-weight:700}\n';
  document.head.appendChild(el);
}

export function initBoard(container, { campaignId = 'default', onSelectPlace = null } = {}) {
  injectCSS();
  container.innerHTML = '<div id="topbar">\n  <div class="brand">Chaia <span>/ Thread Board</span></div>\n  <div class="hint">double-click canvas: new bubble · drag from edge of a bubble to another: link · click a link label: rename</div>\n  <div class="status" id="status"><div class="dot"></div><span id="status-text">connecting…</span></div>\n</div>\n\n<div id="canvas-wrap">\n  <div id="world">\n    <svg id="edge-layer"></svg>\n    <!-- bubbles injected here -->\n  </div>\n</div>\n<div id="marquee"></div>\n\n<div id="empty-hint">\n  <div class="big">The board is empty</div>\n  <div class="small">double-click anywhere to pin your first bubble</div>\n</div>\n\n<div id="toolbar">\n  <button id="btn-new">＋ New bubble</button>\n  <div class="zoom-group">\n    <button id="btn-zoom-out">－</button>\n    <span class="zoom-pct" id="zoom-pct">100%</span>\n    <button id="btn-zoom-in">＋</button>\n  </div>\n  <button id="btn-reset" title="Wipe this campaign\'s board (nodes, edges, tags) and start over">🗑 Reset board</button>\n  <button id=\"btn-sort\">⊞ Sort</button>\n</div>\n\n<div id="create-form">\n  <label>Name <span style="color:var(--muted); text-transform:none; font-weight:400;">— start typing to match an existing VTT character</span></label>\n  <div style="position:relative;">\n    <input type="text" id="cf-name" placeholder="Vorthak the Unmaking" autocomplete="off">\n    <div id="cf-suggestions"></div>\n  </div>\n  <label>Tag</label>\n  <select id="cf-tag">\n    <option value="">— untagged —</option>\n    <!-- populated dynamically from tagDefs -->\n  </select>\n  <label>Info</label>\n  <textarea id="cf-notes" placeholder="Origin, motivation, secrets..."></textarea>\n  <div class="cf-actions">\n    <button id="cf-cancel" class="cf-btn-ghost">Cancel</button>\n    <button id="cf-create" class="cf-btn-solid">Create</button>\n  </div>\n</div>\n\n<div id="ctx-menu">\n  <button class="close-btn" id="ctx-close">✕</button>\n  <div class="ctx-tags" id="ctx-tags">\n    <!-- populated dynamically from tagDefs, plus a + Add tag button -->\n  </div>\n  <h2 id="ctx-name" contenteditable="true"></h2>\n  <div class="ctx-id" id="ctx-id"></div>\n\n  <label>Notes</label>\n  <textarea id="ctx-notes" placeholder="Origin, motivation, secrets, whatever matters..."></textarea>\n\n  <div id="ctx-map-field" style="display:none;">\n    <label>Map <span style="color:var(--muted); text-transform:none; font-weight:400;">— dd2vtt / image URL, used by both the board and the VTT</span></label>\n    <input type="text" id="ctx-map-url" placeholder="https://yourname.github.io/maps/azurite-pointe.dd2vtt">\n  </div>\n\n  <div id="ctx-statblock-field" style="display:none;">\n    <label>Stat Block <span style="color:var(--muted); text-transform:none; font-weight:400;">— edits characters/npcs directly; mapeditor.html\'s sheet reads the same record live</span></label>\n    <div id="sb-create-prompt" style="display:none;">\n      <button id="sb-create-btn" style="width:100%; background:var(--gold); color:var(--ink); border:none; padding:9px; border-radius:6px; font-family:\'Inter\',sans-serif; font-size:12px; font-weight:600; cursor:pointer;">＋ Create Stat Block for this NPC</button>\n    </div>\n    <div id="sb-editor-body" style="display:none;">\n      <div style="display:flex; gap:6px;">\n        <div style="flex:1;">\n          <div style="font-family:\'IBM Plex Mono\',monospace; font-size:9px; color:var(--muted); margin-bottom:3px;">HP CURRENT</div>\n          <input type="text" id="sb-hp-current" style="width:100%;">\n        </div>\n        <div style="flex:1;">\n          <div style="font-family:\'IBM Plex Mono\',monospace; font-size:9px; color:var(--muted); margin-bottom:3px;">HP MAX</div>\n          <input type="text" id="sb-hp-max" style="width:100%;">\n        </div>\n        <div style="flex:1;">\n          <div style="font-family:\'IBM Plex Mono\',monospace; font-size:9px; color:var(--muted); margin-bottom:3px;">AC</div>\n          <input type="text" id="sb-ac" style="width:100%;">\n        </div>\n      </div>\n      <div style="font-family:\'IBM Plex Mono\',monospace; font-size:9px; color:var(--muted); margin:10px 0 4px;">ACTIONS</div>\n      <div id="sb-actions"></div>\n      <button id="sb-add-action" style="width:100%; margin-top:6px; background:transparent; border:1px dashed var(--muted); color:var(--muted); padding:7px; border-radius:6px; font-family:\'Inter\',sans-serif; font-size:11px; cursor:pointer;">+ Add action</button>\n\n      <div style="font-family:\'IBM Plex Mono\',monospace; font-size:9px; color:var(--muted); margin:14px 0 4px;">FULL SHEET — same view as mapeditor.html</div>\n      <div id="sb-card-view"></div>\n    </div>\n  </div>\n\n  <label>Attachments <span style="color:var(--muted); text-transform:none; font-weight:400;">— paste a link (GitHub Pages, etc.) or drag one from a tab</span></label>\n  <div style="display:flex; gap:6px;">\n    <input type="text" id="ctx-attach-url" placeholder="https://..." style="flex:1;">\n    <button id="ctx-attach-add" class="cf-btn-solid" style="padding:8px 12px; border:none; border-radius:6px; font-family:\'Inter\',sans-serif; font-size:12px; font-weight:600; cursor:pointer;">Add</button>\n  </div>\n  <div id="ctx-attachments"></div>\n\n  <label>Connections</label>\n  <div id="ctx-edges"></div>\n\n  <button class="delete-node-btn" id="ctx-delete">Remove this bubble</button>\n</div>\n\n<div id="link-prompt">\n  <input type="text" id="link-label-input" placeholder="e.g. current_location">\n  <div class="suggestions" id="link-suggestions"></div>\n</div>';

  // Scope all DOM lookups to this container
  const _$ = id => container.querySelector('#' + id);
  const _$q = sel => container.querySelector(sel);
  const _$qa = sel => container.querySelectorAll(sel);
  const _root = container;

  loadSheetApi();
  setSheetToastFn(msg => console.log('[board/sheet]', msg));

  // ── Extracted dm-board.html JS (scoped) ──────────────────────────────────


/* ---------------- campaign namespace ---------------- */
// campaignId injected by initBoard()
const basePath = `campaigns/${campaignId}`;
const nodesRef = ref(db, `${basePath}/nodes`);
const edgesRef = ref(db, `${basePath}/edges`);
const tagDefsRef = ref(db, `${basePath}/tagDefs`);

/* ---------------- state ---------------- */
let nodes = {};      // id -> {name, tag, notes, x, y}
let edges = {};      // id -> {from, to, role}
let tagDefs = {};    // key -> {label, color, plural}
let selectedId = null;
let selectedIds = new Set(); // multi-select via marquee / shift-click
let scale = 1;
let panX = 0, panY = 0;

const DEFAULT_TAGS = {
  person:  { label:'NPC',     color:'#c9a04e', plural:'npcs' },
  place:   { label:'Place',   color:'#5c8a72', plural:'locations' },
  faction: { label:'Faction', color:'#a8433d', plural:'factions' },
  event:   { label:'Event',   color:'#7c6fb0', plural:'events' },
  object:  { label:'Object',  color:'#4c8ba8', plural:'objects' },
  plan:    { label:'Plan',    color:'#b9762f', plural:'plans' },
};
const NEW_TAG_PALETTE = ['#c9a04e','#5c8a72','#a8433d','#7c6fb0','#4c8ba8','#b9762f','#6d9bc3','#9a6fb0','#7a9e5e','#c2645a'];

const ROLE_SUGGESTIONS = ["origin","current_location","member_of","owns","ally_of","enemy_of","caused_by","participant_in","planned_by","related"];

const world = _$('world');
const edgeLayer = _$('edge-layer');
const canvasWrap = _$('canvas-wrap');
const statusEl = _$('status');
const statusText = _$('status-text');
const emptyHint = _$('empty-hint');

function setStatus(state, text){
  statusEl.className = 'status ' + state;
  statusText.textContent = text;
}

/* ---------------- Firebase sync ---------------- */
onValue(nodesRef, snap => {
  nodes = snap.val() || {};
  renderAll();
  setStatus('live', 'synced');
}, err => setStatus('error', 'offline'));

onValue(edgesRef, snap => {
  edges = snap.val() || {};
  renderEdges();
});

onValue(tagDefsRef, snap => {
  const val = snap.val();
  if(val === null){
    // first time this campaign has loaded — seed the default tag set
    set(tagDefsRef, DEFAULT_TAGS);
    tagDefs = DEFAULT_TAGS;
  } else {
    tagDefs = val;
  }
  renderTagDropdown();
  renderCtxTagButtons();
  renderAll(); // chip colors may have changed
});

function genId(){ return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function createNode(x, y){
  const id = genId();
  const node = { name: 'New bubble', tag: '', notes: '', x, y };
  set(ref(db, `${basePath}/nodes/${id}`), node);
  return id;
}

function updateNode(id, patch){
  update(ref(db, `${basePath}/nodes/${id}`), patch);
}

function deleteNode(id){
  remove(ref(db, `${basePath}/nodes/${id}`));
  Object.entries(edges).forEach(([eid, e]) => {
    if(e.from === id || e.to === id) remove(ref(db, `${basePath}/edges/${eid}`));
  });
}

function createEdge(from, to, role){
  const id = genId();
  set(ref(db, `${basePath}/edges/${id}`), { from, to, role: role || 'related' });
}

function updateEdgeRole(id, role){
  update(ref(db, `${basePath}/edges/${id}`), { role });
}

function deleteEdge(id){
  remove(ref(db, `${basePath}/edges/${id}`));
}

/* ---------------- rendering ---------------- */
function renderAll(){
  // remove stale bubble elements
  [...world.querySelectorAll('.bubble')].forEach(el => {
    if(!nodes[el.dataset.id]) el.remove();
  });
  Object.entries(nodes).forEach(([id, n]) => renderBubble(id, n));
  renderEdges();
  emptyHint.style.display = Object.keys(nodes).length ? 'none' : 'block';
  if(selectedId && nodes[selectedId]) fillCtxMenu(selectedId);
  else closeInspector();
}

function tagColor(tag){ return tag && tagDefs[tag] ? tagDefs[tag].color : null; }
function tagLabel(tag){ return tag && tagDefs[tag] ? tagDefs[tag].label : 'untagged'; }
function tagPlural(tag){ return tag && tagDefs[tag] ? (tagDefs[tag].plural || tag+'s') : 'misc'; }

function renderBubble(id, n){
  let el = world.querySelector(`.bubble[data-id="${id}"]`);
  if(!el){
    el = document.createElement('div');
    el.className = 'bubble';
    el.dataset.id = id;
    el.innerHTML = `
      <div class="pin"></div>
      <div class="map-badge" title="Has a linked map">🗺️</div>
      <div class="tag-chip"></div>
      <div class="name" spellcheck="false"></div>
      <div class="meta-preview"></div>
      <div class="attach-strip"></div>
      <div class="connector-handle" title="Drag to link"></div>
    `;
    world.appendChild(el);
    wireBubbleEvents(el, id);
  }
  el.style.left = (n.x||0) + 'px';
  el.style.top = (n.y||0) + 'px';
  el.classList.toggle('selected', id === selectedId);
  el.classList.toggle('multi-selected', selectedIds.has(id));
  el.querySelector('.map-badge').style.display = n.mapUrl ? 'block' : 'none';
  const chip = el.querySelector('.tag-chip');
  const color = tagColor(n.tag);
  chip.className = 'tag-chip' + (color ? '' : ' untagged');
  chip.style.background = color || '';
  chip.textContent = tagLabel(n.tag);
  const nameEl = el.querySelector('.name');
  if(document.activeElement !== nameEl) nameEl.textContent = n.name || 'Unnamed';
  el.querySelector('.meta-preview').textContent = n.notes ? n.notes.slice(0, 70) : '';
  renderAttachStrip(el.querySelector('.attach-strip'), n.attachments);
}

function isImagePath(p){
  if(!p) return false;
  const clean = p.split('?')[0].split('#')[0];
  return /\.(png|jpe?g|gif|webp)$/i.test(clean);
}

function renderCtxAttachments(attachments, nodeId){
  const container = _$('ctx-attachments');
  container.innerHTML = '';
  const entries = attachments ? Object.entries(attachments) : [];
  if(!entries.length){
    container.innerHTML = '<div style="color:var(--muted);font-size:12px;">no files attached yet</div>';
    return;
  }
  entries.forEach(([attId, att]) => {
    const row = document.createElement('div');
    row.className = 'attach-row';
    const thumbHtml = isImagePath(att.path)
      ? `<img src="${att.path}">`
      : `<div class="attach-file-icon">${(att.filename||'').split('.').pop().toUpperCase()}</div>`;
    row.innerHTML = `${thumbHtml}<a href="${att.path}" target="_blank" rel="noopener">${att.filename}</a><span class="del">✕</span>`;
    row.querySelector('.del').addEventListener('click', () => {
      remove(ref(db, `${basePath}/nodes/${nodeId}/attachments/${attId}`));
    });
    container.appendChild(row);
  });
}

function renderAttachStrip(container, attachments){
  container.innerHTML = '';
  if(!attachments) return;
  Object.values(attachments).slice(0, 6).forEach(att => {
    if(isImagePath(att.path)){
      const img = document.createElement('img');
      img.src = att.path;
      img.title = att.filename;
      container.appendChild(img);
    } else {
      const div = document.createElement('div');
      div.className = 'attach-file';
      const ext = (att.filename || '').split('.').pop().toUpperCase();
      div.textContent = ext;
      div.title = att.filename;
      container.appendChild(div);
    }
  });
}

function bubbleCenter(id){
  const el = world.querySelector(`.bubble[data-id="${id}"]`);
  if(!el) return {x:0,y:0};
  return { x: (nodes[id]?.x||0) + el.offsetWidth/2, y: (nodes[id]?.y||0) + el.offsetHeight/2 };
}

function renderEdges(){
  edgeLayer.innerHTML = '';
  Object.entries(edges).forEach(([id, e]) => {
    if(!nodes[e.from] || !nodes[e.to]) return;
    const a = bubbleCenter(e.from), b = bubbleCenter(e.to);
    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const curve = Math.min(60, Math.hypot(dx,dy)*0.15);
    const nx = -dy, ny = dx;
    const len = Math.hypot(nx,ny) || 1;
    const cx = mx + (nx/len)*curve*0.4, cy = my + (ny/len)*curve*0.4;

    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`);
    path.setAttribute('class','edge-path');
    path.addEventListener('click', () => openLinkPrompt(id, e, cx, cy));
    edgeLayer.appendChild(path);

    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class','edge-label-group');
    g.addEventListener('click', () => openLinkPrompt(id, e, cx, cy));
    const label = e.role || 'related';
    const w = Math.max(46, label.length * 6.2 + 14);
    const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
    rect.setAttribute('class','edge-label-bg');
    rect.setAttribute('x', cx - w/2); rect.setAttribute('y', cy - 9);
    rect.setAttribute('width', w); rect.setAttribute('height', 18); rect.setAttribute('rx', 4);
    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('class','edge-label-text');
    text.setAttribute('x', cx); text.setAttribute('y', cy+3.5);
    text.setAttribute('text-anchor','middle');
    text.textContent = label;
    g.appendChild(rect); g.appendChild(text);
    edgeLayer.appendChild(g);
  });
}

/* ---------------- Canva/Visio-style alignment guides ---------------- */
const SNAP_THRESHOLD = 6;

function computeAlignSnap(id, nx, ny, w, h){
  let bestX = null, bestY = null, bestXDist = SNAP_THRESHOLD, bestYDist = SNAP_THRESHOLD;
  const guides = []; // {axis:'v'|'h', pos}
  const myXLines = { left: nx, center: nx + w/2, right: nx + w };
  const myYLines = { top: ny, center: ny + h/2, bottom: ny + h };

  Object.entries(nodes).forEach(([oid, o]) => {
    if(oid === id) return;
    const oEl = world.querySelector(`.bubble[data-id="${oid}"]`);
    if(!oEl) return;
    const ow = oEl.offsetWidth, oh = oEl.offsetHeight;
    const oXLines = { left: o.x, center: o.x + ow/2, right: o.x + ow };
    const oYLines = { top: o.y, center: o.y + oh/2, bottom: o.y + oh };

    Object.entries(myXLines).forEach(([myKey, myVal]) => {
      Object.entries(oXLines).forEach(([oKey, oVal]) => {
        const dist = Math.abs(myVal - oVal);
        if(dist < bestXDist){
          bestXDist = dist;
          bestX = nx + (oVal - myVal);
          guides[0] = { axis:'v', pos: oVal };
        }
      });
    });
    Object.entries(myYLines).forEach(([myKey, myVal]) => {
      Object.entries(oYLines).forEach(([oKey, oVal]) => {
        const dist = Math.abs(myVal - oVal);
        if(dist < bestYDist){
          bestYDist = dist;
          bestY = ny + (oVal - myVal);
          guides[1] = { axis:'h', pos: oVal };
        }
      });
    });
  });

  return { x: bestX, y: bestY, guides: guides.filter(Boolean) };
}

function drawAlignGuides(guides){
  clearAlignGuides();
  guides.forEach(g => {
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('class','align-guide');
    if(g.axis === 'v'){
      line.setAttribute('x1', g.pos); line.setAttribute('y1', 0);
      line.setAttribute('x2', g.pos); line.setAttribute('y2', 6000);
    } else {
      line.setAttribute('x1', 0); line.setAttribute('y1', g.pos);
      line.setAttribute('x2', 6000); line.setAttribute('y2', g.pos);
    }
    edgeLayer.appendChild(line);
  });
}

function clearAlignGuides(){
  edgeLayer.querySelectorAll('.align-guide').forEach(l => l.remove());
}

/* ---------------- bubble interactions ---------------- */
function wireBubbleEvents(el, id){
  let dragging = false, dragStartX, dragStartY, origX, origY, moved = false;
  let groupOrigins = null; // Map of id -> {x,y} for all bubbles being dragged together

  el.addEventListener('mousedown', e => {
    if(e.target.classList.contains('name')) return;
    if(e.target.classList.contains('connector-handle')) return; // handled separately
    if(e.button !== 0) return; // only left-click drags a bubble

    if(e.shiftKey){
      // shift-click just toggles membership in the multi-select, no drag/context menu
      if(selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
      renderAll();
      e.stopPropagation();
      return;
    }

    dragging = true; moved = false;
    dragStartX = e.clientX; dragStartY = e.clientY;
    origX = nodes[id]?.x || 0; origY = nodes[id]?.y || 0;

    // if this bubble is part of an existing multi-selection, drag the whole group together
    if(selectedIds.has(id) && selectedIds.size > 1){
      groupOrigins = new Map();
      selectedIds.forEach(gid => {
        if(nodes[gid]) groupOrigins.set(gid, { x: nodes[gid].x || 0, y: nodes[gid].y || 0 });
      });
    } else {
      groupOrigins = null;
      if(selectedIds.size) selectedIds.clear(); // plain click on a non-grouped bubble drops any prior multi-select
    }
    e.stopPropagation();
  });

  _root.addEventListener('mousemove', e => {
    if(!dragging) return;
    const dx = (e.clientX - dragStartX)/scale, dy = (e.clientY - dragStartY)/scale;
    if(Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
    let nx = origX + dx, ny = origY + dy;
    const w = el.offsetWidth, h = el.offsetHeight;
    const snap = computeAlignSnap(id, nx, ny, w, h);
    if(snap.x !== null) nx = snap.x;
    if(snap.y !== null) ny = snap.y;
    const snappedDx = nx - origX, snappedDy = ny - origY;

    if(groupOrigins){
      groupOrigins.forEach((orig, gid) => {
        const gx = orig.x + snappedDx, gy = orig.y + snappedDy;
        const gEl = world.querySelector(`.bubble[data-id="${gid}"]`);
        if(gEl){ gEl.style.left = gx + 'px'; gEl.style.top = gy + 'px'; }
        if(nodes[gid]){ nodes[gid].x = gx; nodes[gid].y = gy; }
      });
    } else {
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
      if(nodes[id]){ nodes[id].x = nx; nodes[id].y = ny; }
    }
    renderEdges();
    drawAlignGuides(snap.guides);
  });

  _root.addEventListener('mouseup', () => {
    if(dragging && moved){
      if(groupOrigins){
        // write every moved bubble's new position as ONE atomic multi-path update.
        // Separate updateNode() calls per bubble would commit at slightly different
        // times, and Firebase's onValue fires (overwriting local state) after the
        // FIRST commit lands — snapping any not-yet-committed bubble back to its
        // old position for a moment. A single batched update avoids that race.
        const patch = {};
        groupOrigins.forEach((orig, gid) => {
          if(!nodes[gid]) return;
          patch[`${gid}/x`] = nodes[gid].x;
          patch[`${gid}/y`] = nodes[gid].y;
        });
        if(Object.keys(patch).length) update(nodesRef, patch);
      } else {
        updateNode(id, { x: nodes[id].x, y: nodes[id].y });
      }
    }
    dragging = false;
    groupOrigins = null;
    clearAlignGuides();
  });

  el.addEventListener('click', e => {
    if(moved || e.shiftKey) return;
    selectedIds.clear();
    selectNode(id);
  });

  const nameEl = el.querySelector('.name');
  nameEl.addEventListener('blur', () => {
    const v = nameEl.textContent.trim() || 'Unnamed';
    updateNode(id, { name: v });
  });
  nameEl.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); nameEl.blur(); }
  });
  nameEl.addEventListener('dblclick', e => e.stopPropagation());

  /* connector handle: drag from here onto another bubble to create a link */
  const handle = el.querySelector('.connector-handle');
  handle.addEventListener('mousedown', e => {
    e.stopPropagation();
    e.preventDefault();
    startConnectorDrag(id, e);
  });

  /* URL drag-and-drop: drag a link (e.g. from a GitHub Pages tab) onto a bubble to attach it */
  el.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const url = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').trim();
    if(url) addAttachmentUrl(id, url);
  });
}

/* ---------------- attachments (pasted URLs — e.g. images/maps hosted on GitHub Pages) ---------------- */
function addAttachmentUrl(nodeId, url, label){
  if(!url) return;
  const attId = genId();
  const filename = label && label.trim() ? label.trim() : url.split('/').pop().split('?')[0] || url;
  update(ref(db, `${basePath}/nodes/${nodeId}/attachments`), {
    [attId]: { path: url, filename }
  });
}

function setMapUrl(nodeId, url){
  updateNode(nodeId, { mapUrl: url || null });
}

/* ---------------- connector-handle drag (Visio-style linking) ---------------- */
let connectDragSourceId = null;
let tempLineEl = null;

function startConnectorDrag(sourceId, downEvent){
  connectDragSourceId = sourceId;
  document.body.classList.add('connecting');
  tempLineEl = document.createElementNS('http://www.w3.org/2000/svg','path');
  tempLineEl.setAttribute('class','temp-link-line');
  edgeLayer.appendChild(tempLineEl);

  function worldPointFromEvent(e){
    const rect = canvasWrap.getBoundingClientRect();
    return { x: (e.clientX - rect.left - panX)/scale, y: (e.clientY - rect.top - panY)/scale };
  }

  function onMove(e){
    const a = bubbleCenter(sourceId);
    const p = worldPointFromEvent(e);
    tempLineEl.setAttribute('d', `M ${a.x} ${a.y} L ${p.x} ${p.y}`);
    const overEl = document.elementFromPoint(e.clientX, e.clientY);
    const overBubble = overEl && overEl.closest ? overEl.closest('.bubble') : null;
    _$qa('.bubble.connect-target').forEach(b => b.classList.remove('connect-target'));
    if(overBubble && overBubble.dataset.id !== sourceId){
      overBubble.classList.add('connect-target');
    }
  }

  function onUp(e){
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.classList.remove('connecting');
    if(tempLineEl){ tempLineEl.remove(); tempLineEl = null; }
    _$qa('.bubble.connect-target').forEach(b => b.classList.remove('connect-target'));

    const overEl = document.elementFromPoint(e.clientX, e.clientY);
    const overBubble = overEl && overEl.closest ? overEl.closest('.bubble') : null;
    connectDragSourceId = null;
    if(overBubble && overBubble.dataset.id && overBubble.dataset.id !== sourceId){
      openLinkPromptForNewEdge(sourceId, overBubble.dataset.id);
    }
  }

  _root.addEventListener('mousemove', onMove);
  _root.addEventListener('mouseup', onUp);
}

/* ---------------- selection / context menu ---------------- */
const ctxMenu = _$('ctx-menu');

function selectNode(id, anchorEl){
  selectedId = id;
  renderAll();
  openCtxMenu(id, anchorEl || world.querySelector(`.bubble[data-id="${id}"]`));
}

function closeInspector(){
  ctxMenu.style.display = 'none';
}

function openCtxMenu(id, anchorEl){
  if(!anchorEl) return;
  fillCtxMenu(id);
  ctxMenu.style.display = 'block';
  positionCtxMenu(anchorEl);
}

function positionCtxMenu(anchorEl){
  const rect = anchorEl.getBoundingClientRect();
  const menuW = 280, margin = 12;
  let left = rect.right + margin;
  let top = rect.top;
  // flip to the left side if it would overflow the viewport
  if(left + menuW > window.innerWidth - 10) left = rect.left - menuW - margin;
  if(left < 10) left = 10;
  // clamp vertically
  const menuH = Math.min(ctxMenu.scrollHeight || 400, window.innerHeight - 90);
  if(top + menuH > window.innerHeight - 20) top = Math.max(66, window.innerHeight - menuH - 20);
  ctxMenu.style.left = left + 'px';
  ctxMenu.style.top = top + 'px';
}

_$('ctx-tags').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if(!btn) return;
  if(btn.classList.contains('add-tag-btn')){ promptNewTag(tag => { if(selectedId) updateNode(selectedId, { tag }); }); return; }
  if(!selectedId) return;
  updateNode(selectedId, { tag: btn.dataset.tag });
});

function renderCtxTagButtons(){
  const container = _$('ctx-tags');
  const currentTag = selectedId && nodes[selectedId] ? nodes[selectedId].tag : null;
  container.innerHTML = '';
  Object.entries(tagDefs).forEach(([key, def]) => {
    const b = document.createElement('button');
    b.dataset.tag = key;
    b.textContent = def.label;
    b.style.background = def.color;
    if(key === currentTag) b.classList.add('active');
    container.appendChild(b);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'add-tag-btn';
  addBtn.textContent = '+ New tag';
  container.appendChild(addBtn);
}

function renderTagDropdown(){
  const sel = _$('cf-tag');
  const current = sel.value;
  sel.innerHTML = '<option value="">— untagged —</option>';
  Object.entries(tagDefs).forEach(([key, def]) => {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = def.label;
    sel.appendChild(opt);
  });
  const newOpt = document.createElement('option');
  newOpt.value = '__new__'; newOpt.textContent = '+ Create new tag…';
  sel.appendChild(newOpt);
  if([...sel.options].some(o => o.value === current)) sel.value = current;
}

function promptNewTag(onCreated){
  const label = prompt('Name your new tag (e.g. "Rumor", "Ritual Site"):');
  if(!label || !label.trim()) return;
  const trimmed = label.trim();
  const key = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || ('tag' + Date.now());
  const plural = (trimmed.toLowerCase().endsWith('s') ? trimmed.toLowerCase() : trimmed.toLowerCase() + 's').replace(/[^a-z0-9]+/g, '_');
  const color = NEW_TAG_PALETTE[Object.keys(tagDefs).length % NEW_TAG_PALETTE.length];
  const def = { label: trimmed, color, plural };
  update(ref(db, `${basePath}/tagDefs`), { [key]: def });
  // tagDefs updates via onValue shortly after; apply the callback once it's available, falling back to immediate key
  onCreated && onCreated(key);
}

_$('cf-tag').addEventListener('change', e => {
  if(e.target.value === '__new__'){
    promptNewTag(key => { e.target.value = key; });
  }
});

_$('ctx-close').addEventListener('click', () => {
  selectedId = null; closeInspector(); renderAll();
});

function fillCtxMenu(id){
  const n = nodes[id]; if(!n) return;
  const nameEl = _$('ctx-name');
  if(document.activeElement !== nameEl) nameEl.textContent = n.name || 'Unnamed';
  _$('ctx-id').textContent = id;
  const linkEl = _$('ctx-id');
  if(n.linkedCharacterId){
    linkEl.textContent = `${id} · linked to VTT ${n.linkedCharacterType}: ${n.linkedCharacterId}`;
  }
  const notesEl = _$('ctx-notes');
  if(document.activeElement !== notesEl) notesEl.value = n.notes || '';

  renderCtxTagButtons();
  renderCtxAttachments(n.attachments, id);

  const mapField = _$('ctx-map-field');
  const mapUrlInput = _$('ctx-map-url');
  if(n.tag === 'place'){
    mapField.style.display = 'block';
    if(document.activeElement !== mapUrlInput) mapUrlInput.value = n.mapUrl || '';
    // Burg link — populate dropdown from Firebase
    let burgLinkEl = _$('ctx-burg-link');
    if(!burgLinkEl){
      const div = document.createElement('div');
      div.id = 'ctx-burg-link';
      div.style.cssText = 'margin-top:8px';
      div.innerHTML = '<label style="display:block;margin-bottom:3px">World Map Burg <span style="color:var(--muted);text-transform:none;font-weight:400">— link this place to a burg pin</span></label>'
        + '<div style="display:flex;gap:6px">'
        + '<select id="ctx-burg-select" style="flex:1;padding:6px 8px;background:var(--ink);border:1px solid var(--line);border-radius:6px;color:var(--parchment);font-family:Inter,sans-serif;font-size:12px">'
        + '<option value="">— unlinked —</option></select>'
        + '<button id="ctx-burg-goto" style="padding:6px 10px;background:var(--gold);color:var(--ink);border:none;border-radius:6px;font-family:Inter,sans-serif;font-size:11px;font-weight:600;cursor:pointer;display:none">🗺 World Map</button>'
        + '</div>';
      mapField.appendChild(div);
      burgLinkEl = div;
      // Load burgs from Firebase
      get(ref(db, `campaigns/${campaignId}/map/burgs`)).then(snap => {
        const sel = _$('ctx-burg-select');
        if(!sel) return;
        if(snap.exists()){
          Object.values(snap.val()).sort((a,b)=>(a.name||'').localeCompare(b.name||'')).forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id; opt.textContent = b.name || b.id;
            sel.appendChild(opt);
          });
        }
        sel.value = nodes[selectedId]?.burgId || '';
        const gotoBtn = _$('ctx-burg-goto');
        if(gotoBtn) gotoBtn.style.display = sel.value ? 'block' : 'none';
        sel.addEventListener('change', async () => {
          const burgId = sel.value || null;
          updateNode(selectedId, { burgId });
          if(gotoBtn) gotoBtn.style.display = burgId ? 'block' : 'none';
          // Write mapNodeId back onto the burg
          if(burgId){
              update(ref(db, `campaigns/${campaignId}/map/burgs/${burgId}`), { mapNodeId: selectedId });
          }
        });
        if(gotoBtn) gotoBtn.addEventListener('click', () => {
          if(onSelectPlace) onSelectPlace({ id: sel.value, name: nodes[selectedId]?.name, _gotoWorld: true });
        });
      });
    } else {
      // Update existing dropdown value
      const sel = _$('ctx-burg-select');
      if(sel) {
        sel.value = n.burgId || '';
        const gotoBtn = _$('ctx-burg-goto');
        if(gotoBtn) gotoBtn.style.display = n.burgId ? 'block' : 'none';
      }
    }
  } else {
    mapField.style.display = 'none';
    const burgLink = _$('ctx-burg-link');
    if(burgLink) burgLink.remove();
  }

  const statField = _$('ctx-statblock-field');
  if(n.linkedCharacterId && (n.linkedCharacterType === 'npc' || n.linkedCharacterType === 'pc')){
    statField.style.display = 'block';
    _$('sb-create-prompt').style.display = 'none';
    _$('sb-editor-body').style.display = 'block';
    loadStatBlock(n.linkedCharacterId, n.linkedCharacterType);
  } else if(n.tag === 'person'){
    statField.style.display = 'block';
    _$('sb-create-prompt').style.display = 'block';
    _$('sb-editor-body').style.display = 'none';
    currentStatBlockCharId = null;
  } else {
    statField.style.display = 'none';
    currentStatBlockCharId = null;
  }

  _$('ctx-attach-url').value = '';

  const edgesList = _$('ctx-edges');
  edgesList.innerHTML = '';
  const related = Object.entries(edges).filter(([_,e]) => e.from === id || e.to === id);
  if(!related.length){
    edgesList.innerHTML = '<div style="color:var(--muted);font-size:12px;">no connections yet</div>';
  }
  related.forEach(([eid, e]) => {
    const otherId = e.from === id ? e.to : e.from;
    const other = nodes[otherId];
    if(!other) return;
    const row = document.createElement('div');
    row.className = 'edge-row';
    const dir = e.from === id ? '→' : '←';
    row.innerHTML = `<span><span class="role">${e.role}</span> ${dir} <span class="other">${other.name}</span></span><span class="del">✕</span>`;
    row.querySelector('.other').addEventListener('click', () => {
      const otherEl = world.querySelector(`.bubble[data-id="${otherId}"]`);
      selectNode(otherId, otherEl);
    });
    row.querySelector('.del').addEventListener('click', () => deleteEdge(eid));
    edgesList.appendChild(row);
  });
}

/* ---------------- Stat Block editor (edits characters/npcs or characters/pcs directly — same records mapeditor.html's sheet reads) ---------------- */
let currentStatBlockCharId = null;
let currentStatBlockType = 'npc'; // 'npc' | 'pc' — which characters/{type}s/ path we're editing
let currentStatBlockData = null;
function statBlockPath(){ return `characters/${currentStatBlockType}s/${currentStatBlockCharId}`; }

async function loadStatBlock(charId, type){
  currentStatBlockCharId = charId;
  currentStatBlockType = type === 'pc' ? 'pc' : 'npc';
  const snap = await get(ref(db, statBlockPath()));
  currentStatBlockData = snap.exists() ? snap.val() : { combat:{}, attacks:[] };
  if(currentStatBlockCharId !== charId) return; // selection changed while awaiting
  const c = currentStatBlockData.combat || {};
  _$('sb-hp-current').value = c.hp_current ?? '';
  _$('sb-hp-max').value = c.hp_max ?? '';
  _$('sb-ac').value = c.ac ?? '';
  renderActionRows(currentStatBlockData.attacks || []);
  renderCardPreview(charId);
}

function renderCardPreview(charId){
  const container = _$('sb-card-view');
  container.innerHTML = '';
  const dataForCard = { ...currentStatBlockData, id: charId };
  try{
    const cardEl = buildSheetCard(dataForCard, false);
    container.appendChild(cardEl);
  } catch(err){
    console.error('Could not render character sheet card', err);
    container.innerHTML = '<div style="padding:10px; color:var(--muted); font-size:11px;">Couldn\'t render the full sheet — the quick-edit fields above still work.</div>';
  }
}

function saveStatBlockCombat(){
  if(!currentStatBlockCharId) return;
  const hp_current = parseInt(_$('sb-hp-current').value) || 0;
  const hp_max = parseInt(_$('sb-hp-max').value) || 0;
  const ac = parseInt(_$('sb-ac').value) || 0;
  update(ref(db, statBlockPath()+'/combat'), { hp_current, hp_max, ac });
  currentStatBlockData.combat = { ...(currentStatBlockData.combat||{}), hp_current, hp_max, ac };
  renderCardPreview(currentStatBlockCharId);
}

['sb-hp-current','sb-hp-max','sb-ac'].forEach(id => {
  _$(id).addEventListener('blur', saveStatBlockCombat);
  _$(id).addEventListener('keydown', e => { if(e.key === 'Enter') e.target.blur(); });
});

function renderActionRows(attacks){
  const container = _$('sb-actions');
  container.innerHTML = '';
  if(!attacks.length){
    container.innerHTML = '<div style="color:var(--muted); font-size:11px; padding:4px 0;">no actions yet</div>';
  }
  attacks.forEach((atk, idx) => {
    const row = document.createElement('div');
    row.className = 'action-row';
    row.innerHTML = `
      <div class="action-row-top">
        <input type="text" class="action-name" placeholder="Bite" value="${(atk.name||'').replace(/"/g,'&quot;')}">
        <input type="text" class="action-tohit" placeholder="+5 to hit" value="${(atk.to_hit ?? '').toString().replace(/"/g,'&quot;')}">
        <input type="text" class="action-damage" placeholder="1d6+3 slashing" value="${(atk.damage||'').replace(/"/g,'&quot;')}">
      </div>
      <textarea placeholder="Notes / full description...">${atk.notes||''}</textarea>
      <div class="action-del">✕ remove</div>
    `;
    const commit = () => {
      const attacksNow = [...(currentStatBlockData.attacks || [])];
      attacksNow[idx] = {
        name: row.querySelector('.action-name').value.trim(),
        to_hit: row.querySelector('.action-tohit').value.trim(),
        damage: row.querySelector('.action-damage').value.trim(),
        notes: row.querySelector('textarea').value,
      };
      currentStatBlockData.attacks = attacksNow;
      update(ref(db, statBlockPath()), { attacks: attacksNow });
      renderCardPreview(currentStatBlockCharId);
    };
    row.querySelectorAll('input, textarea').forEach(el => el.addEventListener('blur', commit));
    row.querySelector('.action-del').addEventListener('click', () => {
      const attacksNow = (currentStatBlockData.attacks || []).filter((_, i) => i !== idx);
      currentStatBlockData.attacks = attacksNow;
      update(ref(db, statBlockPath()), { attacks: attacksNow });
      renderActionRows(attacksNow);
      renderCardPreview(currentStatBlockCharId);
    });
    container.appendChild(row);
  });
}

_$('sb-create-btn').addEventListener('click', async () => {
  if(!selectedId || !nodes[selectedId]) return;
  const newId = 'npc_' + Date.now();
  const blank = {
    id: newId,
    name: nodes[selectedId].name || 'Unnamed',
    class: '', species: '', subclass: '',
    combat: { ac: 10, hp_current: 10, hp_max: 10, speed: 30, temp_hp: 0 },
    stats: { str:10, dex:10, con:10, int:10, wis:10, cha:10 },
    senses: { passive_perception: 10 },
    attacks: [],
    text_blocks: { features_traits: '' },
  };
  await set(ref(db, `characters/npcs/${newId}`), blank);
  updateNode(selectedId, { linkedCharacterId: newId, linkedCharacterType: 'npc' });
});

_$('sb-add-action').addEventListener('click', () => {
  if(!currentStatBlockCharId) return;
  const attacksNow = [...(currentStatBlockData.attacks || []), { name:'', to_hit:'', damage:'', notes:'' }];
  currentStatBlockData.attacks = attacksNow;
  renderActionRows(attacksNow);
  update(ref(db, statBlockPath()), { attacks: attacksNow });
  renderCardPreview(currentStatBlockCharId);
});

_$('ctx-name').addEventListener('blur', e => {
  if(!selectedId) return;
  updateNode(selectedId, { name: e.target.textContent.trim() || 'Unnamed' });
});
_$('ctx-notes').addEventListener('input', e => {
  if(!selectedId) return;
  updateNode(selectedId, { notes: e.target.value });
});
_$('ctx-map-url').addEventListener('blur', e => {
  if(!selectedId) return;
  setMapUrl(selectedId, e.target.value.trim());
});
_$('ctx-map-url').addEventListener('keydown', e => {
  if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); }
});
function submitAttachUrl(){
  if(!selectedId) return;
  const input = _$('ctx-attach-url');
  const url = input.value.trim();
  if(!url) return;
  addAttachmentUrl(selectedId, url);
  input.value = '';
}
_$('ctx-attach-add').addEventListener('click', submitAttachUrl);
_$('ctx-attach-url').addEventListener('keydown', e => {
  if(e.key === 'Enter'){ e.preventDefault(); submitAttachUrl(); }
});
_$('ctx-delete').addEventListener('click', () => {
  if(!selectedId) return;
  if(confirm('Remove this bubble and its connections?')){
    deleteNode(selectedId);
    selectedId = null;
    closeInspector();
  }
});

// close the context menu when clicking outside of it (but not when clicking a bubble, handled separately)
_root.addEventListener('mousedown', e => {
  if(ctxMenu.style.display !== 'block') return;
  if(ctxMenu.contains(e.target)) return;
  if(e.target.closest && e.target.closest('.bubble')) return;
  selectedId = null; closeInspector(); renderAll();
});

/* ---------------- link label prompt ---------------- */
const linkPrompt = _$('link-prompt');
const linkLabelInput = _$('link-label-input');
const linkSuggestions = _$('link-suggestions');
let promptCtx = null; // {mode:'new', from, to} or {mode:'edit', edgeId}

function positionPromptAtWorld(wx, wy){
  const rect = canvasWrap.getBoundingClientRect();
  const screenX = rect.left + wx*scale + panX;
  const screenY = rect.top + wy*scale + panY + 56;
  linkPrompt.style.left = Math.min(screenX, window.innerWidth-240) + 'px';
  linkPrompt.style.top = Math.min(screenY, window.innerHeight-100) + 'px';
}

function buildSuggestions(){
  linkSuggestions.innerHTML = '';
  ROLE_SUGGESTIONS.forEach(r => {
    const s = document.createElement('span');
    s.textContent = r;
    s.addEventListener('click', () => { linkLabelInput.value = r; commitPrompt(); });
    linkSuggestions.appendChild(s);
  });
}
buildSuggestions();

function openLinkPromptForNewEdge(from, to){
  promptCtx = { mode:'new', from, to };
  const a = bubbleCenter(from), b = bubbleCenter(to);
  positionPromptAtWorld((a.x+b.x)/2, (a.y+b.y)/2);
  linkPrompt.style.display = 'block';
  linkLabelInput.value = '';
  linkLabelInput.focus();
}

function openLinkPrompt(edgeId, e, cx, cy){
  promptCtx = { mode:'edit', edgeId };
  positionPromptAtWorld(cx, cy);
  linkPrompt.style.display = 'block';
  linkLabelInput.value = e.role || '';
  linkLabelInput.focus();
  linkLabelInput.select();
}

function commitPrompt(){
  const val = linkLabelInput.value.trim() || 'related';
  if(promptCtx?.mode === 'new'){
    createEdge(promptCtx.from, promptCtx.to, val);
  } else if(promptCtx?.mode === 'edit'){
    updateEdgeRole(promptCtx.edgeId, val);
  }
  closePrompt();
}
function closePrompt(){
  linkPrompt.style.display = 'none';
  promptCtx = null;
}
linkLabelInput.addEventListener('keydown', e => {
  if(e.key === 'Enter') commitPrompt();
  if(e.key === 'Escape') closePrompt();
});
_root.addEventListener('mousedown', e => {
  if(linkPrompt.style.display === 'block' && !linkPrompt.contains(e.target)) closePrompt();
});

/* ---------------- create-bubble form ---------------- */
const createForm = _$('create-form');
const cfName = _$('cf-name');
const cfTag = _$('cf-tag');
const cfNotes = _$('cf-notes');
const cfSuggestions = _$('cf-suggestions');
let pendingCreatePos = null; // world {x,y} for the pin drop point
let pendingLinkedChar = null; // {id, type: 'npc'|'pc'} when a suggestion has been picked

/* ---------------- VTT lookup autocomplete — tag-aware: NPCs, PCs, and maps/locations ---------------- */
let vttLookups = { npc: [], pc: [], place: [] }; // {id, name, type}
async function loadVttLookups(){
  try{
    const [npcSnap, pcSnap, mapsSnap] = await Promise.all([
      get(ref(db, 'characters/npcs')),
      get(ref(db, 'characters/pcs')),
      get(ref(db, 'maps')),
    ]);
    vttLookups.npc = npcSnap.exists()
      ? Object.entries(npcSnap.val()).map(([id, c]) => ({ id, name: c.name || id, type: 'npc' }))
      : [];
    vttLookups.pc = pcSnap.exists()
      ? Object.entries(pcSnap.val()).map(([id, c]) => ({ id, name: c.name || id, type: 'pc' }))
      : [];
    // maps don't have a "name" field of their own — the key IS the map name
    vttLookups.place = mapsSnap.exists()
      ? Object.keys(mapsSnap.val()).map(mapName => ({ id: mapName, name: mapName, type: 'place' }))
      : [];
  } catch(err){
    console.warn('Could not load VTT lookups for autocomplete', err);
    vttLookups = { npc: [], pc: [], place: [] };
  }
}
loadVttLookups();

// which lookup source(s) apply to a given board tag — falls back to searching
// everything when no tag is picked yet, or the tag has no obvious VTT counterpart
function sourcesForTag(tag){
  if(tag === 'person') return ['npc'];
  if(tag === 'pc') return ['pc'];
  if(tag === 'place') return ['place'];
  return ['npc', 'pc', 'place']; // no tag chosen yet — search agnostically across all of them
}

function renderSuggestions(query){
  const q = query.trim().toLowerCase();
  if(!q){ cfSuggestions.style.display = 'none'; return; }
  const sources = sourcesForTag(cfTag.value);
  const pool = sources.flatMap(s => vttLookups[s]);
  const matches = pool.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6);
  if(!matches.length){ cfSuggestions.style.display = 'none'; return; }
  cfSuggestions.innerHTML = '';
  matches.forEach(c => {
    const row = document.createElement('div');
    row.className = 'sugg-row';
    row.innerHTML = `<span class="sugg-name">${c.name}</span><span class="sugg-tag">${c.type}</span>`;
    row.addEventListener('mousedown', e => {
      e.preventDefault(); // keep focus in the name field, don't blur before we read it
      cfName.value = c.name;
      pendingLinkedChar = { id: c.id, type: c.type };
      // auto-pick a sensible tag to match the source, if that tag exists in your tag setup
      if(c.type === 'npc' && tagDefs.person) cfTag.value = 'person';
      else if(c.type === 'pc' && tagDefs.pc) cfTag.value = 'pc';
      else if(c.type === 'place' && tagDefs.place) cfTag.value = 'place';
      cfSuggestions.style.display = 'none';
      cfTag.focus();
    });
    cfSuggestions.appendChild(row);
  });
  cfSuggestions.style.display = 'block';
}

cfName.addEventListener('input', () => {
  pendingLinkedChar = null; // typing further invalidates any previous pick
  renderSuggestions(cfName.value);
});
cfTag.addEventListener('change', () => {
  // re-filter live if there's already text in the name field when the tag changes
  if(cfName.value.trim()) renderSuggestions(cfName.value);
});
cfName.addEventListener('blur', () => {
  setTimeout(() => { cfSuggestions.style.display = 'none'; }, 150);
});

function openCreateForm(worldX, worldY, screenX, screenY){
  pendingCreatePos = { x: worldX, y: worldY };
  pendingLinkedChar = null;
  cfName.value = ''; cfTag.value = ''; cfNotes.value = '';
  cfSuggestions.style.display = 'none';
  createForm.style.display = 'block';
  const menuW = 260;
  let left = screenX, top = screenY;
  if(left + menuW > window.innerWidth - 10) left = window.innerWidth - menuW - 10;
  if(left < 10) left = 10;
  if(top + 300 > window.innerHeight - 10) top = window.innerHeight - 310;
  createForm.style.left = left + 'px';
  createForm.style.top = Math.max(66, top) + 'px';
  setTimeout(() => cfName.focus(), 20);
}

function closeCreateForm(){
  createForm.style.display = 'none';
  cfSuggestions.style.display = 'none';
  pendingCreatePos = null;
  pendingLinkedChar = null;
}

function submitCreateForm(){
  if(!pendingCreatePos) return;
  const id = genId();
  const node = {
    name: cfName.value.trim() || 'Unnamed',
    tag: cfTag.value || '',
    notes: cfNotes.value.trim() || '',
    x: pendingCreatePos.x - 75,
    y: pendingCreatePos.y - 30
  };
  if(pendingLinkedChar){
    node.linkedCharacterId = pendingLinkedChar.id;
    node.linkedCharacterType = pendingLinkedChar.type;
  }
  set(ref(db, `${basePath}/nodes/${id}`), node);
  closeCreateForm();
}

_$('cf-create').addEventListener('click', submitCreateForm);
_$('cf-cancel').addEventListener('click', closeCreateForm);
// Tab through name -> tag -> notes -> create button naturally (default tab order works
// since fields appear in that order in the DOM); Enter in name/tag advances instead of submitting.
cfName.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); cfTag.focus(); } });
cfTag.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); cfNotes.focus(); } });
cfNotes.addEventListener('keydown', e => { if(e.key === 'Enter' && e.ctrlKey){ e.preventDefault(); submitCreateForm(); } });
_root.addEventListener('keydown', e => { if(e.key === 'Escape' && createForm.style.display === 'block') closeCreateForm(); });
_root.addEventListener('mousedown', e => {
  if(createForm.style.display !== 'block') return;
  if(createForm.contains(e.target)) return;
  closeCreateForm();
});

/* ---------------- canvas: create / pan / zoom ---------------- */
canvasWrap.addEventListener('dblclick', e => {
  if(e.target !== canvasWrap && e.target !== world) return;
  const rect = canvasWrap.getBoundingClientRect();
  const wx = (e.clientX - rect.left - panX) / scale;
  const wy = (e.clientY - rect.top - panY) / scale;
  openCreateForm(wx, wy, e.clientX, e.clientY);
});

_$('btn-new').addEventListener('click', () => {
  const rect = canvasWrap.getBoundingClientRect();
  const wx = (rect.width/2 - panX)/scale, wy = (rect.height/2 - panY)/scale;
  openCreateForm(wx, wy, rect.left + rect.width/2 - 130, rect.top + rect.height/2 - 100);
});

/* middle-click: pan. left-click on empty canvas + drag: marquee select. */
let isPanning = false, panStartX, panStartY, panOrigX, panOrigY;
let isMarquee = false, marqueeStartX, marqueeStartY, marqueeMoved = false;
const marqueeEl = _$('marquee');

canvasWrap.addEventListener('mousedown', e => {
  if(e.target !== canvasWrap && e.target !== world) return;

  if(e.button === 1){ // middle click -> pan
    e.preventDefault();
    isPanning = true;
    canvasWrap.classList.add('panning');
    panStartX = e.clientX; panStartY = e.clientY;
    panOrigX = panX; panOrigY = panY;
    return;
  }

  if(e.button === 0){ // left click on empty space -> marquee select
    isMarquee = true;
    marqueeMoved = false;
    marqueeStartX = e.clientX; marqueeStartY = e.clientY;
    marqueeEl.style.left = marqueeStartX + 'px';
    marqueeEl.style.top = marqueeStartY + 'px';
    marqueeEl.style.width = '0px';
    marqueeEl.style.height = '0px';
    marqueeEl.style.display = 'block';
    if(!e.shiftKey){
      selectedIds.clear();
    }
  }
});

canvasWrap.addEventListener('contextmenu', e => {
  // avoid the browser's paste/context menu interfering with middle-click drag habits
});
canvasWrap.addEventListener('mouseup', e => { if(e.button === 1) e.preventDefault(); });

_root.addEventListener('mousemove', e => {
  if(isPanning){
    panX = panOrigX + (e.clientX - panStartX);
    panY = panOrigY + (e.clientY - panStartY);
    applyTransform();
    return;
  }
  if(isMarquee){
    const x1 = Math.min(marqueeStartX, e.clientX), x2 = Math.max(marqueeStartX, e.clientX);
    const y1 = Math.min(marqueeStartY, e.clientY), y2 = Math.max(marqueeStartY, e.clientY);
    if(x2-x1 > 3 || y2-y1 > 3) marqueeMoved = true;
    marqueeEl.style.left = x1 + 'px'; marqueeEl.style.top = y1 + 'px';
    marqueeEl.style.width = (x2-x1) + 'px'; marqueeEl.style.height = (y2-y1) + 'px';

    // live-highlight bubbles under the marquee
    world.querySelectorAll('.bubble').forEach(el => {
      const r = el.getBoundingClientRect();
      const intersects = !(r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2);
      const id = el.dataset.id;
      const inSet = selectedIds.has(id);
      el.classList.toggle('multi-selected', intersects || inSet);
    });
  }
});

_root.addEventListener('mouseup', e => {
  isPanning = false;
  canvasWrap.classList.remove('panning');

  if(isMarquee){
    isMarquee = false;
    marqueeEl.style.display = 'none';
    const x1 = parseFloat(marqueeEl.style.left), y1 = parseFloat(marqueeEl.style.top);
    const x2 = x1 + parseFloat(marqueeEl.style.width), y2 = y1 + parseFloat(marqueeEl.style.height);
    world.querySelectorAll('.bubble').forEach(el => {
      const r = el.getBoundingClientRect();
      const intersects = !(r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2);
      if(intersects) selectedIds.add(el.dataset.id);
    });
    renderAll();
  }
});

canvasWrap.addEventListener('click', e => {
  if(marqueeMoved){ marqueeMoved = false; return; }
  if(e.target === canvasWrap || e.target === world){
    if(selectedId){ selectedId = null; closeInspector(); }
    if(selectedIds.size){ selectedIds.clear(); }
    renderAll();
  }
});

function applyTransform(){
  world.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  _$('zoom-pct').textContent = Math.round(scale*100) + '%';
}
_$('btn-zoom-in').addEventListener('click', () => { scale = Math.min(2, scale+0.1); applyTransform(); });

_$('btn-reset').addEventListener('click', async () => {
  const typed = prompt(`This wipes every bubble, link, and custom tag in the "${campaignId}" campaign. This cannot be undone.\n\nType the campaign name (${campaignId}) to confirm:`);
  if(typed !== campaignId){
    if(typed !== null) alert('Name didn\'t match — nothing was deleted.');
    return;
  }
  await Promise.all([ remove(nodesRef), remove(edgesRef), remove(tagDefsRef) ]);
  selectedId = null; selectedIds.clear();
  closeInspector();
  toast_ok();
  function toast_ok(){ alert('Board wiped. Reload the page to reseed default tags, or start adding bubbles fresh.'); }
});

_$('btn-reset').addEventListener('click', async () => {
  const typed = prompt(
    `This permanently deletes every bubble, connection, and custom tag in the "${campaignId}" campaign.\n\n` +
    `Type the campaign name (${campaignId}) to confirm:`
  );
  if(typed !== campaignId){
    if(typed !== null) alert('Name didn\'t match — nothing was deleted.');
    return;
  }
  await Promise.all([
    remove(nodesRef),
    remove(edgesRef),
    remove(tagDefsRef),
  ]);
  selectedId = null; selectedIds.clear();
  closeInspector();
  // tagDefs onValue listener will reseed DEFAULT_TAGS automatically since the path is now empty
  alert('Board reset. Default tags will reseed automatically.');
});
_$('btn-zoom-out').addEventListener('click', () => { scale = Math.max(0.3, scale-0.1); applyTransform(); });

canvasWrap.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvasWrap.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const wx = (mx - panX)/scale, wy = (my - panY)/scale;
  scale = Math.min(2, Math.max(0.3, scale + (e.deltaY < 0 ? 0.08 : -0.08)));
  panX = mx - wx*scale; panY = my - wy*scale;
  applyTransform();
}, { passive:false });

// center the view roughly
panX = 200; panY = 150; applyTransform();


  // ── Sort board into Who / What / Where / When ────────────────────────────────
  function sortBoard(){
    const COLUMNS = [
      { tags:['person','pc'],             x:120  },
      { tags:['object','plan','faction'],  x:420  },
      { tags:['place'],                    x:720  },
      { tags:['event','campaign'],         x:1020 },
      { tags:[],                           x:1320 },
    ];
    const groups = COLUMNS.map(c => ({ ...c, items:[] }));
    Object.entries(nodes).forEach(([id, n]) => {
      const ci = COLUMNS.findIndex(c => c.tags.includes(n.tag));
      groups[ci === -1 ? 4 : ci].items.push({ id, name: n.name||'' });
    });
    groups.forEach(g => g.items.sort((a,b) => a.name.localeCompare(b.name)));
    const promises = [];
    groups.forEach(g => g.items.forEach((item,i) => {
      promises.push(update(ref(db, basePath + '/nodes/' + item.id), { x: g.x, y: 80 + i * 200 }));
    }));
    Promise.all(promises);
  }
  if(_$('btn-sort')) _$('btn-sort').addEventListener('click', sortBoard);

    // ── Expose selectNode for cross-view navigation ──────────────────────────
  container._selectNode = function(id) {
    const el = container.querySelector(`.bubble[data-id="${id}"]`);
    if (el) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  };
  container.addEventListener('board:select', e => container._selectNode(e.detail.id));

  // ── Return cleanup function ───────────────────────────────────────────────
  // Unsubscribe Firebase listeners when view is destroyed
  // (Firebase onValue returns an unsubscribe fn)
  return function destroy() {
    container.innerHTML = '';
  };
}
