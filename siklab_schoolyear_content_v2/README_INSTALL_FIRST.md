# SikLab Sense Detectives — Revision 1 (AI Questions + Cleaner Game Dashboard)

## Scope

- Removes Quarter selector from **Start the Class Session**; existing quarter database column remains for compatibility. Advanced game-file management is collapsed.
- Compact per-game scoring controls for Sense Detectives, without changing gameplay defaults or P1/P2 controller controls.
- AI drafts exactly 5, 10 or 15 five-senses questions from one reference PDF, an existing SikLab lesson from the selected school year, or a typed topic.
- Per-question image suggestions from Wikimedia Commons (teacher chooses and imports); teacher custom picture upload; optional AI illustration via the existing `lesson-media` function.
- Teacher reviews/edits correct *sense*, prompt and explanation before saving into a named question set. Game launches the chosen set and shows explanations as round feedback.

## Install order — read before replacing files

1. **Back up the GitHub repository/project folder**, including any uncommitted modifications.
2. Copy the ZIP's files **into your inner `siklab_schoolyear_content_v2` folder that contains `index.html`**, preserving relative paths and overwriting matching files. Do not delete your other files. The ZIP is a targeted overlay, not the full website.
3. On the correct **Supabase Cloud project**, use Dashboard → SQL Editor and run the entire `supabase/migrations/007_sense_detectives_ai.sql` **once**. Migration `003_school_year_content_management.sql` must already have been applied. Run 007 before deploying the new frontend because it adds new `custom_question` columns. Do NOT re-run 001 or 003 blindly on your existing Cloud database.
4. Make sure `GEMINI_API_KEY` exists in Supabase Dashboard → Edge Functions → Secrets; keep it private. Optional `GEMINI_MODEL=gemini-2.5-flash`. The functions use your existing `is_approved_teacher` SQL helper and `SIKLAB_PUBLISHABLE_KEY` (or built-in anon key).
5. In PowerShell, open the folder containing the `supabase` directory, and deploy:

   ```powershell
   npx supabase link --project-ref xdnfldzjkzcpzxnclysr
   npx supabase functions deploy ai-game-questions
   npx supabase functions deploy lesson-media
   ```

   `lesson-media` is included unchanged from the earlier AI Lesson Builder update for completeness; deploying it also supports AI Lesson Builder image search. You **do not** need to redeploy `ai-lesson-draft` for this game update.
6. Confirm the `lesson-images` and `question-images` Supabase Storage buckets and their teacher-upload policies exist from your earlier migrations. `lesson-media` imports/creates images in `lesson-images`, while custom uploaded question pictures use `question-images`. Both are intended for shareable classroom media, not private student files.
7. Commit/push the replaced frontend, game runtime, migration and function files to GitHub. Check that Netlify deploy succeeds. Open deployed SikLab, sign in as teacher, choose school year → Question Bank → Sense Detectives AI generator. **Hard refresh** (`Ctrl+F5`) after Netlify deploy if you see old UI.

## Test

- Start: no Quarter dropdown; select Sense Detectives and choose question set.
- In Question Bank, source → Topic, try “five senses of familiar objects,” select 5, click Generate.
- For each question choose a Commons candidate, upload your own or generate an image. Check the *correct sense* carefully: `0 Sight`, `1 Touch`, `2 Hearing`, `3 Smell`, `4 Taste`.
- Save approved questions. Return to Game Dashboard and select the named set. Launch the game, then test joystick/buttons.
- Then test an existing lesson from the active school year and a small text-based PDF (≤5MB).
- Both ESP32 firmware and Windows Controller App remain unchanged. AI generation and media search require internet/Supabase/Gemini. The local game inputs still travel through your Windows Controller App if launched from your local SikLab site.

## Expected limitations

- This is an implementation package prepared from your *uploaded* project ZIP plus the preceding AI Lesson Builder's `lesson-media`. It has been statically checked but **not** run against your live Supabase project, Gemini quota, or physical ESP32.
- AI output can be inaccurate or mislabel sensory observations. Nothing saves until the teacher approves the draft. Commons image search may return irrelevant images or restrictive attribution requirements: always inspect the image, source page and license.
- `question_set` is a text label, not yet a separate table. Editing a set name on one question moves only that question, rather than renaming the entire set.
- A saved lesson from the currently chosen year is used; imported PDFs are sent to the Edge Function for question generation, not automatically saved to your public PDF bucket.
- If no questions exist in the selected set, the game shows a message instead of silently falling back to demo questions. With “All approved questions” and an empty bank, the existing demo fallback is kept.
- Deployed `lesson-media` must work for automatic picture suggestions and AI illustrations. Image-generation model access/quotas vary by Gemini project.

## Rollback

Restore original frontend/game files from your GitHub commit if necessary. The additive 007 metadata migration can safely remain; don't drop columns and lose question data. Existing questions are approved and assigned to “General Questions” by default.
