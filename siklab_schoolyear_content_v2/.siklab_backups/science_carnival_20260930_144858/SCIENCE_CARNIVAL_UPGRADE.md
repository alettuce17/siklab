# Science Carnival upgrade

The integrated Science Carnival game now includes animated hits and targets, mystery-box power-ups, five-choice questions, True or False, and Sort It. The dashboard still supplies players, the selected school year and category, difficulty, approved questions, target categories, and game settings.

## Prepare a category

1. In **Question Bank**, select **Science Carnival Shooter** and choose the category/topic you want to play.
2. In **Shooter Target Categories**, configure at least two categories with target emojis. These become the shooting targets and Sort It boxes.
3. Add at least one approved **Five-choice question** at the difficulty you will launch. The game's first challenge uses one. Existing AI-generated five-choice questions remain valid.
4. To include True or False, choose **Challenge type → True or False**, enter a factual statement, set **A (red) = True** or **B (green) = False**, choose its difficulty, and save. You can edit or delete it from the same question list. If no True or False statements exist for the selected difficulty, play rotates between five-choice and sorting.
5. On the dashboard, choose the same category and difficulty and launch. The three available challenges rotate separately for both players.

The current AI generator drafts five-choice questions. True or False statements are entered and reviewed by a teacher. Sort It uses the configured target category emojis and needs no separate question entries. Mystery boxes appear during shooting and give a random temporary boost or opponent effect. Virtual joystick and shoot controls appear on touch-first devices and hide during keyboard use; ESP32 controls continue to work.

After installing this update, redeploy the website. A local file copy alone does not update the hosted Netlify site.
