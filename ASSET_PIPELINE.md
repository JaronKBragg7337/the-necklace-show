# Asset and narration handoff

The experience uses original procedural geometry, now organized as constructed
assemblies instead of single primitive stand-ins. Shared builders provide the
current metrically scaled Sea Serpent, Seeker craft, Weaver lockbox, cast,
terrain, port architecture, and Seeker machinery. Future original or properly
licensed `.glb` assets can replace a builder without changing chapter logic.

Keep one model sheet per recurring character so Jalen, Maya, Leo, Thorne, and
Naia retain the same silhouette, palette, hair, and costume language in every
chapter. Match the current one-unit-equals-one-metre convention and preserve
the named attachment points in `userData` for animated crystals, hinges, rings,
and other story-critical components.

## Surface standard

- Use color, OpenGL normal, and packed ARM (AO / roughness / metalness) maps.
- Record source URL, artist, license, download date, physical dimensions, and
  checksum before adding a file.
- Prefer 1K for recurring web materials; reserve 2K for a hero asset proven to
  need it in a close shot.
- Keep a consistent physical repeat scale and introduce macro variation so
  repeated surfaces do not reveal a visible tile grid.
- Bundle cleared assets locally. The public show must not depend on a third-party
  texture API at runtime.

The current CC0 texture manifest and human-readable provenance are in
[`assets/textures/`](./assets/textures/PROVENANCE.md).

## Recorded narration and dialogue

Put final, cleared recordings in `assets/audio/` and map each chapter to its file in `assets/audio/manifest.json`:

```json
{
  "chapters": {
    "1": "chapter-01.mp3",
    "2": "chapter-02.mp3"
  }
}
```

The player loads a chapter’s file only when it exists; captions remain available as the accessible fallback. Keep dialogue, narration, music, and effects licensed for public redistribution.

## Suggested asset package

- `characters/`: five original, game-ready GLB character models with shared PBR texture resolution.
- `props/`: Sea Serpent, Serpent’s Shadow, lockbox, Weaver, Shard, tavern kit, Port Royal kit.
- `environments/`: modular dock, Caribbean port, Lisbon catacombs, Heart of the Tides cliff ring.
- `audio/`: chapter narration, character dialogue stems, ambience, thunder, and music stems.

Do not add a public license until the author has chosen one and confirmed that every included asset can be released under it.
