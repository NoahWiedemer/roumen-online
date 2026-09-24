// Dev preview for the procedural HUD icon set: /icons.html
//   ?set=skill|item|menu|buff   show only one set
//   ?size=128                   main grid size (default 64)
//   ?labels=0                   hide labels
//   ?ids=a,b                    only these ids in the main grid
import {
  skillIcon, itemIcon, menuIcon, buffIcon,
  SKILL_ICON_IDS, ITEM_ICON_IDS, MENU_ICON_IDS, BUFF_ICON_IDS,
} from '../ui/icons.js';

const q = new URLSearchParams(location.search);
const only = q.get('set');
const size = Number(q.get('size')) || 64;
const labels = q.get('labels') !== '0';
const small = Number(q.get('small')) || 40;
const idFilter = q.get('ids') ? q.get('ids').split(',') : null;

const SETS = [
  { key: 'skill', title: 'Skill icons', ids: SKILL_ICON_IDS, fn: skillIcon, small },
  { key: 'item', title: 'Item icons', ids: ITEM_ICON_IDS, fn: itemIcon, small },
  { key: 'menu', title: 'Menu icons', ids: MENU_ICON_IDS, fn: menuIcon, small },
  { key: 'buff', title: 'Buff icons', ids: BUFF_ICON_IDS, fn: buffIcon, small: 32, main: Math.max(size, 64) },
];

const root = document.getElementById('root');
const t0 = performance.now();
for (const set of SETS) {
  if (only && only !== set.key) continue;
  const sec = document.createElement('div');
  sec.className = 'section';
  const h = document.createElement('h2');
  h.textContent = `${set.title} (${set.ids.length})`;
  sec.appendChild(h);

  const main = set.main && !only ? set.main : size;
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.setProperty('--w', `${Math.max(main, 56)}px`);
  for (const id of set.ids.filter((i) => !idFilter || idFilter.includes(i))) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const img = new Image(main, main);
    img.src = set.fn(id, main);
    img.title = id;
    cell.appendChild(img);
    if (labels) { const s = document.createElement('span'); s.textContent = id; cell.appendChild(s); }
    grid.appendChild(cell);
  }
  sec.appendChild(grid);

  // compact row at HUD size on a slot-bar-like strip
  const row = document.createElement('div');
  row.className = 'row40';
  for (const id of [...set.ids, '__unknown__']) {
    const img = new Image(set.small, set.small);
    img.src = set.fn(id, set.small);
    img.title = id;
    row.appendChild(img);
  }
  sec.appendChild(row);
  root.appendChild(sec);
}
const info = document.createElement('div');
info.style.cssText = 'margin-top:8px;color:#8a7a6a;font-size:10px';
info.textContent = `rendered in ${(performance.now() - t0).toFixed(0)} ms`;
root.appendChild(info);
