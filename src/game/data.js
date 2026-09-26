// Static game data: progression, skills, items, monsters, NPCs, quests.

// ------------------------------------------------------------------ progression
export const MAX_LEVEL = 30;
export const EXP_TABLE = (() => {
  const t = [0, 10, 30, 60, 100, 150, 210, 280, 360, 450, 700];
  while (t.length <= MAX_LEVEL) t.push(Math.round(t[t.length - 1] * 1.3 + 150));
  return t; // EXP_TABLE[lv] = exp needed to go from lv to lv+1
})();

// Fighter base stats and per-level growth (fractional growth accumulates)
export const FIGHTER_BASE = { str: 6, end: 5, dex: 3, int: 1, spr: 1 };
export const FIGHTER_GROWTH = { str: 1, end: 1, dex: 0.5, int: 0.2, spr: 0.34 };
export const STAT_NAMES = { str: 'Strength', end: 'Endurance', dex: 'Dexterity', int: 'Intelligence', spr: 'Spirit' };

export function derivedStats(p) {
  const s = p.totalStats();
  const w = p.equipStats();
  const lv = p.level;
  return {
    maxHp: Math.round(22 + s.end * 5 + lv * 5 + w.hp),
    maxSp: Math.round(6 + s.spr * 2 + lv * 2 + w.sp),
    atkMin: Math.round(w.atkMin + s.str * 1.5),
    atkMax: Math.round(w.atkMax + s.str * 1.5),
    def: Math.round(w.def + s.end * 0.8),
    mdef: Math.round(w.mdef + s.spr * 0.8),
    aim: Math.round(s.dex * 1.2 + lv),
    evasion: Math.round(s.dex * 1.0 + lv * 0.5),
    crit: Math.min(0.4, 0.05 + s.spr * 0.004 + s.dex * 0.002),
    hpRegen: 0.6 + s.end * 0.06,
    spRegen: 0.25 + s.spr * 0.05,
  };
}

// ------------------------------------------------------------------ skills (Fighter)
// anim = animation clip; fx = effect id; mult/flat = damage; aoe = radius; range in metres
export const SKILLS = {
  attack: { name: 'Attack', desc: 'Normal attack with your equipped weapon.', level: 1, sp: 0, cd: 0, kind: 'attack', icon: 'attack', learned: true },
  pickup: { name: 'Pick Up', desc: 'Pick up the nearest dropped item.', level: 1, sp: 0, cd: 0.5, kind: 'util', icon: 'pickup', learned: true },
  sit: { name: 'Rest', desc: 'Sit down to regenerate HP and SP faster. (Home)', level: 1, sp: 0, cd: 1, kind: 'util', icon: 'sit', learned: true },
  power_slash: {
    name: 'Power Slash', desc: 'A wide sweeping slash that hits your target hard.', level: 2, sp: 5, cd: 5, kind: 'melee', anim: 'power_slash',
    mult: 1.35, flat: 12, range: 2.6, fx: 'slash_orange', icon: 'power_slash', cost: 60,
  },
  crushing_blow: {
    name: 'Crushing Blow', desc: 'Leap up and smash the ground, damaging enemies around the target and slowing them.', level: 4, sp: 8, cd: 12, kind: 'melee', anim: 'mighty_blow',
    mult: 1.6, flat: 18, range: 2.6, aoe: 3.2, fx: 'shockwave', debuff: { id: 'slow', dur: 6 }, icon: 'mighty_blow', cost: 180,
  },
  iron_skin: {
    name: 'Iron Skin', desc: 'Harden your body. Defense +30% for 60 seconds.', level: 5, sp: 9, cd: 30, kind: 'buff', anim: 'buff',
    buff: { id: 'iron_skin', dur: 60, def: 0.3 }, fx: 'buff_blue', icon: 'iron_skin', cost: 240,
  },
  armor_break: {
    name: 'Armor Break', desc: 'A heavy downward cleave. Lowers the target\'s defense by 8 for 20 seconds.', level: 6, sp: 11, cd: 15, kind: 'melee', anim: 'attack3',
    mult: 1.5, flat: 22, range: 2.6, debuff: { id: 'armor_break', dur: 20, def: -8 }, fx: 'slash_red', icon: 'stun_bash', cost: 320,
  },
  second_wind: {
    name: 'Second Wind', desc: 'Catch your breath and regenerate 40% HP over 12 seconds.', level: 7, sp: 12, cd: 60, kind: 'buff', anim: 'buff',
    buff: { id: 'second_wind', dur: 12, regenPct: 0.4 }, fx: 'buff_green', icon: 'second_wind', cost: 400,
  },
  provoke: {
    name: 'Provoke', desc: 'Let out a mighty war cry that draws the attention of all monsters nearby.', level: 8, sp: 10, cd: 8, kind: 'aoe_self', anim: 'provoke',
    aoe: 9, fx: 'war_cry', taunt: true, icon: 'provoke', cost: 500,
  },
  whirlwind: {
    name: 'Whirlwind', desc: 'Spin with your blade extended, hitting all enemies around you twice.', level: 9, sp: 16, cd: 12, kind: 'aoe_self', anim: 'whirlwind',
    mult: 0.9, flat: 14, aoe: 3.4, hits: 2, fx: 'whirl', icon: 'whirlwind', cost: 700,
  },
  stun_bash: {
    name: 'Concussion', desc: 'Slam the pommel into your target, stunning it for 4 seconds.', level: 10, sp: 16, cd: 20, kind: 'melee', anim: 'stun_bash',
    mult: 0.8, flat: 10, range: 2.4, debuff: { id: 'stun', dur: 4 }, fx: 'stars', icon: 'stun_bash', cost: 900,
  },
  berserk: {
    name: 'Berserk', desc: 'Enter a battle frenzy. Damage +25%, defense -10% for 30 seconds.', level: 11, sp: 14, cd: 120, kind: 'buff', anim: 'buff',
    buff: { id: 'berserk', dur: 30, dmg: 0.25, def: -0.1 }, fx: 'buff_red', icon: 'berserk', cost: 1100,
  },
  leap_strike: {
    name: 'Leap Strike', desc: 'Dash at a distant enemy and strike with a rising slash.', level: 12, sp: 18, cd: 14, kind: 'melee', anim: 'leap_strike',
    mult: 1.7, flat: 26, range: 9, dash: true, fx: 'slash_gold', icon: 'leap_strike', cost: 1400,
  },
};
export const SKILL_ORDER = ['power_slash', 'crushing_blow', 'iron_skin', 'armor_break', 'second_wind', 'provoke', 'whirlwind', 'stun_bash', 'berserk', 'leap_strike'];

// ------------------------------------------------------------------ items
// type: consumable | material | weapon | armor | helm | pants | boots | gloves | ring | necklace | earring | quest
export const ITEMS = {
  hp_potion_s: { name: 'Small Red Potion', type: 'consumable', icon: 'hp_potion_s', heal: 60, cd: 2, price: 30, stack: 99, desc: 'Restores 60 HP.' },
  hp_potion_m: { name: 'Red Potion', type: 'consumable', icon: 'hp_potion_m', heal: 180, cd: 2, price: 120, stack: 99, desc: 'Restores 180 HP.' },
  hp_potion_l: { name: 'Large Red Potion', type: 'consumable', icon: 'hp_potion_l', heal: 450, cd: 2, price: 380, stack: 99, desc: 'Restores 450 HP.' },
  sp_potion_s: { name: 'Small Blue Potion', type: 'consumable', icon: 'sp_potion_s', mana: 25, cd: 2, price: 40, stack: 99, desc: 'Restores 25 SP.' },
  sp_potion_m: { name: 'Blue Potion', type: 'consumable', icon: 'sp_potion_m', mana: 80, cd: 2, price: 150, stack: 99, desc: 'Restores 80 SP.' },
  sp_potion_l: { name: 'Large Blue Potion', type: 'consumable', icon: 'sp_potion_l', mana: 200, cd: 2, price: 420, stack: 99, desc: 'Restores 200 SP.' },
  return_scroll: { name: 'Scroll of Return', type: 'consumable', icon: 'return_scroll', recall: true, cd: 10, price: 100, stack: 20, desc: 'Teleports you back to Roumen.' },
  bread: { name: 'Fresh Bread', type: 'consumable', icon: 'bread', regen: 60, regenDur: 10, cd: 10, price: 12, stack: 50, desc: 'Regenerates 60 HP over 10 seconds.' },
  apple: { name: 'Red Apple', type: 'consumable', icon: 'apple', regen: 30, regenDur: 6, cd: 6, price: 6, stack: 50, desc: 'Regenerates 30 HP over 6 seconds.' },

  slime_jelly: { name: 'Slime Jelly', type: 'material', icon: 'slime_jelly', price: 6, stack: 99, desc: 'Wobbly jelly. Sells for a few coppers.' },
  mushroom_spore: { name: 'Mushroom Spore', type: 'material', icon: 'mushroom_spore', price: 9, stack: 99, desc: 'A spotted piece of mushroom cap.' },
  bee_honey: { name: 'Wild Honey', type: 'material', icon: 'bee_honey', price: 16, stack: 99, desc: 'Sweet golden honey.' },
  bee_stinger: { name: 'Bee Stinger', type: 'material', icon: 'bee_stinger', price: 12, stack: 99, desc: 'Sharp! Handle with care.' },
  boar_tusk: { name: 'Boar Tusk', type: 'material', icon: 'boar_tusk', price: 28, stack: 99, desc: 'A small ivory tusk.' },
  boar_hide: { name: 'Boar Hide', type: 'material', icon: 'boar_hide', price: 22, stack: 99, desc: 'Bristly leather.' },
  imp_claw: { name: 'Imp Claw', type: 'material', icon: 'imp_claw', price: 22, stack: 99, desc: 'A hooked, bony claw.' },
  imp_wing: { name: 'Imp Ear-Wing', type: 'material', icon: 'imp_wing', price: 18, stack: 99, desc: 'Thin, leathery and a little twitchy.' },
  mushroom_cap: { name: 'Mushroom Cap', type: 'material', icon: 'mushroom_cap', price: 12, stack: 99, desc: 'A spotted cap, still springy.' },
  rat_whisker: { name: 'Rat Whisker', type: 'material', icon: 'rat_whisker', price: 10, stack: 99, desc: 'A long, wiry whisker. It smells faintly of mist.' },
  king_crown_shard: { name: 'Crown Shard', type: 'material', icon: 'king_crown_shard', price: 600, stack: 99, desc: 'A glittering shard of the Slime King\'s crown.' },
  cumbot_core: { name: 'Jingle Core', type: 'material', icon: 'cumbot_core', price: 1800, stack: 99, desc: 'The humming heart of Cumbot 9000. It still plays a faint tune if you shake it.' },

  sword_wood: { name: 'Training Sword', type: 'weapon', icon: 'sword_wood', lv: 1, atk: [4, 7], price: 20, desc: 'A sturdy practice sword.', look: { blade: '#b98a55', rune: null } },
  sword_bronze: { name: 'Bronze Sword', type: 'weapon', icon: 'sword_bronze', lv: 3, atk: [9, 14], price: 300, desc: 'A reliable bronze blade.', look: { blade: '#d9a066', rune: null } },
  sword_iron: { name: 'Iron Broadsword', type: 'weapon', icon: 'sword_iron', lv: 6, atk: [16, 23], price: 1200, desc: 'Heavy, well balanced iron.', look: { blade: '#d9e0ea', rune: null } },
  greatsword_flame: { name: 'Flame Greatsword', type: 'weapon', icon: 'greatsword_flame', lv: 9, atk: [26, 38], str: 2, price: 4200, desc: 'Runes of fire glow along the blade.', look: { blade: '#e8e0dc', rune: '#ff6a1a' } },
  imp_blade: { name: 'Imp Fang Blade', type: 'weapon', icon: 'imp_blade', lv: 6, atk: [18, 26], dex: 2, price: 1600, desc: 'A jagged golden blade pried from an imp.', look: { blade: '#f0cf6a', rune: '#ff4a3a' } },
  sword_knight: { name: 'Knight\'s Longsword', type: 'weapon', icon: 'sword_knight', lv: 12, atk: [36, 50], str: 3, dex: 2, price: 9000, desc: 'Blessed steel with a sapphire in the hilt.', look: { blade: '#eef4ff', rune: '#4fb0ff' } },
  // dual blades: a weapon class of its own (one blade per hand, fast alternating combo)
  // shop dual blades (all weaker than Robo's gift)
  twin_daggers: { name: 'Twin Daggers', type: 'weapon', weaponClass: 'dual', icon: 'twin_daggers', lv: 1, atk: [5, 9], dex: 1, price: 90,
    desc: 'A pair of plain steel daggers. Light, quick and honest.', look: { model: 'dagger', glowR: '#e6edf5', glowL: '#e6edf5' } },
  twin_sabers: { name: 'Iron Twin Sabers', type: 'weapon', weaponClass: 'dual', icon: 'twin_sabers', lv: 3, atk: [8, 13], dex: 1, price: 520,
    desc: 'Curved iron sabers with brass knuckle bows, forged as a matched pair.', look: { model: 'saber', glowR: '#f2dca8', glowL: '#f2dca8' } },
  twin_fangs: { name: 'Steel Twin Fangs', type: 'weapon', weaponClass: 'dual', icon: 'twin_fangs', lv: 5, atk: [10, 15], dex: 2, price: 1450,
    desc: 'Dark serrated blades with a faint teal edge. Garrick\'s finest pair — still no match for a king\'s fangs.', look: { model: 'fang', glowR: '#6fffd8', glowL: '#6fffd8' } },
  robo_blades: { name: 'Robo Blades', type: 'weapon', weaponClass: 'dual', icon: 'robo_blades', lv: 1, atk: [11, 17], dex: 2, price: 2500,
    desc: 'Twin fangs of Robo, King of Beasts. One burns red like the setting sun, one glows blue like the deep sea.',
    look: { model: 'robosword', glowR: '#ff2a3c', glowL: '#2a7bff' } },

  // ---- mounts (type 'mount': using the item summons or dismisses the mount; it is never used up)
  mount_raccoon: { name: 'Raccoon Whistle', type: 'mount', mount: 'raccoon', icon: 'mount_raccoon', price: 0,
    desc: 'Calls your raccoon friend. A chubby, cheerful ride. Use again to dismount. Attacking dismounts too.' },
  mount_donkey: { name: 'Donkey Bell', type: 'mount', mount: 'donkey', icon: 'mount_donkey', price: 0,
    desc: 'Rings for Nilo\'s donkey. Stubborn, but surprisingly quick. Use again to dismount. Attacking dismounts too.' },

  // ---- armour. `look` makes the piece visible on the hero (see entities/outfit.js): the region is recoloured as
  // cloth / leather / metal and `pieces` add rigid parts (pauldrons, chest, belt, strap, knees, greaves, bracers).
  // Helmets are never shown.
  armor_cloth: { name: 'Padded Vest', type: 'armor', icon: 'armor_cloth', lv: 1, def: 3, price: 25, desc: 'Better than nothing.' },
  armor_leather: { name: 'Leather Cuirass', type: 'armor', icon: 'armor_leather', lv: 4, def: 8, hp: 10, price: 420, desc: 'Hardened leather armor.',
    look: { color: '#8a5632', style: 'leather', trim: '#c99a4a', pieces: ['pauldronR', 'strap', 'belt'] } },
  armor_plate: { name: 'Crimson Plate', type: 'armor', icon: 'armor_plate', lv: 8, def: 16, hp: 30, price: 2600, desc: 'Red-lacquered plate with golden trim.',
    look: { color: '#b0303a', style: 'metal', trim: '#e2b24a', pieces: ['pauldrons', 'chest', 'belt'] } },
  helm_leather: { name: 'Leather Cap', type: 'helm', icon: 'helm_leather', lv: 3, def: 2, price: 150, desc: 'Keeps your spikes in place.' },
  helm_iron: { name: 'Iron Circlet', type: 'helm', icon: 'helm_iron', lv: 7, def: 5, price: 900, desc: 'A protective iron circlet.' },
  pants_leather: { name: 'Leather Greaves', type: 'pants', icon: 'pants_leather', lv: 3, def: 3, price: 180, desc: 'Flexible leg protection.',
    look: { color: '#4d3020', style: 'leather', trim: '#c99a4a', pieces: ['knees'] } },
  pants_plate: { name: 'Plate Greaves', type: 'pants', icon: 'pants_plate', lv: 8, def: 8, price: 1500, desc: 'Solid plate greaves.',
    look: { color: '#9aa4b0', style: 'metal', trim: '#e2b24a', pieces: ['knees'] } },
  boots_leather: { name: 'Leather Boots', type: 'boots', icon: 'boots_leather', lv: 2, def: 2, price: 120, desc: 'Comfortable walking boots.',
    look: { color: '#9a6638', style: 'leather' } },
  boots_plate: { name: 'Plate Boots', type: 'boots', icon: 'boots_plate', lv: 8, def: 5, price: 1300, desc: 'Heavy steel-capped boots.',
    look: { color: '#8e98a4', style: 'metal', trim: '#e2b24a', pieces: ['greaves'] } },
  gloves_leather: { name: 'Leather Gloves', type: 'gloves', icon: 'gloves_leather', lv: 2, def: 1, dex: 1, price: 110, desc: 'A firm grip.',
    look: { color: '#6a4228', style: 'leather', pieces: ['bracers'] } },
  gloves_plate: { name: 'Gauntlets', type: 'gloves', icon: 'gloves_plate', lv: 8, def: 4, str: 1, price: 1200, desc: 'Armored gauntlets.',
    look: { color: '#9aa4b0', style: 'metal', trim: '#e2b24a', pieces: ['bracers'] } },
  // Traveler set (cloth, blue)
  traveler_tunic: { name: 'Traveler\'s Tunic', type: 'armor', icon: 'traveler_tunic', lv: 2, def: 5, price: 140, desc: 'A sturdy blue tunic for long roads.',
    look: { color: '#3a64b8', style: 'cloth', trim: '#6a4a2a', pieces: ['belt'] } },
  traveler_pants: { name: 'Traveler\'s Trousers', type: 'pants', icon: 'traveler_pants', lv: 2, def: 2, price: 90, desc: 'Dark, hard-wearing trousers.',
    look: { color: '#34384e', style: 'cloth' } },
  traveler_shoes: { name: 'Traveler\'s Shoes', type: 'boots', icon: 'traveler_shoes', lv: 2, def: 1, price: 70, desc: 'Soft leather shoes, well walked in.',
    look: { color: '#6a4426', style: 'leather' } },
  // Ranger set (leather, forest green)
  ranger_vest: { name: 'Ranger Vest', type: 'armor', icon: 'ranger_vest', lv: 6, def: 11, dex: 1, price: 1400, desc: 'Green leather worn by the scouts of the Forest of Mist.',
    look: { color: '#4f6e38', style: 'leather', trim: '#c8a860', pieces: ['pauldronL', 'strap', 'belt'] } },
  ranger_pants: { name: 'Ranger Leggings', type: 'pants', icon: 'ranger_pants', lv: 6, def: 6, price: 900, desc: 'Supple leggings with padded knees.',
    look: { color: '#3c4a2c', style: 'leather', trim: '#c8a860', pieces: ['knees'] } },
  ranger_boots: { name: 'Ranger Boots', type: 'boots', icon: 'ranger_boots', lv: 6, def: 4, price: 700, desc: 'Quiet boots for the mossy trails.',
    look: { color: '#4e4226', style: 'leather' } },
  ranger_hood: { name: 'Ranger Hood', type: 'helm', icon: 'ranger_hood', lv: 6, def: 3, price: 650, desc: 'Keeps the mist out of your eyes.' },
  // Knight set (plate, silver with blue trim)
  knight_plate: { name: 'Knight\'s Plate', type: 'armor', icon: 'knight_plate', lv: 10, def: 22, hp: 40, price: 7200, desc: 'Polished silver plate with blue enamel trim.',
    look: { color: '#c9d2de', style: 'metal', trim: '#2f63c8', pieces: ['pauldrons', 'chest', 'belt'] } },
  knight_greaves: { name: 'Knight\'s Greaves', type: 'pants', icon: 'knight_greaves', lv: 10, def: 12, price: 4200, desc: 'Articulated plate for the legs.',
    look: { color: '#c9d2de', style: 'metal', trim: '#2f63c8', pieces: ['knees'] } },
  knight_boots: { name: 'Knight\'s Sabatons', type: 'boots', icon: 'knight_boots', lv: 10, def: 7, price: 3600, desc: 'Steel sabatons with shin guards.',
    look: { color: '#c9d2de', style: 'metal', trim: '#2f63c8', pieces: ['greaves'] } },
  knight_helm: { name: 'Knight\'s Helm', type: 'helm', icon: 'knight_helm', lv: 10, def: 7, price: 3000, desc: 'A visored silver helm.' },
  ring_copper: { name: 'Copper Ring', type: 'ring', icon: 'ring_copper', lv: 1, str: 1, price: 200, desc: 'STR +1' },
  ring_ruby: { name: 'Ruby Ring', type: 'ring', icon: 'ring_ruby', lv: 10, str: 3, hp: 20, price: 5000, desc: 'STR +3, HP +20' },
  necklace_jade: { name: 'Jade Necklace', type: 'necklace', icon: 'necklace_jade', lv: 5, end: 2, hp: 15, price: 900, desc: 'END +2, HP +15' },
  earring_silver: { name: 'Silver Earring', type: 'earring', icon: 'earring_silver', lv: 4, dex: 2, price: 700, desc: 'DEX +2' },
};
export const EQUIP_SLOTS = ['helm', 'necklace', 'earring', 'weapon', 'armor', 'gloves', 'ring', 'pants', 'boots'];
export const EQUIP_SLOT_NAMES = { helm: 'Head', necklace: 'Necklace', earring: 'Earring', weapon: 'Weapon', armor: 'Armor', gloves: 'Gloves', ring: 'Ring', pants: 'Pants', boots: 'Boots' };

// ------------------------------------------------------------------ monsters
export const MONSTERS = {
  slime: {
    name: 'Slime', baseLv: 1, hp: 26, atk: [5, 8], def: 1, exp: 3, copper: [6, 14], speed: 2.4, range: 1.3, atkCd: 1.9,
    aggressive: false, leash: 22, respawn: 14,
    drops: [['slime_jelly', 0.6], ['hp_potion_s', 0.06], ['apple', 0.05]],
  },
  mushroom: {
    name: 'Mushroom', baseLv: 3, hp: 58, atk: [9, 13], def: 4, exp: 9, copper: [12, 26], speed: 2.1, range: 1.5, atkCd: 2.0,
    aggressive: false, leash: 22, respawn: 16,
    drops: [['mushroom_spore', 0.5], ['mushroom_cap', 0.3], ['hp_potion_s', 0.08], ['sp_potion_s', 0.05], ['boots_leather', 0.02]],
  },
  imp: {
    name: 'Imp', baseLv: 5, hp: 105, atk: [14, 20], def: 7, exp: 20, copper: [22, 45], speed: 3.4, range: 1.6, atkCd: 1.8,
    aggressive: false, assist: 9, leash: 26, respawn: 18,
    drops: [['imp_claw', 0.45], ['imp_wing', 0.3], ['hp_potion_s', 0.08], ['sp_potion_s', 0.06], ['imp_blade', 0.02], ['gloves_leather', 0.03], ['earring_silver', 0.015]],
  },
  bee: {
    name: 'Honey Bee', baseLv: 5, hp: 92, atk: [14, 19], def: 6, exp: 18, copper: [20, 40], speed: 3.1, range: 1.6, atkCd: 1.7,
    aggressive: true, aggroRange: 7, leash: 26, respawn: 18, flying: true,
    drops: [['bee_honey', 0.4], ['bee_stinger', 0.25]],
  },
  boar: {
    name: 'Wild Boar', baseLv: 7, hp: 150, atk: [20, 28], def: 10, exp: 32, copper: [30, 60], speed: 3.4, range: 1.9, atkCd: 2.1,
    aggressive: true, aggroRange: 8, leash: 28, respawn: 20,
    drops: [['boar_tusk', 0.35], ['boar_hide', 0.4]],
  },
  // ---- rat-men of the Forest of Mist / Cyclone Hill (skinned model; ko = knocked out instead of killed).
  // The higher up the hill, the stronger, more aggressive and more deeply hypnotised (tier tint + glow).
  ratman: {
    name: 'Ratman', model: 'ratman_mob', variant: 'forest', ko: true, baseLv: 3, hp: 72, atk: [10, 15], def: 4, exp: 12, copper: [14, 30],
    speed: 2.6, range: 1.7, atkCd: 2.1, aggressive: false, leash: 24, respawn: 20,
    drops: [['rat_whisker', 0.5], ['hp_potion_s', 0.08], ['sp_potion_s', 0.05], ['bread', 0.05]],
  },
  ratman_digger: {
    name: 'Ratman Digger', model: 'ratman_mob', variant: 'digger', ko: true, baseLv: 6, hp: 130, atk: [16, 23], def: 7, exp: 26, copper: [26, 50],
    speed: 2.7, range: 1.7, atkCd: 2.0, aggressive: false, leash: 24, respawn: 20,
    drops: [['rat_whisker', 0.55], ['hp_potion_s', 0.1], ['sp_potion_s', 0.06], ['boots_leather', 0.02]],
  },
  ratman_hypno: {
    name: 'Hypnotized Ratman', model: 'ratman_mob', variant: 'hypno', ko: true, baseLv: 8, hp: 200, atk: [23, 31], def: 10, exp: 44, copper: [40, 75],
    speed: 2.9, range: 1.8, atkCd: 1.9, aggressive: true, aggroRange: 4.5, leash: 22, respawn: 22,
    drops: [['rat_whisker', 0.6], ['hp_potion_m', 0.08], ['sp_potion_m', 0.05], ['gloves_leather', 0.03]],
  },
  ratman_frenzy: {
    name: 'Frenzied Ratman', model: 'ratman_mob', variant: 'frenzy', ko: true, scale: 1.08, baseLv: 11, hp: 300, atk: [31, 41], def: 14, exp: 78, copper: [60, 110],
    speed: 3.1, range: 1.9, atkCd: 1.8, aggressive: true, aggroRange: 5, leash: 22, respawn: 24,
    drops: [['rat_whisker', 0.65], ['hp_potion_m', 0.1], ['sp_potion_m', 0.07], ['helm_iron', 0.02], ['necklace_jade', 0.015]],
  },
  kingslime: {
    name: 'Slime King', baseLv: 9, hp: 950, atk: [26, 36], def: 11, exp: 320, copper: [700, 1200], speed: 2.2, range: 3.2, atkCd: 2.6,
    aggressive: true, aggroRange: 9, leash: 30, respawn: 150, boss: true,
    drops: [['king_crown_shard', 1], ['sword_knight', 0.3], ['ring_ruby', 0.25], ['hp_potion_m', 0.8]],
  },
  // mid boss in front of the Tower of Isel (AI + mechanics: entities/bosses/cumbot.js). leash = arena radius
  cumbot: {
    name: 'Cumbot 9000', baseLv: 15, hp: 5200, atk: [34, 46], def: 18, exp: 1800, copper: [2500, 4200], speed: 3.1, range: 2.2, atkCd: 2.8,
    aggressive: true, aggroRange: 13, leash: 30, respawn: 300, boss: true,
    drops: [['cumbot_core', 1], ['hp_potion_l', 0.7], ['sp_potion_l', 0.5], ['knight_helm', 0.15], ['ring_ruby', 0.2], ['necklace_jade', 0.25]],
  },
};

export function monsterStats(type, lv) {
  const d = MONSTERS[type];
  const k = lv - d.baseLv;
  return {
    maxHp: Math.round(d.hp * Math.pow(1.25, k)),
    atk: [Math.round(d.atk[0] * Math.pow(1.12, k)), Math.round(d.atk[1] * Math.pow(1.12, k))],
    def: Math.round(d.def + k * 1.5),
    exp: Math.round(d.exp * Math.pow(1.2, k)),
    evasion: 2 + lv,
    aim: 4 + lv * 1.5,
  };
}

// ------------------------------------------------------------------ NPCs
// spot = key from town npcSpots; shop = list of item ids; roles: quest | shop | healer | skills | storage | talk
export const NPCS = [
  { id: 'chief', spot: 12, rot: 2.6, name: 'Oswin', title: 'Town Chief', look: 'elder', roles: ['quest'],
    greet: 'Welcome to Roumen, young fighter! Our harbour town has had troubles with monsters lately. Could you lend us your blade?' },
  { id: 'healer', spot: 1, rot: -2.4, name: 'Lina', title: 'Healer', look: 'healer', roles: ['healer', 'shop', 'quest'],
    shop: ['hp_potion_s', 'hp_potion_m', 'hp_potion_l', 'sp_potion_s', 'sp_potion_m', 'sp_potion_l'],
    greet: 'Hello dear! Hurt? I can refill your HP and SP stones, or sell you some potions.' },
  { id: 'merchant', spot: 15, rot: 3.0, name: 'Pim', title: 'Item Merchant', look: 'merchant', roles: ['shop', 'quest'],
    shop: ['hp_potion_s', 'sp_potion_s', 'return_scroll', 'bread', 'apple'],
    greet: 'Step right up! The finest goods in all of Roumen, at prices that won\'t empty your pouch.' },
  { id: 'smith', spot: 4, rot: 3.1, name: 'Garrick', title: 'Blacksmith', look: 'smith', roles: ['shop', 'quest'],
    shop: ['sword_wood', 'sword_bronze', 'sword_iron', 'greatsword_flame', 'twin_daggers', 'twin_sabers', 'twin_fangs', 'ring_copper'],
    greet: 'A fighter needs a proper blade. Have a look — every one of these was forged right here.' },
  { id: 'armorer', spot: 3, rot: 0, name: 'Helga', title: 'Armor Merchant', look: 'armorer', roles: ['shop'],
    shop: ['armor_cloth', 'traveler_tunic', 'traveler_pants', 'traveler_shoes', 'armor_leather', 'pants_leather', 'boots_leather', 'helm_leather', 'gloves_leather',
      'ranger_vest', 'ranger_pants', 'ranger_boots', 'ranger_hood', 'armor_plate', 'pants_plate', 'boots_plate', 'helm_iron', 'gloves_plate',
      'knight_plate', 'knight_greaves', 'knight_boots', 'knight_helm'],
    greet: 'Good armor keeps you alive. Good armor from Helga keeps you alive AND stylish.' },
  { id: 'skillmaster', spot: 5, rot: 0, name: 'Ren', title: 'Skill Master', look: 'master', roles: ['skills'],
    greet: 'Strength without technique is nothing. Show me you are ready and I will teach you.' },
  { id: 'storage', spot: 6, rot: 3.1, name: 'Rosa', title: 'Storage Keeper', look: 'storage', roles: ['talk'],
    greet: 'Your belongings are safe with me. (Storage is not available yet.)' },
  { id: 'guard1', spot: 7, rot: -1.2, name: 'Bram', title: 'Town Guard', look: 'guard', roles: ['talk'],
    greet: 'The ramp behind me leads up to the meadows. Slimes are harmless, mushrooms a bit grumpy — and the imps up north-east come in packs!' },
  { id: 'guard2', spot: 2, rot: 2.2, name: 'Tomas', title: 'Town Guard', look: 'guard', roles: ['quest'],
    greet: 'The stairs by the harbour lead up the east cliffs. Keep your eyes open up there, fighter.' },
  { id: 'kid', spot: 8, rot: 1.0, name: 'Mia', title: 'Villager', look: 'kid', roles: ['talk'],
    greet: 'The Teleport Gate is sooo pretty! Mister Otto says it won\'t open until the mages come back, though.' },
  { id: 'farmer', spot: 9, rot: 3.0, name: 'Hob', title: 'Farmer', look: 'farmer', roles: ['talk'],
    greet: 'Those mushrooms keep walking off the meadows above town. Walking! Can you believe it?' },
  { id: 'bard', spot: 10, rot: 3.0, name: 'Elio', title: 'Traveling Bard', look: 'bard', roles: ['talk'],
    greet: '♪ In Roumen town by the shining sea, a fighter\'s tale begins... ♪' },
  { id: 'harbor', spot: 11, rot: 2.4, name: 'Otto', title: 'Harbor Master', look: 'farmer', roles: ['talk'],
    greet: 'The pier leads to the old lighthouse. Strange lights have been swirling down there lately — nobody dares to step through.' },
  { id: 'captain', spot: 13, rot: 2.6, name: 'Marla', title: 'Ship Captain', look: 'armorer', roles: ['talk'],
    greet: 'My ship isn\'t ready to sail yet. Come back when the harbour is open for voyages!' },
  { id: 'sailor', spot: 14, rot: 3.6, name: 'Finn', title: 'Sailor', look: 'merchant', roles: ['talk'],
    greet: 'Arr, the sea breeze on this island is the best in all of Roumen.' },
  // stable keeper: gives the mounts through a short starter quest chain; his donkey waits next to him
  { id: 'stable', pos: [-34.5, 13.5], rot: 0.9, name: 'Nilo', title: 'Stable Keeper', look: 'farmer', roles: ['quest'], pet: 'donkey',
    greet: 'Still walking everywhere on foot? My critters could carry you — if you help us out a little first.' },

  // ---- Cyclone Hill / Forest of Mist (world: 'cyclone'; pos = world x,z instead of a Roumen map spot)
  { id: 'sir_ratman', world: 'cyclone', pos: [6, 146], rot: Math.PI, name: 'Sir Ratman', title: 'Rat Knight', model: 'ratman', roles: ['quest'],
    wander: { r: 9 }, art: '/art/sir_ratman.png',
    greet: 'Hm? A traveller in the Forest of Mist? How delightfully unexpected.',
    greetLines: [
      'Hm? A traveller in the Forest of Mist? How delightfully unexpected.',
      'Mind the mist, friend. It has a habit of swallowing the careless.',
      'They call me Sir Ratman. The "Sir" is self-appointed, but it stuck.',
      'Up on Cyclone Hill the wind never sleeps. Neither do the things that live there.',
      'I shall have tasks for brave souls soon. Until then, enjoy the waterfalls.',
      'This pickaxe? Merely a gentleman\'s walking stick. Mostly.',
    ] },
  // Robo, King of Beasts: waits where the forest trail meets Cyclone Hill and hands out the Robo Blades once
  { id: 'robo', world: 'cyclone', pos: [10, 47], rot: -1.18, name: 'Robo', title: 'King of Beasts', model: 'robo', roles: ['quest'],
    greetPose: 'flex', poses: ['lookout', 'stretch', 'flex'],
    gift: {
      item: 'robo_blades',
      text: 'So, a cub found its way through the mist. Listen well: the rat-folk of this hill are my subjects too, and something has clouded their minds. They are not your enemy — they are lost. Take my old twin fangs. One burns like the setting sun, one like the deep sea. Use them to bring my people back, not to end them.',
      button: 'Accept the Robo Blades',
      done: 'The Robo Blades are yours now, cub. Two fangs, two hands — strike true, and spare the rat-folk.',
    },
    greet: 'The wind on Cyclone Hill carries many scents. Lately, most of them are fear.',
    greetLines: [
      'The wind on Cyclone Hill carries many scents. Lately, most of them are fear.',
      'I am Robo, King of Beasts. Every creature of this land is under my care — even the stubborn ones.',
      'Climb the hill, cub. Ring by ring, bridge by bridge.',
      'The rat-folk were never this restless. Something up there is pulling their strings.',
      'Sir Ratman talks too much, but his heart is in the right place. Listen to him.',
    ] },
];

// ------------------------------------------------------------------ quests
export const QUESTS = {
  q_welcome: {
    name: 'Welcome to Roumen', giver: 'chief', turnin: 'healer', level: 1,
    text: 'The chief wants you to meet Lina the Healer. She will refill your HP and SP stones whenever you need.',
    goal: { type: 'talk', npc: 'healer' },
    reward: { exp: 8, copper: 50, items: [['hp_potion_s', 5]] },
  },
  q_slimes: {
    name: 'Slime Trouble', giver: 'chief', level: 1, requires: ['q_welcome'],
    text: 'Slimes are bouncing around the western path above town. Take the ramp at the west end of the main street and defeat 5 Slimes.',
    goal: { type: 'kill', target: 'slime', count: 5 },
    reward: { exp: 30, copper: 120, items: [['sword_bronze', 1]] },
  },
  // stable keeper chain: raccoon mount first, then the (faster) donkey
  q_mount_raccoon: {
    name: 'A Raccoon Friend', giver: 'stable', level: 1,
    text: 'A young raccoon keeps getting chased by slimes on the western path above town. Defeat 5 Slimes so it feels safe again — then it will gladly carry you around.',
    goal: { type: 'kill', target: 'slime', count: 5 },
    reward: { exp: 25, copper: 60, items: [['mount_raccoon', 1]] },
  },
  q_mount_donkey: {
    name: 'The Stubborn Donkey', giver: 'stable', level: 2, requires: ['q_mount_raccoon'],
    text: 'Nilo\'s donkey refuses to set a hoof outside while mushrooms stomp around the northern meadows. Defeat 5 Mushrooms and it will be your loyal (and quick) companion.',
    goal: { type: 'kill', target: 'mushroom', count: 5 },
    reward: { exp: 60, copper: 150, items: [['mount_donkey', 1]] },
  },
  q_spores: {
    name: 'A Spore Harvest', giver: 'smith', level: 3,
    text: 'Garrick needs mushroom spores to temper his blades. Bring him 5 Mushroom Spores from the northern meadows.',
    goal: { type: 'collect', item: 'mushroom_spore', count: 5 },
    reward: { exp: 70, copper: 200, items: [['armor_leather', 1]] },
  },
  q_imps: {
    name: 'Imp Menace', giver: 'guard2', level: 5,
    text: 'Imps have been sneaking down the east cliffs near Sand Beach. Beware — when you hit one, its friends come running! Defeat 6 Imps.',
    goal: { type: 'kill', target: 'imp', count: 6 },
    reward: { exp: 220, copper: 500, items: [['sp_potion_m', 5]] },
  },
  q_claws: {
    name: 'Claws for Sale', giver: 'merchant', level: 5,
    text: 'Pim swears imp claws make excellent fishing hooks. Bring him 4 Imp Claws from the eastern loop.',
    goal: { type: 'collect', item: 'imp_claw', count: 4 },
    reward: { exp: 180, copper: 450, items: [['sword_iron', 1]] },
  },
  q_king: {
    name: 'The Slime King', giver: 'chief', level: 8, requires: ['q_slimes'],
    text: 'A giant crowned slime rules the northern meadows above the town. Defeat the Slime King and bring peace to Roumen!',
    goal: { type: 'kill', target: 'kingslime', count: 1 },
    reward: { exp: 900, copper: 3000, items: [['ring_ruby', 1]] },
  },
  // Cyclone Hill: Sir Ratman sends the hero after the machine that hypnotises his people
  q_cumbot: {
    name: 'The Jolly Machine', giver: 'sir_ratman', level: 12,
    text: 'Beyond the sky bridge, in the Windward Glade before the Tower of Isel, stands a jolly-looking machine called Cumbot 9000. Its humming clouds the minds of my people. Shut it down! Beware: it lobs slime, and whoever stands in the path of its pink cannon beam forgets how to move for a moment.',
    goal: { type: 'kill', target: 'cumbot', count: 1 },
    reward: { exp: 2400, copper: 6000, items: [['hp_potion_l', 5], ['sp_potion_l', 3]] },
  },
};

export const STARTING = {
  money: 180,
  stones: { hp: 15, sp: 7 },
  stoneMax: (lv) => ({ hp: 15 + lv * 2, sp: 7 + lv }),
  stonePrice: { hp: 4, sp: 6 },
  inventory: [['hp_potion_s', 10], ['sp_potion_s', 5], ['bread', 3], ['return_scroll', 1]],
  equipment: { weapon: 'sword_wood', armor: 'armor_cloth' },
};
