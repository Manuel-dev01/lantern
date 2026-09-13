"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SparkRenderer, SplatMesh, SplatFileType } from "@sparkjsdev/spark";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { World } from "@/lib/types";

type Status = "loading" | "ready" | "error";

export default function WorldViewer({ world }: { world: World }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
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
    const debugCollider =
      new URLSearchParams(window.location.search).get("debug") === "collider";

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

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 6, 4);
    scene.add(key);

    // A Marble PLY is far heavier than the .spz samples, so the load is long
    // enough that a static string reads as a hang. Show real progress.
    const isPly = world.splatUrl.toLowerCase().endsWith(".ply");
    const splat = new SplatMesh({
      url: world.splatUrl,
      fileType: isPly ? SplatFileType.PLY : undefined,
      onProgress: (event: ProgressEvent) => {
        if (disposed || !event.lengthComputable || !event.total) return;
        setProgress(Math.round((event.loaded / event.total) * 100));
      },
    });
    // Marble/Spark splats arrive Y-down relative to three's convention.
    splat.quaternion.set(1, 0, 0, 0);
    scene.add(splat);

    splat
      .initialized.then(() => {
        if (!disposed) setStatus("ready");
      })
      .catch((err: unknown) => {
        if (disposed) return;
        setStatus("error");
        setMessage(err instanceof Error ? err.message : String(err));
      });

    // The occlusion trick: draw Marble's mesh export invisibly but into the
    // depth buffer, so Tripo objects placed in the world are correctly hidden
    // behind its geometry instead of floating on top of the splats.
    if (world.colliderUrl) {
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
                });
            mesh.renderOrder = -1;
          }
        });
        gltf.scene.name = "collider";
        scene.add(gltf.scene);
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

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [world]);

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full" />
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
    </div>
  );
}
