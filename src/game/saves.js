// Character slots for the character-select terrace: up to SLOT_COUNT heroes, each saved under its own key.
// The first run migrates the old single save into the first seat (or seats the default hero there).
const LEGACY_KEY = 'roumen-online-save-v1';
const SLOT_KEY = (i) => `scamigo-char-${i}`;
const ACTIVE_KEY = 'scamigo-active-slot';
const INIT_KEY = 'scamigo-slots-init';
export const SLOT_COUNT = 6;

// selectable looks (null = the model's own colours: blue hair, white shirt)
export const HAIR_COLORS = [null, '#c9303a', '#f0b43c', '#e9edf5', '#2b2833', '#3faa66', '#ff82bd', '#8b5cf2'];
export const OUTFIT_COLORS = [null, '#c63b3b', '#3a6fd0', '#3d9a5a', '#34323d', '#e3a834', '#8e52cc'];
export const WORLD_NAMES = { roumen: 'Roumen', cyclone: 'Cyclone Hill', isel: 'Tower of Isel' };

function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } }
export function loadSlot(i) { return read(SLOT_KEY(i)); }
export function saveSlot(i, data) { return write(SLOT_KEY(i), data); }
export function deleteSlot(i) { try { localStorage.removeItem(SLOT_KEY(i)); } catch { /* storage unavailable */ } }
export function listSlots() { return Array.from({ length: SLOT_COUNT }, (_, i) => loadSlot(i)); }

export function getActiveSlot() {
  const n = read(ACTIVE_KEY);
  return Number.isInteger(n) && n >= 0 && n < SLOT_COUNT ? n : 0;
}
export function setActiveSlot(i) { write(ACTIVE_KEY, i); }

// saved look -> rig look overrides (see playerModel.applyPlayerTint)
export function tintOf(look) { return { hairTint: (look && look.hair) || null, outfitTint: (look && look.outfit) || null }; }

// a brand new hero: the game fills in the starting stats on the first load
export function newCharacter(name, look = {}) {
  return { fresh: true, name, look: { hair: look.hair || null, outfit: look.outfit || null }, level: 1, world: 'roumen', created: Date.now() };
}

export function initSlots() {
  if (read(INIT_KEY)) return;
  if (!listSlots().some(Boolean)) {
    const legacy = read(LEGACY_KEY);
    saveSlot(0, legacy || newCharacter('Ryou'));   // (the legacy key stays untouched as a backup)
    setActiveSlot(0);
  }
  write(INIT_KEY, 1);
}
