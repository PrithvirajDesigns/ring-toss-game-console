/**
 * Every physics tuning constant lives here. Units: world pixels (1 world px = 1 screen px
 * at 160x144) and seconds. The tuning panel is generated from TUNING_META, so adding a
 * field here plus a meta entry makes it live-tunable on the phone.
 */
export interface PhysicsConfig {
  // --- medium ---
  /** Effective gravity (px/s²) after buoyancy. "Real" gravity at this scale is ~300 px/s²; this is ~20%. */
  gravity: number;
  /** Linear drag toward the local fluid velocity (1/s). Terminal sink speed ≈ gravity / linearDrag. */
  linearDrag: number;
  /** Angular drag on tilt spin (1/s). */
  angularDrag: number;
  /** Ambient curl-noise current speed (px/s). */
  ambientStrength: number;
  /** Spatial scale of ambient currents (px). */
  ambientScale: number;
  /** How fast ambient currents evolve. */
  ambientSpeed: number;

  /** Floor slope toward the nozzle(s) (px rise per px). Funnels rings back into the jet like the real toy's ledge. */
  floorSlope: number;
  /** Extra face-on restore multiplier while a ring lies on the floor (it falls flat against the glass). */
  floorRestoreBoost: number;

  // --- jet / pump ---
  /** Speed at the nozzle mouth at full pressure (px/s). */
  jetMaxSpeed: number;
  /** Instant pressure on press (0-1): the "pop" of a quick tap. */
  jetTapPressure: number;
  /** Pressure build rate while held (per second, toward 1). */
  jetBuildRate: number;
  /** Max time the pump keeps pushing while held (s): the pump chamber empties. */
  jetMaxHold: number;
  /** Flow decay time constant after release (s). */
  jetDecay: number;
  /** Cone half-angle (radians). */
  jetConeAngle: number;
  /** Virtual source depth below the nozzle mouth (px): bigger = wider mouth, gentler spread. */
  jetSourceDepth: number;
  /** Broad, weak lobe as a share of jet speed: in a sealed tank the pumped water stirs everything. */
  jetBroad: number;
  /** Floor-level inflow toward the nozzle while the jet runs (share of jet speed). Feeds rings back into the jet. */
  jetEntrain: number;
  /** Distance falloff length (px). Flow ∝ exp(-d / jetReach). */
  jetReach: number;
  /** Backflow (suction) pulse on release, as fraction of current pressure. */
  jetBackflow: number;
  /** Backflow duration (s). */
  jetBackflowTime: number;
  /** Vortices spawned per second at full pressure. */
  vortexRate: number;
  /** Vortex circulation at full pressure (px²/s). */
  vortexStrength: number;
  /** Vortex core radius (px). */
  vortexCore: number;
  /** Vortex lifetime (s). */
  vortexLife: number;

  // --- rings ---
  ringOuterRadius: number;
  ringInnerRadius: number;
  /** Restitution for ring-ring collisions. */
  ringRestitution: number;
  /** Restitution for walls / floor / pegs. */
  wallRestitution: number;
  /** Tangential friction on contacts (0 = ice, 1 = sticky). */
  contactFriction: number;
  /** How much flow speed spins the tilt (rad/s per px/s of relative flow). */
  spinFromFlow: number;
  /** How much fluid vorticity spins the tilt. */
  spinFromVorticity: number;
  /** Restoring stiffness pulling free rings back toward face-on (thin tank). */
  faceOnRestore: number;
  /** Random tumbling from turbulence (rad/s²). */
  tumbleNoise: number;
  /** Shed bubbles above this speed (px/s). */
  bubbleShedSpeed: number;

  // --- pegs / threading ---
  /** Half-width of the peg shaft (px). */
  pegHalfWidth: number;
  /** Extra horizontal forgiveness for threading (px). */
  threadTolerance: number;
  /**
   * Required tilt so the ring's hole faces the peg: |sin(tilt)| ≥ this. 0 = any tilt works,
   * 1 = ring must be perfectly flat (hole axis vertical).
   */
  threadMinAlign: number;
  /** Max upward speed at which a ring can still thread (px/s; rings moving up faster pass by). */
  threadMaxUpSpeed: number;
  /** Sideways push for a face-on ring perched on a peg tip (px/s²). */
  tipRollOff: number;
  /** How strongly water drags a ring that is on a peg (0-1 of linearDrag): peg friction. Lower = harder to knock off. */
  threadedFlowCoupling: number;
  /** Vertical gap between stacked rings on a peg (px). */
  stackSpacing: number;
  /** Tilt a ring settles to on a peg (rad from face-on; π/2 = perfectly flat). Mostly a readability choice. */
  pegRestTilt: number;
  /** How strongly a threaded ring's tilt is pulled flat by the peg. */
  pegTiltStiffness: number;
  /** Wobble amplitude when a ring lands on a peg (rad). */
  landWobble: number;
  /** Seconds all rings must stay threaded and settled before the round is won. */
  winSettleTime: number;

  // --- input ---
  /** Max sideways share of gravity from tilt (0-1). Keeps rings controllable. */
  tiltMaxInfluence: number;
  /** Shake impulse speed (px/s). */
  shakeImpulse: number;
}

export const DEFAULT_PHYSICS: PhysicsConfig = {
  gravity: 55,
  linearDrag: 2.6,
  angularDrag: 2.2,
  ambientStrength: 3.5,
  ambientScale: 34,
  ambientSpeed: 0.35,
  floorSlope: 0.2,
  floorRestoreBoost: 8,

  jetMaxSpeed: 380,
  jetTapPressure: 0.6,
  jetBuildRate: 2.2,
  jetMaxHold: 0.9,
  jetDecay: 0.5,
  jetConeAngle: 0.55,
  jetSourceDepth: 14,
  jetBroad: 0.3,
  jetEntrain: 0.12,
  jetReach: 60,
  jetBackflow: 0.25,
  jetBackflowTime: 0.14,
  vortexRate: 10,
  vortexStrength: 1600,
  vortexCore: 7,
  vortexLife: 1.1,

  ringOuterRadius: 5.5,
  ringInnerRadius: 3.5,
  ringRestitution: 0.2,
  wallRestitution: 0.25,
  contactFriction: 0.25,
  spinFromFlow: 0.09,
  spinFromVorticity: 0.6,
  faceOnRestore: 0.5,
  tumbleNoise: 12,
  bubbleShedSpeed: 45,

  pegHalfWidth: 0.75,
  threadTolerance: 0.6,
  threadMinAlign: 0.3,
  threadMaxUpSpeed: 6,
  tipRollOff: 160,
  threadedFlowCoupling: 0.5,
  stackSpacing: 3,
  pegRestTilt: 0.95,
  pegTiltStiffness: 30,
  landWobble: 0.35,
  winSettleTime: 1.0,

  tiltMaxInfluence: 0.65,
  shakeImpulse: 70,
};

export interface TuningMeta { key: keyof PhysicsConfig; group: string; min: number; max: number; step: number; }

const m = (group: string, key: keyof PhysicsConfig, min: number, max: number, step: number): TuningMeta => ({ key, group, min, max, step });

export const TUNING_META: TuningMeta[] = [
  m('Medium', 'gravity', 5, 200, 1),
  m('Medium', 'linearDrag', 0.2, 10, 0.1),
  m('Medium', 'angularDrag', 0, 10, 0.1),
  m('Medium', 'ambientStrength', 0, 20, 0.5),
  m('Medium', 'ambientScale', 8, 100, 1),
  m('Medium', 'ambientSpeed', 0, 3, 0.05),
  m('Medium', 'floorSlope', 0, 0.4, 0.01),
  m('Medium', 'floorRestoreBoost', 0, 20, 0.5),
  m('Jet', 'jetMaxSpeed', 20, 600, 5),
  m('Jet', 'jetTapPressure', 0, 1, 0.05),
  m('Jet', 'jetBuildRate', 0.1, 10, 0.1),
  m('Jet', 'jetMaxHold', 0.1, 3, 0.05),
  m('Jet', 'jetDecay', 0.05, 2, 0.05),
  m('Jet', 'jetConeAngle', 0.05, 1.2, 0.01),
  m('Jet', 'jetSourceDepth', 0, 40, 1),
  m('Jet', 'jetBroad', 0, 1, 0.02),
  m('Jet', 'jetEntrain', 0, 0.5, 0.01),
  m('Jet', 'jetReach', 10, 200, 1),
  m('Jet', 'jetBackflow', 0, 1, 0.05),
  m('Jet', 'jetBackflowTime', 0, 0.5, 0.01),
  m('Jet', 'vortexRate', 0, 40, 1),
  m('Jet', 'vortexStrength', 0, 6000, 50),
  m('Jet', 'vortexCore', 2, 20, 0.5),
  m('Jet', 'vortexLife', 0.1, 3, 0.05),
  m('Rings', 'ringOuterRadius', 3, 9, 0.25),
  m('Rings', 'ringInnerRadius', 1.5, 7, 0.25),
  m('Rings', 'ringRestitution', 0, 1, 0.05),
  m('Rings', 'wallRestitution', 0, 1, 0.05),
  m('Rings', 'contactFriction', 0, 1, 0.05),
  m('Rings', 'spinFromFlow', 0, 0.5, 0.005),
  m('Rings', 'spinFromVorticity', 0, 3, 0.05),
  m('Rings', 'faceOnRestore', 0, 10, 0.1),
  m('Rings', 'tumbleNoise', 0, 40, 0.5),
  m('Threading', 'pegHalfWidth', 0.25, 2, 0.05),
  m('Threading', 'threadTolerance', 0, 3, 0.05),
  m('Threading', 'threadMinAlign', 0, 1, 0.01),
  m('Threading', 'threadMaxUpSpeed', 0, 60, 1),
  m('Threading', 'tipRollOff', 0, 600, 10),
  m('Threading', 'threadedFlowCoupling', 0, 1, 0.02),
  m('Threading', 'stackSpacing', 1, 6, 0.25),
  m('Threading', 'pegRestTilt', 0.3, 1.5, 0.01),
  m('Threading', 'pegTiltStiffness', 0, 100, 1),
  m('Threading', 'landWobble', 0, 1.5, 0.05),
  m('Input', 'tiltMaxInfluence', 0, 1, 0.05),
  m('Input', 'shakeImpulse', 0, 300, 5),
];
