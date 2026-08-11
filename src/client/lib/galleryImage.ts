/**
 * Client-side image preparation for gallery uploads.
 *
 * There is no image-resizing service in front of this app — R2 stores exactly
 * what it's given and /media/* serves it back verbatim. So a 12 MP phone photo
 * would otherwise be downloaded in full just to fill a 300px grid tile. We
 * downscale in the browser instead, before anything crosses the wire:
 *
 *   full  — max 2560px on the long edge, the version the lightbox opens
 *   thumb — max 640px, the version the grid loads
 *
 * Both go out as WebP, which is in the server's allowed-type list and is
 * typically half the bytes of the JPEG it came from. The intrinsic size of the
 * *full* variant is returned and stored, so the justified layout can reserve
 * each tile's space before a single byte of image arrives.
 *
 * Animated GIFs are the one exception: re-encoding one through a canvas keeps
 * only the first frame, so the original is uploaded untouched and only its
 * thumbnail is flattened.
 */

const FULL_MAX = 2560;
const THUMB_MAX = 640;
const FULL_QUALITY = 0.85;
const THUMB_QUALITY = 0.78;

export interface PreparedImage {
  /** The full-size upload. */
  full: File;
  /** The grid-size upload. */
  thumb: File;
  /** Intrinsic size of `full`, for the layout. */
  width: number;
  height: number;
}

/** Longest-edge-bounded size, never scaling an image up. */
function fit(width: number, height: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

function canvasToFile(canvas: HTMLCanvasElement, name: string, quality: number): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode the image.'));
          return;
        }
        resolve(new File([blob], name, { type: 'image/webp' }));
      },
      'image/webp',
      quality,
    );
  });
}

function draw(bitmap: ImageBitmap, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read the image.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

/** Strip the extension and any path noise, so uploads keep a recognisable name. */
function baseName(name: string): string {
  return (name.split(/[\\/]/).pop() ?? 'image').replace(/\.[^.]+$/, '').slice(0, 60) || 'image';
}

export async function prepareGalleryImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const name = baseName(file.name);
    const animated = file.type === 'image/gif';

    const fullSize = fit(bitmap.width, bitmap.height, FULL_MAX);
    const thumbSize = fit(bitmap.width, bitmap.height, THUMB_MAX);

    const thumb = await canvasToFile(
      draw(bitmap, thumbSize.w, thumbSize.h),
      `${name}-thumb.webp`,
      THUMB_QUALITY,
    );

    // A GIF keeps its animation only if we never re-encode it.
    const full = animated
      ? file
      : await canvasToFile(draw(bitmap, fullSize.w, fullSize.h), `${name}.webp`, FULL_QUALITY);

    return {
      full,
      thumb,
      width: animated ? bitmap.width : fullSize.w,
      height: animated ? bitmap.height : fullSize.h,
    };
  } finally {
    bitmap.close();
  }
}
