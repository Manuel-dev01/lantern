/**
 * A world is the gift. Everything a recipient sees is described here.
 *
 * Marble gives us two assets per world, and we use both:
 *   - splatUrl:    PLY gaussian splats  -> what you see
 *   - colliderUrl: GLB mesh at 100k     -> what you bump into, and what
 *                                          occludes the objects placed inside
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
  /** Marble splat export: asset_type "splats", format "ply". */
  splatUrl: string;
  /**
   * Marble mesh export: asset_type "mesh", format "glb",
   * resolution "100k", mesh_variant "vertex_colored".
   * Never rendered visibly - used for collision and depth-only occlusion.
   */
  colliderUrl?: string;
  spawn?: [number, number, number];
  objects?: GiftObject[];
  fromName?: string;
  toName?: string;
}
