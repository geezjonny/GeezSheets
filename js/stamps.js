// GeezStamps: every map stamp (prop) drawn in ink, in one place. To redraw a stamp, edit its function.
// See them all at once: stamps.html (a contact sheet that reloads this file).
//
// Units: 1 = one grid square, centred on (0,0); y grows downward. A 1x2 stamp spans y -1..1.
// Each stamp is   name(d, c) { ... }   where c is the raw canvas context and d is the pen:
//   d.line(x1,y1,x2,y2)            ink line
//   d.circle(x,y,r)                outline only        d.ring(x,y,r)          filled + outline
//   d.box(x,y,w,h)                 filled box          d.rect(w,h)            box centred on 0
//   d.poly([[x,y],...], fill=true) closed shape        d.ell(x,y,rx,ry,rot)   filled ellipse
//   d.dot(x,y,r)                   solid ink dot       d.hatch(x,y,w,h,gap,cross) hatching
//   d.flame(x,y,size)  d.bone(x1,y1,x2,y2)  d.arrow(x,y,'up'|'down',size)
//   d.thick(w, fn)                 draw fn with a thicker line
//   d.r()  seeded random 0..1 (same stamp id, same wobble)   d.id  stamp id   d.p  the placed prop (p.dir for stairs)
// Colours: INK lines, PAPER fills, d.fill(colour, fn) to fill with another colour.

export const INK = '#211b15', PAPER = '#82704f';

export const STAMPS = {
    // ---- furniture ----
    table(d, c) { d.rect(1.55, .8); for (let i = 0; i < 4; i++) d.line(-.72, -.3 + i * .2, .72, -.3 + i * .2); for (const x of [-.6, .6]) for (const y of [-.3, .3]) d.circle(x, y, .035); if (d.id === 'alchemy_table') { d.circle(-.4, 0, .13); d.circle(.35, .05, .09); } },
    chair(d) { d.rect(.55, .6); d.box(-.35, -.42, .7, .12); d.line(-.2, -.16, .2, -.16); },
    bed(d) { d.rect(1, 1.7); d.box(-.4, -.7, .8, .38); d.box(-.44, -.22, .88, .91); d.line(-.38, .51, .38, .51); },
    shelf(d) { d.rect(1.4, .5); for (let i = 0; i < 12; i++) d.box(-.63 + i * .105, -.19, .07, .25 + d.r() * .12); },
    crate(d) { d.rect(.85, .65); d.line(-.4, -.3, .4, .3); d.line(-.4, .3, .4, -.3); },
    chest(d) { d.rect(.85, .65); d.line(-.4, -.15, .4, -.15); d.box(-.07, -.07, .14, .13); },
    coffin(d) { d.rect(.65, 1.4); d.line(-.3, -.15, .3, -.15); d.line(0, -.5, 0, .35); d.line(-.18, -.2, .18, -.2); },
    nightstand(d) { d.rect(.6, .6); d.line(-.3, .05, .3, .05); d.ring(0, .17, .03); d.ring(.12, -.14, .08); d.flame(.12, -.18, .05); },
    display_case(d) { d.rect(.9, .6); d.c.strokeRect(-.37, -.22, .74, .44); d.line(-.3, .18, -.1, -.18); d.line(-.18, .18, .02, -.18); d.ring(.2, 0, .07); },
    lectern(d) { d.poly([[-.32, .3], [.32, .3], [.25, -.25], [-.25, -.25]]); d.box(-.22, -.22, .44, .28); d.line(0, -.22, 0, .06); for (let i = 0; i < 3; i++) { d.line(-.18, -.15 + i * .07, -.04, -.15 + i * .07); d.line(.04, -.15 + i * .07, .18, -.15 + i * .07); } },
    mirror(d) { d.ell(0, 0, .28, .38); d.c.beginPath(); d.c.ellipse(0, 0, .2, .3, 0, 0, 7); d.c.stroke(); d.line(-.1, -.12, .04, -.24); d.line(-.06, 0, .1, -.14); },
    rug(d) { d.box(-.42, -.9, .84, 1.8); d.c.strokeRect(-.34, -.8, .68, 1.6); d.poly([[0, -.55], [.25, 0], [0, .55], [-.25, 0]]); for (let i = 0; i < 7; i++) { const x = -.36 + i * .12; d.line(x, -.9, x, -.98); d.line(x, .9, x, .98); } },
    hat_display(d) { d.rect(.8, .5); for (const x of [-.22, .22]) { d.ell(x, 0, .17, .12); d.ring(x, 0, .08); } },
    hat_stand(d) { d.ring(0, 0, .3); d.circle(0, 0, .05); for (const a of [0, 2.1, 4.2]) d.ell(Math.cos(a) * .2, Math.sin(a) * .2, .12, .08, a); },
    globe(d) { d.box(-.22, .28, .44, .1); d.ring(0, -.02, .3); d.c.beginPath(); d.c.ellipse(0, -.02, .12, .3, 0, 0, 7); d.c.stroke(); d.line(-.3, -.02, .3, -.02); },

    // ---- round things ----
    barrel(d) { d.ring(0, 0, .43); d.circle(0, 0, .33); for (let i = -2; i < 3; i++) d.line(i * .12, -.29, i * .12, .29); d.line(-.39, -.18, .39, -.18); d.line(-.39, .18, .39, .18); },
    cauldron(d) { d.ring(0, 0, .43); d.circle(0, 0, .33); for (const x of [-.5, .5]) d.circle(x, 0, .08); d.circle(-.12, .07, .07); d.circle(.14, -.1, .06); },
    well(d) { d.ring(0, 0, .43); d.circle(0, 0, .33); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; d.line(Math.cos(a) * .33, Math.sin(a) * .33, Math.cos(a) * .43, Math.sin(a) * .43); } d.line(-.52, 0, .52, 0); },
    fountain(d) { d.ring(0, 0, .43); d.circle(0, 0, .33); d.ring(0, 0, .16); for (let i = 0; i < 4; i++) d.circle(Math.sin(i) * .23, Math.cos(i) * .23, .03); },
    round_table(d) { d.ring(0, 0, .43); d.circle(0, 0, .33); },

    // ---- stairs: an arrow shows the way. Up arrow at the top = goes up; down arrow at the bottom = goes down ----
    stairs(d) {
        d.rect(.85, 1.6); for (let i = 0; i < 9; i++) d.line(-.42, -.8 + i * .2, .42, -.8 + i * .2);
        const dir = d.p.dir || (d.id.includes('down') ? 'down' : d.id.includes('up') ? 'up' : null);
        if (dir === 'down') d.arrow(0, .3, 'down', .5); else if (dir === 'up') d.arrow(0, -.3, 'up', .5); else { d.line(0, .6, 0, -.6); d.line(0, -.6, -.12, -.35); }
    },
    ladder(d) { d.rect(.5, 1.6); for (let i = 0; i < 8; i++) d.line(-.25, -.7 + i * .2, .25, -.7 + i * .2); },
    bridge(d) { d.rect(.85, 1.6); for (let i = 0; i < 9; i++) d.line(-.42, -.8 + i * .2, .42, -.8 + i * .2); },

    // ---- nature ----
    tree(d) { for (let i = 0; i < 10; i++) { const a = i * .628, rr = .35 + d.r() * .13; d.ring(Math.cos(a) * rr, Math.sin(a) * rr, .16 + d.r() * .12); } d.ring(0, 0, .28); d.line(-.08, .05, .07, -.15); d.line(.07, -.15, .18, -.07); },
    rock(d, c) { c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 3.5, rr = .35 + d.r() * .12; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke(); d.line(-.25, .2, -.05, -.15); d.line(-.05, -.15, .22, -.22); d.hatch(-.25, .1, .4, .2, .08); },
    fallen_log(d, c) { c.rotate(.5); d.box(-.46, -.16, .92, .32); d.ell(.46, 0, .07, .16); d.circle(.46, 0, .07); d.line(-.4, -.05, .3, -.06); d.line(-.35, .07, .25, .06); },
    mushrooms(d) { [[-.2, .1, .17], [.18, -.05, .13], [0, -.25, .1], [.22, .25, .09]].forEach(([x, y, rr]) => { d.ring(x, y, rr); d.dot(x - rr * .35, y - rr * .2, rr * .2); d.dot(x + rr * .3, y + rr * .25, rr * .15); }); },
    crystal_cluster(d, c) { [[0, -.42, 0], [-.25, -.25, -.6], [.25, -.28, .55], [-.32, .1, -1.2], [.3, .08, 1.2]].forEach(([x, y, a]) => { c.save(); c.translate(x * .4, y * .4 + .12); c.rotate(a); d.poly([[0, -.32], [.08, -.1], [0, .12], [-.08, -.1]]); d.line(0, -.32, 0, .12); c.restore(); }); },
    planter(d) { d.box(-.42, -.18, .84, .36); for (let i = 0; i < 4; i++) { d.ring(-.3 + i * .2, -.02, .09); d.line(-.3 + i * .2, -.08, -.3 + i * .2, .04); } },

    // ---- fire & light ----
    fire(d, c) { d.circle(0, 0, .34); for (let i = 0; i < 5; i++) { const a = i * 1.256; d.line(Math.sin(a) * .18, Math.cos(a) * .18, Math.sin(a) * .43, Math.cos(a) * .43); } c.beginPath(); c.moveTo(-.2, .15); c.quadraticCurveTo(-.32, -.1, .02, -.46); c.quadraticCurveTo(-.02, -.13, .19, -.04); c.quadraticCurveTo(.35, .2, -.2, .15); c.fill(); c.stroke(); },
    candelabra(d) { d.ring(0, .05, .12); d.line(0, .05, 0, -.3); d.line(-.3, -.05, .3, -.05); for (const [x, y] of [[-.3, -.05], [0, -.3], [.3, -.05]]) { d.ring(x, y, .06); d.flame(x, y - .08, .07); } },
    light(d) { d.ring(0, 0, .14); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; d.line(Math.cos(a) * .2, Math.sin(a) * .2, Math.cos(a) * .34, Math.sin(a) * .34); } d.flame(0, 0, .08); },
    lamp_post(d) { d.ring(0, .3, .08); d.thick(.04, () => { d.line(0, .22, 0, -.2); d.line(0, -.2, .22, -.2); }); d.box(.14, -.18, .16, .2); d.flame(.22, -.06, .05); },
    hearth_oven(d, c) { d.rect(.9, .75); c.beginPath(); c.moveTo(-.25, .37); c.lineTo(-.25, 0); c.arc(0, 0, .25, Math.PI, 0); c.lineTo(.25, .37); d.fill(INK, () => c.fill()); d.flame(0, .18, .12); d.hatch(-.45, -.37, .9, .2, .09, true); },

    // ---- holy & grim ----
    altar(d) { d.rect(.9, .9); d.box(-.36, -.36, .72, .72); d.ring(0, 0, .24); if (d.id === 'altar') { d.line(0, -.25, 0, .25); d.line(-.18, -.1, .18, -.1); } else d.line(-.18, .13, .18, -.13); },
    bone_pile(d) { d.bone(-.32, .2, .18, -.05); d.bone(-.25, -.25, .3, .22); d.bone(.05, .3, .35, -.2); d.ring(-.12, -.08, .15); d.dot(-.17, -.1, .03); d.dot(-.07, -.1, .03); d.line(-.16, 0, -.08, 0); },
    chains(d) { for (let i = 0; i < 7; i++) { const t = i / 6, x = -.42 + t * .84, y = -.32 + Math.sin(t * 3) * .3 + t * .5; d.ell(x, y, i % 2 ? .05 : .09, i % 2 ? .09 : .05, .6); } },
    gravestone(d, c) { d.ell(0, .22, .38, .2); c.beginPath(); c.moveTo(-.25, .2); c.lineTo(-.25, -.15); c.arc(0, -.15, .25, Math.PI, 0); c.lineTo(.25, .2); c.closePath(); c.fill(); c.stroke(); d.line(0, -.25, 0, .05); d.line(-.1, -.15, .1, -.15); },
    iron_cage(d) { d.rect(.8, .8); for (let i = 1; i < 6; i++) d.line(-.4 + i * .133, -.4, -.4 + i * .133, .4); d.line(-.4, 0, .4, 0); d.ring(0, 0, .08); },
    manacles_wall(d) { d.box(-.4, -.45, .8, .12); for (const x of [-.22, .22]) { d.line(x, -.33, x, .05); d.ring(x, .15, .1); d.circle(x, .15, .05); } },
    spike_trap(d) { d.rect(.84, .84); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = -.3 + i * .2, y = -.3 + j * .2; d.poly([[x - .06, y + .06], [x, y - .08], [x + .06, y + .06]]); } },
    gallows(d) { d.box(-.42, -.3, .84, 1.15); for (let i = 0; i < 3; i++) d.line(-.3 + i * .3, .6, -.3 + i * .3, .85); d.thick(.06, () => { d.line(-.3, -.25, -.3, -.9); d.line(-.3, -.9, .2, -.9); }); d.line(.15, -.9, .15, -.6); d.circle(.15, -.53, .07); },
    stocks(d) { d.box(-.45, -.12, .9, .24); d.line(-.45, 0, .45, 0); for (const [x, rr] of [[-.28, .05], [0, .08], [.28, .05]]) d.circle(x, 0, rr); for (const x of [-.4, .4]) d.box(x - .04, .12, .08, .22); },
    summoning_circle_stones(d) { d.circle(0, 0, .32); d.circle(0, 0, .22); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; d.ring(Math.cos(a) * .4, Math.sin(a) * .4, .07); d.line(Math.cos(a) * .22, Math.sin(a) * .22, Math.cos(a + 2.1) * .22, Math.sin(a + 2.1) * .22); } },

    // ---- work & trade ----
    anvil(d) { d.poly([[-.55, -.22], [.4, -.22], [.5, .03], [.15, .1], [.3, .33], [-.3, .33], [-.18, .05]]); },
    cart(d) { d.rect(.9, 1.15); for (const x of [-.56, .56]) d.box(x - .06, -.26, .12, .52); d.line(-.34, -.5, -.34, -1); d.line(.34, -.5, .34, -1); },
    grindstone(d) { d.box(-.35, .2, .7, .15); d.ring(0, -.05, .3); d.circle(0, -.05, .06); d.line(-.38, -.05, .38, -.05); d.line(.38, -.05, .38, -.25); },
    strongbox(d) { d.rect(.6, .42); d.line(-.3, -.05, .3, -.05); for (const x of [-.17, .17]) d.line(x, -.21, x, .21); d.box(-.05, -.02, .1, .1); },
    sacks(d) { [[-.18, .08], [.2, .1], [0, -.18]].forEach(([x, y]) => { d.ell(x, y, .2, .17); d.line(x - .05, y - .15, x + .05, y - .15); d.ring(x, y - .17, .04); }); },
    hay_bale(d) { d.fill('#b99a55', () => d.rect(.85, .55)); d.hatch(-.42, -.27, .84, .54, .07); d.thick(.04, () => { d.line(-.18, -.27, -.18, .27); d.line(.18, -.27, .18, .27); }); },
    woodpile(d) { for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) { const x = -.3 + i * .2 + row * .1, y = .25 - row * .17; d.ring(x, y, .09); d.circle(x, y, .04); } },
    coal_pile(d) { d.ell(0, 0, .4, .3); for (let i = 0; i < 14; i++) d.dot(-.3 + d.r() * .6, -.2 + d.r() * .4, .03 + d.r() * .03); },
    ore_pile(d) { d.ell(0, .05, .4, .28); for (let i = 0; i < 6; i++) { const x = -.25 + d.r() * .5, y = -.15 + d.r() * .3; d.poly([[x - .08, y + .05], [x - .02, y - .08], [x + .08, y - .02], [x + .05, y + .07]]); d.dot(x, y, .02); } },
    rope_coil(d, c) { d.ring(0, 0, .36); c.beginPath(); for (let t = 0; t < 16; t += .2) { const rr = .32 - t * .018; c.lineTo(Math.cos(t) * rr, Math.sin(t) * rr); } c.stroke(); d.line(.3, .15, .45, .35); },
    book_pile(d, c) { [[-.2, .12, .3], [.12, .05, -.4], [-.05, -.18, .15], [.2, -.22, .7]].forEach(([x, y, a]) => { c.save(); c.translate(x, y); c.rotate(a); d.box(-.18, -.12, .36, .24); d.line(-.13, -.12, -.13, .12); c.restore(); }); },
    mug_clutter(d, c) { [[-.2, -.1], [.15, -.18], [0, .18], [.25, .15]].forEach(([x, y], i) => { d.ring(x, y, .09); if (i !== 2) { c.beginPath(); c.arc(x + .11, y, .05, -1.4, 1.4); c.stroke(); } else d.circle(x, y, .05); }); },
    water_trough(d, c) { d.box(-.47, -.2, .94, .4); c.strokeRect(-.4, -.13, .8, .26); for (let i = 0; i < 2; i++) { c.beginPath(); for (let j = 0; j < 9; j++) { const x = -.36 + j * .09, y = -.04 + i * .08 + Math.sin(j * 1.7) * .02; j ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); } },
    market_canopy(d, c) { d.box(-.45, -.95, .9, 1.9); d.fill('#9a4a3a', () => { for (let i = 1; i < 6; i += 2) c.fillRect(-.45, -.95 + i * .317, .9, .317); }); c.strokeRect(-.45, -.95, .9, 1.9); d.line(0, -.95, 0, .95); },
    market_stall(d, c) { d.box(-.4, -.6, .8, 1.4); for (let i = 0; i < 3; i++) d.box(-.3, -.45 + i * .4, .25, .25); for (let i = 0; i < 3; i++) d.ring(.15, -.33 + i * .4, .1); c.beginPath(); for (let i = 0; i < 5; i++) { c.moveTo(-.4 + i * .16 + .16, -.75); c.arc(-.4 + i * .16 + .08, -.75, .08, 0, Math.PI); } c.stroke(); d.line(-.45, -.75, .45, -.75); },
    notice_board(d, c) { d.box(-.45, -.12, .9, .24); for (const x of [-.4, .4]) d.box(x - .04, .12, .08, .2); [[-.32, -.1], [-.08, -.08], [.16, -.11]].forEach(([x, y]) => { c.save(); c.translate(x, y); c.rotate(d.r() * .4 - .2); d.box(0, 0, .18, .18); d.line(.03, .06, .15, .06); d.line(.03, .11, .13, .11); c.restore(); }); },
    tent(d) { d.poly([[0, -.45], [.42, .4], [-.42, .4]]); d.line(0, -.45, 0, .4); d.poly([[0, .05], [.16, .4], [-.16, .4]]); for (const [x, y] of [[-.48, .45], [.48, .45], [0, -.52]]) d.circle(x, y, .03); },

    // ---- outdoors & docks ----
    fence(d) { for (const x of [-.4, .4]) d.box(x - .06, -.06, .12, .12); d.thick(.06, () => d.line(-.36, -.03, .36, -.03)); d.line(-.36, .05, .36, .05); },
    hitching_post(d) { for (const x of [-.38, .38]) d.ring(x, 0, .08); d.thick(.06, () => d.line(-.3, 0, .3, 0)); d.circle(0, 0, .05); },
    signpost(d) { d.ring(0, .3, .07); d.line(0, .23, 0, -.3); d.poly([[-.35, -.32], [.25, -.32], [.37, -.24], [.25, -.16], [-.35, -.16]]); d.poly([[.35, -.08], [-.25, -.08], [-.37, 0], [-.25, .08], [.35, .08]]); },
    flagpole(d) { d.ring(0, .3, .08); d.thick(.04, () => d.line(0, .3, 0, -.4)); d.poly([[0, -.4], [.38, -.28], [0, -.14]]); },
    banner(d) { d.thick(.05, () => d.line(-.42, -.38, .42, -.38)); d.poly([[-.3, -.38], [.3, -.38], [.3, .4], [0, .2], [-.3, .4]]); d.ring(0, -.05, .11); },
    guild_crest(d, c) { d.poly([[-.32, -.38], [.32, -.38], [.32, .05], [0, .4], [-.32, .05]]); c.beginPath(); c.moveTo(-.22, .05); c.lineTo(0, -.15); c.lineTo(.22, .05); c.stroke(); d.ring(0, -.22, .05); },
    anchor(d, c) { d.circle(0, -.36, .08); d.line(0, -.28, 0, .35); d.line(-.2, -.18, .2, -.18); c.beginPath(); c.arc(0, .05, .32, .25, Math.PI - .25); c.stroke(); d.poly([[-.33, .13], [-.38, .02], [-.24, .06]]); d.poly([[.33, .13], [.38, .02], [.24, .06]]); },
    dock_post(d, c) { d.ring(0, 0, .24); d.circle(0, 0, .15); d.circle(0, 0, .06); c.beginPath(); c.arc(0, 0, .32, .4, 2.4); c.stroke(); },
    blackship(d) {
        d.fill('#3b3128', () => d.poly([[0, -3.7], [1.05, -2.6], [1.25, -.5], [1.15, 2.4], [.7, 3.5], [-.7, 3.5], [-1.15, 2.4], [-1.25, -.5], [-1.05, -2.6]]));
        d.poly([[0, -3.3], [.85, -2.4], [1, -.5], [.92, 2.25], [.55, 3.15], [-.55, 3.15], [-.92, 2.25], [-1, -.5], [-.85, -2.4]]);
        for (let i = -6; i < 7; i++) d.line(-.95, i * .45, .95, i * .45);
        d.thick(.08, () => d.line(0, -3.4, 0, 3.2));
        for (const y of [-1.6, .4, 2.2]) { d.ring(0, y, .18); d.thick(.06, () => d.line(-1.1, y, 1.1, y)); }
        d.box(-.6, 2.5, 1.2, .6);
    },

    // ---- anything unknown: a plain sketched bundle, never text ----
    unknown(d, c) { c.beginPath(); c.roundRect(-.38, -.3, .76, .6, .16); c.fill(); c.stroke(); d.hatch(-.38, -.3, .76, .6, .12); d.line(-.38, 0, .38, 0); },
};

// Catalogue ids that share one drawing (first match wins). Add an id to a pattern, or give it its own STAMPS entry.
export const FAMILIES = [
    [/table|desk|bench|counter|workbench|butcher/, 'table'],
    [/chair|stool|pew/, 'chair'],
    [/bed/, 'bed'],
    [/cauldron/, 'cauldron'], [/^well$/, 'well'], [/fountain|holy_font/, 'fountain'], [/barrel/, 'barrel'],
    [/coffin/, 'coffin'], [/crate/, 'crate'], [/chest/, 'chest'],
    [/shelf|rack|wardrobe|dresser/, 'shelf'],
    [/stairs/, 'stairs'], [/ladder/, 'ladder'], [/bridge/, 'bridge'],
    [/tree|bush|flowers|grass|reeds/, 'tree'],
    [/rock|boulder|stalagmite|stump/, 'rock'],
    [/fire|brazier|torch|forge/, 'fire'],
    [/altar|statue|pillar|crystal_pedestal/, 'altar'],
    [/cart|cannon/, 'cart'],
];

// Your own stamp names (from the map converter) borrow the closest drawing: "skull" draws as a bone pile.
export const ALIASES = { skull: 'bone_pile', skulls: 'bone_pile', bones: 'bone_pile', bone: 'bone_pile', skeleton: 'bone_pile', corpse: 'bone_pile', cage: 'iron_cage', chain: 'chains', grave: 'gravestone', tomb: 'gravestone', headstone: 'gravestone', hay: 'hay_bale', logs: 'woodpile', firewood: 'woodpile', sack: 'sacks', bag: 'sacks', grain: 'sacks', book: 'book_pile', books: 'book_pile', crystal: 'crystal_cluster', gem: 'crystal_cluster', mushroom: 'mushrooms', fungus: 'mushrooms', flag: 'flagpole', sign: 'signpost', lamp: 'lamp_post', lantern: 'lamp_post', candle: 'candelabra', candles: 'candelabra', rope: 'rope_coil', trough: 'water_trough', oven: 'hearth_oven', noose: 'gallows', shield: 'guild_crest', crest: 'guild_crest', spikes: 'spike_trap', trap: 'spike_trap', coal: 'coal_pile', ore: 'ore_pile', log: 'fallen_log', mug: 'mug_clutter', mugs: 'mug_clutter', tankard: 'mug_clutter', carpet: 'rug', boat: 'blackship', ship: 'blackship', campfire: 'fire', torch: 'fire', stair: 'stairs', steps: 'stairs' };

// Which drawing a stamp id uses: its own entry, then a family, then an alias word, then any stamp sharing a word.
export function stampKey(id) {
    id = String(id || 'unknown');
    if (STAMPS[id]) return id;
    for (const [re, key] of FAMILIES) if (re.test(id)) return key;
    for (const t of id.split(/[^a-z0-9]+/)) {
        if (ALIASES[t]) return ALIASES[t];
        const k = Object.keys(STAMPS).find(k => k.split('_').includes(t));
        if (k) return k;
    }
    return 'unknown';
}

function seeded(seed) { let n = 2166136261; for (const ch of String(seed)) n = Math.imul(n ^ ch.charCodeAt(0), 16777619); n >>>= 0; return () => { n += 0x6D2B79F5; let t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function pen(c, id, p) {
    const d = {
        c, id, p, r: seeded(id),
        line(x, y, X, Y) { c.beginPath(); c.moveTo(x, y); c.lineTo(X, Y); c.stroke(); },
        circle(x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); },
        ring(x, y, r) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke(); },
        box(x, y, w, h) { c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h); },
        rect(w = .8, h = .8) { d.box(-w / 2, -h / 2, w, h); },
        poly(pts, fill = true) { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); if (fill) c.fill(); c.stroke(); },
        ell(x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 7); c.fill(); c.stroke(); },
        dot(x, y, r) { d.fill(INK, () => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }); },
        hatch(x, y, w, h, gap = .15, cross = false) { c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.beginPath(); for (let i = -h; i < w + h; i += gap) { c.moveTo(x + i, y + h); c.lineTo(x + i + h, y); if (cross) { c.moveTo(x + i, y); c.lineTo(x + i + h, y + h); } } c.stroke(); c.restore(); },
        fill(colour, fn) { c.save(); c.fillStyle = colour; fn(); c.restore(); },
        thick(w, fn) { c.save(); c.lineWidth = w; fn(); c.restore(); },
        flame(x, y, s = .1) { c.beginPath(); c.moveTo(x, y + s * .6); c.quadraticCurveTo(x - s, y, x, y - s * 1.4); c.quadraticCurveTo(x + s, y, x, y + s * .6); d.fill('#e9b44c', () => c.fill()); c.stroke(); },
        bone(x1, y1, x2, y2) { d.thick(.07, () => d.line(x1, y1, x2, y2)); for (const [x, y] of [[x1, y1], [x2, y2]]) { d.circle(x - .03, y - .03, .04); d.circle(x + .03, y + .03, .04); } },
        // A bold arrow with a pale halo so it reads on any floor.
        arrow(x, y, dir = 'up', s = .5) {
            const k = dir === 'down' ? 1 : -1, pts = [[x, y + k * s * .55], [x - s * .42, y + k * s * .05], [x - s * .16, y + k * s * .05], [x - s * .16, y - k * s * .5], [x + s * .16, y - k * s * .5], [x + s * .16, y + k * s * .05], [x + s * .42, y + k * s * .05]];
            d.thick(.09, () => { c.save(); c.strokeStyle = '#f3ead6'; d.poly(pts, false); c.restore(); });
            d.fill(INK, () => d.poly(pts));
        },
    };
    return d;
}

// Draw one placed stamp p = {id, x, y, rotation, scale, dir?} at grid size g (pixels per square).
export function drawStamp(c, p, g = 1) {
    const id = p.id || p.p || 'unknown', s = p.scale ?? p.s ?? 1;
    c.save(); c.translate(p.x * g, p.y * g); c.rotate((p.rotation ?? p.rot ?? 0) * Math.PI / 180); c.scale(g * s, g * s);
    c.lineWidth = .025; c.strokeStyle = INK; c.fillStyle = PAPER; c.lineJoin = 'round';
    const d = pen(c, id, p);
    STAMPS[stampKey(id)](d, c);
    c.restore();
}
