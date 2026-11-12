import {
  AmbientLight, BoxGeometry, DirectionalLight, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera,
  Quaternion, Scene, Vector3, WebGLRenderer,
} from 'three';
import type { GateScene } from './scenes';
import type { GateWorld } from './world';

export type Quality = 'low' | 'medium';

// The drawing buffer is always 1920x1080: the budget is judged at that size whatever the window.
export function createView(canvas: HTMLCanvasElement, world: GateWorld, scene: GateScene, quality: Quality): { render(): void; dispose(): void } {
  const medium = quality === 'medium';
  const renderer = new WebGLRenderer({ canvas, antialias: medium });
  renderer.setPixelRatio(1);
  renderer.setSize(1920, 1080, false);
  renderer.shadowMap.enabled = medium;

  const three = new Scene();
  three.add(new AmbientLight(0xffffff, medium ? 0.5 : 1.2));
  if (medium) {
    const sun = new DirectionalLight(0xffffff, 2.5);
    sun.position.set(10, 25, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -45; cam.right = 45; cam.top = 20; cam.bottom = -20; cam.far = 80;
    three.add(sun);
  }

  const unit = new BoxGeometry(2, 2, 2);
  const staticMaterial = new MeshStandardMaterial({ color: 0x607080 });
  const beltMaterial = new MeshStandardMaterial({ color: 0x303840 });
  const boxMaterial = new MeshStandardMaterial({ color: 0xd08030 });
  const addFixed = (half: readonly number[], pos: readonly number[], material: MeshStandardMaterial) => {
    const mesh = new Mesh(unit, material);
    mesh.scale.set(half[0], half[1], half[2]);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.receiveShadow = medium;
    three.add(mesh);
  };
  for (const b of scene.boxes) if (b.motion === 'static') addFixed(b.halfExtents, b.position, staticMaterial);
  for (const b of scene.belts) addFixed(b.halfExtents, b.position, beltMaterial);

  // Same order as GateWorld.writeState: the dynamic boxes of the scene, in scene order.
  const dynamic = scene.boxes.filter((b) => b.motion === 'dynamic');
  const boxes = new InstancedMesh(unit, boxMaterial, Math.max(dynamic.length, 1));
  boxes.count = dynamic.length;
  boxes.castShadow = medium;
  boxes.receiveShadow = medium;
  three.add(boxes);

  const camera = new PerspectiveCamera(45, 1920 / 1080, 0.1, 200);
  camera.position.set(0, 22, 30);
  camera.lookAt(0, 0, 0);

  const state = new Float32Array(dynamic.length * 7);
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();

  return {
    render() {
      world.writeState(state, 0);
      for (let i = 0; i < dynamic.length; i += 1) {
        const o = i * 7;
        const h = dynamic[i].halfExtents;
        position.set(state[o], state[o + 1], state[o + 2]);
        rotation.set(state[o + 3], state[o + 4], state[o + 5], state[o + 6]);
        scale.set(h[0], h[1], h[2]);
        boxes.setMatrixAt(i, matrix.compose(position, rotation, scale));
      }
      boxes.instanceMatrix.needsUpdate = true;
      renderer.render(three, camera);
    },
    dispose() {
      unit.dispose(); staticMaterial.dispose(); beltMaterial.dispose(); boxMaterial.dispose();
      boxes.dispose();
      renderer.dispose();
    },
  };
}
