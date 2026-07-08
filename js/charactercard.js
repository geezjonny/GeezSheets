// charactercard.js — builds a D&D 5e character card (the same one index.html
// shows for the whole party) and wires up its HP/spell-slot/panel
// interactions. Pure data + a DOM-building function, so both index.html
// (renders every PC) and mapeditor.html (renders one PC in a popup when you
// right-click their token) can share the exact same card and the exact same
// "heal/damage updates Firebase" logic instead of two divergent copies.

export const SKILLS = [
  {key:"acrobatics",label:"Acrobatics",stat:"dex"},
  {key:"animal_handling",label:"Animal Handling",stat:"wis"},
  {key:"arcana",label:"Arcana",stat:"int"},
  {key:"athletics",label:"Athletics",stat:"str"},
  {key:"deception",label:"Deception",stat:"cha"},
  {key:"history",label:"History",stat:"int"},
  {key:"insight",label:"Insight",stat:"wis"},
  {key:"intimidation",label:"Intimidation",stat:"cha"},
  {key:"investigation",label:"Investigation",stat:"int"},
  {key:"medicine",label:"Medicine",stat:"wis"},
  {key:"nature",label:"Nature",stat:"int"},
  {key:"perception",label:"Perception",stat:"wis"},
  {key:"performance",label:"Performance",stat:"cha"},
  {key:"persuasion",label:"Persuasion",stat:"cha"},
  {key:"religion",label:"Religion",stat:"int"},
  {key:"sleight_of_hand",label:"Sleight of Hand",stat:"dex"},
  {key:"stealth",label:"Stealth",stat:"dex"},
  {key:"survival",label:"Survival",stat:"wis"},
];

export const ABILITY_KEYS = ["str","dex","con","int","wis","cha"];
export const ABILITY_LABELS = {str:"STR",dex:"DEX",con:"CON",int:"INT",wis:"WIS",cha:"CHA"};

import { loadClasses, loadClassLevels, loadSpells, loadRaces, loadTraits, loadEquipment, getSpellSlots, getClassResources, calcProficiencyBonus, matchRace, getRaceTraits, findEquipmentByName } from "./srd.js";

export function mod(s){const m=Math.floor((s-10)/2);return(m>=0?"+":"")+m;}
export function fmtBonus(n){return(n>=0?"+":"")+n;}
export function parseBonus(v){return parseInt(String(v).replace(/[^0-9\-]/g,""),10)||0;}
export function hpColor(cur,max){if(!max)return"#4a7fe8";const p=cur/max;if(p>.5)return"#10b981";if(p>.25)return"#f59e0b";return"#ef4444";}
export function spellLevelLabel(lvl){if(lvl===0)return"Cantrip";const s=["th","st","nd","rd","th","th","th","th","th","th"][lvl]||"th";return lvl+s;}
export function esc(str){return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/** Builds the full character card as a DOM element. Pure given `char` data
 *  -- no Firebase access here. The card's buttons call window.togglePanel /
 *  window.toggleSlot / window.adjustHp via inline onclick (so the generated
 *  HTML is self-contained and portable, e.g. into a popup's innerHTML);
 *  call wireCharacterCardHandlers() once per page to make those work. */
export function buildCard(char, { showBuildPanel = true } = {}) {
  const c=char.combat||{}, st=char.stats||{}, sp=char.spellcasting||null, sk=char.skills||{};
  const saves=char.saves||{}, senses=char.senses||{}, equipped=char.equipped||{};
  const inventory=char.inventory||{}, coinPurse=char.coin_purse||{};
  const abilities=char.abilities||{};
  const conds=(c.conditions||[]);
  const hpCur=c.hp_current??0, hpMax=c.hp_max??1;
  const hpPct=Math.max(0,Math.min(1,hpCur/hpMax)), tempHp=c.temp_hp??0;
  const initBonus=c.initiative_bonus??Math.floor(((st.dex??10)-10)/2);
  const profBonus=c.proficiency_bonus??calcProficiencyBonus(char.level??1);
  const passPerc=senses.passive_perception??(10+Math.floor(((st.wis??10)-10)/2));
  const subLine=`Lv ${char.level??'?'} ${char.class||''}${char.subclass?` (${char.subclass})`:''} · ${char.species||''} ${char.background?`· ${char.background}`:''}`;
  const combatRole=char.combat_role||'';

  // ── Ability scores ────────────────────────────────────────────────────────
  const abilityBoxes=ABILITY_KEYS.map(k=>{
    const score=st[k]??10;
    return`<div class="ab-box"><div class="ab-name">${ABILITY_LABELS[k]}</div><div class="ab-score">${score}</div><div class="ab-mod">${mod(score)}</div></div>`;
  }).join('');

  // ── Saving throws ─────────────────────────────────────────────────────────
  const profSaves=saves.proficient||[];
  const saveBoxes=ABILITY_KEYS.map(k=>{
    const bonus=saves[k]??Math.floor(((st[k]??10)-10)/2)+(profSaves.includes(k)?profBonus:0);
    const isProficient=profSaves.includes(k);
    return`<div class="save-item${isProficient?' save-prof':''}">
      <div class="save-dot">${isProficient?'●':'○'}</div>
      <div class="save-label">${ABILITY_LABELS[k]}</div>
      <div class="save-val">${fmtBonus(bonus)}</div>
    </div>`;
  }).join('');

  // ── Senses ────────────────────────────────────────────────────────────────
  const senseItems=[];
  if(senses.darkvision>0)senseItems.push(`Darkvision ${senses.darkvision} ft`);
  if(senses.blindsight>0)senseItems.push(`Blindsight ${senses.blindsight} ft`);
  if(senses.tremorsense>0)senseItems.push(`Tremorsense ${senses.tremorsense} ft`);
  if(senses.truesight>0)senseItems.push(`Truesight ${senses.truesight} ft`);
  senseItems.push(`Passive Perception ${senses.passive_perception||passPerc}`);
  if(senses.passive_insight>0)senseItems.push(`Passive Insight ${senses.passive_insight}`);
  if(senses.passive_investigation>0)senseItems.push(`Passive Investigation ${senses.passive_investigation}`);
  const sensesHtml=senseItems.map(s=>`<div class="sense-item">${s}</div>`).join('');

  // ── Combat stats row ──────────────────────────────────────────────────────
  const deathFail=c.death_save_failures??0, deathSucc=c.death_save_successes??0;
  const exhaustion=c.exhaustion??0;
  const hitDice=c.hit_dice||(char.level?`${char.level}d?`:'—');
  const speed=c.speed??30;

  // ── Conditions ────────────────────────────────────────────────────────────
  const condPills=conds.map(cd=>`<div class="cond-pill">${cd}</div>`).join('');

  // ── Abilities (class features, channel divinity, etc.) ────────────────────
  const ACTIVATION_LABELS={action:'Action',bonus_action:'Bonus Action',reaction:'Reaction',none:'Passive',save:'Action (Save)'};
  const RECHARGE_LABELS={long_rest:'Long Rest',short_or_long_rest:'Short/Long Rest',short_rest:'Short Rest',none:'',at_will:'At Will'};
  const abilitiesHtml=Object.values(abilities).map(ab=>{
    const act=ACTIVATION_LABELS[ab.activation]||ab.activation||'';
    const rech=RECHARGE_LABELS[ab.recharge]||ab.recharge||'';
    const kind=ab.kind||'';
    const hasPips=kind==='charge'&&(ab.max??0)>0;
    const pips=hasPips?`<div class="ab-pips">${Array.from({length:ab.max??1},(_,i)=>`<div class="ab-pip${i<(ab.current??ab.max??1)?'':' used'}"></div>`).join('')}</div>`:'';
    const meta=[act,ab.die?`${ab.die}`:null,rech].filter(Boolean).join(' · ');
    const dc=ab.save_dc>0?`<span class="ab-dc">DC ${ab.save_dc} ${(ab.save_stat||'').toUpperCase()}</span>`:'';
    return`<div class="ab-item">
      <div class="ab-header">
        <span class="ab-name">${ab.label||''}</span>
        ${dc}
        ${meta?`<span class="ab-meta">${meta}</span>`:''}
      </div>
      ${pips}
      <div class="ab-desc">${esc(ab.effect_desc||'')}</div>
    </div>`;
  }).join('');

  // ── Skills ────────────────────────────────────────────────────────────────
  const skillRowsHtml=SKILLS.map(s=>{
    const data=sk[s.key]||{};
    const base=Math.floor(((st[s.stat]??10)-10)/2);
    const bonus=data.bonus??base+(data.proficient?profBonus:0)+(data.expertise?profBonus:0);
    const cls=data.expertise?'expert':data.proficient?'prof':'';
    return`<div class="skill-row-item ${cls}"><span class="skill-dot">${data.expertise?'◆':data.proficient?'●':'○'}</span><span class="skill-name">${s.label}</span><span class="skill-val">${fmtBonus(bonus)}</span></div>`;
  }).join('');

  // ── Weapons ────────────────────────────────────────────────────────────────
  const attacks=char.attacks||[];
  const weaponMasteries=char.weapon_masteries||[];
  const weaponItems=attacks.map(a=>{
    const atkBonus=a.to_hit!=null&&a.to_hit!==''?fmtBonus(parseBonus(a.to_hit)):(a.attack_bonus!=null?fmtBonus(parseBonus(a.attack_bonus)):'—');
    const dmgFull=a.damage||a.damage_dice||'—';
    const dmgType=a.damage_type||'';
    const range=a.range||null;
    const notes=[a.properties,a.notes].filter(Boolean).join(' · ');
    const isMastered=weaponMasteries.some(m=>a.name?.toLowerCase().includes(m.toLowerCase())||m.toLowerCase().includes(a.name?.toLowerCase()||''));
    return`<div class="weapon-item">
      <div class="weapon-top">
        <div class="weapon-name">${a.name||'Unnamed'}${isMastered?'<span class="mastery-badge">Mastery</span>':''}</div>
        ${dmgType?`<div class="weapon-type">${dmgType}</div>`:''}
      </div>
      <div class="weapon-stats">
        <div class="wstat"><div class="wstat-label">Attack</div><div class="wstat-val">${atkBonus}</div></div>
        <div class="wstat"><div class="wstat-label">Damage</div><div class="wstat-val">${dmgFull}</div></div>
        ${range?`<div class="wstat"><div class="wstat-label">Range</div><div class="wstat-val">${range}</div></div>`:''}
      </div>
      ${notes?`<div class="weapon-notes">${notes}</div>`:''}
    </div>`;
  }).join('');

  // ── Spells ─────────────────────────────────────────────────────────────────
  let spellPanelHtml='', hasSpells=false;
  if(sp){
    const spMetaHtml=[
      sp.ability?`Ability: <span>${sp.ability.toUpperCase()}</span>`:null,
      sp.spell_save_dc?`DC <span>${sp.spell_save_dc}</span>`:null,
      sp.spell_attack_bonus!=null?`Atk <span>${fmtBonus(sp.spell_attack_bonus)}</span>`:null,
    ].filter(Boolean).map(s=>`<div class="sp-meta-item">${s}</div>`).join('');
    let slotRowsHtml='';
    for(let lvl=1;lvl<=9;lvl++){
      const maxS=sp.slots?.[String(lvl)]??sp.slots?.[lvl]??0;if(!maxS)continue;
      const usedS=sp.slots_used?.[String(lvl)]??sp.slots_used?.[lvl]??0;
      let pips='';
      for(let i=0;i<maxS;i++)pips+=`<div class="slot-pip${i<usedS?' used':''}" data-charid="${char.id}" data-lvl="${lvl}" data-idx="${i}" data-max="${maxS}" onclick="window.toggleSlot(this)"></div>`;
      slotRowsHtml+=`<div class="slot-level-row"><div class="slot-level-label">${spellLevelLabel(lvl)}</div><div class="slot-pips">${pips}</div></div>`;
    }
    const spells=sp.spells||[];
    const cantrips=spells.filter(s=>s.prepared_type==='cantrip'||s.level===0);
    const prepared=spells.filter(s=>s.prepared_type!=='cantrip'&&s.level!==0);
    const spellTipHtml=spell=>spell.beginner_tip?`<div class="spell-tip"><span class="spell-tip-icon">✦</span><span class="spell-tip-text">${esc(spell.beginner_tip)}</span></div>`:'';
    const cantripHtml=cantrips.map((s,i)=>`<div class="spell-item" data-spell="${esc(s.name||'')}" id="spell-item-${char.id}-c${i}">
      <div class="spell-item-top"><span class="spell-name">${s.name}</span><span class="spell-level-tag">Cantrip</span></div>
      ${spellTipHtml(s)}
    </div>`).join('');
    const preparedHtml=prepared.map((s,i)=>`<div class="spell-item" data-spell="${esc(s.name||'')}" id="spell-item-${char.id}-p${i}">
      <div class="spell-item-top"><span class="spell-name">${s.name}</span><span class="spell-level-tag">${spellLevelLabel(s.level||1)}</span></div>
      ${spellTipHtml(s)}
    </div>`).join('');
    hasSpells=!!(cantrips.length||prepared.length||slotRowsHtml);
    spellPanelHtml=`<div class="expand-panel" id="sp-${char.id}">
      ${spMetaHtml?`<div class="sp-meta">${spMetaHtml}</div>`:''}
      ${slotRowsHtml?`<div class="slot-levels">${slotRowsHtml}</div>`:''}
      ${cantrips.length?`<div class="sp-section-title" style="margin-top:0">Cantrips</div><div class="spell-list">${cantripHtml}</div>`:''}
      ${prepared.length?`<div class="sp-section-title">Prepared Spells</div><div class="spell-list">${preparedHtml}</div>`:''}
      ${!cantrips.length&&!prepared.length?`<div class="empty-panel">No spells recorded.</div>`:''}
    </div>`;
  }

  // ── Inventory ─────────────────────────────────────────────────────────────
  // Normalize: inventory can be object {key:{name,qty,category,desc}} or array [{name,qty,...}]
  const inventoryList=Array.isArray(inventory)?inventory:Object.values(inventory);
  const ITEM_CAT_ICONS={weapon:'⚔',armor:'🛡',gear:'🎒',potion:'🧪',magic:'✨',tool:'🔧'};
  const inventoryRows=inventoryList.map(item=>{
    const icon=ITEM_CAT_ICONS[item.category]||'📦';
    const isEquipped=(equipped.armor&&item.name&&equipped.armor.toLowerCase()===item.name.toLowerCase())||
      (equipped.shield&&item.name?.toLowerCase()==='shield');
    return`<div class="inv-item${isEquipped?' inv-equipped':''}">
      <div class="inv-icon">${icon}</div>
      <div class="inv-info">
        <div class="inv-name">${item.name||'Item'}${isEquipped?' <span class="inv-badge">equipped</span>':''}</div>
        ${item.desc?`<div class="inv-desc">${esc(item.desc)}</div>`:''}
      </div>
      <div class="inv-qty">${item.qty>1?`×${item.qty}`:''}</div>
    </div>`;
  }).join('');

  // ── Coin purse ─────────────────────────────────────────────────────────────
  const COIN_ORDER=[['pp','Platinum'],['gp','Gold'],['ep','Electrum'],['sp','Silver'],['cp','Copper']];
  const coinsHtml=COIN_ORDER.map(([k,label])=>`<div class="coin-cell">
    <div class="coin-label">${label}</div>
    <div class="coin-input-wrap"><input class="coin-input" type="number" min="0" value="${coinPurse[k]??0}" data-charid="${char.id}" data-coin="${k}" onchange="window.updateCoin(this)"></div>
  </div>`).join('');

  // ── Racial traits panel (populated async by populateRacialTraits) ───────────
  const racialTraitsPanelHtml=`<div class="expand-panel" id="rt-${char.id}">
    <div class="racial-traits-list" id="rt-list-${char.id}">
      <div class="empty-panel">Loading racial traits…</div>
    </div>
  </div>`;

  // ── Notes panel (editable by player) ──────────────────────────────────────
  const notesText=char.text_blocks?.notes||'';
  const notesPanelHtml=`<div class="expand-panel" id="nt-${char.id}">
    <textarea class="notes-area" id="notes-area-${char.id}" placeholder="Notes…" onblur="window.saveNotes('${char.id}',this.value)">${esc(notesText)}</textarea>
  </div>`;

  // ── Proficiencies/languages panel ─────────────────────────────────────────
  const profText=char.text_blocks?.proficiencies_languages||'';
  const featuresText=char.text_blocks?.features_traits||'';
  const originFeat=char.origin_feat||'';
  const abilityCards=Object.entries(char.abilities||{}).map(([,ab])=>{
    if(!ab||!ab.label)return'';
    return`<div class="feat-item"><div class="feat-name">${ab.label}</div>${ab.effect_desc?`<div class="feat-desc">${esc(ab.effect_desc)}</div>`:''}</div>`;
  }).join('');
  const featuresBlock=featuresText?`<div class="feat-item"><div class="feat-desc" style="white-space:pre-wrap">${featuresText}</div></div>`:'';
  const profBlock=profText?`<div class="sp-section-title">Proficiencies &amp; Languages</div><div class="feat-item"><div class="feat-desc" style="white-space:pre-wrap">${profText}</div></div>`:'';
  const originFeatBlock=originFeat?`<div class="sp-section-title">Origin Feat</div><div class="feat-item"><div class="feat-name">${originFeat}</div></div>`:'';
  const skillPanelHtml=`<div class="expand-panel" id="sk-${char.id}">
    <div class="sp-section-title" style="margin-top:0">Skills</div>
    <div class="skill-grid">${skillRowsHtml}</div>
    <div class="sp-section-title">Saving Throws</div>
    <div class="save-grid">${saveBoxes}</div>
    ${originFeatBlock}
    ${abilityCards||featuresBlock?`<div class="sp-section-title">Features &amp; Traits</div>${abilityCards}${featuresBlock}`:''}
    ${profBlock}
  </div>`;

  // ── Combat Guide panel ─────────────────────────────────────────────────────
  const hasTip=!!char.beginner_tip;
  const tipPanelHtml=hasTip?`<div class="expand-panel" id="tg-${char.id}">
    <div class="combat-guide-wrap"><div class="combat-guide">${esc(char.beginner_tip)}</div></div>
  </div>`:'';

  // ── Build panel ─────────────────────────────────────────────────────────────
  const buildPanelHtml=showBuildPanel?`<div class="expand-panel" id="bd-${char.id}">
    <div class="sp-section-title" style="margin-top:0">Class &amp; Level</div>
    <div class="build-row">
      <select id="bd-class-${char.id}"><option value="">Loading classes…</option></select>
      <input id="bd-level-${char.id}" type="number" min="1" max="20" value="${char.level||1}" style="width:60px"/>
      <button class="hp-btn heal" onclick="window.previewBuild('${char.id}')">Preview</button>
    </div>
    <div id="bd-preview-${char.id}" class="build-preview"></div>
    <button class="hp-btn heal" id="bd-apply-${char.id}" style="display:none;margin-top:8px" onclick="window.applyBuild('${char.id}')">Apply to Character</button>
    <div style="border-top:1px solid var(--border);margin:12px 0"></div>
    <div class="sp-section-title" style="margin-top:0">Character Data</div>
    <div class="build-row" style="flex-wrap:wrap">
      <button class="hp-btn heal" onclick="window.exportCharacterJSON('${char.id}')">⬇ Export JSON</button>
      <button class="hp-btn heal" onclick="window.triggerImportJSON('${char.id}')">⬆ Import JSON</button>
    </div>
    <input type="file" id="bd-import-${char.id}" accept=".json" style="display:none" onchange="window.importCharacterJSON('${char.id}',this)">
  </div>`:'';

  // ── Assemble card ─────────────────────────────────────────────────────────
  const card=document.createElement('div');
  card.className='card'; card.id=`card-${char.id}`;
  card.innerHTML=`
    <div class="card-header">
      <div class="char-name">${char.name||'Unnamed'}</div>
      <div class="char-sub">${subLine}</div>
      ${char.alignment?`<div class="char-alignment">${char.alignment}</div>`:''}
      ${combatRole?`<div class="char-role-badge">${esc(combatRole)}</div>`:''}
      <div class="hp-row">
        <div class="hp-label">HP</div>
        <div class="hp-bar-wrap"><div class="hp-bar" id="hpbar-${char.id}" style="width:${Math.round(hpPct*100)}%;background:${hpColor(hpCur,hpMax)}"></div></div>
        <div class="hp-val" id="hpval-${char.id}">${hpCur} / ${hpMax}</div>
        ${tempHp?`<div class="temp-badge">+${tempHp} tmp</div>`:''}
      </div>
      <div class="hp-controls">
        <input class="hp-delta" id="hpdelta-${char.id}" type="number" min="1" placeholder="amount"/>
        <button class="hp-btn heal" onclick="window.adjustHp('${char.id}',true)">+ Heal</button>
        <button class="hp-btn dmg"  onclick="window.adjustHp('${char.id}',false)">&#8722; Dmg</button>
      </div>
      <div class="combat-meta-row">
        <div class="cm-cell"><div class="cm-label">AC</div><div class="cm-val">${c.ac??'—'}</div></div>
        <div class="cm-cell"><div class="cm-label">Speed</div><div class="cm-val">${speed}</div></div>
        <div class="cm-cell"><div class="cm-label">Init</div><div class="cm-val">${fmtBonus(initBonus)}</div></div>
        <div class="cm-cell"><div class="cm-label">Prof</div><div class="cm-val">+${profBonus}</div></div>
        <div class="cm-cell"><div class="cm-label">Hit Dice</div><div class="cm-val">${hitDice}</div></div>
        <div class="cm-cell"><div class="cm-label">Perc</div><div class="cm-val">${passPerc}</div></div>
      </div>
      ${exhaustion>0?`<div class="exhaustion-row">Exhaustion: ${exhaustion}</div>`:''}
      ${c.concentration?.active?`<div class="conc-row">⚡ Concentrating: ${c.concentration.spell||'?'}</div>`:''}
      ${(deathFail>0||deathSucc>0)?`<div class="death-row">
        <span class="death-label">Death Saves:</span>
        <span class="death-succ">${'✓'.repeat(deathSucc)}${'○'.repeat(Math.max(0,3-deathSucc))}</span>
        <span class="death-fail">${'✗'.repeat(deathFail)}${'○'.repeat(Math.max(0,3-deathFail))}</span>
      </div>`:''}
    </div>
    <div class="ability-grid">${abilityBoxes}</div>
    ${condPills?`<div class="conditions-row">${condPills}</div>`:''}
    <div class="senses-row">${sensesHtml}</div>
    <div class="card-footer">
      ${hasTip?`<button class="panel-btn tip-btn" id="tgbtn-${char.id}" onclick="window.togglePanel('tg-${char.id}','tgbtn-${char.id}')">
        <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
        Combat Guide
        <svg class="chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>`:''}
      ${attacks.length?`<button class="panel-btn weapon-btn" id="wpbtn-${char.id}" onclick="window.togglePanel('wp-${char.id}','wpbtn-${char.id}')">
        <svg viewBox="0 0 24 24"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M2 2l20 20"/></svg>
        Weapons &amp; Attacks
        <svg class="chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>`:''}
      ${abilitiesHtml?`<button class="panel-btn" id="abbtn-${char.id}" onclick="window.togglePanel('ab-${char.id}','abbtn-${char.id}')">
        <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        Abilities &amp; Features
        <svg class="chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>`:''}
      <button class="panel-btn skill-btn" id="skbtn-${char.id}" onclick="window.togglePanel('sk-${char.id}','skbtn-${char.id}')">
        <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        Skills &amp; Saves
        <svg class="chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      ${hasSpells?`<button class="panel-btn spell-btn" id="spbtn-${char.id}" onclick="window.togglePanel('sp-${char.id}','spbtn-${char.id}')">
        <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        Spells &amp; Cantrips
        <svg class="chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>`:''}
      <button class="panel-btn" id="rtbtn-${char.id}" onclick="window.togglePanel('rt-${char.id}','rtbtn-${char.id}')">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        Racial Traits
        <svg class="chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <button class="panel-btn" id="invbtn-${char.id}" onclick="window.togglePanel('inv-${char.id}','invbtn-${char.id}')">
        <svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        Inventory
        <svg class="chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <button class="panel-btn" id="ntbtn-${char.id}" onclick="window.togglePanel('nt-${char.id}','ntbtn-${char.id}')">
        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Notes
        <svg class="chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      ${showBuildPanel?`<button class="panel-btn build-btn" id="bdbtn-${char.id}" onclick="window.togglePanel('bd-${char.id}','bdbtn-${char.id}')">
        <svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        Build (Class/Level)
        <svg class="chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>`:''}
    </div>
    ${tipPanelHtml}
    <div class="expand-panel" id="wp-${char.id}">
      ${weaponItems?`<div class="weapon-list">${weaponItems}</div>`:`<div class="empty-panel">No attacks recorded.</div>`}
    </div>
    <div class="expand-panel" id="ab-${char.id}">
      ${abilitiesHtml||`<div class="empty-panel">No abilities recorded.</div>`}
    </div>
    ${skillPanelHtml}
    ${spellPanelHtml}
    ${racialTraitsPanelHtml}
    <div class="expand-panel" id="inv-${char.id}">
      ${inventoryRows?`<div class="inv-list">${inventoryRows}</div>`:`<div class="empty-panel">No items recorded.</div>`}
      <div class="coin-purse">${coinsHtml}</div>
    </div>
    ${notesPanelHtml}
    ${buildPanelHtml}`;
  return card;
}



/**
 * Fills the racial traits panel for a card using races.json + traits.json.
 * Call after the card is inserted into the DOM, same async pattern as
 * populateSpellDescriptions. Uses char.species to find the race, then
 * cross-references the race's trait list for full descriptions.
 */
export async function populateRacialTraits(char) {
  const listEl = document.getElementById(`rt-list-${char.id}`);
  if (!listEl) return;
  if (!char.species) { listEl.innerHTML = '<div class="empty-panel">No species recorded.</div>'; return; }
  let races, traits;
  try { [races, traits] = await Promise.all([loadRaces(), loadTraits()]); }
  catch (e) { listEl.innerHTML = '<div class="empty-panel">SRD data unavailable.</div>'; return; }
  const race = matchRace(races, char.species);
  if (!race) { listEl.innerHTML = `<div class="empty-panel">No SRD data for "${esc(char.species)}".</div>`; return; }
  const raceTraits = getRaceTraits(race, traits);
  if (!raceTraits.length) { listEl.innerHTML = `<div class="empty-panel">${esc(race.name)} has no listed traits.</div>`; return; }
  listEl.innerHTML = raceTraits.map(t => {
    const desc = Array.isArray(t.desc) ? t.desc[0] : (t.desc || '');
    return `<div class="feat-item">
      <div class="feat-name">${t.name}</div>
      ${desc ? `<div class="feat-desc">${esc(desc)}</div>` : ''}
    </div>`;
  }).join('');
}

/**
 * Fills in real spell descriptions from spells.json for every spell-item in
 * a card. Call once per card after it's appended to the DOM. Each spell-item
 * has a data-spell="<name>" marker left by buildCard() specifically for this.
 */
export async function populateSpellDescriptions(char) {
  const items = document.querySelectorAll(`#sp-${char.id} .spell-item[data-spell]`);
  if (!items.length) return;
  let spells;
  try { spells = await loadSpells(); }
  catch (e) { return; }
  const byName = new Map(spells.map(s => [s.name.toLowerCase(), s]));
  for (const item of items) {
    if (item.querySelector('.spell-desc')) continue;
    const spell = byName.get((item.dataset.spell || '').toLowerCase());
    if (!spell) continue;
    const text = Array.isArray(spell.desc) ? spell.desc[0] : (spell.desc || '');
    if (!text) continue;
    const top = item.querySelector('.spell-item-top');
    if (top) top.insertAdjacentHTML('afterend', `<div class="spell-desc">${esc(text)}</div>`);
  }
}

export async function initBuilderPanel(char, { db, ref, update }) {
  const classSel = document.getElementById(`bd-class-${char.id}`);
  if (!classSel) return; // card wasn't inserted into the DOM, nothing to wire
  let classes, classLevels;
  try {
    [classes, classLevels] = await Promise.all([loadClasses(), loadClassLevels()]);
  } catch (e) {
    classSel.innerHTML = '<option value="">SRD data unavailable</option>';
    return;
  }
  classSel.innerHTML = '<option value="">Select class…</option>' +
    classes.map(c => `<option value="${c.index}"${char.class?.toLowerCase()===c.name.toLowerCase()?' selected':''}>${c.name}</option>`).join('');

  function compute() {
    const classIndex = classSel.value;
    const level = parseInt(document.getElementById(`bd-level-${char.id}`)?.value, 10) || 1;
    const preview = document.getElementById(`bd-preview-${char.id}`);
    const applyBtn = document.getElementById(`bd-apply-${char.id}`);
    if (!classIndex) { preview.innerHTML = ''; applyBtn.style.display = 'none'; return null; }
    const spellInfo = getSpellSlots(classLevels, classIndex, level);
    const resources = getClassResources(classLevels, classIndex, level);
    let html = '';
    if (spellInfo) {
      const slotsStr = Object.entries(spellInfo.slots).map(([lvl, n]) => `L${lvl}×${n}`).join(', ') || 'none yet';
      html += `<div class="sp-meta-item">Cantrips known: <span>${spellInfo.cantripsKnown}</span></div>`;
      html += `<div class="sp-meta-item">Spell slots: <span>${slotsStr}</span></div>`;
    } else {
      html += `<div class="sp-meta-item">No spellcasting at this level.</div>`;
    }
    if (resources.length) {
      html += resources.map(r => `<div class="sp-meta-item">${r.label}: <span>${r.value}</span></div>`).join('');
    }
    preview.innerHTML = html;
    applyBtn.style.display = 'inline-block';
    return { classIndex, className: classes.find(c=>c.index===classIndex)?.name, level, spellInfo, resources };
  }

  window.previewBuild = (charId) => { if (charId === char.id) compute(); };
  window.applyBuild = async (charId) => {
    if (charId !== char.id) return;
    const result = compute();
    if (!result) return;
    const patch = { level: result.level, class: result.className };
    if (result.spellInfo) {
      patch.spellcasting = patch.spellcasting || {};
      patch.spellcasting.slots = result.spellInfo.slots;
      patch.spellcasting.cantrips_known = result.spellInfo.cantripsKnown;
    }
    if (result.resources.length) {
      patch.resource_pools = {};
      for (const r of result.resources) patch.resource_pools[r.key] = { label: r.label, max: r.value };
    }
    try {
      await update(ref(db, `characters/pcs/${char.id}`), patch);
    } catch (e) { console.error('Build apply failed:', e); }
  };

  classSel.onchange = compute;
  document.getElementById(`bd-level-${char.id}`).onchange = compute;
}

/**
 * A minimal name+HP chip for a docked "party status" strip -- much lighter
 * than the full card, no panels/buttons, just enough to glance at who's
 * hurt. Live HP updates are the caller's job (same watchCharacter() below
 * works fine against the elements this returns, since it looks up
 * hpbar-<id>/hpval-<id> by id same as the full card does).
 */
export function buildStatusChip(char){
  const c=char.combat||{};
  const hpCur=c.hp_current??0,hpMax=c.hp_max??1,hpPct=Math.max(0,Math.min(1,hpCur/hpMax));
  const chip=document.createElement('div');
  chip.className='status-chip';chip.id=`chip-${char.id}`;
  chip.innerHTML=`
    <div class="chip-name">${char.name||'Unnamed'}</div>
    <div class="chip-hp-bar-wrap"><div class="chip-hp-bar" id="chiphpbar-${char.id}" style="width:${Math.round(hpPct*100)}%;background:${hpColor(hpCur,hpMax)}"></div></div>
    <div class="chip-hp-val" id="chiphpval-${char.id}">${hpCur}/${hpMax}</div>`;
  return chip;
}

/** Live-updates a status chip's HP bar/value -- the chip equivalent of
 *  watchCharacter(), kept separate (rather than reusing hpbar-/hpval-)
 *  specifically so a chip and a full card for the same character can both
 *  be on screen at once (e.g. the party bar plus an open inspector) without
 *  colliding on duplicate element ids. */
export function watchStatusChip(charId, { db, ref, onValue }, $ = (id) => document.getElementById(id)) {
  return onValue(ref(db, `characters/pcs/${charId}/combat`), snap => {
    if (!snap.exists()) return;
    const c = snap.val(), hpCur = c.hp_current ?? 0, hpMax = c.hp_max ?? 1;
    const pct = Math.max(0, Math.min(1, hpCur / hpMax));
    const bar = $(`chiphpbar-${charId}`), val = $(`chiphpval-${charId}`);
    if (bar) { bar.style.width = Math.round(pct * 100) + '%'; bar.style.backgroundColor = hpColor(hpCur, hpMax); }
    if (val) val.textContent = `${hpCur}/${hpMax}`;
  });
}

/** Wires window.togglePanel / window.toggleSlot / window.adjustHp, which
 *  buildCard()'s generated HTML calls via inline onclick. Call this once
 *  per page (index.html, or mapeditor.html's token-popup) before/after
 *  inserting any cards. Safe to call multiple times (just reassigns the
 *  same functions) -- e.g. if both index.html and a mapeditor popup are
 *  open in different tabs, each wires its own copy against its own db.
 *  @param {{db, ref, get, set, update}} fb - the firebase.js exports
 *  @param {(id:string)=>HTMLElement|null} $ - element lookup (e.g. document.getElementById)
 */
export function wireCharacterCardHandlers({ db, ref, get, set, update }, $ = (id) => document.getElementById(id)) {
  window.togglePanel = function (panelId, btnId) {
    const panel = $(panelId), btn = $(btnId); if (!panel || !btn) return;
    const open = panel.classList.toggle('open'); btn.classList.toggle('open', open);
  };

  window.toggleSlot = function (pip) {
    const charId = pip.dataset.charid, lvl = pip.dataset.lvl, idx = parseInt(pip.dataset.idx, 10), max = parseInt(pip.dataset.max, 10);
    const pips = [...pip.parentElement.querySelectorAll('.slot-pip')];
    const clamped = Math.max(0, Math.min(max, pip.classList.contains('used') ? idx : idx + 1));
    pips.forEach((p, i) => p.classList.toggle('used', i < clamped));
    set(ref(db, `characters/pcs/${charId}/spellcasting/slots_used/${lvl}`), clamped).catch(e => console.error(e));
  };

  window.adjustHp = async function (charId, isHeal) {
    const deltaEl = $(`hpdelta-${charId}`);
    const delta = parseInt(deltaEl?.value, 10) || 1;
    if (!deltaEl || delta <= 0) return;
    try {
      const snap = await get(ref(db, `characters/pcs/${charId}/combat`)); if (!snap.exists()) return;
      const c = snap.val(), max = c.hp_max ?? 1;
      let cur = c.hp_current ?? 0;
      cur = isHeal ? Math.min(max, cur + delta) : Math.max(0, cur - delta);
      await update(ref(db, `characters/pcs/${charId}/combat`), { hp_current: cur });
      deltaEl.value = '';
    } catch (e) { console.error('HP save failed:', e); }
  };

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.classList.contains('hp-delta')) return;
    window.adjustHp(e.target.id.replace('hpdelta-', ''), true);
  });

  window.exportCharacterJSON = async function(charId) {
    try {
      const snap = await get(ref(db, `characters/pcs/${charId}`));
      if (!snap.exists()) return;
      const data = snap.val();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(data.name||charId).replace(/\s+/g,'_')}.json`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(a.href);
    } catch (e) { console.error('Export failed:', e); }
  };

  window.triggerImportJSON = function(charId) {
    document.getElementById(`bd-import-${charId}`)?.click();
  };

  window.importCharacterJSON = async function(charId, input) {
    const file = input.files[0]; if (!file) return;
    input.value = '';
    try {
      const data = JSON.parse(await file.text());
      if (!confirm(`Overwrite ${charId} with ${file.name}? This cannot be undone.`)) return;
      await set(ref(db, `characters/pcs/${charId}`), data);
    } catch (e) { console.error('Import failed:', e); }
  };

  window.updateCoin = async function(input) {
    const charId = input.dataset.charid, coin = input.dataset.coin;
    const val = Math.max(0, parseInt(input.value, 10) || 0);
    input.value = val;
    try { await update(ref(db, `characters/pcs/${charId}/coin_purse`), { [coin]: val }); }
    catch (e) { console.error('Coin save failed:', e); }
  };

  window.saveNotes = async function(charId, text) {
    try { await update(ref(db, `characters/pcs/${charId}/text_blocks`), { notes: text }); }
    catch (e) { console.error('Notes save failed:', e); }
  };
}

/** Live-updates a card's HP bar/value as combat.hp_current/hp_max change in
 *  Firebase -- e.g. another player's heal shows up without a page refresh. */
export function watchCharacter(charId, { db, ref, onValue }, $ = (id) => document.getElementById(id)) {
  return onValue(ref(db, `characters/pcs/${charId}/combat`), snap => {
    if (!snap.exists()) return;
    const c = snap.val(), hpCur = c.hp_current ?? 0, hpMax = c.hp_max ?? 1;
    const pct = Math.max(0, Math.min(1, hpCur / hpMax));
    const bar = $(`hpbar-${charId}`), val = $(`hpval-${charId}`);
    if (bar) { bar.style.width = Math.round(pct * 100) + '%'; bar.style.backgroundColor = hpColor(hpCur, hpMax); }
    if (val) val.textContent = `${hpCur} / ${hpMax}`;
  });
}
