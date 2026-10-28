import * as THREE from 'three';
export type ScannedSurface = 'asphalt_02' | 'japanese_cedar_planks' | 'japanese_stone_wall' | 'grey_plaster_03' | 'beige_wall_001' | 'grey_roof_tiles_02' | 'forest_ground_04' | 'concrete_pavement_03';
const sets = new Map<string, {map:THREE.Texture;normalMap:THREE.Texture;roughnessMap:THREE.Texture;metalnessMap:THREE.Texture;aoMap:THREE.Texture}>();
const pending = new Map<string, Promise<void>>();
/** Shared 2K scan maps. Color is sRGB; normals and packed AO/roughness/metalness remain linear data. */
export function scannedSurface(id: ScannedSurface, repeat = 1) {
  const key = `${id}:${repeat}`, cached = sets.get(key); if (cached) return cached;
  const loader = new THREE.TextureLoader();
  const load = (file: string, color = false) => {
    let loaded!: () => void, failed!: (error: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => { loaded = resolve; failed = reject; });
    // A cached failure is still reported to readiness callers; consume it here
    // too because callers can request readiness after the image has failed.
    void ready.catch(() => {});
    pending.set(`${key}:${file}`, ready);
    const texture = loader.load(`${import.meta.env.BASE_URL}assets/materials/${id}/${file}.jpg`,
      image => { image.userData.sourceLoadState = 'detailed'; loaded(); }, undefined,
      error => { texture.userData.sourceLoadState = 'failed'; failed(error); });
    texture.userData.sourceLoadState = 'loading';
    texture.name = `Poly Haven ${id} ${file}`;
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(repeat, repeat); texture.anisotropy = 8;
    return texture;
  };
  const map = load('color', true), normalMap = load('normal'), arm = load('arm');
  const result = { map, normalMap, roughnessMap: arm, metalnessMap: arm, aoMap: arm };
  sets.set(key, result); return result;
}

/** Snapshot all scan requests already started by the scene's material factories. */
export async function scannedSurfacesReady(): Promise<void> { await Promise.all(pending.values()); }
