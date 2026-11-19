// Telefon algılama. Önce SDK'nın resmi çağrısı (plugin.app.getOperatingSystem,
// SDK 0.0.46: 'mac' | 'windows' | 'linux' | 'ios' | 'android'); çağrı başarısızsa
// tarayıcının kimlik dizgisi (userAgent). Ağ çağrısı yapmaz.

export function isMobileOperatingSystem(os: unknown): boolean {
  return os === 'android' || os === 'ios';
}

export function isMobileUserAgent(userAgent: unknown): boolean {
  return typeof userAgent === 'string' && /Android|iPhone|iPad|iPod/i.test(userAgent);
}

export function decideMobile(os: unknown, userAgent: unknown): boolean {
  if (typeof os === 'string' && os) return isMobileOperatingSystem(os);
  return isMobileUserAgent(userAgent);
}

interface OsSource {
  app: { getOperatingSystem: () => Promise<unknown> };
}

let cached: Promise<boolean> | null = null;

export function detectMobile(plugin: OsSource): Promise<boolean> {
  if (!cached) {
    cached = (async () => {
      let os: unknown;
      try {
        os = await plugin.app.getOperatingSystem();
      } catch {
        os = undefined;
      }
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      return decideMobile(os, userAgent);
    })();
  }
  return cached;
}
