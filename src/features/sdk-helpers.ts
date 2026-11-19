import type { ReactRNPlugin } from '@remnote/plugin-sdk';

type CommandArgs = Parameters<ReactRNPlugin['app']['registerCommand']>[0];

function isDuplicateRegistration(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate|already|registered/i.test(message);
}

/**
 * SDK 0.0.46'da komut kaydını silen çağrı (unregisterCommand) YOK. Bu yüzden bölüm
 * kapatıldığında komut yeniden yüklemeye kadar listede kalır; eylem `isOn()` ile korunur
 * ve kapalı bölümde yalnız kısa bir uyarı gösterir. Aynı kimliğin ikinci kaydı yok sayılır.
 */
export async function registerGuardedCommand(
  plugin: ReactRNPlugin,
  command: CommandArgs,
  isOn: () => boolean,
  offMessage: string,
): Promise<void> {
  const original = command.action;
  const guarded: CommandArgs = {
    ...command,
    action: async (...args: unknown[]) => {
      if (!isOn()) {
        await plugin.app.toast(offMessage);
        return;
      }
      if (typeof original === 'function') await (original as (...a: unknown[]) => unknown)(...args);
    },
  };
  try {
    await plugin.app.registerCommand(guarded);
  } catch (error) {
    if (!isDuplicateRegistration(error)) throw error;
  }
}

export async function registerPowerupOnce(
  plugin: ReactRNPlugin,
  powerup: Parameters<ReactRNPlugin['app']['registerPowerup']>[0],
): Promise<void> {
  try {
    await plugin.app.registerPowerup(powerup);
  } catch (error) {
    if (!isDuplicateRegistration(error) && !String((error as Error)?.message || error).includes('_power-up')) throw error;
  }
}

/** Kapatma sırasında tek tek dener; birinin hatası diğerlerini durdurmaz. */
export async function quietly(steps: Array<() => Promise<unknown>>): Promise<void> {
  for (const step of steps) {
    try {
      await step();
    } catch {
      // RemNote hiç kaydedilmemiş bir şeyi kaldırırken hata atabilir; yok sayılır.
    }
  }
}
