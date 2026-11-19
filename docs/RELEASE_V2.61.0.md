# RemNote MCP Bridge v2.61.0 Release Notes

This release turns the bridge into **one plugin with optional sections**. Plugins that used to be installed separately are now built in, and each one has its own on/off switch in the plugin settings.

**Existing users: nothing changes unless you turn something on.** Only the MCP Bridge is enabled by default, exactly as before.

### Sections

| Section | What it does | Default | Phone / tablet |
|---|---|---|---|
| MCP Bridge | Connects RemNote to AI assistants (Claude, GPT, other MCP clients) through a local bridge | On | Not started (needs the computer) |
| Translation & AI Assistant | Translate a selection, explain it, ask follow-up questions, save vocabulary cards | Off | Not started (needs the computer) |
| Learn | Memrise-style lessons for vocabulary documents: introduce a word, then quiz it (meaning, fill-in-the-blank, spell it with letter tiles). Results are saved to RemNote's own flashcard history only when you press Save | Off | Works (image and story suggestions are desktop only) |
| Eisenhower board | Critical / High / Medium / Low task board. Pick the board document with the command "Eisenhower: use this document as the board"; tags are found by name | Off | Works |
| PDF Reading View | Dark / sepia reading view for PDFs | Off | Works |
| No Bullet editor mode | Hides bullets for a cleaner editor | Off | Works |
| Todo Alarm | Reminders for todos | Off | Not started (needs a local service) |
| MyDrive | Attach Google Drive files to notes | Off | Not started (needs a local server) |

Turn a section on in **Settings → Plugins → MCP Bridge (Y Edition Dev) → Settings**. If a change does not apply right away, reload the plugin.

### Other changes

- **Plugin icon.** The plugin now ships `logo.png`, so RemNote shows the bridge icon instead of a letter.
- **Mobile-safe startup.** On phones and tablets the local bridge, local HTTP/WebSocket calls and desktop automation never start, so there are no connection errors. The manifest now allows mobile loading (`enableOnMobile: true`).
- **Learn: memory help.** On desktop, a word's intro screen can suggest free-licensed images (Wikimedia Commons, with source and license) and short sound-alike memory stories. Nothing is written to your note unless you press "Add to card", and adding never changes or deletes existing content.
- **Learn: smoother card images.** Card images are drawn inside the lesson window, so they no longer lag behind while scrolling.
- **Privacy.** No personal document, tag or folder IDs are built into the published package. Personal defaults live in an untracked local file used only for local development builds.
- **Core bridge fixes (since 2.59.x).** Rem references passed to ID-only parameters are converted to plain IDs (this fixed tag operations that could hang), and every bridge call now has a time limit with automatic queue recovery.

### Known limitations

- Todo Alarm needs an update to its local alarm service before it works from the combined plugin.
- MyDrive keeps its Google settings per plugin, so you need to enter them once again in the combined plugin.
- The phone behaviour is covered by automated tests but has not yet been tried on a real Android device.

### Validation

- Type check: `npx tsc --noEmit` — 0 errors.
- Targeted tests: `test_features.cjs` 13/13, `test_ogren.cjs` 26/26, `test_eisenhower_board.cjs` 19/19, `test_version_consistency.cjs` 2/2.
- Production builds (local and marketplace) succeed; the marketplace manifest passes `remnote-plugin validate`.

### Plugin IDs

- Marketplace listing: `remnote-mcp-bridge-y-edition-dev` (this release: 2.61.0, previous: 1.6.1).
- Local development: `remnote-mcp-bridge-y-edition-dev-2`.
