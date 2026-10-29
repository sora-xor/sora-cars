import * as THREE from 'three';
import { PIXEL_ART_BAND_OFFSET } from './glsl';
import type { PixelArtGrid } from './grid';
import { nearestPaletteIndex } from './linework';
import type { PixelPalette } from './palette';
import {
  artTarget, PIXEL_ART_GRADE, PIXEL_ART_LUT_ADDRESS, stageMaterial,
  type PixelArtSharedUniforms, type PixelArtStage,
} from './stages';

/**
 * Surface and temporal stages of the pixel-art renderer
 * (docs/pixel-art-renderer.md, "Implementation notes: surfaces and temporal"):
 *
 *   surface  - (after normals) a stable anchor per cell: the world position,
 *              a moving car's local position, or the view direction on the
 *              sky. From it: the band-offset field (world/object anchored,
 *              power-of-two lattices chosen from the cell's footprint along
 *              each axis, horizontal dashes), the wet-ground weight, the
 *              dash mask and a sparkle hash;
 *   reflect  - (after surface) wet-ground screen-space reflections at art
 *              resolution, stretched into vertical columns, broken by the
 *              dash mask and composited into the HDR before the grade;
 *   temporal - (after quantize) reprojection hysteresis: a cell keeps last
 *              frame's palette entry while it stays within a margin of the
 *              current best match. It does the palette snap itself, so the
 *              pass skips the quantize stage while it runs;
 *   sparkle  - (after cleanup) sparse single-cell sparkles on wet ground.
 *
 * The ground stage (docs: "Implementation notes: ground and lamp
 * reflections") lives inside these: the surface stage also writes the
 * ground's dash field, its upward-ground level and its lamp-lit fraction
 * (groundFields); the reflect composite turns ground into a dash mottle,
 * lamp pools into amber flecks and adds analytic lamp reflection columns;
 * the sparkle stage adds warm key glints on sunlit ground.
 */
export interface SurfaceOptions {
  /** 1 runs the stage, 0 skips it (A/B: the core placeholder band field, dry ground, no hysteresis). */
  surfaceField: number;
  wetGround: number;
  temporal: number;
  /** Band field feature size in art cells along the long (horizontal) and short axes of surfaces. */
  fieldDashCells: number;
  fieldRowCells: number;
  /** Band field gain on ground (upward world surfaces): the cutscenes' 3-4 tone horizontal mottle. */
  fieldGroundGain: number;
  /** World features are at least this many times the surface's per-frame travel (no strobing at speed). */
  fieldMotionStretch: number;
  /** Band field kept on walls that slide 4+ cells per frame (refine round 1: facade dashes boiled at speed). */
  fieldWallSpeed: number;
  /** Refine round 2: band field gain on walls at rest (lit falloffs break into ragged band edges). */
  fieldWallGain: number;
  /** The same on the sky, its amplitude relative to surfaces, and the cloud-cluster octave (lattice multiple and weight). */
  skyFieldScale: number;
  skyDashCells: number;
  skyRowCells: number;
  skyClusterScale: number;
  skyClusterWeight: number;
  /** World normal.y above which a surface is wet ground. */
  wetNormal: number;
  /** Reflection weight outside damp patches (dry weather; rain raises it to 1). */
  wetDampBase: number;
  /** Reflection strength (x Fresnel) and the extra factor for reflected sky. */
  wetReflection: number;
  wetSkyReflection: number;
  /** Longest reflection ray (m). */
  wetMaxDistance: number;
  /** Reflection columns: cells stretched toward the camera (down, at most 96) and away (up). */
  wetColumnDown: number;
  wetColumnUp: number;
  /** Exposure-scaled reflected light at which a reflection starts / fully stretches into a column; dimmer ones stay in their cell. */
  wetColumnStart: number;
  wetColumnFull: number;
  /** The least Fresnel share wet ground mirrors, where the view looks steeply down at the near road (0: physical). */
  wetFresnelFloor: number;
  /**
   * Refine round 4 ripple: before the columns stretch, each row of the wet road (world-anchored, about a cell tall)
   * spreads the reflections in it up to this many cells left and right, its own reach each side (0 off), losing
   * wetSpreadFalloff of the light per cell. A cutscene-style repaint of a race frame draws every light's reflection
   * wider than the light and rippled at its edges; stretched column by column, ours were as narrow as the lights.
   */
  wetSpread: number;
  wetSpreadFalloff: number;
  /**
   * Refine round 4 ripples (the user: "the road is more textured in the cutscene style mockups"): a light's column
   * breaks into organic blobs of water and dark asphalt, as the repaints draw a wet road, rather than stacked
   * one-cell dashes, which read as a scanline mosaic beside them. 1 on, 0 the dashes. Blobs about wetRippleCells
   * wide and wetRippleRows tall, holes where the field falls below wetRippleHoles, and wetRipplePebbles of the cells
   * dark specks. The field is laid out from the column's own source (rows counted from the light's mirror point,
   * across in world-anchored lateral cells), so it rides with the light at speed, as a reflection does.
   */
  wetRipple: number;
  wetRippleCells: number;
  wetRippleRows: number;
  wetRippleHoles: number;
  wetRipplePebbles: number;
  /**
   * The ripples' shape farther off: blobs wetRippleCellsFar wide and wetRippleRowsFar tall from wetRippleFarStart
   * metres (the reflection's own distance) on, eased from the near shape. The repaints break a reflection into
   * organic blobs near the camera and long vertical streaks down the road.
   */
  wetRippleCellsFar: number;
  wetRippleRowsFar: number;
  wetRippleFarStart: number;
  /**
   * Refine round 4 waves (the user: "cutscene road has horizontal wave patterns and lights that are vertical
   * reflections"): horizontal wave bands across the whole wet road, shared by every reflection, as the cutscenes
   * paint a wet street (radio-rain-v1: a light's reflection a vertical streak of horizontal strokes, the road between
   * in long horizontal bands). 1 on (in place of wetRipple's blobs). Bands wetWaveRowsNear rows apart at the bottom of
   * the screen, wetWaveRowsFar at wetWaveHorizon of its height and above; a band is a crest above wetWaveThreshold
   * (0-1), else a trough, where reflections fall to wetWaveTrough of their light. Crests on the dark road carry a sheen
   * of the night's ambient colour, wetWaveSheen (exposure-scaled luminance), in strokes about wetWaveStroke cells long.
   * Each row's reflections shift up to wetWaveJitter cells sideways (smoothly from row to row), so a light's streak
   * wavers like a reflection in rippled water.
   */
  wetWaves: number;
  /** Band value (0-1) above which a crest's ridge carries the sheen line: thin wave lines, not whole bands. */
  wetWaveRidge: number;
  wetWaveRowsNear: number;
  wetWaveRowsFar: number;
  wetWaveHorizon: number;
  wetWaveThreshold: number;
  wetWaveTrough: number;
  wetWaveSheen: number;
  wetWaveStroke: number;
  wetWaveJitter: number;
  /**
   * The waves' ripple dashes: every reflection on the wet road is drawn as short horizontal dashes (1 row, 2-4 cells,
   * screen rows), as the repaints draw it, their density following the reflection's light: full at wetWaveDashFull
   * (exposure-scaled luminance) and above, so a light's streak is dense dashes at its core thinning toward its edges.
   * The dark road keeps wetWaveDashBase of its cells as faint ripple marks (in the sheen colour). Broad reflections
   * break into vertical streaks about wetWaveStreak cells apart (anchored to the reflected source, so they ride with
   * it), the dashes between them thinned to wetWaveStreakFloor of their density.
   */
  wetWaveDashFull: number;
  wetWaveDashBase: number;
  wetWaveStreak: number;
  wetWaveStreakFloor: number;
  /**
   * Refine round 4 drizzle: on a wet road (wetness 0.7 and up, when the walkers open umbrellas) this share of wet
   * cells takes a pale speck, re-rolled about every other frame: drops landing in a still, light drizzle in motion.
   * Nearest the camera, where the road slides too fast for glitter, it is the asphalt's speckle.
   */
  wetDrizzle: number;
  /**
   * Refine round 4: how far pale reflections (white and cream signs, lit panels, the sky) turn toward the street
   * lamps' gold, 0-1, their light kept. The cutscene-style repaints draw the whole wet road gold under the street's
   * light, the white SORA billboard's reflection included; ours mirrored it cream-white. Coloured reflections (tail
   * lamps, neon) keep their hue.
   */
  wetReflectionWarmth: number;
  /** Dash mask: segment length in cells, fraction of segments on, reflection kept between dashes. */
  wetDashCells: number;
  wetDashDuty: number;
  wetDashGap: number;
  /** Refine round 2: a light's reflection column is stacked long dashes (cells, duty) with a share of whole rows kept, counted from its source. */
  wetColumnDashCells: number;
  wetColumnDashDuty: number;
  wetColumnRowKeep: number;
  /** Lit wet ground breaks into flecks: brightness swing of on/off dashes. */
  wetSheen: number;
  /** Sparkle density (fraction of wet cells) in lit or reflecting areas, and the rain-splash density in rain. */
  sparkleLit: number;
  sparkleRain: number;
  /**
   * Refine round 4 glitter (the user's rain-night concept, whose wet asphalt
   * is speckled all over with the light it mirrors): in full colour, this
   * share of calm damp-or-wetter cells (0 off) takes its own colour lifted by
   * wetGlitterLift (OKLab L) with its chroma raised, so specks read violet off
   * the night sky, gold under lamps and pink or green under signs. Surface
   * anchored like the sparkles, and gone where the ground slides fast.
   */
  wetGlitter: number;
  wetGlitterLift: number;
  /** The share of the glitter drawn as trails where the ground slides fast (0 off). */
  wetGlitterTrail: number;
  /** Warm key glints on sunlit ground: density at the key's specular peak, and the lobe exponent (larger: a tighter glare zone). */
  sparkleKey: number;
  sparkleKeyLobe: number;
  /** Weighted OKLab distance by which last frame's entry may be worse than the best and still be kept. */
  temporalMargin: number;
  /** Relative depth mismatch that marks a reprojected history cell as a different surface. */
  temporalDepthTolerance: number;
  /** The margin on ground drawn with screen-row dashes at speed, whose history is the same screen cell. */
  temporalSpeedMargin: number;
  /** Refine round 2: the margin on car cells (reprojected with their car). */
  temporalCarMargin: number;
  /** Ground at speed: edge-preserving smoothing of the rendered asphalt (0-1), whose texture aliases at 30+ cells per frame. */
  groundSpeedSmooth: number;
  /**
   * Refine round 4: the share of that smoothing upright world surfaces (walls, shop windows, signs, walkers) take at
   * speed. 0 keeps them crisp: smoothed, a shop's interior, its lettering and the walkers' faces blurred into soft
   * blobs whenever the car moved, where a cutscene-style repaint of the same frame draws them sharp.
   */
  wallSpeedSmooth: number;
  /**
   * Refine round 2: walls, kerbs and trees sliding at least wallMotionStart
   * cells per frame average their light over this many frames of their screen
   * motion (0 off; 2: the period of their 30 Hz wagon-wheel strobe).
   */
  wallMotionFilter: number;
  wallMotionStart: number;
  /**
   * Temporal stability round: with wallMotionFilter on, only taps within this
   * many stops of the cell's own light are averaged (edge preserving: windows,
   * signs and pipes stay hard-edged; 0: the plain box of refine round 2).
   */
  wallMotionEdge: number;
  /**
   * Ground stage (docs/pixel-art-renderer.md, "Implementation notes: ground
   * and lamp reflections"). Switches: short broken dashes as the ground's band
   * field, lit-ground flecks, analytic lamp reflection columns.
   */
  groundDashes: number;
  litFlecks: number;
  lampColumns: number;
  /** 1: the reflection weight between damp patches fades as the road dries (sunrise), so a dry road stops mirroring the sky. */
  wetDryFade: number;
  /** 1: warm key glints on sunlit ground (sparkleKey, sparkleKeyLobe). */
  keyGlints: number;
  /** Ground dashes: mean length in cells (lengths run from half to twice it) and the per-row length spread (octaves). */
  groundDashCells: number;
  groundDashSpread: number;
  /** Share of a one-cell speckle mixed into the dash values (breaks dashes into 1-4 cell flecks). */
  groundSpeckle: number;
  /** Ground mottle: brightness swing of the dashes on all ground (x luminance, +-), the 3-4 tone asphalt mottle. */
  groundMottle: number;
  /** Share of the mottle kept on a dry road (sunrise-wide's asphalt is calmer than the wet harbour ground). */
  groundDryMottle: number;
  /** Lit flecks: density at full lamp light, lit light kept between flecks, brightest fleck (x the lit light). */
  fleckDensity: number;
  /** Exposure-scaled lamp-lit luminance where flecks start and where they reach full density (dim fringes: sparse flecks). */
  fleckLitStart: number;
  fleckLitFull: number;
  fleckGap: number;
  fleckBoost: number;
  /**
   * Refine round 2: share of the lamp-lit light the flecks carry on average
   * (the rest of the lit ground drops to fleckGap, so lit ground is flecks over
   * the violet base, never a wash), and the density share kept in dim fringes.
   */
  fleckKeep: number;
  fleckSparse: number;
  /** Lamp light (exposure-scaled luminance) kept in every lit ground cell, turned toward the ambient colour: the violet-grey ground between flecks. */
  fleckFloor: number;
  /** Share of the ground's one-cell speckle in the fleck pick (0: flecks are whole dashes; more: finer, single-cell flecks). */
  fleckSpeckle: number;
  /** How far the unlit base turns to the ambient colour (and the flecks to the lamps') in full lamp light. */
  fleckTint: number;
  /** Fleck contrast kept when the ground slides 4+ cells per frame (world-anchored dashes stretch rather than strobe). */
  fleckSpeedKeep: number;
  /** Scales the ambient irradiance that the lamp light is measured against (larger: smaller fleck pools). */
  groundAmbientScale: number;
  /** Albedo ratio to the ground either side at which a cell is a road marking (start, full): kept crisp. */
  markingStart: number;
  markingFull: number;
  /** Lamp columns: brightness (x the emitter radiance x Fresnel), streak length (lobe, rad) on damp and soaked ground, widest column (cells). */
  lampColumnGain: number;
  lampLobeDamp: number;
  lampLobeWet: number;
  lampColumnWidth: number;
  /** Distance (m) by which a lamp's column has faded out (from 40% of it). */
  lampColumnFar: number;
  /**
   * Lamp column tones (x the column's radiance): the 1-3 cell core on the
   * column axis (cream), the rest of each dash (amber), and a sparse 1-cell
   * fringe dash just outside the column (plum) that melts it into the ground.
   */
  lampColumnCore: number;
  lampColumnEdge: number;
  lampColumnFringe: number;
  /**
   * Temporal stability and surfaces round (R3-reflection-column-zebra): the
   * tone (x the dash tone) of a column's breaks, its thinned rows and the
   * breaks inside its dashes, which were the dark road (near-black zebra
   * cuts). Plum fringe cells keep to the dashes' ends; each light and panel
   * dash takes its own level, so a column is stacked dashes of two or three
   * tones with mid-tone breaks, as radio-umbrella draws them (0: refine round 2).
   */
  columnBreak: number;
  /**
   * Ground at speed (refine round 1): where the ground slides this many cells
   * per frame (start, full) its dashes turn from world-anchored rows into
   * screen-row-anchored 1-cell dashes whose ends are anchored to the world's
   * lateral position, so they neither stream nor strobe (the classic pixel
   * racer road). The mottle kept at full speed.
   */
  groundSpeedStart: number;
  groundSpeedFull: number;
  groundSpeedMottle: number;
  /**
   * World-anchored ground rows: octaves added to the footprint's row lattice.
   * 1: rows 1-4 cells, never sub-cell (refine round 1); 0.5 (refine round 2):
   * rows 0.7-2.8 cells, mostly about one, so the ground at rest reads as
   * 1-cell dashes rather than 2-4-cell bricks.
   */
  groundRowOctave: number;
  /** Distance (m) over which the ground mottle, flecks and band offset calm (start, end) and how much (0-1): far lane paint survives. */
  groundFarStart: number;
  groundFarEnd: number;
  groundFarCalm: number;
  /** Flecks and dash mottle never lift a cell above this many times the darker ground either side (road paint stays brightest). */
  groundPaintCap: number;
  /** Non-emitter wet reflections (sky, walls in damp patches) add at most this fraction of the ground's own light (about one band). */
  wetPatchCap: number;
  /** Key glints kept on a dry road (x sparkleKey at wetness 0.2 and below; full from 0.6). */
  sparkleKeyDry: number;
  /** 1: race hazards handed over with setHazards (oil) are drawn as flat outlined dark gloss with 1-cell highlight streaks. */
  oilHazards: number;
  /**
   * Foliage mass (refine round 1): cells whose normals disagree with their
   * neighbours' and they with each other (at least foliageTurns of the 12
   * neighbouring pairs in the 3 x 3 window turn 30 degrees; 0 off) are foliage.
   * Their band offset becomes one value per world-anchored clump of about
   * foliageClumpCells cells (x foliageClumpOffset bands), so canopies read as
   * massed clumps instead of lace; linework's foliage stage fills canopy holes
   * and adds lit-edge glints. Foliage cells carry anchor w = 0.25.
   */
  foliageTurns: number;
  foliageClumpCells: number;
  foliageClumpOffset: number;
  /** Refine round 2: a cell keeps last frame's canopy decision unless its turn share crosses foliageTurns by this much. */
  foliageHysteresis: number;
  /** Refine round 2: canopy cells take this share of an edge-preserving mean over canopy cells, at rest too (massed tones, not lace). */
  foliageSmooth: number;
  /**
   * Temporal stability round: the canopy flag is a leaf score remembered from
   * last frame at the cell's world point (a tent over the 3 x 3 cells around
   * its reprojected position, same surface only) and eased toward this
   * frame's canopy test by 1 - foliageMemory; a cell is canopy while the
   * score is at least one half. A one-frame miss or false hit never flips it,
   * and lone flags and pinholes settle into the clump around them. 0 keeps
   * refine round 2's per-frame test with hysteresis.
   */
  foliageMemory: number;
  /**
   * Temporal stability round: per-scanline lateral scroll registers (the
   * raster road of 16-bit racers) drive the screen-row dashes at speed: each
   * row's dashes are whole cells of a fixed length that slide sideways by the
   * row's own lateral travel (camera yaw and sideways travel at that row's
   * ground depth) instead of being re-cut from the world's lateral position
   * (0: refine round 1's lateral world coordinate, with dashes lengthened by
   * the sideways slide).
   */
  groundScroll: number;
  /** Spread (octaves) of the screen-row dash lengths around groundDashCells (whole cells, 1-6). */
  groundScrollSpread: number;
  /**
   * Hysteresis of the drawn scroll (cells): a row's dashes step only once its
   * exact lateral travel leads them by this much (0.5: rounding; 1: a whole
   * cell), so sub-cell camera wobble never steps them back and forth.
   */
  groundScrollHold: number;
  /** Most whole cells a row's drawn scroll steps per frame (1: dashes of 2+ cells never flicker A-B-A as they slide). */
  groundScrollStep: number;
  /** Share of the camera's yaw change against the road heading in the registers (0: sideways travel only, as the lateral anchoring). */
  groundScrollTurn: number;
  /** 1: ground drawn with screen-row dashes takes its temporal history from where its row scrolled from. */
  temporalScrollShift: number;
  /**
   * Screen-row dashes (lateral anchoring) last at least 2.5 frames of the
   * sideways slide times this (refine round 1: 1). Lengthened dashes read as
   * planks while steering, and every change of their lattice level re-cut a
   * row; 0 keeps each row's own length, so steering only slides the dashes
   * sideways with the world (the screen-row accumulation calms the rest).
   */
  groundSlideLengthen: number;
}

export const SURFACE_DEFAULTS: SurfaceOptions = {
  surfaceField: 1, wetGround: 1, temporal: 1,
  fieldDashCells: 6, fieldRowCells: 1, fieldGroundGain: 3, fieldMotionStretch: 2, fieldWallSpeed: 0.4, fieldWallGain: 1.6,
  skyFieldScale: 0.8, skyDashCells: 8, skyRowCells: 1, skyClusterScale: 4, skyClusterWeight: 0.55,
  // Refine round 4: a stronger mirror on wet ground, longer lamp columns (the user's rain-night target).
  // Refine round 4: measured against cutscene-style repaints of race frames, the road's warm reflected light covered
  // about two thirds of theirs (16.7% of the road against 25.4% at Tokyo night); stronger, denser dashes close it.
  wetNormal: 0.85, wetDampBase: 0.35, wetReflection: 3.2, wetSkyReflection: 0.3, wetMaxDistance: 160,
  // Refine round 4: lit facades, shop fronts and signs stretch into columns too, as every light does in the concept,
  // and the streaks of the far street reach the near road, which keeps a share of the mirror where it is seen steeply.
  wetColumnDown: 96, wetColumnUp: 4, wetColumnStart: 0.15, wetColumnFull: 0.4, wetFresnelFloor: 0.3, wetSpread: 4, wetSpreadFalloff: 0.08,
  wetRipple: 0, wetRippleCells: 4.5, wetRippleRows: 4, wetRippleHoles: 0.42, wetRipplePebbles: 0.05, wetDrizzle: 0, wetReflectionWarmth: 0.9,
  wetRippleCellsFar: 2.5, wetRippleRowsFar: 11, wetRippleFarStart: 12,
  wetWaves: 1, wetWaveRidge: 0.74, wetWaveRowsNear: 3.5, wetWaveRowsFar: 1.8, wetWaveHorizon: 0.55, wetWaveThreshold: 0.33,
  wetWaveTrough: 0.2, wetWaveSheen: 0.045, wetWaveStroke: 12, wetWaveJitter: 1.5,
  wetWaveDashFull: 0.35, wetWaveDashBase: 0.15, wetWaveStreak: 5, wetWaveStreakFloor: 0.35,
  // Refine round 4: the wet road mirrors in a rippled mosaic, as a cutscene-style repaint of a race frame draws it
  // (art/reference/mockups): short broken dashes with dark gaps, some whole rows dropped. Unbroken, glossy columns
  // (the fifth pass) read as solid synthetic bars beside it, the SORA billboard's reflection a cream block.
  wetDashCells: 4, wetDashDuty: 0.65, wetDashGap: 0.2, wetSheen: 0.6,
  wetColumnDashCells: 3, wetColumnDashDuty: 0.55, wetColumnRowKeep: 0.78,
  // Refine round 4: a few full-colour glitter specks on calm wet ground (the ripple dashes carry the texture).
  sparkleLit: 0.05, sparkleRain: 0.04, wetGlitter: 0.025, wetGlitterLift: 0.17, wetGlitterTrail: 0, sparkleKey: 0.12, sparkleKeyLobe: 12,
  temporalMargin: 0.025, temporalDepthTolerance: 0.04, temporalSpeedMargin: 0.04, temporalCarMargin: 0.05, groundSpeedSmooth: 1, wallSpeedSmooth: 0, wallMotionFilter: 0, wallMotionStart: 2, wallMotionEdge: 0,
  groundDashes: 1, litFlecks: 1, lampColumns: 1, wetDryFade: 1, keyGlints: 1,
  // Refine round 4: a calmer road, its grain cool and fine rather than warm speckle (the rain-night target).
  groundDashCells: 2.5, groundDashSpread: 0.35, groundSpeckle: 0.2, groundMottle: 0.15, groundDryMottle: 0.35,
  fleckDensity: 0.22, fleckLitStart: 0.02, fleckLitFull: 0.25, fleckGap: 0.15, fleckBoost: 4, fleckKeep: 0.65, fleckSparse: 0.3, fleckFloor: 0.05, fleckSpeckle: 0.5,
  fleckTint: 0.65, fleckSpeedKeep: 1, groundAmbientScale: 1,
  markingStart: 1.6, markingFull: 2.3,
  lampColumnGain: 1.8, lampLobeDamp: 0.11, lampLobeWet: 0.2, lampColumnWidth: 6, lampColumnFar: 140,
  lampColumnCore: 1.6, lampColumnEdge: 0.6, lampColumnFringe: 0.25, columnBreak: 0,
  groundSpeedStart: 0.15, groundSpeedFull: 0.5, groundSpeedMottle: 0.7, groundRowOctave: 0.5,
  groundFarStart: 35, groundFarEnd: 80, groundFarCalm: 0.85, groundPaintCap: 1.5, wetPatchCap: 1.2,
  sparkleKeyDry: 0.15, oilHazards: 1,
  foliageTurns: 0.6, foliageClumpCells: 5, foliageClumpOffset: 1.5, foliageHysteresis: 0.12, foliageSmooth: 0.8, foliageMemory: 0,
  groundScroll: 0, groundScrollSpread: 0.5, groundScrollHold: 1, groundScrollStep: 1, groundScrollTurn: 0, temporalScrollShift: 0, groundSlideLengthen: 0,
};

/** Wrap of the scroll registers (cells): a multiple of every dash length (1-6 cells), so a wrap never re-cuts a dash. */
export const GROUND_SCROLL_WRAP = 60000;

/** Lights whose pools the lit-ground flecks follow (street-lamp pools, shop lights, headlights). */
export const MAX_POOL_LIGHTS = 16;
/** Emitters (lamp heads, bright windows) that cast analytic reflection columns on wet ground. */
export const MAX_GROUND_EMITTERS = 16;

/** A light seen in wet ground: world position of the emitter, the ground under it, its radiance and width. */
export interface GroundEmitter {
  readonly position: THREE.Vector3;
  groundY: number;
  /** Linear colour; times `intensity` it is the emitter's radiance. */
  readonly color: THREE.Color;
  intensity: number;
  /** Emitter width across the column (m). */
  width: number;
  /**
   * Refine round 4: false for a light that casts a column but is no lamp head (a lit shop front): the linework draws
   * no lamp core or halo for it and it does not count toward the lamps' night level. Default true.
   */
  head?: boolean;
  /** Widest column (art cells) for this emitter, in place of the stage's lampColumnWidth (0 or absent: that). */
  maxCells?: number;
}

/** Race hazards on the road (oil slicks) drawn as flat, outlined dark gloss. */
export const MAX_HAZARDS = 8;

/** A flat hazard on the ground: an ellipse around a centre, turned by a heading (world y rotation). */
export interface GroundHazard {
  x: number;
  z: number;
  /** The ellipse's frame is the world turned by this (rad, about +y, as Object3D.rotation.y): local z runs along it. */
  heading: number;
  halfWidth: number;
  halfLength: number;
}

/** Lamp heads shared with the linework glow (read each frame, never copied). */
export interface LampHeads {
  readonly positions: readonly THREE.Vector4[];
  readonly radiance: readonly THREE.Vector4[];
  /** Intensity relative to a street lamp at the moods' nominal 620 cd (GROUND_EMITTER_NOMINAL); sunrise lamps fade below 0.5. */
  readonly level: Float32Array;
  count: number;
}
/** Emitter intensity (GroundEmitter.intensity) of a street-lamp lens at the moods' nominal 620 cd. */
export const GROUND_EMITTER_NOMINAL = 5;

/** Moving rigid objects (cars) whose cells are anchored in their own frame. */
export const MAX_MOVERS = 8;
const STAGES = { field: 'surfaceField', wet: 'wetGround', temporal: 'temporal' } as const;
const GROUND_PARTS = { dashes: 'groundDashes', flecks: 'litFlecks', columns: 'lampColumns', dry: 'wetDryFade', glints: 'keyGlints', oil: 'oilHazards' } as const;

/**
 * ?pixelSurfaces=off disables the surface stages; a comma list such as
 * ?pixelSurfaces=field,temporal keeps only those (field, wet, temporal).
 * ?pixelGround=off (or a list of dashes, flecks, columns, dry, glints) does the same
 * for the ground stage's parts.
 */
export function surfaceOptionsFromQuery(search: string): Partial<SurfaceOptions> {
  const params = new URLSearchParams(search);
  const pick = (name: string, parts: Record<string, keyof SurfaceOptions>) => {
    const value = params.get(name);
    if (value === null) return {};
    const enabled = new Set(value.split(',').map(part => part.trim()));
    return Object.fromEntries(Object.entries(parts).map(([part, key]) => [key, enabled.has(part) ? 1 : 0]));
  };
  return { ...pick('pixelSurfaces', STAGES), ...pick('pixelGround', GROUND_PARTS) };
}

/** Measured cutscene sparkle colours (style spec: reflections_wet_ground). */
export const SPARKLE_COLOURS = { amber: '#fab55a', gold: '#fdd176', lavender: '#9e8ad9', white: '#f4e9d9' } as const;

/**
 * Oil slick colours (palette entries): a flat two-tone dark gloss (core, ring)
 * with a darker 1-cell outline and 1-cell highlight streaks, the cutscenes'
 * glossy-liquid language. Night (cool key) and dawn (warm key) sets.
 */
export const OIL_COLOURS = {
  night: { core: '#161625', ring: '#222239', outline: '#0a0d1d', streak: '#819eed', glint: '#c1c5ff' },
  dawn: { core: '#312631', ring: '#413241', outline: '#161112', streak: '#fab15a', glint: '#fee192' },
} as const;

const SURFACE_COMMON = /* glsl */ `
const int MAX_MOVERS = ${MAX_MOVERS};
/** Encoded anchor kind: -1 sky, 0 world, i + 1 mover i. */
int anchorKind(float w) { return int(floor(w + .5)); }
`;

const SURFACE_NOISE = /* glsl */ `
const float SURFACE_TAU = 6.28318531;
/** Smooth 2D value noise in [0, 1] on the integer lattice; wrap > 0 repeats x every 'wrap' cells. */
float valueNoise2(vec2 p, int seed, int wrap) {
  ivec2 i = ivec2(floor(p));
  vec2 f = p - floor(p);
  f = f * f * (3. - 2. * f);
  ivec2 j = i + 1;
  if (wrap > 0) { i.x = ((i.x % wrap) + wrap) % wrap; j.x = ((j.x % wrap) + wrap) % wrap; }
  float a = artHash01(ivec3(i, seed)), b = artHash01(ivec3(j.x, i.y, seed));
  float c = artHash01(ivec3(i.x, j.y, seed)), d = artHash01(ivec3(j, seed));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
/**
 * Band field on one plane, about [-0.5, 0.5]: q are coordinates along the
 * long and short axes (world units), extent the size of one art cell along
 * them, cells the feature size in cells. Each axis snaps to power-of-two
 * lattices and the two nearest levels are blended and renormalised, so
 * features stay 'cells' wide at any distance without swimming or popping.
 * wrapTurns treats x as turns of a full circle (the sky's azimuth).
 */
float planeField(vec2 q, vec2 extent, vec2 cells, int seed, bool wrapTurns) {
  vec2 level = log2(max(extent * cells, vec2(1e-6)));
  if (wrapTurns) level.x = min(level.x, -2.);
  vec2 k = floor(level), f = level - k;
  float sum = 0., norm = 0.;
  for (int n = 0; n < 4; n++) {
    vec2 o = vec2(n & 1, n >> 1);
    float w = mix(1. - f.x, f.x, o.x) * mix(1. - f.y, f.y, o.y);
    if (w < 1e-3) continue;
    vec2 size = exp2(k + o);
    int wrap = wrapTurns ? int(1. / size.x + .5) : 0;
    ivec2 levelSeed = ivec2(k + o) + 64;
    sum += w * (valueNoise2(q / size, seed + levelSeed.x * 131 + levelSeed.y * 7907, wrap) - .5);
    norm += w * w;
  }
  return sum / sqrt(max(norm, 1e-6));
}
/**
 * The surface's motion past the camera over a nominal frame (world units,
 * tangential, times the stretch), set per cell before the fields are built.
 */
vec3 footMotion = vec3(0.);
/** 1 at rest, falling to 0 as the surface slides 1-4 cells per frame: high-contrast ground detail calms at speed. */
float motionCalm = 1.;
/** Cells the surface slides per nominal frame (0 at rest). */
float motionSlide = 0.;
/**
 * World size of one art cell along a unit axis, from the cell's footprint
 * vectors on the surface, widened by the per-frame motion: a feature must
 * outlast the frame-to-frame shift or world-anchored detail strobes (the near
 * road at speed); fast surfaces thus get proportionally longer features.
 */
float footprint(vec3 axis, vec3 footX, vec3 footY) {
  return length(vec3(dot(footX, axis), dot(footY, axis), dot(footMotion, axis)));
}
`;

const SURFACE_FRAGMENT = /* glsl */ `
${SURFACE_COMMON}
${SURFACE_NOISE}
uniform vec4 moverMin[MAX_MOVERS];     // xyz local box min; w 1 when last frame's transform is known
uniform vec4 moverMax[MAX_MOVERS];     // xyz local box max; w 1 when the slot is active
uniform mat4 moverToLocal[MAX_MOVERS];
uniform vec4 fieldCells;   // x, y: surface long / short cells; z, w: sky long / short cells
uniform float fieldGroundGain;
uniform float fieldWallSpeed; // band field kept on walls sliding 4+ cells per frame
uniform float fieldWallGain;  // band field gain on walls at rest
uniform vec3 skyCluster;   // x: cluster lattice multiple; y: cluster weight; z: amplitude
uniform vec3 groundYaw;    // x: orientation index (0-7) nearest below the camera yaw; y: blend to the next; z: step (rad)
uniform vec4 wetParams;    // x: wetness (road finish, 0-1); y: min normal.y; z: reflection weight outside damp patches; w: on
uniform vec2 dashParams;   // x: dash segment cells; y: duty
uniform vec4 surfaceMotion; // xyz: smoothed camera travel per nominal frame (world); w: stretch
uniform float cameraTurn;   // cells the image sweeps sideways per nominal frame from the camera's yaw
uniform vec4 pickMotion;    // xyz: the travel eased over about 0.15 s (the dashes' mode pick); w: the turn, eased
uniform vec4 segmentParams; // x: ground dash mean cells; y: per-row length spread (octaves); z: dashes as the ground band field; w: lit fraction on
uniform float groundSpeckle; // share of the one-cell speckle in the dash value
uniform vec4 speedParams;    // x, y: ground slide (cells per frame) where dashes turn screen-row anchored (start, full); z: world row octave offset; w: band gain kept at full speed
uniform vec3 groundFar;      // x, y: distance (m) over which the ground calms; z: how much
uniform vec4 groundAcross;   // xyz: the camera's level right vector; w: the camera's accumulated lateral travel (m)
uniform sampler2D scrollRows; // per screen row (x = 0): x the drawn scroll (whole cells, wrapped), y its step this frame, z the exact scroll, w the row's eased slide (cells per frame)
uniform vec4 scrollParams;    // x: 1 when the scroll registers drive the screen-row dashes; y: length spread (octaves); z: wrap (cells); w: dash lengthening by the sideways slide (0: none)
const int MAX_HAZARDS = ${MAX_HAZARDS};
uniform int hazardCount;
uniform vec4 hazardFrame[MAX_HAZARDS]; // xy: centre (world xz); z, w: cos, sin of the heading
uniform vec4 hazardSize[MAX_HAZARDS];  // x: half width; y: half length (m)
uniform vec3 foliageParams;  // x: share of neighbouring normal pairs that turn (foliage; 0: off); y: clump size (cells); z: clump offset (bands)
uniform vec2 foliageHistory; // x: 1 when last frame's history (canopy bit) is valid; y: hysteresis on the turn share
uniform sampler2D surfacePrevious; // last frame's anchors (world cells carry their leaf score in w)
uniform vec2 leafMemory;           // x: 1 when last frame's anchors are valid; y: share of last frame's score kept (0: off)
const int MAX_POOLS = ${MAX_POOL_LIGHTS};
uniform vec4 poolPosition[MAX_POOLS];  // xyz light position; w: luminous intensity x colour luminance (0: off)
uniform vec4 poolDirection[MAX_POOLS]; // xyz unit vector from the target to the light; w: cos(cone)
uniform vec4 poolShape[MAX_POOLS];     // x: cos(inner cone); y: cutoff distance; z: decay
uniform float groundAmbient;           // luminance of the ambient irradiance on upward ground (key, fill, environment)
layout(location = 0) out vec4 outAnchor;
layout(location = 1) out vec4 outFields;
layout(location = 2) out vec4 outGround;

// Road-finish damp patches (road-finish.ts, same hash, scales and thresholds),
// so reflections are strongest where the road material is glossy.
float roadHash(vec2 p) {
  vec3 h = fract(vec3(p.xyx) * .1031);
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}
float roadNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  vec2 blend = f * f * (3. - 2. * f);
  return mix(mix(roadHash(cell), roadHash(cell + vec2(1., 0.)), blend.x),
    mix(roadHash(cell + vec2(0., 1.)), roadHash(cell + vec2(1.)), blend.x), blend.y);
}
float dampPatch(vec2 p, float wetness) {
  float basin = .64 * roadNoise(p * .23) + .26 * roadNoise(p * .73 + vec2(17.1, -9.4))
    + .10 * roadNoise(p * 1.91 + vec2(-6.3, 21.7));
  return smoothstep(mix(.69, .41, wetness), mix(.82, .61, wetness), basin) * smoothstep(.2, .35, wetness);
}

vec2 groundAxis(int orientation) {
  float angle = float(orientation) * groundYaw.z;
  return vec2(cos(angle), sin(angle));
}
/**
 * Horizontal planes: long axis along the camera's right vector, snapped to
 * eight world orientations (22.5 deg) and blended between the two nearest,
 * so dashes stay horizontal on screen through corners without the lattice
 * rotating (a rotating lattice slides everywhere far from its pivot).
 * Movers use their own x axis (across the car).
 */
float groundField(vec3 p, vec3 footX, vec3 footY, bool mover, vec2 cells) {
  float sum = 0., norm = 0.;
  for (int j = 0; j < 2; j++) {
    float w = mover ? float(1 - j) : j == 0 ? 1. - groundYaw.y : groundYaw.y;
    if (w < 1e-3) continue;
    int orientation = mover ? 0 : (int(groundYaw.x) + j) % 8;
    vec2 u = groundAxis(orientation), v = vec2(-u.y, u.x);
    vec3 axisU = vec3(u.x, 0., u.y), axisV = vec3(v.x, 0., v.y);
    vec2 q = vec2(dot(p.xz, u), dot(p.xz, v));
    vec2 extent = vec2(footprint(axisU, footX, footY), footprint(axisV, footX, footY));
    sum += w * planeField(q, extent, cells, 11 + orientation * 977, false);
    norm += w * w;
  }
  return sum / sqrt(max(norm, 1e-6));
}
/**
 * Surfaces: horizontal planes as above, walls on the fixed x and z planes
 * (long axis horizontal). Ground takes a stronger offset, up to a full band.
 */
float surfaceField(vec3 p, vec3 n, vec3 footX, vec3 footY, bool mover, float dashes, float groundGain) {
  float up = smoothstep(.55, .8, abs(n.y));
  float sum = 0., norm = 0.;
  // World ground with the dash field on takes its dashes (in [-.5, .5]);
  // cars and the A/B baseline keep the smooth value noise.
  if (up > 1e-3) { sum += up * (dashes > -1. ? dashes : groundField(p, footX, footY, mover, fieldCells.xy)); norm += up * up; }
  vec2 sides = n.xz * n.xz;
  sides *= (1. - up) / max(sides.x + sides.y, 1e-6);
  if (sides.x > 1e-3) {
    vec2 extent = vec2(footprint(vec3(0., 0., 1.), footX, footY), footprint(vec3(0., 1., 0.), footX, footY));
    sum += sides.x * planeField(p.zy, extent, fieldCells.xy, 23, false);
    norm += sides.x * sides.x;
  }
  if (sides.y > 1e-3) {
    vec2 extent = vec2(footprint(vec3(1., 0., 0.), footX, footY), footprint(vec3(0., 1., 0.), footX, footY));
    sum += sides.y * planeField(p.xy, extent, fieldCells.xy, 37, false);
    norm += sides.y * sides.y;
  }
  // groundGain: 1 on still, near ground; calmer far away and, with the
  // world-anchored smooth field (dashes off), as the ground slides.
  float gain = mover ? 1. : mix(1., fieldGroundGain, smoothstep(.55, .8, n.y) * groundGain);
  // Walls sliding past at speed keep only part of their dashes (they move
  // several cells per frame; world-anchored detail there reads as boil).
  if (!mover) gain *= mix(mix(fieldWallSpeed, 1., motionCalm), 1., up);
  // Walls at rest take a stronger band offset (refine round 2): a lamp's
  // smooth falloff on a shopfront broke into concentric posterised arcs; the
  // stronger world-anchored dashes rag them into horizontal band edges.
  if (!mover) gain *= mix(mix(1., fieldWallGain, motionCalm), 1., up);
  float limit = .5 * clamp(gain, 1., 2.);
  return clamp(sum / sqrt(max(norm, 1e-6)) * gain, -limit, limit);
}
/**
 * Sky: anchored to the view direction (azimuth in turns, elevation), so it
 * holds still under camera yaw, pitch and travel. Fine horizontal dashes plus
 * a coarser octave of elongated cloud-strata clusters.
 */
float skyField(vec3 dir) {
  float elevation = asin(clamp(dir.y, -1., 1.));
  vec2 q = vec2(atan(dir.z, dir.x) / SURFACE_TAU + .5, elevation);
  vec2 extent = vec2(artCellWorldScale / (SURFACE_TAU * max(cos(elevation), .15)), artCellWorldScale);
  float fine = planeField(q, extent, fieldCells.zw, 53, true);
  float cluster = planeField(q, extent, fieldCells.zw * skyCluster.x, 59, true);
  float w = skyCluster.y;
  return clamp(mix(fine, cluster, w) / sqrt((1. - w) * (1. - w) + w * w) * skyCluster.z, -.5, .5);
}
/**
 * Wet-ground dash mask (x: 1 on a dash) and a sparkle hash on a one-cell
 * lattice (y). Rows are about one cell tall and segments 'dashParams.x'
 * cells long, with a random phase per row. Where the footprint crosses a
 * power of two, rows and segments pick the finer or coarser lattice by a
 * stable hash, so levels change dash by dash instead of along a seam.
 */
/**
 * Footprint of one cell along a unit axis without the motion widening: the
 * ground's lattice levels follow only the view, never the speed, so a speed
 * change never re-randomises the dashes.
 */
float stillFootprint(vec3 axis, vec3 footX, vec3 footY) { return length(vec2(dot(footX, axis), dot(footY, axis))); }
vec2 groundDash(vec3 p, vec3 footX, vec3 footY) {
  float pick = artHash01(ivec3(ivec2(floor(p.xz / 8.)), 4099));
  int orientation = (int(groundYaw.x) + (pick < groundYaw.y ? 1 : 0)) % 8;
  vec2 u = groundAxis(orientation), v = vec2(-u.y, u.x);
  vec2 q = vec2(dot(p.xz, u), dot(p.xz, v));
  vec2 extent = vec2(stillFootprint(vec3(u.x, 0., u.y), footX, footY), stillFootprint(vec3(v.x, 0., v.y), footX, footY));
  int salt = orientation * 8191;
  // Rows at least one cell tall (speedParams.z octaves up): cell-centre
  // sampling never skips a row, so sub-cell motion cannot alias into moire.
  float rowLevel = log2(max(extent.y, 1e-5)) + speedParams.z, rowK = floor(rowLevel);
  rowK += artHash01(ivec3(int(floor(q.y / exp2(rowK + 1.))), int(rowK), 4111 + salt)) < rowLevel - rowK ? 1. : 0.;
  int row = int(floor(q.y / exp2(rowK)));
  float dashLevel = log2(max(extent.x * dashParams.x, 1e-5)), dashK = floor(dashLevel);
  dashK += artHash01(ivec3(row, int(rowK), 4127 + salt)) < dashLevel - dashK ? 1. : 0.;
  float phase = artHash01(ivec3(row, int(rowK), 4133 + salt)) * exp2(dashK);
  int segment = int(floor((q.x + phase) / exp2(dashK)));
  float dash = artHash01(ivec3(segment, row, 4139 + salt + int(rowK) * 64 + int(dashK) * 4096)) < dashParams.y ? 1. : 0.;
  float cellLevel = log2(max(extent.x, 1e-5)), cellK = floor(cellLevel);
  cellK += artHash01(ivec3(row, int(rowK), 4153 + salt)) < cellLevel - cellK ? 1. : 0.;
  int column = int(floor(q.x / exp2(cellK)));
  // One sparkle cell per lattice cell: the screen cell over its centre. The
  // offset to the centre is carried back to screen cells through the inverse
  // of the cell's footprint (screen step -> surface u, v).
  vec3 axisU = vec3(u.x, 0., u.y), axisV = vec3(v.x, 0., v.y);
  mat2 toSurface = mat2(dot(footX, axisU), dot(footX, axisV), dot(footY, axisU), dot(footY, axisV));
  vec2 size = exp2(vec2(cellK, rowK));
  vec2 toCentre = (floor(q / size) + .5) * size - q;
  float det = determinant(toSurface);
  if (abs(det) < 1e-12 || any(greaterThan(abs(inverse(toSurface) * toCentre), vec2(.5)))) return vec2(dash, 1.);
  return vec2(dash, artHash01(ivec3(column, row, 4159 + salt + int(rowK) * 64 + int(cellK) * 4096)));
}
/**
 * Ground dashes (the cutscenes' wet-ground and asphalt language): world-
 * anchored rows about one cell tall, each cut into segments with one random
 * value per segment. Each row has its own length around segmentParams.x
 * cells; the power-of-two lattice (the finer or coarser level picked by a
 * stable hash per row, as in groundDash) spreads lengths from half to twice
 * that, so dashes run 2-6 cells with hard ends and rows are independent.
 * x: segment value (0-1), y: row hash (0-1).
 */
/** The last segment function's dash value before the speckle (lit flecks follow whole dashes). */
float segmentDash = .5;
vec2 groundSegments(vec3 p, vec3 footX, vec3 footY) {
  float pick = artHash01(ivec3(ivec2(floor(p.xz / 8.)), 5099));
  int orientation = (int(groundYaw.x) + (pick < groundYaw.y ? 1 : 0)) % 8;
  vec2 u = groundAxis(orientation), v = vec2(-u.y, u.x);
  vec2 q = vec2(dot(p.xz, u), dot(p.xz, v));
  vec2 extent = vec2(stillFootprint(vec3(u.x, 0., u.y), footX, footY), stillFootprint(vec3(v.x, 0., v.y), footX, footY));
  int salt = orientation * 8191 + 5000;
  float rowLevel = log2(max(extent.y, 1e-5)) + speedParams.z, rowK = floor(rowLevel);
  rowK += artHash01(ivec3(int(floor(q.y / exp2(rowK + 1.))), int(rowK), 11 + salt)) < rowLevel - rowK ? 1. : 0.;
  int row = int(floor(q.y / exp2(rowK)));
  float rowHash = artHash01(ivec3(row, int(rowK), 13 + salt));
  float cells = segmentParams.x * exp2((rowHash * 2. - 1.) * segmentParams.y);
  float dashLevel = log2(max(extent.x * cells, 1e-5)), dashK = floor(dashLevel);
  dashK += artHash01(ivec3(row, int(rowK), 27 + salt)) < dashLevel - dashK ? 1. : 0.;
  float size = exp2(dashK);
  float phase = artHash01(ivec3(row, int(rowK), 33 + salt)) * size;
  int segment = int(floor((q.x + phase) / size));
  float value = artHash01(ivec3(segment, row, 39 + salt + int(rowK) * 64 + int(dashK) * 4096));
  segmentDash = value;
  if (groundSpeckle > 0.) {
    // One-cell speckle on the same rows (its lattice level picked per row).
    float cellLevel = log2(max(extent.x, 1e-5)), cellK = floor(cellLevel);
    cellK += artHash01(ivec3(row, int(rowK), 45 + salt)) < cellLevel - cellK ? 1. : 0.;
    // Each row's speckle lattice has its own phase: aligned across rows, its
    // column edges would draw lines toward the vanishing point.
    float speckle = exp2(cellK);
    int column = int(floor((q.x + artHash01(ivec3(row, int(rowK), 57 + salt)) * speckle) / speckle));
    value = mix(value, artHash01(ivec3(column, row, 51 + salt + int(rowK) * 64 + int(cellK) * 4096)), groundSpeckle);
  }
  return vec2(value, rowHash);
}
/**
 * Ground at speed: rows are screen rows (exactly one cell tall), cut into
 * dashes whose ends are anchored to the world's lateral position (along the
 * camera's level right vector, plus the camera's own lateral travel), on a
 * power-of-two lattice picked per row from the cell's lateral footprint.
 * Driving straight, a lateral world position keeps its column within a row,
 * so the dashes hold still instead of streaming radially (zoom blur) or
 * strobing (world rows passing 1-30 cells per frame); steering and corners
 * slide them sideways with the world. The classic pixel-racer road.
 * x: dash value (with the one-cell speckle), y: the dash's own hash.
 */
vec2 speedSegments(ivec2 cell, vec3 p, vec3 footX) {
  if (scrollParams.x > .5) {
    // Scroll registers: a row's dashes are whole cells of one length per row
    // (1-6), at u = x - scroll(row); the register adds the row's lateral
    // travel every frame, so steering slides each row's dashes sideways
    // coherently (near rows faster than far ones) and never re-cuts them.
    const int salt = 9001;
    int row = cell.y;
    vec4 reg = texelFetch(scrollRows, ivec2(0, row), 0);
    float u = float(cell.x) + .5 - reg.x;
    float rowHash = artHash01(ivec3(row, 17, salt));
    float len = clamp(floor(segmentParams.x * exp2((rowHash * 2. - 1.) * scrollParams.y) + .5), 1., 6.);
    float wrap = scrollParams.z;
    int segment = int(mod(floor(u / len + artHash01(ivec3(row, 29, salt))), floor(wrap / len + .5)));
    int lengthSeed = int(len) * 4096;
    float value = artHash01(ivec3(segment, row, salt + 31 + lengthSeed));
    segmentDash = value;
    if (groundSpeckle > 0.) {
      int column = int(mod(floor(u), wrap));
      // Less speckle than at rest, none while the row slides a cell or more per frame.
      value = mix(value, artHash01(ivec3(column, row, salt + 41)), groundSpeckle * .6 * (1. - smoothstep(.03, .3, reg.w)));
    }
    return vec2(value, artHash01(ivec3(segment, row, salt + 43 + lengthSeed)));
  }
  float lateral = dot(p - artCameraWorld[3].xyz, groundAcross.xyz) + groundAcross.w;
  float extent = max(abs(dot(footX, groundAcross.xyz)), 1e-5);
  // Sideways slide (cells per frame; corners carry the camera sideways):
  // dashes last at least 2.5 frames of it and the one-cell speckle goes, so a
  // dash sliding along its row changes only at its ends.
  // (Refine round 2 tried the dashes' own lateral travel per frame here:
  // shorter dashes, and on straights their ends followed the camera's yaw
  // wobble back and forth; Tokyo near-road A-B-A rose from 2.1 to 3.1.)
  float slideX = abs(dot(surfaceMotion.xyz, groundAcross.xyz)) / extent;
  const int salt = 9001;
  int row = cell.y;
  float rowHash = artHash01(ivec3(row, 17, salt));
  float cells = max(segmentParams.x * exp2((rowHash * 2. - 1.) * segmentParams.y), 2.5 * slideX * scrollParams.w);
  float dashLevel = log2(extent * cells), dashK = floor(dashLevel);
  dashK += artHash01(ivec3(row, 23, salt)) < dashLevel - dashK ? 1. : 0.;
  float size = exp2(dashK);
  float phase = artHash01(ivec3(row, 29, salt)) * size;
  int segment = int(floor((lateral + phase) / size));
  float value = artHash01(ivec3(segment, row, salt + 31 + int(dashK) * 4096));
  segmentDash = value;
  if (groundSpeckle > 0.) {
    float cellLevel = log2(extent), cellK = floor(cellLevel);
    cellK += artHash01(ivec3(row, 37, salt)) < cellLevel - cellK ? 1. : 0.;
    float speckle = exp2(cellK);
    int column = int(floor((lateral + artHash01(ivec3(row, 47, salt)) * speckle) / speckle));
    // Less speckle than at rest: at speed the ground reads as horizontal dashes.
    value = mix(value, artHash01(ivec3(column, row, salt + 41 + int(cellK) * 4096)), groundSpeckle * .6 * (1. - smoothstep(.4, 1.2, slideX)));
  }
  return vec2(value, artHash01(ivec3(segment, row, salt + 43 + int(dashK) * 4096)));
}
/**
 * Race hazards (setHazards: oil slicks) under a ground cell: 0 none, 1 the
 * gloss core, 2 its ring, 3 a highlight streak (two short rows across the
 * slick, each the one screen row nearest its line).
 */
int hazardCode(vec3 p, vec3 footX, vec3 footY) {
  for (int i = 0; i < MAX_HAZARDS; i++) {
    if (i >= hazardCount) break;
    vec4 frame = hazardFrame[i];
    vec2 d = p.xz - frame.xy;
    // The slick's frame: x across the road, y along it.
    vec2 local = vec2(frame.z * d.x - frame.w * d.y, frame.w * d.x + frame.z * d.y);
    vec2 q = local / max(hazardSize[i].xy, vec2(.05));
    float r = length(q);
    if (r >= .92) continue;
    vec3 along = vec3(frame.w, 0., frame.z);
    // Half a screen row along the slick: the streak is the one row nearest its line.
    float halfStep = .5 * abs(dot(footY, along));
    float width = sqrt(max(1. - q.y * q.y, 0.));
    // Highlight streaks (refine round 2): one row every 2 m along the slick,
    // each across its own part of the width (world-anchored along the slick),
    // so a near slick reads as glossy liquid rather than a flat slab.
    float slot = floor((local.y + hazardSize[i].y) / 2.);
    float centre = (slot + .3 + .4 * artHash01(ivec3(int(slot), i, 8111))) * 2. - hazardSize[i].y;
    float from = artHash01(ivec3(int(slot), i, 8117)) * 1.2 - .6, span = .25 + .3 * artHash01(ivec3(int(slot), i, 8123));
    if (abs(local.y - centre) < halfStep && q.x / max(width, .05) > from && q.x / max(width, .05) < from + span
      && artHash01(ivec3(int(slot), i, 8129)) < .8) return 3;
    return r < .6 ? 1 : 2;
  }
  return 0;
}
/**
 * Foliage: leaves turn every way, so a canopy cell's reconstructed normal
 * disagrees with most of its neighbours' and they with each other. Solid
 * surfaces agree, and at a crease or a corner between planes (a facade
 * detail, a balcony, a car) only the few neighbouring pairs across the crease
 * disagree: of the 12 neighbouring pairs in the 3 x 3 window, foliage turns
 * more than 30 degrees across at least foliageParams.x of them (and the mean
 * normal is short). Cells at the image border have one-sided normals: never.
 */
bool foliageCell(ivec2 cell, vec3 n, float turnsNeeded, bool held) {
  if (any(lessThan(cell, ivec2(2))) || any(greaterThanEqual(cell, ivec2(artSize) - 2))) return false;
  vec4 w[9];
  vec3 sum = vec3(0.);
  float count = 0.;
  for (int k = 0; k < 9; k++) {
    w[k] = texelFetch(normals, cell + ivec2(k % 3 - 1, k / 3 - 1), 0);
    if (w[k].w > .5) { sum += w[k].xyz; count += 1.; }
  }
  // Refine round 2: lace at a canopy's silhouette (5-6 leaf cells in the
  // window) counts too; with seven required, half the canopy went unflagged.
  // A cell that was canopy last frame (the same surface) holds with a looser
  // test: fewer leaf cells around, a slightly longer mean normal, a flatter
  // spread (hysteresis on every criterion, not only the turn share).
  if (count < (held ? 4. : 5.) || length(sum) / count > (held ? .9 : .85)) return false;
  // Leaves turn every way; the normals of a crease, an eave or a balcony
  // edge spread along one arc between two planes. The spread's second
  // principal moment (the sum of the covariance's 2 x 2 principal minors
  // against its squared trace) tells them apart.
  vec3 mean = sum / count;
  mat3 spread = mat3(0.);
  for (int k = 0; k < 9; k++) {
    if (w[k].w < .5) continue;
    vec3 d = w[k].xyz - mean;
    spread += outerProduct(d, d);
  }
  float trace = spread[0][0] + spread[1][1] + spread[2][2];
  float minors = spread[0][0] * spread[1][1] - spread[0][1] * spread[0][1] + spread[0][0] * spread[2][2] - spread[0][2] * spread[0][2]
    + spread[1][1] * spread[2][2] - spread[1][2] * spread[1][2];
  if (minors < (held ? .035 : .06) * trace * trace) return false;
  float turns = 0., pairs = 0.;
  for (int k = 0; k < 9; k++) {
    if (w[k].w < .5) continue;
    if (k % 3 < 2 && w[k + 1].w > .5) { pairs += 1.; turns += dot(w[k].xyz, w[k + 1].xyz) < .87 ? 1. : 0.; }
    if (k < 6 && w[k + 3].w > .5) { pairs += 1.; turns += dot(w[k].xyz, w[k + 3].xyz) < .87 ? 1. : 0.; }
  }
  return pairs >= (held ? 4. : 5.) && turns >= turnsNeeded * pairs;
}
/**
 * Whether this world point was canopy last frame (the temporal history's
 * canopy bit, 128, at its reprojected cell). The canopy test then keeps its
 * decision unless the turn share crosses the threshold by foliageHysteresis
 * (refine round 2: a third of the flagged cells flipped every frame, and the
 * clumps built on them boiled).
 */
bool wasCanopy(vec3 world) {
  if (foliageHistory.x < .5) return false;
  vec4 clip = artPreviousViewProjection * vec4(world, 1.);
  if (clip.w <= 1e-4) return false;
  vec2 p = (clip.xy / clip.w * .5 + .5) * artSize;
  if (any(lessThan(p, vec2(0.))) || any(greaterThanEqual(p, artSize))) return false;
  vec4 held = texelFetch(history, ivec2(p), 0);
  if (int(held.a * 255. + .5) < 128) return false;
  // The same surface: last frame's depth there matches where this point was
  // (the temporal stage's 16-bit log depth).
  float t = (floor(held.y * 255. + .5) * 256. + floor(held.z * 255. + .5)) / 65535.;
  return abs(exp2(t * 24. - 8.) - clip.w) < .06 * clip.w + .1;
}
/**
 * Leaf score of a world cell, carried in its anchor's w: canopy cells
 * .2405-.2595 (inside linework's |w - .25| < .01 canopy test), other world
 * cells 0-.19 (world kind, and inside the |w| <= .3 world test).
 */
float leafScoreOf(float w) {
  if (abs(w - .25) < .01) return clamp((w - .2405) / .019, 0., 1.);
  return w >= 0. && w < .2 ? w / .19 : -1.;
}
float leafAnchor(float score, bool canopy) { return canopy ? .2405 + .019 * clamp(score, 0., 1.) : .19 * clamp(score, 0., 1.); }
/**
 * Last frame's leaf score at this world point: a tent over the 3 x 3 cells
 * around its reprojected position, counting only cells whose anchor lies on
 * the same surface (within a few percent of the depth; leaves are ragged).
 * Negative when there is none.
 */
float leafHistory(vec3 world) {
  if (leafMemory.x < .5) return -1.;
  vec4 clip = artPreviousViewProjection * vec4(world, 1.);
  if (clip.w <= 1e-4) return -1.;
  vec2 p = (clip.xy / clip.w * .5 + .5) * artSize;
  if (any(lessThan(p, vec2(0.))) || any(greaterThanEqual(p, artSize))) return -1.;
  ivec2 base = ivec2(floor(p));
  float tolerance = .06 * clip.w + .15, sum = 0., weight = 0.;
  for (int k = 0; k < 9; k++) {
    ivec2 c = base + ivec2(k % 3 - 1, k / 3 - 1);
    if (any(lessThan(c, ivec2(0))) || any(greaterThanEqual(c, ivec2(artSize)))) continue;
    vec4 a = texelFetch(surfacePrevious, c, 0);
    float score = leafScoreOf(a.w);
    if (score < 0. || distance(a.xyz, world) > tolerance) continue;
    vec2 d = abs(vec2(c) + .5 - p);
    float w = max(1. - d.x / 1.5, 0.) * max(1. - d.y / 1.5, 0.);
    sum += score * w; weight += w;
  }
  return weight > .2 ? sum / weight : -1.;
}
/**
 * One band offset per foliage clump: domain-warped world cells of a
 * power-of-two size near foliageParams.y art cells (a clump re-rolls once when
 * the size level changes as the camera approaches), so a canopy reads as a
 * few massed clumps of one tone each instead of per-leaf noise.
 */
float clumpField(vec3 p, float depth) {
  float level = floor(log2(max(artCellWorldSize(depth) * foliageParams.y, .125)) + .5);
  float size = exp2(level);
  vec3 q = p / size;
  vec3 warp = vec3(artValueNoise(q * 1.7, 71), artValueNoise(q * 1.7 + 13.1, 73), artValueNoise(q * 1.7 + 29.7, 79)) - .5;
  ivec3 id = ivec3(floor(q + warp * .9));
  return (artHash01(id + ivec3(0, int(level) * 977, 4001)) - .5) * foliageParams.z;
}
/**
 * Fraction of an upward ground cell's light that comes from the lamp pools:
 * the pools' irradiance (Three's spot light model: inverse-square with the
 * range cutoff, smooth cone) against the ambient irradiance. Albedo cancels,
 * so markings and asphalt texture keep their share.
 */
float litFraction(vec3 p, vec3 n) {
  float lamps = 0.;
  for (int i = 0; i < MAX_POOLS; i++) {
    if (poolPosition[i].w <= 0.) continue;
    vec3 toLight = poolPosition[i].xyz - p;
    float d = length(toLight);
    vec3 l = toLight / max(d, 1e-4);
    float cutoff = poolShape[i].y;
    if (cutoff > 0. && d >= cutoff) continue;
    float falloff = 1. / max(pow(d, poolShape[i].z), .01);
    if (cutoff > 0.) { float r = d / cutoff; r *= r; falloff *= pow(clamp(1. - r * r, 0., 1.), 2.); }
    float spot = smoothstep(poolDirection[i].w, poolShape[i].x, dot(l, poolDirection[i].xyz));
    lamps += poolPosition[i].w * falloff * spot * max(dot(n, l), 0.);
  }
  return lamps / (lamps + groundAmbient + 1e-4);
}

void main() {
  ivec2 cell = artCell();
  vec4 data = texelFetch(resolvedData, cell, 0);
  vec2 centre = vec2(cell) + .5;
  vec3 ray = artWorldRay(centre);
  outGround = vec4(0.);
  if (data.w >= .5) {
    outAnchor = vec4(ray, -1.);
    outFields = vec4(skyField(ray), 0., 0., 1.);
    return;
  }
  vec3 world = artWorldPosition(centre, data.x);
  vec3 n = texelFetch(normals, cell, 0).xyz;
  // Footprint of one art cell on the surface: the image-plane steps of one
  // cell carried along the view ray onto the surface's tangent plane.
  float size = artCellWorldSize(data.x);
  float facing = dot(ray, n);
  facing = facing < 0. ? min(facing, -.08) : max(facing, .08);
  vec3 right = artCameraWorld[0].xyz, up = artCameraWorld[1].xyz;
  vec3 footX = size * (right - ray * (dot(right, n) / facing));
  vec3 footY = size * (up - ray * (dot(up, n) / facing));
  // Cars are anchored in their own frame, so their patterns ride with them
  // instead of streaming across the body at road speed.
  int kind = 0;
  vec3 anchor = world;
  for (int i = 0; i < MAX_MOVERS; i++) {
    if (moverMax[i].w < .5) continue;
    vec3 local = (moverToLocal[i] * vec4(world, 1.)).xyz;
    if (any(lessThan(local, moverMin[i].xyz)) || any(greaterThan(local, moverMax[i].xyz))) continue;
    mat3 toLocal = mat3(moverToLocal[i]);
    kind = i + 1; anchor = local;
    n = normalize(toLocal * n); footX = toLocal * footX; footY = toLocal * footY;
    break;
  }
  // Upward world ground takes its footprints on the level ground plane: the
  // normal reconstructed from art-resolution depth jitters by a few degrees
  // frame to frame on grazing asphalt, and through the footprint that re-picked
  // the dashes' lattice levels cell by cell every frame (the road boil).
  vec3 plane = n;
  if (kind == 0 && n.y > .55) {
    plane = vec3(0., 1., 0.);
    float level = min(dot(ray, plane), -.08);
    footX = size * (right - ray * (dot(right, plane) / level));
    footY = size * (up - ray * (dot(up, plane) / level));
  }
  // Cars travel with the camera; the world streams past it.
  vec3 motion = vec3(0.);
  float slide = 0., pickSlide = 0.;
  if (kind == 0) {
    vec3 travel = surfaceMotion.xyz - plane * dot(surfaceMotion.xyz, plane);
    float distance = length(travel);
    if (distance > 1e-6) {
      vec3 along = travel / distance;
      slide = distance / max(length(vec2(dot(footX, along), dot(footY, along))), 1e-6);
    }
    // A corner sweeps every world cell sideways too (the far road and the
    // roadside most of all, where travel alone barely moves them).
    slide = max(slide, cameraTurn);
    motionCalm = 1. - smoothstep(1., 4., slide);
    motionSlide = slide;
    motion = travel * surfaceMotion.w;
    // The ground's mode pick (world rows or screen-row dashes, dash by dash)
    // follows the eased travel (refine round 2): with the stepped value, a
    // stop re-rolled a fifth of the road in one frame.
    vec3 eased = pickMotion.xyz - plane * dot(pickMotion.xyz, plane);
    float easedDistance = length(eased);
    if (easedDistance > 1e-6) {
      vec3 along = eased / easedDistance;
      pickSlide = easedDistance / max(length(vec2(dot(footX, along), dot(footY, along))), 1e-6);
    }
    pickSlide = max(pickSlide, pickMotion.w);
  }
  bool ground = kind == 0 && n.y > .55;
  // Far ground calms (mottle, flecks, band offset), so 1-cell lane paint survives toward the vanishing point.
  float farCalm = 1. - groundFar.z * smoothstep(groundFar.x, groundFar.y, data.x);
  int hazard = ground && hazardCount > 0 ? hazardCode(world, footX, footY) : 0;
  // Ground dashes on upward world surfaces (walls and cars keep the smooth
  // field). At rest and while the ground slides under a cell per frame they
  // are world-anchored rows; beyond that each dash turns (dash by dash, as
  // the slide grows) into a screen-row dash anchored to the world's lateral
  // position, which neither streams nor strobes at any speed. The lattice
  // levels follow the still footprint, never the speed.
  vec2 segments = vec2(.5, 0.);
  float speedPick = 0.;
  if (ground && (segmentParams.z > .5 || segmentParams.w > .5 || wetParams.w > .5)) {
    speedPick = smoothstep(speedParams.x, speedParams.y, pickSlide);
    vec2 fast = speedPick > 0. ? speedSegments(cell, world, footX) : vec2(.5, 1.);
    float fastDash = segmentDash;
    segments.x = fast.y < speedPick ? fast.x : groundSegments(world, footX, footY).x;
    if (fast.y < speedPick) segmentDash = fastDash;
  }
  // Walls and the smooth fields widen their features with the motion.
  footMotion = motion;
  float dashes = -2.;
  if (ground && segmentParams.z > .5) dashes = hazard > 0 ? 0. : segments.x - .5;
  // The smooth world field (dashes off) still calms as the ground slides.
  float groundGain = farCalm * (dashes > -1. ? mix(1., speedParams.w, speedPick) : motionCalm);
  bool foliage = false;
  float leafScore = 0.;
  if (kind == 0 && !ground && foliageParams.x > 0.) {
    if (leafMemory.y > 0.) {
      // The remembered leaf score (temporal stability round), eased toward this frame's test.
      float before = leafHistory(world);
      bool held = before >= .5;
      float test = foliageCell(cell, n, foliageParams.x + (held ? -foliageHistory.y : foliageHistory.y), held) ? 1. : 0.;
      leafScore = before < 0. ? test : mix(test, before, leafMemory.y);
      foliage = leafScore >= .5;
    } else {
      bool held = wasCanopy(world);
      foliage = foliageCell(cell, n, foliageParams.x + (held ? -foliageHistory.y : foliageHistory.y), held);
      leafScore = foliage ? 1. : 0.;
    }
  }
  float band = hazard > 0 ? 0. : foliage ? clumpField(world, data.x) : surfaceField(anchor, n, footX, footY, kind > 0, dashes, groundGain);
  float wet = 0., level = 0.;
  vec2 dash = vec2(0., 1.);
  if (ground && (wetParams.w > .5 || segmentParams.w > .5)) {
    // Ground faces up together with its four neighbours; leaves, wires and
    // one-cell ledges, whose reconstructed normals disagree, stay dry.
    float lowest = n.y;
    for (int k = 0; k < 4; k++) {
      ivec2 side = k < 2 ? ivec2(2 * k - 1, 0) : ivec2(0, 2 * k - 5);
      lowest = min(lowest, texelFetch(normals, artClamp(cell + side), 0).y);
    }
    float together = smoothstep(wetParams.y - .05, wetParams.y + .05, lowest);
    if (together > 0. && wetParams.w > .5 && hazard == 0) {
      // Reflections, lamp columns and sparkles need level ground (refine
      // round 2): the road, pavements and kerb tops, never the grass banks
      // beside them (amber column glyphs landed on the verges).
      wet = together * smoothstep(.93, .98, lowest) * mix(wetParams.z, 1., dampPatch(world.xz, wetParams.x));
      dash = groundDash(world, footX, footY);
    }
    // The ground style (mottle, lit flecks) follows the cell's own normal:
    // with the four-neighbour test, the ground cells beside a car, a kerb or a
    // gutter kept their unstyled lamp light, an orange outline around every
    // object on a flecked road (refine round 2).
    level = smoothstep(wetParams.y - .05, wetParams.y + .05, n.y);
  }
  // Foliage is world-anchored (kind 0) with w about 0.25 as its flag; world
  // cells carry their leaf score in w (leafAnchor).
  outAnchor = vec4(anchor, kind == 0 ? leafAnchor(leafScore, foliage) : float(kind));
  // z: dash as the sign, calm (1 at rest) in the magnitude: (1 + calm) / 2.
  outFields = vec4(band, wet, (dash.x > .5 ? .5 : -.5) * (1. + motionCalm), dash.y);
  // Ground stage: segment value; motion + 4 x the hazard code; ground level;
  // lamp-lit fraction.
  // y: the cell's motion (slide over the full screen-row slide, 0-1; every
  // world cell) + 4 x the hazard code.
  float moveShare = kind == 0 ? clamp(pickSlide / speedParams.y, 0., 1.) : 0.;
  // x: the dash value before the speckle (whole units of 1/255, the lit
  // flecks) plus the value with it (the fraction, the mottle).
  outGround = vec4(floor(segmentDash * 255. + .5) + min(segments.x, .999), moveShare + 4. * float(hazard), level,
    level > 0. && segmentParams.w > .5 && hazard == 0 ? litFraction(world, n) : 0.);
}`;

/**
 * Per-scanline scroll registers (one texel per art row), the raster road of
 * 16-bit racers: each frame a row's register adds the lateral screen travel of
 * the ground on that row from the camera's sideways travel along its own level
 * right vector (divided by the row's ground depth: near rows slide more), plus
 * a share of its yaw change against the road heading (scrollStep.y, every row
 * alike). The ground depth is the harmonic mean over ground cells sampled
 * across the row (never cars or sky). Forward travel adds nothing, so on a
 * straight the dashes hold still.
 *
 * The drawn scroll follows in whole cells, at most scrollLimit.x per frame and
 * only once the exact scroll leads it by scrollHold, and the exact scroll is
 * kept within scrollLimit.y cells of it: a row's dashes (runs of 2+ cells)
 * slide one way, a cell at a time, and a cell never sees A-B-A as they pass;
 * sub-cell wobble (a centimetre sideways is a cell on the nearest rows) never
 * steps them back and forth.
 */
const SCROLL_FRAGMENT = /* glsl */ `
uniform sampler2D scrollPrevious;
uniform vec4 scrollStep; // x: the camera's sideways travel this frame (m, along its level right vector); y: yaw change against the road (rad, + left); z: 1 when last frame's registers are valid; w: wrap (cells)
uniform float scrollHold; // cells the exact scroll may lead the drawn one before the dashes step (0.5: plain rounding; 1: a whole cell)
uniform vec2 scrollLimit; // x: most whole cells the drawn scroll steps per frame; y: most cells the exact scroll leads it
layout(location = 0) out vec4 outScroll;
void main() {
  int row = int(gl_FragCoord.y);
  vec4 last = scrollStep.z > .5 ? texelFetch(scrollPrevious, ivec2(0, row), 0) : vec4(0.);
  vec3 camera = artCameraWorld[3].xyz;
  vec3 forward = vec3(-artCameraWorld[2].x, 0., -artCameraWorld[2].z);
  forward /= max(length(forward), 1e-6);
  float count = 0., inverse = 0., ahead = 0.;
  for (int i = 0; i < 48; i++) {
    ivec2 cell = ivec2(int((float(i) + .5) * artSize.x / 48.), row);
    vec4 data = texelFetch(resolvedData, cell, 0);
    if (data.w >= .5 || texelFetch(normals, cell, 0).y < .55 || artCarId(cell) != 0) continue;
    float depth = max(data.x, .05);
    vec3 p = artWorldPosition(vec2(cell) + .5, data.x);
    inverse += 1. / depth; ahead += dot(p - camera, forward) / depth; count += 1.;
  }
  // A world point's screen x moves by (F dyaw - dside) / (cell scale x depth).
  float shift = count > 0. ? (scrollStep.y * ahead - scrollStep.x * inverse) / (count * artCellWorldScale)
    : scrollStep.y / artCellWorldScale;
  float wrap = scrollStep.w;
  float lead = last.z + shift - last.x;
  lead -= wrap * floor(lead / wrap + .5);
  float hold = clamp(scrollHold, .5, 2.);
  float move = sign(lead) * min(max(floor(abs(lead) + 1. - hold), 0.), scrollLimit.x);
  float drawn = mod(last.x + move, wrap);
  float exact = mod(drawn + clamp(lead - move, -scrollLimit.y, scrollLimit.y), wrap);
  // x: the drawn scroll (whole cells, wrapped); y: its step this frame (whole
  // cells; the screen-row history follows it); z: the exact scroll; w: the
  // row's slide (cells per frame), eased over a few frames (the speckle fade).
  outScroll = vec4(drawn, move, exact, mix(last.w, abs(shift), scrollStep.z > .5 ? .25 : 1.));
}`;

/**
 * Ripple spread (refine round 4): each row of the wet road carries the
 * brightest reflection within its own reach left and right (a hash of the
 * row's world position, so the ripples ride with the road), a little dimmer
 * per cell; the composite then stretches the widened reflections into
 * columns.
 */
const SPREAD_FRAGMENT = /* glsl */ `
uniform sampler2D wetTraceRaw;
uniform vec2 spreadParams; // x: most cells either side (0 off); y: light lost per cell
uniform vec4 groundAcross; // xyz: the road's lateral axis (world)
layout(location = 0) out vec4 outTrace;
void main() {
  ivec2 cell = artCell();
  vec4 own = texelFetch(wetTraceRaw, cell, 0);
  outTrace = own;
  if (spreadParams.x < .5) return;
  vec4 data = texelFetch(resolvedData, cell, 0);
  if (data.w >= .5) return;
  vec3 world = artWorldPosition(vec2(cell) + .5, data.x);
  vec3 forward = normalize(cross(vec3(0., 1., 0.), groundAcross.xyz));
  float level = floor(log2(max(artCellWorldSize(data.x), 1e-4)));
  int row = int(floor(dot(world, forward) / exp2(level)));
  float reach = spreadParams.x + 1.;
  int left = int(floor(artHash01(ivec3(row, int(level), 5501)) * reach)), right = int(floor(artHash01(ivec3(row, int(level), 5503)) * reach));
  vec3 best = own.rgb;
  float strongest = artLuminance(own.rgb);
  for (int dx = -4; dx <= 4; dx++) {
    if (dx == 0 || dx < -left || dx > right) continue;
    vec3 c = texelFetch(wetTraceRaw, artClamp(cell + ivec2(dx, 0)), 0).rgb * max(1. - spreadParams.y * float(abs(dx)), 0.);
    float l = artLuminance(c);
    if (l > strongest) { strongest = l; best = c; }
  }
  outTrace = vec4(best, own.a);
}`;

const TRACE_FRAGMENT = /* glsl */ `
uniform vec4 traceParams;  // x: max ray length (m); y: sky reflection factor; z: screen-edge fade (cells)
layout(location = 0) out vec4 outTrace;
const int TRACE_STEPS = 28;

vec3 projectCell(vec3 view) {
  vec4 clip = artProjection * vec4(view, 1.);
  return vec3((clip.xy / clip.w * .5 + .5) * artSize, 1. / clip.w);
}
float edgeFade(vec2 p) {
  float d = min(min(p.x, artSize.x - p.x), artSize.y - p.y);
  return smoothstep(0., traceParams.z, d);
}
/** Ray view depth behind the scene at screen parameter s (positive: behind). */
float behind(vec3 a, vec3 b, float s, out ivec2 hit) {
  vec3 p = mix(a, b, s);
  hit = ivec2(floor(p.xy));
  vec4 data = texelFetch(resolvedData, artClamp(hit), 0);
  return data.w >= .5 ? -1e9 : 1. / p.z - data.x;
}
/**
 * Screen-space reflection at art resolution. The reflected ray is clipped to
 * the screen and marched in screen space with perspective-correct inverse
 * depth: single cells near the start, growing steps farther on, then a
 * binary refinement at the first crossing behind the depth buffer.
 */
void main() {
  ivec2 cell = artCell();
  outTrace = vec4(0.);
  if (texelFetch(surfaceFields, cell, 0).y <= 0.) return;
  vec4 data = texelFetch(resolvedData, cell, 0);
  mat3 toView = transpose(mat3(artCameraWorld));
  vec3 normal = toView * texelFetch(normals, cell, 0).xyz;
  vec3 origin = artViewPosition(vec2(cell) + .5, data.x);
  vec3 dir = reflect(normalize(origin), normal);
  origin += normal * (.03 + .002 * data.x);
  float len = traceParams.x;
  if (dir.z > 1e-4) len = min(len, (-artCameraNear * 1.5 - origin.z) / dir.z);
  vec3 a = projectCell(origin), b = projectCell(origin + dir * len);
  // Clip the screen segment to the image (x both sides, y top; rays rise).
  vec2 delta = b.xy - a.xy;
  float exit = 1.;
  if (delta.x > 1e-4) exit = min(exit, (artSize.x - a.x) / delta.x);
  if (delta.x < -1e-4) exit = min(exit, -a.x / delta.x);
  if (delta.y > 1e-4) exit = min(exit, (artSize.y - a.y) / delta.y);
  if (delta.y < -1e-4) exit = min(exit, -a.y / delta.y);
  float cells = length(delta) * exit;
  if (cells >= 1.) {
    // Steps grow linearly from one cell so the march just reaches the exit.
    float grow = max(cells - float(TRACE_STEPS), 0.) / float(TRACE_STEPS * (TRACE_STEPS + 1) / 2);
    float s = 0., previous = 0.;
    ivec2 hit;
    for (int i = 1; i <= TRACE_STEPS; i++) {
      s = min(s + (1. + grow * float(i)) / length(delta), exit);
      float depthGap = behind(a, b, s, hit);
      float rayStep = abs(1. / mix(a.z, b.z, s) - 1. / mix(a.z, b.z, previous));
      if (depthGap > 0. && depthGap < max(.4, .06 / mix(a.z, b.z, s)) + rayStep) {
        // Refine between the last point in front and this one.
        float lo = previous, hi = s;
        for (int r = 0; r < 4; r++) {
          float mid = .5 * (lo + hi);
          ivec2 probe;
          if (behind(a, b, mid, probe) > 0.) hi = mid; else lo = mid;
        }
        behind(a, b, hi, hit);
        vec2 p = vec2(hit) + .5;
        outTrace = vec4(texelFetch(resolvedColor, artClamp(hit), 0).rgb, 1.) * edgeFade(p);
        return;
      }
      previous = s;
      if (s >= exit) break;
    }
  }
  // No surface along the ray: the sky where the reflected direction points.
  vec4 clip = artProjection * vec4(dir, 0.);
  if (clip.w <= 1e-4) return;
  vec2 p = (clip.xy / clip.w * .5 + .5) * artSize;
  if (any(lessThan(p, vec2(0.))) || any(greaterThanEqual(p, artSize))) return;
  ivec2 skyCell = ivec2(p);
  if (texelFetch(resolvedData, skyCell, 0).w < .5) return;
  outTrace = vec4(texelFetch(resolvedColor, skyCell, 0).rgb * traceParams.y, 1.) * edgeFade(p);
}`;

const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D wetTrace;
uniform vec4 columnParams;  // x: cells down (toward the camera), y: cells up, z: reflection strength, w: dash gap
uniform float wetFresnelFloor; // the least share of the mirror wet ground keeps where the view looks steeply down
uniform vec4 rippleParams;    // refine round 4: x 1 organic ripples on light columns; y blob width (cells); z blob height (rows); w hole threshold
uniform float ripplePebbles;  // share of column cells that are dark specks
uniform vec3 rippleFar;       // the ripples' shape farther off: x blob width (cells), y blob height (rows), z metres where it is reached (eased from half that)
uniform vec4 waveParams;      // refine round 4 waves: x 1 on; y crest threshold; z trough share of a reflection; w crest sheen (exposure-scaled luminance)
uniform vec4 waveShape;       // x band rows at the bottom of the screen; y band rows at the horizon row and above; z horizon row (share of the height); w stroke length (cells)
uniform float waveJitter;     // most cells a row's reflections shift sideways
uniform float waveRidge;      // band value above which a crest's ridge carries the sheen line
uniform vec4 waveDash;        // x light (exposure-scaled) at full dash density; y ripple-mark density on the dark road; z streak spacing (cells); w density between streaks
uniform float reflectionWarmth; // refine round 4: how far pale reflections turn toward the lamps' gold (0-1)
uniform vec3 sheenParams;   // x: brightness swing; y, z: exposure-scaled luminance where the swing starts / is full
uniform vec2 columnSource;  // exposure-scaled reflected luminance where a reflection starts / fully stretches into a column
uniform float surfaceExposure;
uniform vec4 fleckParams;      // x: density in full lamp light (0: off); y: lit light kept between flecks; z: brightest fleck; w: tint
uniform vec3 fleckShape;       // x: contrast kept at speed; y, z: marking albedo ratio start / full
uniform vec2 fleckLit;         // exposure-scaled lamp-lit luminance where flecks start / reach full density
uniform float fleckSplit2;     // share of the one-cell speckle in the fleck pick (0: whole dashes)
uniform vec4 fleckSplit;       // x: share of the lit light the flecks carry; y: density share in dim fringes; z: floor kept in every cell (exposure-scaled); w: 0 as the street lamps fade out (sunrise)
uniform float groundMottle;     // brightness swing of the ground dashes (+-)
uniform vec3 groundAmbientTint; // unit-luminance colour of the ambient light on the ground
uniform vec4 groundCaps;        // x: mottle kept at full speed; y: paint cap (x the darker ground either side); z: wet patch cap; w: smoothing at speed
uniform float wallSpeedSmooth;  // the share of the smoothing at speed upright world cells take
uniform vec3 groundFar;         // x, y: distance (m) over which the ground calms; z: how much
uniform vec4 groundAcross;      // xyz: the camera's level right vector; w: its accumulated lateral travel (m)
uniform vec2 dashParams;        // x: wet dash segment cells; y: duty
uniform vec4 speedParams;       // x, y: slide (cells per frame) where ground turns to screen-row dashes (start, full)
uniform vec4 surfaceMotion;     // xyz: the camera's travel per nominal frame (stepped)
uniform float foliageSmooth;    // canopy smoothing at rest (0-1)
uniform vec4 columnDash;        // a light's reflection column: x dash cells; y dash duty; z rows kept; w break tone (0: dark breaks)
uniform vec4 motionBlur;        // walls and verges at speed: x taps per cell of travel (0: off); y most taps; z travel (cells per frame) where it starts; w edge band (stops; 0: box)
uniform sampler2D scrollRows;   // the ground's per-row scroll registers (x: scroll, cells)
uniform vec4 scrollParams;      // x: registers on; z: wrap (cells); w: dash lengthening by the sideways slide
const int MAX_EMITTERS = ${MAX_GROUND_EMITTERS};
uniform int emitterCount;
uniform vec4 emitterScreen[MAX_EMITTERS]; // x: column centre (cells); y: the ground under the light (cells, the column's far end); z: depth there; w: width (cells)
uniform vec4 emitterWorld[MAX_EMITTERS];  // xyz: emitter position; w: seed
uniform vec3 emitterColour[MAX_EMITTERS]; // radiance x gain
uniform vec4 lampColumnParams;             // x: lobe toward the camera (rad); y: toward the light; z: weight from wetness (0: off); w: fade-out distance (m)
uniform vec4 lampTones;                    // x: core, y: dash, z: fringe (x the column radiance); w: break tone (x the dash tone; 0: dark breaks)
layout(location = 0) out vec4 outHdr;
layout(location = 1) out vec4 outGraded;
${PIXEL_ART_GRADE}
uniform float compositeGrade; // 1: also write the graded OKLab (the grade pass is skipped)
vec4 hdrOut;

/**
 * Ground style, in HDR. Every upward ground cell takes the dashes as a
 * brightness mottle (the cutscenes' 3-4 tone asphalt). Lit ground (their lamp
 * pools: dense horizontal amber flecks over violet) splits into an unlit
 * base, turned toward the ambient colour, and the lamp-lit part, drawn as the
 * dashes whose value clears a threshold that falls with the lamp light, so
 * pools are dense amber flecks at the centre and sparse ones at the rim.
 * Brighter albedo than the ground either side (markings, kerb edges) keeps
 * its colour, and nothing else is lifted above the paint: a styled cell stays
 * under groundCaps.y x the darker ground either side (or its own light).
 * speed: the share of screen-row dashes (their mottle calms to groundCaps.x);
 * far: the distance calm.
 */
vec3 groundStyle(vec3 colour, vec4 ground, float dashValue, float calm, float speed, float far, float marking, float around) {
  float f = ground.w;
  float lum = artLuminance(colour);
  bool flecks = fleckParams.x > 0. && f > .02;
  if ((!flecks && groundMottle <= 0.) || lum <= 1e-6) return colour;
  float contrast = mix(fleckShape.x, 1., calm) * ground.z * far;
  vec3 original = colour;
  colour *= 1. + groundMottle * contrast * mix(1., groundCaps.x, speed) * (2. * ground.x - 1.);
  lum = artLuminance(colour);
  vec3 styled = colour;
  if (flecks) {
    vec3 base = lum * (1. - f) * mix(colour / lum, groundAmbientTint, f * fleckParams.w);
    vec3 lit = max(colour - base, vec3(0.));
    lit *= lum * f / max(artLuminance(lit), 1e-6);
    // Lamp light on the ground (refine round 2): its dim share, up to
    // fleckFloor (exposure-scaled luminance, about the cutscenes' violet-grey
    // ground), stays in every cell turned toward the ambient colour; the rest
    // is drawn only as flecks, the gaps between them falling to fleckGap,
    // so a lamp-lit road reads as amber flecks over violet ground instead of
    // an orange wash. The density follows the lamp light: fleckDensity in
    // bright pool centres, fleckSparse of it in dim fringes; the flecks carry
    // about fleckKeep of that light (at most fleckBoost x, and the paint cap).
    // The lamps fading toward sunrise (fleckSplit.w) hand their pools back to plain light.
    float lamp = smoothstep(.05, .5, f) * fleckSplit.w;
    float litLum = lum * f;
    float floorLum = min(litLum, fleckSplit.z / max(surfaceExposure, 1e-4));
    vec3 floorColour = floorLum * mix(lit / max(litLum, 1e-6), groundAmbientTint, fleckParams.w * lamp);
    vec3 excess = lit * (1. - floorLum / max(litLum, 1e-6));
    float level = smoothstep(fleckLit.x, fleckLit.y, (litLum - floorLum) * surfaceExposure);
    float density = fleckParams.x * mix(fleckSplit.y, 1., level) * lamp;
    float gap = mix(1., fleckParams.y, contrast * lamp);
    float boost = clamp((fleckSplit.x - gap * (1. - density)) / max(density, 1e-3), 1., fleckParams.z);
    // Flecks are whole dashes (1-cell rows, 1-5 cells long), never a 1-cell
    // speckle: horizontal like the cutscenes' lit ground, no checkerboards.
    float fleck = mix(dashValue, ground.x, fleckSplit2);
    styled = base + floorColour + excess * (fleck > 1. - density ? boost : gap);
  }
  // Road paint stays the brightest thing on the road.
  float cap = max(artLuminance(original), groundCaps.y * around);
  float l = artLuminance(styled);
  if (l > cap) styled *= cap / l;
  return mix(styled, original, marking);
}

/**
 * Analytic lamp reflections (street-lamp heads, which the screen-space trace
 * cannot see above the image and whose mirror points fall in their own
 * pools): each emitter drops a screen-vertical column from the ground under
 * it toward the camera. Along the column the brightness follows a glossy
 * lobe in the vertical plane (the angle between the view and the mirrored
 * light, longer on soaked ground). Across it, every screen row is one dash
 * centred on the column axis (a quarter of the rows shift by one cell), its
 * length following the lobe: longest at the mirror point, tapering to a
 * single cell at both ends. Each dash has a cream core on the axis, amber
 * cells around it and, on some rows, a dim plum cell just beyond each end,
 * so the column melts into the mottled ground (radio-umbrella, harbor-wide)
 * instead of reading as a stack of flat glyphs. Rows are counted down from
 * the column's far end and hashed with the emitter, so the dashes ride with
 * the column instead of streaming (or stretching) with the road at speed.
 */
vec3 lampColumns(ivec2 cell, vec3 world) {
  vec3 best = vec3(0.);
  float strongest = 0.;
  vec3 eye = artCameraWorld[3].xyz - world;
  float eyeElevation = atan(eye.y, length(eye.xz));
  for (int i = 0; i < MAX_EMITTERS; i++) {
    if (i >= emitterCount) break;
    vec4 s = emitterScreen[i];
    int dx = cell.x - int(floor(s.x));
    if (float(abs(dx)) > s.w + 6. || float(cell.y) > s.y + .5) continue;
    float far = 1. - smoothstep(.4 * lampColumnParams.w, lampColumnParams.w, s.z);
    if (far <= 0.) continue;
    vec3 light = emitterWorld[i].xyz - world;
    // Only ground between the camera and the light mirrors it.
    if (dot(light.xz, eye.xz) > 0.) continue;
    float miss = atan(light.y, length(light.xz)) - eyeElevation;
    float lobe = exp(-pow(miss / (miss < 0. ? lampColumnParams.x : lampColumnParams.y), 2.));
    if (lobe < .03) continue;
    ivec3 row = ivec3(int(floor(s.y)) - cell.y, int(emitterWorld[i].w * 65535.), 7001);
    float jitter = artHash01(row), size = artHash01(row + ivec3(0, 0, 1)), skip = artHash01(row + ivec3(0, 0, 2));
    // Toward the column's ends rows thin out (refine round 2): a thinned row
    // keeps a single dim cell on the axis near the lobe's core instead of
    // going dark across the whole column, so a column is one body of stacked
    // dashes rather than a totem of blobs between full-width gaps.
    bool thin = skip > mix(.2, .85, lobe);
    float tone = 0.;
    if (lampTones.w > 0.) {
      // Mid-tone breaks (temporal stability and surfaces round): a thinned row
      // keeps the dash body a band or two down, a break inside a dash takes
      // that tone too, and plum cells keep to the dash ends (speckled edges),
      // so the column is one bright body of stacked dashes.
      int halfLength = int(floor(mix(.6, 1.2, size) * lobe * (s.w + 3.) * .5 + .5));
      if (thin) halfLength = max(halfLength - 1, 0);
      int shift = jitter < .25 ? -1 : jitter > .75 ? 1 : 0;
      int along = abs(dx - shift);
      float grain = artHash01(ivec3(dx - shift, row.x, row.y + 11));
      float level = mix(.8, 1.15, artHash01(row + ivec3(0, 0, 3)));
      float body = lampTones.y * level * (thin ? lampTones.w : 1.);
      tone = along <= (halfLength >= 4 ? 1 : 0) ? (thin ? body : lampTones.x * mix(.8, 1., grain))
        : along < halfLength ? (grain > .88 ? body * lampTones.w : body * mix(.8, 1.1, grain))
        : along == halfLength ? (grain < .4 ? lampTones.z : body * .8)
        : along == halfLength + 1 && grain < .3 ? lampTones.z : 0.;
    } else {
      if (thin && lobe < .45) continue;
      int halfLength = thin ? 0 : int(floor(mix(.6, 1.2, size) * lobe * (s.w + 3.) * .5 + .5));
      int shift = jitter < .25 ? -1 : jitter > .75 ? 1 : 0;
      int along = abs(dx - shift);
      // Per cell (riding with the column): the dash breaks into speckle away
      // from its core, some cells plum, the rest amber of varying strength, and
      // a 1-cell break here and there inside a long dash.
      float grain = artHash01(ivec3(dx - shift, row.x, row.y + 11));
      if (along > 1 && along < halfLength && grain > .88) continue;
      tone = thin ? (along == 0 ? lampTones.y * .7 : 0.)
        : along <= (halfLength >= 4 ? 1 : 0) ? lampTones.x * mix(.8, 1., grain)
        : along <= halfLength ? (grain < .3 ? lampTones.z : lampTones.y * mix(.65, 1.2, grain))
        : along == halfLength + 1 && grain < .35 ? lampTones.z : 0.;
    }
    if (tone <= 0.) continue;
    vec3 value = emitterColour[i] * lobe * far * tone;
    float l = artLuminance(value);
    if (l > strongest) { strongest = l; best = value; }
  }
  return best;
}

/**
 * Ground composite, in HDR before the grade: lamp-lit ground breaks into
 * flecks; wet ground adds the reflection trace stretched into a vertical
 * column (the brightest source within the column window, fading with
 * distance, as rough wet asphalt elongates reflections along the view plane)
 * times Fresnel, wetness and the dash mask (stacked 1-cell horizontal
 * dashes), and the analytic lamp columns. Hazard cells (oil) keep their
 * light: the sparkle stage draws them.
 */
/**
 * Horizontal wave bands across the wet road (refine round 4): returns the band
 * value at a cell (0-1, crests high) and, in v, the band coordinate. Screen
 * rows, so every reflection breaks along the same wave lines; the bands
 * widen toward the camera (the row coordinate is the integral of one over a
 * period growing from waveShape.y at the horizon row to waveShape.x at the
 * bottom, so it never chirps), wander a little across the screen and fade in
 * and out along it.
 */
float waveBand(ivec2 cell, out float v) {
  float y = float(cell.y), x = float(cell.x), Y = max(artSize.y * waveShape.z, 1.), p0 = waveShape.x, p1 = waveShape.y;
  if (abs(p1 - p0) < 1e-3) v = y / p0;
  else if (y < Y) v = Y / (p1 - p0) * log(mix(p0, p1, y / Y) / p0);
  else v = Y / (p1 - p0) * log(p1 / p0) + (y - Y) / p1;
  v += (artValueNoise(vec3(x * .018, 0., 0.), 811) - .5) * 1.6;
  return .7 * artValueNoise(vec3(v, x * .006, 3.), 823) + .3 * artValueNoise(vec3(v * 2.3, x * .015, 9.), 829);
}
/** Whether a crest cell lies on one of its band's strokes (long horizontal pieces about waveShape.w cells, a few gaps). */
float waveStroke(ivec2 cell, float v) {
  float band = floor(v), length = waveShape.w * mix(.5, 1.5, artHash01(ivec3(int(band), 41, 8807)));
  float offset = artHash01(ivec3(int(band), 43, 8809)) * length;
  return artHash01(ivec3(int(band), int(floor((float(cell.x) + offset) / length)), 8803)) < .72 ? 1. : 0.;
}
/** Two octaves of value noise at a ripple lattice level (refine round 4). */
float rippleNoise(float x, float y, float k) {
  vec3 q = vec3(x, y, k * 13.);
  return .62 * artValueNoise(q, 421) + .38 * artValueNoise(vec3(q.xy * 2.3, q.z + 5.), 433);
}
void composite() {
  ivec2 cell = artCell();
  vec4 base = texelFetch(resolvedColor, cell, 0);
  // Alpha: the share of the cell's light that is a reflection (fraction) and
  // 1 on road paint (accumulate.ts takes the current frame on both: columns
  // ride with their light, and paint streams past the screen-row dashes).
  hdrOut = vec4(base.rgb, 0.);
  vec4 fields = texelFetch(surfaceFields, cell, 0);
  vec4 ground = texelFetch(groundFields, cell, 0);
  // x packs the whole dash value (flecks) and, in its fraction, the value with the speckle (mottle).
  float dashValue = floor(ground.x) / 255.;
  ground.x = fract(ground.x);
  int hazard = int(floor(ground.y * .25 + .125));
  if (hazard > 0) return;
  // ground.y: the cell's motion (its slide / the full screen-row slide).
  float motion = clamp(ground.y, 0., 1.);
  float speed = smoothstep(speedParams.x / speedParams.y, 1., motion);
  float calm = 2. * abs(fields.z) - 1.;
  float depth = texelFetch(resolvedData, cell, 0).x;
  float marking = 0., around = 0.;
  vec3 colour = base.rgb;
  float anchorKind = texelFetch(anchors, cell, 0).w;
  // Moving world surfaces lose the rendered textures' finest detail: sliding
  // a fraction of a cell or more per frame, asphalt, grass, bark and facade
  // texture alias in the cell resolve and boil in any palette. An
  // edge-preserving 5 x 3 mean over cells of the same depth layer and similar
  // light removes it; pools, shadows, windows, silhouettes and paint are edges
  // or smooth and stay, and the stable dashes redraw the ground's texture.
  float moving = groundCaps.w * smoothstep(.03, .3, motion * speedParams.y) * (ground.z > .5 ? 1. : wallSpeedSmooth);
  // Canopy (refine round 2) is smoothed at rest too, over canopy cells only,
  // and more broadly: per-leaf light breaks a canopy into boiling lace; its
  // clumps' band offsets redraw it as massed tones.
  bool canopyCell = abs(anchorKind - .25) < .01;
  float amount = canopyCell ? max(moving, foliageSmooth) : moving;
  vec3 source = base.rgb;
  if (amount > 0. && anchorKind > -.5 && anchorKind < .5) {
    float lum = artLuminance(source);
    vec3 sum = source;
    float weight = 1.;
    // Ground keeps one row (5 x 1): moving ground stays horizontal dashes.
    int rows = ground.z > .5 ? 0 : 1;
    vec2 band = canopyCell ? vec2(.3, 3.) : vec2(.45, 1.45);
    for (int y = -1; y <= 1; y++) for (int x = -2; x <= 2; x++) {
      if ((x == 0 && y == 0) || abs(y) > rows) continue;
      ivec2 other = artClamp(cell + ivec2(x, y));
      vec4 od = texelFetch(resolvedData, other, 0);
      float ok = texelFetch(anchors, other, 0).w;
      if (od.w >= .5 || ok <= -.5 || ok >= .5 || abs(od.x - depth) > .08 * depth + .1) continue;
      if (canopyCell && abs(ok - .25) > .01) continue;
      vec3 c = texelFetch(resolvedColor, other, 0).rgb;
      float ratio = artLuminance(c) / max(lum, 1e-6);
      float w = smoothstep(band.x, band.x * 1.55, ratio) * (1. - smoothstep(band.y, band.y * 1.5, ratio));
      sum += c * w; weight += w;
    }
    source = mix(source, sum / weight, amount);
  }
  // Walls, kerbs and trees sliding past at speed (refine round 2): their
  // texture, repeating about twice its per-frame travel, strobed at 30 Hz
  // (wagon-wheel aliasing that the palette turned into full flips). The cell
  // averages the resolved light over two frames of its own screen motion
  // (wallMotionFilter), on its own depth layer: a box as long as that period
  // cancels the strobe, and posterised it reads as speed streaks.
  // Ground keeps its own treatment (screen-row dashes; a box over 10+ cells
  // on the near road would smear the cars' shadows).
  if (motionBlur.x > 0. && anchorKind > -.5 && anchorKind < .5 && ground.z < .5 && moving > 0.) {
    vec3 world = artWorldPosition(vec2(cell) + .5, depth);
    vec3 before = transpose(mat3(artCameraWorld)) * (world + surfaceMotion.xyz - artCameraWorld[3].xyz);
    vec4 clip = artProjection * vec4(before, 1.);
    vec2 travel = clip.w > 1e-3 ? vec2(cell) + .5 - (clip.xy / clip.w * .5 + .5) * artSize : vec2(0.);
    float cells = length(travel);
    float taps = clamp(floor(cells * motionBlur.x + .5), 1., motionBlur.y);
    if (cells >= motionBlur.z && taps > 1.5) {
      vec3 sum = vec3(0.);
      float weight = 0., total = 0., centre = max(artLuminance(base.rgb), 1e-6);
      for (int i = 0; i < 12; i++) {
        if (float(i) >= taps) break;
        ivec2 other = artClamp(ivec2(floor(vec2(cell) + .5 + travel * motionBlur.x * ((float(i) + .5) / taps - .5))));
        vec4 od = texelFetch(resolvedData, other, 0);
        float ok = texelFetch(anchors, other, 0).w;
        if (od.w >= .5 || ok <= -.5 || ok >= .5 || abs(od.x - depth) > .08 * depth + .1) continue;
        vec3 c = texelFetch(resolvedColor, other, 0).rgb;
        // Edge-preserving (wallMotionEdge): only taps within a fraction of a
        // stop of this cell's light count, so low-contrast texture (siding,
        // grain, the strobe) averages while windows, signs and edges stay hard.
        float w = motionBlur.w > 0. ? 1. - smoothstep(.5 * motionBlur.w, motionBlur.w, abs(log2(max(artLuminance(c), 1e-6) / centre))) : 1.;
        sum += c * w; weight += w; total += 1.;
      }
      if (weight > 0.) source = mix(source, sum / weight, smoothstep(motionBlur.z, motionBlur.z * 2., cells) * min(total / taps * 1.5, 1.)
        * (motionBlur.w > 0. ? min(weight / max(total, 1.) * 2., 1.) : 1.));
    }
  }
  colour = source;
  if (ground.z > 0.) {
    // Road markings and kerb edges: brighter albedo (or, for sub-cell paint,
    // a brighter brightest sample) than the darker ground either side.
    // A marking is brighter than the ground on both sides (a line): measured
    // against the darker side alone, lit asphalt beside a dark gutter, a car's
    // shadow or a kerb passed as paint and kept its unstyled lamp light, an
    // orange band on a flecked road (refine round 2).
    vec2 sides = vec2(1e9), sidePeaks = vec2(1e9);
    for (int k = 3; k <= 6; k++) {
      vec4 right = texelFetch(resolvedColor, artClamp(cell + ivec2(k, 0)), 0);
      vec4 left = texelFetch(resolvedColor, artClamp(cell - ivec2(k, 0)), 0);
      sides = min(sides, vec2(artLuminance(left.rgb), artLuminance(right.rgb)));
      sidePeaks = min(sidePeaks, vec2(left.a, right.a));
    }
    around = max(sides.x, sides.y);
    float aroundPeak = max(sidePeaks.x, sidePeaks.y);
    float lum = artLuminance(base.rgb);
    marking = max(smoothstep(fleckShape.y, fleckShape.z, lum / max(around, 1e-6)),
      smoothstep(fleckShape.y * 1.25, fleckShape.z * 1.25, base.a / max(aroundPeak, 1e-6)));
    float far = 1. - groundFar.z * smoothstep(groundFar.x, groundFar.y, depth);
    // Lane paint keeps its own crisp cell.
    colour = groundStyle(marking > .5 ? base.rgb : source, ground, dashValue, calm, speed, far, marking, around);
  }
  hdrOut = vec4(colour, marking > .5 ? 1. : 0.);
  if (fields.y <= 0.) return;
  int down = int(columnParams.x), up = int(columnParams.y);
  // Waves (refine round 4): this row's band, and its sideways shift (smooth from row to row, so a light's streak
  // wavers rather than shattering).
  float waveV = 0., wave = waveParams.x > .5 ? waveBand(cell, waveV) : 1.;
  int jx = waveParams.x > .5 ? int(floor((artValueNoise(vec3(float(cell.y) * .45, 2., 0.), 857) - .5) * 2. * waveJitter + .5)) : 0;
  vec3 column = vec3(0.);
  float strongest = 0.;
  int bestDy = 0;
  bool stretched = false;
  // Past 32 cells every other row (refine round 4): the far street's lights mirror near the horizon, and their
  // streaks reach the near road only with a longer window (up to 96 cells).
  for (int k = -8; k <= 64; k++) {
    int dy = k <= 32 ? k : 32 + (k - 32) * 2;
    if (dy < -up || dy > down) continue;
    ivec2 source = cell + ivec2(jx, dy);
    if (source.y < 0 || source.y >= int(artSize.y)) continue;
    vec4 trace = texelFetch(wetTrace, source, 0);
    float reach = float(dy >= 0 ? down : up) + 1.;
    // Only lights and lit panels stretch into columns; dimmer reflections
    // (poles, walls, sky) stay in their own cell instead of becoming streaks.
    float emitter = smoothstep(columnSource.x, columnSource.y, artLuminance(trace.rgb) * surfaceExposure);
    vec3 value = trace.rgb * (1. - abs(float(dy)) / reach) * (dy == 0 ? 1. : emitter);
    float luminance = artLuminance(value);
    if (luminance > strongest) { strongest = luminance; column = value; bestDy = dy; stretched = emitter > .5; }
  }
  vec3 ray = artWorldRay(vec2(cell) + .5);
  float cosine = abs(dot(ray, texelFetch(normals, cell, 0).xyz));
  // Refine round 4: a floor under the Fresnel term, so the near road, seen steeply, still mirrors the street's
  // light as the user's rain-night concept paints it (a pure Fresnel term left it eight times darker than 20 m on).
  float fresnel = max(.02 + .98 * pow(1. - cosine, 5.), wetFresnelFloor);
  bool on = fields.z > 0.;
  vec3 world = artWorldPosition(vec2(cell) + .5, depth);
  // A light's column (refine round 2: at rest too) and, at speed, every
  // reflection: rows counted from the reflected source (a window's stack of
  // dashes rides with the window; a cell's own reflection on its screen row),
  // dash ends anchored to the world's lateral position. A column's rows are
  // long dashes (columnDash.x cells, columnDash.y on) broken at different x,
  // with a few whole rows off: stacked 1-cell dashes as in radio-umbrella,
  // where the world-anchored 2-cell mask read as a leopard-spot dissolve.
  float dashTone = -1.;
  if (waveParams.x < .5 && (stretched || speed > 0.)) {
    int row = bestDy != 0 ? bestDy : 4096 + cell.y;
    int segment;
    float k;
    if (scrollParams.x > .5) {
      // On the ground's scroll registers: whole-cell dashes that slide with the row.
      float len = clamp(floor((stretched ? columnDash.x : dashParams.x) + .5), 1., 6.);
      float u = float(cell.x) + .5 - texelFetch(scrollRows, ivec2(0, cell.y), 0).x;
      segment = int(mod(floor(u / len + artHash01(ivec3(row, 67, 9101))), floor(scrollParams.z / len + .5)));
      k = len;
    } else {
      float lateral = dot(world - artCameraWorld[3].xyz, groundAcross.xyz) + groundAcross.w;
      float cellSize = max(artCellWorldSize(depth), 1e-5);
      float cells = stretched ? columnDash.x : dashParams.x;
      float size = cellSize * max(cells, 2.5 * abs(dot(surfaceMotion.xyz, groundAcross.xyz)) / cellSize * scrollParams.w);
      float level = log2(size);
      k = floor(level);
      k += artHash01(ivec3(row, 61, 9101)) < level - k ? 1. : 0.;
      float lattice = exp2(k);
      segment = int(floor((lateral + artHash01(ivec3(row, 67, 9101)) * lattice) / lattice));
    }
    if (stretched && rippleParams.x > .5) {
      // Organic ripples (refine round 4): blobs of water and dark asphalt with their own tones, from a noise field
      // laid out across from the column's source (its world-anchored lateral cells at a power-of-two lattice level,
      // the two nearest levels blended so the scale never jumps), so the pattern rides sideways with the light; and
      // scattered dark specks.
      // Across, the source cell's lateral position (all of the column's cells share it, so the blobs stand upright on
      // screen; the current cell's own lateral position sheared them toward the vanishing point).
      ivec2 sourceCell = artClamp(cell + ivec2(0, bestDy));
      float sourceDepth = texelFetch(resolvedData, sourceCell, 0).x;
      vec3 sourceWorld = artWorldPosition(vec2(sourceCell) + .5, sourceDepth);
      float across = dot(sourceWorld - artCameraWorld[3].xyz, groundAcross.xyz) + groundAcross.w;
      // Near the camera organic blobs, down the road long vertical streaks (rippleFar), by the reflection's own distance.
      float farShape = smoothstep(.5 * rippleFar.z, rippleFar.z, sourceDepth);
      float blobCells = mix(rippleParams.y, rippleFar.x, farShape), blobRows = mix(rippleParams.z, rippleFar.y, farShape);
      float level = log2(max(artCellWorldSize(sourceDepth), 1e-5) * blobCells), lk = floor(level), lf = level - lk;
      // Down, the screen row: counted from each column's source, the blobs sheared along a sign's slanted lower edge
      // (its columns start on different rows); on screen rows a moving light's column slides through the field,
      // which reads as ripples running through its reflection.
      float y = float(cell.y) / blobRows;
      float n = mix(rippleNoise(across / exp2(lk), y, lk), rippleNoise(across / exp2(lk + 1.), y, lk + 1.), lf);
      float pebble = artHash01(ivec3(int(floor(across * blobCells / exp2(lk))), cell.y, 9241 + int(lk) * 64));
      on = n > rippleParams.w && pebble >= ripplePebbles;
      dashTone = on ? mix(.62, 1.15, smoothstep(rippleParams.w, .85, n)) : columnParams.w * .5;
    } else if (stretched) {
      on = artHash01(ivec3(row, 71, 9101)) < columnDash.z && artHash01(ivec3(segment, row, 9187 + int(k) * 4096)) < columnDash.y;
      // Stacked dashes of a few tones with mid-tone breaks (columnBreak): a
      // lit panel's column is no longer a smooth gradient cut by dark gaps.
      if (columnDash.w > 0.) dashTone = on ? mix(.7, 1.1, artHash01(ivec3(segment, row, 9199 + int(k) * 4096))) : columnDash.w;
    }
    else if (artHash01(ivec3(segment, row, 9173 + int(k) * 4096)) < speed)
      on = artHash01(ivec3(segment, row, 9181 + int(k) * 4096)) < dashParams.y;
  }
  // In wave mode the reflection is drawn whole here and broken into ripple dashes below.
  float dash = waveParams.x > .5 ? 1. : dashTone >= 0. ? dashTone : on ? 1. : columnParams.w;
  // The earlier sheen (lit wet ground swung by the dash mask) stands in for
  // the flecks when they are off.
  float lit = smoothstep(sheenParams.y, sheenParams.z, artLuminance(base.rgb) * surfaceExposure);
  float sheen = 1. + sheenParams.x * fields.y * lit * calm * (on ? 1. : -1.);
  vec3 reflection = column * fresnel * fields.y * columnParams.z * dash;
  // Damp-patch mirrors of the sky and walls stay within about a band of the
  // ground, so a puddle never out-shouts a hazard; lights and lit panels keep
  // their full columns.
  if (!stretched) {
    float cap = groundCaps.z * artLuminance(colour), l = artLuminance(reflection);
    if (l > cap) reflection *= cap / l;
  }
  if (lampColumnParams.z > 0. && emitterCount > 0) {
    // Lamp columns follow the road's wetness more than the damp patches.
    float wet = ground.z * lampColumnParams.z * mix(.55, 1., fields.y / max(ground.z, 1e-3)) * smoothstep(0., .03, fields.y);
    vec3 lamps = lampColumns(cell, world) * fresnel * wet;
    if (artLuminance(lamps) > artLuminance(reflection)) reflection = lamps;
  }
  // Pale reflections take the street lamps' gold (refine round 4), their luminance kept: a white sign mirrors
  // gold in the wet road, as the repaints paint it; tail lamps and neon keep their own colour. Only while the
  // lamps burn at night strength (fleckSplit.w), so the sunrise road keeps the sky's peach.
  float reflected = artLuminance(reflection);
  if (reflectionWarmth * fleckSplit.w > 0. && reflected > 1e-5) {
    vec3 rlab = artLinearToOklab(reflection);
    float pale = 1. - smoothstep(.06, .16, length(rlab.yz) / max(rlab.x, .05));
    reflection = mix(reflection, vec3(1., .55, .22) * (reflected / .6219), reflectionWarmth * fleckSplit.w * pale);
  }
  // Ripple dashes (refine round 4 waves): the reflection broken into short horizontal dashes whose density follows
  // its light, thinned between vertical streaks and in the wave bands' troughs; the dark road keeps faint ripple
  // marks of the night's ambient colour. The dashes are screen rows (2-4 cells, each with its own threshold), so they
  // hold still under a still light.
  if (waveParams.x > .5) {
    float light = artLuminance(reflection) * surfaceExposure;
    ivec2 sourceCell = artClamp(cell + ivec2(jx, bestDy));
    float sourceDepth = texelFetch(resolvedData, sourceCell, 0).x;
    float across = dot(artWorldPosition(vec2(sourceCell) + .5, sourceDepth) - artCameraWorld[3].xyz, groundAcross.xyz) + groundAcross.w;
    float streakX = across / max(artCellWorldSize(sourceDepth) * waveDash.z, 1e-4);
    float streak = mix(waveDash.w, 1., smoothstep(.35, .62, artValueNoise(vec3(streakX, 0., 0.), 863)));
    float band = mix(.35, 1.15, smoothstep(.2, .8, wave));
    float density = clamp(smoothstep(0., waveDash.x, light) * streak * band, 0., 1.);
    int row = cell.y;
    float length = 2. + floor(artHash01(ivec3(row, 47, 8811)) * 3.);
    float offset = artHash01(ivec3(row, 53, 8813)) * length;
    float threshold = artHash01(ivec3(int(floor((float(cell.x) + offset) / length)), row, 8819));
    // The ripple marks are finer than the dashes (1-2 cells, their own partition), as the repaints speckle the road.
    // Fewer where the road itself is lighter (dusk, sunrise): there the marks read as grey static, not ripples.
    float marks = waveDash.y * smoothstep(0., .35, fields.y) * band * mix(.25, 1., 1. - smoothstep(.05, .16, artLuminance(colour) * surfaceExposure));
    float markLength = 1. + floor(artHash01(ivec3(row, 59, 8821)) * 2.);
    float markThreshold = artHash01(ivec3(int(floor((float(cell.x) + artHash01(ivec3(row, 61, 8823)) * markLength) / markLength)), row, 8827));
    if (threshold < density) reflection *= mix(1.15, 1., density);
    else {
      reflection *= waveParams.z;
      if (waveParams.w > 0. && markThreshold < marks)
        reflection = max(reflection, groundAmbientTint * vec3(.7, .8, 1.6) * waveParams.w / max(surfaceExposure, 1e-4));
    }
  }
  // Lane paint is never painted over by reflections.
  reflection *= 1. - marking;
  vec3 total = colour * sheen + reflection;
  hdrOut = vec4(total, min(artLuminance(reflection) / max(artLuminance(total), 1e-6), .99) + (marking > .5 ? 1. : 0.));
}
void main() {
  composite();
  outHdr = hdrOut;
  outGraded = compositeGrade > .5 ? vec4(artGrade(artCell(), hdrOut.rgb), 1.) : vec4(0.);
}`;

const TEMPORAL_FRAGMENT = /* glsl */ `
${SURFACE_COMMON}
uniform vec4 moverMin[MAX_MOVERS];
uniform mat4 moverPrevious[MAX_MOVERS];
uniform sampler2D temporalPrevious; // last frame's history: index, depth (16-bit log2), state and kind
uniform float temporalValid;
uniform sampler2D temporalMarks;    // last frame's final linework marks (intact until the lines stage runs)
uniform vec3 temporalParams;        // x: margin (weighted OKLab); y: relative depth tolerance; z: margin on ground drawn with screen-row dashes
uniform float temporalCar;          // margin on car cells
uniform sampler2D scrollRows;       // the ground's per-row scroll registers (y: this frame's shift, cells)
uniform float scrollShift;          // 1: screen-row history is read where the row's dashes were last frame
uniform vec4 speedParams;           // x, y: slide where ground turns to screen-row dashes (start, full)
uniform vec2 lutWeights;
uniform float bandStep;
uniform float bandStrength;
uniform float paletteFull;          // 1: the graded colour itself; the palette index still rides in alpha (stages.ts)
layout(location = 0) out vec4 outImage;
layout(location = 1) out vec4 outHistory;
const float DEPTH_LOG_MIN = -8., DEPTH_LOG_RANGE = 24.;
vec2 packDepth(float depth) {
  float t = floor(clamp((log2(max(depth, 1e-6)) - DEPTH_LOG_MIN) / DEPTH_LOG_RANGE, 0., 1.) * 65535. + .5);
  return vec2(floor(t / 256.), mod(t, 256.)) / 255.;
}
float unpackDepth(vec2 v) {
  float t = (floor(v.x * 255. + .5) * 256. + floor(v.y * 255. + .5)) / 65535.;
  return exp2(t * DEPTH_LOG_RANGE + DEPTH_LOG_MIN);
}
/**
 * History alpha: kind code (0 world, 1-8 mover, 15 sky) + 16 x state (0 new,
 * 1 same entry, 2 held) + 64 when the surface carried a glint last frame
 * + 128 on canopy (the surface stage's foliage hysteresis, refine round 2).
 */
bool canopy = false;
float packState(int kind, int state, bool glint) { return float((kind < 0 ? 15 : kind) + 16 * state + (glint ? 64 : 0) + (canopy ? 128 : 0)) / 255.; }
int unpackKind(float a) { int code = int(a * 255. + .5) % 16; return code == 15 ? -1 : code; }
vec3 offsetLab(ivec2 cell) {
  // The accumulation stage may already carry the band offset (accumulate.ts).
  if (artAccumOffset > .5) return texelFetch(accumulated, cell, 0).xyz;
  vec3 lab = texelFetch(graded, cell, 0).xyz;
  if (bandStrength > 0.) lab.x += artBandOffset(cell, texelFetch(resolvedData, cell, 0)) * bandStep * bandStrength;
  return lab;
}
float matchDistance(vec3 lab, int index) {
  vec3 d = (lab - texelFetch(paletteLab, ivec2(index, 0), 0).xyz) * vec3(lutWeights.x, lutWeights.yy);
  return length(d);
}
/** Last frame's view depth and image cell of this cell's anchor (w < 0: not on screen). */
vec4 previousCell(vec4 anchor) {
  int kind = anchorKind(anchor.w);
  vec4 world = kind < 0 ? vec4(anchor.xyz, 0.) : vec4(anchor.xyz, 1.);
  if (kind > 0) {
    if (moverMin[kind - 1].w < .5) return vec4(-1.);
    world = moverPrevious[kind - 1] * world;
  }
  vec4 clip = artPreviousViewProjection * world;
  if (clip.w <= 1e-4) return vec4(-1.);
  vec2 p = (clip.xy / clip.w * .5 + .5) * artSize;
  if (any(lessThan(p, vec2(0.))) || any(greaterThanEqual(p, artSize))) return vec4(-1.);
  return vec4(p, clip.w, 1.);
}
float depthSlope(ivec2 cell, float depth) {
  float x = min(abs(texelFetch(resolvedData, artClamp(cell + ivec2(1, 0)), 0).x - depth),
    abs(texelFetch(resolvedData, artClamp(cell - ivec2(1, 0)), 0).x - depth));
  float y = min(abs(texelFetch(resolvedData, artClamp(cell + ivec2(0, 1)), 0).x - depth),
    abs(texelFetch(resolvedData, artClamp(cell - ivec2(0, 1)), 0).x - depth));
  return max(x, y);
}
void main() {
  ivec2 cell = artCell();
  // The quantize stage's palette snap, done here (one pass fewer): the band
  // offset (unless the accumulation carries it), then the OKLab LUT.
  vec3 lab = offsetLab(cell);
  int best = int(texelFetch(paletteLut, lutTexel(lutNode(lab)), 0).r * 255. + .5);
  vec4 current = vec4(texelFetch(paletteColors, ivec2(best, 0), 0).rgb, float(best) / 255.);
  if (paletteFull > .5) current.rgb = clamp(artLinearToDisplay(artOklabToLinear(lab)), 0., 1.);
  vec4 data = texelFetch(resolvedData, cell, 0);
  vec4 anchor = artAnchor(cell, data);
  int kind = anchorKind(anchor.w);
  // The surface stage's canopy flag rides in the history (bit 128) for its hysteresis.
  canopy = abs(anchor.w - .25) < .01;
  outImage = current;
  outHistory = vec4(current.a, packDepth(data.x), packState(kind, 0, false));
  if (temporalValid < .5) return;
  // Ground drawn with the screen-row dashes (speed pick above one half) keeps
  // its history in screen space, as its dashes do: the same cell last frame
  // carried the same dash, so only a real change of light moves it off its
  // entry (the rendered asphalt's aliasing at speed does not).
  float motion = kind == 0 && artSurfaceReady > .5 ? texelFetch(groundFields, cell, 0).y : 0.;
  bool screenRows = motion <= 1. && texelFetch(groundFields, cell, 0).z > 0.
    && smoothstep(speedParams.x / speedParams.y, 1., motion) >= .5;
  vec2 rowShift = screenRows && scrollShift > .5 ? vec2(texelFetch(scrollRows, ivec2(0, cell.y), 0).y, 0.) : vec2(0.);
  vec4 previous = screenRows ? vec4(vec2(cell) + .5 - rowShift, data.x, 1.) : previousCell(anchor);
  if (screenRows && (previous.x < 0. || previous.x >= artSize.x)) return;
  if (previous.w < 0.) return;
  ivec2 before = ivec2(previous.xy);
  vec4 history = texelFetch(temporalPrevious, before, 0);
  if (unpackKind(history.a) != kind) return;
  if (kind >= 0) {
    // The same surface: last frame's depth there matches where this point was.
    float tolerance = temporalParams.y * previous.z + depthSlope(cell, data.x) + .05;
    if (abs(unpackDepth(history.yz) - previous.z) > tolerance) return;
  }
  // Carried forward for the glints stage, which keeps a glint with a lower bar.
  bool glint = abs(texelFetch(temporalMarks, before, 0).g - .6) < .1;
  outHistory.a = packState(kind, 1, glint);
  int held = int(history.x * 255. + .5);
  if (held == best || held >= paletteSize) return;
  // Keep last frame's entry while it is nearly as good a match as the best:
  // band boundaries stop crawling under sub-cell motion. The margin is at
  // most half the colour step to the neighbouring cells, so on smooth
  // gradients (sky) a boundary lags by under half a cell instead of dragging.
  vec3 w = vec3(lutWeights.x, lutWeights.yy);
  float step = 0.;
  for (int k = 0; k < 4; k++) {
    ivec2 side = k < 2 ? ivec2(2 * k - 1, 0) : ivec2(0, 2 * k - 5);
    step = max(step, length((offsetLab(artClamp(cell + side)) - lab) * w));
  }
  // Car cells, reprojected with their car, hold a little more (refine round
  // 2): rival cars' band edges hopped between entries on sub-cell motion.
  float margin = min(screenRows ? temporalParams.z : kind > 0 ? temporalCar : temporalParams.x, .5 * step);
  if (matchDistance(lab, held) > matchDistance(lab, best) + margin) return;
  // Holding steadies the index the line stages decide by; in full colour the cell keeps its own colour.
  outImage = vec4(paletteFull > .5 ? current.rgb : texelFetch(paletteColors, ivec2(held, 0), 0).rgb, float(held) / 255.);
  outHistory = vec4(outImage.a, packDepth(data.x), packState(kind, 2, glint));
}`;

const SPARKLE_FRAGMENT = /* glsl */ `
uniform ivec4 sparkleEntries; // amber, gold, lavender, pale
uniform vec3 sparkleParams;   // x: density in light; y: rain-splash density; z: rain (0-1)
uniform float surfaceExposure;
uniform vec3 keyLightDirection; // linework.ts: toward the key light (world)
uniform vec2 keyLight;          // x: key strength, y: warmth (1 amber key)
uniform vec2 keyGlint;          // x: density of key glints at the key's specular peak; y: lobe exponent
uniform ivec4 oilNight;         // core, ring, outline, streak (cool key)
uniform ivec4 oilDawn;          // the same under a warm key
uniform vec2 markingRatio;      // albedo ratio to the darker ground either side where a cell is lane paint (start, full)
uniform vec4 sparkleGlitter;    // refine round 4: x glitter density on calm wet ground (0 off), y its OKLab lightness lift, z the cars' raindrops (wet, 0-1), w the trails' share
uniform float sparkleDrizzle;   // refine round 4: share of wet cells taking a drizzle speck this moment (0 off)
uniform float paletteFull;      // 1: full colour (glitter draws), 0: palette lock
uniform vec4 surfaceMotion;     // xyz: the camera's travel per nominal frame (stepped)
layout(location = 0) out vec4 outImage;
int hazardAt(ivec2 c) { return int(floor(texelFetch(groundFields, artClamp(c), 0).y * .25 + .125)); }
/**
 * Race hazards (oil) as the cutscenes draw glossy liquid: a flat two-tone
 * dark gloss (core, ring), a darker 1-cell outline where the slick meets the
 * road, and 1-cell highlight streaks across it (lavender under the night
 * moon, amber under a warm key). Palette entries, drawn over everything the
 * ground stage and linework did there.
 */
bool drawHazard(ivec2 cell) {
  int code = hazardAt(cell);
  if (code == 0) return false;
  ivec4 set = keyLight.y > .5 ? oilDawn : oilNight;
  bool edge = hazardAt(cell + ivec2(1, 0)) == 0 || hazardAt(cell - ivec2(1, 0)) == 0
    || hazardAt(cell + ivec2(0, 1)) == 0 || hazardAt(cell - ivec2(0, 1)) == 0;
  // The core takes a calm 1-cell mottle of the ring's tone on the ground's
  // own dashes (refine round 2), not a flat fill.
  bool mottle = code == 1 && fract(texelFetch(groundFields, cell, 0).x) > .74;
  int entry = edge ? set.z : code == 3 ? set.w : code == 1 && !mottle ? set.x : set.y;
  outImage = vec4(texelFetch(paletteColors, ivec2(entry, 0), 0).rgb, float(entry) / 255.);
  return true;
}
/**
 * A glitter cell's colour (refine round 4): the shown colour lifted by lift
 * (OKLab L) and a little more saturated, so it keeps the hue of the light it
 * mirrors; on dark asphalt (low chroma) a pale cool blue-white, as the
 * cutscene-style repaints speckle it (a saturated violet read as lavender
 * snow on the rainy dusk road).
 */
vec3 glitterColour(vec3 own, float lift) {
  vec3 shown = artLinearToOklab(mix(own / 12.92, pow((own + .055) / 1.055, vec3(2.4)), step(vec3(.04045), own)));
  float chroma = length(shown.yz), lit = smoothstep(.03, .07, chroma);
  vec2 hue = chroma > .02 ? shown.yz / chroma : vec2(-.25, -.97);
  hue = normalize(mix(vec2(-.25, -.97), hue, lit));
  shown.yz = hue * mix(.035, max(chroma * 1.3, .08), lit);
  shown.x = min(shown.x + lift, .92);
  return clamp(artLinearToDisplay(artOklabToLinear(shown)), 0., 1.);
}
/**
 * Raindrops on the cars (refine round 4: the user's rain-night concept, whose
 * cars' roofs, boot lids and bonnets glitter with drops catching the street
 * light). On a wet night a few cells of upward-facing paint on near cars, on a
 * lattice about a cell across in the car's own frame (the anchors' car-local
 * position), so the drops ride with the car instead of crawling over it.
 */
bool carDrop(ivec2 cell) {
  if (sparkleGlitter.z <= 0. || artCarKind(cell) != 1) return false;
  int id = artCarId(cell);
  vec4 anchor = texelFetch(anchors, cell, 0);
  if (abs(anchor.w - float(id)) > .5 || texelFetch(normals, cell, 0).y < .55) return false;
  float depth = texelFetch(resolvedData, cell, 0).x;
  if (depth > 30.) return false;
  float level = floor(log2(max(artCellWorldSize(depth), 1e-4)) + .5), size = exp2(level);
  // Fewer drops (refine round 4: at 5.5% the paint read as noise beside the cutscenes' clean bodywork).
  return artHash01(ivec3(ivec2(floor(anchor.xz / size)), int(level) + 64 * id + 7919)) < .022 * sparkleGlitter.z;
}
/**
 * Glitter at speed (refine round 4): where the ground slides more than a cell
 * or two a frame a single speck would jump, so each speck is drawn as the path
 * it travelled since the last frame, bright at its head and fading behind, and
 * the paths of successive frames join into the streaks of light a wet road
 * throws at speed. The longer the path, the fewer the specks, so the cover
 * stays about the glitter's; they hand over to the still glitter as the ground
 * calms. Returns the trail's strength at this cell (0 none).
 */
float glitterTrail(ivec2 cell, vec4 fields, float calm) {
  float depth = texelFetch(resolvedData, cell, 0).x;
  vec3 world = artWorldPosition(vec2(cell) + .5, depth);
  vec3 before = transpose(mat3(artCameraWorld)) * (world + surfaceMotion.xyz - artCameraWorld[3].xyz);
  vec4 clip = artProjection * vec4(before, 1.);
  if (clip.w <= 1e-3) return 0.;
  // This cell's travel since the last frame: a speck now at cell + travel * t passed here t of a frame ago.
  vec2 travel = vec2(cell) + .5 - (clip.xy / clip.w * .5 + .5) * artSize;
  float cells = length(travel);
  if (cells < 1.5) return 0.;
  float share = sparkleGlitter.x * sparkleGlitter.w * smoothstep(0., .35, fields.y) * (1. - calm) / cells;
  int taps = int(min(ceil(cells), 16.));
  for (int k = 0; k < 16; k++) {
    if (k >= taps) break;
    float t = float(k) / float(taps);
    vec4 source = texelFetch(surfaceFields, artClamp(ivec2(floor(vec2(cell) + .5 + travel * t))), 0);
    if (source.y > 0. && source.w < share) return 1. - t;
  }
  return 0.;
}
/**
 * Sparse single-cell sparkles on wet ground, denser in lamp pools and
 * reflection columns: amber and gold under warm light, lavender in cool
 * light, pale rain splashes in rain. A warm key (dusk or sunrise sun) also
 * glints on sunlit ground where its specular lobe peaks, in place of the
 * soft glare the road finish caps. The hash is surface anchored (one-cell
 * lattice), so sparkles stay put on the road as it slides by; they are gone
 * once it slides about two cells per frame (single cells would teleport), and
 * never land on lane paint.
 */
void main() {
  ivec2 cell = artCell();
  vec4 current = texelFetch(image, cell, 0);
  outImage = current;
  if (artSurfaceReady < .5) return;
  if (oilNight.x >= 0 && drawHazard(cell)) return;
  if (paletteFull > .5 && carDrop(cell)) {
    vec4 drawn = texelFetch(marks, cell, 0);
    // Warm: a drop catches the street's lamps (the repaints draw gold specks on the red paint, not pink ones).
    if (max(drawn.r, max(drawn.g, drawn.b)) <= .5) outImage = vec4(mix(glitterColour(current.rgb, sparkleGlitter.y + .05), vec3(1., .8, .52), .45), current.a);
    return;
  }
  vec4 fields = texelFetch(surfaceFields, cell, 0);
  float ground = texelFetch(groundFields, cell, 0).z;
  if (fields.y <= 0. && (ground <= 0. || keyGlint.x <= 0.)) return;
  vec4 m = texelFetch(marks, cell, 0);
  if (max(m.r, max(m.g, m.b)) > .5) return;
  vec3 light = max(texelFetch(hdr, cell, 0).rgb, vec3(0.));
  float lit = smoothstep(.1, .6, artLuminance(light) * surfaceExposure);
  // Sparkles are single cells: they go where the ground slides fast.
  float calm = smoothstep(.75, 1., 2. * abs(fields.z) - 1.);
  float density = fields.y * sparkleParams.x * lit * calm;
  float splash = sparkleParams.y * sparkleParams.z * calm;
  float key = 0.;
  if (keyGlint.x > 0. && ground > 0. && keyLight.y > .5) {
    vec3 halfway = normalize(keyLightDirection - artWorldRay(vec2(cell) + .5));
    float lobe = pow(max(dot(texelFetch(normals, cell, 0).xyz, halfway), 0.), keyGlint.y);
    // Sunlit ground (asphalt under a low sun is darker than a lamp pool).
    float sunlit = smoothstep(.04, .2, artLuminance(light) * surfaceExposure);
    // Level ground only (the road, not the grass banks).
    key = keyGlint.x * keyLight.x * lobe * sunlit * ground * calm * smoothstep(.93, .98, texelFetch(normals, cell, 0).y);
  }
  // Full where the ground is damp (its reflection weight .35 and up): a soaked road in rain carries no more specks
  // than a damp one (proportional to the weight, rain doubled them into a snowfall at dusk).
  float glitter = paletteFull > .5 ? smoothstep(0., .35, fields.y) * sparkleGlitter.x * calm * step(.5, ground) : 0.;
  float trail = paletteFull > .5 && sparkleGlitter.x * sparkleGlitter.w > 0. && calm < 1. && ground > .5 && fields.y > 0. ? glitterTrail(cell, fields, calm) : 0.;
  // Drizzle (refine round 4): drops landing on the wet road, re-rolled about every other frame, on screen cells
  // (a drop lands where it lands; it does not ride with the road). A cell's own rain-drop draw, so a still frame
  // shows the speckled asphalt of the repaints and motion shows a light drizzle.
  bool drop = paletteFull > .5 && sparkleDrizzle > 0. && ground > .5 && fields.y > 0.
    && artHash01(ivec3(cell, int(floor(artTime * 15.)) + 7703)) < sparkleDrizzle * smoothstep(0., .35, fields.y);
  if (drop && trail <= 0.) trail = .7;
  if (trail <= 0. && fields.w >= density + splash + key + glitter) return;
  // Never on lane paint (albedo brighter than the darker ground either side).
  float lum = artLuminance(texelFetch(resolvedColor, cell, 0).rgb), around = 1e9;
  for (int k = 3; k <= 4; k++) {
    around = min(around, artLuminance(texelFetch(resolvedColor, artClamp(cell + ivec2(k, 0)), 0).rgb));
    around = min(around, artLuminance(texelFetch(resolvedColor, artClamp(cell - ivec2(k, 0)), 0).rgb));
  }
  if (lum > markingRatio.x * around) return;
  if (trail > 0. || fields.w >= density + splash + key) {
    // Glitter (refine round 4); a trail fades toward its tail.
    outImage = vec4(glitterColour(current.rgb, sparkleGlitter.y * (trail > 0. ? trail : 1.)), current.a);
    return;
  }
  vec3 lab = artLinearToOklab(light / max(max(light.r, max(light.g, light.b)), 1e-5));
  float hue = atan(lab.z, lab.y);
  bool warm = length(lab.yz) > .03 && abs(mod(hue - 1.2 + 3.14159265, 6.28318531) - 3.14159265) < 1.1;
  // Lit sparkles take the light's warmth; rain splashes are pale or lavender.
  int entry = fields.w >= density + splash ? (lit > .7 ? sparkleEntries.y : sparkleEntries.x)
    : fields.w >= density ? (fields.w - density < .5 * splash ? sparkleEntries.w : sparkleEntries.z)
    : warm ? (lit > .7 ? sparkleEntries.y : sparkleEntries.x) : sparkleEntries.z;
  vec3 fill = texelFetch(paletteLab, ivec2(int(current.a * 255. + .5), 0), 0).xyz;
  if (texelFetch(paletteLab, ivec2(entry, 0), 0).x < fill.x + .1) return;
  outImage = vec4(texelFetch(paletteColors, ivec2(entry, 0), 0).rgb, float(entry) / 255.);
}`;


export interface SurfaceStages {
  /** After 'normals'. */
  readonly surface: PixelArtStage;
  /** After 'surface'. */
  readonly reflect: PixelArtStage;
  /** After 'quantize'. */
  readonly temporal: PixelArtStage;
  /** After 'cleanup' (or last). */
  readonly sparkle: PixelArtStage;
}

export interface Surfaces {
  readonly stages: SurfaceStages;
  configure(options: SurfaceOptions): void;
  /** Road wetness (the road finish's value: 0.6 damp dusk .. 1 rain) and rain (0-1). */
  setWetness(wetness: number, rain: number): void;
  /** Rigid moving objects (cars), at most MAX_MOVERS; their cells are anchored in their own frame. */
  setMovers(objects: readonly THREE.Object3D[]): void;
  /** Drop the temporal history (camera cut, course change). */
  resetHistory(): void;
  /** Inspection: each mover slot's local box (null when inactive). */
  moverBounds(): ({ min: number[]; max: number[] } | null)[];
  /** The mover slots (boxes and transforms, updated in the surface stage's beginFrame), shared with cars.ts. */
  readonly movers: MoverSlots;
  /** The ground's speed thresholds (x, y: slide where ground turns to screen-row dashes), shared with accumulate.ts. */
  readonly speedParams: THREE.IUniform<THREE.Vector4>;
  /** 1 once the reflect composite drew this frame: `hdr` alpha is then each cell's reflection share (fraction) + 1 on road paint (accumulate.ts). */
  readonly reflectReady: THREE.IUniform<number>;
  /** The ground's scroll registers (x: drawn scroll, y: its step this frame) and their switch (x: 1 on), shared with accumulate.ts. */
  readonly scrollRows: THREE.IUniform<THREE.Texture>;
  readonly scrollParams: THREE.IUniform<THREE.Vector4>;
  /** Inspection: this frame's camera sideways travel (m) and yaw change (rad) that drive the scroll registers. */
  scrollStep(): { side: number; turn: number; heading: readonly number[] };
  /** Spot lights whose pools the lit-ground flecks follow (at most MAX_POOL_LIGHTS; read every frame). */
  setPoolLights(lights: readonly THREE.SpotLight[]): void;
  /** This frame's emitters for the analytic lamp columns (the first `count`, at most MAX_GROUND_EMITTERS; copied). */
  setGroundEmitters(emitters: readonly GroundEmitter[], count: number): void;
  /** Ambient irradiance on upward ground (key, fill and environment; linear), the lamp pools' reference. */
  setGroundAmbient(irradiance: THREE.Color): void;
  /** This frame's race hazards on the road (oil slicks; the first `count`, at most MAX_HAZARDS; copied). */
  setHazards(hazards: readonly GroundHazard[], count: number): void;
  /**
   * This frame's lamp heads for the analytic lamp heads (linework glow): the
   * first `count` emitters passed to setGroundEmitters, positions (xyz; w the
   * ground under them) and radiance (rgb; w their width).
   */
  readonly lampHeads: LampHeads;
}

export type MoverSlots = ReturnType<typeof createMovers>;

export interface SurfaceDependencies {
  /** Grade exposure (shared by reference), for luminance thresholds. */
  exposure: THREE.IUniform<number>;
  /** Palette LUT weights (lightness, chroma), for the hysteresis match distance. */
  lutWeights: THREE.IUniform<THREE.Vector2>;
  /** The quantize stage's band uniforms (bandStep, bandStrength, and the placeholder's bandFeatureCells, bandSkyScale). */
  band: Record<string, THREE.IUniform>;
  /** Key light uniforms the lines stage refreshes each frame (linework.carHandoff), for the key glints. */
  key?: { keyLightDirection: THREE.IUniform<THREE.Vector3>; keyLight: THREE.IUniform<THREE.Vector2> };
  /** The grade stage's uniforms and skip flag: the reflect composite grades its own result (one pass fewer). */
  grade?: { uniforms: Record<string, THREE.IUniform>; done: { value: boolean } };
}

export function createSurfaces(shared: PixelArtSharedUniforms, palette: PixelPalette, deps: SurfaceDependencies): Surfaces {
  const entry = (hex: string) => nearestPaletteIndex(palette, hex);
  // Anchors, fields and the ground stage's cells (segment value, row hash, ground level, lit fraction).
  // Ping-ponged: last frame's anchors carry the leaf scores (foliageMemory).
  const surfaceTargets = [artTarget(THREE.FloatType, 'SORA pixel-art surface anchors A', 3),
    artTarget(THREE.FloatType, 'SORA pixel-art surface anchors B', 3)] as const;
  let surfaceIndex = 0, surfaceFrame = -2;
  const traceTarget = artTarget(THREE.HalfFloatType, 'SORA pixel-art wet reflection trace');
  const spreadTarget = artTarget(THREE.HalfFloatType, 'SORA pixel-art wet reflection ripple spread');
  // HDR with the reflections (0; alpha: reflection share + 1 on road paint) and, when deps.grade is given, its graded OKLab (1).
  const wetTarget = artTarget(THREE.HalfFloatType, 'SORA pixel-art wet HDR', 2);
  // Image + history pairs that alternate: one is written, the other's history is read.
  const historyTargets = [artTarget(THREE.UnsignedByteType, 'SORA pixel-art temporal A', 2),
    artTarget(THREE.UnsignedByteType, 'SORA pixel-art temporal B', 2)] as const;
  // Per-scanline scroll registers (1 x art height, ping-ponged).
  const scrollTargets = [artTarget(THREE.FloatType, 'SORA pixel-art ground scroll A'),
    artTarget(THREE.FloatType, 'SORA pixel-art ground scroll B')] as const;
  const scrollRows = { value: scrollTargets[0].texture as THREE.Texture };
  const scrollParams = { value: new THREE.Vector4(1, 0.5, GROUND_SCROLL_WRAP, 1) };
  const scrollUniforms = { scrollPrevious: { value: scrollTargets[1].texture as THREE.Texture },
    scrollStep: { value: new THREE.Vector4(0, 0, 0, GROUND_SCROLL_WRAP) }, scrollHold: { value: 1 }, scrollLimit: { value: new THREE.Vector2(1, 3) } };
  const lateralStep = new THREE.Vector2();
  let scrollIndex = 0, scrollFrame = -2, scrollReset = true, scrollTurn = 0;

  const movers = createMovers();
  const reflectReady = { value: 0 };
  const surfaceUniforms = {
    moverMin: { value: movers.min }, moverMax: { value: movers.max }, moverToLocal: { value: movers.toLocal },
    fieldCells: { value: new THREE.Vector4() }, fieldGroundGain: { value: 1 }, fieldWallSpeed: { value: 1 }, fieldWallGain: { value: 1 }, skyCluster: { value: new THREE.Vector3() },
    groundYaw: { value: new THREE.Vector3(0, 0, Math.PI / 8) },
    wetParams: { value: new THREE.Vector4() }, dashParams: { value: new THREE.Vector2() },
    surfaceMotion: { value: new THREE.Vector4() }, cameraTurn: { value: 0 }, pickMotion: { value: new THREE.Vector4() }, segmentParams: { value: new THREE.Vector4() }, groundSpeckle: { value: 0 },
    poolPosition: { value: Array.from({ length: MAX_POOL_LIGHTS }, () => new THREE.Vector4()) },
    poolDirection: { value: Array.from({ length: MAX_POOL_LIGHTS }, () => new THREE.Vector4()) },
    poolShape: { value: Array.from({ length: MAX_POOL_LIGHTS }, () => new THREE.Vector4()) },
    groundAmbient: { value: 0.3 },
    speedParams: { value: new THREE.Vector4() }, groundFar: { value: new THREE.Vector3() }, foliageParams: { value: new THREE.Vector3() },
    foliageHistory: { value: new THREE.Vector2() },
    surfacePrevious: { value: surfaceTargets[1].textures[0] as THREE.Texture }, leafMemory: { value: new THREE.Vector2() },
    groundAcross: { value: new THREE.Vector4(1, 0, 0, 0) }, hazardCount: { value: 0 },
    hazardFrame: { value: Array.from({ length: MAX_HAZARDS }, () => new THREE.Vector4()) },
    hazardSize: { value: Array.from({ length: MAX_HAZARDS }, () => new THREE.Vector4()) },
    scrollRows, scrollParams,
  };
  const traceUniforms = { traceParams: { value: new THREE.Vector4() } };
  const spreadUniforms = { wetTraceRaw: { value: traceTarget.texture }, spreadParams: { value: new THREE.Vector2(4, .08) },
    groundAcross: surfaceUniforms.groundAcross };
  const compositeUniforms = {
    wetTrace: { value: traceTarget.texture }, columnParams: { value: new THREE.Vector4() },
    sheenParams: { value: new THREE.Vector3() }, columnSource: { value: new THREE.Vector2(0.5, 1) }, wetFresnelFloor: { value: 0 },
    rippleParams: { value: new THREE.Vector4(1, 4.5, 4, .42) }, ripplePebbles: { value: .05 }, rippleFar: { value: new THREE.Vector3(2.5, 11, 12) },
    waveParams: { value: new THREE.Vector4(1, .33, .1, .045) }, waveShape: { value: new THREE.Vector4(3.5, 1.8, .55, 12) }, waveJitter: { value: 1.5 },
    waveRidge: { value: .74 }, waveDash: { value: new THREE.Vector4(.6, .15, 5, .2) }, reflectionWarmth: { value: .9 }, surfaceExposure: deps.exposure,
    fleckParams: { value: new THREE.Vector4() },
    fleckShape: { value: new THREE.Vector3() }, groundAmbientTint: { value: new THREE.Vector3(1, 1, 1) },
    emitterCount: { value: 0 },
    emitterScreen: { value: Array.from({ length: MAX_GROUND_EMITTERS }, () => new THREE.Vector4()) },
    emitterWorld: { value: Array.from({ length: MAX_GROUND_EMITTERS }, () => new THREE.Vector4()) },
    emitterColour: { value: Array.from({ length: MAX_GROUND_EMITTERS }, () => new THREE.Vector3()) },
    lampColumnParams: { value: new THREE.Vector4() }, fleckLit: { value: new THREE.Vector2() }, fleckSplit: { value: new THREE.Vector4(0, 0, 0, 1) }, fleckSplit2: { value: 0 },
    groundMottle: { value: 0 },
    groundCaps: { value: new THREE.Vector4() }, wallSpeedSmooth: { value: 0 }, groundFar: surfaceUniforms.groundFar, groundAcross: surfaceUniforms.groundAcross,
    speedParams: surfaceUniforms.speedParams, surfaceMotion: surfaceUniforms.surfaceMotion,
    dashParams: surfaceUniforms.dashParams, lampTones: { value: new THREE.Vector4() }, foliageSmooth: { value: 0 },
    columnDash: { value: new THREE.Vector4(4, 0.75, 0.85, 0) }, motionBlur: { value: new THREE.Vector4() },
    scrollRows, scrollParams,
    ...(deps.grade?.uniforms ?? { toneMappingExposure: deps.exposure }), compositeGrade: { value: deps.grade ? 1 : 0 },
  };
  const temporalUniforms = {
    ...deps.band,
    moverMin: { value: movers.min }, moverPrevious: { value: movers.previous },
    temporalPrevious: { value: null as THREE.Texture | null }, temporalValid: { value: 0 },
    temporalMarks: { value: null as THREE.Texture | null },
    temporalParams: { value: new THREE.Vector3() }, lutWeights: deps.lutWeights, speedParams: surfaceUniforms.speedParams,
    temporalCar: { value: 0.05 }, scrollRows, scrollShift: { value: 1 },
  };
  const sparkleUniforms = {
    sparkleEntries: { value: new THREE.Vector4(entry(SPARKLE_COLOURS.amber), entry(SPARKLE_COLOURS.gold),
      entry(SPARKLE_COLOURS.lavender), entry(SPARKLE_COLOURS.white)) },
    sparkleParams: { value: new THREE.Vector3() }, surfaceExposure: deps.exposure,
    keyLightDirection: deps.key?.keyLightDirection ?? { value: new THREE.Vector3(0, 1, 0) },
    keyLight: deps.key?.keyLight ?? { value: new THREE.Vector2(0, 0) }, keyGlint: { value: new THREE.Vector2() },
    oilNight: { value: new THREE.Vector4(entry(OIL_COLOURS.night.core), entry(OIL_COLOURS.night.ring),
      entry(OIL_COLOURS.night.outline), entry(OIL_COLOURS.night.streak)) },
    oilDawn: { value: new THREE.Vector4(entry(OIL_COLOURS.dawn.core), entry(OIL_COLOURS.dawn.ring),
      entry(OIL_COLOURS.dawn.outline), entry(OIL_COLOURS.dawn.streak)) },
    markingRatio: { value: new THREE.Vector2() },
    sparkleGlitter: { value: new THREE.Vector4() }, sparkleDrizzle: { value: 0 }, paletteFull: deps.band.paletteFull ?? { value: 1 },
    surfaceMotion: surfaceUniforms.surfaceMotion,
  };
  const oilEntries = sparkleUniforms.oilNight.value.x;

  const surfaceMaterial = stageMaterial('SORA pixel-art surfaces', shared, SURFACE_FRAGMENT, surfaceUniforms);
  const traceMaterial = stageMaterial('SORA pixel-art wet trace', shared, TRACE_FRAGMENT, traceUniforms);
  const spreadMaterial = stageMaterial('SORA pixel-art wet ripple spread', shared, SPREAD_FRAGMENT, spreadUniforms);
  const compositeMaterial = stageMaterial('SORA pixel-art wet composite', shared, COMPOSITE_FRAGMENT, compositeUniforms);
  // The temporal match distance uses the band offset exactly as quantize did.
  const temporalMaterial = stageMaterial('SORA pixel-art temporal', shared,
    `${PIXEL_ART_LUT_ADDRESS}\n${PIXEL_ART_BAND_OFFSET}\n${TEMPORAL_FRAGMENT}`, temporalUniforms);
  const sparkleMaterial = stageMaterial('SORA pixel-art wet sparkles', shared, SPARKLE_FRAGMENT, sparkleUniforms);
  const scrollMaterial = stageMaterial('SORA pixel-art ground scroll', shared, SCROLL_FRAGMENT, scrollUniforms);

  let wetness = 0.6, rain = 0, wetOn = true, dampBase = SURFACE_DEFAULTS.wetDampBase;
  const cameraTravel = createCameraTravel();
  const ground = createGroundLights(surfaceUniforms, compositeUniforms);
  let lampColumnsOn = true, flecksOn = true, dryFade = true, ambientScale = 1, lampGain = 1;
  let mottle = 0, dryMottle = 1, columnFar = SURFACE_DEFAULTS.lampColumnFar, lobeDamp = SURFACE_DEFAULTS.lampLobeDamp, lobeWet = SURFACE_DEFAULTS.lampLobeWet, columnWidth = SURFACE_DEFAULTS.lampColumnWidth;
  let frameCount = 0, lastTemporalFrame = -2, historyIndex = 0, historyReset = true;
  let hazardCount = 0;
  // Camera speed (m per nominal frame, from 0.01) and turn (cells per frame, from 0.1) in steps.
  const speedSteps = createStepper(0.01), turnSteps = createStepper(0.1);
  let pickTime = NaN;
  let keyGlintDensity = 0, keyGlintDry = SURFACE_DEFAULTS.sparkleKeyDry, sparkleLit = 0, sparkleRain = 0, glitter = 0, drizzle = 0, oilOn = true;
  const lateral = createLateralTravel();

  const surface: PixelArtStage = {
    name: 'surface', enabled: true,
    setSize(grid: PixelArtGrid) {
      for (const target of [...surfaceTargets, traceTarget, spreadTarget, wetTarget, ...historyTargets]) target.setSize(grid.artWidth, grid.artHeight);
      for (const target of scrollTargets) target.setSize(1, grid.artHeight);
      historyReset = true;
      scrollReset = true;
    },
    beginFrame(frame) {
      frameCount++;
      // Mover transforms advance every frame (enabled or not), so a stage
      // switched back on never reprojects against a stale transform.
      movers.update();
      shared.artSurfaceReady.value = 0;
      reflectReady.value = 0;
      const e = frame.camera.matrixWorld.elements;
      cameraTravel.update(frame.camera, frame.time, surfaceUniforms.surfaceMotion.value);
      // The ground's mode (world rows or screen-row dashes, dash by dash), its
      // smoothing and the walls' motion widening follow the camera's speed and
      // turn in steps with hysteresis: the smoothed values still wobble frame
      // to frame (60 Hz frames of a 30 Hz simulation), and a threshold riding
      // on that wobble flipped dashes back and forth every frame.
      const travel = surfaceUniforms.surfaceMotion.value;
      const speed = Math.hypot(travel.x, travel.y, travel.z);
      const stepped = speedSteps.update(speed, frame.time);
      const scale = speed > 1e-6 ? stepped / speed : 0;
      travel.set(travel.x * scale, travel.y * scale, travel.z * scale, travel.w);
      surfaceUniforms.cameraTurn.value = turnSteps.update(Math.abs(cameraTravel.turn()) / Math.max(shared.artCellWorldScale.value, 1e-6), frame.time);
      // The mode pick eases toward the stepped travel and turn (about 0.15 s),
      // so a step (a stop, most of all) switches the dashes one by one.
      const dt = frame.time - pickTime;
      pickTime = frame.time;
      const ease = Number.isFinite(dt) && dt > 0 && dt < 0.25 ? 1 - Math.exp(-dt / 0.15) : dt === 0 ? 0 : 1;
      const pick = surfaceUniforms.pickMotion.value;
      pick.set(pick.x + (travel.x - pick.x) * ease, pick.y + (travel.y - pick.y) * ease, pick.z + (travel.z - pick.z) * ease,
        pick.w + (surfaceUniforms.cameraTurn.value - pick.w) * ease);
      lateral.update(frame.camera, surfaceUniforms.groundAcross.value, lateralStep);
      const yaw = THREE.MathUtils.euclideanModulo(Math.atan2(e[2]!, e[0]!), Math.PI) / (Math.PI / 8);
      surfaceUniforms.groundYaw.value.set(Math.floor(yaw) % 8, yaw - Math.floor(yaw), Math.PI / 8);
      ground.updatePools(ambientScale);
    },
    render(frame) {
      // Rain wets the whole ground; in dry weather the damp patches carry most
      // reflections, and a drying road (sunrise) loses the mirror between them.
      surfaceUniforms.wetParams.value.x = wetness;
      const drying = dryFade ? THREE.MathUtils.smoothstep(wetness, 0.2, 0.6) : 1;
      surfaceUniforms.wetParams.value.z = THREE.MathUtils.lerp(dampBase * drying, 1, rain);
      surfaceUniforms.wetParams.value.w = wetOn ? 1 : 0;
      // Last frame's history (still bound) carries the canopy bit.
      surfaceUniforms.foliageHistory.value.x = temporal.enabled && !historyReset && lastTemporalFrame === frameCount - 1
        && shared.artHasPrevious.value > 0.5 ? 1 : 0;
      if (scrollParams.value.x > 0.5) {
        // This frame's scroll registers (before the dashes read them).
        const write = scrollTargets[scrollIndex]!, read = scrollTargets[1 - scrollIndex]!;
        scrollUniforms.scrollPrevious.value = read.texture;
        scrollUniforms.scrollStep.value.set(lateralStep.x, lateralStep.y * scrollTurn, !scrollReset && scrollFrame === frameCount - 1 ? 1 : 0, GROUND_SCROLL_WRAP);
        frame.draw(scrollMaterial, write);
        scrollRows.value = write.texture;
        scrollIndex = 1 - scrollIndex;
        scrollFrame = frameCount;
        scrollReset = false;
      }
      const surfaceTarget = surfaceTargets[surfaceIndex]!;
      surfaceUniforms.surfacePrevious.value = surfaceTargets[1 - surfaceIndex]!.textures[0]!;
      surfaceUniforms.leafMemory.value.x = !historyReset && surfaceFrame === frameCount - 1 && shared.artHasPrevious.value > 0.5 ? 1 : 0;
      frame.draw(surfaceMaterial, surfaceTarget);
      shared.anchors.value = surfaceTarget.textures[0]!;
      shared.surfaceFields.value = surfaceTarget.textures[1]!;
      shared.groundFields.value = surfaceTarget.textures[2]!;
      surfaceIndex = 1 - surfaceIndex;
      surfaceFrame = frameCount;
      shared.artSurfaceReady.value = 1;
    },
    dispose() { surfaceMaterial.dispose(); scrollMaterial.dispose(); for (const target of [...surfaceTargets, ...scrollTargets]) target.dispose(); },
  };
  const reflect: PixelArtStage = {
    name: 'reflect', enabled: true,
    setSize() { /* sized by the surface stage */ },
    render(frame) {
      if (shared.artSurfaceReady.value < 0.5) return;
      // Lamp columns: brighter and longer on wetter ground, gone on a dry road.
      const weight = lampColumnsOn && wetOn ? Math.max(THREE.MathUtils.smoothstep(wetness, 0.15, 0.85), rain) : 0;
      // Lamp pools turn into flecks only while the street lamps burn at night
      // strength; toward sunrise (lamps at 45%) the city switches off and the
      // pools are plain light again (sunrise-wide's road has no amber flecks).
      let level = ground.heads.count > 0 ? 0 : 1;
      for (let i = 0; i < ground.heads.count; i++) level = Math.max(level, ground.heads.level[i] ?? 0);
      compositeUniforms.fleckSplit.value.w = THREE.MathUtils.smoothstep(level, 0.5, 0.85);
      // The grade's night darks (plum drive, ground floor) follow the same lamp level.
      if (deps.grade?.uniforms.plumNight) deps.grade.uniforms.plumNight.value = compositeUniforms.fleckSplit.value.w;
      const soak = Math.max(THREE.MathUtils.smoothstep(wetness, 0.6, 1), rain);
      const lobe = THREE.MathUtils.lerp(lobeDamp, lobeWet, soak);
      const damp = Math.max(THREE.MathUtils.smoothstep(wetness, 0.2, 0.6), rain);
      compositeUniforms.groundMottle.value = mottle * THREE.MathUtils.lerp(dryMottle, 1, damp);
      compositeUniforms.lampColumnParams.value.set(lobe, 0.5 * lobe, weight, columnFar);
      ground.projectEmitters(frame.camera, shared.artSize.value, shared.artCellWorldScale.value, lampGain, columnWidth, weight > 0);
      frame.draw(traceMaterial, traceTarget);
      // Ripple spread (refine round 4), when on: the composite stretches the widened reflections.
      if (spreadUniforms.spreadParams.value.x >= 0.5) frame.draw(spreadMaterial, spreadTarget);
      compositeUniforms.wetTrace.value = spreadUniforms.spreadParams.value.x >= 0.5 ? spreadTarget.texture : traceTarget.texture;
      frame.draw(compositeMaterial, wetTarget);
      shared.hdr.value = wetTarget.textures[0]!;
      reflectReady.value = 1;
      if (deps.grade) {
        shared.graded.value = wetTarget.textures[1]!;
        deps.grade.done.value = true;
      }
    },
    dispose() { traceMaterial.dispose(); spreadMaterial.dispose(); compositeMaterial.dispose(); traceTarget.dispose(); spreadTarget.dispose(); wetTarget.dispose(); },
  };

  const temporal: PixelArtStage = {
    name: 'temporal', enabled: true,
    setSize() { /* sized by the surface stage */ },
    beginFrame(frame) {
      // Runs before the lines stage's beginFrame rebinds empty marks: this is
      // last frame's final marks, intact until the lines stage draws.
      temporalUniforms.temporalMarks.value = frame.uniforms.marks.value;
      shared.artHistoryReady.value = 0;
    },
    render(frame) {
      const write = historyTargets[historyIndex]!, read = historyTargets[1 - historyIndex]!;
      temporalUniforms.temporalPrevious.value = read.textures[1]!;
      temporalUniforms.temporalValid.value = !historyReset && lastTemporalFrame === frameCount - 1
        && shared.artHasPrevious.value > 0.5 ? 1 : 0;
      frame.draw(temporalMaterial, write);
      shared.image.value = write.textures[0]!;
      shared.history.value = write.textures[1]!;
      shared.artHistoryReady.value = 1;
      lastTemporalFrame = frameCount;
      historyIndex = 1 - historyIndex;
      historyReset = false;
    },
    dispose() { temporalMaterial.dispose(); for (const target of historyTargets) target.dispose(); },
  };

  const sparkle: PixelArtStage = {
    name: 'sparkle', enabled: true,
    setSize() { /* writes the shared image chain */ },
    render(frame) {
      if (shared.artSurfaceReady.value < 0.5) return;
      // Wet-ground sparkles and key glints only with the wet stage; key
      // glints thin out as the road dries (sunrise-wide's calm asphalt).
      const dry = THREE.MathUtils.lerp(keyGlintDry, 1, THREE.MathUtils.smoothstep(wetness, 0.2, 0.6));
      sparkleUniforms.sparkleParams.value.set(wetOn ? sparkleLit : 0, wetOn ? sparkleRain : 0, rain);
      sparkleUniforms.sparkleGlitter.value.x = wetOn ? glitter : 0;
      sparkleUniforms.sparkleGlitter.value.z = wetOn && glitter > 0 ? THREE.MathUtils.clamp((wetness - 0.3) / 0.55, 0, 1) : 0;
      sparkleUniforms.sparkleDrizzle.value = wetOn ? drizzle * THREE.MathUtils.smoothstep(Math.max(wetness, rain), 0.65, 0.85) : 0;
      sparkleUniforms.keyGlint.value.x = wetOn ? keyGlintDensity * Math.max(dry, rain) : 0;
      sparkleUniforms.oilNight.value.x = oilOn ? oilEntries : -1;
      frame.draw(sparkleMaterial, frame.beginImageWrite());
      frame.endImageWrite();
    },
    dispose() { sparkleMaterial.dispose(); },
  };

  return {
    stages: { surface, reflect, temporal, sparkle },
    configure(o) {
      surface.enabled = o.surfaceField > 0;
      wetOn = o.wetGround > 0;
      flecksOn = o.litFlecks > 0;
      lampColumnsOn = o.lampColumns > 0;
      dryFade = o.wetDryFade > 0;
      // The composite also draws the lit-ground flecks.
      reflect.enabled = wetOn || flecksOn;
      oilOn = o.oilHazards > 0;
      // The sparkle stage also draws the hazards.
      sparkle.enabled = wetOn || oilOn;
      temporal.enabled = o.temporal > 0;
      if (!temporal.enabled) historyReset = true;
      surfaceUniforms.fieldCells.value.set(o.fieldDashCells, o.fieldRowCells, o.skyDashCells, o.skyRowCells);
      surfaceUniforms.fieldGroundGain.value = Math.max(0, o.fieldGroundGain);
      surfaceUniforms.fieldWallSpeed.value = THREE.MathUtils.clamp(o.fieldWallSpeed, 0, 1);
      surfaceUniforms.fieldWallGain.value = THREE.MathUtils.clamp(o.fieldWallGain, 0, 3);
      surfaceUniforms.surfaceMotion.value.w = Math.max(0, o.fieldMotionStretch);
      surfaceUniforms.skyCluster.value.set(Math.max(1, o.skyClusterScale), THREE.MathUtils.clamp(o.skyClusterWeight, 0, 1), o.skyFieldScale);
      surfaceUniforms.wetParams.value.y = o.wetNormal;
      dampBase = THREE.MathUtils.clamp(o.wetDampBase, 0, 1);
      surfaceUniforms.dashParams.value.set(Math.max(1, o.wetDashCells), o.wetDashDuty);
      traceUniforms.traceParams.value.set(Math.max(1, o.wetMaxDistance), o.wetSkyReflection, 6, 0);
      compositeUniforms.columnSource.value.set(Math.max(0, o.wetColumnStart), Math.max(o.wetColumnStart + 1e-3, o.wetColumnFull));
      compositeUniforms.wetFresnelFloor.value = THREE.MathUtils.clamp(o.wetFresnelFloor, 0, 1);
      spreadUniforms.spreadParams.value.set(THREE.MathUtils.clamp(Math.round(o.wetSpread), 0, 4), THREE.MathUtils.clamp(o.wetSpreadFalloff, 0, 1));
      compositeUniforms.rippleParams.value.set(o.wetRipple > 0 ? 1 : 0, Math.max(1, o.wetRippleCells), Math.max(1, o.wetRippleRows),
        THREE.MathUtils.clamp(o.wetRippleHoles, 0, 1));
      compositeUniforms.ripplePebbles.value = THREE.MathUtils.clamp(o.wetRipplePebbles, 0, 1);
      compositeUniforms.rippleFar.value.set(Math.max(1, o.wetRippleCellsFar), Math.max(1, o.wetRippleRowsFar), Math.max(1, o.wetRippleFarStart));
      compositeUniforms.waveParams.value.set(o.wetWaves > 0 ? 1 : 0, THREE.MathUtils.clamp(o.wetWaveThreshold, 0, 1),
        THREE.MathUtils.clamp(o.wetWaveTrough, 0, 1), Math.max(0, o.wetWaveSheen));
      compositeUniforms.waveShape.value.set(Math.max(1, o.wetWaveRowsNear), Math.max(1, o.wetWaveRowsFar), THREE.MathUtils.clamp(o.wetWaveHorizon, .1, 1),
        Math.max(2, o.wetWaveStroke));
      compositeUniforms.waveJitter.value = THREE.MathUtils.clamp(o.wetWaveJitter, 0, 4);
      compositeUniforms.waveRidge.value = THREE.MathUtils.clamp(o.wetWaveRidge, 0, 1);
      compositeUniforms.waveDash.value.set(Math.max(1e-3, o.wetWaveDashFull), THREE.MathUtils.clamp(o.wetWaveDashBase, 0, 1),
        Math.max(1, o.wetWaveStreak), THREE.MathUtils.clamp(o.wetWaveStreakFloor, 0, 1));
      compositeUniforms.reflectionWarmth.value = THREE.MathUtils.clamp(o.wetReflectionWarmth, 0, 1);
      compositeUniforms.columnParams.value.set(THREE.MathUtils.clamp(Math.round(o.wetColumnDown), 0, 96),
        THREE.MathUtils.clamp(Math.round(o.wetColumnUp), 0, 8), o.wetReflection, o.wetDashGap);
      // The flecks replace the earlier dash sheen on lit wet ground.
      compositeUniforms.sheenParams.value.set(flecksOn ? 0 : o.wetSheen, 0.08, 0.5);
      surfaceUniforms.segmentParams.value.set(Math.max(0.5, o.groundDashCells), Math.max(0, o.groundDashSpread),
        o.groundDashes > 0 ? 1 : 0, flecksOn ? 1 : 0);
      compositeUniforms.fleckParams.value.set(flecksOn ? THREE.MathUtils.clamp(o.fleckDensity, 0, 1) : 0,
        THREE.MathUtils.clamp(o.fleckGap, 0, 1), Math.max(1, o.fleckBoost), THREE.MathUtils.clamp(o.fleckTint, 0, 1));
      compositeUniforms.fleckShape.value.set(THREE.MathUtils.clamp(o.fleckSpeedKeep, 0, 1), o.markingStart,
        Math.max(o.markingStart + 1e-3, o.markingFull));
      ambientScale = Math.max(1e-3, o.groundAmbientScale);
      lampGain = Math.max(0, o.lampColumnGain);
      lobeDamp = Math.max(1e-3, o.lampLobeDamp); lobeWet = Math.max(1e-3, o.lampLobeWet);
      columnWidth = Math.max(1, o.lampColumnWidth);
      columnFar = Math.max(1, o.lampColumnFar);
      surfaceUniforms.groundSpeckle.value = o.groundDashes > 0 ? THREE.MathUtils.clamp(o.groundSpeckle, 0, 1) : 0;
      mottle = o.groundDashes > 0 ? THREE.MathUtils.clamp(o.groundMottle, 0, 0.9) : 0;
      dryMottle = THREE.MathUtils.clamp(o.groundDryMottle, 0, 1);
      compositeUniforms.fleckLit.value.set(Math.max(0, o.fleckLitStart), Math.max(o.fleckLitStart + 1e-3, o.fleckLitFull));
      compositeUniforms.fleckSplit.value.set(THREE.MathUtils.clamp(o.fleckKeep, 0, 2), THREE.MathUtils.clamp(o.fleckSparse, 0, 1),
        Math.max(0, o.fleckFloor), compositeUniforms.fleckSplit.value.w);
      compositeUniforms.fleckSplit2.value = THREE.MathUtils.clamp(o.fleckSpeckle, 0, 1);
      sparkleLit = o.sparkleLit; sparkleRain = o.sparkleRain; glitter = Math.max(0, o.wetGlitter); drizzle = THREE.MathUtils.clamp(o.wetDrizzle, 0, 1);
      sparkleUniforms.sparkleGlitter.value.y = Math.max(0, o.wetGlitterLift);
      sparkleUniforms.sparkleGlitter.value.w = Math.max(0, o.wetGlitterTrail);
      keyGlintDensity = o.keyGlints > 0 ? Math.max(0, o.sparkleKey) : 0;
      keyGlintDry = THREE.MathUtils.clamp(o.sparkleKeyDry, 0, 1);
      sparkleUniforms.keyGlint.value.y = Math.max(1, o.sparkleKeyLobe);
      sparkleUniforms.markingRatio.value.set(o.markingStart, Math.max(o.markingStart + 1e-3, o.markingFull));
      surfaceUniforms.speedParams.value.set(Math.max(0, o.groundSpeedStart), Math.max(o.groundSpeedStart + 1e-3, o.groundSpeedFull),
        THREE.MathUtils.clamp(o.groundRowOctave, 0, 2), THREE.MathUtils.clamp(o.groundSpeedMottle, 0, 1));
      surfaceUniforms.groundFar.value.set(o.groundFarStart, Math.max(o.groundFarStart + 1, o.groundFarEnd), THREE.MathUtils.clamp(o.groundFarCalm, 0, 1));
      compositeUniforms.wallSpeedSmooth.value = THREE.MathUtils.clamp(o.wallSpeedSmooth, 0, 1);
      compositeUniforms.groundCaps.value.set(THREE.MathUtils.clamp(o.groundSpeedMottle, 0, 1), Math.max(1, o.groundPaintCap),
        Math.max(0, o.wetPatchCap), THREE.MathUtils.clamp(o.groundSpeedSmooth, 0, 1));
      compositeUniforms.lampTones.value.set(Math.max(0, o.lampColumnCore), Math.max(0, o.lampColumnEdge), Math.max(0, o.lampColumnFringe),
        THREE.MathUtils.clamp(o.columnBreak, 0, 1));
      surfaceUniforms.hazardCount.value = oilOn ? hazardCount : 0;
      surfaceUniforms.foliageParams.value.set(THREE.MathUtils.clamp(o.foliageTurns, 0, 1), Math.max(1, o.foliageClumpCells),
        Math.max(0, o.foliageClumpOffset));
      surfaceUniforms.foliageHistory.value.y = THREE.MathUtils.clamp(o.foliageHysteresis, 0, 0.5);
      surfaceUniforms.leafMemory.value.y = THREE.MathUtils.clamp(o.foliageMemory, 0, 0.95);
      compositeUniforms.foliageSmooth.value = THREE.MathUtils.clamp(o.foliageSmooth, 0, 1);
      compositeUniforms.motionBlur.value.set(THREE.MathUtils.clamp(o.wallMotionFilter, 0, 3), 12, Math.max(0.5, o.wallMotionStart), Math.max(0, o.wallMotionEdge));
      compositeUniforms.columnDash.value.set(Math.max(1, o.wetColumnDashCells), THREE.MathUtils.clamp(o.wetColumnDashDuty, 0, 1),
        THREE.MathUtils.clamp(o.wetColumnRowKeep, 0, 1), THREE.MathUtils.clamp(o.columnBreak, 0, 1));
      temporalUniforms.temporalParams.value.set(o.temporalMargin, o.temporalDepthTolerance, o.temporalSpeedMargin);
      temporalUniforms.temporalCar.value = Math.max(0, o.temporalCarMargin);
      scrollParams.value.set(o.groundScroll > 0 ? 1 : 0, THREE.MathUtils.clamp(o.groundScrollSpread, 0, 2), GROUND_SCROLL_WRAP, THREE.MathUtils.clamp(o.groundSlideLengthen, 0, 1));
      scrollUniforms.scrollHold.value = THREE.MathUtils.clamp(o.groundScrollHold, 0.5, 2);
      scrollUniforms.scrollLimit.value.set(Math.max(1, Math.round(o.groundScrollStep)), 3);
      scrollTurn = THREE.MathUtils.clamp(o.groundScrollTurn, 0, 1);
      temporalUniforms.scrollShift.value = o.temporalScrollShift > 0 ? 1 : 0;
    },
    setWetness(value, rainValue) {
      wetness = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
      rain = Number.isFinite(rainValue) ? THREE.MathUtils.clamp(rainValue, 0, 1) : 0;
    },
    setMovers(objects) { movers.set(objects); },
    setPoolLights: lights => ground.setPools(lights),
    setGroundEmitters: (emitters, count) => ground.setEmitters(emitters, count),
    setGroundAmbient: irradiance => ground.setAmbient(irradiance),
    setHazards(list, count) {
      hazardCount = Math.max(0, Math.min(MAX_HAZARDS, list.length, Math.floor(count) || 0));
      for (let i = 0; i < hazardCount; i++) {
        const h = list[i]!;
        surfaceUniforms.hazardFrame.value[i]!.set(h.x, h.z, Math.cos(h.heading), Math.sin(h.heading));
        surfaceUniforms.hazardSize.value[i]!.set(Math.max(0.05, h.halfWidth), Math.max(0.05, h.halfLength), 0, 0);
      }
      surfaceUniforms.hazardCount.value = oilOn ? hazardCount : 0;
    },
    lampHeads: ground.heads,
    resetHistory() {
      historyReset = true; cameraTravel.reset(); lateral.reset(); speedSteps.reset(); turnSteps.reset();
      pickTime = NaN; surfaceUniforms.pickMotion.value.set(0, 0, 0, 0);
    },
    moverBounds: () => movers.min.map((min, i) => movers.max[i]!.w > 0.5
      ? { min: [min.x, min.y, min.z], max: [movers.max[i]!.x, movers.max[i]!.y, movers.max[i]!.z] } : null),
    movers,
    speedParams: surfaceUniforms.speedParams,
    reflectReady, scrollRows, scrollParams,
    scrollStep: () => ({ side: lateralStep.x, turn: lateralStep.y, heading: lateral.heading() }),
  };
}

const columnClip = new THREE.Vector4();
/**
 * Screen column of a light in wet ground, in art cells (y up): x at the
 * light's mirror image in the ground plane under it; the top at the ground
 * under the light (the column's far end; above the image when that point is
 * behind the camera); the width from the light's width at the mirror image's
 * depth, 1 to maxWidth cells. Writes (x, top, depth of the mirror image,
 * width) into out. False when the mirror image is behind the camera or the
 * column lies off the image.
 */
export function lampColumnScreen(viewProjection: THREE.Matrix4, x: number, y: number, z: number, groundY: number,
  widthMetres: number, size: { x: number; y: number }, cellScale: number, maxWidth: number, out: THREE.Vector4): boolean {
  const clip = columnClip.set(x, 2 * groundY - y, z, 1).applyMatrix4(viewProjection);
  if (clip.w <= 0.2) return false;
  const depth = clip.w;
  const column = (clip.x / clip.w * 0.5 + 0.5) * size.x, mirror = (clip.y / clip.w * 0.5 + 0.5) * size.y;
  const width = THREE.MathUtils.clamp(widthMetres / Math.max(cellScale * depth, 1e-6), 1, Math.max(1, maxWidth));
  if (column < -width - 6 || column > size.x + width + 6) return false;
  clip.set(x, groundY, z, 1).applyMatrix4(viewProjection);
  const top = clip.w > 0.2 ? Math.min((clip.y / clip.w * 0.5 + 0.5) * size.y, size.y + 64) : size.y + 64;
  if (top < 0 || top < mirror - 1) return false;
  out.set(column, top, depth, width);
  return true;
}

/**
 * Light data of the ground stage. Pool lights are registered once and read
 * every frame (world position, direction to the target, cone, range, decay,
 * colour x intensity), the same quantities Three's spot light uses. Emitters
 * are copied each frame; their columns are projected once per frame on the
 * CPU: the column runs down the screen from the ground under the emitter
 * (its far end) through the mirror image, at the mirror image's x.
 */
function createGroundLights(
  surface: { poolPosition: THREE.IUniform<THREE.Vector4[]>; poolDirection: THREE.IUniform<THREE.Vector4[]>;
    poolShape: THREE.IUniform<THREE.Vector4[]>; groundAmbient: THREE.IUniform<number> },
  composite: { groundAmbientTint: THREE.IUniform<THREE.Vector3>; emitterCount: THREE.IUniform<number>;
    emitterScreen: THREE.IUniform<THREE.Vector4[]>; emitterWorld: THREE.IUniform<THREE.Vector4[]>;
    emitterColour: THREE.IUniform<THREE.Vector3[]> },
) {
  const pools: (THREE.SpotLight | null)[] = new Array(MAX_POOL_LIGHTS).fill(null);
  const emitterPosition = Array.from({ length: MAX_GROUND_EMITTERS }, () => new THREE.Vector4());
  const emitterRadiance = Array.from({ length: MAX_GROUND_EMITTERS }, () => new THREE.Vector4());
  const emitterCells = new Float32Array(MAX_GROUND_EMITTERS);
  // The lamp heads among the emitters (shop fronts cast columns but are no lamp heads).
  const headPosition = Array.from({ length: MAX_GROUND_EMITTERS }, () => new THREE.Vector4());
  const headRadiance = Array.from({ length: MAX_GROUND_EMITTERS }, () => new THREE.Vector4());
  let emitters = 0, ambient = 0.3;
  const heads = { positions: headPosition as readonly THREE.Vector4[], radiance: headRadiance as readonly THREE.Vector4[],
    level: new Float32Array(MAX_GROUND_EMITTERS), count: 0 };
  const position = new THREE.Vector3(), target = new THREE.Vector3();
  const viewProjection = new THREE.Matrix4();
  const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return {
    /** This frame's lamp heads: xyz the lens position (w: the ground under it), the first `count`. */
    heads,
    setPools(lights: readonly THREE.SpotLight[]) {
      for (let i = 0; i < MAX_POOL_LIGHTS; i++) pools[i] = lights[i] ?? null;
    },
    setEmitters(list: readonly GroundEmitter[], count: number) {
      emitters = Math.max(0, Math.min(MAX_GROUND_EMITTERS, list.length, Math.floor(count) || 0));
      let lamps = 0;
      for (let i = 0; i < emitters; i++) {
        const e = list[i]!;
        emitterPosition[i]!.set(e.position.x, e.position.y, e.position.z, e.groundY);
        emitterRadiance[i]!.set(e.color.r * e.intensity, e.color.g * e.intensity, e.color.b * e.intensity, e.width);
        emitterCells[i] = e.maxCells ?? 0;
        if (e.head === false) continue;
        headPosition[lamps]!.copy(emitterPosition[i]!); headRadiance[lamps]!.copy(emitterRadiance[i]!);
        heads.level[lamps++] = e.intensity / GROUND_EMITTER_NOMINAL;
      }
      heads.count = lamps;
    },
    setAmbient(irradiance: THREE.Color) {
      const l = luminance(irradiance.r, irradiance.g, irradiance.b);
      ambient = Number.isFinite(l) ? Math.max(l, 1e-4) : 0.3;
      composite.groundAmbientTint.value.set(irradiance.r / ambient, irradiance.g / ambient, irradiance.b / ambient);
    },
    /** Once per frame, after the scene render (world matrices are current). */
    updatePools(ambientScale: number) {
      surface.groundAmbient.value = ambient * ambientScale;
      for (let i = 0; i < MAX_POOL_LIGHTS; i++) {
        const light = pools[i], p = surface.poolPosition.value[i]!;
        if (!light || !light.visible || !light.parent || light.intensity <= 0) { p.w = 0; continue; }
        position.setFromMatrixPosition(light.matrixWorld);
        target.setFromMatrixPosition(light.target.matrixWorld);
        target.subVectors(position, target).normalize();
        p.set(position.x, position.y, position.z, light.intensity * luminance(light.color.r, light.color.g, light.color.b));
        surface.poolDirection.value[i]!.set(target.x, target.y, target.z, Math.cos(light.angle));
        surface.poolShape.value[i]!.set(Math.cos(light.angle * (1 - light.penumbra)), light.distance, light.decay, 0);
      }
    },
    /**
     * Screen columns for this frame: x at the mirror image, from the ground
     * under the emitter (top) down; width from the emitter's width at the
     * mirror image's depth, 1 to `maxWidth` cells. Off-screen columns drop out.
     */
    projectEmitters(camera: THREE.Camera, size: THREE.Vector2, cellScale: number, gain: number, maxWidth: number, on: boolean) {
      let count = 0;
      if (on) {
        viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        for (let i = 0; i < emitters; i++) {
          const e = emitterPosition[i]!, r = emitterRadiance[i]!;
          if (!lampColumnScreen(viewProjection, e.x, e.y, e.z, e.w, r.w, size, cellScale, emitterCells[i]! > 0 ? emitterCells[i]! : maxWidth,
            composite.emitterScreen.value[count]!)) continue;
          // A stable seed per emitter (its world position), so rows keep their dashes.
          const seed = Math.abs(Math.sin(e.x * 12.9898 + e.z * 78.233) * 43758.5453) % 1;
          composite.emitterWorld.value[count]!.set(e.x, e.y, e.z, seed);
          composite.emitterColour.value[count]!.set(r.x * gain, r.y * gain, r.z * gain);
          count++;
        }
      }
      composite.emitterCount.value = count;
    },
  };
}

/**
 * A value held on quarter-octave steps above a floor, with hysteresis: a new
 * step is taken only when the value leaves the current one by more than
 * 0.75 of a step, and at most once per `dwell` seconds, so a smoothed value
 * that still wobbles frame to frame (60 Hz frames of a 30 Hz simulation)
 * never flips back and forth. 0 below the floor. Allocation-free.
 */
export function createStepper(floor: number, dwell = 0.3) {
  let level = -Infinity, changed = -Infinity, held = 0;
  return {
    update(value: number, time: number): number {
      const target = Number.isFinite(value) && value > floor ? 4 * Math.log2(value / floor) : -Infinity;
      const away = level === -Infinity ? (target === -Infinity ? 0 : Infinity) : target === -Infinity ? Infinity : Math.abs(target - level);
      if (away > 0.75 && (!(time - changed < dwell) || !Number.isFinite(time))) {
        level = target === -Infinity ? -Infinity : Math.round(target);
        changed = time;
      }
      held = level === -Infinity ? 0 : floor * 2 ** (level / 4);
      return held;
    },
    reset() { level = -Infinity; changed = -Infinity; held = 0; },
  };
}

/**
 * The camera's level right vector and its accumulated lateral travel (m, along
 * that vector), for the ground's screen-row dashes at speed: their ends sit at
 * dot(p - camera, right) + travel, which holds still while the camera drives
 * straight on, slides with the world when it steers or yaws, and never swims.
 * Writes (right.x, 0, right.z, travel) into out and, when given, this
 * frame's sideways travel (m) and yaw change (rad, positive turning left)
 * into step (the ground's scroll registers). Allocation-free.
 */
export function createLateralTravel(headingMetres = 25) {
  const position = new THREE.Vector3(), last = new THREE.Vector3();
  let known = false, travel = 0, headingX = 0, headingZ = -1, headingKnown = false, lastAngle = NaN;
  return {
    update(camera: THREE.Camera, out: THREE.Vector4, step?: THREE.Vector2) {
      const e = camera.matrixWorld.elements;
      let x = e[0]!, z = e[2]!;
      const length = Math.hypot(x, z);
      if (length < 1e-6) { x = 1; z = 0; } else { x /= length; z /= length; }
      position.setFromMatrixPosition(camera.matrixWorld);
      let side = 0, turn = 0;
      if (known) {
        const dx = position.x - last.x, dz = position.z - last.z;
        // A cut or teleport keeps the travel (the pattern re-rolls once).
        if (dx * dx + dz * dz < 900) {
          travel = (travel + dx * x + dz * z) % 4096;
          // The road's direction: the camera's travel heading, smoothed over
          // headingMetres of travel. The scroll registers measure sideways
          // travel and turning against it, not against the camera's own axes:
          // the chase camera looks a little off its line (it crabs), and on a
          // straight the dashes must hold still.
          const d = Math.hypot(dx, dz);
          if (d > 1e-5) {
            // The heading turns toward the travel direction by angle (a
            // vector average cannot recover from a heading opposite the travel,
            // as after the start's camera swoop), and snaps to it when they
            // disagree by more than 60 degrees (a reversal or a cut).
            const along = Math.atan2(dx, dz), current = Math.atan2(headingX, headingZ);
            const miss = Math.atan2(Math.sin(along - current), Math.cos(along - current));
            const next = !headingKnown || Math.abs(miss) > Math.PI / 3 ? along : current + miss * (1 - Math.exp(-d / headingMetres));
            headingX = Math.sin(next); headingZ = Math.cos(next); headingKnown = true;
            // Sideways travel along the camera's own level right vector (as the
            // lateral anchoring above): a chase camera tangent to its path
            // holds its dashes still through a steady corner.
            side = dx * x + dz * z;
          }
        }
      }
      // The view's yaw against the road heading (positive turning left).
      const angle = headingKnown ? Math.atan2(e[8]!, e[10]!) - Math.atan2(-headingX, -headingZ) : NaN;
      if (Number.isFinite(angle) && Number.isFinite(lastAngle)) {
        turn = Math.atan2(Math.sin(angle - lastAngle), Math.cos(angle - lastAngle));
        if (Math.abs(turn) > 0.5) turn = 0;
      }
      lastAngle = angle;
      last.copy(position);
      known = true;
      out.set(x, 0, z, travel);
      step?.set(side, turn);
    },
    reset() { known = false; lastAngle = NaN; },
    /** Inspection: the smoothed road heading (x, z). */
    heading: () => [headingX, headingZ] as const,
  };
}

/**
 * Smoothed camera travel per nominal 60 Hz frame. Rendered frames alternate
 * with the 30 Hz simulation, so per-frame reprojection would pulse; an
 * exponential average of the velocity (about 0.15 s) keeps the motion-widened
 * footprints steady. Cuts and stalls reset it.
 */
export function createCameraTravel() {
  const last = new THREE.Vector3(), position = new THREE.Vector3(), velocity = new THREE.Vector3(), step = new THREE.Vector3();
  let lastTime = NaN, lastYaw = NaN, yawRate = 0;
  const yawOf = (camera: THREE.Camera) => { const e = camera.matrixWorld.elements; return Math.atan2(-e[8]!, -e[10]!); };
  return {
    /** Writes the travel per nominal frame into out.xyz (out.w is left alone). */
    update(camera: THREE.Camera, time: number, out: THREE.Vector4) {
      position.setFromMatrixPosition(camera.matrixWorld);
      const yaw = yawOf(camera);
      const dt = time - lastTime;
      // Frames that repeat a timestamp (the same simulation tick) change nothing.
      if (!(dt <= 1e-4)) {
        step.subVectors(position, last);
        // A camera that has (nearly) not moved since the last update is a
        // repeated simulation tick drawn again (60 Hz frames, 30 Hz
        // simulation; only the eased camera distance creeps): keep the
        // velocity and let the next step span both frames, so motion-widened
        // footprints (and the ground dashes' lattice levels) do not pulse
        // between the two frames of a tick. Held for 0.25 s it stops.
        const held = dt <= 0.25 && step.length() < Math.max(1e-6, 0.25 * velocity.length() * dt);
        const turn = Math.atan2(Math.sin(yaw - lastYaw), Math.cos(yaw - lastYaw));
        if (!Number.isFinite(dt)) { velocity.set(0, 0, 0); yawRate = 0; }
        else if (held) { /* keep */ }
        else if (dt > 0.25 || step.length() > 30) { velocity.set(0, 0, 0); yawRate = 0; }
        else {
          const blend = 1 - Math.exp(-dt / 0.15);
          velocity.lerp(step.divideScalar(dt), blend);
          yawRate += ((Number.isFinite(turn) ? turn : 0) / dt - yawRate) * blend;
        }
        if (!held) { last.copy(position); lastTime = time; lastYaw = yaw; }
      }
      out.set(velocity.x / 60, velocity.y / 60, velocity.z / 60, out.w);
    },
    /** The camera's smoothed yaw per nominal 60 Hz frame (rad; corners sweep the whole image sideways). */
    turn: () => yawRate / 60,
    reset() { lastTime = NaN; lastYaw = NaN; velocity.set(0, 0, 0); yawRate = 0; },
  };
}

/**
 * Mover slots: each frame, the local box, world-to-local transform and last
 * frame's local-to-world transform of every visible object in the list. The
 * boxes come from opaque, visible meshes when an object is first seen; an
 * object is assumed to rest on its local y = 0 plane.
 */
export function createMovers() {
  const min = Array.from({ length: MAX_MOVERS }, () => new THREE.Vector4());
  const max = Array.from({ length: MAX_MOVERS }, () => new THREE.Vector4());
  const toLocal = Array.from({ length: MAX_MOVERS }, () => new THREE.Matrix4());
  const previous = Array.from({ length: MAX_MOVERS }, () => new THREE.Matrix4());
  const last = Array.from({ length: MAX_MOVERS }, () => new THREE.Matrix4());
  const lastObject: (THREE.Object3D | null)[] = new Array(MAX_MOVERS).fill(null);
  const objects: (THREE.Object3D | null)[] = new Array(MAX_MOVERS).fill(null);
  const bounds = new WeakMap<THREE.Object3D, THREE.Box3>();
  const inverse = new THREE.Matrix4(), relative = new THREE.Matrix4(), childBox = new THREE.Box3();

  const localBounds = (object: THREE.Object3D): THREE.Box3 | null => {
    const known = bounds.get(object);
    if (known) return known;
    const box = new THREE.Box3();
    inverse.copy(object.matrixWorld).invert();
    object.traverseVisible(child => {
      const mesh = child as THREE.Mesh;
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!mesh.isMesh || !mesh.geometry || (Array.isArray(material) ? material.every(m => m.transparent) : material?.transparent)) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.union(childBox.copy(mesh.geometry.boundingBox!).applyMatrix4(relative.multiplyMatrices(inverse, mesh.matrixWorld)));
    });
    if (box.isEmpty()) return null;
    // A little margin around the body. Movers rest on their local y = 0 plane
    // (the cars' tyre contacts; wheels sink below it), so the box starts just
    // above it and the road under and around a car stays world anchored.
    box.min.x -= 0.03; box.min.z -= 0.03; box.max.x += 0.03; box.max.z += 0.03; box.max.y += 0.03;
    box.min.y = Math.max(box.min.y, 0) + 0.08;
    bounds.set(object, box);
    return box;
  };

  return {
    min, max, toLocal, previous,
    /** The object in each slot (null when empty); a slot is active only while max[i].w is 1. */
    objects: objects as readonly (THREE.Object3D | null)[],
    set(list: readonly THREE.Object3D[]) {
      for (let i = 0; i < MAX_MOVERS; i++) objects[i] = list[i] ?? null;
    },
    /** Called once per frame after the scene render (matrixWorld is current). */
    update() {
      for (let i = 0; i < MAX_MOVERS; i++) {
        const object = objects[i];
        const box = object && object.visible && object.parent ? localBounds(object) : null;
        if (!object || !box) { max[i]!.w = 0; min[i]!.w = 0; lastObject[i] = null; continue; }
        min[i]!.set(box.min.x, box.min.y, box.min.z, lastObject[i] === object ? 1 : 0);
        max[i]!.set(box.max.x, box.max.y, box.max.z, 1);
        toLocal[i]!.copy(object.matrixWorld).invert();
        previous[i]!.copy(last[i]!);
        last[i]!.copy(object.matrixWorld);
        lastObject[i] = object;
      }
    },
  };
}
