import { renderWidget, usePlugin, WidgetLocation } from '@remnote/plugin-sdk';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../style.css';
import { hostKeyHeaders, primeHostKey } from '../core/host-key';

const HOST_CALL_URL = 'http://127.0.0.1:3400/call';

interface TranslationContextData {
  source?: string;
  selectedText?: string;
  contextText?: string;
  focusedEditorText?: string;
  actionArgsPreview?: string;
  traceId?: string;
}

interface TranslationSection {
  key: string;
  label: string;
  value: string;
  highlightText?: string;
  imageUrls?: string[];
}

interface HostTranslateResult {
  translation?: string;
  directTranslation?: string;
  sentenceTranslation?: string;
  contextualMeaning?: string;
  contextExplanation?: string;
  generalMeanings?: string;
  naturalPatterns?: string;
  verbPatterns?: string;
  englishSynonyms?: string[];
  mnemonic?: string;
  translationSections?: TranslationSection[];
  selectionMode?: string;
  selectionModeReason?: string;
  selectedWordCount?: number;
  selectedText?: string;
  targetText?: string;
  contextPhrase?: unknown;
  contextText?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  traceId?: string;
  debugStage?: string;
  errorClass?: string | null;
  partial?: boolean;
  detailStatus?: string;
}

interface MnemonicCandidateResponse {
  candidates?: string[];
  source?: string;
  model?: string;
  warning?: string;
  cached?: boolean;
  cacheLayer?: string | null;
  coalesced?: boolean;
}

interface ImageCandidate {
  title?: string;
  imageUrl?: string;
  thumbUrl?: string;
  pageUrl?: string;
  source?: string;
  license?: string;
  creator?: string;
  displayMode?: 'contain' | 'cover';
  score?: number;
}

interface ImageCandidateResponse {
  candidates?: ImageCandidate[];
  featuredCandidate?: ImageCandidate | null;
  errors?: string[];
  durationMs?: number;
}

interface TopicChatResponse {
  answer?: string;
  model?: string;
  durationMs?: number;
  traceId?: string;
  quick?: boolean;
}

interface TopicChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: string;
  qualityPending?: boolean;
}

interface TranslateErrorDetails {
  message: string;
  traceId?: string;
  errorClass?: string;
  stage?: string;
  advice?: string;
}

type LoadState = 'loading' | 'ready' | 'error';

function cleanText(value: unknown, maxLength = 3000): string {
  return (typeof value === 'string' ? value : '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function deleteTextareaText(textarea: HTMLTextAreaElement, key: 'Backspace' | 'Delete'): void {
  const value = textarea.value;
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? start;
  let deleteStart = start;
  let deleteEnd = end;
  if (start === end && key === 'Backspace' && start > 0) {
    const previousCharacter = Array.from(value.slice(0, start)).pop() || '';
    deleteStart = Math.max(0, start - previousCharacter.length);
  } else if (start === end && key === 'Delete' && end < value.length) {
    const nextCharacter = Array.from(value.slice(end))[0] || '';
    deleteEnd = Math.min(value.length, end + nextCharacter.length);
  }
  if (deleteStart !== deleteEnd) {
    textarea.setRangeText('', deleteStart, deleteEnd, 'end');
  }
}

const SECTION_ICON_BY_KEY: Record<string, string> = {
  directTranslation: '↔',
  sentenceTranslation: '¶',
  contextualMeaning: '◎',
  contextExplanation: '↳',
  generalMeanings: 'A',
  englishSynonyms: '≈',
  naturalPatterns: '#',
  verbPatterns: '↗',
  explanation: '?',
  etymology: '⌁',
  mnemonic: '✦',
  visualCue: '□',
  seriesPosition: '§',
  exampleSentence: 'Ex',
  level: 'Lv',
};

function sectionIcon(section: TranslationSection): string {
  if (SECTION_ICON_BY_KEY[section.key]) return SECTION_ICON_BY_KEY[section.key];
  const label = cleanText(section.label, 80).toLocaleLowerCase('tr-TR');
  const asciiLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (asciiLabel.includes('direkt')) return SECTION_ICON_BY_KEY.directTranslation;
  if (asciiLabel.includes('cumle')) return SECTION_ICON_BY_KEY.sentenceTranslation;
  if (asciiLabel.includes('baglam')) return SECTION_ICON_BY_KEY.contextualMeaning;
  if (asciiLabel.includes('genel anlam')) return SECTION_ICON_BY_KEY.generalMeanings;
  if (asciiLabel.includes('es anlam') || label.includes('synonym')) return SECTION_ICON_BY_KEY.englishSynonyms;
  if (asciiLabel.includes('dogal kalip') || label.includes('natural pattern')) return SECTION_ICON_BY_KEY.naturalPatterns;
  if (asciiLabel.includes('phrasal verb') || asciiLabel.includes('fiil kalip')) return SECTION_ICON_BY_KEY.verbPatterns;
  if (asciiLabel.includes('aciklama') || label.includes('explanation')) return SECTION_ICON_BY_KEY.explanation;
  if (asciiLabel.includes('etimoloji') || label.includes('etymology')) return SECTION_ICON_BY_KEY.etymology;
  if (label.includes('mnemonic')) return SECTION_ICON_BY_KEY.mnemonic;
  if (asciiLabel.includes('gorsel') || label.includes('visual')) return SECTION_ICON_BY_KEY.visualCue;
  if (asciiLabel.includes('dizideki')) return SECTION_ICON_BY_KEY.seriesPosition;
  if (asciiLabel.includes('ornek')) return SECTION_ICON_BY_KEY.exampleSentence;
  if (asciiLabel.includes('seviye')) return SECTION_ICON_BY_KEY.level;
  return '•';
}

function createClientTraceId(): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `ui_${Date.now()}_${suffix}`;
}

function formatTranslationForCopy(translation: string, sections: TranslationSection[]): string {
  if (!sections.length) return translation;
  return sections
    .map((section) => `${section.label}: ${cleanText(section.value, 1200)}`)
    .filter((line) => !line.endsWith(': '))
    .join('\n\n');
}

function renderHighlightedText(value: string, highlightText?: string): React.ReactNode {
  const text = cleanText(value, 1200);
  const needle = cleanText(highlightText, 160);
  if (!text || !needle) return text;

  const index = text.toLocaleLowerCase('tr-TR').indexOf(needle.toLocaleLowerCase('tr-TR'));
  if (index < 0) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + needle.length);
  const after = text.slice(index + needle.length);
  return (
    <>
      {before}
      <span className="mcp-translate-popup__highlight">{match.toLocaleUpperCase('tr-TR')}</span>
      {after}
    </>
  );
}

interface PatternDisplayRow {
  pattern: string;
  meaning: string;
  exampleEnglish: string;
  exampleTurkish: string;
}

function isPatternSection(section: TranslationSection): boolean {
  const label = cleanText(section.label, 80).toLocaleLowerCase('tr-TR');
  const asciiLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return section.key === 'naturalPatterns' || section.key === 'verbPatterns' ||
    asciiLabel.includes('dogal kalip') || asciiLabel.includes('phrasal verb') ||
    asciiLabel.includes('fiil kalip');
}

function parsePatternDisplayRows(value: string): PatternDisplayRow[] {
  return cleanText(value, 1800)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const firstEquals = line.indexOf('=');
      if (firstEquals < 0) {
        return { pattern: line, meaning: '', exampleEnglish: '', exampleTurkish: '' };
      }
      const pattern = line.slice(0, firstEquals).trim();
      const remainder = line.slice(firstEquals + 1).trim();
      const semicolon = remainder.indexOf(';');
      const meaning = (semicolon >= 0 ? remainder.slice(0, semicolon) : remainder).trim();
      const example = semicolon >= 0 ? remainder.slice(semicolon + 1).trim() : '';
      const exampleEquals = example.indexOf('=');
      return {
        pattern,
        meaning,
        exampleEnglish: (exampleEquals >= 0 ? example.slice(0, exampleEquals) : example).trim(),
        exampleTurkish: (exampleEquals >= 0 ? example.slice(exampleEquals + 1) : '').trim(),
      };
    });
}

function renderPatternSection(value: string): React.ReactNode {
  const rows = parsePatternDisplayRows(value);
  if (rows.length < 2) return value;
  return (
    <div className="mcp-translate-popup__pattern-list">
      {rows.map((row, index) => (
        <div className="mcp-translate-popup__pattern-row" key={`${row.pattern}-${index}`}>
          <div className="mcp-translate-popup__pattern-term">{row.pattern}</div>
          {row.meaning ? <div className="mcp-translate-popup__pattern-meaning">{row.meaning}</div> : null}
          {row.exampleEnglish ? (
            <div className="mcp-translate-popup__pattern-example">
              <span className="mcp-translate-popup__pattern-example-en">{row.exampleEnglish}</span>
              {row.exampleTurkish ? <span className="mcp-translate-popup__pattern-example-separator">=</span> : null}
              {row.exampleTurkish ? <span>{row.exampleTurkish}</span> : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function renderChatInline(value: string): React.ReactNode {
  const text = cleanText(value, 1200);
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
    : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>);
}

function renderChatAnswer(value: string): React.ReactNode {
  const lines = cleanText(value, 4000).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return (
    <div className="mcp-translate-popup__chat-answer">
      {lines.map((line, index) => {
        const bullet = /^[-*]\s+(.+)$/.exec(line);
        return bullet ? (
          <div className="mcp-translate-popup__chat-bullet" key={`${line}-${index}`}>
            <span aria-hidden="true">•</span>
            <span>{renderChatInline(bullet[1])}</span>
          </div>
        ) : (
          <p key={`${line}-${index}`}>{renderChatInline(line)}</p>
        );
      })}
    </div>
  );
}

function getErrorDetails(error: unknown): TranslateErrorDetails {
  const source = error as Partial<TranslateErrorDetails> | null;
  return {
    message: error instanceof Error ? error.message : String(error || 'Ceviri alinamadi.'),
    traceId: typeof source?.traceId === 'string' ? source.traceId : undefined,
    errorClass: typeof source?.errorClass === 'string' ? source.errorClass : undefined,
    stage: typeof source?.stage === 'string' ? source.stage : undefined,
    advice: typeof source?.advice === 'string' ? source.advice : undefined,
  };
}

function createSolMnemonicPrefetchKey(
  selectedText: string,
  contextText: string,
  result: HostTranslateResult | null
): string {
  if (!selectedText || !result || result.selectionMode === 'sentence') return '';
  const directTranslation = cleanText(result.directTranslation, 1200);
  const hasMeaningCore = Boolean(
    directTranslation || cleanText(result.generalMeanings, 1200) || cleanText(result.contextualMeaning, 1200)
  );
  if (!hasMeaningCore) return '';
  return JSON.stringify({
    selectedText,
    contextText: contextText.slice(0, 3000),
    targetText: cleanText(result.targetText || selectedText, 1000),
  });
}

function createImagePrefetchKey(
  selectedText: string,
  contextText: string,
  result: HostTranslateResult | null
): string {
  if (!selectedText || !result || result.selectionMode === 'sentence') return '';
  const hasMeaningCore = Boolean(
    cleanText(result.directTranslation, 1200) ||
    cleanText(result.generalMeanings, 1200) ||
    cleanText(result.contextualMeaning, 1200)
  );
  if (!hasMeaningCore) return '';
  return JSON.stringify({
    selectedText,
    contextText: contextText.slice(0, 3000),
    targetText: cleanText(result.targetText || selectedText, 1000),
  });
}

async function requestTranslation(
  selectedText: string,
  contextText: string,
  traceId: string,
  source: string,
  stage: 'core' | 'details' | 'full' = 'full',
  coreResult?: HostTranslateResult
): Promise<HostTranslateResult> {
  const action = stage === 'core'
    ? 'host_translate_selection_core'
    : stage === 'details'
      ? 'host_translate_selection_details'
      : 'host_translate_selection';
  const timeoutMs = stage === 'core' ? 35000 : stage === 'details' ? 50000 : 25000;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(HOST_CALL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await hostKeyHeaders()),
      },
      signal: controller.signal,
      body: JSON.stringify({
        action,
        payload: {
          selectedText,
          contextText,
          traceId,
          source,
          ...(stage === 'details' ? { coreResult: coreResult || {} } : {}),
        },
      }),
    });
    const data = await response.json();
    if (!response.ok || data?.ok !== true) {
      const error = new Error(data?.error || `Translation request failed (${response.status})`) as Error & TranslateErrorDetails;
      error.traceId = data?.traceId || traceId;
      error.errorClass = data?.errorClass;
      error.stage = data?.stage;
      error.advice = data?.advice;
      throw error;
    }
    return data.result as HostTranslateResult;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${stage} translation timed out after ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function requestHostAction<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(HOST_CALL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await hostKeyHeaders()),
    },
    body: JSON.stringify({ action, payload }),
  });
  const data = await response.json();
  if (!response.ok || data?.ok !== true) {
    throw new Error(data?.error || `${action} failed (${response.status})`);
  }
  return data.result as T;
}

function upsertTranslationSection(
  sections: TranslationSection[],
  next: TranslationSection,
  afterKey?: string
): TranslationSection[] {
  const cleanNext = {
    ...next,
    value: cleanText(next.value, 1200),
  };
  const existingIndex = sections.findIndex((section) => section.key === cleanNext.key);
  if (existingIndex >= 0) {
    return sections.map((section, index) => (index === existingIndex ? cleanNext : section));
  }
  const afterIndex = afterKey ? sections.findIndex((section) => section.key === afterKey) : -1;
  if (afterIndex >= 0) {
    return [
      ...sections.slice(0, afterIndex + 1),
      cleanNext,
      ...sections.slice(afterIndex + 1),
    ];
  }
  return [...sections, cleanNext];
}

function resultWithMnemonic(result: HostTranslateResult, mnemonic: string): HostTranslateResult {
  const cleanMnemonic = cleanText(mnemonic, 500);
  const sections = upsertTranslationSection(result.translationSections || [], {
    key: 'mnemonic',
    label: 'Mnemonic',
    value: cleanMnemonic,
  }, 'naturalPatterns');
  return {
    ...result,
    mnemonic: cleanMnemonic,
    translationSections: sections,
  };
}

function imageCaption(candidate: ImageCandidate): string {
  return [
    cleanText(candidate.title, 180),
    [cleanText(candidate.source, 80), cleanText(candidate.license, 80)].filter(Boolean).join(' / '),
    cleanText(candidate.creator, 120),
  ].filter(Boolean).join('\n');
}

function TranslatePopup() {
  const plugin = usePlugin();
  primeHostKey(plugin);
  const [state, setState] = useState<LoadState>('loading');
  const [contextData, setContextData] = useState<TranslationContextData>({});
  const [result, setResult] = useState<HostTranslateResult | null>(null);
  const [error, setError] = useState<TranslateErrorDetails | null>(null);
  const [copied, setCopied] = useState(false);
  const [debugCopied, setDebugCopied] = useState(false);
  const [mnemonicBusy, setMnemonicBusy] = useState<'default' | 'gpt56sol' | null>(null);
  const [mnemonicCandidates, setMnemonicCandidates] = useState<string[]>([]);
  const [mnemonicStatus, setMnemonicStatus] = useState('');
  const [solPrefetchStatus, setSolPrefetchStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const solPrefetchRef = useRef<{
    key: string;
    promise: Promise<MnemonicCandidateResponse> | null;
    response: MnemonicCandidateResponse | null;
  }>({ key: '', promise: null, response: null });
  const [imageBusy, setImageBusy] = useState(false);
  const [imageCandidates, setImageCandidates] = useState<ImageCandidate[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageCandidate | null>(null);
  const [featuredImage, setFeaturedImage] = useState<ImageCandidate | null>(null);
  const [imageStatus, setImageStatus] = useState('');
  const imagePrefetchRef = useRef<{
    key: string;
    promise: Promise<ImageCandidateResponse> | null;
    response: ImageCandidateResponse | null;
  }>({ key: '', promise: null, response: null });
  const [progressStatus, setProgressStatus] = useState('');
  const [activeTab, setActiveTab] = useState<'card' | 'chat'>('card');
  const [chatMessages, setChatMessages] = useState<TopicChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedText = useMemo(
    () => cleanText(result?.selectedText || contextData.selectedText, 1000),
    [contextData.selectedText, result?.selectedText]
  );
  const translatedTarget = useMemo(
    () => cleanText(result?.targetText || selectedText, 1000),
    [result?.targetText, selectedText]
  );
  const targetWasExpanded = Boolean(
    selectedText &&
    translatedTarget &&
    selectedText.toLocaleLowerCase('en-US') !== translatedTarget.toLocaleLowerCase('en-US')
  );
  const contextText = useMemo(
    () => cleanText(result?.contextText || contextData.contextText || contextData.focusedEditorText, 3000),
    [contextData.contextText, contextData.focusedEditorText, result?.contextText]
  );
  const translation = cleanText(result?.translation, 1200);
  const translationSections = useMemo(
    () => (result?.translationSections || [])
      .map((section) => ({
        key: cleanText(section.key, 80),
        label: cleanText(section.label, 80),
        value: cleanText(section.value, 1200),
        highlightText: cleanText(section.highlightText, 160),
      }))
      .filter((section) => section.key && section.label && section.value),
    [result?.translationSections]
  );
  const copyText = formatTranslationForCopy(translation, translationSections);

  const prefetchSolMnemonicCandidates = (): Promise<MnemonicCandidateResponse> => {
    const key = createSolMnemonicPrefetchKey(selectedText, contextText, result);
    if (!key) return Promise.resolve({ candidates: [] });
    const current = solPrefetchRef.current;
    if (current.key === key && current.response) return Promise.resolve(current.response);
    if (current.key === key && current.promise) return current.promise;

    setSolPrefetchStatus('loading');
    const promise = requestHostAction<MnemonicCandidateResponse>('host_translate_mnemonic_candidates', {
      selectedText,
      contextText,
      result,
      source: 'gpt56sol',
      modelTier: 'gpt56_sol_medium',
      limit: 3,
    });
    solPrefetchRef.current = { key, promise, response: null };
    promise
      .then((response) => {
        if (solPrefetchRef.current.key !== key) return;
        solPrefetchRef.current = { key, promise: null, response };
        setSolPrefetchStatus((response.candidates || []).length ? 'ready' : 'error');
      })
      .catch(() => {
        if (solPrefetchRef.current.key !== key) return;
        solPrefetchRef.current = { key, promise: null, response: null };
        setSolPrefetchStatus('error');
      });
    return promise;
  };

  const prefetchImageCandidates = (): Promise<ImageCandidateResponse> => {
    const key = createImagePrefetchKey(selectedText, contextText, result);
    if (!key) return Promise.resolve({ candidates: [] });
    const current = imagePrefetchRef.current;
    if (current.key === key && current.response) return Promise.resolve(current.response);
    if (current.key === key && current.promise) return current.promise;

    setFeaturedImage(null);
    const promise = requestHostAction<ImageCandidateResponse>('host_translate_image_candidates', {
      selectedText,
      contextText,
      result,
      limit: 3,
    });
    imagePrefetchRef.current = { key, promise, response: null };
    promise
      .then((response) => {
        if (imagePrefetchRef.current.key !== key) return;
        imagePrefetchRef.current = { key, promise: null, response };
        const featured = response.featuredCandidate || response.candidates?.[0] || null;
        setFeaturedImage(featured);
      })
      .catch(() => {
        if (imagePrefetchRef.current.key !== key) return;
        imagePrefetchRef.current = { key, promise: null, response: null };
      });
    return promise;
  };

  const requestMnemonicCandidates = async (source: 'default' | 'gpt56sol') => {
    if (!result || mnemonicBusy) return;
    if (source === 'default') {
      void prefetchSolMnemonicCandidates().catch(() => {});
    }
    setMnemonicBusy(source);
    setMnemonicCandidates([]);
    setMnemonicStatus(source === 'gpt56sol' ? '5.6 Sol Medium dusunuyor...' : 'Mnemonic adaylari uretiliyor...');
    try {
      const response = source === 'gpt56sol'
        ? await prefetchSolMnemonicCandidates()
        : await requestHostAction<MnemonicCandidateResponse>('host_translate_mnemonic_candidates', {
          selectedText,
          contextText,
          result,
          source: 'default',
          modelTier: 'default',
          limit: 3,
        });
      const candidates = (response.candidates || []).map((candidate) => cleanText(candidate, 500)).filter(Boolean);
      setMnemonicCandidates(candidates);
      setMnemonicStatus(candidates.length
        ? `${candidates.length} aday hazir${response.cached ? ' (onbellekten)' : ''}. Birini sec.`
        : 'Mnemonic adayi bulunamadi.');
    } catch (err) {
      setMnemonicStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setMnemonicBusy(null);
    }
  };

  const requestImageCandidates = async () => {
    if (!result || imageBusy) return;
    setImageBusy(true);
    setImageCandidates([]);
    setImageStatus('Gorsel adaylari araniyor...');
    try {
      const response = await prefetchImageCandidates();
      const candidates = (response.candidates || []).filter((candidate) => cleanText(candidate.imageUrl, 1000));
      setImageCandidates(candidates);
      setImageStatus(candidates.length
        ? `${candidates.length} gorsel hazir. Birini sec.`
        : 'Uygun gorsel bulunamadi.');
    } catch (err) {
      setImageStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setImageBusy(false);
    }
  };

  const selectMnemonicCandidate = (candidate: string) => {
    if (!result) return;
    setResult(resultWithMnemonic(result, candidate));
    setMnemonicCandidates([]);
    setMnemonicStatus('Secilen mnemonic karta yazildi.');
  };

  const selectImageCandidate = (candidate: ImageCandidate) => {
    setSelectedImage(candidate);
    setFeaturedImage(candidate);
    setImageCandidates([]);
    setImageStatus('Gorsel secildi; kopyada ve RemNote/CDP aktariminda kullanilabilir.');
  };

  const clearMnemonicCandidates = () => {
    setMnemonicCandidates([]);
    setMnemonicStatus('');
  };

  const clearImageCandidates = () => {
    setImageCandidates([]);
    setImageStatus('');
  };

  const sendTopicChat = async (suggestedQuestion?: string) => {
    const question = cleanText(suggestedQuestion || chatInput, 1200);
    if (!question || !result || chatBusy) return;
    const history = chatMessages.slice(-6).map(({ role, content }) => ({ role, content }));
    const messageId = `${createClientTraceId()}_answer`;
    const payload = {
      selectedText,
      contextText,
      result,
      question,
      messages: history,
      source: 'remnote_translate_popup_chat',
    };
    setChatMessages((current) => [...current, { id: `${messageId}_user`, role: 'user', content: question }]);
    setChatInput('');
    setChatError('');
    setChatBusy(true);
    let qualityFinished = false;
    let quickShown = false;
    const quickTask = requestHostAction<TopicChatResponse>('host_translate_topic_chat_quick', {
      ...payload,
      traceId: `${messageId}_quick`,
    }).then((response) => {
      const answer = cleanText(response.answer, 4000);
      if (!answer || qualityFinished) return response;
      quickShown = true;
      const meta = [response.model, response.durationMs ? `${(response.durationMs / 1000).toFixed(1)} sn` : '', 'kalite tamamlanıyor']
        .filter(Boolean)
        .join(' | ');
      setChatMessages((current) => [...current, {
        id: messageId,
        role: 'assistant',
        content: answer,
        meta,
        qualityPending: true,
      }]);
      return response;
    }).catch(() => null);

    await quickTask;
    try {
      const response = await requestHostAction<TopicChatResponse>('host_translate_topic_chat', {
        ...payload,
        traceId: `${messageId}_quality`,
      });
      qualityFinished = true;
      const answer = cleanText(response.answer, 4000);
      if (!answer) throw new Error('AI boş cevap verdi.');
      const meta = [response.model, response.durationMs ? `${(response.durationMs / 1000).toFixed(1)} sn` : '', 'kaliteli yanıt']
        .filter(Boolean)
        .join(' | ');
      setChatMessages((current) => {
        const index = current.findIndex((message) => message.id === messageId);
        const qualityMessage: TopicChatMessage = { id: messageId, role: 'assistant', content: answer, meta };
        if (index < 0) return [...current, qualityMessage];
        const next = [...current];
        next[index] = qualityMessage;
        return next;
      });
    } catch (err) {
      qualityFinished = true;
      const quickResponse = await quickTask;
      const quickAnswer = cleanText(quickResponse?.answer, 4000);
      if (quickAnswer) {
        const meta = [quickResponse?.model, quickResponse?.durationMs ? `${(quickResponse.durationMs / 1000).toFixed(1)} sn` : '', 'hızlı yanıt']
          .filter(Boolean)
          .join(' | ');
        setChatMessages((current) => {
          const index = current.findIndex((message) => message.id === messageId);
          const fallbackMessage: TopicChatMessage = { id: messageId, role: 'assistant', content: quickAnswer, meta };
          if (index < 0) return [...current, fallbackMessage];
          const next = [...current];
          next[index] = fallbackMessage;
          return next;
        });
        if (!quickShown) setChatError('Kaliteli yanıt tamamlanamadı; hızlı yanıt gösterildi.');
      } else {
        setChatError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setChatBusy(false);
      window.setTimeout(() => chatInputRef.current?.focus(), 0);
    }
  };

  const handleChatKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    const isUnmodifiedSpace = (event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space')
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey;
    if (isUnmodifiedSpace) {
      event.preventDefault();
      const textarea = event.currentTarget;
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? start;
      textarea.setRangeText(' ', start, end, 'end');
      setChatInput(textarea.value);
      return;
    }
    if (
      (event.key === 'Backspace' || event.key === 'Delete')
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
    ) {
      event.preventDefault();
      const textarea = event.currentTarget;
      deleteTextareaText(textarea, event.key);
      setChatInput(textarea.value);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendTopicChat();
    }
  };

  useEffect(() => {
    if (activeTab === 'chat') {
      window.setTimeout(() => chatInputRef.current?.focus(), 0);
    }
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const widgetContext = await plugin.widget.getWidgetContext<WidgetLocation.Popup>();
        const data = (widgetContext.contextData || {}) as TranslationContextData;
        const nextSelected = cleanText(data.selectedText, 1000);
        const nextContext = cleanText(data.contextText || data.focusedEditorText, 3000);
        const traceId = data.traceId || createClientTraceId();
        const source = data.source || 'remnote_translate_popup';
        if (cancelled) return;
        setContextData(data);

        try {
          const core = await requestTranslation(
            nextSelected,
            nextContext,
            `${traceId}_core`,
            `${source}_core`,
            'core'
          );
          if (cancelled) return;
          setResult(core);
          setProgressStatus('Kaliteli ceviri hazir. Aciklama, kaliplar ve etimoloji tamamlaniyor...');
          setState('ready');
          try {
            const detailed = await requestTranslation(
              nextSelected,
              nextContext,
              `${traceId}_details`,
              `${source}_details`,
              'details',
              core
            );
            if (cancelled) return;
            setResult(detailed);
            setProgressStatus('');
          } catch (detailError) {
            if (cancelled) return;
            setResult({ ...core, partial: true, detailStatus: 'details_error' });
            setProgressStatus('Kaliteli ceviri hazir. Ayrintilar su anda alinamadi.');
          }
        } catch (coreError) {
          const fallback = await requestTranslation(
            nextSelected,
            nextContext,
            `${traceId}_core_fallback`,
            `${source}_core_fallback`,
            'full'
          );
          if (cancelled) return;
          setResult(fallback);
          setProgressStatus('');
          setState('ready');
        }
      } catch (err) {
        if (cancelled) return;
        setState('error');
        setError(getErrorDetails(err));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [plugin]);

  useEffect(() => {
    if (!result || result.mnemonic) return;
    void prefetchSolMnemonicCandidates().catch(() => {});
  }, [selectedText, contextText, result]);

  useEffect(() => {
    if (!result) return;
    void prefetchImageCandidates().catch(() => {});
  }, [selectedText, contextText, result]);

  const copyTranslation = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const copyDebugDetails = async () => {
    if (!error) return;
    const details = [
      `message=${error.message}`,
      error.traceId ? `traceId=${error.traceId}` : '',
      error.errorClass ? `errorClass=${error.errorClass}` : '',
      error.stage ? `stage=${error.stage}` : '',
      error.advice ? `advice=${error.advice}` : '',
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(details);
      setDebugCopied(true);
      window.setTimeout(() => setDebugCopied(false), 1200);
    } catch {
      setDebugCopied(false);
    }
  };

  const visibleTranslationSections = featuredImage
    ? translationSections.filter((section) => !['directTranslation', 'contextualMeaning'].includes(section.key))
    : translationSections;

  return (
    <div className="mcp-translate-popup" role="dialog" aria-label="Translation popup">
      <div className="mcp-translate-popup__header">
        <div className="mcp-translate-popup__title">Ceviri</div>
        <button
          className="mcp-translate-popup__icon-button"
          type="button"
          aria-label="Close"
          onClick={() => plugin.widget.closePopup(true)}
        >
          x
        </button>
      </div>

      {selectedText && translatedTarget ? (
        <div className="mcp-translate-popup__target" aria-label={`Çevrilen ifade: ${translatedTarget}`}>
          <span className="mcp-translate-popup__target-icon" aria-hidden="true">
            {targetWasExpanded ? '↗' : '•'}
          </span>
          <span className="mcp-translate-popup__target-copy">
            <span className="mcp-translate-popup__target-label">
              {result?.targetText ? 'ÇEVRİLEN İFADE' : 'TIKLANAN İFADE'}
            </span>
            <span className="mcp-translate-popup__target-value">{translatedTarget}</span>
          </span>
          {targetWasExpanded ? (
            <span className="mcp-translate-popup__target-meta">
              Tıklanan: {selectedText} · Otomatik kalıp
            </span>
          ) : null}
        </div>
      ) : null}

      {state === 'loading' ? (
        <div className="mcp-translate-popup__loading" aria-busy="true">
          Cevriliyor...
        </div>
      ) : null}

      {state === 'ready' ? (
        <>
          <div className="mcp-translate-popup__tabs" role="tablist" aria-label="Çeviri görünümü">
            <button
              className={`mcp-translate-popup__tab${activeTab === 'card' ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'card'}
              onClick={() => setActiveTab('card')}
            >
              <span className="mcp-translate-popup__tab-icon" aria-hidden="true">▤</span>
              Kart
            </button>
            <button
              className={`mcp-translate-popup__tab${activeTab === 'chat' ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'chat'}
              onClick={() => setActiveTab('chat')}
            >
              <span className="mcp-translate-popup__tab-icon" aria-hidden="true">···</span>
              Sohbet
            </button>
          </div>

          {activeTab === 'card' ? (
          <>
          {progressStatus ? (
            <div className="mcp-translate-popup__status">{progressStatus}</div>
          ) : null}
          {result?.partial !== true ? (
          <div className="mcp-translate-popup__tool-row">
            <button
              className="mcp-translate-popup__button"
              type="button"
              disabled={Boolean(mnemonicBusy)}
              onClick={() => requestMnemonicCandidates('default')}
            >
              {mnemonicBusy === 'default' ? 'Adaylar...' : 'Mnemonic'}
            </button>
            <button
              className="mcp-translate-popup__button"
              type="button"
              disabled={imageBusy}
              onClick={requestImageCandidates}
            >
              {imageBusy ? 'Gorsel...' : 'Gorsel'}
            </button>
            <button
              className="mcp-translate-popup__button"
              type="button"
              disabled={Boolean(mnemonicBusy)}
              onClick={() => requestMnemonicCandidates('gpt56sol')}
            >
              {mnemonicBusy === 'gpt56sol'
                ? 'Sol...'
                : solPrefetchStatus === 'ready'
                  ? '5.6 Sol Hazir'
                  : solPrefetchStatus === 'loading'
                    ? '5.6 Hazirlaniyor'
                    : '5.6 Sol Medium'}
            </button>
          </div>
          ) : null}

          {mnemonicStatus ? (
            <div className="mcp-translate-popup__status">{mnemonicStatus}</div>
          ) : null}
          {mnemonicCandidates.length ? (
            <div className="mcp-translate-popup__candidate-panel" aria-label="Mnemonic candidates">
              <div className="mcp-translate-popup__candidate-panel-header">
                <span>Adaylar</span>
                <button
                  className="mcp-translate-popup__candidate-dismiss"
                  type="button"
                  aria-label="Aday listesini kapat"
                  onClick={clearMnemonicCandidates}
                >
                  ×
                </button>
              </div>
              {mnemonicCandidates.map((candidate, index) => (
                <button
                  className="mcp-translate-popup__candidate"
                  type="button"
                  key={`${candidate}-${index}`}
                  onClick={() => selectMnemonicCandidate(candidate)}
                >
                  {index + 1}. {candidate}
                </button>
              ))}
            </div>
          ) : null}

          {imageStatus ? (
            <div className="mcp-translate-popup__status">{imageStatus}</div>
          ) : null}
          {imageCandidates.length ? (
            <div className="mcp-translate-popup__image-panel" aria-label="Image candidates">
              <div className="mcp-translate-popup__candidate-panel-header">
                <span>Adaylar</span>
                <button
                  className="mcp-translate-popup__candidate-dismiss"
                  type="button"
                  aria-label="Aday listesini kapat"
                  onClick={clearImageCandidates}
                >
                  ×
                </button>
              </div>
              {imageCandidates.map((candidate, index) => (
                <button
                  className="mcp-translate-popup__image-candidate"
                  type="button"
                  key={`${candidate.imageUrl}-${index}`}
                  onClick={() => selectImageCandidate(candidate)}
                >
                  <img
                    src={candidate.thumbUrl || candidate.imageUrl}
                    alt={candidate.title || `Visual ${index + 1}`}
                    style={{ objectFit: candidate.displayMode || 'contain' }}
                  />
                  <span>{index + 1}. {imageCaption(candidate)}</span>
                </button>
              ))}
            </div>
          ) : null}

          {featuredImage ? (
            <div className="mcp-translate-popup__featured-stage">
              <div className="mcp-translate-popup__featured-summary">
                <span>KISA ANLAM</span>
                <strong>{cleanText(result?.directTranslation || translation, 500)}</strong>
                {result?.contextualMeaning ? <p>{cleanText(result.contextualMeaning, 700)}</p> : null}
              </div>
              <figure
                className={`mcp-translate-popup__featured-image${featuredImage.displayMode === 'contain' ? ' is-contain' : ''}`}
                aria-label={selectedImage ? 'Secilen gorsel' : 'Onerilen gorsel'}
              >
                <img
                  src={featuredImage.thumbUrl || featuredImage.imageUrl}
                  alt={featuredImage.title || 'Onerilen gorsel'}
                  style={{ objectFit: featuredImage.displayMode || 'contain' }}
                />
                <figcaption>
                  <span>{selectedImage ? 'Secilen' : 'Onerilen'}</span>
                  {featuredImage.title || 'Gorsel'}
                </figcaption>
              </figure>
            </div>
          ) : null}

          {visibleTranslationSections.length ? (
            <div className="mcp-translate-popup__sections">
              {visibleTranslationSections.map((section) => (
                <div className="mcp-translate-popup__section" key={section.key}>
                  <div className="mcp-translate-popup__section-label">
                    <span className="mcp-translate-popup__section-icon" aria-hidden="true">
                      {sectionIcon(section)}
                    </span>
                    <span>{section.label}</span>
                  </div>
                  <div className="mcp-translate-popup__section-value">
                    {isPatternSection(section)
                      ? renderPatternSection(section.value)
                      : renderHighlightedText(section.value, section.highlightText)}
                  </div>
                </div>
              ))}
            </div>
          ) : !translationSections.length ? (
            <div className="mcp-translate-popup__translation">{translation}</div>
          ) : null}
          <div className="mcp-translate-popup__debug-line">
            Mode: {result?.selectionMode || 'n/a'}
            {' | '}
            Trace: {result?.traceId || 'n/a'}
            {result?.durationMs ? ` | ${result.durationMs} ms` : ''}
          </div>
          <div className="mcp-translate-popup__actions">
            <button className="mcp-translate-popup__button" type="button" onClick={copyTranslation}>
              {copied ? 'Kopyalandi' : 'Kopyala'}
            </button>
          </div>
          </>
          ) : (
            <div className="mcp-translate-popup__chat-panel" role="tabpanel" aria-label="Konu sohbeti">
              <div className="mcp-translate-popup__chat-heading">
                <div>
                  <strong>Konuya sor</strong>
                  <span>Seçili ifade ve cümle bağlamı otomatik eklendi.</span>
                </div>
                {chatMessages.length ? (
                  <button
                    className="mcp-translate-popup__chat-clear"
                    type="button"
                    onClick={() => { setChatMessages([]); setChatError(''); }}
                  >
                    Temizle
                  </button>
                ) : null}
              </div>

              {!chatMessages.length ? (
                <div className="mcp-translate-popup__chat-suggestions" aria-label="Hazır sorular">
                  {[
                    'Bu kullanım neden böyle?',
                    'Benzer kelimelerden farkı ne?',
                    'Üç doğal örnek verir misin?',
                  ].map((question) => (
                    <button type="button" key={question} onClick={() => void sendTopicChat(question)}>
                      {question}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mcp-translate-popup__chat-messages" aria-live="polite">
                {chatMessages.map((message, index) => (
                  <div className={`mcp-translate-popup__chat-message is-${message.role}`} key={message.id || `${message.role}-${index}`}>
                    <div className="mcp-translate-popup__chat-role">
                      {message.role === 'user' ? 'Sen' : 'Hızlı AI'}
                    </div>
                    {message.role === 'assistant' ? renderChatAnswer(message.content) : <div>{message.content}</div>}
                    {message.meta ? <div className="mcp-translate-popup__chat-meta">{message.meta}</div> : null}
                  </div>
                ))}
                {chatBusy ? (
                  <div className="mcp-translate-popup__chat-thinking" aria-busy="true">
                    <span aria-hidden="true" />
                    {chatMessages.some((message) => message.qualityPending)
                      ? 'Hızlı yanıt hazır; kalite tamamlanıyor...'
                      : 'Yanıt hazırlanıyor...'}
                  </div>
                ) : null}
              </div>

              {chatError ? <div className="mcp-translate-popup__chat-error">{chatError}</div> : null}

              <div className="mcp-translate-popup__chat-composer">
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  rows={2}
                  maxLength={1200}
                  placeholder="Bu ifade hakkında bir şey sor..."
                  aria-label="Konu hakkında soru"
                  disabled={chatBusy}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={handleChatKeyDown}
                />
                <button
                  type="button"
                  aria-label="Soruyu gönder"
                  title="Gönder"
                  disabled={chatBusy || !chatInput.trim()}
                  onClick={() => void sendTopicChat()}
                >
                  ↑
                </button>
              </div>
              <div className="mcp-translate-popup__chat-hint">Enter gönderir · Shift+Enter yeni satır</div>
            </div>
          )}
        </>
      ) : null}

      {state === 'error' ? (
        <div className="mcp-translate-popup__error">
          <div>{error?.advice || error?.message || 'Ceviri alinamadi.'}</div>
          <div className="mcp-translate-popup__debug-line">
            Trace: {error?.traceId || 'n/a'}
            {error?.stage ? ` | Asama: ${error.stage}` : ''}
            {error?.errorClass ? ` | Hata: ${error.errorClass}` : ''}
          </div>
          <div className="mcp-translate-popup__actions">
            <button className="mcp-translate-popup__button" type="button" onClick={copyDebugDetails}>
              {debugCopied ? 'Kopyalandi' : 'Debug kopyala'}
            </button>
          </div>
        </div>
      ) : null}

      {contextText && state !== 'loading' && activeTab === 'card' ? (
        <div className="mcp-translate-popup__context">{contextText}</div>
      ) : null}
    </div>
  );
}

renderWidget(TranslatePopup);
