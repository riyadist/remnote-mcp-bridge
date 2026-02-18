/**
 * RemNote API Adapter
 * Wraps the RemNote Plugin SDK with correct method signatures for v0.0.46+
 */

import {
  ReactRNPlugin,
  RichTextInterface,
  PluginRem
} from '@remnote/plugin-sdk';
import { MCPSettings } from '../settings';

export interface CreateNoteParams {
  title: string;
  content?: string;
  parentId?: string;
  tags?: string[];
  isDocument?: boolean;
  headingLevel?: number;
  isQuote?: boolean;
  isList?: boolean;
}

export interface AppendJournalParams {
  content: string;
  timestamp?: boolean;
}

export interface SearchParams {
  query: string;
  limit?: number;
  includeContent?: boolean;
}

export interface ReadNoteParams {
  remId: string;
  depth?: number;
}

export interface UpdateNoteParams {
  remId: string;
  title?: string;
  headingLevel?: number;
  appendContent?: string;
  addTags?: string[];
  removeTags?: string[];
}

export interface OverwriteNoteContentParams {
  remId: string;
  content: string;
  headingLevel?: number;
}

export interface NoteChild {
  remId: string;
  text: string;
  children: NoteChild[];
}

export interface SearchResultItem {
  remId: string;
  title: string;
  preview: string;
  content?: string;
}

export class RemAdapter {
  private settings: MCPSettings;

  constructor(private plugin: ReactRNPlugin, settings?: Partial<MCPSettings>) {
    // Default settings
    this.settings = {
      autoTagEnabled: true,
      autoTag: 'MCP',
      journalPrefix: '[Claude]',
      journalTimestamp: true,
      wsUrl: 'ws://127.0.0.1:3002',
      defaultParentId: '',
      ...settings
    };
  }

  /**
   * Update settings dynamically
   */
  updateSettings(settings: Partial<MCPSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Get current settings
   */
  getSettings(): MCPSettings {
    return { ...this.settings };
  }

  /**
   * Extract plain text from RichTextInterface
   */
  private extractText(richText: RichTextInterface | undefined): string {
    if (!richText || !Array.isArray(richText)) return '';

    return richText
      .map((element) => {
        if (typeof element === 'string') {
          return element;
        }
        // Handle rich text elements (references, formatting, etc.)
        if (element && typeof element === 'object' && 'text' in element) {
          return (element as { text?: string }).text || '';
        }
        return '';
      })
      .join('');
  }

  /**
   * Helper to safely get text from a Rem, handling potential async nature or proxy issues
   */
  private async getRemText(rem: PluginRem): Promise<string> {
    if (!rem) return '';
    // Try to get text directly if it's a property
    // In some SDK versions, properties might be async/promises
    let text: any = rem.text;

    // If it's a promise (some SDK versions/states), await it
    if (text instanceof Promise) {
      try {
        text = await text;
      } catch (e) {
        console.error("Error awaiting rem.text", e);
        return "";
      }
    }

    return this.extractText(text);
  }

  /**
   * Convert plain text to RichTextInterface
   */
  private textToPlainRichText(text: string): RichTextInterface {
    return [text];
  }

  /**
   * Convert user input text to RichTextInterface with markdown support.
   * Falls back to plain text if markdown parsing is unavailable/fails.
   */
  private async textToRichText(text: string): Promise<RichTextInterface> {
    const boldItalicMatch = text.match(/^\*\*\*(.+)\*\*\*$/s);
    if (boldItalicMatch && boldItalicMatch[1]) {
      try {
        const plain = this.textToPlainRichText(boldItalicMatch[1]);
        const len = boldItalicMatch[1].length;
        const bold = await this.plugin.richText.applyTextFormatToRange(plain, 0, len, 'bold');
        return await this.plugin.richText.applyTextFormatToRange(bold, 0, len, 'italic');
      } catch (e) {
        console.warn('bold+italic format conversion failed, trying markdown parser', e);
      }
    }

    const boldMatch = text.match(/^\*\*(.+)\*\*$/s);
    if (boldMatch && boldMatch[1]) {
      try {
        const plain = this.textToPlainRichText(boldMatch[1]);
        return await this.plugin.richText.applyTextFormatToRange(plain, 0, boldMatch[1].length, 'bold');
      } catch (e) {
        console.warn('bold format conversion failed, trying markdown parser', e);
      }
    }

    const italicMatch = text.match(/^\*(.+)\*$/s);
    if (italicMatch && italicMatch[1]) {
      try {
        const plain = this.textToPlainRichText(italicMatch[1]);
        return await this.plugin.richText.applyTextFormatToRange(plain, 0, italicMatch[1].length, 'italic');
      } catch (e) {
        console.warn('italic format conversion failed, trying markdown parser', e);
      }
    }

    try {
      if (this.plugin?.richText?.parseFromMarkdown) {
        return await this.plugin.richText.parseFromMarkdown(text);
      }
    } catch (e) {
      console.warn('parseFromMarkdown failed, falling back to plain text', e);
    }
    return this.textToPlainRichText(text);
  }

  /**
   * Add a tag to a Rem (helper function)
   */
  private async addTagToRem(rem: PluginRem, tagName: string): Promise<void> {
    const tagRem = await this.plugin.rem.findByName([tagName], null);
    if (tagRem) {
      await rem.addTag(tagRem._id);
    } else {
      const newTag = await this.plugin.rem.createRem();
      if (newTag) {
        await newTag.setText(this.textToPlainRichText(tagName));
        await rem.addTag(newTag._id);
      }
    }
  }

  // Helper to check if string is UUID
  private isUUID(str: string): boolean {
    return !str.includes(' ') && str.length > 15;
  }

  /**
   * Build locale-aware variants for robust matching in Turkish.
   */
  private buildNameVariants(value: string): string[] {
    const base = (value || '').normalize('NFC').trim();
    if (!base) return [];
    const folded = base
      .replace(/[çÇ]/g, 'c')
      .replace(/[ğĞ]/g, 'g')
      .replace(/[ıİ]/g, 'i')
      .replace(/[öÖ]/g, 'o')
      .replace(/[şŞ]/g, 's')
      .replace(/[üÜ]/g, 'u');
    return Array.from(new Set([
      base,
      folded,
      folded.toUpperCase(),
      folded.toLowerCase(),
      base.toLocaleUpperCase('tr-TR'),
      base.toLocaleLowerCase('tr-TR'),
      base.toUpperCase(),
      base.toLowerCase(),
    ]));
  }

  /**
   * Create a new note in RemNote
   */
  async createNote(params: CreateNoteParams): Promise<{ remId: string; title: string }> {
    const rem = await this.plugin.rem.createRem();
    if (!rem) {
      throw new Error('Failed to create Rem');
    }

    // Set the title
    await rem.setText(await this.textToRichText(params.title));

    // Apply formatting
    if (params.isDocument) await rem.setIsDocument(true);
    if (typeof params.headingLevel === 'number' && params.headingLevel > 0) {
      const fontSize =
        params.headingLevel === 1
          ? 'H1'
          : params.headingLevel === 2
            ? 'H2'
            : 'H3';
      await rem.setFontSize(fontSize);
    }
    if (params.isQuote) await rem.setIsQuote(true);
    if (params.isList) await rem.setIsListItem(true);

    // Add content as child if provided
    if (params.content) {
      const lines = params.content.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          const contentRem = await this.plugin.rem.createRem();
          if (contentRem) {
            await contentRem.setText(await this.textToRichText(line));
            await contentRem.setParent(rem);
          }
        }
      }
    }

    // Set parent: use provided parentId, or default parent from settings, or root
    let parentId = params.parentId || this.settings.defaultParentId;
    let parentRem: PluginRem | undefined;

    // Auto-resolve parent with Turkish-aware variants
    if (parentId) {
      const targetName = parentId.trim();
      const variants = this.buildNameVariants(targetName);

      if (this.isUUID(targetName)) {
        try {
          const found = await this.plugin.rem.findOne(targetName);
          if (found) {
            parentRem = found;
            console.log(`[Adapter] Found parent by ID: ${targetName}`);
          }
        } catch {
          // Continue with name-based lookup
        }
      }

      if (!parentRem) {
        for (const variant of variants) {
          parentRem = await this.plugin.rem.findByName([variant], null);
          if (parentRem) {
            console.log(`[Adapter] Found parent by Exact Name: "${variant}"`);
            break;
          }
        }
      }

      if (!parentRem) {
        for (const variant of variants) {
          const validResults = await this.plugin.search.search(this.textToPlainRichText(variant), undefined, { numResults: 1 });
          if (validResults && validResults.length > 0) {
            parentRem = validResults[0];
            console.log(`[Adapter] Found parent via search: "${variant}" -> ${parentRem._id}`);
            break;
          }
        }
      }

      if (!parentRem) {
        console.log(`[Adapter] Parent "${targetName}" NOT FOUND. Creating it...`);
        parentRem = await this.plugin.rem.createRem();
        if (parentRem) {
          await parentRem.setText(this.textToPlainRichText(targetName));
          await parentRem.setIsDocument(true);
          await parentRem.setIsFolder(true);
          console.log(`[Adapter] Created new parent: ${parentRem._id}`);
        }
      }
    }

    if (parentRem) {
      await rem.setParent(parentRem);
    } else if (parentId) {
      console.warn(`[Adapter] Failed to resolve parent: ${parentId}`);
    }

    // Collect all tags to add
    const allTags = [...(params.tags || [])];

    // Add auto-tag if enabled
    if (this.settings.autoTagEnabled && this.settings.autoTag) {
      if (!allTags.includes(this.settings.autoTag)) {
        allTags.push(this.settings.autoTag);
      }
    }

    // Add all tags
    for (const tagName of allTags) {
      await this.addTagToRem(rem, tagName);
    }

    return { remId: rem._id, title: params.title };
  }

  /**
   * Append content to today's journal/daily document
   */
  async appendJournal(params: AppendJournalParams): Promise<{ remId: string; content: string }> {
    const today = new Date();
    const dailyDoc = await this.plugin.date.getDailyDoc(today);

    if (!dailyDoc) {
      throw new Error('Failed to access daily document');
    }

    const entryRem = await this.plugin.rem.createRem();
    if (!entryRem) {
      throw new Error('Failed to create journal entry');
    }

    // Build the text with prefix and optional timestamp
    const useTimestamp = params.timestamp ?? this.settings.journalTimestamp;
    const prefix = this.settings.journalPrefix;

    let text = '';
    if (prefix) {
      text += `${prefix} `;
    }
    if (useTimestamp) {
      text += `[${today.toLocaleTimeString()}] `;
    }
    text += params.content;

    await entryRem.setText(await this.textToRichText(text));
    await entryRem.setParent(dailyDoc);

    return { remId: entryRem._id, content: text };
  }

  /**
   * Search the knowledge base
   */
  async search(params: SearchParams): Promise<{ results: SearchResultItem[] }> {
    const limit = params.limit ?? 20;
    const results: SearchResultItem[] = [];
    const variants = this.buildNameVariants(params.query);

    try {
      for (const variant of variants) {
        if (results.length >= limit) break;
        const exactMatch = await this.plugin.rem.findByName([variant], null);
        if (!exactMatch) continue;
        if (results.some((r) => r.remId === exactMatch._id)) continue;
        const title = await this.getRemText(exactMatch);
        results.push({
          remId: exactMatch._id,
          title: title || variant,
          preview: 'Exact Match'
        });
      }
    } catch (e) {
      console.error('Exact match search failed', e);
    }

    if (results.length < limit) {
      try {
        for (const variant of variants) {
          if (results.length >= limit) break;
          const searchResults = await this.plugin.search.search(
            this.textToPlainRichText(variant),
            undefined,
            { numResults: limit }
          );

          for (const rem of searchResults) {
            if (results.some(r => r.remId === rem._id)) continue;
            if (results.length >= limit) break;

            const title = await this.getRemText(rem);
            const preview = title.substring(0, 100);
            const item: SearchResultItem = {
              remId: rem._id,
              title,
              preview
            };

            if (params.includeContent) {
              const children = await rem.getChildrenRem();
              if (children && children.length > 0) {
                const childTexts = await Promise.all(children.slice(0, 5).map(async (child) => {
                  return await this.getRemText(child);
                }));
                item.content = childTexts.join('\n');
              }
            }

            results.push(item);
          }
        }
      } catch (e) {
        console.error('Fuzzy search failed', e);
      }
    }

    return { results };
  }

  /**
   * Read a note by its ID
   */
  async readNote(params: ReadNoteParams): Promise<{
    remId: string;
    title: string;
    content: string;
    children: NoteChild[];
    parentId?: string;
    parentTitle?: string;
    fontSize?: 'H1' | 'H2' | 'H3';
  }> {
    const depth = params.depth ?? 3;
    const rem = await this.plugin.rem.findOne(params.remId);

    if (!rem) {
      throw new Error(`Note not found: ${params.remId}`);
    }

    // Use helper
    const title = await this.getRemText(rem);
    const children = await this.getChildrenRecursive(rem, depth);
    const parentRem = await rem.getParentRem();
    const parentTitle = parentRem ? await this.getRemText(parentRem) : undefined;
    const fontSize = await rem.getFontSize();

    return {
      remId: rem._id,
      title,
      content: title,
      children,
      parentId: parentRem?._id,
      parentTitle,
      fontSize
    };
  }

  /**
   * Recursively get children of a Rem
   */
  private async getChildrenRecursive(rem: PluginRem, depth: number): Promise<NoteChild[]> {
    if (depth <= 0) return [];

    const children = await rem.getChildrenRem();
    if (!children || children.length === 0) return [];

    const result: NoteChild[] = [];

    for (const child of children) {
      // Use helper
      const text = await this.getRemText(child);
      const grandchildren = await this.getChildrenRecursive(child, depth - 1);

      result.push({
        remId: child._id,
        text,
        children: grandchildren
      });
    }

    return result;
  }

  /**
   * Update an existing note
   */
  async updateNote(params: UpdateNoteParams): Promise<{ success: boolean; remId: string }> {
    const rem = await this.plugin.rem.findOne(params.remId);

    if (!rem) {
      throw new Error(`Note not found: ${params.remId}`);
    }

    // Update title if provided
    if (params.title) {
      await rem.setText(await this.textToRichText(params.title));
    }

    if (typeof params.headingLevel === 'number') {
      if (params.headingLevel <= 0) {
        await rem.setFontSize(undefined);
      } else {
        const fontSize =
          params.headingLevel === 1
            ? 'H1'
            : params.headingLevel === 2
              ? 'H2'
              : 'H3';
        await rem.setFontSize(fontSize);
      }
    }

    // Append content as new children
    if (params.appendContent) {
      const lines = params.appendContent.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          const contentRem = await this.plugin.rem.createRem();
          if (contentRem) {
            await contentRem.setText(await this.textToRichText(line));
            await contentRem.setParent(rem);
          }
        }
      }
    }

    // Add tags
    if (params.addTags && params.addTags.length > 0) {
      for (const tagName of params.addTags) {
        await this.addTagToRem(rem, tagName);
      }
    }

    // Remove tags
    if (params.removeTags && params.removeTags.length > 0) {
      for (const tagName of params.removeTags) {
        const tagRem = await this.plugin.rem.findByName([tagName], null);
        if (tagRem) {
          await rem.removeTag(tagRem._id);
        }
      }
    }

    return { success: true, remId: params.remId };
  }

  /**
   * Replace all direct children of a note with new content lines.
   */
  async overwriteNoteContent(params: OverwriteNoteContentParams): Promise<{ success: boolean; remId: string }> {
    const rem = await this.plugin.rem.findOne(params.remId);
    if (!rem) {
      throw new Error(`Note not found: ${params.remId}`);
    }

    const existingChildren = await rem.getChildrenRem();
    if (existingChildren && existingChildren.length > 0) {
      for (const child of existingChildren) {
        await child.remove();
      }
    }

    const lines = (params.content || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const fontSize =
      params.headingLevel === 1
        ? 'H1'
        : params.headingLevel === 2
          ? 'H2'
          : params.headingLevel === 3
            ? 'H3'
            : null;

    for (const line of lines) {
      const child = await this.plugin.rem.createRem();
      if (!child) continue;
      await child.setText(await this.textToRichText(line));
      if (fontSize) {
        await child.setFontSize(fontSize);
      }
      await child.setParent(rem);
    }

    return { success: true, remId: params.remId };
  }

  /**
   * Get plugin status
   */
  async getStatus(): Promise<{
    connected: boolean;
    pluginVersion: string;
    knowledgeBaseId?: string;
  }> {
    return {
      connected: true,
      pluginVersion: '1.1.0',
      knowledgeBaseId: undefined
    };
  }
}

