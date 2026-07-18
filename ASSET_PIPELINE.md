# Asset and narration handoff

The experience works entirely with original procedural geometry today. To move it to a finished production look, replace the character and hero-prop builders with original or properly licensed `.glb` files. Keep one model sheet per recurring character so Jalen, Maya, Leo, Thorne, and Naia retain the same silhouette, palette, hair, and costume language in every chapter.

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
