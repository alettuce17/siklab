// Extract text from PowerPoint Open XML slides. Images, charts and .ppt binaries
// are not rendered; teachers can export those decks to PDF instead.
type ZipEntry = { async(type: 'string'): Promise<string>; _data?: { uncompressedSize?: number } }
type ZipArchive = { file(path: string): ZipEntry | null; files: Record<string, ZipEntry> }
type ZipLoader = { loadAsync(bytes: Uint8Array): Promise<ZipArchive> }

function decodeXmlText(value: string): string {
  return value.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (match, numeric, named) => {
    if (numeric) {
      const code = numeric[0].toLowerCase() === 'x'
        ? Number.parseInt(numeric.slice(1), 16)
        : Number.parseInt(numeric, 10)
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code) : match
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[named.toLowerCase()] || match
  })
}

function xmlAttribute(tag: string, name: string): string {
  const escaped = name.replace(':', '\\:')
  const match = new RegExp(`(?:\\s|^)${escaped}=["']([^"']*)["']`).exec(tag)
  return match?.[1] || ''
}

export async function extractPptxSlides(bytes: Uint8Array, loader: ZipLoader): Promise<string> {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error('Invalid PowerPoint file. Upload a .pptx presentation.')
  }
  let zip: ZipArchive
  try { zip = await loader.loadAsync(bytes) }
  catch { throw new Error('Could not read the PowerPoint file. Re-save it as .pptx and try again.') }
  const presentation = zip.file('ppt/presentation.xml')
  if (!presentation) throw new Error('This file is not a PowerPoint presentation.')

  const available = Object.keys(zip.files).map(path => {
    const match = /^ppt\/slides\/slide(\d+)\.xml$/.exec(path)
    return match ? { path, number: Number(match[1]) } : null
  }).filter((value): value is { path: string; number: number } => value !== null)
    .sort((a, b) => a.number - b.number)
  let slides = available.map((slide, index) => ({ path: slide.path, number: index + 1 }))
  const rels = zip.file('ppt/_rels/presentation.xml.rels')
  if (rels) {
    const relationships = new Map<string, string>()
    const relXml = await rels.async('string')
    if (relXml.length > 250_000) throw new Error('PowerPoint slide index is too large.')
    for (const [tag] of relXml.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = xmlAttribute(tag, 'Id')
      const target = xmlAttribute(tag, 'Target').replace(/^\.\.\//, '').replace(/^\/?ppt\//, '')
      const path = `ppt/${target}`
      if (id && available.some(slide => slide.path === path)) relationships.set(id, path)
    }
    const presentationXml = await presentation.async('string')
    if (presentationXml.length > 250_000) throw new Error('PowerPoint slide index is too large.')
    const ordered = [...presentationXml.matchAll(/<p:sldId\b[^>]*>/g)]
      .map(([tag]) => relationships.get(xmlAttribute(tag, 'r:id')))
      .filter((path): path is string => Boolean(path))
    if (ordered.length === available.length) slides = ordered.map((path, index) => ({ path, number: index + 1 }))
  }
  if (!slides.length) throw new Error('No slides were found in the PowerPoint file.')
  if (slides.length > 60) throw new Error('PowerPoint has over 60 slides. Upload a shorter deck or export selected slides to PDF.')

  const lines: string[] = []
  let total = 0
  for (const slide of slides) {
    const entry = zip.file(slide.path)
    if (!entry) continue
    if ((entry._data?.uncompressedSize || 0) > 750_000) throw new Error(`Slide ${slide.number} is too large to read.`)
    const xml = await entry.async('string')
    if (xml.length > 750_000) throw new Error(`Slide ${slide.number} is too large to read.`)
    const chunks = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
      .map(match => decodeXmlText(match[1]).replace(/\s+/g, ' ').trim()).filter(Boolean)
    if (!chunks.length) continue
    const line = `Slide ${slide.number}: ${chunks.join(' ')}`
    if (total + line.length > 35_000) throw new Error('PowerPoint has too much slide text. Use a shorter deck or export selected slides to PDF.')
    lines.push(line)
    total += line.length
  }
  if (total < 10) throw new Error('No readable slide text was found. For picture-based slides, export the presentation to PDF.')
  return lines.join('\n')
}
