import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";

/**
 * Walking inside a generated world.
 *
 * Marble worlds are not metric and every world has a different size - the first
 * bedroom measured 2.63 x 1.47 x 3.57 units - so no movement constant here can
 * be an absolute number. Everything is expressed in *eye heights per second*,
 * which makes the whole controller scale-invariant: it behaves the same in a
 * doll's house and a cathedral, and a new world needs no tuning.
 *
 * For reference, with a human eye height of ~1.6 m these work out at roughly
 * 1.4 m/s walking and 9.8 m/s^2 gravity.
 */
const WALK_SPEED = 0.9;
const RUN_SPEED = 1.7;
const GRAVITY = 6.0;
const JUMP_SPEED = 2.6;
/** Capsule radius, also in eye heights (~0.35 m for a human). */
const RADIUS = 0.22;
/** Below this, a surface counts as floor rather than wall. */
const GROUND_NORMAL_Y = 0.35;
const PITCH_LIMIT = Math.PI / 2 - 0.05;
/** Pixels from the stick's anchor point that count as full tilt. */
const STICK_RADIUS = 56;
const TOUCH_LOOK_SPEED = 0.004;
/** Physics runs in fixed steps so collision cannot be tunnelled through. */
const STEP_MS = 1000 / 120;

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches ?? "ontouchstart" in window;
}

export interface FirstPersonOptions {
  /** Eye height above the floor, in world units. Sets the scale of everything. */
  eyeHeight: number;
  spawn: THREE.Vector3;
  /** What to face on arrival - normally the middle of the world. */
  lookAt: THREE.Vector3;
  /** Lowest point of the world; used to recover if the player falls out. */
  floorY: number;
  /** Highest point of the world. The eye is never allowed above it. */
  ceilingY?: number;
}

export class FirstPersonController {
  readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly eyeHeight: number;
  private readonly floorY: number;
  private readonly ceilingY: number | null;
  private readonly spawn: THREE.Vector3;

  private bvh: MeshBVH | null = null;
  /** True while standing on the bounding-box stand-in rather than real geometry. */
  private provisional = false;
  private readonly velocity = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private onGround = false;
  private accumulator = 0;

  private readonly keys = new Set<string>();

  /**
   * Touch input, tracked per finger.
   *
   * The screen splits down the middle: a finger landing on the left half
   * becomes a movement stick anchored wherever it touched down, and one on
   * the right half drags the view. Anchoring the stick at the touch point
   * rather than at a fixed spot is what makes it usable without looking -
   * there is no on-screen target to hit first.
   */
  private moveTouch: { id: number; originX: number; originY: number } | null = null;
  private lookTouch: { id: number; x: number; y: number } | null = null;
  private readonly moveAxis = new THREE.Vector2();
  private joystickBase: HTMLElement | null = null;
  private joystickThumb: HTMLElement | null = null;
  /**
   * Drives the controller forward with no input, for headless verification.
   * The multiplier exists because a software-rendered capture only manages a
   * handful of frames: at 1x the player barely leaves the spawn before the
   * screenshot is taken. Collision stays sound at high multiples because the
   * physics substep is fixed at 120Hz regardless of speed.
   */
  autoWalk = 0;

  // Scratch objects. Collision runs every step, so nothing here is allocated
  // inside the loop.
  private readonly segment = new THREE.Line3();
  private readonly box = new THREE.Box3();
  private readonly triPoint = new THREE.Vector3();
  private readonly capsulePoint = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onMouseMove: (e: MouseEvent) => void;
  private readonly onClick: () => void;
  private readonly onTouchStart: (e: TouchEvent) => void;
  private readonly onTouchMove: (e: TouchEvent) => void;
  private readonly onTouchEnd: (e: TouchEvent) => void;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    { eyeHeight, spawn, lookAt, floorY, ceilingY }: FirstPersonOptions,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.eyeHeight = eyeHeight;
    this.floorY = floorY;
    this.ceilingY = ceilingY ?? null;
    this.spawn = spawn.clone();
    this.position.copy(spawn);

    // Face the middle of the world rather than an arbitrary axis. A camera
    // with yaw applied about Y looks along (-sin yaw, 0, -cos yaw), so the yaw
    // that points at `lookAt` is atan2 of the negated direction.
    const dx = lookAt.x - spawn.x;
    const dz = lookAt.z - spawn.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.camera.rotation.order = "YXZ";

    this.onKeyDown = (e) => {
      this.keys.add(e.code);
      if (e.code === "Space") e.preventDefault();
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onMouseMove = (e) => {
      if (document.pointerLockElement !== this.domElement) return;
      this.yaw -= e.movementX * 0.002;
      this.pitch -= e.movementY * 0.002;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
    };
    this.onClick = () => {
      // Pointer lock means nothing on touch, and requesting it there just
      // raises a prompt that grants something unusable.
      if (isTouchDevice()) return;
      if (document.pointerLockElement !== this.domElement) {
        this.domElement.requestPointerLock?.();
      }
    };

    this.onTouchStart = (e) => {
      const half = this.domElement.clientWidth / 2;
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.clientX < half && !this.moveTouch) {
          this.moveTouch = {
            id: touch.identifier,
            originX: touch.clientX,
            originY: touch.clientY,
          };
          this.showJoystick(touch.clientX, touch.clientY, 0, 0);
        } else if (touch.clientX >= half && !this.lookTouch) {
          this.lookTouch = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
        }
      }
      e.preventDefault();
    };

    this.onTouchMove = (e) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (this.moveTouch && touch.identifier === this.moveTouch.id) {
          const dx = touch.clientX - this.moveTouch.originX;
          const dy = touch.clientY - this.moveTouch.originY;
          // Full tilt at STICK_RADIUS px from the anchor, analog in between.
          this.moveAxis.set(dx / STICK_RADIUS, dy / STICK_RADIUS);
          if (this.moveAxis.length() > 1) this.moveAxis.normalize();
          this.showJoystick(
            this.moveTouch.originX,
            this.moveTouch.originY,
            this.moveAxis.x * STICK_RADIUS,
            this.moveAxis.y * STICK_RADIUS,
          );
        } else if (this.lookTouch && touch.identifier === this.lookTouch.id) {
          this.yaw -= (touch.clientX - this.lookTouch.x) * TOUCH_LOOK_SPEED;
          this.pitch -= (touch.clientY - this.lookTouch.y) * TOUCH_LOOK_SPEED;
          this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
          this.lookTouch.x = touch.clientX;
          this.lookTouch.y = touch.clientY;
        }
      }
      e.preventDefault();
    };

    this.onTouchEnd = (e) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (this.moveTouch && touch.identifier === this.moveTouch.id) {
          this.moveTouch = null;
          this.moveAxis.set(0, 0);
          this.hideJoystick();
        }
        if (this.lookTouch && touch.identifier === this.lookTouch.id) {
          this.lookTouch = null;
        }
      }
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    this.domElement.addEventListener("click", this.onClick);
    // Deliberately not passive: these have to cancel the browser's own scroll
    // and pull-to-refresh, or walking drags the page instead of the player.
    this.domElement.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.domElement.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.domElement.addEventListener("touchend", this.onTouchEnd);
    this.domElement.addEventListener("touchcancel", this.onTouchEnd);
  }

  /**
   * Optional on-screen stick. Positioned by direct style writes rather than
   * React state, because this moves every frame a thumb is down.
   */
  setJoystickElements(base: HTMLElement | null, thumb: HTMLElement | null) {
    this.joystickBase = base;
    this.joystickThumb = thumb;
    this.hideJoystick();
  }

  private showJoystick(x: number, y: number, dx: number, dy: number) {
    if (!this.joystickBase || !this.joystickThumb) return;
    this.joystickBase.style.display = "block";
    this.joystickBase.style.left = x + "px";
    this.joystickBase.style.top = y + "px";
    this.joystickThumb.style.transform =
      "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
  }

  private hideJoystick() {
    if (this.joystickBase) this.joystickBase.style.display = "none";
  }

  get isLocked(): boolean {
    return typeof document !== "undefined" && document.pointerLockElement === this.domElement;
  }

  /** Feeds the collider geometry in. Nobody can stand up before this lands. */
  setCollider(geometry: THREE.BufferGeometry) {
    this.bvh = new MeshBVH(geometry);
    this.provisional = false;
  }

  /**
   * A stand-in floor and walls, built from the world's bounding box.
   *
   * The real collider is several megabytes and gates walking completely, which
   * on a slow connection means minutes of standing still. The bounds are
   * already in the manifest and cost nothing, so a plain box gives the player
   * a floor to stand on and walls to stop at from the first frame. The real
   * mesh replaces it when it arrives, and furniture appears as you would
   * expect - as detail added to a room you were already standing in.
   *
   * Never overwrites a real collider.
   */
  setProvisionalBounds(min: [number, number, number], max: [number, number, number]) {
    if (this.bvh && !this.provisional) return;
    const box = new THREE.BoxGeometry(
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2],
    );
    box.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    this.bvh = new MeshBVH(box);
    this.provisional = true;
  }

  /** False while there is nothing at all to stand on, so gravity is held off. */
  get hasGround(): boolean {
    return this.bvh !== null;
  }

  /** True once the real collider has replaced the bounding-box stand-in. */
  get hasDetailedGround(): boolean {
    return this.bvh !== null && !this.provisional;
  }

  /**
   * What the player is standing on, for the debug readout.
   *
   * Worth its own line: a walk across the bounding-box stand-in looks exactly
   * like a walk across a real floor in the numbers, and mistaking one for the
   * other makes a collision test prove nothing.
   */
  get groundKind(): "none" | "box" | "mesh" {
    if (!this.bvh) return "none";
    return this.provisional ? "box" : "mesh";
  }

  update(deltaMs: number) {
    // Clamp so an alt-tab or a slow first frame cannot teleport the player
    // through a wall on resume.
    this.accumulator += Math.min(deltaMs, 250);
    while (this.accumulator >= STEP_MS) {
      this.step(STEP_MS / 1000);
      this.accumulator -= STEP_MS;
    }
    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private step(dt: number) {
    const scale = this.eyeHeight;

    // No collider yet means no floor yet. Applying gravity here drops the
    // player through a world that has not finished downloading - they fall,
    // trip the out-of-world recovery, respawn and fall again, forever. Locally
    // the collider arrives in milliseconds and this never shows; over the
    // network it is several megabytes and it is all anyone sees.
    //
    // So stand still until there is something to stand on. Looking around
    // still works, because yaw and pitch are handled by the input events.
    if (!this.bvh) {
      this.velocity.set(0, 0, 0);
      return;
    }

    // Horizontal input, in the direction the camera faces.
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this.delta.set(0, 0, 0);
    if (this.autoWalk > 0 || this.keys.has("KeyW") || this.keys.has("ArrowUp")) {
      this.delta.add(this.forward);
    }
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) this.delta.sub(this.forward);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) this.delta.add(this.right);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) this.delta.sub(this.right);

    // Screen y grows downward, so pushing the stick up walks forward.
    if (this.moveAxis.lengthSq() > 0) {
      this.delta.addScaledVector(this.forward, -this.moveAxis.y);
      this.delta.addScaledVector(this.right, this.moveAxis.x);
    }

    const speed =
      (this.keys.has("ShiftLeft") ? RUN_SPEED : WALK_SPEED) *
      scale *
      (this.autoWalk > 0 ? this.autoWalk : 1);
    const magnitude = Math.min(this.delta.length(), 1);
    if (magnitude > 0) this.delta.normalize().multiplyScalar(speed * dt * magnitude);

    if (this.onGround && this.keys.has("Space")) {
      this.velocity.y = JUMP_SPEED * scale;
      this.onGround = false;
    }

    this.velocity.y -= GRAVITY * scale * dt;

    this.position.addScaledVector(this.velocity, dt).add(this.delta);

    // The step limit lives inside collision resolution, where contact heights
    // are known. Comparing how far one substep rose does not work: physics
    // runs at 120Hz, so walking up an edge gains a fraction of a millimetre
    // per step and no per-step threshold is ever crossed.
    this.resolveCollisions(scale);

    // A world with holes in its mesh can drop the player out of the bottom.
    // Put them back rather than falling forever.
    if (this.position.y < this.floorY - this.eyeHeight * 4) {
      this.position.copy(this.spawn);
      this.velocity.set(0, 0, 0);
    }
  }

  /**
   * Pushes the player capsule out of any collider triangle it overlaps.
   *
   * The capsule runs from the eye down to the feet. Each overlapping triangle
   * contributes a push along the shortest separating direction; a mostly-upward
   * push means we landed on something, which is what makes gravity settle
   * instead of accumulating forever.
   */
  private resolveCollisions(scale: number) {
    const bvh = this.bvh;
    if (!bvh) return;

    const radius = RADIUS * scale;
    // Eye at the top, feet at position.y - eyeHeight.
    this.segment.start.copy(this.position);
    this.segment.end.set(
      this.position.x,
      this.position.y - this.eyeHeight + radius,
      this.position.z,
    );

    this.box.makeEmpty();
    this.box.expandByPoint(this.segment.start);
    this.box.expandByPoint(this.segment.end);
    this.box.min.addScalar(-radius);
    this.box.max.addScalar(radius);

    let landed = false;

    bvh.shapecast({
      intersectsBounds: (box) => box.intersectsBox(this.box),
      intersectsTriangle: (tri) => {
        const distance = tri.closestPointToSegment(
          this.segment,
          this.triPoint,
          this.capsulePoint,
        );
        if (distance < radius) {
          const depth = radius - distance;
          // Pushed straight back out along the shortest separating direction.
          //
          // Do not be tempted to redirect this - an earlier attempt flattened
          // upward pushes to horizontal to stop the player climbing furniture,
          // and a table top is dozens of triangles, every one of which then
          // shoved sideways. They compounded into a single hard push through
          // the nearest wall. Climbing is dealt with after the fact, by
          // clamping height, not by lying about which way a surface faces.
          const direction = this.capsulePoint.sub(this.triPoint).normalize();
          if (direction.y > GROUND_NORMAL_Y) landed = true;
          this.segment.start.addScaledVector(direction, depth);
          this.segment.end.addScaledVector(direction, depth);
        }
        return false;
      },
    });

    this.position.copy(this.segment.start);

    // Never let the eye enter the ceiling.
    //
    // This is what the climbing actually broke. In a world whose floor is at
    // -1.109 and ceiling at 0.643, walking onto a table lifts the eye to 0.71
    // - inside the roof, looking at black. Capping the height means the player
    // can still stand on the table, but ducks under the ceiling instead of
    // going through it, which is survivable where the black screen was not.
    if (this.ceilingY !== null) {
      const cap = this.ceilingY - radius * 0.5;
      if (this.position.y > cap) {
        this.position.y = cap;
        if (this.velocity.y > 0) this.velocity.y = 0;
      }
    }

    if (landed) {
      this.onGround = true;
      if (this.velocity.y < 0) this.velocity.y = 0;
    } else {
      this.onGround = false;
    }
  }

  /** Where the player is standing, for debug readouts. */
  get debugPosition(): THREE.Vector3 {
    return this.position;
  }

  get grounded(): boolean {
    return this.onGround;
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    this.domElement.removeEventListener("click", this.onClick);
    this.domElement.removeEventListener("touchstart", this.onTouchStart);
    this.domElement.removeEventListener("touchmove", this.onTouchMove);
    this.domElement.removeEventListener("touchend", this.onTouchEnd);
    this.domElement.removeEventListener("touchcancel", this.onTouchEnd);
    if (this.isLocked) document.exitPointerLock?.();
  }
}

/**
 * One world-space geometry from everything in a loaded GLTF.
 *
 * The BVH needs a single geometry, and node transforms have to be baked in or
 * the collision surface sits somewhere other than the thing you can see.
 */
export function mergeSceneGeometry(root: THREE.Object3D): THREE.BufferGeometry | null {
  const geometries: THREE.BufferGeometry[] = [];
  root.updateWorldMatrix(true, true);

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    // Only position matters for collision, and mismatched attribute sets
    // cannot be merged.
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position") geometry.deleteAttribute(name);
    }
    geometries.push(geometry);
  });

  if (!geometries.length) return null;
  if (geometries.length === 1) return geometries[0];

  // Merge by hand rather than pulling in BufferGeometryUtils: only positions
  // and indices are involved, so this stays small and dependency-free.
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geometries) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }

  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;

  for (const g of geometries) {
    const position = g.attributes.position;
    positions.set(position.array as Float32Array, vertexOffset * 3);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) {
        indices[indexOffset + i] = g.index.getX(i) + vertexOffset;
      }
      indexOffset += g.index.count;
    } else {
      for (let i = 0; i < position.count; i++) {
        indices[indexOffset + i] = i + vertexOffset;
      }
      indexOffset += position.count;
    }
    vertexOffset += position.count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}
