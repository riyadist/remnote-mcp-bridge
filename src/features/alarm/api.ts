// Todo Alarm yerel servis istemcisi (RemNote_Alarm 0.2.4 alarm_api.mjs'den TS'e taşındı).
// Eski eklenti 8084'ten servis edildiği için göreli adres ('/api/...') kullanıyordu; birleşik
// eklenti başka adresten yüklendiği için adres mutlak yazılır.
// UYARI (2026-11-19, kaynak okuması): 8084 sunucusu (server.cjs) yalnız Origin
// yok/'null'/8084 kabul ediyor, API yanıtlarına CORS başlığı koymuyor ve OPTIONS ön isteğine
// cevap vermiyor. Sunucu değişmeden bu istekler birleşik eklentiden büyük olasılıkla engellenir.
export const ALARM_HOST = 'http://127.0.0.1:8084';

export function alarmUrl(path: string): string {
  return `${ALARM_HOST}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function authenticatedAlarmFetch(
  fetcher: typeof fetch,
  path: string,
  options: RequestInit,
  token: string,
  onTokenRefresh?: (token: string) => void,
): Promise<Response> {
  let currentToken = token;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetcher(alarmUrl(path), {
      ...options,
      cache: 'no-store',
      headers: { ...(options?.headers as Record<string, string> | undefined), 'X-RemNote-Alarm-Token': currentToken },
    });
    if (response.status !== 403 || attempt === 1) return response;

    const session = await fetcher(alarmUrl('/api/session'), { cache: 'no-store' });
    if (!session.ok) throw new Error('Yerel alarm servisine yeniden bağlanılamadı.');
    const data = await session.json();
    if (!/^[a-f0-9]{64}$/.test(data?.token || '')) throw new Error('Yerel alarm oturumu geçersiz.');
    currentToken = data.token;
    onTokenRefresh?.(currentToken);
  }
  throw new Error('Yerel alarm isteği tamamlanamadı.');
}
