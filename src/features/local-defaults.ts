// Yalnız yerel (dev-2) derlemede gömülen kişisel ilk değerler.
// webpack.config.js bunu `__RN_LOCAL_DEFAULTS__` olarak tanımlar: public/manifest.json kimliği
// `...-dev-2` ise, REMNOTE_BUILD_TARGET=marketplace DEĞİLSE ve depo kökünde local-defaults.json
// varsa o dosyanın içeriği; aksi hâlde null. Pazar yeri paketinde değer hep null'dır.
// Değerler yalnız ilgili depo alanı BOŞSA bir kez yazılır; kullanıcının seçimi ezilmez.
import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import { EISENHOWER_DOC_STORAGE_KEY, EISENHOWER_TAGS_STORAGE_KEY, type TagIdMap } from '../eisenhower/core';
import { MYDRIVE_FOLDER_ID_STORAGE_KEY } from './mydrive/constants';

export interface LocalDefaults {
  eisenhowerDocId?: string;
  mydriveFolderId?: string;
  /** critical/high/medium/low → etiket Rem kimliği */
  eisenhowerTagIds?: TagIdMap;
}

declare const __RN_LOCAL_DEFAULTS__: LocalDefaults | null | undefined;

export function localDefaults(): LocalDefaults | null {
  try {
    return typeof __RN_LOCAL_DEFAULTS__ === 'object' && __RN_LOCAL_DEFAULTS__ ? __RN_LOCAL_DEFAULTS__ : null;
  } catch {
    return null;
  }
}

const ID = /^[A-Za-z0-9_-]{5,120}$/;

export async function applyLocalDefaults(plugin: ReactRNPlugin): Promise<void> {
  const defaults = localDefaults();
  if (!defaults) return;
  try {
    if (defaults.eisenhowerDocId && ID.test(defaults.eisenhowerDocId)) {
      const current = await plugin.storage.getSynced<string>(EISENHOWER_DOC_STORAGE_KEY);
      if (!current) await plugin.storage.setSynced(EISENHOWER_DOC_STORAGE_KEY, defaults.eisenhowerDocId);
    }
    const tags = defaults.eisenhowerTagIds || {};
    const validTags: TagIdMap = {};
    for (const key of ['critical', 'high', 'medium', 'low']) {
      const value = tags[key];
      if (typeof value === 'string' && ID.test(value)) validTags[key] = value;
    }
    if (Object.keys(validTags).length) {
      const current = await plugin.storage.getSynced<TagIdMap>(EISENHOWER_TAGS_STORAGE_KEY);
      if (!current || !Object.keys(current).length) await plugin.storage.setSynced(EISENHOWER_TAGS_STORAGE_KEY, validTags);
    }
    if (defaults.mydriveFolderId && ID.test(defaults.mydriveFolderId)) {
      const current = await plugin.storage.getLocal<string>(MYDRIVE_FOLDER_ID_STORAGE_KEY);
      if (!current) await plugin.storage.setLocal(MYDRIVE_FOLDER_ID_STORAGE_KEY, defaults.mydriveFolderId);
    }
  } catch (error) {
    console.warn('[MCP Bridge] yerel ilk değerler yazılamadı', error);
  }
}
