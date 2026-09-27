# SikLab Game 1 — Picture Challenge Revision 2

This is a **patch to Revision 1**. It removes the forced five-senses-only question behavior and the Game 1 AI illustration UI, improves Commons image-search diagnostics, and adds a saved-question Picture Manager. It does **not** require new ESP32 or Windows Controller App firmware.

## What changed

- Game 1 remains ID `W1` and keeps its existing HTML filename for backward compatibility. The visible name is now **Picture Challenge** and supports ANY appropriate Grade 3 science topic in the chosen PDF, saved lesson, or teacher-supplied topic.
- AI creates exactly FIVE labeled answers (A–E), because the physical controllers have five answer buttons. `correct_ans` stays 0–4, preserving input/scoring mapping. Manually authored W1 questions now have five editable answer fields.
- Old existing W1 questions without `answer_options` remain playable, with Sight/Touch/Hearing/Smell/Taste as legacy fallback choices. Use a NEW question set to test general-topic questions without old questions mixed in.
- Game 1 no longer shows or calls AI illustration generation. This does **not** disable the optional feature in the separate Lesson Builder, which still uses the shared `lesson-media` function.
- The search button uses Wikimedia Commons, NOT Google Images and NOT the paid image generation API. Removed a restrictive `filetype:bitmap` search modifier; updated Wikimedia client identification; added clearer error messages; imported Commons pictures for Game 1 now go to `question-images` rather than `lesson-images`. Images from very large originals may use a Wikimedia thumbnail so they can be stored under the 5 MB limit.
- `Question Bank → saved question → Manage Picture` allows viewing, searching, attaching, uploading, replacing or removing an image. The existing Edit and Delete Question buttons still control the question itself. Unlinking/replacing an image intentionally does NOT immediately delete the Storage object: copied school years can reference the same URL.

## Install, in order

1. Back up your current repository. Extract this ZIP. Copy its contents into your existing **inner SikLab folder containing `index.html`**, overwriting matching files. Keep your assets, auth setup and other games.
2. Supabase Dashboard → **SQL Editor**: If you did not run `007_sense_detectives_ai.sql` in Revision 1, run it first. Then run **`supabase/migrations/008_picture_challenge_answers.sql`**. It adds five answer options per question and updates the existing school-year content copy RPC. It does not delete your old questions or images.
3. From PowerShell in the SikLab root where `supabase/functions` exists:

   ```powershell
   npx supabase functions deploy ai-game-questions
   npx supabase functions deploy lesson-media
   ```

   Both must say `Deployed Functions on project xdnfldzjkzcpzxnclysr`. The existing `GEMINI_API_KEY` is reused **for TEXT question generation**. A Gemini image-model subscription is NOT required for Wikimedia image search.
4. Check Supabase Dashboard → **Storage** that `question-images` exists and is publicly readable for classroom picture display, with an authenticated teacher-upload policy. Your older manual question upload already relies on this bucket. Search itself does not require a bucket, but attaching an image does.
5. Commit/push the updated files to GitHub. Wait for Netlify deploy, then `Ctrl+F5` on the website. Remember `npx supabase functions deploy` is separate from deploying Netlify.
6. Open **Question Bank → Generate Picture Challenge Questions**. Source `Type topic`, topic `Parts of a Plant`, 5 questions, set `TEST - Plants`. Review five options and correct answer on every question. Search/attach an image, then Save. In Question Bank select `Game 1: Picture Challenge` and press **Manage Picture** on any saved question to replace/remove it. In Game Dashboard choose `TEST - Plants`, start.

## If picture search fails

The exact cause requires the HTTP/function error; do not assume a Gemini subscription is responsible. Read the error displayed under the question or in the saved-question Picture Manager, or open **Supabase Dashboard → Edge Functions → lesson-media → Logs** after pressing Search.

- `403 Sign in with an authorized teacher account` — check session and `is_approved_teacher` RPC in your Supabase project.
- `Wikimedia image search HTTP 403/429/5xx` — check Wikimedia availability, app User-Agent identification, and rate limits; wait before retrying or upload a licensed image you own.
- `No images matched` — try `mung bean seedling` instead of a whole question; not all Wikimedia items meet JPEG/PNG/WebP/license constraints.
- `Unable to save image: ...` — inspect `question-images` bucket and its Storage upload policies.
- `Function not found` — re-deploy **lesson-media** to the SAME Supabase project used by the frontend.

## Scope and safety

No Supabase project secrets, `GEMINI_API_KEY`, ESP32 firmware, or Windows Controller App files are included in this patch. Don't paste keys in GitHub. Teacher must inspect picture appropriateness, answer accuracy and Commons license/attribution before publishing.

This patch was syntax-checked locally but was **not live-tested** against your hosted Supabase account or physical ESP32; test with one new five-question set before using it in class.
