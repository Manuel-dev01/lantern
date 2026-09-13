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
   * Marble's collider mesh (GLB), mirrored to our storage. Never rendered
   * visibly - used for collision and for the depth-only occlusion pass.
   */
  colliderUrl?: string;
  spawn?: [number, number, number];
  objects?: GiftObject[];
  fromName?: string;
  toName?: string;
  /** Marble's own description of the world. Useful for gallery cards and alt text. */
  caption?: string;
  /** Mirrored preview image, for share cards and the constellation gallery. */
  thumbnailUrl?: string;
}
