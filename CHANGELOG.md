# Changelog

All notable changes in this fork are documented in this file.

## [2.61.0] - 2026-11-19

### Added

- Unified plugin: Translation & AI Assistant, Learn, Eisenhower board, Todo
  Alarm, PDF Reading View, MyDrive and No Bullet editor mode are optional
  sections with their own `feature.<id>` settings. Only the MCP Bridge is on
  by default.
- Learn (vocabulary lessons): introduce, then quiz (meaning, fill-in-the-blank,
  letter-tile spelling); results go to RemNote's repetition history only on
  Save. Desktop-only memory help suggests Wikimedia Commons images and
  sound-alike stories; "Add to card" only appends a new child line.
- `public/logo.png` so RemNote shows the plugin icon.
- Eisenhower command "use this document as the board"; tags are resolved from
  synced storage, then by name.

### Changed

- Marketplace manifest targets the approved listing
  `remnote-mcp-bridge-y-edition-dev`, version 2.61.0, `enableOnMobile: true`,
  same scopes, `requestNative: false`.
- On mobile the local bridge, localhost calls and CDP features never start.
- Personal document/tag/folder IDs moved out of the source into an untracked
  `local-defaults.json` read only by local development builds.

### Fixed

- Core 1.5.0: `{$rem}` references passed to ID-only parameters are marshalled
  to plain IDs (tag removal no longer hangs); per-call 30 s timeout with queue
  recovery in the executor.
- Learn card images render inside the lesson window and no longer lag while
  scrolling.

### Known limitations

- Todo Alarm needs a local service update before it works from the combined
  plugin; MyDrive settings must be entered again; Android not yet tested on a
  real device.

## [2.59.35] - 2026-08-30

### Fixed

- Context Translator color markers no longer flatten Markdown around them.
  Yellow/blue inline color, bold, italic, and multiline content are converted
  together into native RemNote RichText.
- Context Translator vocabulary exports now mirror the popup typography for
  translated target phrases, context meanings, pattern heads, English
  examples, explanation labels, synonym chips, mnemonic runs, and etymology
  roots.

## [2.59.34] - 2026-08-30

### Fixed

- The RemNote PDF `Cevir > Flashcard'a aktar` path now writes the card back as
  native `**Baglam:** ...` RichText, matching the standalone Context Translator
  export and older correctly formatted vocabulary cards. A new V6 overlay key
  replaces already-running V4/V5 injectors so the fix reaches the open page.
- Multiline flashcard details no longer take the single-line bold-prefix fast
  path. The full RemNote Markdown parser now receives the complete text, so
  every `**bold**` and `*italic*` span becomes native RichText instead of
  leaving later markers visible as plain text.

## [2.59.33] - 2026-08-14

### Fixed

- Scene chat receives subtitle fragments grouped under explicit speaker labels.
  Scene explanations must identify speaker and addressee before explaining the
  event and line purpose; vague stand-ins such as `one side` are forbidden when
  names or role labels exist in the captured evidence.
- The quick scene lane no longer exposes speculative Spark interpretation. It
  returns only the locally verified speaker order, while the quality lane
  starts immediately and replaces that preview with the full explanation.

## [2.59.32] - 2026-08-14

### Fixed

- Questions such as `Bu sahnede ne oluyor?` now use a dedicated
  `scene_explanation` route. The response prioritizes the scene event,
  immediate goal or conflict, emotional state, and the line's dramatic
  purpose instead of returning a dictionary-style explanation.

## [2.59.31] - 2026-08-14

### Fixed

- Context Translator scene chat now starts the quality lane 2.5 seconds after
  the quick lane instead of waiting for the quick timeout to finish. A late
  quick response cannot overwrite a completed quality response.
- Year, release, season, and episode variants such as `Nip Tuck (2003) -` and
  `Nip Tuck (S01E06)` are treated as the same production while unrelated show
  titles remain rejected.
- Person/character questions use the new `scene_identity` route. It prioritizes
  production, timestamp, and nearby subtitle evidence and refuses to invent a
  name when the captured scene is insufficient.
- If both chat models time out, the standalone popup shows a bounded local
  scene-context answer instead of incorrectly diagnosing the RemNote bridge as
  disconnected.

## [2.59.30] - 2026-07-20

### Fixed

- The PDF toolbar injector now recognizes both the legacy
  `file:///.../app.asar/...` desktop page and the current `app://js/...`
  RemNote page. The current icon-only highlight action plus `Notes` toolbar
  layout is also accepted, so `Cevir` survives the new RemNote PDF UI.
- Injector readiness now requires a successfully attached RemNote page.
  `waiting_for_page` is reported as degraded instead of healthy, preventing
  the watchdog from claiming that PDF translation is ready while the button
  is absent.
- Progressive detail results are now validated before entering the translation
  cache. If the usage lane omits its explanation or three natural patterns, one
  bounded repair request fills only those fields. A still-incomplete but usable
  enrichment remains visible and is not cached instead of discarding the whole
  detail card.
- Failed CDP detail prefetches now have a one-minute per-selection cooldown.
  The one-second toolbar health scan no longer replays the same failed cache
  entry dozens of times.
- Topic-chat textareas now own plain `Backspace` and `Delete` at the window
  capture layer, just like Space. RemNote/PDF keyboard shortcuts can no longer
  consume editing keys before the composer changes its text.
- Topic chat now classifies real-world why/how questions separately from
  contextual usage and lexical questions. A question such as why oceans are
  salty is answered with the causal mechanism instead of being reduced to a
  paraphrase of what the author asked.
- Topic chat no longer launches Spark and the quality model at the same time.
  The quick answer runs first and is shown immediately; the quality upgrade
  starts after that request settles. Live trace evidence showed the old
  concurrent pair timing out at `9.031 s` and `14.039 s`, while the same models
  completed separately in `6.494 s` and `8.243 s`. Timeout ceilings now include
  load headroom (`12 s` quick, `22 s` quality) without delaying normal replies.
- Progressive translation rendering now keeps the newest completed detail card
  as the canonical popup result. A slower image, chat, or mnemonic prefetch can
  no longer redraw the older `core_complete` card and leave the visible status
  stuck at "details are completing".
- Core, detail, and full translation requests now have bounded client timeouts.
  If details fail after the core card is visible, the popup keeps that card and
  changes to `details_error` instead of starting another long legacy full call.
- The React widget and the CDP-injected PDF popup use the same failure policy.

### Verified

- The focused progressive-race regression, physical Space/Backspace/Delete
  regression, topic-intent tests, CDP popup suite, TypeScript check, production
  build, bridge health, and live RemNote popup verification pass.

## [2.59.29] - 2026-07-14

### Changed

- Scientific and structural concepts now use a concept-first Wikipedia lead
  image plus Wikimedia Commons diagram search instead of mixing field photos
  and diagrams at equal priority.
- Wikimedia categories, descriptions, MIME type, and dimensions are ranking
  evidence. Query wording alone no longer makes an image a diagram.
- Diagram mode prefers SVG/educational metadata and rejects extreme panoramas;
  photo-heavy Openverse searches remain available for ordinary vocabulary but
  are skipped for diagram targets.
- Scientific morphology variants such as `anticline -> anticlinal` are searched
  explicitly. Exact concept filenames outrank broad article imagery, and image
  results are cached locally for 24 hours to avoid repeated provider requests.

### Verified

- RemNote's stock Explain implementation was inspected read-only: it calls the
  authenticated `getImageFromText` RPC with `kind: fast`; for `anticlines` it
  returned Wikimedia `Anticlinal.png` as the first of eight candidates.
- The live local helper now selects the same Wikimedia `Anticlinal.png` concept
  diagram as stock Explain, keeps three relevant candidates, and omits the old
  600x112 field panorama. The final live request measured 677 ms host / 739 ms
  end to end; the popup used a 280x163 contain-fit figure without overflow.
- Source checks pass `162/162`; TypeScript, production build, bridge health,
  active plugin version `2.59.29`, and live CDP visual verification all passed.

## [2.59.28] - 2026-07-13

### Changed

- Mnemonic, image, Sol, High Mnemonic, and flashcard actions now render
  immediately after the translated-expression row, before the featured meaning
  summary and image. Long contextual summaries can no longer push the primary
  controls to the bottom of the popup.
- Candidate status and candidate panels remain attached to the action row and
  also appear before the featured content.
- React and CDP popup renderers use the same action-first hierarchy. A new
  overlay state key replaces the previous live renderer in already open tabs.

### Verified

- `160/160` focused Node tests, TypeScript, manifest validation, and the
  production build pass.
- Live CDP geometry places the action row at `y=166.8 px` and the featured
  stage at `y=270.3 px`; all five buttons remain inside their row without
  overflow.
- Connected plugin, manifest, and health report `2.59.28`. Live target-expression
  and physical Space regressions pass. Screenshot:
  `Programs/Temp/remnote_actions_first_preview.png`.

## [2.59.27] - 2026-07-13

### Changed

- The featured meaning summary and image now share the same top edge instead
  of vertically centering the shorter summary beside a tall image card.
- Diagram images keep their natural aspect ratio with a bounded maximum height.
  Very wide scientific diagrams no longer create a large empty white frame.
- The action row uses equal responsive columns, wrapped labels, and bounded
  button heights. Pending Sol text now says `Hazirlaniyor` instead of clipping
  to `Sol...`.
- A new overlay state key removes the previous live-page renderer so already
  open RemNote tabs receive the layout update without retaining stale UI.

### Verified

- `160/160` focused Node tests, TypeScript, manifest validation, and the
  production build pass.
- Live `anticlines` proof reduced the featured figure from `250 x 176.6 px`
  to `280 x 84.0 px`; the summary/image top-edge difference fell from
  `42.3 px` to `0 px`.
- All five action buttons remain inside their row with no content overflow.
  The live popup is `640 x 357.1 px` with no scroll requirement.
- Connected plugin, manifest, and status report `2.59.27`. Target-expression,
  physical Space, and context-explanation live regressions pass. Screenshot:
  `Programs/Temp/remnote_featured_image_preview.png`.

## [2.59.25] - 2026-07-13

### Changed

- Word cards now contain a separate `Baglama gore aciklama` section. It uses
  nearby page text to resolve references, ellipsis, contrast, metaphor, and
  tone without replacing the existing lexical and grammatical `Aciklama`.
- The quality-core request receives a bounded context window: up to two
  preceding sentences, the selected sentence, and one following sentence,
  capped at 1600 characters. The quick first paint remains unchanged.
- The new section is preserved during detail enrichment, rendered by both the
  React and CDP popups, and included as its own RemNote export section.

### Verified

- `160/160` focused Node tests, TypeScript, and the production build pass.
- Formatter coverage confirms that `mine` is resolved from nearby textbook
  context while the existing lexical `Aciklama` remains a separate section.
- Live GPT output resolved `mine` to the previously mentioned books and the
  author's own school textbooks. Detail enrichment preserved that text, then
  added the existing lexical `Aciklama` as the next separate section.
- Connected plugin, manifest, and status report `2.59.25`. Live CDP DOM proof
  found both sections in order with no horizontal overflow. Screenshot:
  `Programs/Temp/remnote_context_explanation_preview.png`.

## [2.59.24] - 2026-07-13

### Changed

- `Cevir` now starts one stable image request as soon as the quality meaning
  core is available. The first ranked image appears automatically; the
  `Gorsel` button reuses the same in-flight or completed request for
  alternatives.
- Openverse and Wikimedia requests now run concurrently. Scientific and
  structural concepts prefer diagram, cross-section, schematic, and trusted
  educational metadata; query text no longer counts as relevance evidence.
- The featured visual uses a responsive meaning-plus-image layout. Diagram
  candidates use `object-fit: contain`, alternatives use a responsive gallery,
  and low-scoring tail candidates are not shown.
- The CDP popup chooses the larger side of the selection toolbar when the lower
  viewport area cannot fit the featured summary.

### Verified

- TypeScript, manifest validation, production build, and focused static tests
  pass.
- Live `anticlines` search ranked `Anticlines and Synclines` first in about
  `1.1 s` observed time, down from the pre-change `8.7 s` measurement.
- Live CDP proof confirmed one shared image promise, three ranked candidates,
  a `250 px` featured surface, `object-fit: contain`, and no horizontal
  overflow. Screenshot: `Programs/Temp/remnote_featured_image_preview.png`.

## [2.59.23] - 2026-07-13

### Changed

- Word translation now starts GPT-5.6-Sol Medium mnemonic prefetch as soon as
  the quality meaning core is available. It no longer waits for explanation,
  natural-pattern, and etymology enrichment to finish.
- The prefetch identity is stable across core-to-detail rerenders. It uses the
  selected token, sentence context, and formatter `targetText`, so the detail
  result reuses the same in-flight request instead of starting a second one.
- Context-only placeholders still cannot start Sol. The model, Medium
  reasoning, prompt, strict top-three ranker, and persistent cache are
  unchanged.

### Verified

- Complete `158/158` Node suite, TypeScript, manifest validation, and
  production build pass.
- Live CDP proof started at meaning-core state (`statusAfterCore=running`),
  reused the same promise after detail enrichment (`samePromise=true`), and
  returned three candidates in `26965 ms`.
- Plugin/manifest/status report connected `2.59.23`. Target-expression and
  physical Space live regression verifiers still report `ok=true`.

## [2.59.22] - 2026-07-13

### Changed

- Both translation popup paths now show the exact formatter target before the
  card sections. A click on `end` inside `end up` renders
  `ÇEVRİLEN İFADE: end up` instead of leaving the user to infer the target from
  the Turkish translation.
- When context expansion occurs, the same compact row separately shows
  `Tıklanan: end · Otomatik kalıp`. Single-word translations do not show this
  expansion note.

### Verified

- The live host core returned `selectedText=end`, `targetText=end up` and
  `contextPhrase.reason=phrasal_verb` for the reported sentence.
- Complete `157/157` Node suite, TypeScript and production build pass. Live
  CDP DOM verification reports the expected label/value/meta text with no
  horizontal overflow; visual preview is
  `Programs/Temp/remnote_translate_target_expression_preview.png`.
- Plugin/manifest/health report `2.59.22`, the restarted CDP injector is
  healthy, and the physical Space verifier still reports `ok=true`.

## [2.59.21] - 2026-07-13

### Fixed

- The CDP `Cevir > Sohbet` Space guard now runs at `window` capture level,
  before RemNote/PDF reader listeners can stop the event above `document` and
  the textarea. Plain Space is inserted at the current caret or selection;
  modified shortcuts remain unchanged.
- The live verifier now uses Chromium `Input.dispatchKeyEvent` in addition to
  synthetic DOM checks. This reproduces the real keyboard propagation path
  that the previous verifier missed.

### Verified

- The pre-fix physical probe reproduced `alphaomega` with no insertion. A
  temporary window guard changed the same probe to `alpha omega` before the
  source edit. After reload, the durable verifier reports
  `physicalInsertion=alpha omega`, active overlay
  `__mcpRemNoteCevirOverlay25921WindowSpaceGuard` and `ok=true`.
- Complete `155/155` Node suite, TypeScript, production build, connected
  plugin/manifest `2.59.21`, and healthy CDP injector all pass.

## [2.59.20] - 2026-07-13

### Changed

- `Cevir > Sohbet` now starts a concise `gpt-5.3-codex-spark` answer and the
  existing `gpt-5.4-mini` quality answer in parallel. The first answer is shown
  immediately; the quality result replaces the same message when it finishes.
- The quality model, low-reasoning setting and full prompt remain unchanged.
  The quick answer has a separate 90-word prompt and startup warmup, so it does
  not shorten or downgrade the final answer.
- Both React and CDP popup paths use stable message IDs. A late quick result
  cannot overwrite a completed quality result, and a quality failure retains
  the quick answer instead of leaving the chat empty.

### Verified

- Added regression coverage for parallel dispatch, interim state, stable-ID
  replacement, fallback behavior and stale-overlay cleanup.
- TypeScript, production build and the complete `155/155` Node suite pass.
  Live paired calls returned the Spark answer first in `3/3` samples: quick
  `4.0-6.8s`, unchanged quality `gpt-5.4-mini` `8.0-13.6s`. Plugin, manifest
  and connected runtime all report `2.59.20`; live CDP Space behavior also
  remains valid under the new overlay key.

## [2.59.19] - 2026-07-13

### Fixed

- The `Sohbet` textarea now owns plain Space keystrokes on both React and CDP
  popup paths. The CDP capture guard prevents RemNote/PDF reader shortcuts from
  swallowing Space, then inserts it at the active selection and dispatches an
  input event so draft and send-button state remain synchronized.
- Space insertion preserves cursor position, selected-text replacement and
  consecutive spaces. Modified shortcuts such as Ctrl+Space are left alone.

### Verified

- Added source-level regression coverage for both popup implementations,
  including the CDP document-capture guard and React controlled-input update.
- Added `verify_topic_chat_space_live.cjs` to exercise middle-caret,
  consecutive-Space and selected-text replacement behavior in the active
  RemNote page through CDP.

## [2.59.18] - 2026-07-11

### Added

- Added real `Kart` and `Sohbet` tabs to both React and CDP translation
  popups. Chat keeps its history across progressive core/detail rerenders and
  includes the selected expression, source sentence and current card fields.
- Added the read-only `host_translate_topic_chat` action. It reuses the
  startup-warmed `gpt-5.4-mini` model with low reasoning, a compact
  six-message history, disabled heavy Codex features and a 14-second
  single-attempt cap.
- Added quick-question shortcuts, Enter-to-send, Shift+Enter for new lines,
  safe bold/bullet rendering, visible thinking/error states and conversation
  clearing without changing the flashcard or mnemonic result.

## [2.59.17] - 2026-07-11

### Changed

- Clicking the normal `Mnemonic` action now starts the GPT-5.6-Sol Medium
  candidate request immediately and in parallel with the default candidate
  request in both React and CDP popup paths.
- Existing key/promise coalescing remains authoritative, so popup prefetch,
  normal-click triggering, and a later Sol-button click reuse one Sol request.

### Verified

- Source-level ordering tests require Sol to start before the default request
  and preserve the existing duplicate-request coalescing contract.
- `151/151` Node tests, TypeScript, production build and deployment passed;
  active/plugin/manifest is `2.59.17` and connected. The CDP injector was
  restarted from the updated source with a fresh healthy heartbeat.

## [2.59.16] - 2026-07-11

### Fixed

- Added three concrete sound-linked `slump` candidates and a trusted local
  fast path, so curated three-candidate words open without waiting for a model.
- Unknown words now use a focused phonetic-repair lane in parallel with the
  main overgeneration lane. The ranker accepts bounded whole-sound proximity
  such as `slop`/`slump` while exact raw chunks remain vetoed across plus,
  slash, whitespace, and hyphen separators.
- Mnemonic cache schema advanced to v5 to remove pre-repair empty results.
- Two-part model outputs such as `Langirt masasinin... = languish; ...` now
  recover the leading sound hook and are reshaped into the required
  `hook = scene = word; meaning` contract before ranking.

### Verified

- `150/150` Node tests, TypeScript, production build, and deployment passed;
  active/plugin/manifest is `2.59.16` and connected. Live `slump` returned
  three strict trusted candidates in `89 ms` on default and `9 ms` on Sol.
  Uncurated `languish` returned three strict generated candidates in `22.44 s`.

## [2.59.15] - 2026-07-11

### Fixed

- GPT-5.6-Sol Medium now exposes ten diverse finalists to the existing strict
  host ranker instead of only six, reducing one-candidate underfill without
  relaxing raw-split, placeholder-scene, or wrong-meaning vetoes.
- `conceive` now has three trusted concrete scenes (`konsept ciz`, `konsept
  dogur`, `konsepti canlandir`) instead of relying on the abstract single
  `concept ampulu` fallback.
- Mnemonic cache schema advanced to v4 so previous underfilled results cannot
  return after reload.
- Progressive details now run usage (`explanation`, natural patterns, verb
  patterns) and etymology as two focused parallel calls on the same quality
  model, then merge them with the completed quality core.

### Verified

- Live `conceive` returned three strict concrete candidates. The progressive
  `plummet` probe completed quality core in `6.46 s` and parallel details in
  `11.02 s` (`17.48 s` total versus the prior `25.2 s` sample), with general
  meanings, explanation, three natural patterns, four verb patterns,
  etymology, nine sections, and `detailStatus=complete`.

## [2.59.14] - 2026-07-11

### Changed

- Phrasal-verb and natural-pattern rows now split the English construction,
  Turkish meaning, English example, and Turkish example into distinct visual
  levels instead of rendering one uniformly heavy paragraph.
- Pattern rows use subtle dividers rather than nested cards. Construction text
  is semibold, meanings use regular weight, and English examples are italic and
  visually quieter.
- React and CDP translation popups now prefer `Segoe UI Variable Text` on
  Windows and use the same pattern hierarchy.
- The CDP overlay state key was advanced so already-open RemNote pages discard
  the stale renderer and actually load the new typography.

### Verified

- `148/148` formatter/host/CDP tests, TypeScript, and the production build
  passed. Live RemNote DOM reported four structured rows, `700/450/400` term,
  meaning, and example weights, italic English examples, transparent row
  backgrounds, and `Segoe UI Variable Text`. The stale state key was absent.
  Active/plugin/manifest version is `2.59.14`; a live screenshot confirmed the
  hierarchy and divider layout.

## [2.59.13] - 2026-07-11

### Fixed

- Context phrase detection now resolves separable forms such as `Pled it out`
  to the canonical target `plead out`, including the irregular `pled -> plead`
  base mapping.
- The curated detector now covers additional common particle and preposition
  families such as `check in`, `point at`, `call out`, `deal with`, `stand out`,
  and `keep up with` without turning arbitrary neighboring words into phrases.
- Detail cards now include a separate `Phrasal verb ve fiil kalıpları` section
  with legitimate same-verb constructions, Turkish meanings, and bilingual
  examples. Prompts explicitly forbid invented combinations merely to display
  `out`, `at`, or `in`.
- The `plead` family has a deterministic accurate fallback for `plead out`,
  `plead guilty`, `plead with someone`, and `plead for something`.
- The first-paint and quality lanes pin `plead out` to the legal meaning
  `suçunu kabul edip savcılıkla anlaşmak`, preventing isolated-token or vague
  `dava kapatmak` drift.

### Verified

- `147/147` formatter/host/CDP tests, Context Translator `29/29` unit tests,
  fixed and random popup audits, RemNote routing audit, TypeScript, and the
  production build passed. Live `Pled it out` returned target `plead out`,
  surface `Pled it out`, and all four verified `plead` family rows. Active,
  plugin, and manifest version is `2.59.13`.

## [2.59.12] - 2026-07-11

### Fixed

- Etymology generation now requires a specific historical language chain and
  separates the base word's history from inflectional morphology.
- Prompts explicitly distinguish Middle English from Old English and reject
  vague rows such as `çizgisi`, `kökenli sıfat`, or merely `sıfat yapan ek`.
- The `enquire/inquire` family has a deterministic accurate fallback covering
  Middle English, Old French, Latin `inquirere`, and the history/function of
  `-ing`.

### Verified

- Node syntax, TypeScript, production build, and `144/144` formatter/host/CDP/
  React tests passed. The legacy full prompt remained within its `760`-character
  gate at `759`. A live `enquiring` detail response returned three etymology
  rows with all expected language stages and none of the old shallow/error
  phrases. Active/plugin/manifest version is `2.59.12`.

## [2.59.11] - 2026-07-11

### Fixed

- Exact raw target splits such as `enq + uiring` and `enqu + iring` are now
  rejected for every untrusted mnemonic candidate.
- The visible fallback can no longer restore `raw_target_split` or
  `raw_split_placeholder` candidates after the strict ranker rejects them.
- Mnemonic cache schema v3 invalidates previously stored bad candidate sets.
- The `enquiring/inquiring` family now has three distinct concrete
  sound/root-to-meaning anchors instead of fabricated machines or eggs.

### Verified

- TypeScript, production build, and `143/143` formatter/host/CDP/React tests
  passed. A live GPT-5.6-Sol Medium request returned three distinct candidates
  with no raw split or fabricated object; the repeated request returned the
  same clean set from memory cache in `7 ms`. Active/plugin/manifest version is
  `2.59.11` with `pluginConnected=true`.

## [2.59.10] - 2026-07-11

### Fixed

- Detected phrasal verbs are now translated and explained as complete
  multi-word units instead of falling back to the clicked base verb.
- Phrasal-verb details require whole-phrase meaning, particle contribution,
  grammar/placement, exact contextual use, and three full-phrase examples.
- The formatter repairs omitted explanation labels, removes redundant wording
  and contradictory grammar disclaimers, and keeps the safe fallback explicit.
- Progressive host responses now forward `targetText`, `contextPhrase`,
  `explanation`, and `etymology` instead of exposing those values only through
  `translationSections`.

### Verified

- Node syntax, TypeScript, production build, and `143/143` formatter/host/CDP/
  React tests passed. A live `strayed` request resolved to `stray into`, exposed
  all four required explanation labels, returned exactly three full-phrase
  patterns, and contained no contradictory grammar disclaimer. Bridge health
  remained connected on active/plugin/manifest version `2.59.10`.

## [2.59.9] - 2026-07-11

### Fixed

- A successful Sol response whose candidates were all rejected no longer
  returns an empty picker. Strict candidates are preferred, then hard-veto-safe
  model/local candidates, then a deterministic visible fallback completes the
  list.
- Relaxed visible candidates are never written to the strict persistent cache;
  only a revalidated `3/3` strict set remains cacheable.
- The `arouse` word family now has concrete pronunciation-linked local hooks,
  including the `horoz` wake-up scene.

### Verified

- Node syntax, TypeScript, production build, and `140/140` host/formatter/CDP/
  React tests passed. A live request using the screenshot's `aroused` context
  returned three strict candidates (`horoz`, `aruz davulu`, `ara + uyandir`)
  in `15.666s`, stored the strict set, and kept the bridge connected on
  active/plugin/manifest version `2.59.9`.

## [2.59.8] - 2026-07-11

### Changed

- `English synonyms` now appears immediately after `General meanings` and
  before `Contextual meaning` in full cards and progressive core cards.
- The canonical section array drives CDP, React, copy, and RemNote flashcard
  export, so all surfaces keep the same higher synonym position.

### Verified

- Node syntax, TypeScript, production build, and `139/139` formatter/host/CDP/
  React tests passed. A live `host_translate_selection_core` request returned
  `generalMeanings -> englishSynonyms -> contextualMeaning`; bridge health was
  connected on active/plugin/manifest version `2.59.8`.

## [2.59.7] - 2026-07-11

### Changed

- GPT-5.6-Sol Medium mnemonic requests now use a host-level in-flight registry,
  so CDP and React popup prefetches for the same word share one model process.
- Only complete three-candidate results that pass the existing organic mnemonic
  ranker are persisted. Disk and RAM cache hits are revalidated through the
  same quality gate before being returned.
- Sol uses the compact Context Translator contract: it reasons over 10-12
  internal candidates and exposes six diverse
  finalists to the host ranker. Duplicate scenes, split-only variants, and
  syllable-chanting placeholders are rejected before the visible top three.
- A Sol timeout no longer starts the same expensive request a second time. The
  single Medium request has a 42-second ceiling and then uses the existing local
  fallback instead.
- The React Translate popup now begins Sol mnemonic preparation as soon as the
  full quality translation is ready and reuses that promise or cached response
  when the user presses the button.

### Unchanged

- Model, Medium reasoning, visible top-three count, and high-refine behavior
  remain unchanged. App-server streaming is not enabled.

### Verified

- Node syntax, TypeScript, and `139/139` host/formatter/CDP/React tests passed;
  the production build completed. Live `permeate` took `20.461s` on first Sol
  generation, `24ms` from RAM, and `15ms` from disk after a full bridge restart.
- Live health reported `ok=true`, `pluginConnected=true`, `pending=0`, warmup
  `ok`, and active/plugin/manifest version `2.59.7`.

## [2.59.6] - 2026-07-10

### Added

- Full term translations now request a required `generalMeanings` array with
  2-5 distinct common senses and part-of-speech labels. The contextual sense
  comes first; other common sense families follow instead of paraphrasing the
  same meaning.
- The formatter preserves general meanings as numbered, separate lines and
  inserts the `Genel anlamları` section between sentence translation and
  contextual meaning. Partial JSON recovery, cache, in-flight responses,
  complete host responses, popup rendering, copy, and flashcard section export
  share the same field.

### Changed

- Context Translator, the PDF CDP toolbar popup, and the React Translate popup
  now share the same progressive quality contract. `gpt-5.4-mini` first returns
  direct/sentence translation, distinct general meanings, contextual meaning,
  and synonyms through `host_translate_selection_core`.
- `host_translate_selection_details` then reuses that core and adds explanation,
  exactly three natural patterns, and etymology without retranslating it.
- Mnemonic generation remains independent. Partial core results do not expose
  flashcard, mnemonic, or image actions until details complete. The legacy
  `host_translate_selection` route remains the automatic error fallback.

### Verified

- Host/format/CDP/React and 50-word formatter suites passed `134/134`;
  TypeScript validation and the production build passed. Live RemNote reported
  plugin `2.59.6`, and CDP runtime inspection confirmed the injected state has
  `corePrefetchKey` and no legacy `quickPrefetchKey`. Live Context Translator
  `obdurate` showed the quality core in `6.02s`
  and completed details in `12.50s` total. Bridge core/detail probes for
  `trenchant` took `6.92s` and `7.78s`.
- A faster Spark full-card probe mistranslated possessive `Her` as distributive
  “her/every”, while GPT-5.6-Sol took `17.40s`; therefore the quality model was
  not downgraded or replaced.

## [2.59.5] - 2026-07-10

### Changed

- Mnemonic prefetch and manual helper requests now use `gpt-5.6-sol` with
  `medium` reasoning by default. The high-polish action uses the same model
  with `high` reasoning.
- New requests use the `gpt56sol` / `gpt56_sol_*` contract. Legacy `gpt55` and
  `gpt55_*` payloads and environment overrides remain accepted and route to
  the new model so older open clients do not break.
- CDP and React popup labels now identify `5.6 Sol Medium` explicitly.
- Codex executable discovery now prefers the newest managed user copy (including
  `~/.codex/.sandbox-bin`) instead of an older unversioned local binary that
  cannot run GPT-5.6-Sol.

## [2.59.0] - 2026-07-04

### Added

- Added `host_remnote_rontgen_snapshot`, a read-only host diagnostic action
  that combines bridge health, RemNote process inventory, localhost/manifest
  checks, CDP target discovery, live DOM samples, hit-test diagnostics, optional
  console capture, optional screenshot capture, build override checks, DB
  inventory, and SDK surface summary into one report.
- Added `diagnose_remnote_rontgen.ps1` to run the rontgen action and write a
  timestamped JSON report under `Programs/Temp`.
- Added `verify_remnote_rontgen.ps1`, a read-only PASS/FAIL acceptance gate
  that checks bridge health, `get_status`, local manifest version, RemNote CDP
  page target, MCP plugin iframe target, live DOM, optional screenshot,
  `build_overrides` absence, blocking issue flags, and No Bullet Y default-off
  state.
- Added `inspect_all_tagged_bullets.cjs`, a read-only CDP helper for All Tagged
  Bullets forensic checks. It reports the active RemNote target, raw
  `All Tagged Bullets` text matches, row text samples, scroll containers,
  overlay state, and hit-test stacks without clicking or mutating RemNote.
- Capability inspector now lists the rontgen action under plugin runtime, UI
  view diagnostics, SDK surface audit, and internal database read surfaces.

### Safety

- The rontgen action reports `readOnly=true` and `mutationApplied=false`; it
  does not enable plugins, inject CSS, edit RemNote data, or edit
  `build_overrides`.
- The verification script is also read-only. It writes only its JSON report and
  does not enable/disable plugins, inject CSS, edit RemNote data, or edit
  `build_overrides`.
- Process/CDP text redacts token-like values before writing them to reports.

### Verified

- `node --check bridge-host.cjs` passed.
- `npm run check-types` passed.
- `check_action_coverage.ps1 -FailOnUncovered` passed with `152/152` actions
  covered.
- `npm run build` completed with only existing webpack bundle-size warnings.
- `update_remnote_bridge.ps1 -SkipBuild -SkipTypeCheck -ReloadTimeoutSeconds
  25` returned `activeVersion=2.59.0`, `pluginVersion=2.59.0`, manifest
  `2.59.0`, and bridge health `pluginConnected=true`.
- `diagnose_remnote_rontgen.ps1 -CaptureConsoleMs 750 -CaptureScreenshot`
  wrote `Programs/Temp/remnote-rontgen-20260704-091129.json` and screenshot
  `.agent/cache/remnote_rontgen/remnote-rontgen-2026-07-04T06-11-33-111Z-fd019d5e.png`.
- `test_readonly_debug_actions.ps1` passed with `get_status.pluginVersion=2.59.0`
  and `host_remnote_rontgen_snapshot.readOnly=true`.
- `verify_remnote_rontgen.ps1 -CaptureScreenshot` passed with
  `ok=true`, `targetCount=9`, `remnotePageTargetCount=1`,
  `mcpPluginIframeTargetCount=1`, `noBulletIframeTargetCount=0`, no active
  `build_overrides`, no blocking issue flags, and screenshot
  `.agent/cache/remnote_rontgen/remnote-rontgen-2026-07-04T06-51-21-065Z-51420e93.png`.

## [2.58.65] - 2026-07-03

### Fixed

- CDP PDF `Cevir` popup action buttons are more compact and no longer risk
  clipping descenders such as `g`/`y`; labels now use a safer line-height,
  visible overflow, and 36px action buttons.
- The ambiguous `High Parlat` action is now labeled `High Mnemonic`; its
  tooltip explains that it uses GPT-5.5 high to pick and polish one mnemonic
  candidate.
- Empty mnemonic/image candidate panels no longer reserve vertical space.
  Candidate panels stay hidden until candidates or a selected image actually
  exist.
- Section headers are now compact inline chips instead of full-width header
  bars, reducing the visual weight of short sections like `Direkt ceviri`.
- CDP overlay key moved to
  `__mcpRemNoteCevirOverlay25865CompactActionsNoEmptyPanel`; the previous
  `__mcpRemNoteCevirOverlay25865CompactActions` and
  `__mcpRemNoteCevirOverlay25864PopupPersistence` keys are retired.

### Verified

- `node --check remnote-cdp-toolbar-injector.cjs`, `bridge-host.cjs`, and
  `translate-selection-format.cjs` passed.
- `node --test test_cdp_popup_dismiss_behavior.cjs` passed `25/25`.
- `npm run check-types` passed.
- `npm run build` completed with only existing webpack bundle-size warnings.
- `update_remnote_bridge.ps1 -SkipBuild -SkipTypeCheck -ReloadTimeoutSeconds
  25` returned `activeVersion=2.58.65`, `pluginVersion=2.58.65`, manifest
  `2.58.65`, bridge health `ok=true`, and warmup `ok`.
- CDP helper was restarted from the updated file. Live CDP state showed only
  `__mcpRemNoteCevirOverlay25865CompactActionsNoEmptyPanel`; synthetic popup
  measurement showed popup `640x349`, action row `79px`, 36px buttons,
  `candidatePanelDisplay=none`, and inline section headers.

## [2.58.64] - 2026-07-03

### Fixed

- CDP PDF `Cevir` popup no longer disappears on the next helper reinjection
  poll. The overlay now returns early when the current state key is already
  installed, so `removeStalePopupDom()` only cleans popups from retired overlay
  versions.
- CDP overlay key moved to
  `__mcpRemNoteCevirOverlay25864PopupPersistence` and the previous
  `__mcpRemNoteCevirOverlay25861RoomyActionIcons` key is retired so already
  open RemNote windows replace the buggy handler.

### Verified

- `node --check remnote-cdp-toolbar-injector.cjs` passed.
- `node --test test_cdp_popup_dismiss_behavior.cjs` passed.
- `node --check bridge-host.cjs` and `node --check
  translate-selection-format.cjs` passed.
- `node --test test_translate_selection_format.cjs
  test_bridge_host_translation_cache.cjs test_right_sidebar_translate_debug.cjs`
  passed `46/46`; `node --test test_translate_selection_50_case_matrix.cjs`
  passed `50/50`.
- `npm run check-types` passed; `npm run build` completed with only existing
  webpack bundle-size warnings.
- `update_remnote_bridge.ps1 -SkipBuild -SkipTypeCheck -ReloadTimeoutSeconds
  25` returned `activeVersion=2.58.64`, `pluginVersion=2.58.64`, manifest
  `2.58.64`, bridge health `ok=true`, and warmup `ok`.
- CDP helper was restarted from the updated file; live CDP state showed only
  `__mcpRemNoteCevirOverlay25864PopupPersistence`, and a sticky popup remained
  visible after 3.6 seconds plus a helper poll.

## [2.58.63] - 2026-07-03

### Fixed

- PDF `Cevir` term cards now preserve the colored uppercase sentence highlight
  when the Turkish sentence uses a safe paraphrase of the selected word instead
  of repeating `directTranslation` exactly. For example, `arcane` can highlight
  `gizli` inside the sentence even when the direct gloss is
  `gizemli, sirlarla dolu`.
- The term prompt now asks `sentenceHighlightText` to be an exact substring
  from `sentenceTranslation` for the selected word or phrase.

### Verified

- `node --check bridge-host.cjs`, `node --check
  remnote-cdp-toolbar-injector.cjs`, and `node --check
  translate-selection-format.cjs` passed.
- `node --test test_translate_selection_format.cjs
  test_cdp_popup_dismiss_behavior.cjs test_bridge_host_translation_cache.cjs
  test_right_sidebar_translate_debug.cjs` passed `70/70`.
- `node --test test_translate_selection_50_case_matrix.cjs` passed `50/50`.
- A direct formatter smoke for `arcane` returned sentence `highlightText:
  "gizli"`.
- `npm run check-types` passed; `npm run build` completed with only existing
  webpack bundle-size warnings.
- `update_remnote_bridge.ps1 -SkipBuild -SkipTypeCheck -ReloadTimeoutSeconds
  25` returned `activeVersion=2.58.63`, `pluginVersion=2.58.63`, manifest
  `2.58.63`, bridge health `ok=true`, and warmup `ok`.

## [2.58.62] - 2026-07-03

### Changed

- PDF `Cevir` term cards now render `Etimoloji` as the final section, after
  natural patterns, mnemonic, and English synonyms. This keeps the main learning
  fields higher in the popup while preserving etymology content.

### Verified

- `node --check bridge-host.cjs`, `node --check
  remnote-cdp-toolbar-injector.cjs`, and `node --check
  translate-selection-format.cjs` passed.
- `node --test test_translate_selection_format.cjs
  test_cdp_popup_dismiss_behavior.cjs test_bridge_host_translation_cache.cjs
  test_right_sidebar_translate_debug.cjs` passed `69/69`.
- `node --test test_translate_selection_50_case_matrix.cjs` passed `50/50`.
- `npm run check-types` passed; `npm run build` completed with only existing
  webpack bundle-size warnings.
- `update_remnote_bridge.ps1 -SkipBuild -SkipTypeCheck -ReloadTimeoutSeconds
  25` returned `activeVersion=2.58.62`, `pluginVersion=2.58.62`, manifest
  `2.58.62`, bridge health `ok=true`, and warmup `ok`.

## [2.58.61] - 2026-07-03

### Changed

- CDP PDF `Cevir` popup now sizes to a roomier responsive width up to 640px
  instead of feeling like the content is squeezed into a small box.
- `Mnemonic`, `Gorsel`, `5.5 Medium`, `High Parlat`, and
  `Flashcard'a aktar` actions now render through an icon+label helper, so the
  icon remains visible while temporary labels such as `5.5...`,
  `Gorsel...`, and `Aktariliyor...` are shown.
- CDP overlay key moved to
  `__mcpRemNoteCevirOverlay25861RoomyActionIcons` so already-open RemNote
  windows retire the older injected UI.

### Verified

- `node --check bridge-host.cjs`, `node --check
  remnote-cdp-toolbar-injector.cjs`, and `node --check
  translate-selection-format.cjs` passed.
- `node --test test_cdp_popup_dismiss_behavior.cjs
  test_bridge_host_translation_cache.cjs test_translate_selection_format.cjs
  test_right_sidebar_translate_debug.cjs` passed `69/69`.
- `node --test test_translate_selection_50_case_matrix.cjs` passed `50/50`.
- `npm run check-types` passed; `npm run build` completed with only existing
  webpack bundle-size warnings.
- `update_remnote_bridge.ps1 -SkipBuild -SkipTypeCheck -ReloadTimeoutSeconds
  25` returned `activeVersion=2.58.61`, `pluginVersion=2.58.61`, manifest
  `2.58.61`, bridge health `ok=true`, and warmup `ok`.
- CDP toolbar helper was restarted from the updated file (`pid=27816`), stderr
  stayed empty, and live CDP DOM inspection showed only
  `__mcpRemNoteCevirOverlay25861RoomyActionIcons` installed.

## [2.58.60] - 2026-07-03

### Fixed

- PDF `Cevir` term explanations no longer leak model-internal language labels
  such as `**EN:**` and `**TR:**` into the visible popup. The term prompt now
  asks for short Turkish explanation bullets without EN/TR labels, and the
  host formatter defensively keeps the Turkish side if an older labeled model
  response still arrives.

### Verified

- `node --check bridge-host.cjs`, `node --check
  remnote-cdp-toolbar-injector.cjs`, and `node --check
  translate-selection-format.cjs` passed.
- `node --test test_translate_selection_format.cjs
  test_cdp_popup_dismiss_behavior.cjs test_bridge_host_translation_cache.cjs
  test_right_sidebar_translate_debug.cjs` passed `69/69`.
- `node --test test_translate_selection_50_case_matrix.cjs` passed `50/50`.
- `npm run check-types` passed; `npm run build` completed with only existing
  webpack bundle-size warnings.
- `update_remnote_bridge.ps1 -SkipBuild -SkipTypeCheck -ReloadTimeoutSeconds
  25` returned `activeVersion=2.58.60`, `pluginVersion=2.58.60`, manifest
  `2.58.60`, bridge health `ok=true`, and warmup `ok`.

## [2.58.59] - 2026-07-03

### Fixed

- CDP `Cevir` overlay now removes stale `.mcp-cdp-cevir-popup` nodes during
  reinjection and normal cleanup. This prevents already-open RemNote windows
  from showing the older inline `Direkt ceviri:` / `Cumle cevirisi:` UI after
  a new helper build is loaded.
- PDF `Cevir` action buttons now use a stable grid hierarchy: Mnemonic,
  Gorsel, 5.5 Medium, and High Parlat share one row, while
  `Flashcard'a aktar` occupies its own full-width row. This avoids the
  export button drifting to the far right when the popup is narrow.

### Verified

- `node --check bridge-host.cjs`, `node --check
  remnote-cdp-toolbar-injector.cjs`, and `node --check
  translate-selection-format.cjs` passed.
- `node --test test_cdp_popup_dismiss_behavior.cjs` passed `24/24`.
- `node --test test_bridge_host_translation_cache.cjs
  test_translate_selection_format.cjs test_right_sidebar_translate_debug.cjs
  test_translate_selection_50_case_matrix.cjs` passed `94/94`.
- `npm run check-types` passed; `npm run build` completed with only existing
  webpack bundle-size warnings.
- `update_remnote_bridge.ps1 -SkipBuild -SkipTypeCheck -ReloadTimeoutSeconds
  25` returned `activeVersion=2.58.59`, `pluginVersion=2.58.59`, manifest
  `2.58.59`, bridge health `ok=true`, and warmup `ok`.
- Live CDP DOM smoke showed only
  `__mcpRemNoteCevirOverlay25859StalePopupCleanup`, four icon section
  headers for a controlled translation, no legacy inline prefixes, action
  grid display enabled, `Flashcard'a aktar` on `gridColumn: 1 / -1`, and
  `popupCountAfterCleanup=0`.

## [2.58.40] - 2026-06-25

### Fixed

- PDF translate now retries one transient Codex timeout before surfacing a
  popup error. This protects the visible `Cevir` click when it coalesces onto a
  prefetch in-flight request whose first Codex process times out after 45s.
- Translate traces now include `codex_retry` and retry timing metadata so the
  sidebar debug panel can show whether a timeout was recovered or failed twice.

## [2.58.39] - 2026-06-25

### Fixed

- PDF translate term cards now have a broad tested mnemonic fallback set for 50
  different words. When the model returns an empty or weak mnemonic, the
  formatter can still keep a `Mnemonic` section with a concrete sound/root cue,
  a visual scene, and the Turkish meaning.
- Added a regression gate that rejects label/definition tricks such as
  `yazili`, `gibi dusun`, `diye dusun`, dictionary definitions, or raw-prefix
  placeholders.

## [2.58.38] - 2026-06-24

### Fixed

- PDF translate natural usage patterns now ask for 4-5 English collocation/usage
  rows instead of only two. The formatter keeps up to six rows, so examples like
  `take slander`, `face slander`, `spread slander`, `slander someone as a liar`,
  and `defend against slander` can all survive into the popup and flashcard
  `Detaylar`.

## [2.58.37] - 2026-06-24

### Added

- PDF translate term cards now include a `Doğal kalıplar` section. The model
  is asked for two natural English collocations/usages with Turkish use/example
  text, and the generic `translationSections` flow shows the section in the
  popup and exports it under `Detaylar` in flashcards.

## [2.58.36] - 2026-06-24

### Fixed

- PDF translate sentence highlighting now has a tested contextual-head fallback
  for multi-word terms. If the full direct translation is paraphrased in the
  sentence, a substantial translated head word such as `goruntuye` can still be
  highlighted, while short connector words such as `beri` remain blocked.

## [2.58.35] - 2026-06-24

### Fixed

- Added a tested safe mnemonic fallback for `transfixed` / `transfix` so PDF
  translate flashcards keep the `Mnemonic` detail when the model returns an
  empty or weak mnemonic. Existing section order and flashcard shape are
  unchanged.

## [2.58.34] - 2026-06-24

### Changed

- Pins the MCP Bridge right-sidebar tab to the first position in RemNote's
  document sidebar tab strip. The CDP helper reapplies the order after RemNote
  rerenders the tab row and exposes the reorder helper in live diagnostics.

## [2.58.33] - 2026-06-24

### Fixed

- Preserved PDF translate sentence highlights when exporting popup results as
  RemNote flashcards. Highlighted sentence text is now encoded with the
  existing inline Yellow rich-text marker before it is written into `Detaylar`.

## [2.58.32] - 2026-06-24

### Fixed

- Added a tested safe mnemonic fallback for `forebears` / `forebear` so PDF
  translate flashcards keep the `Mnemonic` detail when the model returns an
  empty or weak mnemonic. Existing section order and flashcard shape are
  unchanged.

## [2.58.31] - 2026-06-24

### Changed

- The right sidebar `TRANSLATE DEBUG` card now starts collapsed and exposes its
  full trace details behind an accessible toggle header. The compact header
  keeps the status, mode, time, and short trace label visible without pushing
  the rest of the sidebar downward.

## [2.58.30] - 2026-06-24

### Added

- PDF `Cevir` popup flashcard export now writes the same card to both the
  canonical `ingilizce kelimeler` page and the active PDF page parsed from the
  RemNote paired PDF URL. This keeps the global vocabulary collection intact
  while making the word visible beside the PDF document.
- The popup status now reports per-target success, so a partial failure can show
  which destination failed.

## [2.58.29] - 2026-06-24

### Fixed

- Actively unregister retired PDF highlight translation surfaces on plugin
  activation. RemNote can keep old widget registrations in its runtime registry
  after a reload, so `translate_toolbar`,
  `translate_pdf_highlight_popup`, and the old PDF highlight popup menu item
  are now removed explicitly before the remaining translate surfaces are
  registered.

## [2.58.28] - 2026-06-24

### Fixed

- Removed the old plugin-side PDF highlight translation surfaces:
  `WidgetLocation.PDFHighlightToolbarLocation`,
  `WidgetLocation.PDFHighlightPopupLocation`, and the
  `PluginCommandMenuLocation.PDFHighlightPopupLocation` menu item. Highlighting
  a word and clicking the existing yellow highlight should no longer show extra
  `Cevir` entries.
- Removed the older plugin DOM fallback button
  `.mcp-pdf-selection-toolbar-cevir`. The CDP toolbar helper is now the single
  PDF selected-text `Cevir` injector, so old plugin injection cannot duplicate
  the button beside the newer CDP button.

## [2.58.27] - 2026-06-23

### Added

- Added a `Mnemonic` section to word/short-phrase PDF translation results.
  Sentence-like selections still return only the direct Turkish sentence
  translation. The existing flashcard export flow automatically stores the new
  mnemonic section under `**Detaylar**` with the other non-direct sections.
- Added a `Flashcard'a aktar` action to the CDP PDF translation popup. It uses
  the existing `create_flashcard` bridge action: selected PDF text becomes the
  card front, `Direkt ceviri` becomes the back, and the remaining popup
  sections are stored under a top-level `**Detaylar**` Extra Card Detail tree.
- Verified the live PDF page payload shape without creating a test card:
  selected text maps to `front`, direct translation maps to `back`, and the
  visible remaining sections map to `**Detaylar**` children.

### Fixed

- Repaired a post-update startup state where RemNote was open but the local
  bridge reported `pluginConnected=false`. Running
  `sync_remnote_dev_plugin.ps1 -ForceRestart` restarted RemNote with
  `--remote-debugging-port=9233`, resynced the local manifest, and restored
  bridge connectivity with active plugin `2.58.27`.
- Verified the repaired runtime through `/health`, `get_status`,
  `capability_inspector`, and a live CDP page check: the bridge had
  `pluginConnected=true`, one connected client, `create_flashcard` available,
  and the PDF page contained the `Cevir` popup/flashcard export state.
- Made the CDP PDF translation popup responsive to small RemNote windows. The
  popup now uses border-box sizing, clamps itself within the viewport, limits
  height to the available space, scrolls internally, and flips above the PDF
  selection toolbar when there is not enough room below it.
- Fixed model-provided HTML markup leaking into the PDF translation popup and
  flashcard details. The term prompt no longer uses the ambiguous word `span`,
  the host formatter strips HTML-like tags from model output, and the CDP
  popup/flashcard builder sanitizes section values defensively before display
  or export.
- Tightened mnemonic quality for PDF translation results. Definition-like
  mnemonics such as `word = dictionary explanation` or `gibi dusun` are rejected
  and replaced, when possible, with a keyword-style memory scene in the form
  `cue = concrete TR scene = meaning`.
- Raw first-letter chunks such as `mund = ...` are no longer accepted as useful
  fallback hooks. `mundane` now has a specific `mundane / Monday` memory scene,
  and unknown words with no meaningful cue simply omit the mnemonic instead of
  showing a misleading raw-letter card.

## [2.58.26] - 2026-06-23

### Added

- Added speculative selected-text translation prefetch for the CDP PDF toolbar
  button. When the RemNote PDF selection toolbar is visible and the selected
  text is stable for a short delay, the helper warms the existing host
  translation cache in the background. Pressing `Cevir` can then return from
  cache instead of starting the model call at click time.
- Prefetch traces use an internal source prefix so the user-facing Translate
  Debug panel keeps showing explicit click requests rather than background
  cache warmups.
- Verified the cache-warm path live: a background prefetch took the model path
  once, then the matching explicit toolbar request returned from cache in
  milliseconds.

## [2.58.25] - 2026-06-23

### Fixed

- Further compacted selected-text translation prompts without changing the
  model or output schema. Term prompts keep the same structured fields but use
  shorter fill rules; sentence prompts keep the direct sentence-translation
  JSON response.

## [2.58.24] - 2026-06-23

### Added

- Added structured selected-text translation modes for RemNote PDF reading.
  Sentence-like selections return only the direct Turkish sentence
  translation. Word or short-phrase selections now return ordered sections:
  direct translation, sentence translation, contextual meaning, and English
  synonyms.
- Added shared host formatting tests and surfaced the selected translation mode
  in popup/debug output. The CDP toolbar popup uses the same structured result
  as the RemNote popup.

### Fixed

- Made the CDP toolbar translation popup dismiss on outside click or Escape
  while preserving clicks inside the popup and on the `Cevir` button.
- Narrowed term-selection prompts to the sentence containing the selected term
  and added a bounded 10-minute host cache for repeated identical translation
  requests.
- Compacted the structured term prompt without changing the model, keyed the
  cache by the effective prompt instead of raw PDF context, and coalesced
  simultaneous identical translation requests so double clicks do not spawn
  duplicate model calls.
- Restored Turkish characters in structured translation labels and rendered the
  selected term's sentence-level Turkish counterpart as uppercase colored text
  in both the RemNote popup and the CDP PDF toolbar popup.

## [2.58.23] - 2026-06-23

### Fixed

- Added a CDP toolbar injector fallback for RemNote's native PDF selection
  toolbar. The SDK widget registry can report the translation widgets as
  registered while the native black toolbar still renders no plugin widget.
  The helper connects to RemNote on port `9233`, injects a visible `Cevir`
  button beside `Explain`, and reads PDF selection text from RemNote's
  `selectedTextData` React props before calling the existing read-only
  `host_translate_selection` flow.
- Added `start_remnote_pdf_translate.ps1` and
  `start_remnote_cdp_toolbar_injector.ps1` to launch RemNote with
  `--remote-debugging-port=9233` and keep the toolbar injector running.

## [2.58.22] - 2026-06-23

### Fixed

- Registered the selected-text translation button with unique widget entrypoint
  files for `SelectedTextMenu` and `PDFHighlightPopupLocation`, in addition to
  the existing PDF highlight toolbar registration. This avoids RemNote silently
  ignoring repeated registrations that reuse the same widget file name.
- Shortened the toolbar label to `Cevir` so it has a better chance of fitting
  into RemNote's compact PDF selection toolbar.

## [2.58.20] - 2026-06-23

### Added

- Added a visible `AI Cevir` widget button to RemNote's PDF highlight toolbar
  via `WidgetLocation.PDFHighlightToolbarLocation`. Selecting PDF text should
  now show the button directly in the selection toolbar instead of requiring a
  hidden menu entry.
- Registered the toolbar widget alongside the existing read-only translation
  popup and refreshed the widget loader cache token.

## [2.58.19] - 2026-06-23

### Fixed

- Hid internal smoke/test translation traces from the default user-facing
  Translate Debug snapshot so validation probes do not leave a stale visible
  error in the RemNote sidebar.
- Hardened selected-text capture for PDF/Reader menus by searching nested action
  argument fields and falling back to `window.getSelection()` when available.
- Added the trace source to the right sidebar debug details.

## [2.58.18] - 2026-06-23

### Added

- Added read-only trace/debug visibility for the selected-text translation
  popup. Translation requests now carry a `traceId`, record stage timing to a
  local JSONL log, expose `host_translate_debug`, and show the latest trace in
  the right sidebar.
- Popup failures now show the trace id, failing stage, error class, and a short
  recovery hint without writing to RemNote content.

## [2.58.17] - 2026-06-23

### Added

- Added a read-only selected-text translation popup for RemNote/PDF reading.
  The plugin registers command/menu entries, opens a local popup, and asks the
  bridge host to translate the selected text with Codex. The flow does not
  create notes, flashcards, highlights, or knowledge-base mutations.

## [2.58.16] - 2026-06-19

### Fixed

- Added scheduled-task rescue support for the local RemNote MCP stack. The
  host startup script can now repair repeated `pluginConnected=false` states
  while RemNote is running, and the local Windows task can call that repair
  mode on a 1-minute rescue cadence.
- Bumped the local development plugin version so RemNote status and sidebar
  checks visibly distinguish this recovery build from `2.58.15`.

## [2.58.0] - 2026-05-31

### Public catch-up

- GitHub-facing documentation has been updated from the old `1.1.4` marketplace
  description to the current `2.58.0` bridge line.
- Added a new full comparison document:
  `docs/COMPARISON_V1.1.4_TO_V2.58.0.md`.
- Added user-facing release notes:
  `docs/RELEASE_V2.58.0.md`.
- Added `public/manifest.marketplace.json` for packaging the existing public
  plugin ID `remnote-mcp-bridge-y-edition` without overwriting the local
  development manifest ID.

### Added since the old marketplace release

- Expanded the bridge from the v1.1.4 note/table helper set to 150 covered
  bridge actions.
- Added SDK-visible full vault reads, single-file JSONL exports, partitioned
  resumable exports, host-side query/stats/schema/field/quality/diff/graph
  tooling, and graph JSONL file packages.
- Added read-only internal database forensic tools for IndexedDB inventory/store
  reads and copied LevelDB snapshot scan/decode/log/entity-index/SDK-map/graph
  workflows. Direct internal DB writes remain blocked.
- Added capability inspector and host-side SDK surface gap reporting.
- Added RemNote Doctor, Learning Inbox, Safe Migration dry-run/apply/rollback
  validation, and audit-log workflows.
- Added flashcard, cloze, card catalog, practice queue export, and confirmed
  card/practice control actions.
- Added tag/template/property/table/folder/document/native-icon/callout/powerup
  workflows.
- Added graph/reference/source/portal/alias/link-rem workflows.
- Added RichText parsing, inspection, range formatting, and confirmation-gated
  HTML import.
- Added typed context inspectors and confirmation-gated controls for App,
  Window, Editor, Queue, Plugin Runtime, Events, Reader, Scheduler, RemObject
  State, and RemObject Structure.

### Safety and validation

- Dangerous actions now require explicit confirmation strings; destructive Rem
  merge operations require an additional `MERGE_REM` confirmation.
- Internal database tools are read-only and operate on copied snapshots or host
  cache files.
- Current expected coverage is `150 action, 150 covered, 0 uncovered`.
- Current expected live health is `pluginConnected=true` and
  `pluginVersion=2.58.0`.

## [1.7.7] - 2026-03-11

### Changed

- Startup bootstrap now starts the watchdog with both RemNote restart recovery and version-sync enabled.
- Bootstrap now inspects both plugin connection state and active-vs-manifest version before deciding whether a startup sync is needed.

### Fixed

- Plugin status and activation logs are aligned to `v1.7.6`; stale `1.7.5` constants no longer trigger false mismatch diagnostics.
- Reboot / reopen flow is now more resilient when RemNote comes up with the old plugin bundle or with no live MCP connection.

## [1.7.6] - 2026-03-10

### Changed

- Right sidebar polling interval was relaxed from `2s` to `10s` to reduce background churn.
- Watchdog defaults were relaxed to a `90s` poll interval with a `600s` recovery cooldown.
- Startup bootstrap now launches only the lightweight ensure/watch/reconnect path.

### Fixed

- Localhost manifest server now serves a stable plugin `id`; it no longer mutates the plugin identity per request.
- Reconnect sync flow now tolerates a disconnected `3005/call` response and can proceed to RemNote restart when needed.

## [1.7.5] - 2026-03-10

### Added

- Right sidebar now includes `Reload Plugin` and `Open PI OS` quick actions for faster recovery and navigation.

### Changed

- Plugin version alignment updated to `v1.7.5`.

### Fixed

- Structured note write flows now persist section `imageUrls` instead of dropping source images during create/update.
- Local operator guidance now documents that RemNote should be relaunched via `explorer.exe` shell invocation when automation needs to restart the desktop app.

## [1.7.4] - 2026-03-10

### Added

- Right sidebar now shows `UPDATE STATUS` with:
  - active loaded plugin version
  - localhost manifest version
  - manifest host label
- Clear mismatch warning when the loaded plugin is older than the localhost build.
- Auto-builder/runtime status is exposed from the local bridge host and shown in the right sidebar.
- New bridge actions:
  - `list_children`
  - `open_note`

### Changed

- Default localhost manifest port is now `8080`.
- `get_status` and the right sidebar are aligned around `v1.7.4`.

## [1.6.0] - 2026-03-08

### Added

- New sidebar shortcut actions:
  - `get_sidebar_shortcuts`
  - `set_sidebar_shortcuts`
  - `add_sidebar_shortcut`
  - `remove_sidebar_shortcut`
- Left sidebar widget `left_sidebar_shortcuts` backed by synced plugin storage.
- Plugin-managed shortcut flow for high-priority pages like `Personal Intelligence OS`.

### Changed

- `get_status` now reports `1.6.0`.
- README now explains the bridge-managed left sidebar approach because native RemNote pin/favorite APIs are not exposed by the current SDK.

## [1.5.0] - 2026-03-08

### Added

- New personal-intelligence actions:
  - `find_or_create_path`
  - `upsert_structured_note`
  - `batch_ingest_records`
- Shared section-writer flow so structured summaries and vNext note upserts use the same deterministic layout engine.
- Metadata block support in structured writes for source URL, capture timestamp, content type, and similar fields.

### Changed

- `get_status` now reports `1.5.0`.
- README now documents the vNext bridge surface and personal intelligence spec.

## [1.1.4] - 2026-02-18

### Added

- New MCP actions:
  - `move_note`
  - `delete_note`
  - `overwrite_note_content`
  - `create_structured_summary`
  - `create_table`
  - `create_property`
  - `set_tag_property_value`
  - `count_books_table` (debug)
  - `count_tagged_rems` (debug)
  - `debug_window_context` (debug)
  - `debug_focused_page_children_raw` (debug)
  - `inspect_rem_relations` (debug)
  - `debug_rem_raw_text` (debug)
- Turkish-aware normalization for matching/search fallbacks.
- Table row-tag resolution logic to avoid writing to the wrong Rem when using table IDs.

### Changed

- WebSocket client now accepts both:
  - Custom bridge payload format (`{ action, payload }`)
  - JSON-RPC 2.0 request format (`{ jsonrpc, method, params }`)
- Bridge connection lifecycle moved to plugin activation (`src/widgets/index.tsx`) and no longer depends on sidebar widget mount state.
- `create_note` / `update_note` workflows expanded with heading/document/quote/list controls.
- Development server default port changed to `8081`.
- Plugin manifest identity updated to:
  - `id: remnote-mcp-bridge-y-edition`
  - `name: MCP Bridge (Y Edition)`

### Fixed

- Heading persistence issues when updating title text.
- Books table counting errors where visible rows did not match actual tagged table rows.
- Name matching issues for Turkish characters in some search/lookup paths.

## [1.1.3] - 2026-02-18

### Changed

- Stability baseline and bridge behavior cleanup.

## [1.1.0] - Baseline

- Initial release baseline inherited from upstream and from `origin/main` in this fork.
