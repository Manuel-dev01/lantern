"use client";

import { SplatFileType, SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * A real world behind the first screen.
 *
 * The landing page explains that Lantern builds places you can walk through.
 * Saying so over a gradient asks to be believed; saying it over an actual
 * gaussian splat of an actual generated room does not. For a 3D hackathon
 * that difference is worth the megabytes.
 *
 * Deliberately not the viewer:
 *
 *  - **No collider.** Nobody walks here, so the heaviest asset in a world -
 *    8.8 MB in this one - is never fetched. The hero costs one splat.
 *  - **No controls, no pointer events.** It is a backdrop. The camera drifts
 *    on its own, slowly, and clicks pass straight through to the text.
 *  - **One level of detail.** No ladder, no upgrade, no progress - it either
 *    arrives quietly or it never appears and the page is unchanged.
 *
 * That last part matters most: this renders *under* the designed atmosphere
 * and fades in only once decoded, so a failure, a blocked store or a slow
 * connection costs nothing. The page is complete without it.
 */
export default function HeroWorld({ splatUrl }: { splatUrl: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Someone who has asked for less motion should not be handed a drifting
    // camera, and a saver-mode connection should not spend 4.8 MB on decoration.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
      true;
    if (saveData) return;

    let disposed = false;
    const abort = new AbortController();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.01,
      1000,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // A backdrop at half opacity behind blurred light does not need retina.
    // Every extra pixel here is spent on something nobody can resolve, and on
    // a phone this is the difference between a smooth page and a hot one.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearAlpha(0);
    mount.appendChild(renderer.domElement);

    const spark = new SparkRenderer({ renderer });
    scene.add(spark);

    let splat: SplatMesh | null = null;

    void (async () => {
      try {
        // A plain GET, no Range header: a ranged cross-origin load triggers a
        // preflight, and the whole point of the rewrite is to avoid that.
        const res = await fetch(splatUrl, { signal: abort.signal });
        if (!res.ok || disposed) return;

        const bytes = new Uint8Array(await res.arrayBuffer());
        if (disposed) return;

        splat = new SplatMesh({ fileBytes: bytes, fileType: SplatFileType.SPZ });
        // Marble splats arrive Y-down relative to three's convention.
        splat.quaternion.set(1, 0, 0, 0);
        scene.add(splat);

        await splat.initialized;
        if (disposed) return;
        setVisible(true);
      } catch {
        // A hero that does not arrive is not a broken page. It is a page
        // without a hero, which is what the design already is.
      }
    })();

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    const start = performance.now();

    /**
     * Stop rendering when nobody is looking at it.
     *
     * The loop ran for ever: scrolled five sections away, or in a background
     * tab, a full WebGL context kept drawing a gaussian splat sixty times a
     * second. On a laptop that is a warm fan for nothing; on a phone it is
     * the battery.
     */
    let onScreen = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    observer.observe(mount);

    const onVisibility = () => {
      if (document.hidden) renderer.setAnimationLoop(null);
      else renderer.setAnimationLoop(frame);
    };
    document.addEventListener("visibilitychange", onVisibility);

    const frame = () => {
      if (!onScreen) return;
      // A slow arc around where the capture camera stood, so the room has
      // parallax without ever looking like it is being driven. Two minutes
      // for a full pass.
      const t = reduced ? 0 : ((performance.now() - start) / 120_000) * Math.PI * 2;
      camera.position.set(Math.sin(t) * 0.55, 0.05, Math.cos(t) * 0.55);
      camera.lookAt(0, -0.05, 0);
      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(frame);

    return () => {
      disposed = true;
      abort.abort();
      renderer.setAnimationLoop(null);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      splat?.dispose?.();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [splatUrl]);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        // Held well back: the room is atmosphere behind the designed light,
        // never competing with the sentence in front of it.
        opacity: visible ? 0.5 : 0,
        transition: "opacity 4s ease",
      }}
    />
  );
}
