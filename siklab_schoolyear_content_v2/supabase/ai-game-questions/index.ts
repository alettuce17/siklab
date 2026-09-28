// SikLab multi-game AI question drafts.
// W1 / Picture Challenge: 5 choices + image search keywords.
// NOVA / Science Carnival Shooter: 5 choices; Button 1 is reused as answer A while a question is open.
import { createClient } from 'npm:@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { headers, status })

function publishableKey(): string {
  const direct = Deno.env.get('SIKLAB_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
  if (direct) return direct
  try {
    const map = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')
    return String(map.default || Object.values(map)[0] || '')
  } catch {
    return ''
  }
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

const str = (value: unknown, max = 250) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

const pictureQuestionSchema = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          prompt: { type: 'STRING' },
          correct_ans: { type: 'INTEGER' },
          answer_options: { type: 'ARRAY', minItems: 5, maxItems: 5, items: { type: 'STRING' } },
          explanation: { type: 'STRING' },
          image_query: { type: 'STRING' },
          topic: { type: 'STRING' },
          source_page: { type: 'STRING' },
        },
        required: [
          'prompt',
          'correct_ans',
          'answer_options',
          'explanation',
          'image_query',
          'topic',
          'source_page',
        ],
      },
    },
  },
  required: ['questions'],
}

const novaQuestionSchema = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          prompt: { type: 'STRING' },
          correct_ans: { type: 'INTEGER' },
          answer_options: { type: 'ARRAY', minItems: 5, maxItems: 5, items: { type: 'STRING' } },
          explanation: { type: 'STRING' },
          topic: { type: 'STRING' },
          source_page: { type: 'STRING' },
          difficulty: { type: 'STRING' },
        },
        required: [
          'prompt',
          'correct_ans',
          'answer_options',
          'explanation',
          'topic',
          'source_page',
          'difficulty',
        ],
      },
    },
  },
  required: ['questions'],
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply({ error: 'POST required.' }, 405)

  try {
    const db = await teacherClient(req)
    if (!db) return reply({ error: 'Sign in with an authorized teacher account.' }, 403)

    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return reply({ error: 'Add GEMINI_API_KEY to Supabase Edge Function Secrets.' }, 503)

    const body = await req.json()
    const yearId = Number(body?.school_year_id)
    if (!Number.isSafeInteger(yearId) || yearId <= 0) {
      return reply({ error: 'Select a valid school year.' }, 400)
    }

    const count = Number(body?.question_count)
    if (![5, 10, 15].includes(count)) {
      return reply({ error: 'Choose 5, 10 or 15 questions.' }, 400)
    }

    const requestedModule = str(body?.game_module, 20).toUpperCase()
    const gameModule = requestedModule === 'NOVA' ? 'NOVA' : 'W1'
    const isNova = gameModule === 'NOVA'

    const difficulty = isNova ? str(body?.difficulty, 20).toLowerCase() : 'medium'
    if (isNova && !['easy', 'medium', 'hard'].includes(difficulty)) {
      return reply({ error: 'Choose Easy, Medium or Hard difficulty.' }, 400)
    }

    const source = str(body?.source_type, 20)
    const focus = str(body?.focus, 160)
    let sourceDescription = ''
    let pdfPart: Record<string, unknown> | null = null
    let isPdf = false

    if (source === 'lesson') {
      const moduleId = Number(body?.lesson_module_id)
      if (!Number.isSafeInteger(moduleId) || moduleId <= 0) {
        return reply({ error: 'Select an existing lesson.' }, 400)
      }

      const { data, error } = await db
        .from('lesson_modules')
        .select('module_id,title,subtitle,lesson_json,school_year_id')
        .eq('module_id', moduleId)
        .eq('school_year_id', yearId)
        .maybeSingle()

      if (error || !data) {
        return reply({ error: 'Lesson was not found in the selected school year.' }, 404)
      }

      sourceDescription =
        `Lesson title: ${str(data.title, 150)}. ` +
        `Subtitle: ${str(data.subtitle, 200)}. ` +
        `Teacher-selected lesson JSON:\n${JSON.stringify(data.lesson_json || {}).slice(0, 30000)}`
    } else if (source === 'pdf') {
      const base64 = body?.pdf_base64
      if (
        typeof base64 !== 'string' ||
        base64.length < 20 ||
        base64.length > 7_200_000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
      ) {
        return reply({ error: 'Upload a PDF no larger than 5 MB.' }, 400)
      }

      if (!atob(base64.slice(0, 40)).startsWith('%PDF-')) {
        return reply({ error: 'Invalid PDF file.' }, 400)
      }

      pdfPart = { inline_data: { mime_type: 'application/pdf', data: base64 } }
      isPdf = true
      sourceDescription = `Attached PDF: ${str(body?.filename, 140)}`
    } else if (source === 'topic') {
      const topic = str(body?.topic, 160)
      if (topic.length < 3) return reply({ error: 'Enter a topic.' }, 400)
      sourceDescription =
        `Teacher-chosen topic: ${topic}. ` +
        `No reference PDF was supplied; the teacher must verify facts.`
    } else {
      return reply({ error: 'Choose PDF, saved lesson or topic.' }, 400)
    }

    const instruction = isNova
      ? `Create EXACTLY ${count} multiple-choice questions for a Grade 3 Science educational game called Science Carnival Shooter. Stay strictly on the teacher-selected topic or uploaded reference. Difficulty must be ${difficulty.toUpperCase()}. Each question must have exactly FIVE distinct answer_options in display order A, B, C, D, E. The controller has five physical buttons. During the shooting phase Button 1 is Shoot/Grab, but while a question is open shooting is disabled and Buttons 1, 2, 3, 4, 5 become answers A, B, C, D, E. Therefore correct_ans MUST be the ZERO-BASED index 0..4 of the one correct answer. Keep prompts short, clear, age-appropriate, and scientifically accurate. Wrong answers should be plausible for Grade 3 but clearly incorrect. EASY = direct recall/identification with obvious wording. MEDIUM = understanding and simple application with plausible distractors. HARD = age-appropriate application/reasoning with closer distractors, but never beyond Grade 3. Answer options should be short, ideally under 55 characters. Explanation must be one short child-friendly sentence. Do not invent facts that are unsupported by the uploaded reference. If the source is only a typed topic, use established elementary science facts and expect teacher review. Do not generate image requests. Do not generate True/False or sorting items; generate multiple-choice only. Do not claim a PDF page unless certain. Return JSON matching the schema. Teacher focus: ${focus || 'entire reference'}. Source: ${sourceDescription}.`
      : `Create EXACTLY ${count} short, visual, general Grade 3 science QUIZ questions for SikLab Picture Challenge. Content MUST stay on the teacher-selected topic or uploaded reference; you are creating a general PICTURE QUIZ, NOT a five-senses quiz. Do not ask which sense (sight, touch, hearing, smell, taste) is used unless the teacher explicitly chose the five senses as the topic or those questions are required by the uploaded reference. For a topic such as apples, ask about observable parts, plant biology, growth, classification, or other age-appropriate facts—not which sense detects an apple. For a topic such as parts of plants, ask plant-part identification and functions, not senses. The ESP32 has five physical answer buttons A,B,C,D,E. For EACH question return exactly FIVE distinct short answer_options in the same display order as those buttons; correct_ans is the ZERO-BASED index 0..4 of the ONE correct option. Other options must be plausible but unambiguously wrong. E.g. image of a root, prompt 'Which part of a plant is shown?', answer_options ['Leaf','Root','Stem','Flower','Fruit'], correct_ans 1. Every question must be educationally accurate for the chosen source and appropriate for Grade 3 students. Questions MUST be answerable with the pictured object/phenomenon, and your image_query must search for a clear, specific image that SUPPORTS the question but DOES NOT label or give away its answer. Generate search keywords, NOT an image. Keep answer labels brief (max 55 characters), prompts (max 220 characters), explanation one sentence. Do not claim precise PDF pages unless certain. Return JSON matching schema. Teacher focus: ${focus || 'entire reference'}. Source: ${sourceDescription}.`

    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
    const parts: Record<string, unknown>[] = [{ text: instruction }]
    if (pdfPart) parts.push(pdfPart)

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: isNova ? novaQuestionSchema : pictureQuestionSchema,
            temperature: 0.2,
            maxOutputTokens: 9000,
          },
        }),
        signal: AbortSignal.timeout(115000),
      },
    )

    if (!upstream.ok) {
      console.error('[ai-game-questions]', upstream.status, (await upstream.text()).slice(0, 500))
      return reply(
        {
          error:
            upstream.status === 429
              ? 'Gemini quota exceeded. Please try later.'
              : 'Gemini could not generate questions. Check the reference, model and key.',
        },
        502,
      )
    }

    const payload = await upstream.json()
    const content = (payload?.candidates?.[0]?.content?.parts || [])
      .map((part: { text?: string }) => part.text || '')
      .join('')

    if (!content) {
      return reply({ error: 'Gemini returned no draft. Try a clearer PDF or a more specific topic.' }, 502)
    }

    const parsed = JSON.parse(content)
    const unique = new Set<string>()

    const questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
      .slice(0, count)
      .map((q: Record<string, unknown>) => {
        const base = {
          prompt: str(q.prompt, 350),
          correct_ans: Number(q.correct_ans),
          answer_options: Array.isArray(q.answer_options)
            ? q.answer_options.map((x: unknown) => str(x, 55))
            : [],
          explanation: str(q.explanation, 500),
          topic: str(q.topic, 160),
          source_page: isPdf ? str(q.source_page, 15) : '',
        }

        return isNova
          ? { ...base, difficulty }
          : { ...base, image_query: str(q.image_query, 160) }
      })
      .filter((q: Record<string, unknown>) => {
        const prompt = String(q.prompt || '')
        const options = Array.isArray(q.answer_options) ? q.answer_options.map(String) : []
        const expectedChoices = 5
        const maxCorrect = expectedChoices - 1

        if (
          !prompt ||
          !Number.isInteger(q.correct_ans) ||
          Number(q.correct_ans) < 0 ||
          Number(q.correct_ans) > maxCorrect ||
          options.length !== expectedChoices ||
          options.some(opt => !opt.trim()) ||
          new Set(options.map(opt => opt.toLowerCase().trim())).size !== expectedChoices
        ) {
          return false
        }

        if (!isNova && !String(q.image_query || '').trim()) return false

        const normalized = prompt.toLowerCase().replace(/\s+/g, ' ').trim()
        if (unique.has(normalized)) return false
        unique.add(normalized)
        return true
      })

    if (!questions.length) {
      return reply(
        {
          error: isNova
            ? 'No valid Science Carnival questions were generated. Try another topic, difficulty, or clearer PDF.'
            : 'No valid picture-quiz questions were generated. Try another topic or a clearer PDF.',
        },
        422,
      )
    }

    return reply({
      questions,
      source_type: source,
      game_module: gameModule,
      difficulty: isNova ? difficulty : undefined,
      count: questions.length,
      needs_teacher_review: true,
      source_summary: sourceDescription.slice(0, 220),
      version: isNova ? 'science-carnival-ai-v2' : 'general-picture-quiz-v2',
    })
  } catch (error) {
    console.error('[ai-game-questions]', error)
    return reply({
      error: 'Could not create the draft. Try a smaller text-based PDF or a shorter topic.',
    }, 500)
  }
})
