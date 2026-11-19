// Bölüm kataloğu: birleşik eklentideki her bölümün kimliği, varsayılanı ve
// RemNote'a kaydettiği adlar. SDK'ya bağlı DEĞİL; testler doğrudan yükler.
//
// Kural (tasarım 2026-11-19 §2-3):
// - Köprü varsayılan AÇIK (pazar yerindeki mevcut kullanıcılar bunu kullanıyor), diğer her bölüm KAPALI.
// - Başka eklentiden taşınan bölümlerin bütün adları bölüm önekiyle başlar (alarm_, pdfdark_, mydrive_, nobullet_).
// - Köprü fork'unun zaten yayımladığı adlar (right_sidebar, ogren, translate_*, eisenhower_board,
//   assistant_popup, mcp-* ayarları, mevcut depolama anahtarları) DEĞİŞTİRİLMEZ: değişirse
//   mevcut kurulumların ayarı ve verisi kaybolur. Bunlar `legacy: true` ile işaretlidir.

export type FeatureId =
  | 'kopru'
  | 'ceviri'
  | 'ogren'
  | 'eisenhower'
  | 'alarm'
  | 'pdfdark'
  | 'mydrive'
  | 'nobullet';

export interface FeatureIds {
  widgets: string[];
  commands: string[];
  quickCodes: string[];
  menuItems: string[];
  css: string[];
  settings: string[];
  storage: string[];
  powerups: string[];
}

export interface FeatureMeta {
  id: FeatureId;
  title: string;
  description: string;
  defaultOn: boolean;
  /** true: bölüm telefonda (Android/iOS) hiç etkinleşmez; yerel host/CDP/Windows'a bağlıdır. */
  desktopOnly: boolean;
  /** Ad öneki; legacy bölümlerde yalnız bilgi amaçlıdır. */
  prefix: string;
  /** true: adlar köprü fork'unun eski sürümlerinden gelir, yeniden adlandırılmaz. */
  legacy: boolean;
  ids: FeatureIds;
}

export const FEATURE_SETTING_PREFIX = 'feature.';

export function featureSettingId(id: FeatureId): string {
  return `${FEATURE_SETTING_PREFIX}${id}`;
}

const empty = (): FeatureIds => ({
  widgets: [],
  commands: [],
  quickCodes: [],
  menuItems: [],
  css: [],
  settings: [],
  storage: [],
  powerups: [],
});

const RELOAD_NOTE =
  ' Değişiklik canlı uygulanır; uygulanmazsa eklentiyi yeniden yükleyin. Kapatılan bölümün komutları yeniden yüklemeye kadar listede kalır. / Applied live; if not, reload the plugin. Commands of a disabled section stay listed until a reload.';

export const FEATURES: FeatureMeta[] = [
  {
    id: 'kopru',
    title: 'Bölüm: MCP Köprüsü / Section: MCP Bridge',
    description:
      'Yapay zekâ asistanlarını yerel köprü (127.0.0.1:3401) üzerinden notlarınıza bağlar. Yalnız bilgisayarda çalışır; telefonda hiç başlamaz. / Connects AI assistants through the local bridge. Desktop only.' +
      RELOAD_NOTE,
    defaultOn: true,
    desktopOnly: true,
    prefix: '',
    legacy: true,
    ids: {
      ...empty(),
      widgets: ['right_sidebar'],
      settings: [
        'mcp-auto-tag-enabled',
        'mcp-auto-tag',
        'mcp-journal-prefix',
        'mcp-journal-timestamp',
        'mcp-ws-url',
        'mcp-default-parent',
      ],
      storage: ['mcp-runtime-status', 'mcp_sidebar_shortcuts_v1', 'mcp_safe_migration_audit_log_v1', 'remnote-core-pairing-key-v1'],
    },
  },
  {
    id: 'ceviri',
    title: 'Bölüm: Çeviri ve AI Asistanı / Section: Translation & AI Assistant',
    description:
      'Seçili metni yerel yapay zekâ ile çevirir ve AI Asistanını açar. Yerel host (127.0.0.1:3400) gerekir; yalnız bilgisayarda. / Local AI translation and assistant. Desktop only.' +
      RELOAD_NOTE,
    defaultOn: false,
    desktopOnly: true,
    prefix: '',
    legacy: true,
    ids: {
      ...empty(),
      widgets: ['translate_popup', 'translate_selected_text_menu', 'assistant_popup'],
      commands: ['remnote-mcp-bridge.translate-selection', 'remnote-mcp-bridge.assistant-selection'],
      quickCodes: ['aiassistant'],
      menuItems: [
        'remnote-mcp-bridge.translate-reader-menu',
        'remnote-mcp-bridge.translate-document-menu',
        'remnote-mcp-bridge.assistant-reader',
      ],
    },
  },
  {
    id: 'ogren',
    title: 'Bölüm: Öğren (kelime dersi) / Section: Learn (vocabulary lessons)',
    description:
      'Kelime kartlı belgelerde önce öğren, sonra test et. Telefonda da çalışır; resim/hikâye önerisi yalnız bilgisayarda. / Learn-then-test lessons. Works on mobile; image/story hints desktop only.' +
      RELOAD_NOTE,
    defaultOn: false,
    desktopOnly: false,
    prefix: 'ogren',
    legacy: true,
    ids: {
      ...empty(),
      widgets: ['ogren_button', 'ogren'],
      commands: ['ogren-bu-belge'],
      storage: ['ogren-eklenenler', 'ogren-ilerleme'],
    },
  },
  {
    id: 'eisenhower',
    title: 'Bölüm: Eisenhower panosu / Section: Eisenhower board',
    description:
      'Seçtiğiniz belgenin başlığı altında Eisenhower panosu (komut: "Eisenhower: bu belgeyi pano yap"). / Eisenhower board under the document you choose.' +
      RELOAD_NOTE,
    defaultOn: false,
    desktopOnly: false,
    prefix: 'eisenhower',
    legacy: true,
    ids: { ...empty(), widgets: ['eisenhower_board'], commands: ['eisenhower_bu_belge'], css: ['eisenhower-board-wide'], storage: ['eisenhower_doc_id', 'eisenhower_tag_ids'] },
  },
  {
    id: 'alarm',
    title: 'Bölüm: Todo Alarm / Section: Todo Alarm',
    description:
      'Todo satırı için Windows alarmı kurar (/toalarm). Yerel alarm servisi (127.0.0.1:8084) gerekir; yalnız bilgisayarda. / Windows alarms for Todos. Needs the local 8084 alarm service. Desktop only.' +
      RELOAD_NOTE,
    defaultOn: false,
    desktopOnly: true,
    prefix: 'alarm_',
    legacy: false,
    ids: {
      ...empty(),
      widgets: ['alarm_popup'],
      commands: ['alarm_open'],
      quickCodes: ['toalarm'],
      css: ['alarm_slash_icon'],
      storage: ['alarm_todo:<remId>'],
    },
  },
  {
    id: 'pdfdark',
    title: 'Bölüm: PDF Okuma Görünümü / Section: PDF Reading View',
    description:
      'PDF için zemin, yazı parlaklığı ve sıcaklık ayarı. Dosyayı ve notları değiştirmez. / PDF background, text brightness and warmth.' +
      RELOAD_NOTE,
    defaultOn: false,
    desktopOnly: false,
    prefix: 'pdfdark_',
    legacy: false,
    ids: {
      ...empty(),
      widgets: ['pdfdark_controls', 'pdfdark_entry'],
      commands: ['pdfdark_open'],
      quickCodes: ['pdfdark'],
      menuItems: ['pdfdark_reader'],
      css: ['pdfdark_display', 'pdfdark_entry_css'],
      storage: ['pdfdark_state', 'pdfdark_last_appearance'],
    },
  },
  {
    id: 'mydrive',
    title: 'Bölüm: MyDrive (Google Drive yükleme) / Section: MyDrive',
    description:
      'Dosyayı Google Drive klasörüne yükleyip bağlantısını nota ekler. Yerel MyDrive sunucusu (localhost:8083) ve Google OAuth istemci kimliği gerekir; yalnız bilgisayarda, deneysel. / Upload to Google Drive. Needs the local 8083 server. Desktop only, experimental.' +
      RELOAD_NOTE,
    defaultOn: false,
    desktopOnly: true,
    prefix: 'mydrive_',
    legacy: false,
    ids: {
      ...empty(),
      widgets: ['mydrive_popup', 'mydrive_file_card'],
      commands: ['mydrive_upload'],
      quickCodes: ['mydrive'],
      css: ['mydrive_slash_icon', 'mydrive_card_style'],
      storage: [
        'mydrive_google_client_id',
        'mydrive_google_client_secret',
        'mydrive_folder_id',
        'mydrive_last_editor_target',
        'mydrive_oauth_redirect_result',
      ],
      powerups: ['mydrive_file'],
    },
  },
  {
    id: 'nobullet',
    title: 'Bölüm: No Bullet görünümü / Section: No Bullet editor mode',
    description:
      'Rem noktalarını üzerine gelinene kadar gizler; yalnız görünüm. Telefonda da çalışır. / Hides Rem bullet dots until hover. Visual only; works on mobile.' +
      RELOAD_NOTE,
    defaultOn: false,
    desktopOnly: false,
    prefix: 'nobullet_',
    legacy: false,
    ids: {
      ...empty(),
      commands: ['nobullet_bulletlist', 'nobullet_bulletlists'],
      quickCodes: ['bl', 'bls'],
      css: ['nobullet_css', 'nobullet_padding'],
      settings: ['nobullet_padding'],
      powerups: ['nobullet_bulletlist', 'nobullet_bulletlists'],
    },
  },
];

export function featureMeta(id: FeatureId): FeatureMeta {
  const meta = FEATURES.find((feature) => feature.id === id);
  if (!meta) throw new Error(`Unknown feature: ${id}`);
  return meta;
}
