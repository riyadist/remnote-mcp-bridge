const TERM_SECTION_ORDER = [
  'directTranslation',
  'sentenceTranslation',
  'generalMeanings',
  'englishSynonyms',
  'contextualMeaning',
  'contextExplanation',
  'verbPatterns',
  'explanation',
  'naturalPatterns',
  'mnemonic',
  'etymology',
];

const TERM_SECTION_LABELS = {
  directTranslation: 'Direkt çeviri',
  sentenceTranslation: 'Cümle çevirisi',
  generalMeanings: 'Genel anlamları',
  contextualMeaning: 'Bağlamdaki anlamı',
  contextExplanation: 'Bağlama göre açıklama',
  verbPatterns: 'Phrasal verb ve fiil kalıpları',
  explanation: 'Açıklama',
  etymology: 'Etimoloji',
  naturalPatterns: 'Doğal kalıplar',
  englishSynonyms: 'İngilizce eş anlamlıları',
  mnemonic: 'Mnemonic',
};

function stripModelMarkup(value) {
  let text = typeof value === 'string' ? value : '';
  text = text.replace(/&lt;(\/?[A-Za-z][A-Za-z0-9:-]*)(?:\s+[^&]*?)?&gt;/g, '<$1>');
  text = text.replace(/<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*?)?>/g, '');
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

function cleanTranslationText(value, maxLength = 1200) {
  let text = typeof value === 'string' ? value : '';
  text = stripModelMarkup(text);
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/^```[\w-]*\s*/i, '')
    .replace(/```$/i, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  text = text.replace(/^(?:ceviri|translation|turkish|turkce)\s*[:\uFF1A-]\s*/i, '').trim();
  if (maxLength > 0 && text.length > maxLength) {
    text = text.slice(0, maxLength).trim();
  }
  return text;
}

function normalizeInlineText(value, maxLength = 3000) {
  return cleanTranslationText(value, maxLength).replace(/\s+/g, ' ').trim();
}

function countWords(text) {
  const matches = String(text || '').match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g);
  return matches ? matches.length : 0;
}

function classifyTranslationSelection(selectedText) {
  const rawText = String(selectedText || '');
  const text = normalizeInlineText(rawText, 1000);
  const wordCount = countWords(text);
  const hasTerminalPunctuation = /[.!?](?:["')\]]+)?$/.test(text);
  const hasSentencePunctuation = /[;:]/.test(text);
  const hasLineBreak = /\r|\n/.test(rawText);
  const isSentence = Boolean(
    hasTerminalPunctuation ||
      hasSentencePunctuation ||
      hasLineBreak ||
      wordCount >= 7 ||
      text.length >= 90
  );

  return {
    mode: isSentence ? 'sentence' : 'term',
    wordCount,
    reason: isSentence ? 'sentence_like_selection' : 'short_term_selection',
  };
}

function splitSentences(text) {
  const normalized = normalizeInlineText(text, 3000);
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) || [];
  return matches
    .map((sentence) => normalizeInlineText(sentence, 800))
    .filter(Boolean);
}

function extractContextSentence(selectedText, contextText) {
  const selected = normalizeInlineText(selectedText, 200).toLowerCase();
  const context = normalizeInlineText(contextText, 3000);
  if (!context) return normalizeInlineText(selectedText, 800);
  if (!selected) return context.slice(0, 800).trim();

  const sentences = splitSentences(context);
  const selectedPattern = new RegExp(`\\b${selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  const exact = sentences.find((sentence) => selectedPattern.test(sentence));
  if (exact) return exact;

  const loose = sentences.find((sentence) => sentence.toLowerCase().includes(selected));
  if (loose) return loose;

  return (sentences[0] || context).slice(0, 800).trim();
}

function extractContextWindow(selectedText, contextText, beforeCount = 2, afterCount = 1) {
  const selected = normalizeInlineText(selectedText, 300).toLocaleLowerCase('en-US');
  const context = normalizeInlineText(contextText, 3000);
  if (!context) return normalizeInlineText(selectedText, 1200);

  const sentences = splitSentences(context);
  if (!sentences.length) return context.slice(0, 1600).trim();
  const selectedIndex = selected
    ? sentences.findIndex((sentence) => sentence.toLocaleLowerCase('en-US').includes(selected))
    : -1;
  if (selectedIndex < 0) return context.slice(0, 1600).trim();

  const start = Math.max(0, selectedIndex - beforeCount);
  const end = Math.min(sentences.length, selectedIndex + afterCount + 1);
  return sentences.slice(start, end).join(' ').slice(0, 1600).trim();
}

const CONTEXT_PHRASE_PATTERNS = {
  ask: [['about', 'ask about'], ['for', 'ask for'], ['out', 'ask out']],
  break: [['down', 'break down'], ['up', 'break up'], ['out', 'break out']],
  bring: [['up', 'bring up'], ['back', 'bring back'], ['out', 'bring out']],
  call: [['back', 'call back'], ['off', 'call off'], ['on', 'call on'], ['out', 'call out'], ['up', 'call up']],
  carry: [['out', 'carry out'], ['on', 'carry on']],
  check: [['in', 'check in'], ['into', 'check into'], ['out', 'check out']],
  cobble: [['together', 'cobble together']],
  come: [['up with', 'come up with'], ['across', 'come across'], ['up', 'come up']],
  deal: [['with', 'deal with']],
  end: [['up', 'end up']],
  fall: [['apart', 'fall apart'], ['behind', 'fall behind'], ['for', 'fall for']],
  figure: [['out', 'figure out']],
  get: [['away with', 'get away with'], ['along with', 'get along with'], ['through', 'get through'], ['over', 'get over']],
  give: [['away', 'give away'], ['in', 'give in'], ['up', 'give up']],
  hold: [['back', 'hold back'], ['on', 'hold on'], ['up', 'hold up']],
  keep: [['on', 'keep on'], ['up with', 'keep up with']],
  knock: [['it off', 'knock it off'], ['off', 'knock off']],
  leave: [['out', 'leave out']],
  look: [['forward to', 'look forward to'], ['into', 'look into'], ['out', 'look out'], ['for', 'look for'], ['up', 'look up']],
  make: [['up', 'make up'], ['out', 'make out']],
  pay: [['back', 'pay back'], ['for', 'pay for'], ['off', 'pay off']],
  pick: [['up', 'pick up'], ['out', 'pick out']],
  plead: [['out', 'plead out'], ['with', 'plead with'], ['for', 'plead for']],
  point: [['at', 'point at'], ['out', 'point out']],
  pull: [['off', 'pull off'], ['out', 'pull out'], ['through', 'pull through']],
  put: [['up with', 'put up with'], ['off', 'put off'], ['out', 'put out']],
  run: [['into', 'run into'], ['out', 'run out'], ['away', 'run away']],
  set: [['up', 'set up']],
  show: [['off', 'show off'], ['up', 'show up']],
  stand: [['for', 'stand for'], ['out', 'stand out'], ['up', 'stand up']],
  stick: [['out', 'stick out'], ['to', 'stick to'], ['with', 'stick with']],
  stray: [['into', 'stray into'], ['from', 'stray from']],
  take: [['over', 'take over'], ['away', 'take away'], ['off', 'take off'], ['up', 'take up']],
  throw: [['away', 'throw away'], ['out', 'throw out'], ['up', 'throw up']],
  turn: [['down', 'turn down'], ['out', 'turn out'], ['up', 'turn up']],
  whip: [['out', 'whip out']],
  work: [['out', 'work out']],
};

const IRREGULAR_VERB_BASES = {
  broke: 'break',
  broken: 'break',
  brought: 'bring',
  came: 'come',
  found: 'find',
  gave: 'give',
  given: 'give',
  gone: 'go',
  got: 'get',
  gotten: 'get',
  kept: 'keep',
  left: 'leave',
  made: 'make',
  pled: 'plead',
  put: 'put',
  ran: 'run',
  run: 'run',
  set: 'set',
  taken: 'take',
  took: 'take',
  went: 'go',
};

function contextPhraseTokenKey(value) {
  return String(value || '').trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
}

function simpleVerbBases(token) {
  const raw = contextPhraseTokenKey(token);
  const bases = new Set();
  if (!raw) return bases;
  bases.add(raw);
  if (IRREGULAR_VERB_BASES[raw]) bases.add(IRREGULAR_VERB_BASES[raw]);
  if (raw.endsWith('ied') && raw.length > 4) bases.add(`${raw.slice(0, -3)}y`);
  if (raw.endsWith('ing') && raw.length > 5) {
    const stem = raw.slice(0, -3);
    bases.add(stem);
    bases.add(`${stem}e`);
    if (stem.length >= 2 && stem.at(-1) === stem.at(-2)) bases.add(stem.slice(0, -1));
  }
  if (raw.endsWith('ed') && raw.length > 4) {
    const stem = raw.slice(0, -2);
    bases.add(stem);
    bases.add(raw.slice(0, -1));
    if (stem.length >= 2 && stem.at(-1) === stem.at(-2)) bases.add(stem.slice(0, -1));
  }
  if (raw.endsWith('es') && raw.length > 4) {
    bases.add(raw.slice(0, -2));
    bases.add(raw.slice(0, -1));
  }
  if (raw.endsWith('s') && raw.length > 3) bases.add(raw.slice(0, -1));
  return bases;
}

function tokenizeContextPhraseWords(text) {
  const tokens = [];
  const regex = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
  let match;
  while ((match = regex.exec(String(text || '')))) {
    const key = contextPhraseTokenKey(match[0]);
    if (key) tokens.push({ text: match[0], key, start: match.index, end: regex.lastIndex });
  }
  return tokens;
}

function findTailAfter(tokens, startIndex, tailTokens, maxWindow = 6) {
  const searchEnd = Math.min(tokens.length, startIndex + 1 + maxWindow);
  const keys = tokens.slice(startIndex + 1, searchEnd).map((token) => token.key);
  for (let offset = 0; offset <= keys.length - tailTokens.length; offset += 1) {
    if (tailTokens.every((tail, index) => keys[offset + index] === tail)) {
      return startIndex + 1 + offset + tailTokens.length - 1;
    }
  }

  let pos = startIndex + 1;
  let lastIndex = null;
  for (const tail of tailTokens) {
    let found = null;
    for (let i = pos; i < searchEnd; i += 1) {
      if (tokens[i].key === tail) {
        found = i;
        break;
      }
    }
    if (found === null) return null;
    lastIndex = found;
    pos = found + 1;
  }
  return lastIndex;
}

function canonicalContextPhraseKey(value) {
  const tokens = tokenizeContextPhraseWords(value);
  if (tokens.length < 2) return '';
  const bases = simpleVerbBases(tokens[0].key);
  for (const base of [...bases].sort()) {
    const patterns = CONTEXT_PHRASE_PATTERNS[base];
    if (!patterns) continue;
    for (const [tailText, canonical] of [...patterns].sort((a, b) => b[0].split(/\s+/).length - a[0].split(/\s+/).length)) {
      const tailTokens = tailText.split(/\s+/).map(contextPhraseTokenKey).filter(Boolean);
      if (tailTokens.length && findTailAfter(tokens, 0, tailTokens) !== null) return canonical;
    }
  }
  return '';
}

function detectContextPhraseForSelection(selectedText, contextText = '') {
  const selected = normalizeInlineText(selectedText, 240);
  const selectedKey = contextPhraseTokenKey(selected);
  const contextSentence = extractContextSentence(selected, contextText || selected);
  const haystack = contextSentence || normalizeInlineText(contextText || selected, 1000);
  const tokens = tokenizeContextPhraseWords(haystack);
  if (!tokens.length || !selectedKey) {
    const canonical = canonicalContextPhraseKey(selected);
    return canonical ? { target: canonical, surface: selected, reason: 'selected_phrase' } : null;
  }

  const selectedBases = simpleVerbBases(selectedKey);
  const selectedKeys = new Set([...selectedBases, selectedKey]);
  const candidates = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const tokenBases = simpleVerbBases(tokens[index].key);
    for (const base of [...tokenBases].sort()) {
      const patterns = CONTEXT_PHRASE_PATTERNS[base];
      if (!patterns) continue;
      for (const [tailText, canonical] of [...patterns].sort((a, b) => b[0].split(/\s+/).length - a[0].split(/\s+/).length)) {
        const tailTokens = tailText.split(/\s+/).map(contextPhraseTokenKey).filter(Boolean);
        if (!tailTokens.length) continue;
        const lastIndex = findTailAfter(tokens, index, tailTokens);
        if (lastIndex === null) continue;
        const phraseTokens = tokens.slice(index, lastIndex + 1);
        const phraseKeys = new Set(phraseTokens.map((token) => token.key));
        const selectedIsVerb = [...selectedBases].some((baseVariant) => tokenBases.has(baseVariant));
        const selectedInsidePhrase = [...selectedKeys].some((key) => phraseKeys.has(key));
        if (!selectedIsVerb && !selectedInsidePhrase) continue;
        candidates.push({
          priority: selectedIsVerb ? 0 : 1,
          tailLength: tailTokens.length,
          index,
          target: canonical,
          surface: phraseTokens.map((token) => token.text).join(' '),
          base,
          tail: tailText,
          reason: 'phrasal_verb',
        });
      }
    }
  }
  if (!candidates.length) {
    const canonical = canonicalContextPhraseKey(selected);
    return canonical ? { target: canonical, surface: selected, reason: 'selected_phrase' } : null;
  }
  candidates.sort((a, b) => a.priority - b.priority || b.tailLength - a.tailLength || a.index - b.index);
  return candidates[0];
}

function resolveTranslationSelectionTarget(selectedText, contextText = '') {
  const selected = normalizeInlineText(selectedText, 1000);
  const phrase = detectContextPhraseForSelection(selected, contextText);
  if (!phrase || !phrase.target || phrase.target.toLowerCase() === selected.toLowerCase()) {
    return { selectedText: selected, targetText: selected, phrase: null };
  }
  return { selectedText: selected, targetText: phrase.target, phrase };
}

function buildPhrasalVerbPromptLines(target, selected) {
  if (!target?.phrase) return [];
  return [
    `clicked: ${selected}`,
    `phraseSurface: ${target.phrase.surface || target.targetText}`,
    'phraseNote: translate the whole phrase and explain the whole phrase, not the isolated token.',
    'phrasalVerbRule: Treat the WHOLE multi-word verb as the vocabulary item. Never explain or translate only the clicked verb.',
    'phrasalVerbMeaningRule: directTranslation, generalMeanings, contextualMeaning, synonyms, and examples must belong to the WHOLE phrase.',
  ];
}

function buildTranslationPrompt(selectedText, contextText) {
  const selected = normalizeInlineText(selectedText, 1000);
  const context = cleanTranslationText(contextText || '', 3000);
  const classification = classifyTranslationSelection(selected);

  if (classification.mode === 'sentence') {
    return [
      'Translate selected English sentence to natural Turkish. JSON only:',
      '{"mode":"sentence","translation":""}',
      'No notes.',
      `selected: ${selected}`,
      `context: ${context}`,
    ].join('\n');
  }

  const contextSentence = extractContextSentence(selected, context || selected);
  const contextWindow = extractContextWindow(selected, context || selected);
  const target = resolveTranslationSelectionTarget(selected, context || selected);
  const phraseInstruction = buildPhrasalVerbPromptLines(target, selected);

  return [
    'EN->TR JSON:',
    '{"mode":"term","directTranslation":"","sentenceTranslation":"","sentenceHighlightText":"","generalMeanings":[],"contextualMeaning":"","contextExplanation":"","explanation":"","etymology":"","naturalPatterns":[],"englishSynonyms":[],"mnemonic":""}',
    'generalMeanings REQUIRED:2-5 numbered DIFFERENT senses+POS;context first;not paraphrases;include other common senses. contextExplanation REQUIRED:2-4 natural Turkish sentences explaining what the selected expression refers to or implies here and which nearby wording proves it; resolve pronouns, ellipsis, contrast, metaphor, and tone when present; do not repeat the translation; no markdown or invented story. explanation=2-4 "**exact EN:** TR"+synth;no meta. etymology="form|TR|lang";morph separate. Markdown only expl/etym. naturalPatterns=4-5 "EN=TR";no EN-only. mnemonic=phonetic cue=concrete TR scene=meaning;no raw letters;no HTML.',
    ...phraseInstruction,
    `sel: ${target.targetText || selected}`,
    `ctx: ${contextSentence || selected}`,
    `contextWindow: ${contextWindow || contextSentence || selected}`,
  ].join('\n');
}

function buildFullCardTranslationPrompt(selectedText, contextText) {
  const promptContext = getDetailTranslationPromptContext(selectedText, contextText);
  const { selected, contextSentence, target, phrasalVerbDetailRules } = promptContext;
  if (classifyTranslationSelection(selected).mode === 'sentence') {
    return buildTranslationPrompt(selected, contextText);
  }
  return [
    'Create one complete EN->TR vocabulary card from the supplied context. JSON only:',
    '{"mode":"term","directTranslation":"","sentenceTranslation":"","sentenceHighlightText":"","generalMeanings":[],"contextualMeaning":"","contextExplanation":"","explanation":"","englishSynonyms":[],"naturalPatterns":[],"verbPatterns":[],"etymology":""}',
    'Translate the full sentence naturally; sentenceHighlightText is the exact Turkish counterpart of the selected expression. Resolve idioms and colloquial or sexual slang neutrally, without graphic detail; do not invent a story, sport, event, or location. State uncertain referents as uncertain.',
    'generalMeanings=2-5 distinct common senses with POS, context first, no paraphrase duplicates. englishSynonyms=4-6 relevant English synonyms. contextualMeaning=one precise Turkish sentence.',
    'contextExplanation=2-4 natural Turkish sentences explaining the referent, ellipsis, contrast, metaphor or tone and the nearby wording that supports it; not just a translation.',
    `explanation=${target.phrase ? 'follow the complete phrasal-verb contract below' : '2-4 teaching bullets with **exact English expression:** Turkish explanation, followed by a synthesis of the sentence meaning'}. Keep the teaching detail; do not replace it with a dictionary gloss.`,
    'naturalPatterns=EXACTLY 3 distinct native constructions for this contextual sense, each "English phrase = Turkish meaning; grammatical English example = Turkish example". The first generalizes this sentence. verbPatterns=3-5 legitimate constructions of the SAME base verb, detected phrase first, each with meaning and bilingual example; [] for non-verbs. Never invent particle combinations.',
    'etymology=2-4 "historical form or affix|Turkish meaning/function|specific language chain" rows; distinguish historical origin from inflection. Do not confuse Middle and Old English or guess origins; empty if unknown. No mnemonic, HTML or filler; mnemonic is handled separately.',
    ...buildPhrasalVerbPromptLines(target, selected),
    ...phrasalVerbDetailRules,
    `sel: ${target.targetText || selected}`,
    `ctx: ${contextSentence || selected}`,
    `contextWindow: ${extractContextWindow(selected, contextText || selected) || contextSentence || selected}`,
  ].join('\n');
}

function buildQuickTranslationPrompt(selectedText, contextText) {
  const selected = normalizeInlineText(selectedText, 1000);
  const context = cleanTranslationText(contextText || '', 3000);
  const classification = classifyTranslationSelection(selected);

  if (classification.mode === 'sentence') {
    return [
      'Translate selected English sentence to natural Turkish. JSON only:',
      '{"mode":"sentence","translation":""}',
      'No notes.',
      `selected: ${selected}`,
      `context: ${context}`,
    ].join('\n');
  }

  const contextSentence = extractContextSentence(selected, context || selected);
  const target = resolveTranslationSelectionTarget(selected, context || selected);
  return [
    'EN->TR JSON only:',
    '{"directTranslation":"","sentenceTranslation":""}',
    'directTranslation=selected term/phrase only; sentenceTranslation=full context sentence.',
    ...buildPhrasalVerbPromptLines(target, selected),
    `sel: ${target.targetText || selected}`,
    `ctx: ${contextSentence || selected}`,
  ].join('\n');
}

function buildCoreTranslationPrompt(selectedText, contextText) {
  const selected = normalizeInlineText(selectedText, 1000);
  const context = cleanTranslationText(contextText || '', 3000);
  const classification = classifyTranslationSelection(selected);

  if (classification.mode === 'sentence') {
    return buildQuickTranslationPrompt(selected, context);
  }

  const contextSentence = extractContextSentence(selected, context || selected);
  const contextWindow = extractContextWindow(selected, context || selected);
  const target = resolveTranslationSelectionTarget(selected, context || selected);
  return [
    'EN->TR high-quality core JSON only:',
    'Resolve colloquial and slang senses from the syntax, including neutral non-graphic explanations of sexual slang. Do not force literal motion or invent a sport, event, or location. Keep uncertainty about a place expression separate from the verb meaning.',
    '{"directTranslation":"","sentenceTranslation":"","sentenceHighlightText":"","generalMeanings":[],"contextualMeaning":"","contextExplanation":"","englishSynonyms":[]}',
    'Use careful context-sensitive Turkish. generalMeanings=2-5 distinct common senses with POS; context first; no paraphrase duplicates. sentenceHighlightText=exact Turkish target phrase. contextExplanation REQUIRED:2-4 natural Turkish sentences explaining the contextual inference, referent, ellipsis, contrast, metaphor, or tone using the nearby wording; state the evidence plainly; do not repeat the translation; no markdown or invented story. No lexical explanation, etymology, patterns, mnemonic, or filler.',
    ...buildPhrasalVerbPromptLines(target, selected),
    `sel: ${target.targetText || selected}`,
    `ctx: ${contextSentence || selected}`,
    `contextWindow: ${contextWindow || contextSentence || selected}`,
  ].join('\n');
}

function getDetailTranslationPromptContext(selectedText, contextText, coreResult = {}) {
  const selected = normalizeInlineText(selectedText, 1000);
  const context = cleanTranslationText(contextText || '', 3000);
  const contextSentence = extractContextSentence(selected, context || selected);
  const target = resolveTranslationSelectionTarget(selected, context || selected);
  const core = {
    directTranslation: cleanTranslationText(coreResult.directTranslation || coreResult.translation || '', 500),
    sentenceTranslation: cleanTranslationText(coreResult.sentenceTranslation || '', 900),
    generalMeanings: cleanTranslationText(coreResult.generalMeanings || '', 1200),
    contextualMeaning: cleanTranslationText(coreResult.contextualMeaning || '', 700),
    contextExplanation: cleanTranslationText(coreResult.contextExplanation || '', 1600),
    englishSynonyms: normalizeSynonyms(coreResult.englishSynonyms || []).slice(0, 8),
  };
  const phrasalVerbDetailRules = target.phrase
    ? [
        'PHRASAL VERB EXPLANATION IS REQUIRED. Use EXACTLY the four Turkish labeled bullets below, then one synthesis sentence:',
        `- "**Bütün kalıp – ${target.targetText}:**" Explain the idiomatic meaning of the complete phrase; do not derive it by translating words separately.`,
        `- "**Parçacığın katkısı:**" Explain what the particle/complement contributes in THIS usage and explicitly say it is not translated alone.`,
        '- "**Dilbilgisi:**" State separable/inseparable and transitive/intransitive only when confidently known; include one short placement example. If uncertain, write only that no definite label is given. Never combine a classification with an uncertainty disclaimer.',
        '- "**Bu cümlede:**" Explain precisely what the whole phrase means in the supplied sentence.',
        `Every naturalPatterns entry must use the complete phrase "${target.targetText}" (or its correctly inflected form), never the base verb alone.`,
      ]
    : [];
  return { selected, contextSentence, target, core, phrasalVerbDetailRules };
}

function detailTranslationPromptTail(promptContext) {
  return [
    ...promptContext.phrasalVerbDetailRules,
    `sel: ${promptContext.target.targetText || promptContext.selected}`,
    `ctx: ${promptContext.contextSentence || promptContext.selected}`,
    `core: ${JSON.stringify(promptContext.core)}`,
  ];
}

function buildDetailTranslationPrompt(selectedText, contextText, coreResult = {}) {
  const promptContext = getDetailTranslationPromptContext(selectedText, contextText, coreResult);
  const { target } = promptContext;
  return [
    'Complete the SAME EN->TR vocabulary card. JSON only:',
    '{"explanation":"","etymology":"","naturalPatterns":[],"verbPatterns":[]}',
    `Use the supplied high-quality core as factual context; do not retranslate it. ${target.phrase ? 'explanation must follow the phrasal-verb contract below.' : 'explanation=2-4 short Turkish bullets plus one synthesis sentence.'} etymology=2-4 "historical form or affix|Turkish meaning/function|specific language chain" rows or empty when uncertain. Give the base word's real path across languages, then explain inflectional morphology separately. Distinguish Middle English from Old English; never present the modern spelling as its own Old English source. Ban vague notes such as "çizgisi", "kökenli sıfat", or merely "sıfat yapan ek". naturalPatterns=EXACTLY 3 native "EN=TR" lines for the contextual sense. verbPatterns=3-5 legitimate constructions of the SAME base verb, including the detected phrase first, then real particle/preposition/collocation variants; each line "construction = Turkish meaning; English example = Turkish example". Use [] for non-verbs. Never invent combinations merely to cover out/at/in. No mnemonic, no HTML, no filler.`,
    ...detailTranslationPromptTail(promptContext),
  ].join('\n');
}

function buildDetailUsagePrompt(selectedText, contextText, coreResult = {}) {
  const promptContext = getDetailTranslationPromptContext(selectedText, contextText, coreResult);
  const { target } = promptContext;
  return [
    'Complete ONLY the usage half of the SAME EN->TR vocabulary card. JSON only:',
    '{"explanation":"","naturalPatterns":[],"verbPatterns":[]}',
    `Use the supplied high-quality core as factual context; do not retranslate it. ${target.phrase ? 'explanation must follow the phrasal-verb contract below.' : 'explanation=2-4 short Turkish bullets plus one synthesis sentence.'} naturalPatterns=EXACTLY 3 native "EN=TR" lines for the contextual sense. verbPatterns=3-5 legitimate constructions of the SAME base verb, including the detected phrase first, then real particle/preposition/collocation variants; each line "construction = Turkish meaning; English example = Turkish example". Use [] for non-verbs. Never invent combinations merely to cover out/at/in. No etymology, mnemonic, HTML, or filler.`,
    ...detailTranslationPromptTail(promptContext),
  ].join('\n');
}

function buildDetailEtymologyPrompt(selectedText, contextText, coreResult = {}) {
  const promptContext = getDetailTranslationPromptContext(selectedText, contextText, coreResult);
  return [
    'Complete ONLY the etymology half of the SAME EN->TR vocabulary card. JSON only:',
    '{"etymology":""}',
    'Use the supplied high-quality core only to identify the correct word and sense. etymology=2-4 "historical form or affix|Turkish meaning/function|specific language chain" rows or empty when genuinely uncertain. Give the base word\'s real path across languages, then explain inflectional morphology separately. Distinguish Middle English from Old English; never present the modern spelling as its own Old English source. Ban vague notes such as "cizgisi", "kokenli sifat", or merely "sifat yapan ek". No explanation, patterns, mnemonic, HTML, or filler.',
    ...detailTranslationPromptTail({ ...promptContext, phrasalVerbDetailRules: [] }),
  ].join('\n');
}

function mergeDetailTranslationOutputs(...rawOutputs) {
  const merged = {};
  for (const rawOutput of rawOutputs.flat()) {
    const parsed = parseTranslationJson(rawOutput) || parseLooseTranslationJson(rawOutput) || {};
    for (const key of ['explanation', 'etymology', 'naturalPatterns', 'verbPatterns']) {
      const value = parsed?.[key];
      if (Array.isArray(value) ? value.length : cleanTranslationText(value || '', 4000)) {
        merged[key] = value;
      }
    }
  }
  return JSON.stringify(merged);
}

function parseTranslationJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  const text = cleanTranslationText(value, 6000);
  if (!text) return null;
  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

function looksLikeJsonFragment(value) {
  return /^\s*(?:```(?:json)?\s*)?\{/.test(String(value || ''));
}

function decodeJsonStringFragment(value) {
  const text = String(value || '');
  if (!text) return '';
  try {
    return JSON.parse(`"${text.replace(/"$/, '')}"`);
  } catch {
    return text
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();
  }
}

function parseLooseTranslationJson(value) {
  if (!looksLikeJsonFragment(value)) return null;
  const text = String(value || '');
  const keys = [
    'mode',
    'translation',
    'directTranslation',
    'sentenceTranslation',
    'sentenceHighlightText',
    'generalMeanings',
    'contextualMeaning',
    'contextExplanation',
    'explanation',
    'etymology',
    'mnemonic',
  ];
  const parsed = { __partial: true };
  for (const key of keys) {
    const match = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`, 'i').exec(text);
    if (match) {
      parsed[key] = decodeJsonStringFragment(match[1]);
    }
  }
  const synonymsMatch = /"englishSynonyms"\s*:\s*\[([^\]]*)/i.exec(text);
  if (synonymsMatch) {
    parsed.englishSynonyms = [...synonymsMatch[1].matchAll(/"((?:\\.|[^"\\])*)"/g)]
      .map((match) => decodeJsonStringFragment(match[1]))
      .filter(Boolean);
  }
  const generalMeaningsMatch = /"generalMeanings"\s*:\s*\[([^\]]*)/i.exec(text);
  if (generalMeaningsMatch) {
    parsed.generalMeanings = [...generalMeaningsMatch[1].matchAll(/"((?:\\.|[^"\\])*)"/g)]
      .map((match) => decodeJsonStringFragment(match[1]))
      .filter(Boolean);
  }
  return Object.keys(parsed).length > 1 ? parsed : null;
}

function normalizeSynonyms(value) {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,;\n]/)
      : [];
  const seen = new Set();
  const items = [];
  for (const item of rawItems) {
    const text = normalizeInlineText(item, 80).replace(/^[-*]\s*/, '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(text);
    if (items.length >= 8) break;
  }
  return items;
}

function normalizeGeneralMeanings(value) {
  const sourceItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? cleanTranslationText(value, 2400)
          .split(/\n+|\s+(?=\d+[.)]\s+)/)
      : [];
  const seen = new Set();
  const meanings = [];
  for (const sourceItem of sourceItems) {
    let rawItem = sourceItem;
    if (sourceItem && typeof sourceItem === 'object' && !Array.isArray(sourceItem)) {
      const pos = normalizeInlineText(
        sourceItem.pos || sourceItem.partOfSpeech || sourceItem.wordClass || '',
        40
      );
      const meaning = normalizeInlineText(
        sourceItem.meaning || sourceItem.translation || sourceItem.definition || sourceItem.sense || '',
        360
      );
      rawItem = [pos, meaning].filter(Boolean).join(': ');
    }
    const text = normalizeInlineText(rawItem, 420)
      .replace(/^[-*•]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .trim();
    if (!text) continue;
    const key = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('tr-TR')
      .replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    meanings.push(text);
    if (meanings.length >= 5) break;
  }
  return meanings.map((meaning, index) => `${index + 1}) ${meaning}`).join('\n');
}

function normalizeExplanation(value) {
  let text = cleanTranslationText(value, 2400);
  if (!text) return '';
  text = text
    .split('\n')
    .map((line) => line.replace(/^\s*[•*]\s+/, '- ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

function replacePlaceholderExplanationLabel(line, targetText) {
  const target = normalizeInlineText(targetText, 80);
  if (!target) return line;
  const placeholderPattern = '(?:piece|real\\s+EN\\s+part|actual\\s+EN\\s+part|actual\\s+part|english\\s+parca|english\\s+part|english\\s+token|english\\s+phrase|label)';
  return String(line || '')
    .replace(
      new RegExp(`^(\\s*[-*]?\\s*)\\*\\*${placeholderPattern}\\s*:?\\*\\*\\s*:?`, 'i'),
      `$1**${target}:**`
    )
    .replace(
      new RegExp(`^(\\s*[-*]?\\s*)${placeholderPattern}\\s*:`, 'i'),
      `$1**${target}:**`
    );
}

function normalizeExplanationLabelKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isGenericExplanationLabel(value) {
  const key = normalizeExplanationLabelKey(value);
  return /^(?:piece|label|part|token|phrase|actual en part|actual part|real en part|english parca|english part|english token|english phrase|english word|en part|en token|en phrase)$/.test(key);
}

function normalizeLeakedExplanationMetaLabel(line, targetText) {
  const target = normalizeInlineText(targetText, 80);
  const source = String(line || '');
  const metaPrefixPattern = '(?:EN|English)\\s*(?:parca|part|piece|token|phrase|word)';
  const metaMatch = new RegExp(`^(\\s*[-*]?\\s*)(?:\\*\\*)?\\s*${metaPrefixPattern}\\s*(?:\\*\\*)?\\s*[:=\\-–—]+\\s*(.+)$`, 'i').exec(source);
  if (!metaMatch) return source;

  const prefix = metaMatch[1] || '';
  const rest = normalizeInlineText(metaMatch[2] || '', 1200);
  if (!rest) return target ? `${prefix}**${target}:**` : '';

  const labelMatch = /^(?:\*\*)?\s*([^:=]{1,90}?)(?:\*\*)?\s*[:=]\s*(.+)$/.exec(rest);
  if (!labelMatch) {
    return target ? `${prefix}**${target}:** ${rest}` : `${prefix}${rest}`;
  }

  let label = normalizeInlineText(String(labelMatch[1] || '').replace(/\*\*/g, ''), 90);
  const body = normalizeInlineText(labelMatch[2] || '', 1200);
  if (!label || isGenericExplanationLabel(label)) {
    label = target;
  }
  if (!label) return body ? `${prefix}${body}` : '';
  return body ? `${prefix}**${label}:** ${body}` : `${prefix}**${label}:**`;
}

function normalizeExplanationForDisplay(value, options = {}) {
  const text = cleanTranslationText(value, 2400);
  if (!text) return '';
  return text
    .split('\n')
    .map((line) => {
      const hasBullet = /^\s*(?:[-*]|â€¢|\u2022)\s+/.test(line);
      let cleanLine = line
        .replace(/^\s*(?:[-*]|â€¢|\u2022)\s+/, '')
        .replace(/\*\*\s*(EN|TR)\s*:\s*\*\*/gi, '$1:')
        .replace(/\b(?:EN|English)\s*:\s*/gi, 'EN:')
        .replace(/\b(?:TR|Turkish|Turkce|Türkçe)\s*:\s*/gi, 'TR:')
        .trim();
      const trMatch = /(?:^|[\s;|/])TR:\s*(.+)$/i.exec(cleanLine);
      if (trMatch) {
        cleanLine = trMatch[1].trim();
      } else {
        cleanLine = cleanLine.replace(/(?:^|[\s;|/])EN:\s*/gi, '').replace(/(?:^|[\s;|/])TR:\s*/gi, '').trim();
      }
      cleanLine = normalizeLeakedExplanationMetaLabel(cleanLine, options.targetText);
      cleanLine = replacePlaceholderExplanationLabel(cleanLine, options.targetText);
      return cleanLine ? `${hasBullet ? '- ' : ''}${cleanLine}` : '';
    })
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fallbackExplanationForDisplay(options = {}) {
  const target = normalizeInlineText(options.targetText, 80);
  const direct = cleanTranslationText(options.directTranslation, 180).replace(/[.;]+$/g, '').trim();
  const contextual = cleanTranslationText(options.contextualMeaning, 260).replace(/[.;]+$/g, '').trim();
  const sentence = cleanTranslationText(options.sentenceTranslation, 320).trim();
  if (!target || (!direct && !contextual)) return '';
  const lines = [];
  if (direct) {
    lines.push(`- **${target}:** Türkçede bu bağlamda **${direct}** çizgisine yaklaşır.`);
  }
  if (contextual && contextual.toLocaleLowerCase('tr-TR') !== direct.toLocaleLowerCase('tr-TR')) {
    lines.push(`- **bağlam:** Burada vurgu **${contextual}** anlamındadır.`);
  }
  const summary = contextual || direct;
  if (summary) {
    lines.push(`Özet: Bu cümlede **${target}**, ${summary}${sentence ? ' fikrini cümle içinde somutlaştırır' : ''}.`);
  }
  return normalizeExplanationForDisplay(lines.join('\n'), { targetText: target });
}

function ensurePhrasalVerbExplanation(value, options = {}) {
  let explanation = normalizeExplanationForDisplay(value, { targetText: options.targetText });
  if (!options.contextPhrase) return explanation;

  explanation = explanation.replace(
    /(\*\*Dilbilgisi:\*\*[^\n(]+)\s*\([^\n)]*(?:güvenle|kesin)[^\n)]*\)/gi,
    '$1'
  ).replace(/\s+([,;:.!?])/g, '$1');

  const target = normalizeInlineText(options.targetText, 100);
  const particle = target.split(/\s+/).slice(1).join(' ');
  const direct = cleanTranslationText(options.directTranslation, 180).replace(/[.;]+$/g, '').trim();
  const contextual = cleanTranslationText(options.contextualMeaning, 260).replace(/[.;]+$/g, '').trim();
  const meaning = (contextual || direct || 'cümledeki bağlamsal anlam')
    .replace(/^bu\s+(?:cümlede|bağlamda)\s*[,;:]?\s*/i, '')
    .replace(/\s+anlamında\s+kullan(?:ılıyor|ılır|ılmıştır|ılmış)\.?$/i, '')
    .replace(/[.;]+$/g, '')
    .trim();
  if (!target || !particle) return explanation;

  const additions = [];
  if (!/bütün\s+kalıp/i.test(explanation)) {
    additions.push(`- **Bütün kalıp – ${target}:** Kalıp bir bütün olarak **${meaning}** anlamına gelir; yalnızca ilk fiilin anlamı değildir.`);
  }
  if (!/parçacığın\s+katkısı/i.test(explanation)) {
    additions.push(`- **Parçacığın katkısı – ${particle}:** Burada **${particle}** tek başına çevrilmez; **${target}** kalıbıyla birlikte bu anlamı kurar.`);
  }
  if (!/dilbilgisi/i.test(explanation)) {
    additions.push(`- **Dilbilgisi:** Ayrılabilirlik/geçişlilik sınıfı güvenle doğrulanmadığında etiket uydurulmaz; kalıbı örnekteki bütün sıra ile kullan: **${options.contextPhrase.surface || target}**.`);
  }
  if (!/bu\s+cümlede/i.test(explanation)) {
    additions.push(`- **Bu cümlede:** **${target}**, ${meaning} anlamında kullanılır.`);
  }
  if (!additions.length) return explanation;
  return normalizeExplanationForDisplay([...additions, explanation].filter(Boolean).join('\n'), { targetText: target });
}

function knownEtymologyForTarget(targetText) {
  const key = asciiLetters(targetText);
  if (/^(?:enquir|inquir)(?:e|es|ed|ing)?$/.test(key)) {
    return [
      'enquire / inquire | sormak, araştırmak | Orta İngilizce enqueren/inquiren ← Eski Fransızca enquerre',
      'inquirere | araştırmak, soruşturmak | Latince in- “içine/üzerine” + quaerere “aramak, sormak”',
      '-ing | süren eylem; burada sıfat-fiil | Orta İngilizcede -ing biçiminde yakınlaşan sıfat-fiil ve ad-fiil çizgileri; Eski İngilizce -ende ile -ing/-ung',
    ].join('\n');
  }
  return '';
}

function normalizeEtymology(value, options = {}) {
  const known = knownEtymologyForTarget(options.targetText);
  if (known) return known;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return cleanTranslationText(item, 360);
        if (!item || typeof item !== 'object') return '';
        const part = normalizeInlineText(item.part || item.root || item.piece || item.term || '', 80);
        const meaning = normalizeInlineText(item.meaning || item.tr || item.turkish || '', 140);
        const note = normalizeInlineText(item.note || item.origin || item.source || item.explanation || '', 260);
        return [part, meaning, note].filter(Boolean).join(' | ');
      })
      .filter(Boolean)
      .join('\n');
  }
  if (value && typeof value === 'object') {
    return normalizeEtymology(value.parts || value.rows || value.items || value.table || '', options);
  }
  const text = cleanTranslationText(value, 2600);
  if (!text || /^yok$/i.test(text)) return '';
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[•*]\s+/, '- ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fallbackNaturalPatternDetail(options = {}) {
  const direct = cleanTranslationText(options.directTranslation, 140)
    .replace(/[.;]+$/g, '')
    .trim();
  if (direct) {
    return `${direct} anlamındaki kullanım`;
  }

  const contextual = cleanTranslationText(options.contextualMeaning, 180)
    .replace(/[.;]+$/g, '')
    .trim();
  if (contextual) {
    return contextual;
  }

  return '';
}

function normalizeNaturalPatternItem(item, options = {}) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const pattern = cleanTranslationText(
      item.pattern || item.phrase || item.collocation || item.english || item.en || item.text || '',
      180
    );
    const detail = cleanTranslationText(
      item.detail || item.meaning || item.turkish || item.tr || item.translation || item.note || '',
      180
    ) || fallbackNaturalPatternDetail(options);
    return pattern && detail ? `${pattern} = ${detail}` : pattern;
  }

  const text = cleanTranslationText(item, 320).replace(/^[-*]\s*/, '').trim();
  if (!text) return '';

  const eqIndex = text.indexOf('=');
  if (eqIndex >= 0) {
    const pattern = cleanTranslationText(text.slice(0, eqIndex), 180);
    const detail = cleanTranslationText(text.slice(eqIndex + 1), 220);
    return pattern && detail ? `${pattern} = ${detail}` : pattern || detail;
  }

  const detail = fallbackNaturalPatternDetail(options);
  return detail ? `${text} = ${detail}` : text;
}

function normalizeNaturalPatterns(value, options = {}) {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\n+/)
      : [];
  const seen = new Set();
  const items = [];
  for (const item of rawItems) {
    const text = normalizeNaturalPatternItem(item, options);
    if (!text) continue;
    const key = text.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(text);
    if (items.length >= 6) break;
  }
  return items.join('\n');
}

function plainMnemonicText(value) {
  return normalizeInlineText(value, 1000)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

function asciiLetters(value) {
  return plainMnemonicText(value).replace(/[^a-z]/g, '');
}

function wordVariants(value) {
  const letters = asciiLetters(value);
  const variants = new Set();
  if (letters.length >= 4) variants.add(letters);
  if (letters.endsWith('ing') && letters.length > 6) {
    const stem = letters.slice(0, -3);
    variants.add(stem);
    variants.add(stem + 'e');
    if (stem.length >= 2 && stem.at(-1) === stem.at(-2)) variants.add(stem.slice(0, -1));
  }
  if (letters.endsWith('ed') && letters.length > 5) {
    variants.add(letters.slice(0, -2));
    variants.add(letters.slice(0, -1));
  }
  if (letters.endsWith('s') && letters.length > 5) variants.add(letters.slice(0, -1));
  return [...variants].filter((item) => item.length >= 4);
}

function mnemonicHookTokens(value) {
  return plainMnemonicText(value).match(/[a-z]{2,}/g) || [];
}

function mnemonicPhoneticKey(value) {
  return asciiLetters(value)
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/qu/g, 'k')
    .replace(/[cq]/g, 'k')
    .replace(/w/g, 'v')
    .replace(/x/g, 'ks')
    .replace(/h/g, '')
    .replace(/(.)\1+/g, '$1');
}

function mnemonicEditDistance(leftValue, rightValue) {
  const left = String(leftValue || '');
  const right = String(rightValue || '');
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index];
  }
  return previous[right.length];
}

function hasCloseMnemonicSound(selectedText, tokens) {
  const target = mnemonicPhoneticKey(selectedText);
  if (target.length < 4) return false;
  const candidates = [...tokens, tokens.join('')]
    .map(mnemonicPhoneticKey)
    .filter((candidate, index, values) => candidate.length >= 3 && values.indexOf(candidate) === index);
  return candidates.some((candidate) => {
    const longest = Math.max(target.length, candidate.length);
    const distance = mnemonicEditDistance(target, candidate);
    const ratio = distance / longest;
    return (distance <= 2 && ratio <= 0.4) || (longest >= 6 && distance <= 3 && ratio <= 0.45);
  });
}

function hasStrongMnemonicHook(selectedText, hook, fullText) {
  const variants = wordVariants(selectedText);
  const tokens = mnemonicHookTokens(hook);
  if (!variants.length || !tokens.length) return false;
  if (hasCloseMnemonicSound(selectedText, tokens)) return true;
  const hasSeparator = /[+\-/]/.test(fullText || hook);
  const hasExtraCue = tokens.length > 1 || tokens.some((token) => !variants.includes(token));

  for (const variant of variants) {
    for (const token of tokens) {
      if (token.length >= 3 && token !== variant && (variant.includes(token) || token.includes(variant))) {
        return true;
      }
      if (token.length >= 3 && variant.startsWith(token) && hasSeparator) {
        return true;
      }
    }
    if (hasSeparator && hasExtraCue) {
      const joined = tokens.join('');
      if (joined.includes(variant) || variant.includes(joined.slice(0, Math.min(joined.length, variant.length)))) {
        return true;
      }
      const matchingPieces = tokens.filter((token) => token.length >= 3 && variant.includes(token));
      if (matchingPieces.length >= 1) return true;
    }
  }

  return false;
}

function isWeakMnemonic(selectedText, value) {
  const text = cleanTranslationText(value, 500);
  if (!text) return true;
  const plain = plainMnemonicText(text);
  if (!plain || ['yok', 'none', 'n/a', 'na', '-'].includes(plain)) return true;
  if (text.length > 260) return true;
  const weakMarkers = [
    'gibi dusun',
    'diye dusun',
    'aklinda tut',
    'anlamina gelir',
    'demektir',
    'sozluk',
    'tanimi',
    'tam nokta degil',
    'turkcede',
    'o noktanin civari',
    'heceye',
    'benzeri ses',
    'similar sound',
    'sounds like',
  ];
  if (weakMarkers.some((marker) => plain.includes(marker))) return true;

  const parts = text.split(/\s*(?:=>|->|=|→)\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return true;

  const hook = parts[0].replace(/^[('"“”‘’]+|[)'"“”‘’]+$/g, '').trim();
  const scene = parts[1] || '';
  const meaning = parts.slice(2).join(' = ');
  if (normalizeInlineText(scene, 200).length < 16 || normalizeInlineText(meaning, 200).length < 3) {
    return true;
  }

  const hookLetters = asciiLetters(hook);
  const selectedLetters = asciiLetters(selectedText);
  const hookTokens = mnemonicHookTokens(hook);
  if (hookLetters && selectedLetters && hookLetters === selectedLetters && hookTokens.length <= 1) {
    return true;
  }
  if (
    hookTokens.length === 1 &&
    selectedLetters.length >= 5 &&
    hookTokens[0].length >= 3 &&
    hookTokens[0] !== selectedLetters &&
    selectedLetters.startsWith(hookTokens[0]) &&
    !/[+\-/]/.test(hook)
  ) {
    return true;
  }
  return !hasStrongMnemonicHook(selectedText, hook, text);
}

function shortMnemonicMeaning(directTranslation, contextualMeaning) {
  const direct = normalizeInlineText(directTranslation, 80);
  if (direct) return direct.replace(/[.;:]+$/g, '');
  let meaning = normalizeInlineText(contextualMeaning, 120)
    .replace(/^Bu\s+(?:baglamda|bağlamda|cumlede|cümlede)\s+/i, '')
    .replace(/^Burada\s+/i, '')
    .replace(/[.;:]+$/g, '');
  if (meaning.length > 72) meaning = meaning.slice(0, 72).replace(/\s+\S*$/, '').trim();
  return meaning || 'baglamdaki anlam';
}

function inferMnemonicCue(selectedText) {
  const letters = asciiLetters(selectedText);
  if (!letters) return '';
  const chunks = [
    'there',
    'about',
    'around',
    'under',
    'over',
    'after',
    'before',
    'some',
    'where',
    'thing',
    'body',
    'ever',
    'never',
    'less',
    'more',
    'out',
    'off',
    'down',
    'back',
  ];
  const found = chunks
    .filter((chunk) => letters.includes(chunk) && chunk !== letters)
    .sort((a, b) => letters.indexOf(a) - letters.indexOf(b) || b.length - a.length);
  if (found.length >= 2) return found.slice(0, 2).join(' + ');
  if (found.length === 1 && found[0].length >= 3) return found[0];
  return '';
}

const MNEMONIC_FALLBACKS = {
  absurd: 'absurd / absurd siren = siren sacma anda susuyor, herkes mantiksiz sahneye bakiyor = {word}; {meaning}',
  arbitrary: 'arbitrary / air + bit = havadaki bitler rastgele kura cekip keyfi karar veriyor = {word}; {meaning}',
  aroused: 'a-roused / horoz = Horoz sabah oterek uyuyan herkesi bir anda ayaga kaldiriyor = {word}; {meaning}',
  arcane: 'arcane / archive cave = arsiv magarasi gizli isaretlerle dolu, sadece uzman anliyor = {word}; {meaning}',
  beneficiary: 'beneficiary / benefit = benefit kasasi acilinca yarari alan kisi odulu topluyor = {word}; {meaning}',
  bewildered: 'bewildered / be + wild = vahsi ormanda tabela karisiyor, kisi kafasi karismis halde kaliyor = {word}; {meaning}',
  comprehensible: 'comprehend/kavramak + -ible/yapılabilir = zihin bir fikri kavrayabiliyorsa metin artık anlaşılır oluyor = {word}; {meaning}',
  conceive: 'conceive / concept = concept ampulu zihinde yanip fikri tasavvur ettiriyor = {word}; {meaning}',
  decline: 'decline / down line = cizgi asagi iniyor, deger yavas yavas azaliyor = {word}; {meaning}',
  deft: 'deft / deft hands = usta eller igneyi tek hamlede geciriyor = {word}; {meaning}',
  devoted: 'devoted / devote = kalp isareti hedefe baglanip kendini adiyor = {word}; {meaning}',
  disassemble: 'dis + assemble = assemble edilen oyuncak tek tek parcalara ayriliyor = {word}; {meaning}',
  drifting: 'drift + ing = drift yapan yaprak suda yonunu kaybedip surukleniyor = {word}; {meaning}',
  elaborate: 'elaborate / lab = laboratuvar masasi ayrintili planlarla doluyor = {word}; {meaning}',
  evident: 'evident + evidence = kanit panosu yaninca durum herkes icin acik ve belli hale geliyor = {word}; {meaning}',
  evidently: 'evident + -ly = kanit panosu yaninca durumun dogru oldugu anlasilan sekilde belli oluyor = {word}; {meaning}',
  enigmatic: 'enigma + attic = tavan arasindaki kilitli kutu gizemli ipuclari sakliyor = {word}; {meaning}',
  elsewhere: 'else + where = ok baska yeri gosteriyor, hedef burada degil = {word}; {meaning}',
  fleeting: 'fleet + ing = hizli filo bir anda gecip kayboluyor = {word}; {meaning}',
  fickle: 'fickle / flip coin = para surekli donuyor, karar her an degisiyor = {word}; {meaning}',
  forebears: 'fore + bears = ondeki eski ayilar aile agacinda atalar gibi bekliyor = {word}; {meaning}',
  gratifying: 'gratifying / grateful = tesekkur kupasi alininca icten tatmin hissi geliyor = {word}; {meaning}',
  intricate: 'intricate / in-tri-crate = uc katli kasa icinde karmasik ipler birbirine dolaniyor = {word}; {meaning}',
  milestone: 'mile + stone = uzun yolda tas tabela onemli donum noktasini gosteriyor = {word}; {meaning}',
  modest: 'modest / low-mode = parlak sahne yerine sade modda mutevazi kisi duruyor = {word}; {meaning}',
  mound: 'mound / mountain round = yuvarlak mini dag gibi yigin kabariyor = {word}; {meaning}',
  mundane: 'mundane / Monday = Monday pazartesi takviminde herkes ayni siradan rutine gidiyor = {word}; {meaning}',
  obliging: 'oblige / helping = yardim eli hemen uzanip istegi yerine getiriyor = {word}; {meaning}',
  possessors: 'possess + owners = sahipler anahtarlari ellerinde tutup mulku sahipleniyor = {word}; {meaning}',
  privileged: 'privilege / private edge = ozel kapidaki kisi ayricalikli gecisten giriyor = {word}; {meaning}',
  pronouncement: 'pronounce + announcement = megafon resmi aciklamayi yuksek sesle duyuruyor = {word}; {meaning}',
  rigid: 'rigid / iron grid = demir izgara hic bukulmeden sert kaliyor = {word}; {meaning}',
  slander: 'slander / mud-slinger = camur atan kisi asilsiz sozleri etrafa saciyor = {word}; {meaning}',
  thereabouts: 'there + about = harita oku tam noktayi degil cevresindeki halkayi isaret ediyor = {word}; {meaning}',
  transfixed: 'trans + fixed = gecitteki sahneye bakan goz sabit kalip buyulenmis halde donuyor = {word}; {meaning}',
  tweezers: 'tweeze + scissors = cimbiz minik kili makas gibi yakalayip cekiyor = {word}; {meaning}',
  uncomplainingly: 'un + complain = sikayet balonu kilitleniyor, kisi sessizce devam ediyor = {word}; {meaning}',
  underappreciated: 'under + appreciated = odul kupasi masanin altinda kaliyor, degeri bilinmiyor = {word}; {meaning}',
  tenuous: 'tenuous / thin thread = ince ip kopacak gibi zayif bag kuruyor = {word}; {meaning}',
  discrete: 'discrete / separate secret = ayri kutular birbirine karismadan duruyor = {word}; {meaning}',
  dismaying: 'dismay / sad maze = moral bozan labirentte herkesin yuzu dusuyor = {word}; {meaning}',
  cooperative: 'cooperat + team = takim ayni kolu birlikte calistiriyor = {word}; {meaning}',
  arresting: 'arrest + attention = dikkat polisi gozleri sahnede durduruyor = {word}; {meaning}',
  impulse: 'impulse / push pulse = nabiz birden zipliyor ve ani istek itiyor = {word}; {meaning}',
  intact: 'in + tact = cam fanus icindeki nesne kirilmadan saglam kaliyor = {word}; {meaning}',
  particles: 'part + articles = kucuk parcalar masaya dagilip parcacik oluyor = {word}; {meaning}',
  arrangement: 'arrange + ment = masa uzerindeki parcalar duzenli sekle diziliyor = {word}; {meaning}',
  peculiar: 'peculiar / peculiar pear = tuhaf sekilli armut herkesin dikkatini cekiyor = {word}; {meaning}',
  atomic: 'atom + ic = atom cekirdegi icinde minicik enerji parliyor = {word}; {meaning}',
  obscure: 'obscure / dark screen = karanlik ekran ayrintiyi belirsiz birakiyor = {word}; {meaning}',
  immense: 'immense / immense mountain = dev dag ufku kapatacak kadar muazzam duruyor = {word}; {meaning}',
  fleetingly: 'fleet + ly = hizli filo goz acip kapayana kadar gecip gidiyor = {word}; {meaning}',
  nonetheless: 'none + less = her sey eksik kalsa da yine de ok ileri gidiyor = {word}; {meaning}',
  astonishing: 'astonish / stone shock = tas heykel sasirip agzi acik kaliyor = {word}; {meaning}',
  perilous: 'peril + ous = tehlike tabelali kopru her adimda risk veriyor = {word}; {meaning}',
  cobbletogether: 'cobble + together = kopuk kablolari bantla birlikte yamuk yumuk birlestiren aceleci tamirci = {word}; {meaning}',
  figureout: 'figure + out = figur panodan disari cikinca cozum bir anda ortaya cikiyor = {word}; {meaning}',
  setup: 'set + up = SET yazili masa yukari kalkip sistem kurulu hale geliyor = {word}; {meaning}',
  lookup: 'look + up = gozler yukari sozluge bakip bilgiyi buluyor = {word}; {meaning}',
  comeupwith: 'come up + with = fikir ampulu yukari cikinca elinde cozumle geliyor = {word}; {meaning}',
  putupwith: 'put up + with = kisi gurultu kutusunu yukari rafa koyup zorla katlaniyor = {word}; {meaning}',
  strayinto: 'stray + into = koyun yoldan sapip yasak bolgeye giriyor; konu baska alana kayiyor = {word}; {meaning}',
  strayfrom: 'stray + from = koyun ana yoldan uzaklasip farkli patikaya sapiyor = {word}; {meaning}',
};

const NATURAL_PATTERN_FALLBACKS = {
  pen: [
    'pen a book = kitap kaleme almak; She penned a book about science. = Bilim hakkinda bir kitap kaleme aldi.',
    'pen an article = makale kaleme almak; He penned an article for the magazine. = Dergi icin bir makale kaleme aldi.',
    'pen a letter = mektup yazmak/kaleme almak; They penned a letter of thanks. = Bir tesekkur mektubu kaleme aldilar.',
    'pen lucid prose = anlasilir bir uslupla yazmak; The writers pen lucid prose. = Yazarlar anlasilir bir uslupla yazar.',
    'pen something for someone = biri icin bir metin yazmak; She penned a speech for the mayor. = Belediye baskani icin bir konusma metni yazdi.',
  ],
  cobbletogether: [
    'cobble together a solution = eldeki imkanlarla hizlica cozum kurmak; They cobbled together a solution overnight. = Bir gecede eldeki imkanlarla bir cozum kurdular.',
    'cobble together a system = sistemi aceleyle parcalardan kurmak; The team cobbled together a system for the demo. = Ekip demo icin sistemi parcalardan aceleyle kurdu.',
    'cobble together evidence = kanitlari uyduruk bicimde bir araya getirmek; He cobbled together evidence from old notes. = Eski notlardan kanitlari bir araya getirdi.',
    'cobble together something quickly = bir seyi hizlica toparlayip kurmak; We cobbled it together quickly. = Onu hizlica toparlayip kurduk.',
  ],
  figureout: [
    'figure out the problem = problemi cozumlemek; I figured out the problem. = Problemi cozdum.',
    'figure out what happened = ne oldugunu anlamak; She figured out what happened. = Ne oldugunu anladi.',
    'figure out how to do it = nasil yapilacagini bulmak; We figured out how to do it. = Nasil yapilacagini bulduk.',
    'try to figure out = anlamaya/cozmeye calismak; They tried to figure it out. = Onu cozmeye calistilar.',
  ],
  setup: [
    'set up a system = sistem kurmak; They set up a new system. = Yeni bir sistem kurdular.',
    'set up a meeting = toplanti ayarlamak; She set up a meeting. = Bir toplanti ayarladi.',
    'set something up = bir seyi kurmak/ayarlamak; We set it up yesterday. = Onu dun kurduk/ayarladik.',
    'be set up = kurulmus/ayarlanmis olmak; The room is set up. = Oda hazir/kurulmus.',
  ],
  strayinto: [
    'stray into dangerous territory = tehlikeli bir alana kaymak; The debate strayed into dangerous territory. = Tartisma tehlikeli bir alana kaydi.',
    'stray into another topic = baska bir konuya sapmak; The lecture strayed into another topic. = Ders baska bir konuya sapti.',
    'stray into politics = konu siyasete kaymak; The conversation strayed into politics. = Sohbet siyasete kaydi.',
    'stray into the realm of something = bir alanin sahasina kaymak; The book strayed into the realm of speculation. = Kitap spekulasyon alanina kaydi.',
  ],
  strayfrom: [
    'stray from the point = konudan sapmak; Try not to stray from the point. = Konudan sapmamaya calis.',
    'stray from the path = yoldan sapmak; The hikers strayed from the path. = Yurumeciler yoldan sapti.',
    'stray from the plan = plandan sapmak; The team strayed from the plan. = Ekip plandan sapti.',
    'stray from tradition = gelenekten uzaklasmak; The design strayed from tradition. = Tasarim gelenekten uzaklasti.',
  ],
  enigmatic: [
    'an enigmatic explanation = esrarengiz/anlasilmasi zor aciklama; The explanation remained enigmatic. = Aciklama esrarengiz kaldi.',
    'enigmatic clue = gizemli ipucu; The letter contained an enigmatic clue. = Mektup gizemli bir ipucu tasiyordu.',
    'enigmatic smile = esrarengiz gulumseme; She gave an enigmatic smile. = Esrarengiz bir sekilde gulumseti.',
    'remain enigmatic = gizemini korumak; The cause remained enigmatic. = Neden gizemini korudu.',
  ],
};

function knownNaturalPatternsForWord(selectedText) {
  const rawKey = asciiLetters(selectedText);
  const key = ['penned', 'penning', 'pens'].includes(rawKey) ? 'pen' : rawKey;
  const patterns = NATURAL_PATTERN_FALLBACKS[key];
  return Array.isArray(patterns) ? patterns.join('\n') : '';
}

const VERB_PATTERN_FALLBACKS = {
  plead: [
    'plead out = suçunu kabul edip savcılıkla anlaşmak (özellikle ABD hukuk dili); He pled out to avoid a trial. = Duruşmadan kaçınmak için suçunu kabul edip anlaşma yaptı.',
    'plead guilty = suçunu kabul etmek; He pleaded guilty to the charge. = Suçlamayı kabul etti.',
    'plead with someone = birine yalvarmak; She pleaded with him to stay. = Kalması için ona yalvardı.',
    'plead for something = bir şey için yalvarmak veya savunmak; They pleaded for mercy. = Merhamet dilediler.',
  ],
};

function knownVerbPatternsForWord(selectedText) {
  const firstToken = tokenizeContextPhraseWords(selectedText)[0]?.key || '';
  const base = [...simpleVerbBases(firstToken)].find((item) => VERB_PATTERN_FALLBACKS[item]);
  const patterns = base ? VERB_PATTERN_FALLBACKS[base] : null;
  return Array.isArray(patterns) ? patterns.join('\n') : '';
}

const CONTEXT_PHRASE_TRANSLATIONS = {
  'plead out': 'suçunu kabul edip savcılıkla anlaşmak',
};

function knownContextPhraseTranslation(targetText) {
  return CONTEXT_PHRASE_TRANSLATIONS[normalizeInlineText(targetText, 120).toLowerCase()] || '';
}

function renderMnemonicTemplate(template, selectedText, meaning) {
  const word = normalizeInlineText(selectedText, 120) || asciiLetters(selectedText);
  return template
    .replace(/\{word\}/g, word)
    .replace(/\{meaning\}/g, meaning);
}

function knownMnemonicForWord(selectedText, meaning) {
  const key = asciiLetters(selectedText);
  if (/^arous(?:e|ed|es|ing)?$/.test(key)) return renderMnemonicTemplate(MNEMONIC_FALLBACKS.aroused, selectedText, meaning);
  if (key === 'forebear') return renderMnemonicTemplate(MNEMONIC_FALLBACKS.forebears, selectedText, meaning);
  if (key === 'transfix' || key === 'transfixes' || key === 'transfixing') return renderMnemonicTemplate(MNEMONIC_FALLBACKS.transfixed, selectedText, meaning);
  if (key === 'rejoice') return `re + joy/joice = RE tusuna basinca JOY/sevinc konfeti gibi tekrar patliyor = ${normalizeInlineText(selectedText, 120) || key}; ${meaning}`;
  if (MNEMONIC_FALLBACKS[key]) return renderMnemonicTemplate(MNEMONIC_FALLBACKS[key], selectedText, meaning);
  return '';
}

function buildSafeMnemonic(selectedText, directTranslation, contextualMeaning) {
  const selected = normalizeInlineText(selectedText, 120);
  const meaning = shortMnemonicMeaning(directTranslation, contextualMeaning);
  const known = knownMnemonicForWord(selected, meaning);
  if (known && !isWeakMnemonic(selected, known)) return known;

  const cue = inferMnemonicCue(selected);
  if (!selected || cue.length < 3 || asciiLetters(selected).length < 4) return '';

  const plain = plainMnemonicText(`${meaning} ${contextualMeaning}`);
  let scene = `${cue.toLocaleUpperCase('tr-TR')} yazili kart, ${meaning} fikrini tek bir resim gibi gosteriyor`;
  if (/(civar|yaklas|yaklaş|cevre|çevre|around|roughly|approximately|near|about)/i.test(plain)) {
    scene = `${cue.toLocaleUpperCase('tr-TR')} yazili haritada oklar tam noktayi degil cevresini gosteriyor`;
  } else if (/(zahmet|ugras|uğraş|emek|effort|trouble|difficulty)/i.test(plain)) {
    scene = `${cue.toLocaleUpperCase('tr-TR')} yazili agir yuku iterken herkes ugrasiyor`;
  }

  const mnemonic = `${cue} = ${scene} = ${selected}; ${meaning}`;
  return isWeakMnemonic(selected, mnemonic) ? '' : mnemonic;
}

function normalizeMnemonic(value, selectedText, fields = {}) {
  const text = cleanTranslationText(value, 500);
  if (text && !isWeakMnemonic(selectedText, text)) return text;
  return buildSafeMnemonic(selectedText, fields.directTranslation, fields.contextualMeaning);
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = normalizeInlineText(value, 120);
    if (!text) continue;
    const seenKey = text.toLocaleLowerCase('tr-TR');
    if (seen.has(seenKey)) continue;
    seen.add(seenKey);
    result.push(text);
  }
  return result;
}

function countHighlightWords(text) {
  const matches = normalizeInlineText(text, 500).match(/[\p{L}\p{M}\p{N}]+/gu);
  return matches ? matches.length : 0;
}

const CONTEXTUAL_HEAD_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'az',
  'bazi',
  'beri',
  'bir',
  'biri',
  'bu',
  'cok',
  'da',
  'de',
  'daha',
  'diye',
  'en',
  'gibi',
  'halde',
  'icin',
  'ile',
  'kadar',
  'olan',
  'olarak',
  'o',
  'once',
  'sonra',
  'su',
  've',
  'veya',
  'ya',
]);

function normalizeLooseHighlightToken(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\u0131/g, 'i')
    .replace(/\u011f/g, 'g')
    .replace(/\u00fc/g, 'u')
    .replace(/\u015f/g, 's')
    .replace(/\u00f6/g, 'o')
    .replace(/\u00e7/g, 'c')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '');
}

function stemLooseHighlightToken(token) {
  const value = normalizeLooseHighlightToken(token);
  const suffixes = [
    'masindan',
    'mesinden',
    'masinin',
    'mesinin',
    'masina',
    'mesine',
    'masini',
    'mesini',
    'masi',
    'mesi',
    'maya',
    'meye',
    'madan',
    'meden',
    'larindan',
    'lerinden',
    'larinin',
    'lerinin',
    'larina',
    'lerine',
    'lardan',
    'lerden',
    'larda',
    'lerde',
    'larin',
    'lerin',
    'lari',
    'leri',
    'lar',
    'ler',
    'nin',
    'nun',
    'den',
    'dan',
    'dir',
    'dur',
    'tir',
    'tur',
    'ye',
    'ya',
    'yi',
    'yu',
    'si',
    'su',
    'de',
    'da',
    'in',
    'un',
    'e',
    'a',
  ];

  for (const suffix of suffixes) {
    if (value.endsWith(suffix) && value.length - suffix.length >= 5) {
      return value.slice(0, -suffix.length);
    }
  }

  return value;
}

function getLooseHighlightTokens(value, maxLength = 1200) {
  const text = cleanTranslationText(value, maxLength);
  return (text.match(/[\p{L}\p{M}\p{N}]+/gu) || [])
    .map((original) => {
      const normalized = normalizeLooseHighlightToken(original);
      if (!normalized) return null;
      return {
        original,
        normalized,
        stem: stemLooseHighlightToken(normalized),
      };
    })
    .filter(Boolean);
}

function isContentHighlightStem(stem) {
  return Boolean(stem && stem.length >= 5 && !CONTEXTUAL_HEAD_STOPWORDS.has(stem));
}

function getSubstantialDirectHighlightStems(directTranslation) {
  const stems = [];
  const seen = new Set();
  for (const token of getLooseHighlightTokens(directTranslation, 240)) {
    if (!isContentHighlightStem(token.stem)) continue;
    if (seen.has(token.stem)) continue;
    seen.add(token.stem);
    stems.push(token.stem);
  }
  return stems;
}

function expandHighlightStemVariants(stem) {
  const value = normalizeLooseHighlightToken(stem);
  const variants = new Set();
  const add = (candidate) => {
    const clean = normalizeLooseHighlightToken(candidate);
    if (clean && clean.length >= 5) variants.add(clean);
  };
  add(value);
  if (value.endsWith('mak') && value.length > 5) {
    const root = value.slice(0, -3);
    add(`${root}ma`);
  }
  if (value.endsWith('mek') && value.length > 5) {
    const root = value.slice(0, -3);
    add(`${root}me`);
  }
  if (value.endsWith('mamak') && value.length > 7) {
    const root = value.slice(0, -5);
    add(`${root}ma`);
  }
  if (value.endsWith('memek') && value.length > 7) {
    const root = value.slice(0, -5);
    add(`${root}me`);
  }
  return [...variants];
}

function areRelatedHighlightStems(left, right) {
  const leftVariants = expandHighlightStemVariants(left);
  const rightVariants = expandHighlightStemVariants(right);
  for (const leftVariant of leftVariants) {
    for (const rightVariant of rightVariants) {
      if (
        isContentHighlightStem(leftVariant) &&
        isContentHighlightStem(rightVariant) &&
        (leftVariant === rightVariant || leftVariant.startsWith(rightVariant) || rightVariant.startsWith(leftVariant))
      ) {
        return true;
      }
    }
  }
  return false;
}

function isSafeContextualHeadHighlight(highlightText, directTranslation) {
  const highlightTokens = getLooseHighlightTokens(highlightText, 160);
  if (highlightTokens.length !== 1) return false;
  const highlightStem = highlightTokens[0].stem;
  return getSubstantialDirectHighlightStems(directTranslation).some((directStem) =>
    areRelatedHighlightStems(highlightStem, directStem)
  );
}

function findContextualHeadHighlight(directTranslation, sentenceTranslation) {
  const directStems = getSubstantialDirectHighlightStems(directTranslation);
  if (!directStems.length) return '';
  for (const word of getLooseHighlightTokens(sentenceTranslation, 1200)) {
    if (!isContentHighlightStem(word.stem)) continue;
    if (directStems.some((directStem) => areRelatedHighlightStems(word.stem, directStem))) {
      return word.original;
    }
  }
  return '';
}

const TARGET_HIGHLIGHT_ALIASES = {
  arcane: ['gizli', 'gizemli', 'sirli', 'sırlı', 'sirlarla dolu', 'sırlarla dolu', 'esrarengiz'],
  mystify: ['kafa karıştırıcı', 'kafa karistirici', 'gizemli', 'anlaşılmaz', 'anlasilmaz', 'şaşırtıcı', 'sasirtici'],
  mystified: ['kafası karışmış', 'kafasi karismis', 'şaşırmış', 'sasirmis', 'afallamış', 'afallamis'],
  mystifying: ['kafa karıştırıcı', 'kafa karistirici', 'gizemli', 'anlaşılmaz', 'anlasilmaz', 'şaşırtıcı', 'sasirtici'],
};

function getSemanticHighlightAliases(options = {}) {
  const aliases = [];
  const add = (candidate) => {
    const clean = normalizeInlineText(candidate, 80);
    if (clean) aliases.push(clean);
  };

  const target = normalizeLooseHighlightToken(options.targetText || '');
  for (const [key, values] of Object.entries(TARGET_HIGHLIGHT_ALIASES)) {
    if (target === normalizeLooseHighlightToken(key)) {
      values.forEach(add);
    }
  }

  const meaningTokens = getLooseHighlightTokens(
    [options.directTranslation || '', options.contextualMeaning || ''].join('\n'),
    1200
  );
  if (meaningTokens.some((token) => /^(gizem|sir|esrar)/.test(token.stem))) {
    ['gizli', 'gizemli', 'sirli', 'sırlı', 'esrarengiz'].forEach(add);
  }

  return uniqueStrings(aliases);
}

function findSemanticMeaningHighlight(sentenceTranslation, options = {}) {
  for (const alias of getSemanticHighlightAliases(options)) {
    const found = findHighlightText(alias, sentenceTranslation, { includeSingleWordFallback: true });
    if (found) return found;
  }
  return '';
}

function getHighlightCandidates(directTranslation, options = {}) {
  const direct = normalizeInlineText(directTranslation, 160);
  if (!direct) return [];
  const parts = direct
    .split(/\s*(?:[,;/|]|\bveya\b|\bya da\b)\s*/i)
    .map((part) => part.replace(/^[('"“”‘’]+|[)'"“”‘’.!?;:]+$/g, '').trim());
  const hasMultiWordPart = parts.some((part) => countHighlightWords(part) >= 2);
  const includeSingleWordFallback = options.includeSingleWordFallback ?? !hasMultiWordPart;
  if (!includeSingleWordFallback) return uniqueStrings(parts);
  const words = parts
    .flatMap((part) => part.split(/\s+/))
    .map((word) => word.replace(/^[('"“”‘’]+|[)'"“”‘’.!?;:]+$/g, '').trim())
    .filter((word) => word.length >= 4);
  return uniqueStrings([...parts, ...words]);
}

function findHighlightText(directTranslation, sentenceTranslation, options = {}) {
  const sentence = cleanTranslationText(sentenceTranslation, 1200);
  if (!sentence) return '';
  const sentenceLower = sentence.toLocaleLowerCase('tr-TR');
  const candidates = getHighlightCandidates(directTranslation, options);

  for (const candidate of candidates) {
    const index = sentenceLower.indexOf(candidate.toLocaleLowerCase('tr-TR'));
    if (index >= 0) return sentence.slice(index, index + candidate.length);
  }

  const words = sentence.match(/[\p{L}\p{M}]+/gu) || [];
  for (const candidate of candidates.filter((item) => !/\s/.test(item))) {
    const candidateLower = candidate.toLocaleLowerCase('tr-TR');
    for (const word of words) {
      const wordLower = word.toLocaleLowerCase('tr-TR');
      if (wordLower.startsWith(candidateLower) && wordLower.length <= candidateLower.length + 8) {
        return word;
      }
    }
  }

  return '';
}

function isTooNarrowPhraseHighlight(highlightText, directTranslation, options = {}) {
  if (options.allowSingleWordMeaning) return false;
  return countHighlightWords(directTranslation) >= 2 && countHighlightWords(highlightText) <= 1;
}

function resolveSentenceHighlightText(sentenceHighlightText, directTranslation, sentenceTranslation, options = {}) {
  const allowSingleWordMeaning = countHighlightWords(options.targetText || '') <= 1;
  const provided = cleanTranslationText(sentenceHighlightText, 160);
  if (provided && !isTooNarrowPhraseHighlight(provided, directTranslation, { allowSingleWordMeaning })) {
    const found = findHighlightText(provided, sentenceTranslation);
    if (found && !isTooNarrowPhraseHighlight(found, directTranslation, { allowSingleWordMeaning })) return found;
  } else if (provided) {
    const found = findHighlightText(provided, sentenceTranslation);
    if (found && isSafeContextualHeadHighlight(found, directTranslation)) return found;
  }

  const directMatch = findHighlightText(directTranslation, sentenceTranslation, {
    includeSingleWordFallback: allowSingleWordMeaning || countHighlightWords(directTranslation) <= 1,
  });
  if (directMatch) return directMatch;

  const semanticMatch = findSemanticMeaningHighlight(sentenceTranslation, {
    targetText: options.targetText,
    directTranslation,
    contextualMeaning: options.contextualMeaning,
  });
  if (semanticMatch) return semanticMatch;

  return findContextualHeadHighlight(directTranslation, sentenceTranslation);
}

function createSection(key, value, options = {}) {
  const maxLength = key === 'explanation' || key === 'etymology'
    ? 2600
    : key === 'contextExplanation'
      ? 1600
      : 1200;
  const text = Array.isArray(value)
    ? value.map((item) => normalizeInlineText(item, 80)).filter(Boolean).join(', ')
    : cleanTranslationText(value, maxLength);
  if (!text) return null;
  const section = {
    key,
    label: TERM_SECTION_LABELS[key] || key,
    value: text,
  };
  const highlightText = cleanTranslationText(options.highlightText, 160);
  if (highlightText) {
    section.highlightText = highlightText;
  }
  return section;
}

function normalizeTranslationOutput(rawOutput, selectedText, contextText) {
  const classification = classifyTranslationSelection(selectedText);
  const parsed = parseTranslationJson(rawOutput) || parseLooseTranslationJson(rawOutput);
  const fallbackText = parsed || looksLikeJsonFragment(rawOutput) ? '' : cleanTranslationText(rawOutput, 1200);
  const target = resolveTranslationSelectionTarget(selectedText, contextText || selectedText);
  const targetText = target.targetText || normalizeInlineText(selectedText, 1000);

  if (classification.mode === 'sentence') {
    const translation = cleanTranslationText(
      parsed?.translation || parsed?.directTranslation || parsed?.sentenceTranslation || fallbackText,
      1200
    );
    return {
      selectionMode: 'sentence',
      selectionModeReason: classification.reason,
      selectedWordCount: classification.wordCount,
      targetText,
      contextPhrase: target.phrase,
      translation,
      directTranslation: translation,
      sentenceTranslation: translation,
      contextualMeaning: '',
      contextExplanation: '',
      generalMeanings: '',
      explanation: '',
      etymology: '',
      naturalPatterns: '',
      verbPatterns: '',
      englishSynonyms: [],
      mnemonic: '',
      translationSections: [],
    };
  }

  const englishSynonyms = normalizeSynonyms(parsed?.englishSynonyms || parsed?.synonyms);
  const directTranslation = knownContextPhraseTranslation(targetText) ||
    cleanTranslationText(parsed?.directTranslation || parsed?.translation || fallbackText, 500);
  const sentenceTranslation = cleanTranslationText(parsed?.sentenceTranslation || parsed?.sentence || '', 900);
  const sentenceHighlightText = cleanTranslationText(parsed?.sentenceHighlightText || parsed?.highlightText || '', 160);
  const generalMeanings = normalizeGeneralMeanings(
    parsed?.generalMeanings || parsed?.meanings || parsed?.commonMeanings || parsed?.dictionaryMeanings || ''
  );
  const contextualMeaning = cleanTranslationText(parsed?.contextualMeaning || parsed?.meaningInContext || parsed?.contextMeaning || '', 700);
  const contextExplanation = cleanTranslationText(
    parsed?.contextExplanation || parsed?.contextualExplanation || parsed?.baglamaGoreAciklama || '',
    1600
  ).replace(/^(?:bağlama göre açıklama|baglama gore aciklama|context(?:ual)? explanation)\s*[:：-]\s*/i, '').trim();
  let explanation = normalizeExplanationForDisplay(
    parsed?.explanation || parsed?.aciklama || parsed?.explanationText || '',
    { targetText }
  );
  if (!explanation) {
    explanation = fallbackExplanationForDisplay({
      targetText,
      directTranslation,
      contextualMeaning,
      sentenceTranslation,
    });
  }
  explanation = ensurePhrasalVerbExplanation(explanation, {
    targetText,
    contextPhrase: target.phrase,
    directTranslation,
    contextualMeaning,
  });
  const etymology = normalizeEtymology(
    parsed?.etymology || parsed?.etimoloji || parsed?.wordOrigin || parsed?.origin || parsed?.originNote || '',
    { targetText }
  );
  let naturalPatterns = normalizeNaturalPatterns(
    parsed?.naturalPatterns || parsed?.patterns || parsed?.collocations || parsed?.naturalPhrases || '',
    { directTranslation, contextualMeaning }
  );
  if (!naturalPatterns) {
    naturalPatterns = knownNaturalPatternsForWord(targetText);
  }
  let verbPatterns = normalizeNaturalPatterns(
    parsed?.verbPatterns || parsed?.phrasalVerbPatterns || parsed?.verbConstructions || '',
    { directTranslation, contextualMeaning }
  );
  const knownVerbPatterns = knownVerbPatternsForWord(targetText);
  if (knownVerbPatterns) verbPatterns = knownVerbPatterns;
  const mnemonic = normalizeMnemonic(
    parsed?.mnemonic || parsed?.memoryHook || parsed?.mnemonicTip || '',
    targetText,
    { directTranslation, contextualMeaning }
  );
  const sections = TERM_SECTION_ORDER
    .map((key) => {
      if (key === 'directTranslation') return createSection(key, directTranslation);
      if (key === 'sentenceTranslation') {
        return createSection(key, sentenceTranslation, {
          highlightText: resolveSentenceHighlightText(sentenceHighlightText, directTranslation, sentenceTranslation, {
            targetText,
            contextualMeaning,
          }),
        });
      }
      if (key === 'generalMeanings') return createSection(key, generalMeanings);
      if (key === 'contextualMeaning') return createSection(key, contextualMeaning);
      if (key === 'contextExplanation') return createSection(key, contextExplanation);
      if (key === 'verbPatterns') return createSection(key, verbPatterns);
      if (key === 'explanation') return createSection(key, explanation);
      if (key === 'etymology') return createSection(key, etymology);
      if (key === 'naturalPatterns') return createSection(key, naturalPatterns);
      if (key === 'englishSynonyms') return createSection(key, englishSynonyms);
      if (key === 'mnemonic') return createSection(key, mnemonic);
      return null;
    })
    .filter(Boolean);

  const translation = directTranslation || sentenceTranslation || contextualMeaning || englishSynonyms.join(', ');

  return {
    selectionMode: 'term',
    selectionModeReason: classification.reason,
    selectedWordCount: classification.wordCount,
    targetText,
    contextPhrase: target.phrase,
    translation,
    directTranslation,
    sentenceTranslation,
    sentenceHighlightText,
    generalMeanings,
    contextualMeaning,
    contextExplanation,
    explanation,
    etymology,
    naturalPatterns,
    verbPatterns,
    englishSynonyms,
    mnemonic,
    translationSections: sections,
    partial: parsed?.__partial === true,
    detailStatus: parsed?.__partial === true ? 'partial_json_recovered' : 'complete',
  };
}

function normalizeQuickTranslationOutput(rawOutput, selectedText, contextText) {
  const classification = classifyTranslationSelection(selectedText);
  const parsed = parseTranslationJson(rawOutput) || parseLooseTranslationJson(rawOutput);
  const fallbackText = parsed || looksLikeJsonFragment(rawOutput) ? '' : cleanTranslationText(rawOutput, 1200);
  const target = resolveTranslationSelectionTarget(selectedText, contextText || selectedText);
  const targetText = target.targetText || normalizeInlineText(selectedText, 1000);

  if (classification.mode === 'sentence') {
    const translation = cleanTranslationText(
      parsed?.translation || parsed?.directTranslation || parsed?.sentenceTranslation || fallbackText,
      1200
    );
    return {
      selectionMode: 'sentence',
      selectionModeReason: classification.reason,
      selectedWordCount: classification.wordCount,
      targetText,
      contextPhrase: target.phrase,
      translation,
      directTranslation: translation,
      sentenceTranslation: translation,
      sentenceHighlightText: '',
      contextualMeaning: '',
      generalMeanings: '',
      explanation: '',
      etymology: '',
      naturalPatterns: '',
      verbPatterns: '',
      englishSynonyms: [],
      mnemonic: '',
      translationSections: [],
      partial: false,
      detailStatus: 'complete',
    };
  }

  const directTranslation = knownContextPhraseTranslation(targetText) ||
    cleanTranslationText(parsed?.directTranslation || parsed?.translation || fallbackText, 500);
  const sentenceTranslation = cleanTranslationText(parsed?.sentenceTranslation || parsed?.sentence || '', 900);
  const sentenceHighlightText = cleanTranslationText(parsed?.sentenceHighlightText || parsed?.highlightText || '', 160);
  const sections = [
    createSection('directTranslation', directTranslation),
    createSection('sentenceTranslation', sentenceTranslation, {
      highlightText: resolveSentenceHighlightText(sentenceHighlightText, directTranslation, sentenceTranslation, {
        targetText,
      }),
    }),
  ].filter(Boolean);
  const translation = directTranslation || sentenceTranslation;

  return {
    selectionMode: 'term',
    selectionModeReason: classification.reason,
    selectedWordCount: classification.wordCount,
    targetText,
    contextPhrase: target.phrase,
    translation,
    directTranslation,
    sentenceTranslation,
    sentenceHighlightText,
    contextualMeaning: '',
    generalMeanings: '',
    explanation: '',
    etymology: '',
    naturalPatterns: '',
    verbPatterns: '',
    englishSynonyms: [],
    mnemonic: '',
    translationSections: sections,
    partial: true,
    detailStatus: 'loading',
  };
}

function normalizeCoreTranslationOutput(rawOutput, selectedText, contextText) {
  const classification = classifyTranslationSelection(selectedText);
  if (classification.mode === 'sentence') {
    return normalizeQuickTranslationOutput(rawOutput, selectedText, contextText);
  }

  const parsed = parseTranslationJson(rawOutput) || parseLooseTranslationJson(rawOutput);
  const fallbackText = parsed || looksLikeJsonFragment(rawOutput) ? '' : cleanTranslationText(rawOutput, 1200);
  const target = resolveTranslationSelectionTarget(selectedText, contextText || selectedText);
  const targetText = target.targetText || normalizeInlineText(selectedText, 1000);
  const directTranslation = knownContextPhraseTranslation(targetText) ||
    cleanTranslationText(parsed?.directTranslation || parsed?.translation || fallbackText, 500);
  const sentenceTranslation = cleanTranslationText(parsed?.sentenceTranslation || parsed?.sentence || '', 900);
  const sentenceHighlightText = cleanTranslationText(parsed?.sentenceHighlightText || parsed?.highlightText || '', 160);
  const generalMeanings = normalizeGeneralMeanings(
    parsed?.generalMeanings || parsed?.meanings || parsed?.commonMeanings || parsed?.dictionaryMeanings || ''
  );
  const contextualMeaning = cleanTranslationText(parsed?.contextualMeaning || parsed?.meaningInContext || parsed?.contextMeaning || '', 700);
  const contextExplanation = cleanTranslationText(
    parsed?.contextExplanation || parsed?.contextualExplanation || parsed?.baglamaGoreAciklama || '',
    1600
  ).replace(/^(?:bağlama göre açıklama|baglama gore aciklama|context(?:ual)? explanation)\s*[:：-]\s*/i, '').trim();
  const englishSynonyms = normalizeSynonyms(parsed?.englishSynonyms || parsed?.synonyms);
  const sections = [
    createSection('directTranslation', directTranslation),
    createSection('sentenceTranslation', sentenceTranslation, {
      highlightText: resolveSentenceHighlightText(sentenceHighlightText, directTranslation, sentenceTranslation, {
        targetText,
        contextualMeaning,
      }),
    }),
    createSection('generalMeanings', generalMeanings),
    createSection('englishSynonyms', englishSynonyms),
    createSection('contextualMeaning', contextualMeaning),
    createSection('contextExplanation', contextExplanation),
  ].filter(Boolean);
  const translation = directTranslation || sentenceTranslation || contextualMeaning || englishSynonyms.join(', ');

  return {
    selectionMode: 'term',
    selectionModeReason: classification.reason,
    selectedWordCount: classification.wordCount,
    targetText,
    contextPhrase: target.phrase,
    translation,
    directTranslation,
    sentenceTranslation,
    sentenceHighlightText,
    generalMeanings,
    contextualMeaning,
    contextExplanation,
    explanation: '',
    etymology: '',
    naturalPatterns: '',
    verbPatterns: '',
    englishSynonyms,
    mnemonic: '',
    translationSections: sections,
    partial: true,
    detailStatus: 'core_complete',
  };
}

function normalizeDetailTranslationOutput(rawOutput, selectedText, contextText, coreResult = {}) {
  const classification = classifyTranslationSelection(selectedText);
  const parsed = parseTranslationJson(rawOutput) || parseLooseTranslationJson(rawOutput) || {};
  const target = resolveTranslationSelectionTarget(selectedText, contextText || selectedText);
  const targetText = target.targetText || normalizeInlineText(selectedText, 1000);
  const directTranslation = knownContextPhraseTranslation(targetText) ||
    cleanTranslationText(coreResult.directTranslation || coreResult.translation || '', 500);
  const sentenceTranslation = cleanTranslationText(coreResult.sentenceTranslation || '', 900);
  const sentenceHighlightText = cleanTranslationText(coreResult.sentenceHighlightText || '', 160);
  const generalMeanings = normalizeGeneralMeanings(coreResult.generalMeanings || '');
  const contextualMeaning = cleanTranslationText(coreResult.contextualMeaning || directTranslation, 700);
  const contextExplanation = cleanTranslationText(coreResult.contextExplanation || '', 1600);
  const englishSynonyms = normalizeSynonyms(coreResult.englishSynonyms || []);
  let explanation = normalizeExplanationForDisplay(
    parsed?.explanation || parsed?.aciklama || parsed?.explanationText || '',
    { targetText }
  );
  if (!explanation) {
    explanation = fallbackExplanationForDisplay({
      targetText,
      directTranslation,
      contextualMeaning,
      sentenceTranslation,
    });
  }
  explanation = ensurePhrasalVerbExplanation(explanation, {
    targetText,
    contextPhrase: target.phrase,
    directTranslation,
    contextualMeaning,
  });
  const etymology = normalizeEtymology(
    parsed?.etymology || parsed?.etimoloji || parsed?.wordOrigin || parsed?.origin || parsed?.originNote || '',
    { targetText }
  );
  let naturalPatterns = normalizeNaturalPatterns(
    parsed?.naturalPatterns || parsed?.patterns || parsed?.collocations || parsed?.naturalPhrases || '',
    { directTranslation, contextualMeaning }
  );
  if (!naturalPatterns) {
    naturalPatterns = knownNaturalPatternsForWord(targetText);
  }
  let verbPatterns = normalizeNaturalPatterns(
    parsed?.verbPatterns || parsed?.phrasalVerbPatterns || parsed?.verbConstructions || '',
    { directTranslation, contextualMeaning }
  );
  const knownVerbPatterns = knownVerbPatternsForWord(targetText);
  if (knownVerbPatterns) verbPatterns = knownVerbPatterns;
  const sections = TERM_SECTION_ORDER
    .map((key) => {
      if (key === 'directTranslation') return createSection(key, directTranslation);
      if (key === 'sentenceTranslation') {
        return createSection(key, sentenceTranslation, {
          highlightText: resolveSentenceHighlightText(sentenceHighlightText, directTranslation, sentenceTranslation, {
            targetText,
            contextualMeaning,
          }),
        });
      }
      if (key === 'generalMeanings') return createSection(key, generalMeanings);
      if (key === 'contextualMeaning') return createSection(key, contextualMeaning);
      if (key === 'contextExplanation') return createSection(key, contextExplanation);
      if (key === 'verbPatterns') return createSection(key, verbPatterns);
      if (key === 'explanation') return createSection(key, explanation);
      if (key === 'etymology') return createSection(key, etymology);
      if (key === 'naturalPatterns') return createSection(key, naturalPatterns);
      if (key === 'englishSynonyms') return createSection(key, englishSynonyms);
      return null;
    })
    .filter(Boolean);
  const translation = directTranslation || sentenceTranslation || contextualMeaning || englishSynonyms.join(', ');

  return {
    selectionMode: classification.mode,
    selectionModeReason: classification.reason,
    selectedWordCount: classification.wordCount,
    targetText,
    contextPhrase: target.phrase,
    translation,
    directTranslation,
    sentenceTranslation,
    sentenceHighlightText,
    generalMeanings,
    contextualMeaning,
    contextExplanation,
    explanation,
    etymology,
    naturalPatterns,
    verbPatterns,
    englishSynonyms,
    mnemonic: '',
    translationSections: sections,
    partial: false,
    detailStatus: 'complete',
  };
}

function formatTranslationSectionsText(result) {
  const sections = Array.isArray(result?.translationSections) ? result.translationSections : [];
  if (!sections.length) return cleanTranslationText(result?.translation, 1200);
  return sections
    .map((section) => `${section.label}: ${cleanTranslationText(section.value, 1200)}`)
    .filter((line) => !line.endsWith(': '))
    .join('\n\n');
}

module.exports = {
  TERM_SECTION_LABELS,
  TERM_SECTION_ORDER,
  buildCoreTranslationPrompt,
  buildDetailEtymologyPrompt,
  buildDetailTranslationPrompt,
  buildDetailUsagePrompt,
  buildFullCardTranslationPrompt,
  buildQuickTranslationPrompt,
  buildSafeMnemonic,
  buildTranslationPrompt,
  classifyTranslationSelection,
  cleanTranslationText,
  detectContextPhraseForSelection,
  extractContextSentence,
  formatTranslationSectionsText,
  isWeakMnemonic,
  mergeDetailTranslationOutputs,
  normalizeCoreTranslationOutput,
  normalizeDetailTranslationOutput,
  normalizeQuickTranslationOutput,
  normalizeTranslationOutput,
  resolveTranslationSelectionTarget,
};
