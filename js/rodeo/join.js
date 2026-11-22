// Page-load "Join the table" card: who you are (players), camera / mic, then it opens the video dock.
// The browser's own camera + mic permission prompt appears as the dock opens. Add ?nojoin to the address to skip this card.
// Sets the same "Me" character the Me button does, so your call name matches your token (see talk.js).
import { S } from "./state.js";

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const store = { get: (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* fine */ } } };

export function initJoin({ loadPcs, setMe, getMe }) {
  if (new URLSearchParams(location.search).has("nojoin")) return;
  const select = el("select", { id: "join-who" }, el("option", { value: "", textContent: "Loading characters…" }));
  const anyName = el("input", { id: "join-name", type: "text", maxLength: 24, placeholder: "Your name", value: store.get("geez.videochat.name"), hidden: true });
  const cam = el("input", { type: "checkbox", checked: true }), mic = el("input", { type: "checkbox", checked: true });
  const joinBtn = el("button", { type: "submit", id: "join-go", textContent: "Join the table" });
  const skipBtn = el("button", { type: "button", id: "join-skip", className: "ghost", textContent: "Skip video" });
  const who = S.isGM ? el("p", { className: "join-gm", textContent: "You're the GM." })
    : el("label", {}, el("span", { textContent: "Who are you?" }), select, anyName);
  const card = el("form", { id: "joincard" },
    el("h2", { textContent: "Join the table" }), who,
    el("div", { className: "join-opts" }, el("label", {}, cam, " Camera"), el("label", {}, mic, " Microphone")),
    el("p", { className: "join-note", textContent: "Your browser will ask to use your camera and microphone." }),
    el("div", { className: "join-btns" }, joinBtn, skipBtn));
  const overlay = el("div", { id: "joinoverlay" }, card);
  document.body.append(overlay);
  const close = () => overlay.remove();

  if (!S.isGM) loadPcs().then((list) => {
    const mine = getMe();
    select.replaceChildren(...list.filter((c) => c.name).map((c) => el("option", { value: c.id, textContent: c.name, selected: mine?.id === c.id })), el("option", { value: "", textContent: "Someone else (type a name)", selected: !!mine && !list.some((c) => c.id === mine.id) }));
    sync();
  });
  const sync = () => { anyName.hidden = S.isGM || select.value !== "" || !select.options.length || select.options[0].textContent.startsWith("Loading"); };
  select.addEventListener("change", sync);

  card.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!S.isGM) {
      const opt = select.selectedOptions[0];
      if (select.value) setMe({ id: select.value, name: opt.textContent });
      else { setMe(null); if (anyName.value.trim()) store.set("geez.videochat.name", anyName.value.trim()); }
    }
    close();
    window.geezOpenChat?.({ cam: cam.checked, mic: mic.checked });
  });
  skipBtn.addEventListener("click", close);
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); }, { once: true });
  joinBtn.focus();
}
