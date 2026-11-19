// Öğren ekranı: ders motoru (Memrise benzeri "önce öğren, sonra test et").
// Kelimeler araya karışmaz: kelime1 tanıtım → 3 soru, kelime2 tanıtım → 3 soru ...
// Yanlış yapılan soru ders sonunda bir kez daha sorulur. Motor hiçbir şey YAZMAZ;
// RemNote'a yazma yalnız saveGrades ile, ders bitmiş ve kayıtlı kipteyse olur.
// SDK'yı çalışma anında içe aktarmaz; puanlar QueueInteractionScore ile aynı sayılardır
// (@remnote/plugin-sdk interfaces.d.ts: HARD = 0.5, GOOD = 1, EASY = 1.5).

import type { WordCard } from './parse';

export const SCORE = { EASY: 1.5, GOOD: 1, HARD: 0.5 } as const;
export type GradeLabel = keyof typeof SCORE;

export type StepKind = 'tanit' | 'sec' | 'bosluk' | 'yaz';
export interface Step {
  kind: StepKind;
  word: WordCard;
  wordIdx: number;
  correct: string;
  options?: string[];
  blank?: { text: string; hint: string; source: 'dizi' | 'ornek' };
  retry?: boolean;
}

export interface Grade {
  remId: string;
  word: string;
  score: number;
  label: GradeLabel;
  reason: string;
}

const normKey = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');
const apos = (s: string) => s.replace(/[’‘`´]/g, "'");

export function typedMatches(typed: string, answer: string): boolean {
  return apos(typed).trim().toLowerCase() === apos(answer).trim().toLowerCase();
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 4 şık: doğru cevap tam bir kez + tekrarsız yanlışlar (büyük/küçük harf ve boşluk
 * farkı "aynı" sayılır; doğruya eşit olan elenir). Yeterli yanlış yoksa olan kadar;
 * hiç yanlış yoksa null (soru sorulmaz).
 */
export function buildChoices(correct: string, pool: string[], rng: () => number, n = 4): string[] | null {
  const seen = new Set<string>([normKey(correct)]);
  const wrong: string[] = [];
  for (const p of shuffle(pool, rng)) {
    const k = normKey(p || '');
    if (!k || seen.has(k)) continue;
    seen.add(k);
    wrong.push(p.trim());
  }
  if (!wrong.length) return null;
  return shuffle([correct, ...wrong.slice(0, n - 1)], rng);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function blankIn(sentence: string, target: string): string | null {
  if (!sentence || !target) return null;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(apos(target))})(?![\\p{L}\\p{N}])`, 'iu');
  const s = apos(sentence);
  const m = s.match(re);
  if (!m || m.index === undefined) return null;
  const start = m.index + m[1].length;
  return s.slice(0, start) + '______' + s.slice(start + m[2].length);
}

/** Boşluk doldurma cümlesi: dizi cümlesi kelimeyi içeriyorsa o, değilse örnek cümle; yoksa null. */
export function blankFor(w: Pick<WordCard, 'word' | 'sentence' | 'sentenceTarget' | 'example'>):
  { text: string; hint: string; source: 'dizi' | 'ornek'; answer: string } | null {
  for (const t of [w.sentenceTarget, w.word]) {
    const b = blankIn(w.sentence, t);
    if (b) return { text: b, hint: '', source: 'dizi', answer: w.word };
  }
  const [en, ...tr] = (w.example || '').split(' = ');
  const b = blankIn(en || '', w.word);
  if (b) return { text: b, hint: tr.join(' = ').trim(), source: 'ornek', answer: w.word };
  return null;
}

/** Belge sırasıyla hiç çalışılmamış ilk `size` kelime. */
export function pickLesson<T extends WordCard>(deck: T[], isStudied: (c: T) => boolean, size = 5): T[] {
  return deck.filter((c) => !isStudied(c)).slice(0, size);
}

export type SessionMode = 'kayit' | 'pratik';

interface WordState { known: boolean; wrong: number }

export class Session {
  steps: Step[] = [];
  idx = 0;
  readonly words: WordCard[];
  readonly mode: SessionMode;
  private state: WordState[];
  private rng: () => number;
  /** Bu adım cevaplandı mı (görünüm geri bildirimi için). */
  answered: { ok: boolean; given: string } | null = null;

  constructor(words: WordCard[], deck: WordCard[], rng: () => number = Math.random, mode: SessionMode = 'kayit') {
    this.words = words;
    this.mode = mode;
    this.rng = rng;
    this.state = words.map(() => ({ known: false, wrong: 0 }));
    const meanings = deck.map((c) => c.meaning);
    const wordsPool = deck.map((c) => c.word);
    words.forEach((w, wordIdx) => {
      this.steps.push({ kind: 'tanit', word: w, wordIdx, correct: w.word });
      const sec = buildChoices(w.meaning, meanings.filter((m) => normKey(m) !== normKey(w.meaning)), rng);
      if (sec) this.steps.push({ kind: 'sec', word: w, wordIdx, correct: w.meaning, options: sec });
      const bl = blankFor(w);
      if (bl) {
        const opts = buildChoices(w.word, wordsPool.filter((x) => normKey(x) !== normKey(w.word)), rng);
        if (opts) this.steps.push({ kind: 'bosluk', word: w, wordIdx, correct: w.word, options: opts, blank: { text: bl.text, hint: bl.hint, source: bl.source } });
      }
      this.steps.push({ kind: 'yaz', word: w, wordIdx, correct: w.word });
    });
  }

  get done(): boolean { return this.idx >= this.steps.length; }
  get current(): Step { return this.steps[this.idx]; }

  /** Soru cevabı. Yanlışsa (ilk sorulduğunda) aynı soru ders sonuna bir kez eklenir. */
  answer(given: string): boolean {
    const st = this.current;
    if (!st || st.kind === 'tanit' || this.answered) return false;
    const ok = st.kind === 'yaz' ? typedMatches(given, st.correct) : given === st.correct;
    this.answered = { ok, given };
    if (!ok && !st.retry) {
      this.state[st.wordIdx].wrong += 1;
      const again: Step = { ...st, retry: true };
      if (again.options) again.options = shuffle(again.options, this.rng);
      this.steps.push(again);
    }
    return ok;
  }

  next(): void {
    if (this.done) return;
    const st = this.current;
    if (st.kind !== 'tanit' && !this.answered) return; // cevapsız soru geçilmez
    this.answered = null;
    this.idx += 1;
  }

  /** "Zaten biliyorum": kelimenin kalan soruları atlanır, sıradaki kelimeye geçilir. */
  knowIt(): void {
    const st = this.current;
    if (!st || st.kind !== 'tanit') return;
    this.state[st.wordIdx].known = true;
    this.steps = this.steps.filter((s, i) => i <= this.idx || s.wordIdx !== st.wordIdx);
    this.answered = null;
    this.idx += 1;
  }

  /** Kelime başına not (görünüm özeti için; ders bitmeden de hesaplanabilir). */
  grades(): Grade[] {
    return this.words.map((w, i) => {
      const s = this.state[i];
      const label: GradeLabel = s.known ? 'EASY' : s.wrong === 0 ? 'GOOD' : 'HARD';
      const reason = s.known ? 'zaten biliyorum dediniz' : s.wrong === 0 ? 'bütün sorular ilk denemede doğru' : `${s.wrong} yanlış; yakında tekrar gelir`;
      return { remId: w.remId, word: w.word, score: SCORE[label], label, reason };
    });
  }

  /** Yalnız ders bitmişse ve kayıtlı kipteyse yazılacak notlar; aksi halde null. */
  savePlan(): Grade[] | null {
    if (!this.done || this.mode !== 'kayit') return null;
    return this.grades();
  }
}

export interface SaveCard {
  id: string;
  history: unknown[] | undefined;
  update(score: number): Promise<void>;
}
export interface SaveApi {
  /** Kartı RemNote'tan YENİDEN okur (eski anlık görüntü kullanılmaz). Forward kart yoksa null. */
  forwardCard(remId: string): Promise<SaveCard | null>;
}
export interface SaveResult { saved: string[]; skipped: string[]; failed: Array<{ word: string; error: string }> }

/** Notları sırayla yazar. Geçmişi dolmuş kart atlanır (çift yazma yok). */
export async function saveGrades(api: SaveApi, plan: Grade[] | null): Promise<SaveResult> {
  const r: SaveResult = { saved: [], skipped: [], failed: [] };
  if (!plan) return r;
  for (const g of plan) {
    try {
      const card = await api.forwardCard(g.remId);
      if (!card) { r.failed.push({ word: g.word, error: 'forward kartı bulunamadı' }); continue; }
      if (card.history && card.history.length) { r.skipped.push(g.word); continue; }
      await card.update(g.score);
      r.saved.push(g.word);
    } catch (e) {
      r.failed.push({ word: g.word, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return r;
}

export type Progress = Record<string, { ders: number; son: number }>;
export function nextProgress(p: Progress, docId: string, now: number): Progress {
  const cur = p[docId];
  return { ...p, [docId]: { ders: (cur?.ders || 0) + 1, son: now } };
}
