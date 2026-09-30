# Tug of Knowledge — Two-player Tug of War Quiz

A standalone offline Grade 3 Science quiz game made with HTML, CSS, and vanilla JavaScript. The original request called it "Tug of War"; the playable game is titled **Tug of Knowledge**.

## Play

1. Extract the entire ZIP (keep the `css` and `js` subfolders next to `index.html`).
2. Double-click **index.html** to open it in **Google Chrome**. No `npm`, server, Internet access, or account is required.
3. Select two players and a preset; click **Start tug of war**.
4. Player 1 presses **1–5** to answer A–E. Player 2 presses **6–0** to answer A–E. Clicking the individual answers also works.
5. The first valid correct answer receives one pull. A wrong answer gives no pull; the opponent remains free to answer. The first player to reach the configured boundary wins.

## Features

- 24 editable five-answer sample Grade 3 Science questions (added **only** on first initialization).
- Full question, player, and preset create/read/update/delete operations; category/difficulty/search filters; bulk question delete.
- Adjustable winning boundary, question countdown, result delay, ordering, retry behavior, per-question timer, cooldown penalties, question repetition, animation intensity, sounds, music, full-screen option.
- Match resume, round-by-round history, player results and dashboard statistics.
- JSON question merge/replace import, question/player/history exports, full backup and restore.
- All data is stored in **this browser's localStorage**, not sent online. If the browser clears site data, the local game data is removed; export backups regularly. Chrome's `file://` origin handling can vary: keep the extracted folder in the same path and use the same browser profile. Large base64 image uploads may consume the localStorage quota.
- An unfinished question restarts with a fresh timer after reopening. Completed rounds keep their scores and are not re-awarded.

## Project structure

```
index.html
css/style.css
js/storage.js
js/questions.js
js/players.js
js/settings.js
js/history.js
js/animations.js
js/game.js
js/app.js
```

JavaScript uses ordered classic scripts rather than `type="module"`, so Chrome can run the game by opening the HTML file directly.

## Settings note

The optional wrong-answer penalty is a **retry cooldown**, not a bonus pull or loss of a pull. This keeps the core rule consistent: only the first correct answer earns a pull. With retry enabled, the cooldown is 0.9, 3, or 5 seconds. Without retry enabled, each player has only one submission for that question.

## Data portability

Go to **Backup**, export a full JSON backup, and restore it after moving the game to another computer or Chrome profile. Importing a question bank from JSON accepts the array exported by this app. "Merge" skips duplicate IDs; "Replace" replaces the entire question bank.

## Sweet Science edition

The interface uses a warm orange/cream milk-tea campaign aesthetic and bundled inline SVG boba mascots. The three-second countdown before questions has been removed: new rounds start immediately after the configured between-question delay. The actual question timer and incorrect-answer cooldown settings remain available. The new theme file is `css/milktea-theme.css`.
