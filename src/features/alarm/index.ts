// Todo Alarm bölümü (RemNote_Alarm 0.2.4 index.tsx'ten taşındı). Yalnız bilgisayarda.
// Taşınmayanlar (bilerek):
// - Satır içi zil (inline bell) mesaj dinleyicisi: zili 8084 sunucusunun CDP betiği
//   (inline_marker.cjs) çiziyor ve yalnız src'si "localhost:8084 ... remnote-todo-alarm" olan
//   iframe'e mesaj atıyor; birleşik eklentinin iframe'ini bulamaz.
// - Eski 'bell' (RightSideOfEditor) widget temizliği: o kayıt eski eklenti kimliğine ait.
import { WidgetLocation, type ReactRNPlugin } from '@remnote/plugin-sdk';
import type { FeatureRuntime } from '../registry';
import { quietly, registerGuardedCommand } from '../sdk-helpers';

export const ALARM_POPUP_WIDGET = 'alarm_popup';
export const ALARM_SLASH_ICON_CSS_ID = 'alarm_slash_icon';
const ALARM_BELL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>';
const ALARM_BELL_URL = `data:image/svg+xml,${encodeURIComponent(ALARM_BELL_SVG)}`;

export function createAlarmFeature(plugin: ReactRNPlugin): FeatureRuntime {
  let on = false;
  return {
    id: 'alarm',
    async activate() {
      on = true;
      await plugin.app.registerCSS(
        ALARM_SLASH_ICON_CSS_ID,
        `
    [data-command-name="Todo Alarm"] [data-icon="extension"] {
      -webkit-mask-image: url("${ALARM_BELL_URL}") !important;
      mask-image: url("${ALARM_BELL_URL}") !important;
      -webkit-mask-size: contain !important;
      mask-size: contain !important;
    }
  `,
      );
      await plugin.app.registerWidget(ALARM_POPUP_WIDGET, WidgetLocation.Popup, {
        dimensions: { width: 560, height: 500 },
      });
      await registerGuardedCommand(
        plugin,
        {
          id: 'alarm_open',
          name: 'Todo Alarm',
          description: 'Open alarm settings for the focused existing Todo.',
          keywords: 'toalarm alarm reminder hatirlat todo',
          quickCode: 'toalarm',
          action: async () => {
            try {
              const rem = await plugin.focus.getFocusedRem();
              if (!rem || !(await rem.isTodo())) {
                await plugin.app.toast('Önce mevcut bir Todo satırına odaklan; /toalarm normal Rem’i değiştirmez.');
                return;
              }
              await plugin.widget.openPopup(ALARM_POPUP_WIDGET, { remId: rem._id });
            } catch (error) {
              console.error('[Todo Alarm] /toalarm failed', error);
              await plugin.app.toast('Alarm penceresi açılamadı.');
            }
          },
        },
        () => on,
        'Todo Alarm bölümü kapalı. Ayarlardan açabilirsiniz.',
      );
    },
    async deactivate() {
      on = false;
      await quietly([
        () => plugin.app.registerCSS(ALARM_SLASH_ICON_CSS_ID, ''),
        () => plugin.app.unregisterWidget(ALARM_POPUP_WIDGET, WidgetLocation.Popup),
      ]);
    },
  };
}
