// Table Chat: the video call (videochat.html) in a standard VTT floating window, so it drags, snaps and remembers its place like the Build windows.
// The Chat button toggles it; the page-load join card (join.js) opens it via window.geezOpenChat({ cam, mic }).
// Closing the window (x or the Chat button) leaves the call: the page inside unloads, which stops camera + mic and removes you from the room. Opening it again rejoins.
import { floatWindow } from "./ui.js";

const CHAT_ROOM = "geez-table";   // fixed room name: everyone on the VTT lands in the same call (override with ?room=)

export function initChatDock() {
  const qs = new URLSearchParams(location.search), room = qs.get("room") || CHAT_ROOM;
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* fine */ } };
  // GM (?gm) joins as "GM"; players use ?name=, else their VTT "Me" character (so the call name matches their token), else the name they typed last time.
  const myName = () => {
    if (qs.has("gm")) return "GM";
    let me = null; try { me = JSON.parse(localStorage.getItem("vtt-me")); } catch { /* none */ }
    return qs.get("name") || me?.name || get("geez.videochat.name") || "";
  };

  const win = floatWindow({ id: "chat", title: "Table Chat", x: Math.max(8, innerWidth - 360), y: 44, hidden: true });
  const frame = document.createElement("iframe"); frame.title = "Table Chat";
  frame.allow = "camera; microphone; autoplay; display-capture; fullscreen; speaker-selection";
  win.body.append(frame);
  let loaded = false, opts = {};

  try { const r = JSON.parse(get("geez.chatwin.size") || "null"); if (r?.w >= 240) win.el.style.width = r.w + "px"; if (r?.h >= 180) win.el.style.height = r.h + "px"; } catch { /* default size */ }
  new ResizeObserver(() => { if (!win.el.hidden) set("geez.chatwin.size", JSON.stringify({ w: Math.round(win.el.offsetWidth), h: Math.round(win.el.offsetHeight) })); }).observe(win.el);

  function show() {
    if (!loaded) {   // loaded once; stays mounted so the call survives hiding
      loaded = true;
      const n = myName();
      frame.src = "videochat.html?room=" + encodeURIComponent(room) + (n ? "&name=" + encodeURIComponent(n) + "&autojoin=1" : "")
        + (qs.get("fake") ? "&fake=" + encodeURIComponent(qs.get("fake")) : "") + (opts.cam === false ? "&cam=0" : "") + (opts.mic === false ? "&mic=0" : "");   // autojoin: no join form, camera + mic requested straight away
    }
    win.show();
  }
  const disconnect = () => { win.hide(); loaded = false; frame.src = "about:blank"; };   // unloading the call page stops the camera/mic and drops you from the room
  win.el.addEventListener("fwin-close", disconnect);
  document.getElementById("chat-btn")?.addEventListener("click", () => (win.visible() ? disconnect() : show()));
  window.geezOpenChat = (o) => { opts = o || {}; show(); };
  addEventListener("message", (e) => {   // the Leave icon inside the call does the same as the x
    if (e.origin === location.origin && e.data?.geezChat === "left") disconnect();
  });
}
