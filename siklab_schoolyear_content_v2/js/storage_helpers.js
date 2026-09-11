/* =========================================================
 * SIKLAB SUPABASE STORAGE HELPERS
 * ========================================================= */
const SIKLAB_ALLOWED_IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif']);
const SIKLAB_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function siklabImageExtension(file) {
    return ({
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif'
    })[file?.type] || 'jpg';
}
function validateSikLabImage(file) {
    if (!file) throw new Error('Choose an image first.');
    if (!SIKLAB_ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error('Use JPG, PNG, WEBP, or GIF images only.');
    if (file.size > SIKLAB_MAX_IMAGE_BYTES) throw new Error('Image is too large. Maximum size is 5 MB.');
}
async function uploadSikLabImage(bucket, file, folder = 'uploads') {
    validateSikLabImage(file);
    const db = requireSupabase();
    const ext = siklabImageExtension(file);
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const safeFolder = String(folder || 'uploads').replace(/[^a-zA-Z0-9/_-]/g, '-');
    const path = `${safeFolder}/${id}.${ext}`;

    const { error } = await db.storage.from(bucket).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
    });
    if (error) throw error;

    const { data } = db.storage.from(bucket).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('Could not create public image URL.');
    return { bucket, path, publicUrl: data.publicUrl };
}
function getStoragePathFromPublicUrl(url, bucket) {
    if (!url) return null;
    try {
        const parsed = new URL(url, window.location.origin);
        const marker = `/storage/v1/object/public/${bucket}/`;
        const index = parsed.pathname.indexOf(marker);
        if (index === -1) return null;
        return decodeURIComponent(parsed.pathname.slice(index + marker.length));
    } catch (_) { return null; }
}
async function deleteSikLabStorageUrl(bucket, url) {
    const path = getStoragePathFromPublicUrl(url, bucket);
    if (!path) return false;
    const db = requireSupabase();
    const { error } = await db.storage.from(bucket).remove([path]);
    if (error) { console.warn(`[storage delete ${bucket}]`, error); return false; }
    return true;
}
async function compressSikLabImage(file, maxWidth = 1200, quality = 0.82) {
    validateSikLabImage(file);
    if (file.type === 'image/gif') return file;

    const imageUrl = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = imageUrl;
        });

        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const blob = await new Promise(resolve => canvas.toBlob(resolve, outputType, quality));
        if (!blob) throw new Error('Image compression failed.');

        return new File(
            [blob],
            file.name.replace(/\.[^.]+$/, '') + (outputType === 'image/png' ? '.png' : '.jpg'),
            { type: outputType }
        );
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
}
