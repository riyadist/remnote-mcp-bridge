// Bölüm kayıt sistemi: hangi bölümün açık olması gerektiğine karar verir ve
// etkinleştirme/kapatmayı sırayla, bir kez yapar. SDK'ya bağlı DEĞİL; ayar okuma
// ve bölüm çalıştırıcıları dışarıdan verilir (testler sahte nesnelerle yükler).
import { FEATURES, featureSettingId, type FeatureId, type FeatureMeta } from './catalog';

export interface FeatureRuntime {
  id: FeatureId;
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
}

export interface FeatureDecision {
  id: FeatureId;
  enabledSetting: boolean;
  /** Bölüm şu cihazda gerçekten çalışmalı mı. */
  run: boolean;
  /** Ayar açık ama cihaz telefon ve bölüm yalnız bilgisayarda. */
  skippedOnMobile: boolean;
}

/** Ayardan gelen değeri boolean'a çevirir; ayar hiç kaydedilmemişse varsayılanı kullanır. */
export function resolveEnabled(meta: FeatureMeta, raw: unknown): boolean {
  return typeof raw === 'boolean' ? raw : meta.defaultOn;
}

export function decide(meta: FeatureMeta, raw: unknown, isMobile: boolean): FeatureDecision {
  const enabledSetting = resolveEnabled(meta, raw);
  const skippedOnMobile = enabledSetting && isMobile && meta.desktopOnly;
  return { id: meta.id, enabledSetting, run: enabledSetting && !skippedOnMobile, skippedOnMobile };
}

export interface ControllerOptions {
  isMobile: boolean;
  getSetting: (settingId: string) => Promise<unknown>;
  log?: (message: string, level?: 'info' | 'warn' | 'error') => void;
  features?: FeatureMeta[];
}

export class FeatureController {
  private readonly runtimes = new Map<FeatureId, FeatureRuntime>();
  private readonly active = new Set<FeatureId>();
  private chain: Promise<void> = Promise.resolve();
  private firstSyncDone = false;
  private readonly features: FeatureMeta[];

  constructor(runtimes: FeatureRuntime[], private readonly options: ControllerOptions) {
    for (const runtime of runtimes) this.runtimes.set(runtime.id, runtime);
    this.features = options.features ?? FEATURES;
  }

  isActive(id: FeatureId): boolean {
    return this.active.has(id);
  }

  activeIds(): FeatureId[] {
    return this.features.map((feature) => feature.id).filter((id) => this.active.has(id));
  }

  /** Bütün bölümleri ayarlara göre eşitler. Çağrılar sıraya girer; aynı anda iki eşitleme olmaz. */
  sync(): Promise<FeatureDecision[]> {
    const run = this.chain.then(() => this.syncNow());
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Eklenti kapanırken: açık bölümleri ters sırayla kapatır. */
  stopAll(): Promise<void> {
    const run = this.chain.then(async () => {
      for (const id of [...this.activeIds()].reverse()) await this.deactivate(id);
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async syncNow(): Promise<FeatureDecision[]> {
    const decisions: FeatureDecision[] = [];
    for (const meta of this.features) {
      let raw: unknown;
      try {
        raw = await this.options.getSetting(featureSettingId(meta.id));
      } catch {
        raw = undefined;
      }
      const decision = decide(meta, raw, this.options.isMobile);
      decisions.push(decision);
      if (decision.skippedOnMobile) {
        // Telefonda sessiz: kullanıcıya hata/tost gösterilmez, yalnız bilgi kaydı.
        this.options.log?.(`[Bölümler] ${meta.id}: yalnız bilgisayarda; telefonda başlatılmadı`, 'info');
      }
      if (decision.run && !this.active.has(meta.id)) await this.activate(meta.id);
      else if (!decision.run && this.active.has(meta.id)) await this.deactivate(meta.id);
      else if (!decision.run && !this.firstSyncDone) await this.cleanupStale(meta.id);
    }
    this.firstSyncDone = true;
    return decisions;
  }

  private async activate(id: FeatureId): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    try {
      await runtime.activate();
      this.active.add(id);
      this.options.log?.(`[Bölümler] ${id} açıldı`, 'info');
    } catch (error) {
      this.options.log?.(`[Bölümler] ${id} açılamadı: ${errorText(error)}`, 'error');
      // Yarım kalan kayıtları temizlemeyi dene; hata yutulur.
      try {
        await runtime.deactivate();
      } catch {
        // yok sayılır
      }
    }
  }

  /**
   * İlk eşitlemede kapalı bölümün kapatma adımı bir kez çalışır. Neden: RemNote, kaynak artık
   * kaydetmese de eski sürümün widget kayıtlarını tutabiliyor (Öğren Pane kaydı ve Alarm "bell"
   * artığı, 2026-11). Böylece önceki sürümde açık olan ama artık varsayılan kapalı bölümler ekranda
   * kalmaz. Kapatma adımları hata yutarak ilerler; ağ isteği atmaz.
   */
  private async cleanupStale(id: FeatureId): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    try {
      await runtime.deactivate();
    } catch {
      // yok sayılır
    }
  }

  private async deactivate(id: FeatureId): Promise<void> {
    const runtime = this.runtimes.get(id);
    this.active.delete(id);
    if (!runtime) return;
    try {
      await runtime.deactivate();
      this.options.log?.(`[Bölümler] ${id} kapatıldı`, 'info');
    } catch (error) {
      this.options.log?.(`[Bölümler] ${id} kapatılırken hata: ${errorText(error)}`, 'warn');
    }
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
