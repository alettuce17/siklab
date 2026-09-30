// Run: node --experimental-strip-types tests/test_pptx_reference.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { extractPptxSlides } from '../supabase/functions/ai-game-questions/pptx_extract.ts';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const zip = new JSZip();
zip.file('ppt/presentation.xml', '<p:presentation/>');
zip.file('ppt/slides/slide2.xml', '<p:sld><a:t>Roots &amp; stems</a:t></p:sld>');
zip.file('ppt/slides/slide1.xml', '<p:sld><a:t>Parts of a Plant</a:t><a:t>Leaves &lt;green&gt;</a:t></p:sld>');
const bytes = await zip.generateAsync({ type: 'uint8array' });
const text = await extractPptxSlides(bytes, JSZip);
assert.equal(text, 'Slide 1: Parts of a Plant Leaves <green>\nSlide 2: Roots & stems');

zip.file('ppt/presentation.xml', '<p:presentation><p:sldId r:id="rId2"/><p:sldId r:id="rId1"/></p:presentation>');
zip.file('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Target="slides/slide1.xml" Id="rId1"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>');
const reordered = await zip.generateAsync({ type: 'uint8array' });
assert.equal(await extractPptxSlides(reordered, JSZip), 'Slide 1: Roots & stems\nSlide 2: Parts of a Plant Leaves <green>');

const empty = new JSZip();
empty.file('ppt/presentation.xml', '<p:presentation/>');
empty.file('ppt/slides/slide1.xml', '<p:sld/>');
await assert.rejects(extractPptxSlides(await empty.generateAsync({ type: 'uint8array' }), JSZip), /No readable slide text/);
await assert.rejects(extractPptxSlides(new Uint8Array([1, 2, 3, 4]), JSZip), /Invalid PowerPoint/);

const client = readFileSync(join(import.meta.dirname, '..', 'js/14_reference_upload.js'), 'utf8');
const context = vm.createContext({ Uint8Array, btoa });
vm.runInContext(`${client}\nthis.encode = siklabReferenceBase64`, context);
const fakeFile = (name, data) => {
    const bytes = typeof data === 'string' ? Buffer.from(data) : data;
    return { name, size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer };
};
assert.equal(await context.encode(fakeFile('lesson.pptx', bytes), 'pptx'), Buffer.from(bytes).toString('base64'));
await assert.rejects(context.encode(fakeFile('old.ppt', bytes), 'pptx'), /Save As/);
await assert.rejects(context.encode(fakeFile('fake.pptx', '%PDF-'), 'pptx'), /not a valid PowerPoint/);
assert.equal(await context.encode(fakeFile('lesson.pdf', '%PDF-lesson'), 'pdf'), Buffer.from('%PDF-lesson').toString('base64'));
console.log('PowerPoint extraction and PDF upload compatibility checks passed');
