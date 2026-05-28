import { supabase } from './supabase';

const TARGET_SIZE = 400;
const WEBP_QUALITY = 0.8;
const BUCKET = 'student-photos';

// Center-crop the image to a square and resize to TARGET_SIZE × TARGET_SIZE,
// then encode as WebP. Output is typically 25-40 KB regardless of source size.
export async function processStudentPhoto(file) {
  if (!file) throw new Error('No file provided');
  if (!file.type.startsWith('image/')) throw new Error('File is not an image');
  if (file.size > 15 * 1024 * 1024) throw new Error('Image is larger than 15 MB');

  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE);
  bitmap.close?.();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('Canvas encoding failed')),
      'image/webp',
      WEBP_QUALITY
    );
  });
  return blob;
}

export async function uploadStudentPhoto({ schoolId, studentId, blob }) {
  const path = `${schoolId}/${studentId}.webp`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '3600',
    });
  if (error) throw error;
  return path;
}

export async function deleteStudentPhoto(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

// Returns a public URL with a cache-busting suffix so re-uploads display immediately.
export function getStudentPhotoUrl(path, cacheKey) {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = data?.publicUrl;
  if (!url) return null;
  return cacheKey ? `${url}?v=${cacheKey}` : url;
}
