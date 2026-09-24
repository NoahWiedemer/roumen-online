# Roumen Online

Ein Browser-MMORPG-Fanprojekt, angelehnt an Look, Steuerung und HUD-Aufbau von *Fiesta Online*. Alles ist eigene Grafik und wird im Code erzeugt: 3D-Modelle, Texturen, Icons, Sounds und Musik. Technik: Three.js mit Vite.

## Starten

```bash
npm install
npm run dev
```

Danach http://localhost:5173 öffnen.

## Steuerung

| Eingabe | Aktion |
|---|---|
| Linksklick (Boden) | Dorthin laufen (mit Wegfindung) |
| Linksklick (Monster / NPC) | Ziel auswählen / NPC ansprechen |
| Doppelklick / Rechtsklick auf Monster | Angreifen (Auto-Angriff) |
| W A S D | Laufen (relativ zur Kamera) |
| Rechte Maustaste halten + ziehen | Kamera drehen |
| Mausrad, Bild↑/Bild↓ | Zoomen |
| Tab | Nächstes Monster anvisieren |
| 1 – 0, ß/-, ´/= | Skillbar 1 (mit Shift: Skillbar 2) |
| Q / E | HP- / SP-Stein benutzen |
| Leertaste | Springen |
| Z | Gehen / Rennen umschalten |
| Pos1 (Home) | Hinsetzen (Regeneration) |
| H | Mini-Haus (starke Regeneration) |
| C / I / K / L / M | Charakter, Inventar, Skills, Quests, Karte |
| V / F / X / F10 | Aktionen, Community, Store, Hilfe |
| Esc | Fenster schließen, dann Ziel abwählen, dann Optionen |

Weitere Bedienung:
- **Inventar:** Rechtsklick oder Doppelklick benutzt bzw. rüstet aus. Bei offenem Shop verkauft Rechtsklick den Gegenstand.
- **Skillbar:** Skills und Tränke per Drag & Drop hineinziehen. Einträge aus der Leiste herausziehen entfernt sie.
- **Minimap:** Ein Klick darauf lässt dich dorthin laufen. Die Buttons zoomen und öffnen die Gebietskarte.

## Inhalt

- **Roumen nach der Originalkarte:** Hafenstadt mit drei Häuserreihen entlang der Hauptstraße und großem Hafen- und Marktplatz mit Brunnen am Meer. Dazu gehören die runde Insel mit Achteck-Bau (über eine Holzbrücke erreichbar) und der Südwest-Pier mit Leuchtturm.
- **Rundweg:** Rechts führt eine Steintreppe hinauf auf den hellgrünen Rundweg um die zwei Waldhügel.
- **Monster:** Schleime im Westen, Pilze im Norden, Imps im Osten (sie rufen ihre Freunde zu Hilfe) und der Schleimkönig oben in der Mitte.
- **Portale:** Forest of Tides, Sand Beach, Teleport Gate, Sea of Greed und Secret Basement. Es sind animierte grüne Wirbel mit schwebenden Steinen; sie sind vorerst versiegelt.
- **Fighter:** Stats STR, END, DEX, INT und SPR plus 1 freier Stat-Punkt pro Level. Zehn Skills lernst du bei Skill-Meister Ren. Dazu kommen eine 3er-Angriffskombo, HP-/SP-Steine (Heilerin Lina füllt sie auf), Tränke, Ausrüstung und Geld in Kupfer, Silber, Gold und Gem.
- **NPCs:** 15 Stück an den Positionen der Karte, darunter Questgeber mit `!`- und `?`-Markern, Shops, Heilerin und Skill-Meister.
- **Speichern:** Der Fortschritt landet automatisch im `localStorage`. Über Optionen → „Reset character“ fängst du neu an.

## Eigene 3D-Modelle (Blender) einbinden

Blender wird dafür nicht benötigt. `tools/blend2glb.py` liest unkomprimierte `.blend`-Dateien direkt (Mesh, UVs und eingebettete Texturen) und schreibt eine `.glb`. `gltfpack` reduziert danach die Polygonzahl:

```bash
cd tools && python3 blend2glb.py modell.blend out/modell_raw.glb --tex 1024
cd .. && npx gltfpack -i tools/out/modell_raw.glb -o public/models/modell.glb -si 0.02 -noq
```

`tools/make_zones.py` erzeugt aus der Referenzkarte die Zonenkarte `src/world/zonemap.js` mit Meer, Platz, Stadt, Feld und Wald.

## Projektstruktur

```
src/
  core/      Engine (Renderer, Bloom, Schatten), Input, Kamera, Sound-Synth, Texturen, Batcher
  world/     Layout, Terrain (Heightmap + Splat-Shader), Himmel, Vegetation, Kollision/Pathfinding, town/
  entities/  Humanoid-Rig + Fighter, Animationssystem, Monster (+ monsters/ Modelle), NPCs, Loot, Effekte
  game/      Daten (Skills, Items, Monster, Quests), Questlog, globales Spielobjekt
  ui/        HUD, Fenster, Icons (Canvas-gemalt), Portraits, style.css
  dev/       Modell-Viewer (viewer.html?scene=fighter|monsters|town|pose)
```

## Debug-Parameter

`/?autostart=1&pos=x,z&yaw=..&pitch=..&dist=..&win=inventory,character&hideui` überspringt den Startbildschirm und setzt Spieler und Kamera.
