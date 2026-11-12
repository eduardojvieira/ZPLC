import type { JoltModule } from './jolt';
import type { GateScene, Quat, Vec3 } from './scenes';

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

  let timeMs = 0;
  let disposed = false;
  return {
    get timeMs() { return timeMs; },
    step(ms: number) {
      if (!Number.isInteger(ms / stepMs) || ms <= 0) throw new RangeError(`step must be a positive multiple of ${stepMs} ms`);
      for (let i = 0; i < ms / stepMs; i += 1) {
        jolt.Step(stepMs / 1000, 1);
        timeMs += stepMs;
      }
    },
    setBeltTarget(id: string) { throw new Error(`unknown belt ${id}`); },
    eye() { return false; },
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
      Jolt.destroy(jolt); // owns the layer filters and the broad-phase interface
      Jolt.destroy(bpNonMoving);
      Jolt.destroy(bpMoving);
    },
  };
}
