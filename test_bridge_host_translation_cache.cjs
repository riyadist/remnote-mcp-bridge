const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const source = fs.readFileSync(path.join(__dirname, 'bridge-host.cjs'), 'utf8');
const startBridgeSource = fs.readFileSync(path.join(__dirname, 'start_bridge_host.ps1'), 'utf8');

test('host translation path has a bounded cache before Codex spawn', () => {
  assert.match(source, /TRANSLATE_SELECTION_CACHE_TTL_MS/);
  assert.match(source, /TRANSLATE_SELECTION_CACHE_MAX/);
  assert.match(source, /const\s+translateSelectionCache\s*=\s*new Map\(\)/);
  assert.match(source, /const\s+translateSelectionInFlight\s*=\s*new Map\(\)/);
  assert.match(source, /function\s+getCachedTranslation\s*\(/);
  assert.match(source, /function\s+setCachedTranslation\s*\(/);
  assert.match(source, /function\s+getInFlightTranslation\s*\(/);
  assert.match(source, /function\s+setInFlightTranslation\s*\(/);

  const cacheKeyIndex = source.indexOf('const cacheKey = createTranslationCacheKey(selectedText, contextText, prompt, selectedTranslationModel);');
  assert.ok(cacheKeyIndex > 0, 'cache key must include the effective prompt and selected lane model');
  assert.doesNotMatch(
    source,
    /model:\s*TRANSLATE_SELECTION_MODEL,\s*selectedText,\s*contextText,\s*prompt/,
    'cache key must not include raw context text after prompt compaction'
  );

  const cacheLookupIndex = source.indexOf('const cachedTranslation = getCachedTranslation(cacheKey);');
  const inFlightLookupIndex = source.indexOf('const inFlightTranslation = getInFlightTranslation(cacheKey);');
  const codexRunIndex = source.indexOf('runCodexTranslationWithRetry(prompt, trace, {', cacheKeyIndex);
  assert.ok(cacheLookupIndex > 0, 'cache lookup must exist');
  assert.ok(inFlightLookupIndex > cacheLookupIndex, 'in-flight lookup must happen after cache lookup');
  assert.ok(codexRunIndex > cacheLookupIndex, 'cache lookup must happen before Codex execution');
  assert.ok(codexRunIndex > inFlightLookupIndex, 'in-flight lookup must happen before Codex execution');
  assert.match(source, /debugStage:\s*'cache'/);
  assert.match(source, /debugStage:\s*'inflight'/);
});

test('host translation exposes a separate quick first-paint action', () => {
  assert.match(source, /'host_translate_selection_quick'/, 'quick host action should be registered');
  assert.match(source, /function\s+buildQuickTranslationPrompt\s*\(/, 'quick prompt wrapper should exist');
  assert.match(source, /payload\.quick\s*===\s*true/, 'translateSelection should distinguish quick requests');
  assert.match(source, /buildQuickTranslationPrompt\(selectedText,\s*contextText\)/, 'quick requests should use the small prompt');
  assert.match(source, /normalizeQuickTranslationOutput\(rawTranslation,\s*selectedText,\s*contextText\)/, 'quick responses should use the partial normalizer');
  assert.match(source, /action\s*===\s*'host_translate_selection_quick'/, 'dispatcher should route quick action');
  assert.match(source, /quick:\s*true/, 'dispatcher should pass quick=true');
  assert.match(source, /mode:\s*isQuick\s*\?\s*'host_translate_selection_quick'\s*:\s*'host_translate_selection'/);
  assert.match(source, /TRANSLATE_SELECTION_MODEL/);
  assert.match(source, /REMNOTE_TRANSLATE_QUICK_CODEX_MODEL/);
  assert.match(source, /isQuick\s*\?\s*TRANSLATE_SELECTION_QUICK_MODEL\s*:\s*TRANSLATE_SELECTION_MODEL/);
  assert.match(source, /runCodexTranslationWithRetry\(prompt,\s*trace,\s*\{[\s\S]*?model:\s*selectedTranslationModel/);
  const responseModels = source.match(/model:\s*selectedTranslationModel/g) || [];
  assert.ok(responseModels.length >= 4, 'trace plus cache, in-flight, and complete responses must report the selected lane model');
});

test('host translation exposes progressive quality core and detail actions', () => {
  assert.match(source, /'host_translate_selection_core'/);
  assert.match(source, /'host_translate_selection_details'/);
  assert.match(source, /function\s+translateSelectionProgressive\s*\(/);
  assert.match(source, /buildCoreTranslationPrompt\(selectedText,\s*contextText\)/);
  assert.match(source, /buildDetailUsagePrompt\(selectedText,\s*contextText,\s*coreResult\)/);
  assert.match(source, /buildDetailEtymologyPrompt\(selectedText,\s*contextText,\s*coreResult\)/);
  assert.match(source, /normalizeCoreTranslationOutput\([\s\S]*?rawTranslation,[\s\S]*?selectedText,[\s\S]*?contextText/);
  assert.match(source, /targetText:\s*normalizedTranslation\.targetText/);
  assert.match(source, /contextPhrase:\s*normalizedTranslation\.contextPhrase/);
  assert.match(source, /explanation:\s*normalizedTranslation\.explanation/);
  assert.match(source, /etymology:\s*normalizedTranslation\.etymology/);
  assert.match(source, /verbPatterns:\s*normalizedTranslation\.verbPatterns/);
  assert.match(source, /Promise\.all\(detailPrompts\.map/);
  assert.match(source, /mergeDetailTranslationOutputs\(rawDetails\)/);
  assert.match(source, /normalizeDetailTranslationOutput\([\s\S]*?rawTranslation,[\s\S]*?selectedText,[\s\S]*?contextText,[\s\S]*?coreResult/);
  assert.match(source, /translateSelectionProgressive\(payload,\s*'core'\)/);
  assert.match(source, /translateSelectionProgressive\(payload,\s*'details'\)/);
  assert.match(source, /model:\s*TRANSLATE_SELECTION_MODEL,[\s\S]*?reasoningEffort:\s*'low'/);
  assert.match(source, /function\s+hasCompleteProgressiveDetails\s*\(/);
  assert.match(source, /function\s+hasUsableProgressiveDetails\s*\(/);
  assert.match(source, /REPAIR PASS: The previous usage result omitted one or more required fields/);
  const progressiveStart = source.indexOf('async function translateSelectionProgressive');
  const progressiveEnd = source.indexOf('async function getTranslateTopicChat', progressiveStart);
  const progressiveSource = source.slice(progressiveStart, progressiveEnd);
  const detailValidationIndex = progressiveSource.indexOf("startTranslateStage(trace, 'detail_validation')");
  const cacheWriteIndex = progressiveSource.lastIndexOf('setCachedTranslation(cacheKey, normalizedTranslation)', detailValidationIndex);
  assert.ok(detailValidationIndex > 0, 'progressive details should expose their validation result in traces');
  assert.ok(cacheWriteIndex > 0, 'validated progressive results should still use the bounded cache');
  assert.ok(
    progressiveSource.indexOf('hasCompleteProgressiveDetails(normalizedTranslation)', cacheWriteIndex - 220) >= 0,
    'progressive detail cache writes must be guarded by complete enrichment validation'
  );
  assert.match(progressiveSource, /translateSelectionCache\.delete\(cacheKey\)/, 'legacy invalid detail cache entries should be evicted');
  assert.match(progressiveSource, /detailStatus:\s*'details_partial'/, 'usable partial enrichment should remain visible instead of failing the whole card');
});

test('host translation exposes a fast context-aware topic chat action', () => {
  assert.match(source, /'host_translate_topic_chat'/, 'topic chat action should be registered as a host action');
  assert.match(source, /'host_translate_topic_chat_quick'/, 'quick topic chat action should be registered separately');
  assert.match(source, /TRANSLATE_TOPIC_CHAT_MODEL/);
  assert.match(source, /TRANSLATE_TOPIC_CHAT_QUICK_MODEL/);
  assert.match(source, /REMNOTE_TRANSLATE_TOPIC_CHAT_MODEL/);
  assert.match(source, /REMNOTE_TRANSLATE_TOPIC_CHAT_QUICK_MODEL/);
  assert.match(source, /TRANSLATE_TOPIC_CHAT_TIMEOUT_MS/);
  assert.match(source, /TRANSLATE_TOPIC_CHAT_QUICK_TIMEOUT_MS/);
  assert.match(source, /REMNOTE_TRANSLATE_TOPIC_CHAT_TIMEOUT_MS\s*\|\|\s*22000/);
  assert.match(source, /REMNOTE_TRANSLATE_TOPIC_CHAT_QUICK_TIMEOUT_MS\s*\|\|\s*12000/);
  assert.match(source, /TRANSLATE_TOPIC_CHAT_HISTORY_LIMIT\s*=\s*6/);
  assert.match(source, /TRANSLATE_TOPIC_CHAT_MODEL\s*=\s*String\([\s\S]*?TRANSLATE_SELECTION_MODEL/);
  assert.match(source, /TRANSLATE_TOPIC_CHAT_QUICK_MODEL\s*=\s*String\([\s\S]*?TRANSLATE_SELECTION_QUICK_MODEL/);
  assert.match(source, /function\s+buildTranslateTopicChatPrompt\s*\(/);
  assert.match(source, /resolveTopicChatFollowUp\(question,\s*normalizedHistory\)/);
  assert.match(source, /classifyTopicChatIntent\(question, payload\.messages, payload\.sceneContext\)/);
  assert.match(source, /topicChatIntentInstructions\(intent\)/);
  assert.match(source, /questionIntent:\s*topicChatIntent\.classifyTopicChatIntent\(question, payload\.messages, payload\.sceneContext\)\.kind/);
  assert.match(source, /DEVAM MESAJI ONCELIGI/);
  assert.match(source, /O teklifte vaat edilen konuyu simdi dogrudan tamamla/);
  assert.match(source, /Phrasal verb varsa butun kalibi esas al/);
  assert.match(source, /En fazla 220 kelime yaz/);
  assert.match(source, /en fazla 90 kelime yaz/);
  assert.match(source, /async function\s+getTranslateTopicChat\s*\(/);
  assert.match(source, /buildTranslateTopicChatPrompt\(payload,\s*\{\s*quick:\s*isQuick\s*\}\)/);
  assert.match(source, /runCodexTranslation\([\s\S]*?timeoutMs[\s\S]*?model:\s*selectedModel[\s\S]*?reasoningEffort:\s*'low'/);
  assert.match(source, /isQuick\s*\?\s*TRANSLATE_TOPIC_CHAT_QUICK_MODEL\s*:\s*TRANSLATE_TOPIC_CHAT_MODEL/);
  assert.match(source, /mode:\s*isQuick\s*\?\s*'host_translate_topic_chat_quick'\s*:\s*'host_translate_topic_chat'/);
  assert.match(source, /function\s+warmTopicChatModelAsync\s*\(/, 'fast chat model should be warm before the first question');
  assert.match(source, /topicChatWarmup/);
  assert.match(source, /mutationApplied:\s*false/);
  assert.match(source, /action\s*===\s*'host_translate_topic_chat'/);
  assert.match(source, /action\s*===\s*'host_translate_topic_chat_quick'/);
});

test('host translation forwards multi-sense general meanings through every full-result path', () => {
  assert.match(source, /generalMeanings:\s*compactText\(result\.generalMeanings/);
  const forwarded = source.match(/generalMeanings:\s*(?:cachedTranslation|normalizedTranslation)\.generalMeanings/g) || [];
  assert.equal(forwarded.length, 4, 'cache, in-flight, complete, and progressive responses must expose generalMeanings');
  assert.match(source, /GENEL ANLAMLAR:\s*\$\{target\.generalMeanings\}/);
});

test('host translation retries one Codex timeout before surfacing an error', () => {
  assert.match(source, /TRANSLATE_SELECTION_RETRY_TIMEOUT_MS/);
  assert.match(source, /TRANSLATE_SELECTION_TIMEOUT_RETRIES/);
  assert.match(source, /function\s+shouldRetryCodexTranslation\s*\(/);
  assert.match(source, /function\s+runCodexTranslationWithRetry\s*\(/);
  assert.match(source, /codex_retry:\s*'Codex Retry'/);
  assert.match(source, /runCodexTranslationWithRetry\(prompt,\s*trace,\s*\{/);
  assert.match(source, /shouldRetryCodexTranslation\(error,\s*attempt,/);
});

test('host translation has an opt-in fast Codex lane and disables heavy Codex features', () => {
  assert.match(source, /REMNOTE_TRANSLATE_FAST_CODEX/);
  assert.match(source, /TRANSLATE_SELECTION_FAST_CODEX_ENABLED/);
  assert.match(source, /TRANSLATE_SELECTION_DEFAULT_MODEL/);
  assert.match(source, /gpt-5\.3-codex-spark/);
  assert.match(source, /gpt-5\.6-sol/);
  assert.match(source, /CODEX_DISABLED_FEATURES/);
  assert.match(source, /plugins/);
  assert.match(source, /tool_search/);
  assert.match(source, /args\.push\('--disable',\s*feature\)/);
});

test('host translation prefers the newest managed Codex binary', () => {
  assert.match(source, /\.codex',\s*'\.sandbox-bin',\s*'codex\.exe'/);
  assert.match(source, /\.plugin-appserver',\s*'codex\.exe'/);
  assert.match(source, /fs\.statSync\(candidate\)\.mtimeMs/);
  assert.match(source, /right\.mtimeMs\s*-\s*left\.mtimeMs/);
});

test('host translation exposes mnemonic, GPT-5.6-Sol, and image helper actions', () => {
  assert.match(source, /'host_translate_mnemonic_candidates'/, 'mnemonic helper action should be registered');
  assert.match(source, /'host_translate_image_candidates'/, 'image helper action should be registered');
  assert.match(source, /TRANSLATE_MNEMONIC_SOL_MODEL/);
  assert.match(source, /gpt-5\.6-sol/);
  assert.match(source, /REMNOTE_TRANSLATE_MNEMONIC_SOL_MODEL/);
  assert.match(source, /REMNOTE_TRANSLATE_MNEMONIC_GPT55_MODEL/, 'legacy model override should remain compatible');
  assert.match(source, /TRANSLATE_MNEMONIC_SOL_REASONING/);
  assert.match(source, /medium/);
  assert.match(source, /TRANSLATE_MNEMONIC_SOL_HIGH_REASONING/);
  assert.match(source, /gpt56_sol_medium/);
  assert.match(source, /gpt56_sol_high_refine/);
  assert.match(source, /gpt55_medium/, 'legacy medium tier should remain compatible');
  assert.match(source, /gpt55_high_refine/, 'legacy high tier should remain compatible');
  assert.match(source, /function\s+getTranslateMnemonicCandidates\s*\(/);
  assert.match(source, /function\s+getTranslateImageCandidates\s*\(/);
  assert.match(source, /function\s+searchOpenverseImages\s*\(/);
  assert.match(source, /function\s+searchWikimediaImages\s*\(/);
  assert.match(source, /function\s+searchWikipediaConceptImages\s*\(/);
  assert.match(source, /function\s+isDiagramPreferredImageTarget\s*\(/);
  assert.match(source, /Promise\.allSettled\s*\(/, 'independent image searches should run concurrently');
  assert.match(source, /featuredCandidate:\s*candidates\[0\]\s*\|\|\s*null/);
  assert.match(source, /displayPreference:\s*isDiagramPreferredImageTarget\(target\)/);
  assert.match(source, /displayMode:\s*imageDisplayMode\(candidate,\s*target\)/);
  assert.match(
    source,
    /const\s+text\s*=\s*\[candidate\.title,\s*candidate\.pageUrl,\s*candidate\.creator,\s*candidate\.description,\s*candidate\.categories\]/,
    'candidate relevance may use real metadata but not the search query text'
  );
  assert.match(
    source,
    /candidate\.score\s*>=\s*Math\.max\([\s\S]*isDiagramPreferredImageTarget\(target\) \? 100 : 70/,
    'low-relevance image tail should be removed while diagrams retain three useful alternatives'
  );
});

test('host mnemonic helper persists only strict Sol top-three results and coalesces duplicate work', () => {
  assert.match(source, /TRANSLATE_MNEMONIC_CACHE_VERSION\s*=\s*6/, 'quality-rule changes must invalidate old mnemonic cache entries');
  assert.match(source, /TRANSLATE_MNEMONIC_CACHE_TTL_MS/);
  assert.match(source, /translateMnemonicCacheRoot/);
  assert.match(source, /const\s+translateMnemonicCache\s*=\s*new Map\(\)/);
  assert.match(source, /const\s+translateMnemonicInFlight\s*=\s*new Map\(\)/);
  assert.match(source, /function\s+validateStrictMnemonicCacheCandidates\s*\(/);
  assert.match(source, /Number\(requestedLimit\)\s*!==\s*3/);
  assert.match(source, /candidates\.length\s*!==\s*3/);
  assert.match(source, /polishMnemonicCandidateSet\(target,\s*candidates,\s*3\)/);
  assert.match(source, /function\s+getCachedMnemonicCandidates\s*\(/);
  assert.match(source, /function\s+setCachedMnemonicCandidates\s*\(/);
  assert.match(source, /function\s+getInFlightMnemonicCandidates\s*\(/);
  assert.match(source, /function\s+setInFlightMnemonicCandidates\s*\(/);
  assert.match(source, /fs\.renameSync\(tempPath,\s*filePath\)/, 'durable cache writes should be atomic');
  assert.match(source, /source\s*===\s*'gpt56sol'\s*&&\s*!isHighRefine\s*&&\s*Number\(requestedLimit\)\s*===\s*3/);
  assert.match(source, /provider:\s*'codex_cache'/);
  assert.match(source, /cacheLayer:\s*cached\.layer/);
  assert.match(source, /function\s+completeVisibleMnemonicCandidates\s*\(/, 'empty strict results need a visible fallback cascade');
  assert.match(source, /setCachedMnemonicCandidates\(cacheKey,\s*target,\s*generated\.strictCandidates/, 'relaxed visible candidates must never enter the strict cache');
  assert.match(source, /codex_visible_fallback/, 'host responses should expose when visible fallback was required');
  const cacheLookup = source.indexOf('const cached = getCachedMnemonicCandidates(cacheKey, target, requestedLimit);');
  const inFlightLookup = source.indexOf('let generationPromise = getInFlightMnemonicCandidates(cacheKey);');
  const modelRun = source.indexOf('runCodexTranslation(prompt, timeoutMs, trace, {', cacheLookup);
  assert.ok(cacheLookup > 0, 'strict mnemonic cache lookup must exist');
  assert.ok(inFlightLookup > cacheLookup, 'in-flight lookup must follow cache lookup');
  assert.ok(modelRun > inFlightLookup, 'Sol execution must happen only after cache and in-flight checks');
});

test('host image helper steers mechanical wedge results away from shoe and decor meanings', () => {
  assert.match(source, /function\s+isMechanicalWedgeImageTarget\s*\(/);
  assert.match(source, /WEDGE_MECHANICAL_INTENT_TERMS/);
  assert.match(source, /wedge simple machine/);
  assert.match(source, /wooden wedge tool/);
  assert.match(source, /mechanical wedge/);
  assert.match(source, /wedge inclined plane/);
  assert.match(source, /splitting wedge tool/);
  assert.match(source, /WEDGE_MECHANICAL_POSITIVE_TERMS/);
  assert.match(source, /WEDGE_MECHANICAL_OFFTOPIC_TERMS/);
  assert.match(source, /wedge-heel/);
  assert.match(source, /wedge sandal/);
  assert.match(source, /flower box/);
  assert.match(source, /falling wedge/);
});

test('host image helper steers scholarly toward academic scenes instead of publishing workflow diagrams', () => {
  assert.match(source, /function\s+isScholarlyImageTarget\s*\(/);
  assert.match(source, /SCHOLARLY_IMAGE_POSITIVE_TERMS/);
  assert.match(source, /SCHOLARLY_IMAGE_OFFTOPIC_TERMS/);
  assert.match(source, /academic researcher/);
  assert.match(source, /scholar studying books/);
  assert.match(source, /university research library/);
  assert.match(source, /scholarly publishing/);
  assert.match(source, /workflow/);
});

test('host image helper treats mull as thinking instead of the Scottish island', () => {
  assert.match(source, /function\s+isThinkingActionImageTarget\s*\(/);
  assert.match(source, /function\s+isImageCandidateSenseRelevant\s*\(/);
  assert.match(source, /THINKING_ACTION_IMAGE_POSITIVE_TERMS/);
  assert.match(source, /THINKING_ACTION_IMAGE_HUMAN_TERMS/);
  assert.match(source, /function\s+imageTextHasWholeTerm\s*\(/);
  assert.match(source, /THINKING_ACTION_IMAGE_OFFTOPIC_TERMS/);
  assert.match(source, /pondering person/);
  assert.match(source, /contemplating a decision/);
  assert.match(source, /isle of mull/);
  assert.match(source, /sound of mull/);
  assert.match(source, /ogg\|oga\|mp3\|wav\|flac/);
  assert.match(source, /mimeType\s*&&\s*!\/\^image\\\//);
  assert.match(source, /filter\(\(candidate\) => isImageCandidateSenseRelevant\(candidate, target\)\)/);
});

test('host image helper prefers instructional concept diagrams over field panoramas', () => {
  assert.match(source, /function\s+conceptImageSearchTerm\s*\(/);
  assert.match(source, /function\s+conceptImageSearchVariants\s*\(/);
  assert.match(source, /variants\.push\(`\$\{base\.slice\(0, -1\)\}al`\)/, 'anticline should also search the anticlinal concept form');
  assert.match(source, /const diagramQueryTerm = conceptTerms\[1\] \|\| conceptTerm/);
  assert.match(source, /isDiagramPreferredImageTarget\(target\)[\s\S]*\? Math\.max\(10, limit \+ 7\)/);
  assert.match(source, /isDiagramPreferredImageTarget\(target\) \? 100 : 70/);
  assert.match(source, /TRANSLATE_IMAGE_CACHE_TTL_MS/);
  assert.match(source, /const translateImageCandidatesCache = new Map\(\)/);
  assert.match(source, /const translateImageCandidatesInFlight = new Map\(\)/);
  assert.match(source, /function\s+translateImageCandidatesCacheKey\s*\(/);
  assert.match(source, /encyclopedia_lead/);
  assert.match(source, /DIAGRAM_IMAGE_STRONG_EVIDENCE_TERMS/);
  assert.match(source, /DIAGRAM_IMAGE_PHOTO_TERMS/);
  assert.match(source, /iiprop:\s*'url\|thumburl\|size\|mime\|extmetadata'/);
  assert.match(source, /aspectRatio\s*>=\s*4/);
  assert.match(source, /score\s*-?=\s*48/);
  assert.match(source, /candidate\.semanticType\s*===\s*'encyclopedia_lead'\)\s*score\s*\+=\s*100/);
  assert.match(source, /if \(exactConceptTitle\) score \+= 100/, 'an exact concept filename should outrank a generic lead image');
  assert.match(source, /isDiagramPreferredImageTarget\(target\)[\s\S]*\?\s*\[searchWikimediaImages\]/);
  assert.doesNotMatch(
    source.slice(source.indexOf('if (prefersDiagram) {'), source.indexOf('if (candidate.license)', source.indexOf('if (prefersDiagram) {'))),
    /candidateQuery\.includes\(term\)/,
    'query wording alone must not count as diagram evidence'
  );
});

test('host mnemonic helper applies organic-binding voting rules', () => {
  assert.match(source, /TRUSTED_MNEMONIC_CANDIDATE_TEMPLATES/, 'trusted personalized mnemonic candidates should seed the picker');
  assert.match(source, /captivated:[\s\S]*kapti \+ vay/, 'captivated should have a sound-plus-meaning local candidate');
  assert.match(source, /fast tid ous = fistiklari titizlikle diziyor/, 'fastidious should keep the user-validated whole-phrase hook');
  assert.match(source, /evidently:[\s\S]*evi denetle/, 'evidently should keep the polished detective hook');
  assert.match(source, /mystifying:[\s\S]*mistik fayin/, 'mystifying should have a trusted organic sound hook');
  assert.match(source, /enquiring:[\s\S]*in kuyuya, ara/, 'enquiring should have a concrete sound-and-meaning hook');
  assert.match(source, /en kuytu yeri ara/, 'enquiring should keep a natural Turkish search scene');
  assert.match(source, /inquiry kuyrugu/, 'enquiring should keep a root-linked visual question queue');
  assert.match(source, /conceive:[\s\S]*konsept ciz[\s\S]*konsept dogur[\s\S]*konsepti canlandir/, 'conceive should always have three distinct concrete candidates');
  assert.match(source, /slump:[\s\S]*slop diye cok[\s\S]*suya lomp[\s\S]*su lamba sarkti/, 'slump should keep three concrete sound-linked candidates');
  assert.match(source, /function\s+hasRawTargetSplitAnchor\s*\(/, 'raw target chunks need a general detector');
  assert.match(source, /return 'raw_target_split'/, 'exact target splits must be rejected');
  assert.match(source, /split\(\/\(\?:\\s\*\\\+\\s\*\|\\s\*\\\/\\s\*\|\\s\+\|-\+\)\//, 'raw split detection must cover plus, slash, spaces, and hyphens');
  assert.match(source, /MNEMONIC_VISIBLE_HARD_REJECT_REASONS[\s\S]*'raw_target_split'/, 'visible fallback must not restore rejected target splits');
  assert.match(source, /MNEMONIC_VISIBLE_HARD_REJECT_REASONS[\s\S]*'raw_split_placeholder'/, 'visible fallback must not restore placeholder split scenes');
  assert.match(source, /enq \+ uiring \/ enqu \+ iring/, 'model prompt should explicitly ban the observed failure shape');
  assert.match(source, /caveats:[\s\S]*kahve at/, 'caveats should preserve the user-approved kahve at hook');
  assert.match(source, /aroused:[\s\S]*horoz/, 'arouse family should keep a concrete pronunciation-linked wake-up hook');
  assert.match(source, /kucuk "ama\.\.\." uyari notu/, 'caveats should bind to a concrete warning/caveat note');
  assert.match(source, /function\s+hasContextlessLetterLabel\s*\(/, 'contextless letter labels should be detected');
  assert.match(source, /contextless_letters/, 'contextless letter labels should be a reject reason');
  assert.match(source, /function\s+hasRawSplitPlaceholderScene\s*\(/, 'raw split placeholder scenes should be rejected');
  assert.match(source, /raw_split_placeholder/, 'raw split placeholder scenes should be a reject reason');
  assert.match(source, /wrong_mystify_evident_scene/, 'mystifying should reject the wrong evident/detective scene');
  assert.match(source, /wrong_caveat_scene/, 'caveats should reject abstract condition-splitting scenes');
  assert.match(source, /function\s+polishMnemonicCandidate\s*\(/, 'medium candidates should pass through a final polish step');
  assert.match(source, /function\s+inferMnemonicHookFromScene\s*\(/, 'two-part model outputs should recover a leading phonetic hook instead of being discarded');
  assert.match(source, /parts\.length\s*===\s*2/, 'two-part mnemonic outputs need an explicit repair path');
  assert.match(source, /function\s+buildMnemonicRefinePrompt\s*\(/, 'high refine prompt should exist');
  assert.match(source, /function\s+rankOrganicMnemonicCandidates\s*\(/, 'organic binding ranker should select final candidates');
  assert.match(source, /trustedMnemonicCandidateIndexForTarget/, 'trusted mnemonic templates should keep their personalized priority order');
  assert.match(source, /primaryCandidates, \.\.\.fallbackCandidates/, 'local trusted candidates should be ranked together with model candidates');
  assert.match(source, /mnemonicAnchorKey/, 'same-anchor variants should be grouped before top-3 selection');
  assert.match(source, /function\s+mnemonicSceneKey\s*\(/, 'same-scene variants should also be grouped');
  assert.match(source, /usedScenes/, 'top-three selection should enforce scene diversity');
  assert.match(source, /CAPT \+ IVA \+ TED etiketli\/yazili/, 'prompt should explicitly ban the reported bad pattern');
  assert.match(source, /myst \+ ify \+ ing sahnesinde/, 'prompt should explicitly ban the reported mystifying bad split pattern');
  assert.match(source, /dedektif\/delil\/sonuc belli oluyor/, 'prompt should ban evident-scene drift for mystifying');
  assert.match(source, /Fincan sartlara bolunuyor/, 'prompt should ban the reported caveats scene drift');
  assert.match(source, /12-16 kisa kanca/, 'Sol prompt should overgenerate enough internal hooks for strict filtering');
  assert.match(source, /en iyi 10 farkli adayi yaz/, 'model should expose ten diverse finalists for host-side top-three voting');
  assert.match(source, /Her string tam iki " = " icersin/, 'model prompts must enforce the three-part mnemonic shape mechanically');
  assert.match(source, /YANLIS: "Gunesiz odada bitki soluyor/, 'model prompts should show that a meaning-only scene is not a mnemonic');
  assert.match(source, /function\s+buildMnemonicRepairPrompt\s*\(/, 'underfilled words need a focused phonetic repair lane');
  assert.match(source, /Promise\.allSettled\(\[/, 'main and repair mnemonic lanes should overlap instead of running serially');
  assert.match(source, /provider:\s*'trusted_local'/, 'curated three-candidate words should bypass model latency');
  assert.match(source, /split parcalarini ritimle\/heceleyerek tekrar etme/, 'prompt should ban split chanting instead of a real Turkish hook');
  assert.match(source, /ayni splitin veya ayni sahnenin ufak varyasyonlarini verme/, 'prompt should reject three variants of the same split or scene');
});

test('host translation warms the Codex model after bridge startup', () => {
  assert.match(source, /REMNOTE_TRANSLATE_WARMUP/);
  assert.match(source, /TRANSLATE_SELECTION_WARMUP_ENABLED/);
  assert.match(source, /TRANSLATE_SELECTION_WARMUP_TIMEOUT_MS/);
  assert.match(source, /function\s+warmCodexTranslationModelAsync\s*\(/);
  assert.match(source, /runCodexTranslation\('Sadece OK yaz\.'/);
  assert.match(source, /translationWarmup/);
  assert.match(source, /warmCodexTranslationModelAsync\(\)/);
});

test('bridge startup pins Spark quick first paint and gpt-5.6-sol full quality defaults', () => {
  assert.match(startBridgeSource, /REMNOTE_TRANSLATE_CODEX_MODEL/);
  assert.match(startBridgeSource, /gpt-5\.6-sol/);
  assert.match(startBridgeSource, /REMNOTE_TRANSLATE_QUICK_CODEX_MODEL/);
  assert.match(startBridgeSource, /gpt-5\.3-codex-spark/);
  assert.match(startBridgeSource, /REMNOTE_TRANSLATE_WARMUP/);
  assert.match(startBridgeSource, /REMNOTE_CODEX_DISABLED_FEATURES/);
});

function assistantRunnerFixture({ withBuffer = true } = {}) {
  const liveSource = fs.readFileSync(path.join(__dirname, 'bridge-host.cjs'), 'utf8');
  const runner = liveSource.slice(liveSource.indexOf('function runCodexTranslation('), liveSource.indexOf('function shouldRetryCodexTranslation('));
  const wiring = liveSource.slice(liveSource.indexOf('const selectionAssistantHost ='), liveSource.indexOf('const readRemNotePdf ='));
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  let kills = 0, removals = 0, spawnOptions, cliArgs, timer, settled = false;
  child.kill = () => { kills++; };
  child.stdin = { write: () => {}, end: () => {} };
  const progress = [];
  const context = vm.createContext({modelRoute:{run:(primary)=>primary()}, ...(withBuffer ? { Buffer } : {}), process:{env:{}}, path, os:{tmpdir:()=> 'secret-path'}, randomUUID:()=> 'private-id',
    TRANSLATE_SELECTION_MODEL:'wrong-default', TRANSLATE_SELECTION_TIMEOUT_MS:45000, CODEX_DISABLED_FEATURES:[],
    compactText:(s,n)=>String(s).slice(0,n), resolveCodexExecutable:()=> 'private-codex-path',
    startTranslateStage:()=>({}), finishTranslateStage:()=>{}, getTraceTextMeta:()=>({}), classifyTranslateError:()=>({errorClass:'ERROR'}),
    setTimeout:(callback, ms)=>{timer={callback,ms};return 1;},clearTimeout:()=>{},
    fs:{existsSync:()=>true,readFileSync:()=> 'normal-answer',rmSync:()=>{removals++;}},
    spawn:(_exe,args,options)=>{spawnOptions=options;cliArgs=args;options.signal?.addEventListener('abort',()=>{child.kill();child.emit('error',Object.assign(Error('private abort diagnostic'),{name:'AbortError'}));},{once:true});return child;},
    assistantModelOptions:()=>({model:'gpt-6.1-sol',reasoningEffort:'medium'}),
    require:()=>({createAssistantHost:(_plugin,generate)=>generate})
  });
  vm.runInContext(runner+'\n'+wiring+'\nglobalThis.generate=selectionAssistantHost; globalThis.run=runCodexTranslation;',context);
  return { child, progress, run:context.run, generate:context.generate, timeout:()=>timer.callback(),
    observe:promise=>{promise.then(()=>{settled=true;},()=>{settled=true;});return promise;},
    state:()=>({kills,removals,spawnOptions,cliArgs,timer,settled}) };
}

test('assistant callback forwards abort/progress to actual owned CLI and cancellation waits for child close', async () => {
  const f = assistantRunnerFixture(), c = new AbortController();
  const pending = f.observe(f.generate('private prompt credential=secret',{signal:c.signal,onProgress:p=>f.progress.push(p)}));
  assert.equal(f.state().spawnOptions.signal,c.signal);
  assert.equal(f.state().timer.ms,45000);
  assert.equal(f.state().cliArgs[f.state().cliArgs.indexOf('-m')+1],'gpt-6.1-sol');
  assert.ok(f.state().cliArgs.includes('model_reasoning_effort="medium"'));
  c.abort(); await Promise.resolve();
  assert.equal(f.state().kills,1); assert.equal(f.state().settled,false); assert.equal(f.state().removals,0);
  f.child.emit('close',null);
  await assert.rejects(pending,e=>e.code==='CODEX_CANCELLED' && e.message==='Codex request cancelled.');
  assert.equal(f.progress.at(-1).phase,'cancelled');
});

test('actual runner timeout exposes structured code without changing legacy message or releasing before close', async () => {
  const f = assistantRunnerFixture(); const pending=f.observe(f.run('private prompt',45000,null,{onProgress:p=>f.progress.push(p)}));
  f.timeout(); await Promise.resolve(); assert.equal(f.state().kills,1); assert.equal(f.state().settled,false); assert.equal(f.state().removals,0);
  f.child.emit('close',null);
  await assert.rejects(pending,e=>e.code==='CODEX_TIMEOUT' && e.message==='Codex translation timed out after 45s.');
  assert.equal(f.progress.at(-1).phase,'timeout');
});

test('runner emits safe byte-only progress, preserves output, and ignores observer exceptions', async () => {
  const f=assistantRunnerFixture(); const pending=f.run('credential secret prompt',45000,null,{onProgress:p=>{f.progress.push(p);if(p.phase==='spawned')throw Error('observer');}});
  f.child.stderr.emit('data',Buffer.from('secret stderr credential')); f.child.stdout.emit('data',Buffer.from('secret stdout'));
  f.child.emit('close',0); assert.equal(await pending,'normal-answer');
  assert.deepEqual(f.progress.map(p=>p.phase),['resolving','spawned','first_output','completed']);
  for(const event of f.progress) {
    assert.deepEqual(Object.keys(event).sort(),['elapsedMs','outputBytes','phase','stderrBytes','stdoutBytes']);
    for(const key of ['elapsedMs','outputBytes','stderrBytes','stdoutBytes'])assert.ok(Number.isFinite(event[key])&&event[key]>=0);
  }
  const final=f.progress.at(-1); assert.equal(final.stderrBytes,24); assert.equal(final.stdoutBytes,13); assert.equal(final.outputBytes,13);
  assert.doesNotMatch(JSON.stringify(f.progress),/secret|credential|private|normal-answer/);
});

test('legacy runner without progress observer preserves ordinary output without telemetry dependencies', async () => {
  const f=assistantRunnerFixture({withBuffer:false}); const pending=f.run('legacy prompt',45000);
  f.child.emit('close',0); assert.equal(await pending,'normal-answer');
});

test('late child output cannot regress timeout progress before the owned process closes', async () => {
  const f=assistantRunnerFixture(); const pending=f.run('prompt',45000,null,{onProgress:p=>f.progress.push(p)});
  f.timeout(); f.child.stdout.emit('data',Buffer.from('late secret output'));
  assert.equal(f.progress.at(-1).phase,'timeout');
  f.child.emit('close',null); await assert.rejects(pending,e=>e.code==='CODEX_TIMEOUT');
});

async function mnemonicSelectionOptions(payload, env = {}) {
  const current = fs.readFileSync(path.join(__dirname, 'bridge-host.cjs'), 'utf8');
  const constants = current.slice(current.indexOf('const TRANSLATE_MNEMONIC_SOL_MODEL ='), current.indexOf('const TRANSLATE_MNEMONIC_TIMEOUT_MS ='));
  const begin = current.indexOf('async function getTranslateMnemonicCandidates(');
  const selection = current.slice(begin, current.indexOf('  const timeoutMs = isHighRefine', begin));
  const context = vm.createContext({modelRoute:{run:(primary)=>primary()}, process:{env}, TRANSLATE_SELECTION_MODEL:'gpt-5.6-sol', translationTargetFromPayload:()=>({targetText:'run'}) });
  vm.runInContext(constants+'\n'+selection+'return {model:selectedModel,reasoningEffort};}\nglobalThis.select=getTranslateMnemonicCandidates;',context);
  return context.select(payload);
}

test('explicit Sol Medium aliases always select Sol6.1 medium despite legacy model/effort overrides', async () => {
  const env={REMNOTE_TRANSLATE_MNEMONIC_SOL_MODEL:'gpt-5.6-sol',REMNOTE_TRANSLATE_MNEMONIC_GPT55_MODEL:'gpt-5.6-sol',REMNOTE_TRANSLATE_MNEMONIC_SOL_REASONING:'low'};
  for(const payload of [{source:'gpt56sol'},{source:'gpt55'},{modelTier:'gpt56_sol_medium'},{modelTier:'gpt55_medium'}]) {
    const options=await mnemonicSelectionOptions(payload,env);
    assert.equal(options.model,'gpt-6.1-sol'); assert.equal(options.reasoningEffort,'medium');
    const f=assistantRunnerFixture(); const pending=f.run('mnemonic fixture',42000,null,options); f.child.emit('close',0); await pending;
    assert.equal(f.state().cliArgs[f.state().cliArgs.indexOf('-m')+1],'gpt-6.1-sol'); assert.ok(f.state().cliArgs.includes('model_reasoning_effort="medium"'));
  }
});

test('narrow mnemonic Medium migration preserves High and default translation model choices', async () => {
  for(const payload of [{modelTier:'gpt56_sol_high_refine'},{modelTier:'gpt55_high_refine'},{refine:true}]) {
    const options=await mnemonicSelectionOptions(payload);
    assert.equal(options.model,'gpt-5.6-sol'); assert.equal(options.reasoningEffort,'high');
  }
  const normal=await mnemonicSelectionOptions({}); assert.equal(normal.model,'gpt-5.6-sol'); assert.equal(normal.reasoningEffort,'low');
});

async function fullMnemonicCliFixture(payload) {
  const current=fs.readFileSync(path.join(__dirname,'bridge-host.cjs'),'utf8');
  const constants=current.slice(current.indexOf('const TRANSLATE_MNEMONIC_CANDIDATE_LIMIT ='),current.indexOf('const TRANSLATE_IMAGE_CANDIDATE_LIMIT ='));
  const helpers=current.slice(current.indexOf('function translationTargetFromPayload('),current.indexOf('function normalizeSearchTerm('));
  const runner=current.slice(current.indexOf('function runCodexTranslation('),current.indexOf('function shouldRetryCodexTranslation('));
  const files=new Map(), calls=[], traces=[];
  const weak='abrogate = kelimeyi hatirla = abrogate; yürürlükten kaldırmak';
  const context=vm.createContext({modelRoute:{run:(primary)=>primary()},require,process:{env:{}},Buffer,path,os:require('node:os'),randomUUID:require('node:crypto').randomUUID,createHash:require('node:crypto').createHash,setTimeout,clearTimeout,
    TRANSLATE_SELECTION_MODEL:'gpt-5.6-sol',TRANSLATE_SELECTION_TIMEOUT_MS:45000,CODEX_DISABLED_FEATURES:[],
    translationFormat:require('./translate-selection-format.cjs'),
    mnemonicGate:{filterCandidates:async(_w,list)=>list.filter(Boolean)},translateMnemonicCache:new Map(),translateMnemonicInFlight:new Map(),translateMnemonicCacheRoot:'fixture-cache',
    compactText:(v,n)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,n),
    startTranslateStage:()=>({}),finishTranslateStage:()=>{},getTraceTextMeta:()=>({}),classifyTranslateError:()=>({errorClass:'ERROR'}),createTranslateTraceId:()=> 'fixture',writeTranslateTrace:t=>traces.push(t),resolveCodexExecutable:()=> 'fixture-codex.exe',
    fs:{existsSync:p=>files.has(p),readFileSync:p=>files.get(p),rmSync:p=>files.delete(p),mkdirSync:()=>{},writeFileSync:(p,v)=>files.set(p,v),readdirSync:()=>[]},
    spawn:(_exe,args)=>{
      const index=calls.length; calls.push(args); const out=args[args.indexOf('--output-last-message')+1];
      const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
      child.stdin={write:()=>{},end:()=>queueMicrotask(()=>{files.set(out,JSON.stringify({candidates:index===0?[weak]:[]}));child.emit('close',0);})};return child;
    }
  });
  vm.runInContext(constants+'\n'+runner+'\n'+helpers+'\nglobalThis.generate=getTranslateMnemonicCandidates;',context);
  const result=await context.generate({selectedText:'abrogate',contextText:'They voted to abrogate the treaty.',result:{directTranslation:'yürürlükten kaldırmak',contextualMeaning:'antlaşmayı yürürlükten kaldırmak'},...payload});
  assert.equal(calls.length,2,'weak primary must traverse the real primary + phonetic repair model chain');
  assert.notEqual(result.qualityMode,'strict','weak primary cannot qualify as strict model output');
  assert.equal(result.cacheStored,false,'weak/fallback output must not enter the strict model cache');
  assert.ok(traces.at(-1).output.candidateAudit.reasons.weak>0);
  return {result,calls};
}

test('full mnemonic chain keeps Sol6.1 Medium on both primary and repair CLI calls',async()=>{
  const {result,calls}=await fullMnemonicCliFixture({source:'gpt56sol'});
  assert.equal(result.model,'gpt-6.1-sol');assert.equal(result.reasoningEffort,'medium');
  for(const args of calls){assert.equal(args[args.indexOf('-m')+1],'gpt-6.1-sol');assert.ok(args.includes('model_reasoning_effort="medium"'));}
});

test('full mnemonic default chain preserves low effort on primary and repair',async()=>{
  const {calls}=await fullMnemonicCliFixture({});
  for(const args of calls){assert.equal(args[args.indexOf('-m')+1],'gpt-5.6-sol');assert.ok(args.includes('model_reasoning_effort="low"'));}
});

function explainHostWiringFixture({ realHost = false } = {}) {
  const current=fs.readFileSync(path.join(__dirname,'bridge-host.cjs'),'utf8');
  const wiring=current.match(/const explainSelectionHost = [\s\S]*?\n\);/)?.[0];
  assert.ok(wiring,'explain host factory must be wired without starting bridge services');
  const begin=current.indexOf('async function handleHostAction(');
  const route=current.slice(begin,current.indexOf("  if (action === 'host_remnote_reconnect_local_plugin')",begin))+'throw Error("Unknown test route");}';
  const allowlist=current.slice(current.indexOf('const HOST_ACTIONS ='),current.indexOf('const SDK_METHOD_ACTION_HINTS ='));
  const target=current.slice(current.indexOf('function translationTargetFromPayload('),current.indexOf('function parseMnemonicCandidateText('));
  const model=assistantRunnerFixture(), searches=[], candidates=[{
    imageUrl:'https://upload.wikimedia.org/wikipedia/commons/1/12/ElmTree1.jpg',
    thumbUrl:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/ElmTree1.jpg/320px-ElmTree1.jpg',
    pageUrl:'https://commons.wikimedia.org/wiki/File:ElmTree1.jpg',
    title:'ElmTree1',license:'CC0',creator:'Example photographer',provider:'wikimedia'
  }];
  const context=vm.createContext({modelRoute:{run:(primary)=>primary()},runCodexTranslation:model.run,translationFormat:require('./translate-selection-format.cjs'),compactText:(v,n)=>String(v||'').trim().slice(0,n),
    createSmartImageFinder: options=>require('./smart-images-adapter.cjs').createImageFinder({...options,loadProvider:()=>{throw Error('EXTERNAL_PROVIDER_NOT_INSTALLED');}}),
    require:()=>realHost ? require('./explain-selection-host.cjs') : ({createExplainHost:options=>async(action,payload)=>action==='host_explain_summary'?options.runModel(payload.prompt,payload.options):options.findImages(payload.query,payload.options)}),
    fetchTranslateImageCandidates:async payload=>{searches.push(payload);assert.equal(context.translationTargetFromPayload(payload).targetText,payload.selectedText);return {candidates};},
    selectionAssistantHost:async()=>({assistant:true})
  });
  vm.runInContext(target+'\n'+allowlist+'\n'+wiring+'\n'+route+'\nglobalThis.handle=handleHostAction;globalThis.allow=HOST_ACTIONS;',context);
  return {context,model,searches,candidates};
}

test('explain actions are allowlisted and summary forwards medium Sol6.1 local signal at25s',async()=>{
  const {context,model}=explainHostWiringFixture(),c=new AbortController();
  assert.equal(context.allow.has('host_explain_summary'),true);assert.equal(context.allow.has('host_explain_images'),true);
  const pending=context.handle('host_explain_summary',{prompt:'Public summary fixture',options:{signal:c.signal}});
  const state=model.state();assert.equal(state.timer.ms,25000);assert.equal(state.spawnOptions.signal,c.signal);
  assert.equal(state.cliArgs[state.cliArgs.indexOf('-m')+1],'gpt-6.1-sol');assert.ok(state.cliArgs.includes('model_reasoning_effort="medium"'));assert.ok(state.cliArgs.includes('web_search="disabled"'));assert.ok(state.cliArgs.includes('shell_tool'));
  model.child.emit('close',0);assert.equal(await pending,'normal-answer');
  assert.equal((await context.handle('host_assistant_status',{})).assistant,true);
});

test('real Explain host accepts legacy provider URLs through adapter and sends no PDF context',async()=>{
  const {context,searches}=explainHostWiringFixture({realHost:true});
  const images=await context.handle('host_explain_images',{selectedText:'elm tree',visualQuery:'educational-diagram'.repeat(30),limit:100,contextText:'PRIVATE PDF TEXT'});
  assert.equal(images.candidates.length,1,'legacy pageUrl/thumbUrl candidate must survive actual parseImages');
  assert.deepEqual(images.candidates,[{
    imageUrl:'https://upload.wikimedia.org/wikipedia/commons/1/12/ElmTree1.jpg',
    sourceUrl:'https://commons.wikimedia.org/wiki/File:ElmTree1.jpg',
    thumbnailUrl:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/ElmTree1.jpg/320px-ElmTree1.jpg',
    title:'ElmTree1',license:'CC0',creator:'Example photographer'
  }]);
  assert.equal(images.readOnly,true);assert.equal(images.mutationApplied,false);
  assert.equal(searches.length,1);assert.equal(searches[0].selectedText.length,160);assert.equal(searches[0].contextText,'');assert.equal(searches[0].limit,5);
  assert.equal(searches[0].result.targetText,searches[0].selectedText);assert.doesNotMatch(JSON.stringify(searches),/PRIVATE PDF TEXT|pdfContext/);
});

test('explain image adapter rejects pre-aborted boundary before querying legacy provider',async()=>{
  const {context,searches}=explainHostWiringFixture();
  const c=new AbortController();c.abort();await assert.rejects(context.handle('host_explain_images',{query:'diagram',options:{signal:c.signal}}),/cancel|iptal/i);assert.equal(searches.length,0);
});
