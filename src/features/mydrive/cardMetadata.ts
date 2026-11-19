import type { RichTextInterface } from '@remnote/plugin-sdk';

type DriveLinkSource = {
  id: string;
  webContentLink?: string;
  webViewLink?: string;
};

export const MYDRIVE_CARD_HASH = 'mydrive-card';

export const MYDRIVE_CARD_EXTENSION_DEFINITIONS = [
  { group: 'pdf', label: 'PDF', extensions: ['pdf'] },
  { group: 'image', label: 'IMG', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic', 'heif'] },
  { group: 'md', label: 'MD', extensions: ['md', 'markdown', 'mdx'] },
  { group: 'text', label: 'TXT', extensions: ['txt', 'text', 'rtf', 'log'] },
  { group: 'code', label: 'CODE', extensions: ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'h', 'cpp', 'cc', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'html', 'css', 'scss', 'sql'] },
  { group: 'data', label: 'JSON', extensions: ['json', 'yaml', 'yml', 'xml', 'toml', 'ini'] },
  { group: 'doc', label: 'DOC', extensions: ['doc', 'docx', 'odt', 'pages'] },
  { group: 'sheet', label: 'XLS', extensions: ['xls', 'xlsx', 'csv', 'tsv', 'ods'] },
  { group: 'slide', label: 'PPT', extensions: ['ppt', 'pptx', 'odp', 'key'] },
  { group: 'archive', label: 'ZIP', extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'] },
  { group: 'audio', label: 'AUD', extensions: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac'] },
  { group: 'video', label: 'VID', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] },
  { group: 'app', label: 'APP', extensions: ['exe', 'msi', 'apk', 'dmg'] },
] as const;

const EXTENSION_TO_GROUP = MYDRIVE_CARD_EXTENSION_DEFINITIONS.reduce<Record<string, string>>((acc, definition) => {
  for (const extension of definition.extensions) {
    acc[extension] = definition.group;
  }
  return acc;
}, {});

const GROUP_TO_LABEL = MYDRIVE_CARD_EXTENSION_DEFINITIONS.reduce<Record<string, string>>((acc, definition) => {
  acc[definition.group] = definition.label;
  return acc;
}, {});

const GROUP_TO_COLOR: Record<string, string> = {
  pdf: '#5b6cff',
  image: '#34a853',
  archive: '#f97316',
  app: '#f97316',
  audio: '#a855f7',
  video: '#a855f7',
  md: '#16a3d8',
  text: '#16a3d8',
  code: '#16a3d8',
  data: '#16a3d8',
};

export function richTextToPlain(value: RichTextInterface | undefined): string {
  if (!Array.isArray(value)) return '';
  return value.map((part) => {
    const text = (part as { text?: unknown })?.text;
    return typeof text === 'string' ? text : '';
  }).join('').trim();
}

export function plainRichText(value: string, fallback = ''): RichTextInterface {
  const text = value.trim() || fallback;
  return [{ i: 'm', text }];
}

export function visibleMyDriveCardRichText(fileName: string, link: string): RichTextInterface {
  const cleanName = fileName.trim() || 'Untitled file';
  const cleanLink = link.trim();
  if (!cleanLink) return plainRichText(cleanName, 'Untitled file');
  return [{
    i: 'm',
    text: cleanName,
    url: cleanLink,
    title: `MyDrive file: ${cleanName}`,
  }] as unknown as RichTextInterface;
}

export function driveLink(result: DriveLinkSource): string {
  return result.webContentLink || result.webViewLink || `https://drive.google.com/uc?id=${encodeURIComponent(result.id)}&export=download`;
}

export function extensionFromFileName(fileName: string): string {
  const cleanName = fileName.trim().toLowerCase();
  const match = cleanName.match(/\.([a-z0-9]{1,10})$/);
  const extension = match ? match[1] : '';
  return /^\d+$/.test(extension) ? '' : extension;
}

export function myDriveCardGroupFromFileName(fileName: string): string {
  const extension = extensionFromFileName(fileName);
  return extension ? EXTENSION_TO_GROUP[extension] || 'file' : 'file';
}

export function myDriveCardMarker(fileName: string): string {
  const group = myDriveCardGroupFromFileName(fileName);
  return group && group !== 'file' ? `${MYDRIVE_CARD_HASH}-${group}` : MYDRIVE_CARD_HASH;
}

export function myDriveCardLink(fileName: string, link: string): string {
  const cleanLink = link.trim();
  if (!cleanLink) return cleanLink;
  if (cleanLink.includes(`#${MYDRIVE_CARD_HASH}`) || cleanLink.includes(`%23${MYDRIVE_CARD_HASH}`)) return cleanLink;
  const marker = myDriveCardMarker(fileName);
  const hashIndex = cleanLink.indexOf('#');
  if (hashIndex >= 0) return `${cleanLink.slice(0, hashIndex)}#${marker}&${cleanLink.slice(hashIndex + 1)}`;
  return `${cleanLink}#${marker}`;
}

export function fileLabel(group: string, fileName: string): string {
  const normalized = group.trim().toLowerCase();
  const label = GROUP_TO_LABEL[normalized];
  if (label) return label;
  const extension = extensionFromFileName(fileName);
  return extension ? extension.slice(0, 6).toUpperCase() : 'FILE';
}

export function iconColor(group: string): string {
  const normalized = group.trim().toLowerCase();
  return GROUP_TO_COLOR[normalized] || '#64748b';
}
