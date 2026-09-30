// SikLab multi-game AI question drafts.
// W1 / Picture Challenge: 5 choices + image search keywords.
// NOVA / Science Carnival Shooter: 5-choice questions + AI shooter target-category drafts.
// TUG / Tug of Knowledge: 5-choice questions for two controllers.
import { createClient } from 'npm:@supabase/supabase-js@2'
import JSZip from 'npm:jszip@3.10.1'
import { extractPptxSlides } from './pptx_extract.ts'

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

const tugQuestionSchema = {
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
        required: ['prompt', 'correct_ans', 'answer_options', 'explanation', 'topic', 'source_page', 'difficulty'],
      },
    },
  },
  required: ['questions'],
}

const novaTargetSchema = {
  type: 'OBJECT',
  properties: {
    categories: {
      type: 'ARRAY',
      minItems: 2,
      maxItems: 4,
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          targets: {
            type: 'ARRAY',
            minItems: 4,
            maxItems: 4,
            items: {
              type: 'OBJECT',
              properties: {
                emoji: { type: 'STRING' },
                label: { type: 'STRING' },
              },
              required: ['emoji', 'label'],
            },
          },
        },
        required: ['name', 'targets'],
      },
    },
  },
  required: ['categories'],
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

    const requestedModule = str(body?.game_module, 20).toUpperCase()
    const gameModule = requestedModule === 'NOVA' ? 'NOVA' : requestedModule === 'TUG' ? 'TUG' : 'W1'
    const isNova = gameModule === 'NOVA'
    const isTug = gameModule === 'TUG'
    const generationType = isNova && str(body?.generation_type, 30).toLowerCase() === 'targets'
      ? 'targets'
      : 'questions'
    const isTargetMode = generationType === 'targets'

    const count = isTargetMode ? 0 : Number(body?.question_count)
    if (!isTargetMode && ![5, 10, 15].includes(count)) {
      return reply({ error: 'Choose 5, 10 or 15 questions.' }, 400)
    }

    const difficulty = (isNova || isTug) && !isTargetMode ? str(body?.difficulty, 20).toLowerCase() : 'medium'
    if ((isNova || isTug) && !isTargetMode && !['easy', 'medium', 'hard'].includes(difficulty)) {
      return reply({ error: 'Choose Easy, Medium or Hard difficulty.' }, 400)
    }

    const source = str(body?.source_type, 20)
    const focus = str(body?.focus, 160)
    let sourceDescription = ''
    let pdfPart: Record<string, unknown> | null = null
    let isPdf = false
    let isPptx = false

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
    } else if (source === 'pptx') {
      const base64 = body?.pptx_base64
      const filename = str(body?.filename, 140)
      if (typeof base64 !== 'string' || base64.length < 20 || base64.length > 7_200_000 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || !/\.pptx$/i.test(filename)) {
        return reply({ error: 'Upload a .pptx PowerPoint file no larger than 5 MB.' }, 400)
      }
      let slides: string
      try {
        slides = await extractPptxSlides(Uint8Array.from(atob(base64), c => c.charCodeAt(0)), JSZip)
      } catch (error) {
        return reply({ error: error instanceof Error ? error.message : 'Could not read the PowerPoint file.' }, 400)
      }
      isPptx = true
      sourceDescription = `PowerPoint ${filename}. Extracted slide text (verify against the original deck):\n${slides}`
    } else if (source === 'topic') {
      const topic = str(body?.topic, 160)
      if (topic.length < 3) return reply({ error: 'Enter a topic.' }, 400)
      sourceDescription =
        `Teacher-chosen topic: ${topic}. ` +
        `No reference file was supplied; the teacher must verify facts.`
    } else {
      return reply({ error: 'Choose PDF, PowerPoint, saved lesson or topic.' }, 400)
    }

    const instruction = isTargetMode
      ? `Create shooter target categories for a Grade 3 Science educational game called Science Carnival Shooter. Build between TWO and FOUR meaningful, mutually distinguishable categories from the teacher-selected topic or reference. Return EXACTLY FOUR concrete targets per category. Every target must contain one suitable emoji plus a short child-friendly label. Categories and targets must be scientifically accurate, visually recognizable, and appropriate for Grade 3. A learner should be able to decide which category a target belongs to while playing. Avoid ambiguous targets that could reasonably belong to multiple generated categories. Do not reuse the same target across categories. Prefer concrete nouns or clearly observable examples rather than abstract sentences. Keep category names under 32 characters and target labels under 24 characters. If the reference or lesson does not support four categories, use only 2 or 3 strong categories rather than inventing unsupported content. If the source is only a typed topic, use established elementary science facts and expect teacher review. Return JSON matching the target-category schema. Teacher focus: ${focus || 'entire reference'}. Source: ${sourceDescription}.`
      : isTug
        ? `Create EXACTLY ${count} five-choice multiple-choice questions for Tug of Knowledge, a two-player Grade 3 Science game. Both players see the same question and race to answer; the first correct answer pulls the rope. Keep each question clear and scientifically accurate, with exactly FIVE distinct answer_options in controller display order A red, B green, C white, D blue, E yellow. correct_ans is the ZERO-BASED index 0..4 of the only correct answer. Difficulty: ${difficulty.toUpperCase()}. EASY = direct recall; MEDIUM = understanding or simple application; HARD = age-appropriate reasoning, never beyond Grade 3. Wrong answers should be plausible but clearly wrong. Short prompts, options under 55 characters, and a child-friendly one-sentence explanation. Stay within the teacher's reference; do not invent unsupported facts. A typed topic can use established elementary science facts for teacher review. Do not request images or generate True/False items. Do not claim an exact page or slide unless certain. Teacher focus: ${focus || 'entire reference'}. Source: ${sourceDescription}. Return JSON matching the schema.`
        : isNova
        ? `Create EXACTLY ${count} multiple-choice questions for a Grade 3 Science educational game called Science Carnival Shooter. Stay strictly on the teacher-selected topic or uploaded reference. Difficulty must be ${difficulty.toUpperCase()}. Each question must have exactly FIVE distinct answer_options in display order A, B, C, D, E. The controller has five physical buttons. During the shooting phase red A is Shoot/Grab, but while a question is open shooting is disabled and the red, green, white, blue, and yellow buttons become answers A, B, C, D, E. Therefore correct_ans MUST be the ZERO-BASED index 0..4 of the one correct answer. Keep prompts short, clear, age-appropriate, and scientifically accurate. Wrong answers should be plausible for Grade 3 but clearly incorrect. EASY = direct recall/identification with obvious wording. MEDIUM = understanding and simple application with plausible distractors. HARD = age-appropriate application/reasoning with closer distractors, but never beyond Grade 3. Answer options should be short, ideally under 55 characters. Explanation must be one short child-friendly sentence. Do not invent facts that are unsupported by the uploaded reference. If the source is only a typed topic, use established elementary science facts and expect teacher review. Do not generate image requests. Do not generate True/False or sorting items; generate multiple-choice only. Do not claim a PDF page or PowerPoint slide unless certain. Return JSON matching the schema. Teacher focus: ${focus || 'entire reference'}. Source: ${sourceDescription}.`
        : `Create EXACTLY ${count} short, visual, general Grade 3 science QUIZ questions for SikLab Picture Challenge. Content MUST stay on the teacher-selected topic or uploaded reference; you are creating a general PICTURE QUIZ, NOT a five-senses quiz. Do not ask which sense (sight, touch, hearing, smell, taste) is used unless the teacher explicitly chose the five senses as the topic or those questions are required by the uploaded reference. For a topic such as apples, ask about observable parts, plant biology, growth, classification, or other age-appropriate facts—not which sense detects an apple. For a topic such as parts of plants, ask plant-part identification and functions, not senses. The ESP32 answer buttons are A red, B green, C white, D blue, E yellow. For EACH question return exactly FIVE distinct short answer_options in the same display order as those buttons; correct_ans is the ZERO-BASED index 0..4 of the ONE correct option. Other options must be plausible but unambiguously wrong. E.g. image of a root, prompt 'Which part of a plant is shown?', answer_options ['Leaf','Root','Stem','Flower','Fruit'], correct_ans 1. Every question must be educationally accurate for the chosen source and appropriate for Grade 3 students. Questions MUST be answerable with the pictured object/phenomenon, and your image_query must search for a clear, specific image that SUPPORTS the question but DOES NOT label or give away its answer. Generate search keywords, NOT an image. Keep answer labels brief (max 55 characters), prompts (max 220 characters), explanation one sentence. Do not claim precise PDF pages or PowerPoint slides unless certain. Return JSON matching schema. Teacher focus: ${focus || 'entire reference'}. Source: ${sourceDescription}.`

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
            responseSchema: isTargetMode ? novaTargetSchema : (isTug ? tugQuestionSchema : isNova ? novaQuestionSchema : pictureQuestionSchema),
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
              : (isTargetMode
                  ? 'Gemini could not generate target categories. Check the reference, model and key.'
                  : 'Gemini could not generate questions. Check the reference, model and key.'),
        },
        502,
      )
    }

    const payload = await upstream.json()
    const content = (payload?.candidates?.[0]?.content?.parts || [])
      .map((part: { text?: string }) => part.text || '')
      .join('')

    if (!content) {
      return reply({ error: 'Gemini returned no draft. Try a clearer reference or a more specific topic.' }, 502)
    }

    const parsed = JSON.parse(content)

    if (isTargetMode) {
      const usedTargets = new Set<string>()
      const usedNames = new Set<string>()
      const categories = (Array.isArray(parsed?.categories) ? parsed.categories : [])
        .slice(0, 4)
        .map((cat: Record<string, unknown>) => {
          const name = str(cat?.name, 32)
          const targets = (Array.isArray(cat?.targets) ? cat.targets : [])
            .slice(0, 6)
            .map((item: Record<string, unknown>) => ({
              emoji: str(item?.emoji, 8),
              label: str(item?.label, 24),
            }))
            .filter((item: { emoji: string; label: string }) => {
              if (!item.emoji || !item.label) return false
              const key = `${item.emoji}|${item.label}`.toLowerCase()
              if (usedTargets.has(key)) return false
              usedTargets.add(key)
              return true
            })
          return { name, targets }
        })
        .filter((cat: { name: string; targets: { emoji: string; label: string }[] }) => {
          const key = cat.name.toLowerCase()
          if (!cat.name || cat.targets.length < 2 || usedNames.has(key)) return false
          usedNames.add(key)
          return true
        })
        .slice(0, 4)

      if (categories.length < 2) {
        return reply({ error: 'No usable shooter target categories were generated. Try a clearer topic, lesson or reference file.' }, 422)
      }

      return reply({
        categories,
        source_type: source,
        game_module: gameModule,
        generation_type: 'targets',
        needs_teacher_review: true,
        source_summary: sourceDescription.slice(0, 220),
        version: 'science-carnival-target-ai-v1',
      })
    }

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
          source_page: isPptx ? str(q.source_page, 15).replace(/^slide\s*/i, '') : isPdf ? str(q.source_page, 15) : '',
        }

        return isNova || isTug
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

        if (!isNova && !isTug && !String(q.image_query || '').trim()) return false

        const normalized = prompt.toLowerCase().replace(/\s+/g, ' ').trim()
        if (unique.has(normalized)) return false
        unique.add(normalized)
        return true
      })

    if (!questions.length) {
      return reply(
        {
          error: isTug
            ? 'No valid Tug questions were generated. Try another topic, difficulty, or clearer reference.'
            : isNova
            ? 'No valid Science Carnival questions were generated. Try another topic, difficulty, or clearer reference.'
            : 'No valid picture-quiz questions were generated. Try another topic or a clearer reference.',
        },
        422,
      )
    }

    return reply({
      questions,
      source_type: source,
      game_module: gameModule,
      difficulty: isNova || isTug ? difficulty : undefined,
      count: questions.length,
      needs_teacher_review: true,
      source_summary: sourceDescription.slice(0, 220),
      version: isTug ? 'tug-of-knowledge-ai-v2' : isNova ? 'science-carnival-ai-v3' : 'general-picture-quiz-v2',
    })
  } catch (error) {
    console.error('[ai-game-questions]', error)
    return reply({
      error: 'Could not create the AI draft. Try a smaller reference file or a shorter topic.',
    }, 500)
  }
})
