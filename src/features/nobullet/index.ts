// No Bullet Editor Mode (Y fork 0.7.53) bölümü. Yalnız görünüm: CSS + iki powerup + iki komut.
// Taşınmayanlar (bilerek):
// - `/__no_bullet_y_log` yerel günlük gönderimi: 8082 sunucusuna aitti; birleşik eklentide yok.
// - window.localStorage CSS önbelleği: CSS artık pakete gömülü, önbelleğe gerek yok.
// - CDP tıklama işleyicisi (scripts/inject_no_bullet_y_click_handler.cjs): eklentinin parçası
//   değil, ayrı bir masaüstü betiği; README'ye göre artık yalnız tanı işareti kuruyor.
import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import type { FeatureRuntime } from '../registry';
import { quietly, registerGuardedCommand, registerPowerupOnce } from '../sdk-helpers';
import { NOBULLET_CSS } from './snippet';

export const NOBULLET_CSS_ID = 'nobullet_css';
export const NOBULLET_PADDING_CSS_ID = 'nobullet_padding';
export const NOBULLET_PADDING_SETTING = 'nobullet_padding';
export const NOBULLET_BULLETLIST = 'nobullet_bulletlist';
export const NOBULLET_BULLETLISTS = 'nobullet_bulletlists';

export function paddingCss(raw: unknown): string {
  const value = Number(raw);
  const px = Number.isFinite(value) && value >= 0 && value <= 200 ? value : 0;
  return `
  .hierarchy-editor--ltr #document .rn-editor-container .TreeNode,
  .hierarchy-editor--ltr #document .rn-editor-container .TreeNode--list {
    padding-left: ${px}px !important;
  }
  #document .node-card-item::before {
    margin-left: -${px}px !important;
  }`;
}

export async function registerNoBulletSettings(plugin: ReactRNPlugin): Promise<void> {
  await plugin.settings.registerStringSetting({
    id: NOBULLET_PADDING_SETTING,
    title: 'No Bullet: ağaç girintisi (px) / Space between tree nodes (px)',
    description: 'No Bullet bölümü açıkken girinti genişliği. / Indent width while No Bullet is on.',
    defaultValue: '0',
  });
}

export function createNoBulletFeature(plugin: ReactRNPlugin): FeatureRuntime {
  let on = false;
  let stopPadding: (() => void) | null = null;

  return {
    id: 'nobullet',
    async activate() {
      on = true;
      await plugin.app.registerCSS(NOBULLET_CSS_ID, NOBULLET_CSS);
      // Eski No Bullet ile aynı yol: plugin.track ayar değişince girinti CSS'ini yeniden yazar.
      stopPadding = plugin.track(async (reactive) => {
        const value = await reactive.settings.getSetting<string>(NOBULLET_PADDING_SETTING);
        if (on) await reactive.app.registerCSS(NOBULLET_PADDING_CSS_ID, paddingCss(value));
      });

      await registerPowerupOnce(plugin, {
        name: 'Bulletlist',
        code: NOBULLET_BULLETLIST,
        description: 'A Power-up Block for making bullet',
        options: { slots: [] },
      });
      await registerPowerupOnce(plugin, {
        name: 'Bulletlists',
        code: NOBULLET_BULLETLISTS,
        description: 'A Power-up Block for making bullets',
        options: { slots: [] },
      });
      const off = 'No Bullet bölümü kapalı. Ayarlardan açabilirsiniz.';
      await registerGuardedCommand(plugin, {
        id: 'nobullet_bulletlist',
        name: 'Bulletlist',
        quickCode: 'bl',
        keyboardShortcut: 'cmd+opt+b',
        description: 'Make a bullet',
        action: async () => {
          const rem = await plugin.focus.getFocusedRem();
          await rem?.addPowerup(NOBULLET_BULLETLIST);
        },
      }, () => on, off);
      await registerGuardedCommand(plugin, {
        id: 'nobullet_bulletlists',
        name: 'Bulletlists',
        quickCode: 'bls',
        keyboardShortcut: 'cmd+opt+ctrl+b',
        description: 'Make bullets',
        action: async () => {
          const rem = await plugin.focus.getFocusedRem();
          await rem?.addPowerup(NOBULLET_BULLETLISTS);
        },
      }, () => on, off);
    },
    async deactivate() {
      on = false;
      stopPadding?.();
      stopPadding = null;
      await quietly([
        () => plugin.app.registerCSS(NOBULLET_CSS_ID, ''),
        () => plugin.app.registerCSS(NOBULLET_PADDING_CSS_ID, ''),
      ]);
    },
  };
}
