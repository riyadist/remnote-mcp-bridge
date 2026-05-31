const DB_NAME = 'remnote-semantic-index';
const DB_VERSION = 4;
const STORE_VECTORS = 'rem_vectors';
const STORE_META = 'meta';

const MAX_INDEX_SIZE = 5000;
const INDEX_STALE_MS = 30 * 60 * 1000;

const STOP_WORDS = new Set([
    'bir', 'iki', 'bu', 'su', 'o', 've', 'ile', 'icin', 'de', 'da', 'ki', 'mi', 'ama',
    'fakat', 'ancak', 'gibi', 'kadar', 'daha', 'cok', 'az', 'en', 'hem', 'veya', 'degil',
    'olan', 'ise', 'olarak', 'olmak', 'var', 'yok', 'ben', 'sen', 'biz', 'siz', 'onlar',
    'ne', 'nasil', 'neden', 'niye', 'hangi', 'her', 'ayrica', 'boyle', 'soyle', 'sonuc',
    'the', 'a', 'an', 'and', 'or', 'but', 'so', 'for', 'with', 'not', 'in', 'on', 'at',
    'to', 'from', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'this', 'that', 'it',
    'you', 'we', 'they', 'what', 'which', 'who', 'how', 'when', 'where', 'all', 'any',
    'can', 'will', 'do', 'does', 'did', 'have', 'has', 'had', 'get', 'got', 'use',
    'used', 'make', 'made', 'very', 'more', 'most'
]);

const CONCEPT_ALIASES: Record<string, string[]> = {
    bilinc: ['consciousness', 'awareness'],
    bilinci: ['consciousness', 'awareness'],
    bilincli: ['conscious'],
    hafiza: ['memory', 'recall'],
    hafizasi: ['memory'],
    ogrenme: ['learning'],
    dikkat: ['attention'],
    algi: ['perception'],
    diyagram: ['diagram', 'figure', 'visual', 'schema', 'map'],
    diyagrami: ['diagram', 'figure', 'visual', 'schema', 'map'],
    sema: ['schema', 'diagram'],
    zeka: ['intelligence', 'cognition'],
    teori: ['theory', 'model'],
    kavram: ['concept'],
    tanim: ['definition', 'overview'],
    aciklama: ['definition', 'overview'],
    surec: ['process', 'workflow'],
    akis: ['flow', 'workflow'],
    sistem: ['system', 'architecture', 'workflow'],
    sistemi: ['system', 'architecture', 'workflow'],
    sistemler: ['systems', 'architectures'],
    agent: ['ajan'],
    agents: ['ajanlar'],
    ajan: ['agent'],
    ajanlar: ['agents'],
    consciousness: ['bilinc', 'awareness'],
    awareness: ['consciousness'],
    memory: ['hafiza', 'recall'],
    recall: ['memory'],
    attention: ['dikkat'],
    perception: ['algi'],
    diagram: ['diyagram', 'figure', 'visual', 'schema', 'map'],
    figure: ['diagram'],
    schema: ['diagram', 'sema'],
    map: ['diagram', 'harita'],
    theory: ['teori', 'model'],
    concept: ['kavram'],
    definition: ['tanim', 'aciklama'],
    overview: ['tanim', 'aciklama'],
    workflow: ['pipeline', 'process', 'flow'],
    pipeline: ['workflow', 'process'],
    process: ['workflow', 'pipeline'],
    flow: ['workflow', 'akis'],
    system: ['sistem', 'architecture'],
    systems: ['sistemler'],
    architecture: ['system', 'structure'],
    reportability: ['broadcast', 'consciousness'],
    broadcast: ['reportability', 'consciousness']
};

const DIAGRAM_HINTS = ['diagram', 'diyagram', 'figure', 'visual', 'schema', 'map'];
const WORKFLOW_HINTS = ['workflow', 'pipeline', 'process', 'system', 'architecture', 'akis', 'surec'];
const DEFINITION_HINTS = ['definition', 'overview', 'summary', 'tanim', 'aciklama', 'nedir'];

export type SemanticResultType = 'note' | 'index' | 'question_bank' | 'raw_capture' | 'reflection' | 'longform';

export interface IndexedRemVector {
    remId: string;
    title: string;
    preview: string;
    resultType?: SemanticResultType;
    vector: Record<string, number>;
    indexedAt: number;
}

export interface SemanticResult {
    remId: string;
    title: string;
    preview: string;
    semanticScore: number;
}

interface SemanticQueryProfile {
    normalizedQuery: string;
    families: string[][];
    wantsDiagram: boolean;
    wantsWorkflow: boolean;
    wantsDefinition: boolean;
    isShortConcept: boolean;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_VECTORS)) {
                db.createObjectStore(STORE_VECTORS, { keyPath: 'remId' });
            }
            if (!db.objectStoreNames.contains(STORE_META)) {
                db.createObjectStore(STORE_META);
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbPutAll(db: IDBDatabase, items: IndexedRemVector[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VECTORS, 'readwrite');
        const store = tx.objectStore(STORE_VECTORS);
        for (const item of items) {
            store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function dbGetAll(db: IDBDatabase): Promise<IndexedRemVector[]> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VECTORS, 'readonly');
        const store = tx.objectStore(STORE_VECTORS);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as IndexedRemVector[]);
        req.onerror = () => reject(req.error);
    });
}

async function dbGetMeta(db: IDBDatabase, key: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_META, 'readonly');
        const store = tx.objectStore(STORE_META);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbSetMeta(db: IDBDatabase, key: string, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_META, 'readwrite');
        const store = tx.objectStore(STORE_META);
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function dbClearVectors(db: IDBDatabase): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VECTORS, 'readwrite');
        tx.objectStore(STORE_VECTORS).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function normalizeSemanticText(text: string): string {
    return (text || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFC')
        .replace(/[\u00e7\u00c7]/g, 'c')
        .replace(/[\u011f\u011e]/g, 'g')
        .replace(/[\u0131\u0130]/g, 'i')
        .replace(/[\u00f6\u00d6]/g, 'o')
        .replace(/[\u015f\u015e]/g, 's')
        .replace(/[\u00fc\u00dc]/g, 'u')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function lightStem(word: string): string {
    const trSuffixes = [
        'lari', 'leri', 'lar', 'ler', 'lik', 'luk', 'nin', 'nun', 'in', 'un', 'den', 'dan',
        'ten', 'tan', 'da', 'de', 'ta', 'te', 'yor', 'mis', 'mus', 'acak', 'ecek', 'di', 'du'
    ];
    const enSuffixes = ['ing', 'tion', 'ness', 'ment', 'able', 'ible', 'ous', 'ive', 'ize', 'ise', 'ers', 'ies', 'ed', 'es', 's'];

    let current = word;
    for (const suffix of trSuffixes) {
        if (current.endsWith(suffix) && current.length - suffix.length >= 3) {
            current = current.slice(0, current.length - suffix.length);
            break;
        }
    }

    if (current.length > 6) {
        for (const suffix of enSuffixes) {
            if (current.endsWith(suffix) && current.length - suffix.length >= 4) {
                current = current.slice(0, current.length - suffix.length);
                break;
            }
        }
    }

    return current;
}

function tokenize(text: string): string[] {
    return normalizeSemanticText(text)
        .split(/\s+/)
        .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
        .map((word) => lightStem(word));
}

function uniqueTokens(tokens: string[]): string[] {
    return Array.from(new Set(tokens.filter(Boolean)));
}

function expandConceptAliases(tokens: string[]): string[] {
    const expanded = [...tokens];
    for (const token of tokens) {
        const aliases = CONCEPT_ALIASES[token];
        if (!aliases) continue;
        for (const alias of aliases) {
            expanded.push(...tokenize(alias));
        }
    }
    return uniqueTokens(expanded);
}

function buildBigrams(tokens: string[]): string[] {
    const bigrams: string[] = [];
    for (let i = 0; i < tokens.length - 1; i += 1) {
        const left = tokens[i];
        const right = tokens[i + 1];
        if (!left || !right) continue;
        bigrams.push(`${left}_${right}`);
    }
    return bigrams;
}

function buildTokenFamily(token: string): string[] {
    return uniqueTokens([token, ...expandConceptAliases([token])]);
}

function buildQueryProfile(query: string): SemanticQueryProfile {
    const queryTokens = uniqueTokens(tokenize(query));
    const allTokens = new Set([...queryTokens, ...expandConceptAliases(queryTokens)]);

    return {
        normalizedQuery: normalizeSemanticText(query),
        families: queryTokens.map((token) => buildTokenFamily(token)),
        wantsDiagram: DIAGRAM_HINTS.some((term) => allTokens.has(lightStem(normalizeSemanticText(term)))),
        wantsWorkflow: WORKFLOW_HINTS.some((term) => allTokens.has(lightStem(normalizeSemanticText(term)))),
        wantsDefinition: DEFINITION_HINTS.some((term) => allTokens.has(lightStem(normalizeSemanticText(term)))),
        isShortConcept: queryTokens.length > 0 && queryTokens.length <= 3,
    };
}

function buildDocumentTokenSet(title: string, preview: string): Set<string> {
    const tokens = uniqueTokens([
        ...tokenize(title),
        ...tokenize(preview),
    ]);

    return new Set([
        ...tokens,
        ...expandConceptAliases(tokens),
        ...buildBigrams(tokens)
    ]);
}

function titleWordCount(title: string): number {
    return normalizeSemanticText(title).split(/\s+/).filter(Boolean).length;
}

function containsSemanticHint(normalizedText: string, hints: string[]): boolean {
    return hints.some((hint) => normalizedText.includes(normalizeSemanticText(hint)));
}

function looksLikeUrlTitle(title: string): boolean {
    const raw = (title || '').trim().toLowerCase();
    return raw.startsWith('url:') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('www.');
}

function computeFamilyCoverage(families: string[][], tokenSet: Set<string>): number {
    if (families.length === 0) return 0;

    let matched = 0;
    for (const family of families) {
        if (family.some((token) => tokenSet.has(token))) {
            matched += 1;
        }
    }

    return matched / families.length;
}

function classifySemanticResultType(title: string, preview: string): SemanticResultType {
    const normalizedTitle = normalizeSemanticText(title);
    const normalizedPreview = normalizeSemanticText(preview);
    const rawTitle = (title || '').trim().toLowerCase();

    if (
        rawTitle.startsWith('-') ||
        rawTitle.includes('->') ||
        normalizedTitle.includes(' confidence ') ||
        normalizedTitle.includes(' duplicates ') ||
        normalizedTitle.includes(' neuroscience consciousness ') ||
        normalizedTitle.includes(' ai memory systems ')
    ) {
        return 'index';
    }

    if (
        normalizedTitle.includes('what is the most important idea') ||
        normalizedTitle.includes('how does this connect') ||
        normalizedPreview.includes('what is the most important idea')
    ) {
        return 'question_bank';
    }

    if (
        looksLikeUrlTitle(title) ||
        normalizedTitle.startsWith('clipboard') ||
        normalizedTitle.startsWith('desktop capture') ||
        normalizedTitle.startsWith('ocr') ||
        normalizedTitle.startsWith('chat attachment') ||
        normalizedTitle.startsWith('media')
    ) {
        return 'raw_capture';
    }

    if (
        normalizedTitle.includes('task reflection') ||
        normalizedTitle.includes('ps6 conversation note')
    ) {
        return 'reflection';
    }

    if (title.length > 140 || ((title.match(/\s+/g) || []).length >= 12)) {
        return 'longform';
    }

    return 'note';
}

function buildWeightedTokens(title: string, preview: string): string[] {
    const titleTokens = tokenize(title);
    const previewTokens = tokenize(preview);
    const weighted = [
        ...titleTokens, ...titleTokens, ...titleTokens,
        ...previewTokens, ...previewTokens
    ];
    const expanded = expandConceptAliases(weighted);
    return [...expanded, ...buildBigrams(expanded)];
}

function computeTF(tokens: string[]): Record<string, number> {
    const freq: Record<string, number> = {};
    for (const token of tokens) {
        freq[token] = (freq[token] || 0) + 1;
    }

    const total = tokens.length || 1;
    const tf: Record<string, number> = {};
    for (const [term, count] of Object.entries(freq)) {
        tf[term] = count / total;
    }
    return tf;
}

function computeTFIDF(tf: Record<string, number>, idf: Record<string, number>): Record<string, number> {
    const vector: Record<string, number> = {};
    for (const [term, tfValue] of Object.entries(tf)) {
        const idfValue = idf[term] ?? Math.log(1 / 0.01);
        vector[term] = tfValue * idfValue;
    }
    return vector;
}

function computeIDF(allTokenLists: string[][]): Record<string, number> {
    const docCount = allTokenLists.length;
    const docFreq: Record<string, number> = {};

    for (const tokens of allTokenLists) {
        const unique = new Set(tokens);
        for (const token of unique) {
            docFreq[token] = (docFreq[token] || 0) + 1;
        }
    }

    const idf: Record<string, number> = {};
    for (const [term, df] of Object.entries(docFreq)) {
        idf[term] = Math.log((docCount + 1) / (df + 1)) + 1;
    }
    return idf;
}

function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
    const keysA = Object.keys(a);
    if (keysA.length === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const key of keysA) {
        if (b[key]) {
            dot += a[key] * b[key];
        }
        normA += a[key] * a[key];
    }

    for (const value of Object.values(b)) {
        normB += value * value;
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function applyResultTypeAdjustment(score: number, resultType: SemanticResultType = 'note'): number {
    switch (resultType) {
        case 'index':
            return score - 0.12;
        case 'question_bank':
            return score - 0.10;
        case 'raw_capture':
            return score - 0.05;
        case 'longform':
            return score - 0.04;
        case 'note':
        default:
            return score + 0.02;
    }
}

export class SemanticEngine {
    private db: IDBDatabase | null = null;
    private idf: Record<string, number> = {};
    private indexedVectors: IndexedRemVector[] = [];
    private isIndexReady = false;
    private isIndexing = false;

    async init(): Promise<void> {
        try {
            this.db = await openDB();
            await this.loadIndexFromDB();
            console.log(`[SemanticEngine] Ready. ${this.indexedVectors.length} notes indexed.`);
        } catch (error) {
            console.error('[SemanticEngine] init failed:', error);
        }
    }

    async needsReindex(): Promise<boolean> {
        if (!this.db) return false;
        try {
            const lastIndex = await dbGetMeta(this.db, 'lastIndexedAt') as number;
            if (!lastIndex) return true;
            return Date.now() - lastIndex > INDEX_STALE_MS;
        } catch {
            return true;
        }
    }

    async buildIndexInBackground(
        getRems: () => Promise<Array<{ remId: string; title: string; preview: string }>>
    ): Promise<void> {
        if (this.isIndexing || !this.db) return;
        this.isIndexing = true;

        try {
            console.log('[SemanticEngine] Building semantic index...');
            const rems = await getRems();
            const limited = rems.slice(0, MAX_INDEX_SIZE);
            const tokenLists = limited.map((rem) => buildWeightedTokens(rem.title, rem.preview));

            this.idf = computeIDF(tokenLists);

            const vectors: IndexedRemVector[] = limited.map((rem, index) => {
                const tf = computeTF(tokenLists[index]);
                const vector = computeTFIDF(tf, this.idf);
                return {
                    remId: rem.remId,
                    title: rem.title,
                    preview: rem.preview,
                    resultType: classifySemanticResultType(rem.title, rem.preview),
                    vector,
                    indexedAt: Date.now(),
                };
            });

            await dbClearVectors(this.db);
            await dbPutAll(this.db, vectors);
            await dbSetMeta(this.db, 'lastIndexedAt', Date.now());
            await dbSetMeta(this.db, 'idf', this.idf);

            this.indexedVectors = vectors;
            this.isIndexReady = true;

            console.log(`[SemanticEngine] Index complete: ${vectors.length} notes.`);
        } catch (error) {
            console.error('[SemanticEngine] Build failed:', error);
        } finally {
            this.isIndexing = false;
        }
    }

    private async loadIndexFromDB(): Promise<void> {
        if (!this.db) return;
        try {
            this.indexedVectors = await dbGetAll(this.db);
            const storedIdf = await dbGetMeta(this.db, 'idf');
            if (storedIdf && typeof storedIdf === 'object') {
                this.idf = storedIdf as Record<string, number>;
            }
            this.isIndexReady = this.indexedVectors.length > 0;
        } catch (error) {
            console.error('[SemanticEngine] Load failed:', error);
        }
    }

    scoreText(
        query: string,
        title: string,
        preview: string,
        resultType: SemanticResultType = 'note',
        existingProfile?: SemanticQueryProfile,
        existingVector?: Record<string, number>
    ): number {
        const queryTokens = tokenize(query);
        if (queryTokens.length === 0) return 0;

        const queryProfile = existingProfile ?? buildQueryProfile(query);
        const expandedQueryTokens = [...expandConceptAliases(queryTokens), ...buildBigrams(queryTokens)];
        const queryVector = computeTFIDF(computeTF(expandedQueryTokens), this.idf);
        const documentVector = existingVector ?? computeTFIDF(computeTF(buildWeightedTokens(title, preview)), this.idf);

        let score = cosineSimilarity(queryVector, documentVector);
        score = applyResultTypeAdjustment(score, resultType);

        const normalizedTitle = normalizeSemanticText(title);
        const normalizedPreview = normalizeSemanticText(preview);
        const combinedCoverage = computeFamilyCoverage(queryProfile.families, buildDocumentTokenSet(title, preview));
        const titleCoverage = computeFamilyCoverage(queryProfile.families, buildDocumentTokenSet(title, ''));
        const wordsInTitle = titleWordCount(title);
        const hasDiagramInTitle = containsSemanticHint(normalizedTitle, DIAGRAM_HINTS);
        const hasDiagramInPreview = containsSemanticHint(normalizedPreview, DIAGRAM_HINTS);

        score += combinedCoverage * 0.24;
        score += titleCoverage * 0.16;

        if (queryProfile.normalizedQuery && normalizedTitle.includes(queryProfile.normalizedQuery)) {
            score += 0.22;
        } else if (queryProfile.normalizedQuery && normalizedPreview.includes(queryProfile.normalizedQuery)) {
            score += 0.12;
        }

        if (queryProfile.wantsDiagram) {
            if (hasDiagramInTitle) {
                score += titleCoverage >= 0.5 ? 0.28 : 0.2;
            } else if (hasDiagramInPreview) {
                score += 0.08;
            } else {
                score -= resultType === 'note' ? 0.18 : 0.28;
            }

            if (resultType === 'index') {
                score -= 0.14;
            }

            if (resultType === 'note' && wordsInTitle <= 3 && titleCoverage >= 0.5 && !hasDiagramInTitle && !hasDiagramInPreview) {
                score -= 0.14;
            }
        }

        if (queryProfile.wantsWorkflow) {
            if (containsSemanticHint(normalizedTitle, WORKFLOW_HINTS)) {
                score += 0.14;
            } else if (containsSemanticHint(normalizedPreview, WORKFLOW_HINTS)) {
                score += 0.06;
            }
        }

        if (queryProfile.wantsDefinition && resultType === 'note' && wordsInTitle <= 8) {
            score += 0.06;
        }

        if (queryProfile.isShortConcept && resultType === 'note' && wordsInTitle >= 1 && wordsInTitle <= 6 && titleCoverage >= 0.5) {
            score += 0.12;
        }

        if (resultType !== 'note' && titleCoverage < 0.5) {
            score -= 0.05;
        }

        if (looksLikeUrlTitle(title)) {
            score -= 0.2;
        }

        return score;
    }

    async search(query: string, limit = 20): Promise<SemanticResult[]> {
        if (!this.isIndexReady || this.indexedVectors.length === 0) {
            console.warn('[SemanticEngine] Search skipped, index is not ready.');
            return [];
        }

        try {
            const queryTokens = tokenize(query);
            if (queryTokens.length === 0) return [];
            const queryProfile = buildQueryProfile(query);

            return this.indexedVectors
                .map((rem) => ({
                    remId: rem.remId,
                    title: rem.title,
                    preview: rem.preview,
                    semanticScore: this.scoreText(query, rem.title, rem.preview, rem.resultType, queryProfile, rem.vector),
                }))
                .filter((item) => item.semanticScore > 0.06)
                .sort((a, b) => b.semanticScore - a.semanticScore)
                .slice(0, limit);
        } catch (error) {
            console.error('[SemanticEngine] Search failed:', error);
            return [];
        }
    }

    getStatus(): { isReady: boolean; isIndexing: boolean; count: number } {
        return {
            isReady: this.isIndexReady,
            isIndexing: this.isIndexing,
            count: this.indexedVectors.length,
        };
    }

    async clearIndex(): Promise<void> {
        if (!this.db) return;
        await dbClearVectors(this.db);
        this.indexedVectors = [];
        this.idf = {};
        this.isIndexReady = false;
        console.log('[SemanticEngine] Index cleared.');
    }
}

export const semanticEngine = new SemanticEngine();
