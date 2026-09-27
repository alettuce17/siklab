// SikLab Sense Detectives: five-button question drafts, never publishes or stores directly.
import { createClient } from 'npm:@supabase/supabase-js@2'
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { headers, status })
function publishableKey(): string {
  const direct = Deno.env.get('SIKLAB_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
  if (direct) return direct
  try {
    const map = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')
    return String(map.default || Object.values(map)[0] || '')
  } catch { return '' }
}
async function teacherClient(req: Request) {
  const bearer = req.headers.get('authorization') || ''
  if (!/^Bearer\s+\S+$/i.test(bearer)) return null
  const db = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey(), {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.getUser()
  if (error || !data.user) return null
  const { data: allowed, error: accessError } = await db.rpc('is_approved_teacher')
  return !accessError && allowed === true ? db : null
}
const str = (value: unknown, max = 250) => typeof value === 'string' ? value.trim().slice(0,max) : ''
const responseSchema = {
  type: 'OBJECT',
  properties: {
    questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      prompt: { type: 'STRING' },
      correct_ans: { type: 'INTEGER' },
      explanation: { type: 'STRING' },
      image_query: { type: 'STRING' },
      topic: { type: 'STRING' },
      source_page: { type: 'STRING' },
    }, required: ['prompt','correct_ans','explanation','image_query','topic','source_page'] } },
  }, required: ['questions'],
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply({error:'POST required.'},405)
  try {
    const db = await teacherClient(req)
    if (!db) return reply({error:'Sign in with an authorized teacher account.'},403)
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return reply({error:'Add GEMINI_API_KEY to Supabase Edge Function Secrets.'},503)
    const body = await req.json()
    const yearId = Number(body?.school_year_id)
    if (!Number.isSafeInteger(yearId) || yearId <= 0) return reply({error:'Select a valid school year.'},400)
    const count = Number(body?.question_count)
    if (![5,10,15].includes(count)) return reply({error:'Choose 5, 10 or 15 questions.'},400)
    const source = str(body?.source_type,20)
    const focus = str(body?.focus,160)
    let sourceDescription = ''
    let pdfPart: Record<string,unknown> | null = null
    let isPdf = false
    if (source === 'lesson') {
      const moduleId = Number(body?.lesson_module_id)
      if (!Number.isSafeInteger(moduleId) || moduleId <= 0) return reply({error:'Select an existing lesson.'},400)
      const {data,error} = await db.from('lesson_modules')
        .select('module_id,title,subtitle,lesson_json,school_year_id')
        .eq('module_id',moduleId).eq('school_year_id',yearId).maybeSingle()
      if (error || !data) return reply({error:'Lesson was not found in the selected school year.'},404)
      sourceDescription = `Lesson title: ${str(data.title,150)}. Subtitle: ${str(data.subtitle,200)}. Teacher-selected lesson JSON:\n${JSON.stringify(data.lesson_json || {}).slice(0,30000)}`
    } else if (source === 'pdf') {
      const base64 = body?.pdf_base64
      if (typeof base64 !== 'string' || base64.length < 20 || base64.length > 7_200_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        return reply({error:'Upload a PDF no larger than 5 MB.'},400)
      }
      if (!atob(base64.slice(0,40)).startsWith('%PDF-')) return reply({error:'Invalid PDF file.'},400)
      pdfPart = {inline_data:{mime_type:'application/pdf',data:base64}}
      isPdf = true
      sourceDescription = `Attached PDF: ${str(body?.filename,140)}`
    } else if (source === 'topic') {
      const topic = str(body?.topic,160)
      if (topic.length < 3) return reply({error:'Enter a topic.'},400)
      sourceDescription = `Teacher-chosen topic: ${topic}. No reference PDF was supplied; the teacher must verify facts.`
    } else return reply({error:'Choose PDF, saved lesson or topic.'},400)
    const instruction = `You draft educational questions for the SikLab "Sense Detectives" game for Grade 3 Science. IMPORTANT: answer controls are FIXED: 0 Sight, 1 Touch, 2 Hearing, 3 Smell, 4 Taste. There are NO multiple-choice distractors. Produce EXACTLY ${count} SHORT visual questions; each has ONE unambiguous correct sense 0..4. For example "Which sense tells you a bell is ringing?" => 2. Questions must be meaningfully about sensory observations grounded in the teacher-selected content. If the content is not about five senses, do not invent five-senses facts; instead use defensible observations of the objects or phenomena in the provided content. If it is impossible to create valid questions grounded in the content, return an empty questions list. Distribute the five senses where supported; don't force unsupported senses. Suggest a specific and relevant search phrase for an image of the object, without confusing or showing the answer explicitly. Use age-appropriate Grade 3 English; no trick questions, no student names. Keep the explanation 1 sentence. PDF/source page ONLY if certain, otherwise empty string; for saved lesson/topic always empty. Teacher's focus: ${focus||'entire reference'}. Source: ${sourceDescription}. Return JSON matching schema.\n` 
    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
    const parts: Record<string,unknown>[] = [{text:instruction}]
    if (pdfPart) parts.push(pdfPart)
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',responseSchema,temperature:0.2,maxOutputTokens:9000}}),
      signal:AbortSignal.timeout(115000),
    })
    if (!upstream.ok) {
      console.error('[ai-game-questions]', upstream.status, (await upstream.text()).slice(0,500))
      return reply({error:upstream.status === 429?'Gemini quota exceeded. Please try later.':'Gemini could not generate questions. Check the reference, model and key.'},502)
    }
    const payload = await upstream.json()
    const content = (payload?.candidates?.[0]?.content?.parts || []).map((part:{text?:string})=>part.text||'').join('')
    if (!content) return reply({error:'Gemini returned no draft. Try a clearer PDF or a more specific topic.'},502)
    const parsed = JSON.parse(content)
    const unique = new Set<string>()
    const questions = (Array.isArray(parsed?.questions) ? parsed.questions : []).slice(0,count).map((q:Record<string,unknown>)=>({
      prompt:str(q.prompt,350),correct_ans:Number(q.correct_ans),explanation:str(q.explanation,500),
      image_query:str(q.image_query,160),topic:str(q.topic,160),source_page:isPdf?str(q.source_page,15):'',
    })).filter((q:{prompt:string,correct_ans:number,image_query:string})=>{
      if(!q.prompt || !q.image_query || !Number.isInteger(q.correct_ans)||q.correct_ans<0||q.correct_ans>4)return false
      const normalized=q.prompt.toLowerCase().replace(/\s+/g,' ').trim()
      if(unique.has(normalized))return false
      unique.add(normalized);return true
    })
    if(!questions.length) return reply({error:'The source did not produce valid five-senses questions. Try a more relevant topic or PDF.'},422)
    return reply({questions,source_type:source,count:questions.length,needs_teacher_review:true})
  } catch (error) {
    console.error('[ai-game-questions]',error)
    return reply({error:'Could not create the draft. Try a smaller text-based PDF or a shorter topic.'},500)
  }
})
