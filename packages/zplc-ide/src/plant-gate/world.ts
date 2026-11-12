import type { JoltModule } from './jolt';
import type { BeltSpec, GateScene, Quat, Vec3 } from './scenes';

export const PLANT_STEP_MS = 5;

export interface BodyState { id: string; p: Vec3; q: Quat; v: Vec3 }

export interface GateWorld {
  readonly timeMs: number;
  step(ms: number): void;
  setBeltTarget(id: string, speedMps: number): void;
  eye(id: string): boolean;
  bodies(): BodyState[];
  writeState(out: Float32Array, offset: number): number;
  dispose(): void;
}

const NON_MOVING = 0;
const MOVING = 1;

export function createWorld(Jolt: JoltModule, scene: GateScene, stepMs: number = PLANT_STEP_MS): GateWorld {
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

  const created: InstanceType<typeof Jolt.Body>[] = [];
  const dynamic: { id: string; body: InstanceType<typeof Jolt.Body> }[] = [];
  const makeBox = (id: string, half: Vec3, position: Vec3, massKg: number, friction: number, motion: 'static' | 'dynamic') => {
    const halfVec = new Jolt.Vec3(half[0], half[1], half[2]);
    const shape = new Jolt.BoxShape(halfVec, 0.05, undefined);
    const pos = new Jolt.RVec3(position[0], position[1], position[2]);
    const rot = new Jolt.Quat(0, 0, 0, 1);
    const isDynamic = motion === 'dynamic';
    const cs = new Jolt.BodyCreationSettings(shape, pos, rot, isDynamic ? Jolt.EMotionType_Dynamic : Jolt.EMotionType_Static, isDynamic ? MOVING : NON_MOVING);
    cs.mFriction = friction;
    if (isDynamic) {
      cs.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
      cs.mMassPropertiesOverride.mMass = massKg;
    }
    const body = bodyInterface.CreateBody(cs);
    bodyInterface.AddBody(body.GetID(), isDynamic ? Jolt.EActivation_Activate : Jolt.EActivation_DontActivate);
    Jolt.destroy(cs);
    Jolt.destroy(halfVec);
    Jolt.destroy(pos);
    Jolt.destroy(rot);
    created.push(body);
    if (isDynamic) dynamic.push({ id, body });
    return body;
  };
  for (const box of scene.boxes) makeBox(box.id, box.halfExtents, box.position, box.massKg, box.friction, box.motion);

  // A belt is a static box whose surface velocity is applied in the contact listener.
  interface Belt { spec: BeltSpec; target: number; speed: number }
  const belts = new Map<string, Belt>();
  const beltByBodyId = new Map<number, Belt>();
  for (const spec of scene.belts) {
    const body = makeBox(spec.id, spec.halfExtents, spec.position, 0, spec.friction, 'static');
    const belt: Belt = { spec, target: 0, speed: 0 };
    belts.set(spec.id, belt);
    beltByBodyId.set(body.GetID().GetIndexAndSequenceNumber(), belt);
  }
  const listener = new Jolt.ContactListenerJS();
  listener.OnContactValidate = () => Jolt.ValidateResult_AcceptAllContactsForThisBodyPair;
  const surface = (b1: number, b2: number, ioSettings: number) => {
    const id1 = Jolt.wrapPointer(b1, Jolt.Body).GetID().GetIndexAndSequenceNumber();
    const id2 = Jolt.wrapPointer(b2, Jolt.Body).GetID().GetIndexAndSequenceNumber();
    const belt1 = beltByBodyId.get(id1);
    const belt2 = beltByBodyId.get(id2);
    const belt = belt1 ?? belt2;
    if (!belt) return;
    // The setting is the surface velocity of body 2 relative to body 1.
    const sign = belt1 ? -1 : 1;
    const a = belt.spec.axis;
    Jolt.wrapPointer(ioSettings, Jolt.ContactSettings).mRelativeLinearSurfaceVelocity.Set(sign * a[0] * belt.speed, sign * a[1] * belt.speed, sign * a[2] * belt.speed);
  };
  listener.OnContactAdded = (b1: number, b2: number, _m: number, set: number) => surface(b1, b2, set);
  listener.OnContactPersisted = (b1: number, b2: number, _m: number, set: number) => surface(b1, b2, set);
  listener.OnContactRemoved = () => {};
  physics.SetContactListener(listener);

  const eyes = new Map(scene.eyes.map((e) => [e.id, e]));
  const narrow = physics.GetNarrowPhaseQuery();
  const movingBp = new Jolt.SpecifiedBroadPhaseLayerFilter(bpMoving);
  const movingObj = new Jolt.SpecifiedObjectLayerFilter(MOVING);
  const bodyFilter = new Jolt.BodyFilter();
  const shapeFilter = new Jolt.ShapeFilter();

  let timeMs = 0;
  let disposed = false;
  return {
    get timeMs() { return timeMs; },
    step(ms: number) {
      if (!Number.isInteger(ms / stepMs) || ms <= 0) throw new RangeError(`step must be a positive multiple of ${stepMs} ms`);
      for (let i = 0; i < ms / stepMs; i += 1) {
        for (const belt of belts.values()) {
          if (belt.speed === belt.target) continue;
          const delta = belt.spec.accelMps2 * (stepMs / 1000);
          belt.speed = Math.abs(belt.target - belt.speed) <= delta ? belt.target : belt.speed + Math.sign(belt.target - belt.speed) * delta;
          // ponytail: wakes every dynamic body while any belt ramps; per-belt contact lookup if the stress scene needs it
          for (const { body } of dynamic) bodyInterface.ActivateBody(body.GetID());
        }
        jolt.Step(stepMs / 1000, 1);
        timeMs += stepMs;
      }
    },
    setBeltTarget(id: string, speedMps: number) {
      const belt = belts.get(id);
      if (!belt) throw new Error(`unknown belt ${id}`);
      belt.target = speedMps;
    },
    eye(id: string) {
      const spec = eyes.get(id);
      if (!spec) throw new Error(`unknown eye ${id}`);
      const dir = new Jolt.Vec3(spec.to[0] - spec.from[0], spec.to[1] - spec.from[1], spec.to[2] - spec.from[2]);
      const origin = new Jolt.RVec3(spec.from[0], spec.from[1], spec.from[2]);
      const ray = new Jolt.RRayCast(origin, dir);
      const rayCastSettings = new Jolt.RayCastSettings();
      const collector = new Jolt.CastRayClosestHitCollisionCollector();
      narrow.CastRay(ray, rayCastSettings, collector, movingBp, movingObj, bodyFilter, shapeFilter);
      const hit = collector.HadHit();
      Jolt.destroy(collector);
      Jolt.destroy(rayCastSettings);
      Jolt.destroy(ray);
      Jolt.destroy(origin);
      Jolt.destroy(dir);
      return hit;
    },
    bodies() {
      return dynamic.map(({ id, body }) => {
        const p = body.GetPosition();
        const q = body.GetRotation();
        const v = body.GetLinearVelocity();
        return { id, p: [p.GetX(), p.GetY(), p.GetZ()] as const, q: [q.GetX(), q.GetY(), q.GetZ(), q.GetW()] as const, v: [v.GetX(), v.GetY(), v.GetZ()] as const };
      });
    },
    writeState(out: Float32Array, offset: number) {
      let at = offset;
      for (const { body } of dynamic) {
        const p = body.GetPosition();
        const q = body.GetRotation();
        out[at++] = p.GetX(); out[at++] = p.GetY(); out[at++] = p.GetZ();
        out[at++] = q.GetX(); out[at++] = q.GetY(); out[at++] = q.GetZ(); out[at++] = q.GetW();
      }
      return at - offset;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const body of created) {
        bodyInterface.RemoveBody(body.GetID());
        bodyInterface.DestroyBody(body.GetID());
      }
      Jolt.destroy(movingBp);
      Jolt.destroy(movingObj);
      Jolt.destroy(bodyFilter);
      Jolt.destroy(shapeFilter);
      Jolt.destroy(listener);
      Jolt.destroy(jolt); // owns the layer filters and the broad-phase interface
      Jolt.destroy(bpNonMoving);
      Jolt.destroy(bpMoving);
    },
  };
}
