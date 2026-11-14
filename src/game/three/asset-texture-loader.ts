import * as THREE from 'three';

/** TextureLoader semantics, with image bytes sharing the scene's progress/retry/download queue. */
export class ManagedTextureLoader extends THREE.TextureLoader {
  override load(url: string, onLoad?: (texture: THREE.Texture<HTMLImageElement>) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): THREE.Texture<HTMLImageElement> {
    const texture = new THREE.Texture<HTMLImageElement>(), resolved = this.manager.resolveURL(this.path + url);
    this.manager.itemStart(resolved);
    void (async () => {
      let blobUrl: string | undefined;
      try {
        const response = await fetch(resolved, { headers: this.requestHeader, credentials: this.withCredentials ? 'include' : 'same-origin' });
        if (!response.ok) throw new Error(`Texture download failed (${response.status}): ${resolved}`);
        const blob = await response.blob();
        onProgress?.(new ProgressEvent('progress', { loaded: blob.size, total: blob.size, lengthComputable: true }));
        blobUrl = URL.createObjectURL(blob);
        const image = new Image(); image.decoding = 'async';
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`Texture could not be decoded: ${resolved}`)); image.src = blobUrl!; });
        texture.image = image; texture.needsUpdate = true; onLoad?.(texture);
      } catch (error) { this.manager.itemError(resolved); onError?.(error); }
      finally { if (blobUrl) URL.revokeObjectURL(blobUrl); this.manager.itemEnd(resolved); }
    })();
    return texture;
  }
}
