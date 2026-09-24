/**
 * A world is the gift. Everything a recipient sees is described here.
 *
 * Marble ships both assets with the generated world itself, no export needed:
 *   - splatUrl:    .spz gaussian splats  -> what you see
 *   - colliderUrl: GLB collider mesh     -> what you bump into, and what
 *                                           occludes the objects placed inside
 */
export interface GiftObject {
  id: string;
  /** Tripo-generated GLB, mirrored to our own storage (Tripo URLs expire ~5min). */
  modelUrl: string;
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
  /** The memory this object carries. */
  caption?: string;
  /** Spatial audio: the sender's voice, heard as you approach. */
  audioUrl?: string;
}

export interface World {
  id: string;
  /**
   * Marble splat asset, mirrored to our storage. Spark reads .spz natively.
   * Marble offers three levels of detail (100k / 500k / full_res); which one
   * this points at is chosen at generation time.
   */
  splatUrl: string;
  /**
   * Every mirrored level of detail, keyed by Marble's name for it
   * ("100k", "150k", "500k", "full_res").
   *
   * The viewer picks one at runtime: full_res is 26.8 MB, which is fine over a
   * CDN on a desktop and indefensible on a phone. `splatUrl` stays as the
   * default for anything that does not choose.
   */
  splatLods?: Record<string, string>;
  /**
   * Marble's collider mesh (GLB), mirrored to our storage. Never rendered
   * visibly - used for collision and for the depth-only occlusion pass.
   */
  colliderUrl?: string;
  /** Where the camera starts, in world units. Derived from the collider bounds. */
  spawn?: [number, number, number];
  /** What the camera initially looks at. */
  target?: [number, number, number];
  /**
   * The collider's bounding box, in world units.
   *
   * Marble worlds are not centred on the origin and are not in metres - the
   * first generated room measured 2.63 x 1.47 x 3.57 - so nothing about the
   * camera, gravity or walk speed can be hardcoded. Read from the collider GLB
   * at generation time.
   */
  bounds?: { min: [number, number, number]; max: [number, number, number] };
  objects?: GiftObject[];
  fromName?: string;
  toName?: string;
  /** Marble's own description of the world. Useful for gallery cards and alt text. */
  caption?: string;
  /** Mirrored preview image, for share cards and the constellation gallery. */
  thumbnailUrl?: string;
}
