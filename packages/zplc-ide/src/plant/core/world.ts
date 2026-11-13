import type { Quat, Vec3 } from '../contracts';
import type { JoltModule } from './jolt';

export const PLANT_STEP_MS = 5;

export interface WorldBodySpec {
  id: string;
  kind: 'box' | 'pallet' | 'item';
  half: Vec3;
  position: Vec3;
  rotationYDeg: number;
  massKg: number;
  friction: number;
  motion: 'static' | 'dynamic' | 'kinematic';
  layer: 'moving' | 'static';
}
/** A belt is a static body plus a surface velocity along `axis` (world space), ramped at `accelMps2`. */
export interface WorldBeltSpec {
  id: string;
  bodyId: string;
  axis: Vec3;
  accelMps2: number;
  /** Optional: angular surface velocity about world +y, in rad/s per m/s of belt speed (a curved belt: -hand / radius). */
  turnPerMps?: number;
}
export interface PhysicsWorld {
  readonly timeMs: number;
  addBody(spec: WorldBodySpec): void;
  removeBody(id: string): void;
  addBelt(spec: WorldBeltSpec): void;
  setBeltTarget(id: string, speedMps: number): void;
  setKinematicPose(id: string, p: Vec3, q: Quat): void;
  /** A positive multiple of the plant step, else RangeError. */
  step(ms: number): void;
  /** Id of the nearest moving body crossing the segment, or null. */
  rayHit(from: Vec3, to: Vec3): string | null;
  has(id: string): boolean;
  /** Ids of dynamic and kinematic bodies whose centre lies inside the box, in CREATION order (never the broad-phase order). */
  bodiesInBox(min: Vec3, max: Vec3): readonly string[];
  /**
   * Vertical distance from the lowest face of body `id` to the highest surface under its centre (any layer, itself excluded), in m;
   * Infinity if none.
   */
  gapBelow(id: string): number;
  /**
   * Fixes `itemId` to `anchorId` at their current relative pose (Jolt FixedConstraint) and activates the item. Throws a located Error for
   * an unknown id or an item already attached.
   */
  attach(anchorId: string, itemId: string): void;
  /** Releases the item; it keeps its velocity and is activated. A no-op when it is not attached. */
  detach(itemId: string): void;
  attachedTo(itemId: string): string | null;
  /** Dynamic and kinematic bodies, in creation order. */
  bodies(): readonly { id: string; p: Vec3; q: Quat; v: Vec3; asleep: boolean }[];
  /** Exact Jolt state (PLT-012). `restore` needs the same set of bodies, created in the same order. */
  capture(): Uint8Array;
  restore(bytes: Uint8Array): void;
  dispose(): void;
}

const NON_MOVING = 0;
const MOVING = 1;
// Open Industry Project uses the same margin for the cargo wake box.
const WAKE_MARGIN = 0.05;
// Longest downward cast of `gapBelow`; a body higher than this above any surface reports Infinity.
const GAP_RANGE_M = 100;

export function createWorld(Jolt: JoltModule, stepMs: number = PLANT_STEP_MS): PhysicsWorld {
  const settings = new Jolt.JoltSettings();
  const objectFilter = new Jolt.ObjectLayerPairFilterTable(2);
  objectFilter.EnableCollision(NON_MOVING, MOVING);
  objectFilter.EnableCollision(MOVING, MOVING);
  const bpNonMoving = new Jolt.BroadPhaseLayer(0);
  const bpMoving = new Jolt.BroadPhaseLayer(1);
  const bpInterface = new Jolt.BroadPhaseLayerInterfaceTable(2, 2);
  bpInterface.MapObjectToBroadPhaseLayer(NON_MOVING, bpNonMoving);
  bpInterface.MapObjectToBroadPhaseLayer(MOVING, bpMoving);
  settings.mObjectLayerPairFilter = objectFilter;
  settings.mBroadPhaseLayerInterface = bpInterface;
  settings.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(bpInterface, 2, objectFilter, 2);
  const jolt = new Jolt.JoltInterface(settings);
  Jolt.destroy(settings);
  const physics = jolt.GetPhysicsSystem();
  const bodyInterface = physics.GetBodyInterface();
  const gravity = new Jolt.Vec3(0, -9.81, 0);
  physics.SetGravity(gravity);
  Jolt.destroy(gravity);

  interface Entry {
    spec: WorldBodySpec;
    body: InstanceType<typeof Jolt.Body>;
    key: number;
  }
  interface Belt {
    spec: WorldBeltSpec;
    target: number;
    speed: number;
    wake: InstanceType<typeof Jolt.AABox>;
  }
  interface Attachment {
    anchorId: string;
    constraint: InstanceType<typeof Jolt.Constraint>;
  }
  const attachments = new Map<string, Attachment>(); // item id -> attachment, in attach order
  const entries = new Map<string, Entry>(); // Map keeps insertion order: creation order
  const idByKey = new Map<number, string>();
  const belts = new Map<string, Belt>();
  const beltByKey = new Map<number, Belt>();
  const keyOf = (id: InstanceType<typeof Jolt.BodyID>) => id.GetIndexAndSequenceNumber();
  const entry = (id: string) => {
    const e = entries.get(id);
    if (!e) throw new Error(`unknown body ${id}`);
    return e;
  };

  const movingBp = new Jolt.SpecifiedBroadPhaseLayerFilter(bpMoving);
  const movingObj = new Jolt.SpecifiedObjectLayerFilter(MOVING);
  // The base filter classes accept every layer: queries that must see the static layer too (`gapBelow`, `bodiesInBox`).
  const anyBp = new Jolt.BroadPhaseLayerFilter();
  const anyObj = new Jolt.ObjectLayerFilter();
  const bodyFilter = new Jolt.BodyFilter();
  const shapeFilter = new Jolt.ShapeFilter();

  const listener = new Jolt.ContactListenerJS();
  listener.OnContactValidate = () => Jolt.ValidateResult_AcceptAllContactsForThisBodyPair;
  const surface = (b1: number, b2: number, ioSettings: number) => {
    const k1 = keyOf(Jolt.wrapPointer(b1, Jolt.Body).GetID());
    const k2 = keyOf(Jolt.wrapPointer(b2, Jolt.Body).GetID());
    const belt1 = beltByKey.get(k1);
    const belt = belt1 ?? beltByKey.get(k2);
    if (!belt) return;
    // The setting is the surface velocity of body 2 relative to body 1: flip it when the belt is body 1.
    const sign = belt1 ? -1 : 1;
    const a = belt.spec.axis;
    Jolt.wrapPointer(ioSettings, Jolt.ContactSettings).mRelativeLinearSurfaceVelocity.Set(
      sign * a[0] * belt.speed,
      sign * a[1] * belt.speed,
      sign * a[2] * belt.speed,
    );
    const w = (belt.spec.turnPerMps ?? 0) * belt.speed;
    if (w !== 0) Jolt.wrapPointer(ioSettings, Jolt.ContactSettings).mRelativeAngularSurfaceVelocity.Set(0, sign * w, 0);
  };
  listener.OnContactAdded = (b1: number, b2: number, _m: number, set: number) => surface(b1, b2, set);
  listener.OnContactPersisted = (b1: number, b2: number, _m: number, set: number) => surface(b1, b2, set);
  listener.OnContactRemoved = () => {};
  physics.SetContactListener(listener);

  let timeMs = 0;
  let disposed = false;

  const detach = (itemId: string) => {
    const a = attachments.get(itemId);
    if (!a) return;
    attachments.delete(itemId);
    // The system holds the only reference: removing the constraint frees it. Never destroy it again.
    physics.RemoveConstraint(a.constraint);
    const e = entries.get(itemId);
    if (e) bodyInterface.ActivateBody(e.body.GetID());
  };

  const world: PhysicsWorld = {
    get timeMs() {
      return timeMs;
    },
    addBody(spec) {
      if (entries.has(spec.id)) throw new Error(`duplicate body ${spec.id}`);
      const half = new Jolt.Vec3(spec.half[0], spec.half[1], spec.half[2]);
      const shape = new Jolt.BoxShape(half, 0.05, undefined);
      const pos = new Jolt.RVec3(spec.position[0], spec.position[1], spec.position[2]);
      const a = (spec.rotationYDeg * Math.PI) / 360;
      const rot = new Jolt.Quat(0, Math.sin(a), 0, Math.cos(a));
      const motion =
        spec.motion === 'dynamic'
          ? Jolt.EMotionType_Dynamic
          : spec.motion === 'kinematic'
            ? Jolt.EMotionType_Kinematic
            : Jolt.EMotionType_Static;
      const cs = new Jolt.BodyCreationSettings(shape, pos, rot, motion, spec.layer === 'moving' ? MOVING : NON_MOVING);
      cs.mFriction = spec.friction;
      if (spec.motion === 'dynamic') {
        cs.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
        cs.mMassPropertiesOverride.mMass = spec.massKg;
      }
      const body = bodyInterface.CreateBody(cs);
      bodyInterface.AddBody(body.GetID(), spec.motion === 'static' ? Jolt.EActivation_DontActivate : Jolt.EActivation_Activate);
      for (const o of [cs, half, pos, rot]) Jolt.destroy(o);
      const key = keyOf(body.GetID());
      entries.set(spec.id, { spec, body, key });
      idByKey.set(key, spec.id);
    },
    removeBody(id) {
      const e = entry(id);
      detach(id);
      for (const [itemId, a] of [...attachments]) if (a.anchorId === id) detach(itemId);
      bodyInterface.RemoveBody(e.body.GetID());
      bodyInterface.DestroyBody(e.body.GetID());
      entries.delete(id);
      idByKey.delete(e.key);
    },
    addBelt(spec) {
      const e = entry(spec.bodyId);
      const bounds = e.body.GetWorldSpaceBounds();
      const lo = new Jolt.Vec3(bounds.mMin.GetX(), bounds.mMax.GetY() - WAKE_MARGIN, bounds.mMin.GetZ());
      const hi = new Jolt.Vec3(bounds.mMax.GetX(), bounds.mMax.GetY() + WAKE_MARGIN, bounds.mMax.GetZ());
      const wake = new Jolt.AABox(lo, hi);
      Jolt.destroy(lo);
      Jolt.destroy(hi);
      const belt: Belt = { spec, target: 0, speed: 0, wake };
      belts.set(spec.id, belt);
      beltByKey.set(e.key, belt);
    },
    setBeltTarget(id, speedMps) {
      const belt = belts.get(id);
      if (!belt) throw new Error(`unknown belt ${id}`);
      belt.target = speedMps;
    },
    setKinematicPose(id, p, q) {
      const e = entry(id);
      const pos = new Jolt.RVec3(p[0], p[1], p[2]);
      const rot = new Jolt.Quat(q[0], q[1], q[2], q[3]);
      bodyInterface.MoveKinematic(e.body.GetID(), pos, rot, stepMs / 1000);
      Jolt.destroy(pos);
      Jolt.destroy(rot);
    },
    step(ms) {
      if (!Number.isInteger(ms / stepMs) || ms <= 0) throw new RangeError(`step must be a positive multiple of ${stepMs} ms`);
      for (let i = 0; i < ms / stepMs; i += 1) {
        for (const belt of belts.values()) {
          if (belt.speed === belt.target) continue;
          const delta = belt.spec.accelMps2 * (stepMs / 1000);
          belt.speed = Math.abs(belt.target - belt.speed) <= delta ? belt.target : belt.speed + Math.sign(belt.target - belt.speed) * delta;
          // Per-belt wake: only bodies whose bounds touch this belt's top, so a sleeping box starts moving
          // with its belt and bodies on other belts stay asleep.
          bodyInterface.ActivateBodiesInAABox(belt.wake, movingBp, movingObj);
        }
        jolt.Step(stepMs / 1000, 1);
        timeMs += stepMs;
      }
    },
    rayHit(from, to) {
      const dir = new Jolt.Vec3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
      const origin = new Jolt.RVec3(from[0], from[1], from[2]);
      const ray = new Jolt.RRayCast(origin, dir);
      const rayCastSettings = new Jolt.RayCastSettings();
      const collector = new Jolt.CastRayClosestHitCollisionCollector();
      physics.GetNarrowPhaseQuery().CastRay(ray, rayCastSettings, collector, movingBp, movingObj, bodyFilter, shapeFilter);
      const hit = collector.HadHit() ? (idByKey.get(keyOf(collector.mHit.mBodyID)) ?? null) : null;
      for (const o of [collector, rayCastSettings, ray, origin, dir]) Jolt.destroy(o);
      return hit;
    },
    has: (id) => entries.has(id),
    attachedTo: (itemId) => attachments.get(itemId)?.anchorId ?? null,
    attach(anchorId, itemId) {
      const anchor = entries.get(anchorId);
      const item = entries.get(itemId);
      if (!anchor) throw new Error(`attach: unknown anchor body ${anchorId}`);
      if (!item) throw new Error(`attach: unknown item body ${itemId}`);
      if (anchorId === itemId) throw new Error(`attach: ${itemId} cannot be attached to itself`);
      if (attachments.has(itemId)) throw new Error(`attach: ${itemId} is already attached to ${attachments.get(itemId)!.anchorId}`);
      const cs = new Jolt.FixedConstraintSettings();
      cs.mAutoDetectPoint = true;
      const constraint = cs.Create(anchor.body, item.body);
      Jolt.destroy(cs);
      physics.AddConstraint(constraint);
      attachments.set(itemId, { anchorId, constraint });
      bodyInterface.ActivateBody(item.body.GetID());
    },
    detach,
    bodiesInBox(min, max) {
      const lo = new Jolt.Vec3(min[0], min[1], min[2]);
      const hi = new Jolt.Vec3(max[0], max[1], max[2]);
      const box = new Jolt.AABox(lo, hi);
      const hits = new Set<number>();
      const collector = new Jolt.CollideShapeBodyCollectorJS();
      collector.Reset = () => {};
      collector.AddHit = (b: number) => {
        hits.add(keyOf(Jolt.wrapPointer(b, Jolt.BodyID)));
      };
      physics.GetBroadPhaseQuery().CollideAABox(box, collector, anyBp, anyObj);
      for (const o of [collector, box, lo, hi]) Jolt.destroy(o);
      const out: string[] = [];
      for (const [id, e] of entries) {
        if (e.spec.motion === 'static' || !hits.has(e.key)) continue;
        const c = e.body.GetPosition();
        const x = c.GetX();
        const y = c.GetY();
        const z = c.GetZ();
        if (x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1] && z >= min[2] && z <= max[2]) out.push(id);
      }
      return out;
    },
    gapBelow(id) {
      const e = entry(id);
      const bottom = e.body.GetWorldSpaceBounds().mMin.GetY();
      const c = e.body.GetPosition();
      const dir = new Jolt.Vec3(0, -GAP_RANGE_M, 0);
      const origin = new Jolt.RVec3(c.GetX(), bottom, c.GetZ());
      const ray = new Jolt.RRayCast(origin, dir);
      const rayCastSettings = new Jolt.RayCastSettings();
      const collector = new Jolt.CastRayClosestHitCollisionCollector();
      const self = new Jolt.IgnoreSingleBodyFilter(e.body.GetID());
      physics.GetNarrowPhaseQuery().CastRay(ray, rayCastSettings, collector, anyBp, anyObj, self, shapeFilter);
      const gap = collector.HadHit() ? collector.mHit.mFraction * GAP_RANGE_M : Infinity;
      for (const o of [self, collector, rayCastSettings, ray, origin, dir]) Jolt.destroy(o);
      return gap;
    },
    bodies() {
      const out: { id: string; p: Vec3; q: Quat; v: Vec3; asleep: boolean }[] = [];
      for (const [id, { spec, body }] of entries) {
        if (spec.motion === 'static') continue;
        const p = body.GetPosition();
        const q = body.GetRotation();
        const v = body.GetLinearVelocity();
        out.push({
          id,
          p: [p.GetX(), p.GetY(), p.GetZ()],
          q: [q.GetX(), q.GetY(), q.GetZ(), q.GetW()],
          v: [v.GetX(), v.GetY(), v.GetZ()],
          asleep: !body.IsActive(),
        });
      }
      return out;
    },
    capture() {
      const chunks: Uint8Array[] = [];
      const recorder = new Jolt.StateRecorderJS();
      recorder.WriteBytes = (data: number, n: number) => {
        chunks.push(Jolt.HEAPU8.slice(data, data + n));
      };
      recorder.IsEOF = () => false;
      recorder.IsFailed = () => false;
      physics.SaveState(recorder, Jolt.EStateRecorderState_All);
      Jolt.destroy(recorder);
      const head = new TextEncoder().encode(
        JSON.stringify({
          timeMs,
          ids: [...entries.keys()],
          attachments: [...attachments].map(([item, a]) => [item, a.anchorId]),
          belts: [...belts].map(([id, b]) => [id, b.speed, b.target]),
        }),
      );
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(4 + head.length + total);
      new DataView(out.buffer).setUint32(0, head.length, true);
      out.set(head, 4);
      let at = 4 + head.length;
      for (const c of chunks) {
        out.set(c, at);
        at += c.length;
      }
      return out;
    },
    restore(bytes) {
      const headLen = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
      const head = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headLen))) as {
        timeMs: number;
        ids: string[];
        attachments?: [string, string][];
        belts: [string, number, number][];
      };
      if (head.ids.join('\u0000') !== [...entries.keys()].join('\u0000')) throw new Error('capture belongs to a different set of bodies');
      const held = [...attachments].map(([item, a]) => `${item}>${a.anchorId}`).join('\u0000');
      if ((head.attachments ?? []).map(([item, anchor]) => `${item}>${anchor}`).join('\u0000') !== held) {
        throw new Error('capture belongs to a different set of attachments');
      }
      const data = bytes.subarray(4 + headLen);
      let pos = 0;
      let failed = false;
      const recorder = new Jolt.StateRecorderJS();
      recorder.ReadBytes = (out: number, n: number) => {
        if (pos + n > data.length) {
          failed = true;
          return;
        }
        Jolt.HEAPU8.set(data.subarray(pos, pos + n), out);
        pos += n;
      };
      recorder.IsEOF = () => pos >= data.length;
      recorder.IsFailed = () => failed;
      const ok = physics.RestoreState(recorder);
      Jolt.destroy(recorder);
      if (!ok || failed) throw new Error('capture could not be restored');
      timeMs = head.timeMs;
      for (const [id, speed, target] of head.belts) {
        const b = belts.get(id);
        if (b) {
          b.speed = speed;
          b.target = target;
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const itemId of [...attachments.keys()]) detach(itemId);
      for (const { body } of entries.values()) {
        bodyInterface.RemoveBody(body.GetID());
        bodyInterface.DestroyBody(body.GetID());
      }
      for (const belt of belts.values()) Jolt.destroy(belt.wake);
      for (const o of [movingBp, movingObj, anyBp, anyObj, bodyFilter, shapeFilter, listener]) Jolt.destroy(o);
      // Destroying the interface also frees the layer pair filter and the broad-phase interface:
      // destroying those again corrupts the module. Only the BroadPhaseLayer objects are ours.
      Jolt.destroy(jolt);
      Jolt.destroy(bpNonMoving);
      Jolt.destroy(bpMoving);
    },
  };
  return world;
}
