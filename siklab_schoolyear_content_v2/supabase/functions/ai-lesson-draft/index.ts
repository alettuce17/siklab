// SikLab AI lesson drafting. Deploy separately from Netlify. Gemini key stays server-side.
import { createClient } from 'npm:@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const reply = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers })
function publicKey(): string {
  const direct = Deno.env.get('SIKLAB_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
  if (direct) return direct
  const map = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')
  return map.default || Object.values(map)[0] as string || ''
}
async function verifyTeacher(req: Request) {
  const bearer = req.headers.get('authorization') || ''
  if (!/^Bearer\s+\S+$/i.test(bearer)) return null
  const db = createClient(Deno.env.get('SUPABASE_URL')!, publicKey(), {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.getUser()
  if (error || !data.user) return null
  const { data: allowed, error: accessError } = await db.rpc('is_approved_teacher')
  if (accessError || allowed !== true) return null
  return data.user.id
}
const str = (v: unknown, max = 1200) => typeof v === 'string' ? v.trim().slice(0, max) : ''

const schema = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' }, summary: { type: 'STRING' },
    sections: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      heading: { type: 'STRING' }, explanation: { type: 'STRING' }, example: { type: 'STRING' },
      image_query: { type: 'STRING' }, page: { type: 'STRING' },
    }, required: ['heading', 'explanation', 'example', 'image_query', 'page'] } },
    facts: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      question: { type: 'STRING' }, answer: { type: 'STRING' },
    }, required: ['question', 'answer'] } },
    questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } },
      correctIndex: { type: 'INTEGER' }, explanation: { type: 'STRING' }, page: { type: 'STRING' },
    }, required: ['question', 'options', 'correctIndex', 'explanation', 'page'] } },
  }, required: ['title', 'summary', 'sections', 'facts', 'questions'],
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply({ error: 'POST required.' }, 405)
  try {
    const userId = await verifyTeacher(req)
    if (!userId) return reply({ error: 'Sign in with an authorized teacher account.' }, 403)
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return reply({ error: 'GEMINI_API_KEY is not configured in Supabase Edge Function secrets.' }, 503)
    const body = await req.json()
    const source = body?.pdf_base64
    if (typeof source !== 'string' || !source || source.length > 7_200_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(source)) {
      return reply({ error: 'Provide a PDF smaller than 5 MB.' }, 400)
    }
    if (!atob(source.slice(0, 40)).startsWith('%PDF-')) return reply({ error: 'The file does not appear to be a PDF.' }, 400)
    const count = [3, 5, 10].includes(body?.question_count) ? body.question_count : 5
    const focus = str(body?.focus, 140)
    const filename = str(body?.filename, 140)
    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
    const instruction = `You are drafting, NOT publishing, a Grade 3 Science lesson for teacher verification. Use ONLY factual material found in the attached PDF. Do not invent information, add unsourced science claims, or infer page numbers when uncertain. If unclear in PDF, omit it. Prefer 3-6 short reading sections (50-100 words each); one concept per section; clear Grade 3 English; concrete examples grounded in the PDF. Suggest specific, non-identifying image search phrases, e.g. "parts of a mung bean plant diagram", not copyrighted images. Return up to 2 clickable reveal facts. Produce EXACTLY ${count} four-option multiple choice questions at the END, with one defensible correctIndex (0 through 3), varied distractors, short answer explanation, and page reference if certain. Avoid trick questions. Never include student names or personal information. Output JSON matching the provided schema. PDF file: ${filename}. Teacher focus: ${focus || 'whole document'}.`
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: instruction }, { inline_data: { mime_type: 'application/pdf', data: source } }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.25, maxOutputTokens: 10000 },
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!upstream.ok) {
      const detail = await upstream.text()
      console.error('[Gemini lesson draft]', upstream.status, detail.slice(0, 500))
      return reply({ error: upstream.status === 429 ? 'Gemini quota reached. Try later.' : 'AI service could not process this PDF. Check PDF and Gemini configuration.' }, 502)
    }
    const raw = await upstream.json()
    const text = (raw?.candidates?.[0]?.content?.parts || []).map((part: {text?: string}) => part.text || '').join('')
    if (!text) return reply({ error: 'Gemini returned no draft. Try a text-based PDF or a shorter extract.' }, 502)
    const parsed = JSON.parse(text)
    const sections = (Array.isArray(parsed.sections) ? parsed.sections : []).slice(0, 8)
      .map((v: Record<string, unknown>) => ({
        heading: str(v.heading, 140), explanation: str(v.explanation, 2000),
        example: str(v.example, 400), image_query: str(v.image_query, 100), page: str(v.page, 20),
      })).filter((v: {heading: string; explanation: string}) => v.heading && v.explanation)
    const facts = (Array.isArray(parsed.facts) ? parsed.facts : []).slice(0, 3)
      .map((v: Record<string, unknown>) => ({ question: str(v.question, 220), answer: str(v.answer, 500) }))
      .filter((v: {question: string; answer: string}) => v.question && v.answer)
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : []).slice(0, count)
      .map((v: Record<string, unknown>) => ({
        question: str(v.question, 350), options: (Array.isArray(v.options) ? v.options : []).slice(0, 4).map(o => str(o, 180)),
        correctIndex: Number(v.correctIndex), explanation: str(v.explanation, 350), page: str(v.page, 20),
      })).filter((v: {question: string; options: string[]; correctIndex: number}) =>
        v.question && v.options.length === 4 && v.options.every(Boolean) && Number.isInteger(v.correctIndex) && v.correctIndex >= 0 && v.correctIndex <= 3)
    if (!sections.length || !questions.length) return reply({ error: 'AI did not produce valid lesson sections and questions. Please retry with a clearer PDF.' }, 502)
    return reply({ draft: { title: str(parsed.title, 140), summary: str(parsed.summary, 400), sections, facts, questions } })
  } catch (error) {
    console.error('[ai-lesson-draft]', error)
    return reply({ error: 'Could not generate lesson. If PDF is scanned or large, try a shorter, clearer PDF.' }, 500)
  }
})
