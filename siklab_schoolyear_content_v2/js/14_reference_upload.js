// Shared validation for PDF and PowerPoint references used by both games.
async function siklabReferenceBase64(file, source) {
    if (!file) throw new Error(`Choose a ${source === 'pptx' ? 'PowerPoint (.pptx)' : 'PDF'} file first.`);
    if (file.size > 5 * 1024 * 1024) throw new Error('Choose a file no larger than 5 MB.');
    if (source === 'pptx' && /\.ppt$/i.test(file.name)) {
        throw new Error('Old .ppt files are not supported. In PowerPoint, use Save As → .pptx, then upload again.');
    }
    const expectedExt = source === 'pptx' ? /\.pptx$/i : /\.pdf$/i;
    if (!expectedExt.test(file.name)) throw new Error(`Choose a ${source === 'pptx' ? '.pptx PowerPoint' : '.pdf'} file.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid = source === 'pptx'
        ? bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
        : String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
    if (!valid) throw new Error(`This file is not a valid ${source === 'pptx' ? 'PowerPoint (.pptx)' : 'PDF'}.`);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}
