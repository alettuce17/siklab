/* =========================================================
 * SIKLAB SHARED CLIENT-SIDE OUTPUT SECURITY
 * ========================================================= */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function escapeAttr(value) { return escapeHtml(value); }
function safeInteger(value, fallback = 0) {
    const n = Number.parseInt(value, 10);
    return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}
function safeThemeColor(value, fallback = 'blue') {
    const allowed = new Set(['blue','emerald','orange','purple','red','yellow','green','sky','slate']);
    const normalized = String(value || '');
    return allowed.has(normalized) ? normalized : fallback;
}
function sanitizeRichHtml(inputHtml) {
    const template = document.createElement('template');
    template.innerHTML = String(inputHtml ?? '');

    const allowedTags = new Set(['P','BR','STRONG','B','EM','I','U','H3','H4','UL','OL','LI','DIV','SPAN','IMG']);
    const blockedTags = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','TEMPLATE','LINK','META']);
    const allowedImageStyles = new Set(['width','min-width','max-width','height','display','margin','border-radius','box-shadow','float']);

    const isSafeImageSrc = (src) => {
        const value = String(src || '').trim();
        // Keep lesson JSON small: images must be URLs (prefer Supabase Storage), not base64 data URIs.
        if (/^data:/i.test(value)) return false;
        if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) return true;
        try {
            const parsed = new URL(value, window.location.origin);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch (_) { return false; }
    };

    function sanitizeElement(el) {
        [...el.children].forEach(child => sanitizeElement(child));
        if (blockedTags.has(el.tagName)) { el.remove(); return; }
        if (!allowedTags.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }

        const src = el.getAttribute('src');
        const alt = el.getAttribute('alt');
        const style = el.getAttribute('style');
        const processed = el.getAttribute('data-processed');
        [...el.attributes].forEach(attr => el.removeAttribute(attr.name));

        if (el.tagName === 'IMG') {
            if (!isSafeImageSrc(src)) { el.remove(); return; }
            el.setAttribute('src', src);
            if (alt) el.setAttribute('alt', alt.slice(0, 200));
            if (processed === 'true') el.setAttribute('data-processed', 'true');

            if (style) {
                const safeStyle = [];
                style.split(';').forEach(rule => {
                    const splitAt = rule.indexOf(':');
                    if (splitAt === -1) return;
                    const property = rule.slice(0, splitAt).trim().toLowerCase();
                    const value = rule.slice(splitAt + 1).trim();
                    if (!allowedImageStyles.has(property)) return;
                    if (/url\s*\(|expression\s*\(|javascript:/i.test(value)) return;
                    safeStyle.push(`${property}: ${value}`);
                });
                if (safeStyle.length) el.setAttribute('style', safeStyle.join('; '));
            }
        }
    }

    [...template.content.children].forEach(el => sanitizeElement(el));
    return template.innerHTML;
}
