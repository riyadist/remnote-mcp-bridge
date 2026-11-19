// PDF Okuma Görünümü bölümü (rn-pdf-dark-local-dev 0.2.2 index.ts'den taşındı).
// Taşınmayan (bilerek): window üzerinden gelen pdf-dark-open mesaj dinleyicisi. Onu yalnız ayrı bir CDP
// betiği (plugin/toolbar.cjs) gönderiyordu; telefonda yok, masaüstünde de eski eklentinin
// iframe'ini hedefliyor. Giriş yolları: komut (/pdfdark), Reader menüsü, PDF yanındaki düğme.
import { AppEvents, PluginCommandMenuLocation, WidgetLocation, type ReactRNPlugin } from '@remnote/plugin-sdk';
import type { FeatureRuntime } from '../registry';
import { quietly, registerGuardedCommand } from '../sdk-helpers';
import { registerEntry } from './entry';
import { applyMode, broadcastPayload, DEFAULT_CONFIG, PREFERENCE_KEY, readPreference, validConfig, type ReadingState } from './mode';

export const PDFDARK_CONTROLS_WIDGET = 'pdfdark_controls';
export const PDFDARK_MSG_SET = 'pdfdark_set';
export const PDFDARK_MSG_GET = 'pdfdark_get';
export const PDFDARK_MSG_RESULT = 'pdfdark_result';

export function createPdfDarkFeature(plugin: ReactRNPlugin): FeatureRuntime {
  let active = false;
  let serial: Promise<void> = Promise.resolve();
  let messageListener: ((message: any) => void) | undefined;
  let stopEntry: (() => Promise<void>) | undefined;

  return {
    id: 'pdfdark',
    async activate() {
      // Önce eski çalışma durumunu temizle; yalnız doğrulanmış cihaz-yerel tercih geri yüklenir.
      let state: ReadingState = { enabled: false, config: { ...DEFAULT_CONFIG } };
      let uncertainError = '';
      active = true;
      serial = (async () => {
        await plugin.app.registerCSS('pdfdark_display', '');
        if (!active) return;
        await plugin.storage.setSession('pdfdark_state', state);
        try {
          const savedRecord = await plugin.storage.getLocal(PREFERENCE_KEY);
          if (!active) return;
          const restored = readPreference(savedRecord);
          if (restored) {
            await applyMode(plugin, restored, state);
            state = restored;
          }
        } catch (e) {
          uncertainError = typeof (e as any)?.message === 'string' ? (e as any).message : 'Kayıtlı görünüm okunamadı.';
        }
      })();
      await serial;
      if (!active) return;

      messageListener = (message: any) => {
        if (!active) return;
        message = broadcastPayload(message);
        if (![PDFDARK_MSG_SET, PDFDARK_MSG_GET].includes(message?.type) || typeof message.requestId !== 'string') return;
        serial = serial
          .then(async () => {
            if (!active) return;
            let error = uncertainError;
            if (message.type === PDFDARK_MSG_SET) {
              if (typeof message.on !== 'boolean' || !validConfig(message.config)) error = 'Geçersiz görünüm ayarı.';
              else {
                const next = {
                  enabled: message.on,
                  config: { background: message.config.background, text: message.config.text, warmth: message.config.warmth },
                };
                try {
                  const previousRecord = await plugin.storage.getLocal(PREFERENCE_KEY);
                  if (!active) return;
                  await applyMode(plugin, next, state, { previous: previousRecord });
                  state = next;
                  uncertainError = '';
                  error = '';
                } catch (e) {
                  error = typeof (e as any)?.message === 'string' ? (e as any).message : 'Görünüm değiştirilemedi.';
                  if (error.includes('Geri alma doğrulanamadı')) uncertainError = error;
                }
              }
            }
            if (!active) return;
            if (uncertainError) error = uncertainError;
            await plugin.messaging.broadcast({ type: PDFDARK_MSG_RESULT, requestId: message.requestId, ...state, error });
          })
          .catch((e) => console.error('[PDF Görünüm]', e));
      };
      plugin.event.addListener(AppEvents.MessageBroadcast, undefined, messageListener);

      await plugin.app.registerWidget(PDFDARK_CONTROLS_WIDGET, WidgetLocation.Popup, { dimensions: { width: 600, height: 520 } });
      const open = async () => {
        if (active) await plugin.widget.openPopup(PDFDARK_CONTROLS_WIDGET);
      };
      await registerGuardedCommand(
        plugin,
        {
          id: 'pdfdark_open',
          name: 'PDF Okuma Görünümü',
          quickCode: 'pdfdark',
          keywords: 'pdf dark karart gece görsel görünüm',
          description: 'PDF için zemin, yazı parlaklığı ve sıcaklığı ayarla.',
          action: open,
        },
        () => active,
        'PDF Okuma Görünümü bölümü kapalı. Ayarlardan açabilirsiniz.',
      );
      await plugin.app.registerMenuItem({
        id: 'pdfdark_reader',
        name: 'PDF Okuma Görünümü',
        location: PluginCommandMenuLocation.ReaderMenu,
        action: open,
      });
      stopEntry = await registerEntry(plugin, () => active, WidgetLocation.FloatingWidget);
    },
    async deactivate() {
      // Önce yeni işi kabul etmeyi bırak, sürmekte olan SDK işleminin bitmesini bekle.
      active = false;
      const listener = messageListener;
      messageListener = undefined;
      if (listener) plugin.event.removeListener(AppEvents.MessageBroadcast, undefined, listener);
      await serial.catch(() => undefined);
      const entry = stopEntry;
      stopEntry = undefined;
      await quietly([
        async () => { await entry?.(); },
        () => plugin.app.registerCSS('pdfdark_display', ''),
        () => plugin.storage.setSession('pdfdark_state', { enabled: false, config: { ...DEFAULT_CONFIG } }),
        () => plugin.app.unregisterMenuItem('pdfdark_reader'),
        () => plugin.app.unregisterWidget(PDFDARK_CONTROLS_WIDGET, WidgetLocation.Popup),
      ]);
    },
  };
}
