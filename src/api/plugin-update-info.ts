export interface PluginUpdateDisplay {
  label: string;
  title: string;
}

// Only the updater's confirmed record is evidence; runtime/build times are not.
export function formatPluginUpdateInfo(
  data: unknown,
  loadedVersion: string,
  now = Date.now()
): PluginUpdateDisplay {
  const unknown = {
    label: 'Tarih kaydı yok',
    title: `Son eklenti güncellemesi: Tarih kaydı yok · v${loadedVersion} · Europe/Istanbul`,
  };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return unknown;
  const record = data as Record<string, unknown>;
  if (record.verified !== true || record.version !== loadedVersion || typeof record.updatedAt !== 'string') {
    return unknown;
  }
  const utc = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(record.updatedAt);
  if (!utc) return unknown;
  const updated = new Date(record.updatedAt);
  const timestamp = updated.getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(now) || timestamp > now) return unknown;
  // Preserve the future boundary when .NET emits sub-millisecond precision.
  if (timestamp === now && /[1-9]/.test((utc[2] || '').slice(3))) return unknown;
  // Date.parse normalizes impossible dates (e.g. February 30); reject those.
  const canonical = `${utc[1]}.${(utc[2] || '').padEnd(3, '0').slice(0, 3)}Z`;
  if (updated.toISOString() !== canonical) return unknown;
  const label = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(updated);
  return {
    label,
    title: `Son eklenti güncellemesi: ${label} · Europe/Istanbul · v${loadedVersion} · UTC: ${record.updatedAt}`,
  };
}

export async function fetchPluginUpdateInfo(
  loadedVersion: string,
  fetcher: typeof fetch = fetch,
  now = Date.now()
): Promise<PluginUpdateDisplay> {
  try {
    const response = await fetcher(
      `http://127.0.0.1:8080/plugin-update-${loadedVersion}.json`,
      { cache: 'no-store' }
    );
    return formatPluginUpdateInfo(response.ok ? await response.json() : null, loadedVersion, now);
  } catch {
    return formatPluginUpdateInfo(null, loadedVersion, now);
  }
}
