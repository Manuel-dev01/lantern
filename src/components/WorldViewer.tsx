"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SparkRenderer, SplatMesh, SplatFileType } from "@sparkjsdev/spark";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshBVH } from "three-mesh-bvh";
import type { World } from "@/lib/types";
import {
  FirstPersonController,
  findSupportedSpawn,
  floorUnderCollider,
  isTouchDevice,
  mergeSceneGeometry,
  surfacesUnderCollider,
} from "@/lib/firstPerson";
import { alignMarbleCollider } from "@/lib/providers/collider";
import { findPerch, orientFor, restingHeight, seatOnFloor } from "@/lib/seating";

type Status = "loading" | "ready" | "error";
type Enhancement = { step: number; total: number; percent: number | null };

/**
 * Which levels of detail to load, in order.
 *
 * Quality is the point of this product, so the best level is always the one
 * you end up looking at. But at the bandwidth this has actually been measured
 * at - 11.7 KB/s - a 22 MB splat is a thirty-two minute blank screen, and a
 * gift nobody ever sees is worth less than a slightly soft one.
 *
 * So: load the smallest level first and show the room, then fetch the best one
 * and swap it in underneath. The visitor is standing in the place within
 * seconds and it sharpens while they look around. `?lod=` pins a single level,
 * which is how the difference gets compared.
 */
function lodLadder(
  lods: Record<string, string> | undefined,
  fallback: string,
  override: string | null,
): string[] {
  if (!lods) return [fallback];
  if (override && lods[override]) return [lods[override]];

  const order = ["100k", "150k", "500k", "full_res"];
  const available = order.filter((l) => lods[l]);
  if (!available.length) return [fallback];

  // A browser asking for less has asked explicitly, not been guessed at, so
  // that request is honoured and nothing bigger is fetched behind it.
  const saveData =
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData === true;
  if (saveData) return [lods[available[0]]];

  // Every rung, not just the two ends.
  //
  // Going straight from the smallest to the best means jumping 1 MB to 23 MB
  // in this gift, so the room stays visibly blurry for as long as that takes
  // and there is nothing in between. 500k is 5 MB and sharpens the room in a
  // fraction of the time, with full_res still arriving behind it.
  return available.map((level) => lods[level]);
}

/**
 * Download a file with a plain GET, reporting progress as it streams.
 *
 * Deliberately simple: no Range header, no custom headers, nothing that
 * would turn this into a preflighted cross-origin request.
 */
async function fetchWithProgress(
  url: string,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<Uint8Array> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} loading the world`);

  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received / total);
  }

  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * The same download, but not given up on at the first dropped connection.
 *
 * The splat is the one asset with no fallback: if it fails the visitor gets
 * "could not open this world" and nothing else, however well everything else
 * loaded. A reset partway through a megabyte is exactly the kind of thing
 * that should be retried rather than shown to someone who was sent a gift.
 *
 * Only network failures are retried. A 404 or a 500 will say the same thing
 * the second time.
 */
async function fetchWorldAsset(
  url: string,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<Uint8Array> {
  let last: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetchWithProgress(url, signal, onProgress);
    } catch (err) {
      if (signal.aborted) throw err;
      // fetchWithProgress throws "<status> <text> loading the world" for a
      // real HTTP response, which repeating will not improve.
      if (err instanceof Error && /^\d{3} /.test(err.message)) throw err;
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt));
    }
  }

  throw last;
}

export default function WorldViewer({ world }: { world: World }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLParagraphElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  // Both are knowable at mount, so they are computed once in the initialiser
  // rather than set from inside the effect, which would cost a second render.
  // Safe to touch window here: the viewer is only ever loaded with ssr: false.
  const [interactive] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    // A pinned camera is a photograph, so no invitation to walk is drawn over
    // it - that caption would otherwise land in every asset board still.
    return q.get("mode") !== "orbit" && !q.get("cam");
  });
  // Missing means look-only so every existing single-generation gift becomes
  // safe immediately. Walking must be deliberately approved per manifest.
  const canWalk = world.navigationMode === "walk";
  const [touch] = useState(isTouchDevice);
  // The collider is by far the heaviest asset and supplies placement, depth,
  // and optional walk physics, so its arrival gets its own progress number.
  // Starts true when there is nothing to wait for, so the "adding detail" note
  // never appears for a world without a collider - and so this is not set
  // synchronously from inside the effect.
  const [ground, setGround] = useState(
    () =>
      !world.colliderUrl ||
      new URLSearchParams(window.location.search).get("debug") === "nocollider",
  );
  const [groundProgress, setGroundProgress] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  /** The sharper quality rung loading behind a room that is already usable. */
  const [enhancement, setEnhancement] = useState<Enhancement | null>(null);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;

    // Renders the collider mesh visibly instead of depth-only, to check that
    // Marble's mesh export and splat export actually share a coordinate frame.
    // A mismatch produces no error at all - objects just occlude against
    // nothing, or vanish in midair - so it needs to be directly observable.
    const params = new URLSearchParams(window.location.search);
    const debug = params.get("debug");
    const debugCollider = debug === "collider";
    // Skips the depth-only pass entirely, to tell "the occluder is eating my
    // object" apart from "my object was never there".
    const noCollider = debug === "nocollider";
    // Orbit is the inspection camera: it needs no pointer lock, so it is the
    // only mode that works in a headless capture. Guided view is what the
    // recipient receives.
    const orbitMode = params.get("mode") === "orbit";
    // Walks forward on its own, so collision can be verified without hands.
    // `?autowalk=6` walks forward at 6x speed; any positive number works.
    const autoWalk = Number(params.get("autowalk") ?? 0);
    // Prints the player's position each frame, so a screenshot can be read as
    // a number instead of squinted at.
    const showHud = params.get("hud") === "1" || autoWalk > 0;

    // Draw order within the transparent queue. Everything that needs to
    // interleave with the splats is forced into that queue, because the opaque
    // queue always runs first and would write depth ahead of them.
    const ORDER = { splat: 0, occluder: 1, shadow: 2, gift: 3 };

    /**
     * Long enough that moving around an approved walk capture does not restart
     * it mid-sentence, short enough that coming back later plays it again.
     */
    const VOICE_COOLDOWN_MS = 20_000;

    /**
     * A soft dark disc, laid on the floor under each object.
     *
     * Without one an object that is genuinely touching the floor still reads
     * as hovering: measured at -0.873 against a floor of -0.873, and it still
     * looked like it was floating. Nothing in the scene casts shadows - the
     * room is splats, which cannot receive one - so contact has to be drawn
     * rather than lit. This is the oldest trick there is and the only one that
     * works against a gaussian floor.
     */
    const shadowTexture = (() => {
      const size = 128;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      const gradient = ctx.createRadialGradient(
        size / 2, size / 2, 0,
        size / 2, size / 2, size / 2,
      );
      gradient.addColorStop(0, "rgba(0,0,0,0.5)");
      gradient.addColorStop(0.45, "rgba(0,0,0,0.22)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      return new THREE.CanvasTexture(canvas);
    })();

    /** One shadow per object, reused when an object is re-seated. */
    const shadows = new Map<THREE.Object3D, THREE.Mesh>();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);

    const camera = new THREE.PerspectiveCamera(
      world.cameraFov ?? 60,
      mount.clientWidth / mount.clientHeight,
      0.01,
      1000,
    );
    camera.position.fromArray(world.spawn ?? [0, 1.6, 3]);

    /**
     * An exact camera, for frames that have to be reproducible.
     *
     * The asset board is a required deliverable and several judges read it as
     * a portfolio piece, so its stills need composing rather than catching -
     * and a frame caught by walking cannot be recovered after a reload, let
     * alone matched across two levels of detail or before and after a change.
     *
     *   ?cam=0.6,0.0,0.5&look=-0.2,-0.3,-0.9
     *
     * The HUD prints both numbers in exactly this order, so a good frame found
     * by walking can be read off the screen and pinned.
     */
    const triple = (value: string | null) => {
      const parts = (value ?? "").split(",").map(Number);
      return parts.length === 3 && parts.every(Number.isFinite)
        ? (parts as [number, number, number])
        : null;
    };

    const fixedCamera = triple(params.get("cam"));
    const fixedLook = triple(params.get("look"));
    if (fixedCamera) camera.position.fromArray(fixedCamera);
    if (fixedLook) {
      // A direction, matching what the HUD prints, rather than a target point.
      camera.lookAt(
        camera.position.x + fixedLook[0],
        camera.position.y + fixedLook[1],
        camera.position.z + fixedLook[2],
      );
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // Spark draws the gaussian splats. It has to live in the scene graph.
    const spark = new SparkRenderer({ renderer });
    scene.add(spark);

    // Eye height and every movement constant scale off the world's own size,
    // since Marble worlds are not metric and each one differs.
    const boundsMin = world.bounds?.min ?? [-1, 0, -1];
    const boundsMax = world.bounds?.max ?? [1, 2, 1];
    const floorY = world.spawnFloorY ?? boundsMin[1];
    // Eye height is the drop from where the camera stands to the lowest
    // geometry, not a fraction of the whole box. A collider takes in whatever
    // is visible through a window, so the box can be several times the height
    // of the room - and a fraction of that makes a giant with a capsule too
    // fat to fit through a door. The fraction stays only as a cap.
    const spawnY = world.spawn?.[1] ?? 0;
    const eyeHeight = Math.max(
      Math.min(spawnY - floorY, (boundsMax[1] - floorY) * 0.65),
      1e-3,
    );

    let controls: OrbitControls | null = null;
    let player: FirstPersonController | null = null;
    // Pinned and orbit cameras do not own a movement controller, but their
    // objects still need the exact same collider-backed seating as a walk.
    // Keeping that BVH here fixes reproducible stills without letting a hidden
    // controller rewrite the camera the still explicitly requested.
    let placementBvh: MeshBVH | null = null;
    const placementSpawn = new THREE.Vector3().fromArray(
      world.spawn ?? [0, 1.6, 3],
    );

    // A pinned camera means neither: the walker rewrites the camera every
    // frame from the capsule, and orbit damping drifts it. A frame asked for
    // by number has to stay exactly where it was asked for.
    if (fixedCamera) {
      // Nothing to attach. The camera is already where it was told to be.
    } else if (orbitMode) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      // Look at the middle of the world, not a fixed point. Marble worlds are
      // not origin-centred, so a hardcoded target aims at empty space.
      controls.target.fromArray(world.target ?? [0, 1, 0]);
    } else {
      player = new FirstPersonController(camera, renderer.domElement, {
        eyeHeight,
        floorY,
        ceilingY: boundsMax[1],
        spawn: new THREE.Vector3().fromArray(world.spawn ?? [0, 1.6, 3]),
        lookAt: new THREE.Vector3().fromArray(
          world.target ?? [
            (boundsMin[0] + boundsMax[0]) / 2,
            floorY + eyeHeight,
            (boundsMin[2] + boundsMax[2]) / 2,
          ],
        ),
        explorationRadius: world.explorationRadius,
        movementEnabled: canWalk,
        yawLimit: canWalk
          ? undefined
          : THREE.MathUtils.degToRad(world.viewYawDegrees ?? 22),
        pitchLimit: canWalk
          ? undefined
          : THREE.MathUtils.degToRad(world.viewPitchDegrees ?? 14),
      });
      player.autoWalk = canWalk ? autoWalk : 0;
      player.setJoystickElements(stickRef.current, thumbRef.current);
      // Stand on the bounding box straight away. The real collider is several
      // megabytes and would otherwise leave the player frozen until it lands.
      if (world.bounds) {
        player.setProvisionalBounds(
          [world.bounds.min[0], floorY, world.bounds.min[2]],
          world.bounds.max,
        );
      }
    }

    /**
     * The sender's voice, placed where the object is.
     *
     * Marble makes the room and Tripo makes the pan; only the person who sent
     * it can say what the pan was for. Attaching that to the object rather
     * than playing it over the whole world is the point: its voice belongs to
     * the remembered thing, not to a menu.
     *
     * Browsers will not start audio without a gesture. The "step inside"
     * button is one, which is why the door earns its place twice.
     */
    const listener = new THREE.AudioListener();
    camera.add(listener);
    const voices: THREE.PositionalAudio[] = [];

    function attachVoice(node: THREE.Object3D, url: string, radius: number) {
      const sound = new THREE.PositionalAudio(listener);
      // Audible from roughly a conversation away, falling off naturally after
      // that rather than cutting out at a boundary.
      sound.setRefDistance(Math.max(radius * 2, 0.35));
      sound.setRolloffFactor(2.5);
      sound.setDistanceModel("inverse");
      sound.setLoop(false);

      new THREE.AudioLoader().load(
        url,
        (buffer) => {
          if (disposed) return;
          sound.setBuffer(buffer);
          node.add(sound);
          voices.push(sound);
        },
        undefined,
        () => {
          // A missing voice note is not a broken gift; the object still stands.
          console.warn(`Lantern: could not load the voice note at ${url}`);
        },
      );
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 6, 4);
    scene.add(key);

    // The splat is fetched here rather than handed to Spark as a URL.
    //
    // Spark loads a URL with HTTP Range requests, and a Range header is not
    // CORS-safelisted, so a cross-origin load triggers a preflight - which
    // Vercel Blob answers with 405. The whole world then fails with nothing
    // but "network error". A plain GET has no preflight and works fine, so we
    // do that and pass the bytes in. It also gives an honest progress number,
    // which a ranged load never reported anyway.
    const ladder = lodLadder(world.splatLods, world.splatUrl, params.get("lod"));
    const abort = new AbortController();
    let splat: SplatMesh | null = null;
    /** Which level is actually on screen, for the debug readout. */
    let loadedUrl: string | null = null;
    /**
     * How many of the gift's objects are in the scene.
     *
     * On the HUD because "no object visible" has two completely different
     * causes - still downloading, or placed somewhere you cannot see it - and
     * a screenshot cannot tell them apart. Guessing wrong cost a day.
     */
    let objectsIn = 0;
    let objectsWanted = 0;
    /** Everything dropped onto the floor, so a late collider can re-seat them. */
    const placed: THREE.Object3D[] = [];

    /**
     * How wrong the server's idea of a person's height turned out to be.
     *
     * Objects are sized on the server as a fraction of eye height, and eye
     * height there is the drop from the spawn to `bounds.min.y` - the lowest
     * point of the whole collider, which reaches through windows and doorways
     * to ground well below the room. One real gift measured 1.31 against a
     * true 0.63, so every object in it came out twice the size it should be: a
     * pincushion like a football.
     *
     * The real figure is knowable the moment the collider lands, so everything
     * is rescaled by the ratio. 1 until then, and 1 for ever if the measure
     * turns out not to be credible.
     */
    let sizeCorrection = 1;

    /**
     * Rest an object on the floor that is actually under it.
     *
     * The server places objects on `bounds.min.y`, the lowest point of the
     * whole collider, which is not the floor - the same "the bounding box is
     * not the room" trap that put the camera outdoors and the objects through
     * a wall. Here it buries them: an object sunk below the boards is drawn,
     * but the occluder's depth hides it, so the room looks empty for the third
     * distinct reason in a row.
     *
     * Does nothing until the real collider is in, and is safe to run twice.
     */
    /** Where each object was put, so re-seating does not fight itself. */
    const perches = new Map<THREE.Object3D, { x: number; z: number }>();

    /**
     * Set an object down somewhere a person would have set it down.
     *
     * Everything on the floor was geometrically right and read as dropped
     * rather than kept - a frying pan and a bowl do not live on a kitchen
     * floor. The collider knows where the surfaces are, so the object looks
     * for one: an upward-facing face with room above it and support under its
     * whole footprint. The floor is the fallback, and a world with no
     * furniture still works.
     *
     * The direction comes from the position the server chose, not from where
     * the object currently is, so running this twice cannot walk it across
     * the room.
     */
    /**
     * Turn an object so it reads as the thing it is.
     *
     * The rule itself lives in seating.ts, pure, so the offline probe runs the
     * same code rather than a copy of it. This only applies the answer.
     *
     * Idempotent: the rotation is rebuilt from the stored value every time, so
     * re-seating when the collider lands cannot compound it.
     */
    function orientObject(node: THREE.Object3D, spawn: { x: number; z: number }) {
      const stored = (node.userData.giftObject as { rotationY?: number } | undefined)?.rotationY;
      node.rotation.set(0, stored ?? 0, 0);

      const box = new THREE.Box3().setFromObject(node);
      if (box.isEmpty()) return;

      const size = box.getSize(new THREE.Vector3());
      const { lay, yaw } = orientFor(size, { x: node.position.x, z: node.position.z }, spawn);

      if (lay) {
        // Bring the thin axis up to vertical, so the object lies on its face.
        const axis = lay === "x" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
        node.rotateOnWorldAxis(axis, Math.PI / 2);
      }
      node.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), yaw);
    }

    function seatObject(node: THREE.Object3D) {
      if (!player && !placementBvh) return;

      // Outdoor colliders can prove that the manifest spawn was under or
      // beside the walkable surface. Placement must follow the corrected
      // start point too, or the visitor is rescued while every object still
      // raycasts from the old hole and disappears.
      const supportedSpawn = player?.supportedSpawn ?? placementSpawn;
      const from = supportedSpawn.y;
      const spawn = { x: supportedSpawn.x, z: supportedSpawn.z, y: from };

      // Before anything is measured: seating and the contact shadow are both
      // computed from the box, and the box changes when the object turns.
      orientObject(node, spawn);

      const measured = new THREE.Box3().setFromObject(node);
      if (measured.isEmpty()) return;
      const size = measured.getSize(new THREE.Vector3());

      const original = (node.userData.giftObject as { position?: number[] } | undefined)?.position;
      let dx = (original?.[0] ?? node.position.x) - spawn.x;
      let dz = (original?.[2] ?? node.position.z) - spawn.z;
      const length = Math.hypot(dx, dz) || 1;
      dx /= length;
      dz /= length;

      // Everything already placed except this object, so re-seating it does
      // not treat its own old spot as occupied.
      const taken = [...perches.entries()]
        .filter(([other]) => other !== node)
        .map(([, spot]) => spot);

      // Cast from above the building so the real ceiling is in the list. The
      // roof is then excluded by height rather than by cutting the ray short,
      // which is what made every surface look like it had no room above it.
      const overhead = (world.bounds?.max[1] ?? from) + 1;

      const supportQuery = (x: number, z: number) =>
        player
          ? player.surfacesUnder(x, z, overhead)
          : surfacesUnderCollider(placementBvh!, x, z, overhead);
      const object = { height: size.y, radius: Math.max(size.x, size.z) * 0.5 };
      const spacing = world.placementSpacing ?? 0.25;
      let perch = null as ReturnType<typeof findPerch>;

      if (world.curatedPlacement && original) {
        const x = original[0];
        const z = original[2];
        const rest = restingHeight(supportQuery, x, z, from, object);
        if (rest && !taken.some((spot) => Math.hypot(spot.x - x, spot.z - z) < spacing)) {
          perch = { x, z, y: rest.y, raised: rest.y - rest.floor > 0.15 };
        }
      }

      perch ??= findPerch(
        supportQuery,
        spawn,
        { x: dx, z: dz },
        object,
        taken,
        // Only genuinely person-scale objects prefer the floor. The previous
        // 18% cutoff classified this gift's 36 cm spoon and plantains as floor
        // objects, even though the table is exactly where they belong.
        {
          // A roof tank is technically a broad raised surface and completely
          // wrong for a football, blanket and binoculars. Outdoor gifts can
          // say that their remembered things belong on the walkable ground;
          // size remains the conservative default for generated interiors.
          preferFloor:
            world.placementMode === "floor" || size.y > eyeHeight * 0.3,
          spacing,
        },
      );

      let restY: number;
      if (perch) {
        node.position.x = perch.x;
        node.position.z = perch.z;
        restY = perch.y;
        perches.set(node, { x: perch.x, z: perch.z });
      } else {
        // No surface would take it - rest it on the floor where it stands.
        const seat = seatOnFloor(
          (x, z) =>
            player
              ? player.floorUnder(x, z, from)
              : floorUnderCollider(placementBvh!, x, z, from),
          { x: original?.[0] ?? node.position.x, z: original?.[2] ?? node.position.z },
          spawn,
        );
        if (!seat) return;
        node.position.x = seat.x;
        node.position.z = seat.z;
        restY = seat.y;
        perches.set(node, { x: seat.x, z: seat.z });
      }

      const box = new THREE.Box3().setFromObject(node);
      if (box.isEmpty()) return;
      node.position.y += restY - box.min.y;

      castContactShadow(node, restY);
    }

    /** Lay (or move) the disc that makes an object look like it is touching. */
    function castContactShadow(node: THREE.Object3D, floorY: number) {
      if (!shadowTexture) return;

      const box = new THREE.Box3().setFromObject(node);
      if (box.isEmpty()) return;

      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      // A little wider than the object's footprint, which is what a soft
      // shadow does, and keeps a thin object like the spoon from getting a
      // shadow too small to read.
      const width = Math.max(size.x, size.z * 0.35) * 1.9;
      const depth = Math.max(size.z, size.x * 0.35) * 1.9;

      let shadow = shadows.get(node);
      if (!shadow) {
        shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            map: shadowTexture,
            transparent: true,
            // Never occlude what it sits under, and never write depth - it is
            // a mark on the floor, not a thing in the room.
            depthWrite: false,
          }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.renderOrder = ORDER.shadow;
        scene.add(shadow);
        shadows.set(node, shadow);
      }

      shadow.scale.set(width, depth, 1);
      // Just clear of the floor, or it fights the collider's depth and flickers.
      shadow.position.set(centre.x, floorY + 0.005, centre.z);
    }

    /** Build a splat from bytes and put it in the scene, replacing any previous one. */
    function install(bytes: Uint8Array, url: string) {
      const next = new SplatMesh({
        fileBytes: bytes,
        // Required: there are no filenames here to infer a format from.
        fileType: url.toLowerCase().endsWith(".ply")
          ? SplatFileType.PLY
          : SplatFileType.SPZ,
      });
      // Marble exports both assets Y-down and +Z-forward. The collider is
      // flipped separately when its manifest opts into that correction; both
      // must receive the same transform or the camera and physics disagree.
      next.quaternion.set(1, 0, 0, 0);
      next.renderOrder = ORDER.splat;
      scene.add(next);

      const previous = splat;
      splat = next;
      return { next, previous };
    }

    void (async () => {
      try {
        // Collision verification does not need a gaussian draw. Software
        // Chrome can spend tens of seconds inside one splat frame, hiding the
        // physics numbers this mode exists to measure.
        if (debug === "nosplat") {
          setStatus("ready");
          loadCollider();
          await loadGiftObjects();
          return;
        }

        for (const [index, url] of ladder.entries()) {
          const upgrade = index > 0;
          // Announce the active rung before a byte arrives. Blob serves these
          // brotli-encoded and chunked, so there is often no Content-Length;
          // the rung still gives honest progress when a percentage cannot.
          if (upgrade) {
            setEnhancement({ step: index + 1, total: ladder.length, percent: null });
          }
          const bytes = await fetchWorldAsset(url, abort.signal, (fraction) => {
            if (disposed) return;
            // The first load owns the progress line; an upgrade happens behind
            // a world the visitor is already standing in and must not reopen
            // the overlay.
            if (!upgrade) setProgress(Math.round(fraction * 100));
            else {
              setEnhancement({
                step: index + 1,
                total: ladder.length,
                percent: Math.round(fraction * 100),
              });
            }
          });
          if (disposed) return;

          const { next, previous } = install(bytes, url);
          await next.initialized;
          if (disposed) return;

          // Only drop the old one once the new one is ready to draw, so the
          // room never blinks out mid-swap.
          if (previous) {
            scene.remove(previous);
            previous.dispose?.();
          }

          loadedUrl = url;
          setStatus("ready");
          if (upgrade && index === ladder.length - 1) setEnhancement(null);

          // The room is visibly soft from this first usable frame onward.
          // Object downloads run before the next splat rung so the keepsakes
          // are not starved; the quality notice must cover that interval too,
          // rather than appearing minutes after the visitor noticed the blur.
          if (!upgrade && ladder.length > 1) {
            setEnhancement({ step: 1, total: ladder.length, percent: null });
          }

          // Only once the room is actually on screen. Starting these at mount
          // put six multi-megabyte downloads in flight at once - the splat,
          // the collider and four objects - against the six connections a
          // browser allows a single host, and the splat is the one that
          // cannot fail. See loadGiftObjects.
          //
          // The objects are *awaited*, before any sharper splat is fetched.
          // The upgrade is 23 MB in this gift against 10 MB of objects, so
          // running them together starves the things the gift is actually
          // about: the room read "objects 0/4" for minutes while a cosmetic
          // upgrade had the connection. A slightly soft room containing the
          // frying pan beats a crisp empty one.
          if (!upgrade) {
            loadCollider();
            await loadGiftObjects();
            if (disposed) return;
          }
        }
      } catch (err) {
        if (disposed || abort.signal.aborted) return;
        // A failed upgrade is not a failed world: the first level is already
        // on screen and worth keeping.
        if (splat) {
          setEnhancement(null);
          return;
        }
        setStatus("error");
        setMessage(err instanceof Error ? err.message : String(err));
      }
    })();

    // The occlusion trick: draw Marble's mesh export invisibly but into the
    // depth buffer, so Tripo objects placed in the world are correctly hidden
    // behind its geometry instead of floating on top of the splats.
    //
    // Draw order is what makes this work. Three renders the opaque queue
    // before the transparent one, so an opaque occluder writes depth *before*
    // the splats and then rejects them: it reconstructs the very surfaces the
    // splats depict, lands fractionally in front, and the ceiling and upper
    // walls come out solid black. A polygon-offset bias only moves that
    // problem around, because the error is not a constant.
    //
    // Marking the occluder `transparent` is not about opacity - it puts it in
    // the same queue as the splats, where renderOrder can place it after them:
    //
    //   splats (0) -> occluder (1, depth only) -> objects (2)
    function loadCollider() {
      if (!world.colliderUrl || noCollider) return;
      new GLTFLoader().load(
        world.colliderUrl,
        (gltf) => {
        if (disposed) return;
        if (world.colliderTransform === "flip-x") {
          alignMarbleCollider(gltf.scene);
        }
        gltf.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.material = debugCollider
              ? new THREE.MeshBasicMaterial({
                  color: 0x00ff88,
                  wireframe: true,
                  transparent: true,
                  opacity: 0.4,
                })
              : new THREE.MeshBasicMaterial({
                  colorWrite: false,
                  depthWrite: true,
                  transparent: true,
                });
            mesh.renderOrder = ORDER.occluder;
          }
        });
        gltf.scene.name = "collider";
        scene.add(gltf.scene);

        // The same mesh, used a third way: collision. One asset for visuals'
        // depth, physics, and walking.
        const collision = mergeSceneGeometry(gltf.scene);
        let measuredEye = null as number | null;
        if (collision && player) {
          player.setCollider(collision);
          placementSpawn.copy(player.supportedSpawn);
          measuredEye = player.measuredEyeHeight;
        } else if (collision) {
          placementBvh = new MeshBVH(collision);
          const supported = findSupportedSpawn(placementBvh, placementSpawn, {
            minY: boundsMin[1],
            maxY: boundsMax[1],
          });
          if (supported) {
            placementSpawn.set(supported.x, supported.y, supported.z);
            measuredEye = supported.eyeHeight;
          }
        }
        setGround(true);

        // Now the real floor is knowable, so correct how big a person is -
        // and therefore how big everything made relative to one should be.
        const realEye = measuredEye;
        if (realEye) {
          const ratio = realEye / eyeHeight;
          // Only act on a believable correction. A ray through a gap in the
          // mesh should not shrink the room's contents to nothing.
          if (realEye > 0.05 && ratio > 0.2 && ratio < 5 && Math.abs(ratio - 1) > 0.05) {
            sizeCorrection = ratio;
            for (const node of placed) {
              const spec = node.userData.giftObject as { scale?: number } | undefined;
              node.scale.setScalar((spec?.scale ?? 1) * ratio);
            }
          }
        }

        // Objects that arrived before the collider were placed on the
        // bounding box's floor, which is not the floor. Now there is a real
        // surface to sit on, they are re-seated on it.
        for (const node of placed) seatObject(node);
        },
        (event: ProgressEvent) => {
          if (disposed || !event.lengthComputable || !event.total) return;
          setGroundProgress(Math.round((event.loaded / event.total) * 100));
        },
        () => {
          // Without this the note said "adding detail…" for the rest of the
          // session because setGround only ever ran on success. The guided
          // room still opens on bounding-box support, so this is a quieter
          // world, not a broken one.
          if (disposed) return;
          console.warn("Lantern: the collider did not load; using bounding-box support.");
          setGroundProgress(null);
          setGround(true);
        },
      );
    }

    /**
     * The remembered things - Tripo's meshes - one at a time.
     *
     * These used to start the instant the viewer mounted, which put the splat,
     * the collider and every object in flight together: for one four-object
     * gift that is 15 MB across six requests, against the six connections a
     * browser will open to a single host. The splat is the only asset with no
     * fallback, so it is the one that must not be competed with.
     *
     * Sequential, because nothing waits on these - an object that arrives late
     * simply appears in the room - and because a queue of one keeps a slow
     * connection moving instead of stalling six transfers at once.
     */
    async function loadGiftObjects() {
      const gltfLoader = new GLTFLoader();
      objectsWanted = (world.objects ?? []).length;

      for (const obj of world.objects ?? []) {
        if (disposed) return;

        let gltf: GLTF;
        try {
          gltf = await gltfLoader.loadAsync(obj.modelUrl);
        } catch (err) {
          // One missing thing is not a broken gift, so this does not touch the
          // world's status. It is logged rather than swallowed: a silent
          // failure here is indistinguishable from an object that was never
          // generated, and that ambiguity cost a day.
          console.warn(`Lantern: could not load "${obj.caption ?? obj.modelUrl}"`, err);
          continue;
        }
        if (disposed) return;

        gltf.scene.position.fromArray(obj.position);
        gltf.scene.scale.setScalar((obj.scale ?? 1) * sizeCorrection);
        // Rotation is not set here: seatObject derives it, and needs the
        // final position to do so.
        // Join the same queue as the splats and the occluder, drawn after
        // both, so the occluder's depth is already laid down to test against.
        gltf.scene.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) {
            material.transparent = true;
            material.depthWrite = true;
          }
          mesh.renderOrder = ORDER.gift;
        });
        gltf.scene.userData.giftObject = obj;
        scene.add(gltf.scene);
        placed.push(gltf.scene);
        seatObject(gltf.scene);
        objectsIn++;

        // Anything Tripo rigged and animated arrives with its clips inside
        // the GLB, so the viewer does not need to be told which objects are
        // alive - it just plays whatever it is handed.
        if (gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(gltf.scene);
          mixer.clipAction(gltf.animations[0]).play();
          mixers.push(mixer);
        }

        if (obj.audioUrl) {
          const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
          attachVoice(gltf.scene, obj.audioUrl, Math.max(size.x, size.z) * 0.5);
        }
      }
    }

    /**
     * Browsers keep audio muted until the person does something.
     *
     * Walking into a room is not a gesture as far as a browser is concerned,
     * so the first real touch or click anywhere unlocks it - the click that
     * grabs pointer lock, or the first thumb on the joystick. Without this a
     * voice note plays silently and nobody ever knows it was there.
     */
    const unlockAudio = () => {
      // three's own typing for this is looser than the real thing.
      const context = listener.context as unknown as globalThis.AudioContext;
      if (context.state === "suspended") void context.resume();
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    /** One per animated object, stepped every frame. */
    const mixers: THREE.AnimationMixer[] = [];

    // Reused each frame rather than allocated sixty times a second.
    const listenerAt = new THREE.Vector3();
    const voiceAt = new THREE.Vector3();

    let lastFrame = performance.now();
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const deltaMs = now - lastFrame;
      lastFrame = now;

      controls?.update();
      player?.update(deltaMs);

      // Seconds, and clamped: a backgrounded tab hands back a delta of
      // minutes, which would otherwise fast-forward every clip on return.
      if (mixers.length) {
        const step = Math.min(deltaMs, 100) / 1000;
        for (const mixer of mixers) mixer.update(step);
      }

      // Voice notes belong spatially to the thing they are about. The distance
      // model does the fading; this only decides when to start, and the
      // cooldown stops a note immediately restarting.
      if (voices.length) {
        camera.getWorldPosition(listenerAt);
        for (const sound of voices) {
          if (sound.isPlaying || !sound.parent) continue;
          sound.parent.getWorldPosition(voiceAt);
          if (listenerAt.distanceTo(voiceAt) > sound.getRefDistance() * 3) continue;

          const last = (sound.userData.lastPlayed as number | undefined) ?? -Infinity;
          if (now - last < VOICE_COOLDOWN_MS) continue;
          sound.userData.lastPlayed = now;
          sound.play();
        }
      }

      renderer.render(scene, camera);

      if (player && showHud && hudRef.current) {
        const p = player.debugPosition;
        const dir = camera.getWorldDirection(new THREE.Vector3());
        hudRef.current.textContent =
          `pos ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}  ` +
          `dir ${dir.x.toFixed(2)} ${dir.y.toFixed(2)} ${dir.z.toFixed(2)}  ` +
          `${player.grounded ? "grounded" : "falling"} on ${player.groundKind}  ` +
          `splats ${!splat ? "none" : splat.isInitialized ? "init" : "pending"} ` +
          // Which level is actually on screen right now, which changes as the
          // ladder climbs.
          `${(loadedUrl ?? ladder[0]).split("/").pop()}  ` +
          `objects ${objectsIn}/${objectsWanted}`;
      }
    });

    return () => {
      disposed = true;
      abort.abort();
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      for (const sound of voices) {
        if (sound.isPlaying) sound.stop();
      }
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      controls?.dispose();
      player?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // Keyed on what the scene is actually built from, not on the object.
    //
    // `world` is deserialised fresh by every server render, so its identity
    // changes on each router.refresh() - and refresh is called the moment a
    // sender finishes their voice notes. The effect tore down the renderer and
    // re-fetched the entire level-of-detail ladder, up to 23 MB, dropping them
    // back to "opening… 0%" in a room they were already standing in.
  }, [
    world.id,
    world.splatUrl,
    world.colliderUrl,
    world.navigationMode,
    world.viewYawDegrees,
    world.viewPitchDegrees,
  ]);

  return (
    <div className="relative h-full w-full">
      {/* touch-action none: the browser must not claim the gesture for
          scrolling or pull-to-refresh while someone explores. */}
      <div ref={mountRef} className="h-full w-full touch-none" />
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="text-sm tracking-wide text-white/70">
            {progress === null ? "opening…" : `opening… ${progress}%`}
          </p>
        </div>
      )}

      {/* A recipient was shown the raw exception - "could not open this world
          - Failed to fetch". That is a sentence for me, not for someone who
          was sent a gift, and it left them with nothing to do about it.
          Reloading genuinely does fix this, so it is offered as a button
          rather than assumed knowledge. */}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-base text-white/80">This gift didn&rsquo;t open.</p>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              It is usually the connection, not the gift. Try again — nothing is lost.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-8 rounded-full border border-white/20 px-6 py-2.5 text-xs tracking-[0.15em] text-white/80 uppercase transition hover:border-white/50 hover:text-white"
            >
              try again
            </button>
            <p className="mt-6 font-mono text-[10px] text-white/55">{message}</p>
          </div>
        </div>
      )}

      {/* Pointer lock needs a real click to start, so the invitation has to be
          part of the page rather than something that just happens. */}
      {status === "ready" && interactive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 grid place-items-center">
          <p className="rounded-full bg-black/40 px-4 py-2 text-xs tracking-wide text-white/70 backdrop-blur-sm">
            {canWalk
              ? touch
                ? "left thumb to walk · right thumb to look"
                : "click to look around · WASD to walk"
              : touch
                ? "drag to look around · capture-safe view"
                : "click to look around · capture-safe viewpoint"}
          </p>
        </div>
      )}

      {/* The visible room opens before the real collider. It still matters for
          object support and depth occlusion, but is not worth blocking on. */}
      {status === "ready" && interactive && !ground && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 grid place-items-center">
          <p className="text-[11px] tracking-wide text-white/55">
            {groundProgress === null
              ? "adding detail…"
              : `adding detail… ${groundProgress}%`}
          </p>
        </div>
      )}

      {/* The first rung can look glassy for minutes on a slow connection. This
          needs to read against bright windows as well as dark rooms, and it
          must start before object downloads—not only once the next rung does. */}
      {status === "ready" && enhancement ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute right-4 top-4 w-[min(280px,calc(100%-2rem))] rounded-2xl border border-white/15 bg-black/65 px-4 py-3 text-white shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ead5b7]" />
            <p className="text-xs tracking-[0.08em] text-white/90">enhancing this room</p>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4 text-[10px] tracking-wide text-white/55">
            <span>
              detail {enhancement.step} of {enhancement.total}
            </span>
            <span>
              {enhancement.percent !== null && enhancement.percent > 0
                ? `${enhancement.percent}%`
                : "keep exploring"}
            </span>
          </div>
          <div className="mt-2 h-px overflow-hidden bg-white/15">
            <div
              aria-hidden
              className={`h-full bg-[#ead5b7] transition-[width] duration-300 ${
                enhancement.percent === null ? "animate-pulse" : ""
              }`}
              style={{
                width:
                  enhancement.percent !== null
                    ? `${Math.max(enhancement.percent, 3)}%`
                    : "34%",
              }}
            />
          </div>
        </div>
      ) : null}

      <p
        ref={hudRef}
        className="pointer-events-none absolute left-3 top-3 font-mono text-xs text-emerald-300/80"
      />

      {/* Follows the thumb rather than sitting in a fixed corner, so it never
          has to be aimed for. Hidden until a finger is down. */}
      <div
        ref={stickRef}
        className="pointer-events-none absolute hidden h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-white/5"
      >
        <div
          ref={thumbRef}
          className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/25"
        />
      </div>
    </div>
  );
}
