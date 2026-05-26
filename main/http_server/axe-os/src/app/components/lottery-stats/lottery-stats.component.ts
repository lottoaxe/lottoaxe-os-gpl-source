import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject, interval, switchMap, startWith, shareReplay, takeUntil, map, combineLatest, finalize } from 'rxjs';
import { SystemApiService } from 'src/app/services/system.service';
import { LoadingService } from 'src/app/services/loading.service';
import { SystemInfo as ISystemInfo, SystemScoreboardEntry } from 'src/app/generated/models';

/** 2^32 as a constant for probability calculations. */
const TWO_POW_32 = 4294967296;

@Component({
  selector: 'app-lottery-stats',
  templateUrl: './lottery-stats.component.html',
  styleUrls: ['./lottery-stats.component.scss']
})
export class LotteryStatsComponent implements OnInit, OnDestroy {

  public info$!: Observable<ISystemInfo>;
  public scoreboard$!: Observable<SystemScoreboardEntry[]>;

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

    this.scoreboard$ = poll$.pipe(
      switchMap(() => this.systemService.getScoreboard()),
      shareReplay({ refCount: true, bufferSize: 1 })
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------------------------------------------------------------------------
  // Probability & Time Calculations
  // ---------------------------------------------------------------------------

  /**
   * Per-second probability of finding a block.
   * P = hashrate_H_per_s / (networkDifficulty * 2^32)
   * hashRate is reported in GH/s, so multiply by 1e9 to get H/s.
   */
  private getProbabilityPerSecond(info: ISystemInfo): number {
    if (!info.networkDifficulty || info.networkDifficulty === 0 || !info.hashRate || info.hashRate === 0) {
      return 0;
    }
    const hashrateHps = info.hashRate * 1e9;
    return hashrateHps / (info.networkDifficulty * TWO_POW_32);
  }

  /**
   * Expected seconds until a block is found (statistical average).
   */
  private getExpectedSecondsToBlock(info: ISystemInfo): number {
    const p = this.getProbabilityPerSecond(info);
    if (p === 0) return Infinity;
    return 1 / p;
  }

  /**
   * Returns a human-readable string for the expected time to find a block.
   */
  getExpectedTimeToBlock(info: ISystemInfo): string {
    const totalSeconds = this.getExpectedSecondsToBlock(info);
    if (!isFinite(totalSeconds)) return 'N/A';
    return this.formatDuration(totalSeconds);
  }

  /**
   * Returns the "1 in X" odds of finding a block within 24 hours.
   * Uses the approximation: P_24h = 1 - e^(-86400 * P_per_second)
   */
  getOddsToday(info: ISystemInfo): string {
    const pPerSecond = this.getProbabilityPerSecond(info);
    if (pPerSecond === 0) return 'N/A';

    const pDay = 1 - Math.exp(-86400 * pPerSecond);
    if (pDay === 0) return 'N/A';

    const oneInX = Math.round(1 / pDay);
    return '1 in ' + this.formatLargeNumber(oneInX);
  }

  /**
   * Returns the raw daily probability as a number (0-1) for template display.
   */
  getOddsTodayRaw(info: ISystemInfo): number {
    const pPerSecond = this.getProbabilityPerSecond(info);
    if (pPerSecond === 0) return 0;
    return 1 - Math.exp(-86400 * pPerSecond);
  }

  // ---------------------------------------------------------------------------
  // Luck Meter
  // ---------------------------------------------------------------------------

  /**
   * bestDiff / networkDifficulty * 100 — how close the best share has come
   * to meeting network difficulty, expressed as a percentage.
   */
  getLuckPercentage(info: ISystemInfo): number {
    if (!info.networkDifficulty || info.networkDifficulty === 0) return 0;
    return (info.bestDiff / info.networkDifficulty) * 100;
  }

  /**
   * Returns the luck percentage formatted for display (significant digits).
   */
  getLuckPercentageDisplay(info: ISystemInfo): string {
    const pct = this.getLuckPercentage(info);
    if (pct === 0) return '0';
    if (pct < 0.0001) return pct.toExponential(2);
    if (pct < 1) return pct.toPrecision(3);
    return pct.toFixed(2);
  }

  /**
   * Returns a clamped 0-100 value for the luck meter progress bar.
   * We use a log scale so tiny percentages still show visible progress.
   */
  getLuckMeterValue(info: ISystemInfo): number {
    const pct = this.getLuckPercentage(info);
    if (pct <= 0) return 0;
    if (pct >= 100) return 100;
    // Log scale: map [1e-12, 100] -> [0, 100]
    // log10(1e-12) = -12, log10(100) = 2 => range of 14
    const logVal = Math.log10(pct);
    const mapped = ((logVal + 12) / 14) * 100;
    return Math.max(0, Math.min(100, mapped));
  }

  /**
   * Returns CSS color for the luck meter based on the log-scaled value.
   */
  getLuckMeterColor(info: ISystemInfo): string {
    const val = this.getLuckMeterValue(info);
    if (val < 25) return '#ef4444';       // red
    if (val < 50) return '#f59e0b';       // amber
    if (val < 75) return '#eab308';       // yellow
    return '#22c55e';                      // green
  }

  // ---------------------------------------------------------------------------
  // Network & Share Stats
  // ---------------------------------------------------------------------------

  /**
   * This device's hashrate as a percentage of estimated total network hashrate.
   * Network hashrate ~ networkDifficulty * 2^32 / 600 (H/s), where 600 is
   * the target block interval in seconds.
   */
  getNetworkSharePercentage(info: ISystemInfo): string {
    if (!info.networkDifficulty || info.networkDifficulty === 0 || !info.hashRate || info.hashRate === 0) {
      return '0';
    }
    const networkHashrateHps = (info.networkDifficulty * TWO_POW_32) / 600;
    const deviceHashrateHps = info.hashRate * 1e9;
    const pct = (deviceHashrateHps / networkHashrateHps) * 100;

    if (pct < 1e-15) return pct.toExponential(2);
    return pct.toExponential(3);
  }

  /**
   * Acceptance rate: accepted / (accepted + rejected) * 100.
   */
  getAcceptanceRate(info: ISystemInfo): number {
    const total = info.sharesAccepted + info.sharesRejected;
    if (total === 0) return 100;
    return (info.sharesAccepted / total) * 100;
  }

  /**
   * Closest share as a percentage of network difficulty (bestDiff / networkDiff * 100).
   */
  getClosestSharePct(info: ISystemInfo): string {
    if (!info.networkDifficulty || info.networkDifficulty === 0) return '0';
    const pct = (info.bestDiff / info.networkDifficulty) * 100;
    if (pct < 0.0001) return pct.toExponential(2);
    if (pct < 10) return pct.toPrecision(3);
    return pct.toFixed(1);
  }

  // ---------------------------------------------------------------------------
  // Luck Percentile
  // ---------------------------------------------------------------------------

  /**
   * Rough luck percentile based on shares submitted vs statistical expectation.
   * Uses the pool difficulty and shares accepted to estimate how much "work"
   * has been done, compared to the best difficulty achieved.
   *
   * A higher bestDiff relative to total work implies better-than-average luck.
   */
  getLuckPercentile(info: ISystemInfo): number {
    if (!info.sharesAccepted || !info.poolDifficulty || !info.bestDiff) return 50;
    const totalWork = info.sharesAccepted * info.poolDifficulty;
    // Expected best diff after N shares at pool diff D is roughly N * D
    // (geometric distribution). Luck ratio:
    const luckRatio = info.bestDiff / totalWork;
    // Convert to a percentile using a simple sigmoid-like mapping
    // luckRatio = 1 means exactly average => 50th percentile
    // luckRatio > 1 means lucky, < 1 means unlucky
    const percentile = 100 / (1 + Math.exp(-2 * Math.log(luckRatio)));
    return Math.max(0, Math.min(100, percentile));
  }

  /**
   * Label for the luck percentile.
   */
  getLuckPercentileLabel(info: ISystemInfo): string {
    const p = this.getLuckPercentile(info);
    if (p >= 90) return 'Incredibly Lucky';
    if (p >= 75) return 'Above Average';
    if (p >= 50) return 'Average';
    if (p >= 25) return 'Below Average';
    return 'Unlucky';
  }

  // ---------------------------------------------------------------------------
  // Formatting Helpers
  // ---------------------------------------------------------------------------

  /**
   * Formats an uptime/duration in seconds to a human-readable string.
   */
  formatUptime(seconds: number): string {
    if (!seconds || seconds <= 0) return 'Just started';
    return this.formatDuration(seconds);
  }

  /**
   * Internal helper to format a duration in seconds to "Xy Xmo Xd Xh Xm Xs".
   */
  private formatDuration(totalSeconds: number): string {
    const intervals: { label: string; seconds: number }[] = [
      { label: 'y',  seconds: 31536000 },
      { label: 'mo', seconds: 2592000 },
      { label: 'd',  seconds: 86400 },
      { label: 'h',  seconds: 3600 },
      { label: 'm',  seconds: 60 },
      { label: 's',  seconds: 1 }
    ];

    let remaining = Math.floor(totalSeconds);
    const parts: string[] = [];

    for (const interval of intervals) {
      if (parts.length >= 3) break; // Show at most 3 units
      const count = Math.floor(remaining / interval.seconds);
      if (count > 0) {
        parts.push(`${count}${interval.label}`);
        remaining -= count * interval.seconds;
      }
    }

    return parts.length > 0 ? parts.join(' ') : '< 1s';
  }

  /**
   * Formats a large number with K/M/B/T suffixes for readability.
   */
  private formatLargeNumber(n: number): string {
    if (n < 1000) return n.toString();
    const suffixes = ['', 'K', 'M', 'B', 'T', 'Q'];
    const power = Math.min(Math.floor(Math.log10(n) / 3), suffixes.length - 1);
    const scaled = n / Math.pow(1000, power);
    const suffix = suffixes[power];
    if (scaled < 10) return scaled.toFixed(2) + suffix;
    if (scaled < 100) return scaled.toFixed(1) + suffix;
    return scaled.toFixed(0) + suffix;
  }
}
