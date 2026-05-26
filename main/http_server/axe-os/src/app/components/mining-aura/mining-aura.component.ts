import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject, interval, switchMap, startWith, shareReplay, takeUntil, finalize } from 'rxjs';
import { SystemApiService } from 'src/app/services/system.service';
import { LoadingService } from 'src/app/services/loading.service';
import { SystemInfo as ISystemInfo } from 'src/app/generated/models';

export type AuraState = 'dormant' | 'awakening' | 'mining' | 'blazing' | 'legendary';
export type EfficiencyRating = 'excellent' | 'good' | 'average' | 'poor';

@Component({
  selector: 'app-mining-aura',
  templateUrl: './mining-aura.component.html',
  styleUrls: ['./mining-aura.component.scss']
})
export class MiningAuraComponent implements OnInit, OnDestroy {

  public info$!: Observable<ISystemInfo>;

  private destroy$ = new Subject<void>();

  constructor(
    private systemService: SystemApiService,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.loadingService.loading$.next(true);

    const poll$ = interval(5000).pipe(
      startWith(0),
      takeUntil(this.destroy$)
    );

    this.info$ = poll$.pipe(
      switchMap(() => this.systemService.getInfo().pipe(
        finalize(() => this.loadingService.loading$.next(false))
      )),
      shareReplay({ refCount: true, bufferSize: 1 })
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------------------------------------------------------------------------
  // Aura State
  // ---------------------------------------------------------------------------

  getAuraState(info: ISystemInfo): AuraState {
    if (!info.hashRate || info.hashRate === 0 || info.miningPaused) {
      return 'dormant';
    }
    if (info.hashRate > 700 || info.bestSessionDiff > 5_000_000) {
      return 'legendary';
    }
    if (info.hashRate > 500) {
      return 'blazing';
    }
    if (info.hashRate >= 200) {
      return 'mining';
    }
    return 'awakening';
  }

  getAuraStateLabel(state: AuraState): string {
    switch (state) {
      case 'dormant': return 'Dormant';
      case 'awakening': return 'Awakening';
      case 'mining': return 'Mining';
      case 'blazing': return 'Blazing';
      case 'legendary': return 'Legendary';
    }
  }

  // ---------------------------------------------------------------------------
  // Aura Color
  // ---------------------------------------------------------------------------

  getAuraColor(info: ISystemInfo): string {
    const state = this.getAuraState(info);
    switch (state) {
      case 'dormant':
        return 'radial-gradient(circle, rgba(60,60,60,0.4) 0%, rgba(20,20,20,0.8) 70%)';
      case 'awakening':
        return 'radial-gradient(circle, rgba(34,197,94,0.2) 0%, rgba(20,20,20,0.8) 70%)';
      case 'mining':
        return 'radial-gradient(circle, rgba(34,197,94,0.4) 0%, rgba(20,80,40,0.2) 50%, rgba(20,20,20,0.8) 80%)';
      case 'blazing':
        return 'radial-gradient(circle, rgba(245,158,11,0.45) 0%, rgba(239,68,68,0.2) 50%, rgba(20,20,20,0.8) 80%)';
      case 'legendary':
        return 'radial-gradient(circle, rgba(255,215,0,0.5) 0%, rgba(168,85,247,0.3) 40%, rgba(255,215,0,0.1) 70%, rgba(20,20,20,0.9) 100%)';
    }
  }

  // ---------------------------------------------------------------------------
  // Aura Intensity (0-100)
  // ---------------------------------------------------------------------------

  getAuraIntensity(info: ISystemInfo): number {
    if (!info.hashRate || info.hashRate === 0) return 0;
    const expected = info.expectedHashrate || 500;
    const ratio = info.hashRate / expected;
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }

  // ---------------------------------------------------------------------------
  // Performance Score (0-100)
  // ---------------------------------------------------------------------------

  getPerformanceScore(info: ISystemInfo): number {
    if (!info.hashRate || info.hashRate === 0) return 0;

    // Hashrate component (0-40 points) — use 10m average to prevent flicker
    const expected = info.expectedHashrate || 500;
    const smoothedHashRate = (info as any).hashRate_10m || info.hashRate;
    const hrScore = Math.min(40, (smoothedHashRate / expected) * 40);

    // Efficiency component (0-30 points)
    const jth = this.getJoulesPerTerahash(info);
    let effScore = 0;
    if (jth > 0 && jth < 100) {
      effScore = Math.max(0, 30 - (jth / 100) * 30);
    }

    // Acceptance rate component (0-30 points)
    const total = info.sharesAccepted + info.sharesRejected;
    let accScore = 30;
    if (total > 0) {
      accScore = (info.sharesAccepted / total) * 30;
    }

    return Math.round(Math.min(100, hrScore + effScore + accScore));
  }

  // ---------------------------------------------------------------------------
  // Efficiency Rating
  // ---------------------------------------------------------------------------

  getEfficiencyRating(info: ISystemInfo): EfficiencyRating {
    const jth = this.getJoulesPerTerahash(info);
    if (jth <= 0) return 'poor';
    if (jth < 15) return 'excellent';
    if (jth < 25) return 'good';
    if (jth < 40) return 'average';
    return 'poor';
  }

  getEfficiencyRatingColor(rating: EfficiencyRating): string {
    switch (rating) {
      case 'excellent': return '#22c55e';
      case 'good': return '#38bdf8';
      case 'average': return '#f59e0b';
      case 'poor': return '#ef4444';
    }
  }

  // ---------------------------------------------------------------------------
  // Hashrate Percentage (actual vs expected)
  // ---------------------------------------------------------------------------

  getHashratePercentage(info: ISystemInfo): number {
    const expected = info.expectedHashrate || 500;
    if (expected <= 0) return 0;
    return Math.round((info.hashRate / expected) * 100);
  }

  // ---------------------------------------------------------------------------
  // Helper methods
  // ---------------------------------------------------------------------------

  private getJoulesPerTerahash(info: ISystemInfo): number {
    const hashRateTh = (info.hashRate ?? 0) / 1000;
    if (hashRateTh <= 0) return 0;
    return info.power / hashRateTh;
  }

  getAcceptanceRate(info: ISystemInfo): number {
    const total = info.sharesAccepted + info.sharesRejected;
    if (total === 0) return 100;
    return (info.sharesAccepted / total) * 100;
  }

  getRejectionRate(info: ISystemInfo): number {
    const total = info.sharesAccepted + info.sharesRejected;
    if (total === 0) return 0;
    return (info.sharesRejected / total) * 100;
  }

  formatUptime(seconds: number): string {
    if (!seconds || seconds <= 0) return 'Just started';
    const intervals: { label: string; seconds: number }[] = [
      { label: 'y', seconds: 31536000 },
      { label: 'mo', seconds: 2592000 },
      { label: 'd', seconds: 86400 },
      { label: 'h', seconds: 3600 },
      { label: 'm', seconds: 60 },
      { label: 's', seconds: 1 }
    ];

    let remaining = Math.floor(seconds);
    const parts: string[] = [];

    for (const interval of intervals) {
      if (parts.length >= 3) break;
      const count = Math.floor(remaining / interval.seconds);
      if (count > 0) {
        parts.push(`${count}${interval.label}`);
        remaining -= count * interval.seconds;
      }
    }
    return parts.length > 0 ? parts.join(' ') : '< 1s';
  }

  formatDiffSuffix(value: number): string {
    if (value >= 1e12) return (value / 1e12).toFixed(2) + 'T';
    if (value >= 1e9) return (value / 1e9).toFixed(2) + 'G';
    if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
    if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K';
    return value.toFixed(0);
  }

  // ---------------------------------------------------------------------------
  // Aura legend data
  // ---------------------------------------------------------------------------

  auraLegend: { state: AuraState; label: string; threshold: string; color: string }[] = [
    { state: 'dormant', label: 'Dormant', threshold: '0 GH/s or paused', color: '#555' },
    { state: 'awakening', label: 'Awakening', threshold: '< 200 GH/s', color: '#22c55e' },
    { state: 'mining', label: 'Mining', threshold: '200 - 500 GH/s', color: '#4ade80' },
    { state: 'blazing', label: 'Blazing', threshold: '500 - 700 GH/s', color: '#f59e0b' },
    { state: 'legendary', label: 'Legendary', threshold: '> 700 GH/s or best diff > 5M', color: '#ffd700' },
  ];
}
