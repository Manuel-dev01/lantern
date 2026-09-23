"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SparkRenderer, SplatMesh, SplatFileType } from "@sparkjsdev/spark";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { World } from "@/lib/types";
import {
  FirstPersonController,
  isTouchDevice,
  mergeSceneGeometry,
} from "@/lib/firstPerson";

type Status = "loading" | "ready" | "error";

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

export default function WorldViewer({ world }: { world: World }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLParagraphElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [walkable, setWalkable] = useState(false);
  const [touch, setTouch] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
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
    const eyeHeight = Math.max((boundsMax[1] - floorY) * 0.65, 1e-3);

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
      setWalkable(true);
      setTouch(isTouchDevice());
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
    const isPly = world.splatUrl.toLowerCase().endsWith(".ply");
    const abort = new AbortController();
    let splat: SplatMesh | null = null;

    void (async () => {
      try {
        const bytes = await fetchWithProgress(world.splatUrl, abort.signal, (fraction) => {
          if (!disposed) setProgress(Math.round(fraction * 100));
        });
        if (disposed) return;

        splat = new SplatMesh({
          fileBytes: bytes,
          // Required: there is no filename to infer the format from.
          fileType: isPly ? SplatFileType.PLY : SplatFileType.SPZ,
        });
        // Marble splats arrive Y-down relative to three's convention; the
        // collider mesh does not. This flip is what aligns the two.
        splat.quaternion.set(1, 0, 0, 0);
        splat.renderOrder = ORDER.splat;
        scene.add(splat);

        await splat.initialized;
        if (!disposed) setStatus("ready");
      } catch (err) {
        if (disposed || abort.signal.aborted) return;
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
    if (world.colliderUrl && !noCollider) {
      new GLTFLoader().load(world.colliderUrl, (gltf) => {
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
      });
    }

    // Tripo-generated gift objects.
    const gltfLoader = new GLTFLoader();
    for (const obj of world.objects ?? []) {
      gltfLoader.load(obj.modelUrl, (gltf) => {
        if (disposed) return;
        gltf.scene.position.fromArray(obj.position);
        gltf.scene.rotation.y = obj.rotationY ?? 0;
        const s = obj.scale ?? 1;
        gltf.scene.scale.setScalar(s);
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
      });
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
          `${player.grounded ? "grounded" : "falling"}  ` +
          `splats ${!splat ? "none" : splat.isInitialized ? "init" : "pending"}`;
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
