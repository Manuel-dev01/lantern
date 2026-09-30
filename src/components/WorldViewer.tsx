"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SparkRenderer, SplatMesh, SplatFileType } from "@sparkjsdev/spark";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { World } from "@/lib/types";
import {
  FirstPersonController,
  isTouchDevice,
  mergeSceneGeometry,
} from "@/lib/firstPerson";

type Status = "loading" | "ready" | "error";

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
  const [walkable] = useState(
    () => new URLSearchParams(window.location.search).get("mode") !== "orbit",
  );
  const [touch] = useState(isTouchDevice);
  // The collider is by far the heaviest asset and gates walking entirely,
  // so its arrival is worth its own state and its own progress number.
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
  /** Percentage of the sharper level, once the room is already visible. */
  const [upgrading, setUpgrading] = useState<number | null>(null);
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
    // only mode that works in a headless capture. Walking is the real one.
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
    const ORDER = { splat: 0, occluder: 1, gift: 2 };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);

    const camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / mount.clientHeight,
      0.01,
      1000,
    );
    camera.position.fromArray(world.spawn ?? [0, 1.6, 3]);

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
    const floorY = boundsMin[1];
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

    if (orbitMode) {
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
      });
      player.autoWalk = autoWalk;
      player.setJoystickElements(stickRef.current, thumbRef.current);
      // Stand on the bounding box straight away. The real collider is several
      // megabytes and would otherwise leave the player frozen until it lands.
      if (world.bounds) player.setProvisionalBounds(world.bounds.min, world.bounds.max);
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
    function restOnFloor(node: THREE.Object3D) {
      // Cast down from the spawn, not from above the building. A downward ray
      // keeps the first surface it meets, so starting overhead finds the roof
      // and rests the object on top of it - loaded, counted 4/4, and
      // completely invisible. The spawn is where the capture camera stood:
      // indoors, below the ceiling, above the floor.
      const groundY = player?.groundHeightAt(
        node.position.x,
        node.position.z,
        world.spawn?.[1] ?? 0,
      );
      if (groundY == null) return;

      const box = new THREE.Box3().setFromObject(node);
      if (box.isEmpty()) return;
      node.position.y += groundY - box.min.y;
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
      // Marble splats arrive Y-down relative to three's convention; the
      // collider mesh does not. This flip is what aligns the two.
      next.quaternion.set(1, 0, 0, 0);
      next.renderOrder = ORDER.splat;
      scene.add(next);

      const previous = splat;
      splat = next;
      return { next, previous };
    }

    void (async () => {
      try {
        for (const [index, url] of ladder.entries()) {
          const upgrade = index > 0;
          // Announce the upgrade before a byte arrives. Blob serves these
          // brotli-encoded and chunked, so there is no Content-Length and the
          // progress callback never fires - which left the room silently
          // sharpening with nothing on screen to say so.
          if (upgrade) setUpgrading(0);
          const bytes = await fetchWorldAsset(url, abort.signal, (fraction) => {
            if (disposed) return;
            // The first load owns the progress line; an upgrade happens behind
            // a world the visitor is already standing in and must not reopen
            // the overlay.
            if (!upgrade) setProgress(Math.round(fraction * 100));
            else setUpgrading(Math.round(fraction * 100));
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
          if (upgrade) setUpgrading(null);

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
          setUpgrading(null);
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
        if (collision) player?.setCollider(collision);
        setGround(true);

        // Objects that arrived before the collider were placed on the
        // bounding box's floor, which is not the floor. Now there is a real
        // surface to sit on, they are re-seated on it.
        for (const node of placed) restOnFloor(node);
        },
        (event: ProgressEvent) => {
          if (disposed || !event.lengthComputable || !event.total) return;
          setGroundProgress(Math.round((event.loaded / event.total) * 100));
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
        gltf.scene.rotation.y = obj.rotationY ?? 0;
        gltf.scene.scale.setScalar(obj.scale ?? 1);
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
        restOnFloor(gltf.scene);
        objectsIn++;
      }
    }

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    let lastFrame = performance.now();
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const deltaMs = now - lastFrame;
      lastFrame = now;

      controls?.update();
      player?.update(deltaMs);
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
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      controls?.dispose();
      player?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [world]);

  return (
    <div className="relative h-full w-full">
      {/* touch-action none: the browser must not claim the gesture for
          scrolling or pull-to-refresh while someone is walking. */}
      <div ref={mountRef} className="h-full w-full touch-none" />
      {status !== "ready" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="text-sm tracking-wide text-white/70">
            {status === "loading"
              ? progress === null
                ? "opening the world…"
                : `opening the world… ${progress}%`
              : `could not open this world — ${message}`}
          </p>
        </div>
      )}

      {/* Pointer lock needs a real click to start, so the invitation to walk
          has to be part of the page rather than something that just happens. */}
      {status === "ready" && walkable && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 grid place-items-center">
          <p className="rounded-full bg-black/40 px-4 py-2 text-xs tracking-wide text-white/70 backdrop-blur-sm">
            {touch
              ? "left thumb to walk · right thumb to look"
              : "click to look around · WASD to walk"}
          </p>
        </div>
      )}

      {/* The room is walkable from the bounding box immediately; the real
          collider only adds furniture to bump into. Worth saying, not worth
          blocking on. */}
      {status === "ready" && walkable && !ground && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 grid place-items-center">
          <p className="text-[11px] tracking-wide text-white/40">
            {groundProgress === null
              ? "adding detail…"
              : `adding detail… ${groundProgress}%`}
          </p>
        </div>
      )}

      {/* Quiet, and only while the sharper level is still coming. The room is
          already there to look at; this just explains why it keeps improving. */}
      {status === "ready" && upgrading !== null ? (
        <div className="pointer-events-none absolute inset-x-0 top-4 grid place-items-center">
          <p className="text-[11px] tracking-wide text-white/30">
            {upgrading > 0 ? `sharpening… ${upgrading}%` : "sharpening…"}
          </p>
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
