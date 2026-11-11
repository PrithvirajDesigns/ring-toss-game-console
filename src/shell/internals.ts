/**
 * The moulded plastic and electronics seen through the translucent case, generated as SVG
 * from the live positions of the real controls, so every collar, boss and trace sits exactly
 * where it belongs at any screen size. Everything is laid out on clean, symmetric lines:
 *  - a double perimeter wall, with cross ribs and gussets tying the screw bosses together
 *  - screw bosses with holes, screw heads and four radial support fins
 *  - guide collars moulded around the D-pad, A/B, Start/Select and the speaker
 *  - a honeycomb stiffening panel in the battery bay
 *  - a circuit board with a centred processor, orthogonal traces out to each control, vias and SMD parts
 * Drawn in currentColor so each finish tints it.
 */

interface Box { x: number; y: number; w: number; h: number; cx: number; cy: number; r: number; }

const f = (n: number) => +n.toFixed(1);

function boxOf(el: Element, origin: DOMRect): Box {
  const r = el.getBoundingClientRect();
  const x = r.left - origin.left, y = r.top - origin.top;
  return { x, y, w: r.width, h: r.height, cx: x + r.width / 2, cy: y + r.height / 2, r: Math.min(r.width, r.height) / 2 };
}

function boss(x: number, y: number, R = 8.5): string {
  const fins = [0, 90, 180, 270].map((a) => {
    const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180);
    return `M${f(x + c * R)} ${f(y + s * R)}L${f(x + c * (R + 6))} ${f(y + s * (R + 6))}`;
  }).join('');
  return `<g class="boss">
    <circle cx="${f(x)}" cy="${f(y)}" r="${R}" class="s3 fill1"/>
    <circle cx="${f(x)}" cy="${f(y)}" r="${R - 3}" class="s2"/>
    <circle cx="${f(x)}" cy="${f(y)}" r="${R - 4.5}" class="fill2"/>
    <path d="M${f(x - 2.4)} ${f(y)}h4.8M${f(x)} ${f(y - 2.4)}v4.8" class="s3"/>
    <path d="${fins}" class="s2 thick"/>
  </g>`;
}

function collarCircle(c: Box, pad: number): string {
  const r1 = c.r + pad, r2 = c.r + pad + 3.5;
  // eight small keying ribs around the outer ring
  const keys = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return `M${f(c.cx + Math.cos(a) * r2)} ${f(c.cy + Math.sin(a) * r2)}L${f(c.cx + Math.cos(a) * (r2 + 4))} ${f(c.cy + Math.sin(a) * (r2 + 4))}`;
  }).join('');
  return `<circle cx="${f(c.cx)}" cy="${f(c.cy)}" r="${f(r1)}" class="s2"/>
    <circle cx="${f(c.cx)}" cy="${f(c.cy)}" r="${f(r2)}" class="s3"/>
    <path d="${keys}" class="s2 thick"/>`;
}

function collarRect(b: Box, pad: number): string {
  return `<rect x="${f(b.x - pad)}" y="${f(b.y - pad)}" width="${f(b.w + pad * 2)}" height="${f(b.h + pad * 2)}" rx="${f(b.h / 2 + pad)}" class="s2"/>
    <rect x="${f(b.x - pad - 3)}" y="${f(b.y - pad - 3)}" width="${f(b.w + pad * 2 + 6)}" height="${f(b.h + pad * 2 + 6)}" rx="${f(b.h / 2 + pad + 3)}" class="s3"/>`;
}

export function renderInternals(shell: HTMLElement, host: HTMLElement): void {
  const o = shell.getBoundingClientRect();
  const W = o.width, H = o.height;
  const q = (sel: string) => shell.querySelector(sel);
  const bezel = boxOf(q('.bezel')!, o);
  const dpad = boxOf(q('#dpad')!, o);
  const btnA = boxOf(q('#btn-a')!, o), btnB = boxOf(q('#btn-b')!, o);
  const sel = boxOf(q('#btn-select')!, o), start = boxOf(q('#btn-start')!, o);
  const spk = boxOf(q('.speaker')!, o);
  const lvl = boxOf(q('#btn-recenter')!, o);

  const inset = 7, wall = 3.5, rad = 26;
  const top = bezel.y + bezel.h + 10; // first cross rib under the screen
  const bottom = H - 16;
  const midX = W / 2;

  // processor sits centred in the gap between the D-pad and the A/B pair
  const chipW = 46, chipH = 34;
  const chipX = midX - chipW / 2, chipY = Math.max(top + 18, Math.min(dpad.cy - chipH / 2 - 6, sel.y - chipH - 26));
  const chipCx = midX, chipCy = chipY + chipH / 2;

  // board: between the cross rib and the battery bay
  const bayY = Math.max(sel.y + sel.h + 14, H * 0.84);
  const board = { x: inset + wall + 10, y: top + 8, w: W - 2 * (inset + wall + 10), h: bayY - top - 20 };

  // orthogonal traces from the processor to each control
  const route = (x1: number, y1: number, x2: number, y2: number) => `M${f(x1)} ${f(y1)}H${f((x1 + x2) / 2)}V${f(y2)}H${f(x2)}`;
  const traces = [
    // three-line bus to the D-pad
    ...[-8, 0, 8].map((d) => route(chipX - 4, chipCy + d, dpad.x + dpad.w + 10, dpad.cy + d)),
    // to B and A
    route(chipX + chipW + 4, chipCy - 6, btnB.cx - btnB.r - 10, btnB.cy),
    route(chipX + chipW + 4, chipCy + 6, btnA.cx, btnA.cy + btnA.r + 12),
    // down to Select / Start
    `M${f(chipCx - 8)} ${f(chipY + chipH + 4)}V${f(sel.y - 12)}H${f(sel.cx)}`,
    `M${f(chipCx + 8)} ${f(chipY + chipH + 4)}V${f(start.y - 12)}H${f(start.cx)}`,
  ];
  const vias = [
    ...[-8, 0, 8].map((d) => [dpad.x + dpad.w + 10, dpad.cy + d]),
    [btnB.cx - btnB.r - 10, btnB.cy], [btnA.cx, btnA.cy + btnA.r + 12], [sel.cx, sel.y - 12], [start.cx, start.y - 12],
  ];

  // a neat row of SMD capacitors along the top of the board
  const smdY = top + 14, smdN = 6, smdGap = (board.w - 80) / (smdN - 1);
  const smd = Array.from({ length: smdN }, (_, i) => {
    const x = board.x + 40 + i * smdGap;
    if (Math.abs(x - midX) < 30) return '';
    return `<rect x="${f(x - 5)}" y="${f(smdY)}" width="10" height="6" rx="1" class="s2 fill1"/><rect x="${f(x - 5)}" y="${f(smdY)}" width="2.5" height="6" class="fill2"/><rect x="${f(x + 2.5)}" y="${f(smdY)}" width="2.5" height="6" class="fill2"/>`;
  }).join('');

  // honeycomb battery bay
  const bay = { x: midX - W * 0.17, y: bayY, w: W * 0.34, h: bottom - bayY - 4 };

  // speaker: magnet rings + three mounting tabs
  const sr = Math.min(spk.w, spk.h) * 0.62;
  const tabs = [90, 210, 330].map((a) => {
    const r = (a * Math.PI) / 180;
    return `<rect x="${f(spk.cx + Math.cos(r) * (sr + 5) - 3)}" y="${f(spk.cy + Math.sin(r) * (sr + 5) - 3)}" width="6" height="6" rx="1.5" class="s2 fill1"/>`;
  }).join('');

  const bosses = [
    [inset + 18, 18 + inset], [W - inset - 18, 18 + inset],
    [inset + 18, top], [W - inset - 18, top],
    // bottom pair flanks the battery bay, clear of LEVEL and the speaker
    [bay.x - 16, bottom - 10], [bay.x + bay.w + 16, bottom - 10],
  ];

  host.innerHTML = `<svg width="${f(W)}" height="${f(H)}" viewBox="0 0 ${f(W)} ${f(H)}" aria-hidden="true">
    <defs>
      <pattern id="hex" width="12" height="20.8" patternUnits="userSpaceOnUse">
        <path d="M6 0l6 3.46v6.93L6 13.86 0 10.39V3.46zM0 13.86v6.94M12 13.86v6.94" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="1"/>
      </pattern>
      <pattern id="pinv" width="5" height="4" patternUnits="userSpaceOnUse"><rect x="1.25" width="2.5" height="4" fill="currentColor" fill-opacity=".38"/></pattern>
      <pattern id="pinh" width="4" height="5" patternUnits="userSpaceOnUse"><rect y="1.25" width="4" height="2.5" fill="currentColor" fill-opacity=".38"/></pattern>
    </defs>
    <style>
      .s1{fill:none;stroke:currentColor;stroke-opacity:.16;stroke-width:1}
      .s2{fill:none;stroke:currentColor;stroke-opacity:.26;stroke-width:1}
      .s3{fill:none;stroke:currentColor;stroke-opacity:.38;stroke-width:1.2}
      .thick{stroke-width:1.6}
      .fill1{fill:currentColor;fill-opacity:.07}
      .fill2{fill:currentColor;fill-opacity:.22}
      .tr{fill:none;stroke:currentColor;stroke-opacity:.30;stroke-width:1.1;stroke-linejoin:round;stroke-linecap:round}
    </style>
    <!-- perimeter wall (two skins of the moulded rim) -->
    <rect x="${inset}" y="${inset}" width="${f(W - 2 * inset)}" height="${f(H - 2 * inset)}" rx="${rad}" class="s3"/>
    <rect x="${inset + wall}" y="${inset + wall}" width="${f(W - 2 * (inset + wall))}" height="${f(H - 2 * (inset + wall))}" rx="${rad - wall}" class="s2"/>
    <!-- cross ribs tying the side bosses together -->
    <path d="M${inset + wall} ${f(top)}H${f(W - inset - wall)}M${inset + wall} ${f(top + 3.5)}H${f(W - inset - wall)}" class="s2"/>
    <path d="M${inset + wall} ${f(bottom - 12)}H${f(W - inset - wall)}" class="s1"/>
    <!-- circuit board -->
    <rect x="${f(board.x)}" y="${f(board.y)}" width="${f(board.w)}" height="${f(board.h)}" rx="10" class="s2 fill1"/>
    <rect x="${f(board.x + 4)}" y="${f(board.y + 4)}" width="${f(board.w - 8)}" height="${f(board.h - 8)}" rx="7" class="s1"/>
    ${smd}
    <path d="${traces.join('')}" class="tr"/>
    ${vias.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="2.4" class="fill2"/><circle cx="${f(x)}" cy="${f(y)}" r="4" class="s2"/>`).join('')}
    <!-- processor -->
    <rect x="${f(chipX)}" y="${f(chipY)}" width="${chipW}" height="${chipH}" rx="3" class="s3" style="fill:currentColor;fill-opacity:.16"/>
    <rect x="${f(chipX + 3)}" y="${f(chipY - 4)}" width="${chipW - 6}" height="4" fill="url(#pinv)"/>
    <rect x="${f(chipX + 3)}" y="${f(chipY + chipH)}" width="${chipW - 6}" height="4" fill="url(#pinv)"/>
    <rect x="${f(chipX - 4)}" y="${f(chipY + 3)}" width="4" height="${chipH - 6}" fill="url(#pinh)"/>
    <rect x="${f(chipX + chipW)}" y="${f(chipY + 3)}" width="4" height="${chipH - 6}" fill="url(#pinh)"/>
    <circle cx="${f(chipX + 6)}" cy="${f(chipY + 6)}" r="2" class="fill2"/>
    <!-- guide collars moulded around every control -->
    ${collarCircle(dpad, 6)}
    ${collarCircle(btnA, 5)}${collarCircle(btnB, 5)}
    ${collarRect(sel, 4)}${collarRect(start, 4)}
    <circle cx="${f(lvl.cx)}" cy="${f(lvl.cy)}" r="${f(lvl.r + 5)}" class="s2"/>
    <!-- speaker magnet + mounting tabs -->
    <circle cx="${f(spk.cx)}" cy="${f(spk.cy)}" r="${f(sr)}" class="s3"/>
    <circle cx="${f(spk.cx)}" cy="${f(spk.cy)}" r="${f(sr * 0.62)}" class="s2"/>
    <circle cx="${f(spk.cx)}" cy="${f(spk.cy)}" r="${f(sr * 0.28)}" class="fill2"/>
    ${tabs}
    <!-- honeycomb battery bay -->
    <rect x="${f(bay.x)}" y="${f(bay.y)}" width="${f(bay.w)}" height="${f(Math.max(0, bay.h))}" rx="6" fill="url(#hex)" class="s2"/>
    <!-- screw bosses -->
    ${bosses.map(([x, y]) => boss(x, y)).join('')}
  </svg>`;
}
