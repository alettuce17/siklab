SIKLAB - SCHOOL YEAR CONTENT MANAGEMENT + DYNAMIC STUDENT PORTAL
================================================================

This package extends the corrected SikLab Netlify + Supabase + ESP32 system with
proper school-year curriculum management and a Student Portal driven by the
Lesson Builder.

CORE SCHOOL-YEAR MODEL
----------------------
Every school year is its own academic content container.

SCHOOL-YEAR-SCOPED CONTENT:
- Lesson Builder lessons
- Lesson Draft / Published state
- Question Bank
- Game Settings

NOT COPIED BETWEEN SCHOOL YEARS:
- Student roster
- Stored groups
- Student progress
- Match history / scores

GLOBAL APPLICATION CONTENT:
- Custom game module definitions / file paths
- ESP controller provisioning
- Teacher accounts

This separation prevents a new batch of students from inheriting old roster,
progress, or match records while still allowing teachers to reuse curriculum.

NEW FEATURES IN THIS VERSION
----------------------------
1. Create School Year now supports:
   - Start Empty
   - Copy Existing Curriculum
   - Copy Lessons
   - Copy Question Bank
   - Copy Game Settings
   - Make new year Active

2. Curriculum Manager tab:
   - School-year content counts
   - Merge content from one year to another
   - Replace selected target curriculum content
   - Clear selected curriculum content without deleting roster/history
   - Switch directly to a year
   - Preview the Student Portal for a selected year

3. Lesson Builder:
   - Draft / Published visibility
   - Student Preview button
   - Published state displayed in Lesson Library
   - Existing copied images are treated as shared Storage assets and are not
     automatically deleted when one copied lesson is removed

4. Question Bank:
   - Questions now belong to a school year
   - Changing the dashboard school year changes the visible Question Bank
   - Imports are inserted into the selected school year

5. Game Settings:
   - Settings now belong to a school year
   - Each school year can have its own W1/W2/etc scoring configuration

6. Week 1 game:
   - Reads Question Bank and Game Settings from the selected school year
   - Saves game_session.school_year_id when available

7. Dynamic Student Portal:
   - student.html is no longer a hardcoded Week 1 / Week 2 lesson mockup
   - Reads Lesson Builder content through a safe Supabase RPC
   - Renders Rich Text & Images
   - Renders Interactive Fact reveal cards
   - Renders Brain Check quizzes
   - Shows Lesson Builder ordering
   - Normal student mode only shows PUBLISHED lessons from the ACTIVE year
   - Teacher Preview can inspect the selected year and Draft lessons
   - Local browser stars/completion are kept for the child-friendly portal UI

IMPORTANT: The original uploaded student.html is retained only as:
legacy/student_original_reference.html
Do not use it as the active Student Portal.

EXPECTED FOLDER STRUCTURE
-------------------------
/
  index.html
  student.html
  style.css
  security.js
  content_manager.js
  settings_manager.js
  lesson_builder.html
  lesson_builder.css
  lesson_builder.js
  device_setup.html
  device_setup.js
  netlify.toml

  assets/
    tailwind.js
    xlsx.full.min.js
    Sortable.min.js
    fontawesome/
    images/

  js/
    supabase_client.js
    storage_helpers.js
    00_state.js
    01_core.js
    02_school_years.js
    03_auth.js
    04_navigation.js
    05_students.js
    06_match_setup.js
    07_wheel.js
    08_groups.js
    09_history.js
    10_games.js
    11_esp32.js
    12_admin.js
    13_device_setup.js
    14_content_management.js
    student_portal.js

  games/
    SikLab_Sense_Detectives_W1_SUPABASE.html

  esp32/
    SikLab_Controller_Cloud.ino

  supabase/
    config.toml
    migrations/
      001_siklab_complete.sql
      002_teacher_authorization_and_integrity.sql
      003_school_year_content_management.sql
    functions/
      _shared/common.ts
      controller-event/index.ts
      controller-command/index.ts

DATABASE SETUP
--------------
Run these migrations in this EXACT order:

1. supabase/migrations/001_siklab_complete.sql
2. supabase/migrations/002_teacher_authorization_and_integrity.sql
3. supabase/migrations/003_school_year_content_management.sql

Migration 003 performs the school-year content upgrade. Existing global
questions/settings are moved into the currently active (or oldest) school year.
If old curriculum exists but no school year exists, it creates "SY Legacy" so
old data is not lost.

NEW SCHOOL YEAR WORKFLOW
------------------------
Teacher Dashboard -> + beside School Year selector

A. START EMPTY
- Creates a new school year
- No lessons/questions/settings are copied
- Roster starts empty

B. COPY EXISTING CURRICULUM
- Select source school year
- Select Lessons / Questions / Game Settings
- Create
- Roster/groups/progress/history still start empty

"Make this the active student school year" determines which year student.html
shows to normal students.

CURRICULUM MANAGER WORKFLOW
---------------------------
Teacher Dashboard -> Curriculum Manager

MERGE:
- Keeps target content
- Adds missing lessons
- Adds questions that are not already represented by the same module/prompt/answer
- Keeps existing game settings when target already has that module

REPLACE:
- Deletes the selected target curriculum categories first
- Copies those categories from the source
- Does NOT touch students, groups, progress, or match history

CLEAR SELECTED CONTENT:
- Deletes only checked curriculum categories from the target year
- Does NOT delete roster/history
- Uses two confirmations because it is destructive

LESSON PUBLISHING + STUDENT PORTAL
----------------------------------
Lesson Builder now has a visibility selector:
- Published = available to normal students when that year is Active
- Draft = hidden from normal students

Student Preview in the teacher dashboard can show the selected year and drafts.
This makes it possible to review content before publishing it.

Public Student Portal:
/student.html

Normal public mode always uses the ACTIVE school year, regardless of URL query
parameters. This prevents a student from simply requesting an archived year.

Teacher preview:
/student.html?preview=1&year=YEAR_ID

The selected-year preview only works as a teacher because the Supabase RPC checks
for an approved teacher session before honoring a requested year or showing drafts.

STORAGE COPY BEHAVIOR
---------------------
Curriculum copying reuses existing Supabase Storage image URLs instead of copying
large image files. Therefore a lesson/question image can be referenced by more
than one school year.

For that reason, deleting a copied lesson/question removes the database reference
but does NOT automatically delete an already-saved shared Storage file. Newly
uploaded files that fail before save are still cleaned up.

STATIC ASSETS
-------------
Copy your existing static files into assets/:
- tailwind.js
- xlsx.full.min.js
- Sortable.min.js
- fontawesome/
- built-in/static images/

Teacher-uploaded lesson/question images stay in Supabase Storage.

SUPABASE / EDGE / ESP SETUP
---------------------------
Keep the same configuration from the corrected package:
- Verify js/supabase_client.js project URL + publishable key
- Set Edge secrets SIKLAB_PUBLISHABLE_KEY and SIKLAB_SECRET_KEY
- Deploy controller-event and controller-command
- Compile/upload esp32/SikLab_Controller_Cloud.ino
- Provision Player 1 and Player 2 through provision_controller(...)

RECOMMENDED TEST ORDER
----------------------
1. Run migrations 001, 002, 003.
2. Sign in with an approved teacher.
3. Create SY 2026-2027 as an empty active year.
4. Add two students.
5. Create a lesson and save it as Draft.
6. Open Student Preview and confirm the draft appears to the teacher.
7. Open /student.html in a private/incognito browser and confirm the draft does NOT appear.
8. Change the lesson to Published.
9. Refresh /student.html and confirm it appears.
10. Add W1 questions and W1 game settings.
11. Create SY 2027-2028 using Copy Existing Curriculum.
12. Confirm lessons/questions/settings copied.
13. Confirm SY 2027-2028 has an EMPTY student roster.
14. Edit a copied lesson and confirm the old year is unchanged.
15. Use Curriculum Manager Merge and Replace modes.
16. Use Clear Selected Content on a non-production test year.
17. Set SY 2027-2028 Active and confirm public student.html switches to it.
18. Launch Week 1 and verify it reads W1 content from the selected school year.
19. Connect both ESP controllers and run the normal controller test.

LIMITS / FINAL HARDWARE TEST
----------------------------
Browser JavaScript is syntax-checked in this package. The Supabase SQL migration
cannot be executed against your live project from this environment, and the ESP32
firmware cannot be compiled against your exact local Arduino board/library setup
here. Run the migrations on a test project first, then complete browser + hardware
testing before classroom deployment.
