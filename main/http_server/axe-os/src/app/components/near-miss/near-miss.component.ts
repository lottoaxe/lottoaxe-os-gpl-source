import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject, interval, switchMap, startWith, shareReplay, takeUntil, finalize } from 'rxjs';
import { SystemApiService } from 'src/app/services/system.service';
import { LoadingService } from 'src/app/services/loading.service';
import { SystemInfo as ISystemInfo } from 'src/app/generated/models';

const TWO_POW_32 = 4294967296;
const STORAGE_KEY = 'LA_NEAR_MISS_HISTORY';

interface NearMissEntry {
  timestamp: number;
  shareDiff: number;
  networkDiff: number;
  percentage: number; // shareDiff / networkDiff * 100
  hashRate: number;
  temp: number;
  frequency: number;
}

@Component({
  selector: 'app-near-miss',
  templateUrl: './near-miss.component.html',
  styleUrls: ['./near-miss.component.scss']
})
export class NearMissComponent implements OnInit, OnDestroy {

  public info$!: Observable<ISystemInfo>;
  private destroy$ = new Subject<void>();

  // Near miss history
  public nearMisses: NearMissEntry[] = [];
  public allTimeClosest: NearMissEntry | null = null;
  public sessionClosest: NearMissEntry | null = null;

  // Live tracking
  private lastBestDiff = 0;
  private lastBestSessionDiff = 0;

  // Bullseye ring data (concentric rings representing closeness)
  public bullseyeRings = [
    { label: 'BLOCK FOUND', threshold: 100, color: '#FFD700' },
    { label: '> 10%', threshold: 10, color: '#8DFF00' },
    { label: '> 1%', threshold: 1, color: '#00C8FF' },
    { label: '> 0.1%', threshold: 0.1, color: '#A855F7' },
    { label: '> 0.01%', threshold: 0.01, color: '#F59E0B' },
    { label: '> 0.001%', threshold: 0.001, color: '#EF4444' },
  ];

  // Stats
  public totalSharesTracked = 0;
  public averageCloseness = 0;

  constructor(
    private systemService: SystemApiService,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.loadHistory();
    this.loadingService.loading$.next(true);

    const poll$ = interval(3000).pipe(
      startWith(0),
      takeUntil(this.destroy$)
    );

    this.info$ = poll$.pipe(
      switchMap(() => this.systemService.getInfo().pipe(
        finalize(() => this.loadingService.loading$.next(false))
      )),
      shareReplay({ refCount: true, bufferSize: 1 })
    );

    this.info$.pipe(takeUntil(this.destroy$)).subscribe(info => {
      this.checkForNewBest(info);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkForNewBest(info: ISystemInfo): void {
    // Detect new best session diff (means a new best share was found)
    if (info.bestSessionDiff > 0 && info.bestSessionDiff !== this.lastBestSessionDiff) {
      if (this.lastBestSessionDiff > 0) {
        // New best share detected
        this.recordNearMiss(info, info.bestSessionDiff);
      }
      this.lastBestSessionDiff = info.bestSessionDiff;
    }

    // Also detect all-time best updates
    if (info.bestDiff > 0 && info.bestDiff !== this.lastBestDiff) {
      this.lastBestDiff = info.bestDiff;
    }

    // Update session closest from current data
    if (info.bestSessionDiff > 0 && info.networkDifficulty > 0) {
      const pct = (info.bestSessionDiff / info.networkDifficulty) * 100;
      this.sessionClosest = {
        timestamp: Date.now(),
        shareDiff: info.bestSessionDiff,
        networkDiff: info.networkDifficulty,
        percentage: pct,
        hashRate: info.hashRate,
        temp: info.temp,
        frequency: info.frequency
      };
    }
  }

  private recordNearMiss(info: ISystemInfo, shareDiff: number): void {
    if (!info.networkDifficulty || info.networkDifficulty === 0) return;

    const entry: NearMissEntry = {
      timestamp: Date.now(),
      shareDiff: shareDiff,
      networkDiff: info.networkDifficulty,
      percentage: (shareDiff / info.networkDifficulty) * 100,
      hashRate: info.hashRate,
      temp: info.temp,
      frequency: info.frequency
    };

    this.nearMisses.unshift(entry);
    if (this.nearMisses.length > 200) {
      this.nearMisses = this.nearMisses.slice(0, 200);
    }

    // Update all-time closest
    if (!this.allTimeClosest || entry.percentage > this.allTimeClosest.percentage) {
      this.allTimeClosest = entry;
    }

    this.updateStats();
    this.saveHistory();
  }

  private updateStats(): void {
    this.totalSharesTracked = this.nearMisses.length;
    if (this.nearMisses.length > 0) {
      const sum = this.nearMisses.reduce((acc, e) => acc + e.percentage, 0);
      this.averageCloseness = sum / this.nearMisses.length;
    }
  }

  // ── Bullseye calculations ──

  getBullseyeZone(info: ISystemInfo): number {
    const pct = this.getClosestPct(info);
    for (let i = 0; i < this.bullseyeRings.length; i++) {
      if (pct >= this.bullseyeRings[i].threshold) return i;
    }
    return this.bullseyeRings.length;
  }

  getBullseyeColor(info: ISystemInfo): string {
    const zone = this.getBullseyeZone(info);
    if (zone < this.bullseyeRings.length) return this.bullseyeRings[zone].color;
    return '#333';
  }

  getBullseyeLabel(info: ISystemInfo): string {
    const zone = this.getBullseyeZone(info);
    if (zone < this.bullseyeRings.length) return this.bullseyeRings[zone].label;
    return 'Searching...';
  }

  // ── Display calculations ──

  getClosestPct(info: ISystemInfo): number {
    if (!info.networkDifficulty || info.networkDifficulty === 0 || !info.bestDiff) return 0;
    return (info.bestDiff / info.networkDifficulty) * 100;
  }

  getClosestPctDisplay(info: ISystemInfo): string {
    const pct = this.getClosestPct(info);
    if (pct === 0) return '0';
    if (pct >= 100) return '100';
    if (pct >= 1) return pct.toFixed(4);
    if (pct >= 0.001) return pct.toFixed(6);
    if (pct >= 0.000001) return pct.toFixed(9);
    return pct.toExponential(3);
  }

  getSessionClosestPct(info: ISystemInfo): number {
    if (!info.networkDifficulty || info.networkDifficulty === 0 || !info.bestSessionDiff) return 0;
    return (info.bestSessionDiff / info.networkDifficulty) * 100;
  }

  getSessionClosestPctDisplay(info: ISystemInfo): string {
    const pct = this.getSessionClosestPct(info);
    if (pct === 0) return '0';
    if (pct >= 1) return pct.toFixed(4);
    if (pct >= 0.001) return pct.toFixed(6);
    return pct.toExponential(3);
  }

  getDistanceMultiple(info: ISystemInfo): string {
    if (!info.networkDifficulty || !info.bestDiff || info.bestDiff === 0) return 'N/A';
    const multiple = info.networkDifficulty / info.bestDiff;
    if (multiple < 1) return 'BLOCK!';
    if (multiple < 1000) return multiple.toFixed(1) + 'x away';
    if (multiple < 1000000) return (multiple / 1000).toFixed(1) + 'K x away';
    if (multiple < 1e9) return (multiple / 1e6).toFixed(1) + 'M x away';
    return (multiple / 1e9).toFixed(1) + 'B x away';
  }

  // SVG bullseye dot position (0-100 scale, center = hit block)
  getBullseyeDotPosition(info: ISystemInfo): number {
    const pct = this.getClosestPct(info);
    if (pct <= 0) return 95;
    if (pct >= 100) return 5;
    // Log scale: map tiny percentages to outer rings, high to center
    const logVal = Math.log10(pct);
    // pct range: 1e-12 to 100 => logVal: -12 to 2, range = 14
    const normalized = (logVal + 12) / 14; // 0 to 1
    return 95 - (normalized * 90); // 95 (outer) to 5 (center)
  }

  formatDiff(diff: number): string {
    if (!diff) return '0';
    if (diff >= 1e15) return (diff / 1e15).toFixed(2) + ' P';
    if (diff >= 1e12) return (diff / 1e12).toFixed(2) + ' T';
    if (diff >= 1e9) return (diff / 1e9).toFixed(2) + ' G';
    if (diff >= 1e6) return (diff / 1e6).toFixed(2) + ' M';
    if (diff >= 1e3) return (diff / 1e3).toFixed(2) + ' K';
    return diff.toFixed(0);
  }

  formatPct(pct: number): string {
    if (pct === 0) return '0%';
    if (pct >= 1) return pct.toFixed(4) + '%';
    if (pct >= 0.001) return pct.toFixed(6) + '%';
    return pct.toExponential(2) + '%';
  }

  getEntryAge(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return seconds + 's ago';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  }

  getBarWidth(entry: NearMissEntry): number {
    if (!this.nearMisses.length) return 0;
    const maxPct = Math.max(...this.nearMisses.map(e => e.percentage));
    if (maxPct === 0) return 0;
    return Math.max(2, (entry.percentage / maxPct) * 100);
  }

  getBarColor(pct: number): string {
    if (pct >= 10) return '#FFD700';
    if (pct >= 1) return '#8DFF00';
    if (pct >= 0.1) return '#00C8FF';
    if (pct >= 0.01) return '#A855F7';
    if (pct >= 0.001) return '#F59E0B';
    return '#EF4444';
  }

  // ── Persistence ──

  private loadHistory(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.nearMisses = parsed.entries || [];
        this.allTimeClosest = parsed.allTimeClosest || null;
        this.updateStats();
      }
    } catch {}
  }

  private saveHistory(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        entries: this.nearMisses,
        allTimeClosest: this.allTimeClosest
      }));
    } catch {}
  }

  clearHistory(): void {
    this.nearMisses = [];
    this.allTimeClosest = null;
    this.sessionClosest = null;
    this.totalSharesTracked = 0;
    this.averageCloseness = 0;
    localStorage.removeItem(STORAGE_KEY);
  }
}
