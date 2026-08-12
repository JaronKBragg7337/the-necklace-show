# The Necklace — production bible

This document turns the book's central idea into a consistent screen language.
It is a constraint against generic fantasy imagery: every visual choice should
make the Weaver's specific power clearer.

## The dramatic rule

The Weaver does not simply show “the past.” It lets a bearer experience what an
object, place, or living witness has retained. Truth is available before proof,
permission, context, or emotional readiness.

That distinction creates the story:

- Jalen can know what happened without having evidence anybody else can use.
- Maya can meet history from the viewpoint of what survived it.
- Leo can pursue justice while confronting the gap between truth, law, and
  admissible proof.
- Every activation broadcasts the Weaver's location to people who treat memory
  as a resource to own.

## Visual grammar

### Present reality

Grounded, tactile, and salt-worn. Caribbean ports use warm practical light,
joinery, oxidized hardware, imperfect plaster, working rigging, and materials
that imply climate and maintenance. The world should still make sense with the
magic turned off.

### Object memory

Begin with the witness object in macro detail. Let its scratches, residue,
grain, or corrosion become the transition into memory. Archive imagery may
fracture in time, but it retains the object's spatial point of view. Avoid a
generic blue flash that could represent any superpower.

### Seeker technology

Archaeological futurism, not smooth science-fiction furniture. Ancient masonry,
machined brass, replaceable bearings, exposed conduits, fasteners, calibrated
dials, containment gimbals, and crystalline sensors coexist. Every instrument
must suggest how it is supported, powered, serviced, and read.

### The Heart of the Tides

Nature and technology become difficult to separate. Rock strata, sand geometry,
bioluminescent water, and Keeper vessels share rhythms without sharing the same
material. The Keepers preserve memory; the Seekers extract it.

## Scale and continuity

One Three.js unit equals one metre.

| Asset | Screen-scale target | Continuity cue |
| --- | ---: | --- |
| Sea Serpent | about 9 m / 30 ft overall | carvel hull, warm timber, tan sails, name decal, analog deck hardware |
| Serpent's Shadow | 12.2 m | black armoured panels, cyan identity seam, sensor mast, waterjet pods |
| Keeper vessel | 11.4 m | exposed keel spine, tidal ribs, crystal pylon, paired drive pods |
| Jalen | 1.70–1.78 m | broad silhouette, brown field coat, beard, practical sailor layers |
| Maya | about 1.50 m in Book One | violet field coat, long hair, archaeology satchel |
| Leo | about 1.05 m in Book One | blue coat, compact silhouette, compass/justice badge |
| Thorne | about 1.80 m | narrow black silhouette, high collar, silver hair, III insignia |
| Naia | about 2.10 m | tidal-blue robe, crystal crown and staff, elongated authority |
| 1708 lockbox | about 0.66 m wide in discovery shots | timber body, forged bands, working hinges, engraved date |

Recurring assets must come from shared builders or a single approved model so
silhouette, palette, scale, and attachment points do not drift between chapters.

## Branching story languages

The same power should feel different because the dramatic problem changes, not
because its rules change.

### FBI / investigative future

An object supplies truth but not chain of custody. The visual tension is between
the complete memory Jalen or Leo experiences and the incomplete lawful case
that investigators can actually present. Evidence markers, timestamps, touch
contamination, warrants, and corroborating records become suspense rather than
interface decoration.

### Archaeological future

Maya works through strata and competing witnesses: bone, pottery, architecture,
tools, soil, and written records may retain different pieces of the same event.
The camera can move from physical micro detail to reconstructed use, then back
to the damaged artifact with new meaning.

### Future technology

Devices do not replace the Weaver; they measure its broadcasts, attenuate the
psychological load, isolate a witness, or attempt to record an experience that
was never meant to leave one mind. Calibration limits and mechanical failure
keep the technology dramatic.

## Production roadmap

The procedural pass in the repository establishes scale, materials, silhouettes,
construction logic, and recurring visual identity. A feature-film finish still
requires shot-specific work:

1. Original, rigged hero characters with facial topology, skin/hair shading,
   costume simulations, and acting animation.
2. Shot-specific hero models for hands, the Weaver, the lockbox, the Sea Serpent,
   and Seeker machinery where macro photography exposes sub-millimetre detail.
3. Authored performances, blocking, collision-aware movement, and secondary
   animation for cloth, rope, hair, water interaction, and machinery.
4. A post pipeline with temporal antialiasing, controlled bloom, depth of field,
   motion blur, volumetrics, grading, and shot-level exposure.
5. Recorded dialogue, narration, score, foley, ambience, and a final mix with
   captions retained as the accessible fallback.
6. LODs, GPU-compressed textures, instancing, occlusion strategy, and measured
   desktop/mobile frame budgets before increasing texture resolution.

No shot should be declared finished because it merely contains more polygons.
It is finished when story information, silhouette, construction, material
response, performance, sound, and composition all survive the intended camera.
