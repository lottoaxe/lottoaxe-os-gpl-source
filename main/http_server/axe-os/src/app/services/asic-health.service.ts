import { Injectable } from '@angular/core';

export interface HealthSnapshot {
  timestamp: number;        // epoch ms
  hashRate: number;
  expectedHashrate: number;
  errorPct: number;
  temp: number;
  power: number;
  frequency: number;
  voltage: number;
  uptimeSeconds: number;
}

export interface HealthReport {
  score: number;             // 0–100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  hashEfficiency: number;    // actual / expected (0–1+)
  avgErrorPct: number;
  avgTemp: number;
  tempStability: number;     // lower is better (std dev)
  hashrateStability: number; // lower is better (coefficient of variation)
  uptimeHours: number;
  degradationPct: number;    // negative = improvement, positive = degradation
  trendDirection: 'improving' | 'stable' | 'degrading';
  sampleCount: number;
  oldestSample: number;      // epoch ms
  newestSample: number;      // epoch ms
}

const STORAGE_KEY = 'LA_ASIC_HEALTH';
const MAX_SNAPSHOTS = 2000;  // ~33 hours at 1-minute intervals

@Injectable({
  providedIn: 'root'
})
export class AsicHealthService {

  private snapshots: HealthSnapshot[] = [];

  constructor() {
    this.load();
  }

  // ═══════════════════════════════════════════════════════════════
  //  SNAPSHOT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /** Record a new health snapshot from /api/system/info data */
  record(data: {
    hashRate: number;
    expectedHashrate: number;
    errorPercentage: number;
    temp: number;
    power: number;
    frequency: number;
    coreVoltage: number;
    uptimeSeconds: number;
  }): void {
    // Skip if hashrate is 0 (device is starting up or pool disconnected)
    if (!data.hashRate || data.hashRate <= 0) return;

    const snap: HealthSnapshot = {
      timestamp: Date.now(),
      hashRate: data.hashRate,
      expectedHashrate: data.expectedHashrate || 0,
      errorPct: data.errorPercentage || 0,
      temp: data.temp || 0,
      power: data.power || 0,
      frequency: data.frequency || 0,
      voltage: data.coreVoltage || 0,
      uptimeSeconds: data.uptimeSeconds || 0,
    };

    this.snapshots.push(snap);

    // Trim old snapshots
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots = this.snapshots.slice(-MAX_SNAPSHOTS);
    }

    this.save();
  }

  /** Get all stored snapshots */
  getSnapshots(): HealthSnapshot[] {
    return [...this.snapshots];
  }

  /** Get snapshots from the last N hours */
  getRecentSnapshots(hours: number): HealthSnapshot[] {
    const cutoff = Date.now() - (hours * 3600 * 1000);
    return this.snapshots.filter(s => s.timestamp >= cutoff);
  }

  /** Clear all health data */
  clear(): void {
    this.snapshots = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  // ═══════════════════════════════════════════════════════════════
  //  HEALTH CALCULATION
  // ═══════════════════════════════════════════════════════════════

  /** Calculate the current health report */
  getReport(hoursWindow: number = 24): HealthReport {
    const snaps = this.getRecentSnapshots(hoursWindow);

    if (snaps.length < 3) {
      return this.emptyReport();
    }

    const hashRates = snaps.map(s => s.hashRate);
    const errorPcts = snaps.map(s => s.errorPct);
    const temps = snaps.map(s => s.temp);
    const expected = snaps.map(s => s.expectedHashrate).filter(e => e > 0);

    // ── Hash efficiency (actual / expected) ──
    const avgHash = this.mean(hashRates);
    const avgExpected = expected.length > 0 ? this.mean(expected) : avgHash;
    const hashEfficiency = avgExpected > 0 ? avgHash / avgExpected : 1;

    // ── Stability metrics ──
    const hashStdDev = this.stdDev(hashRates);
    const hashrateStability = avgHash > 0 ? hashStdDev / avgHash : 0; // CV
    const tempStability = this.stdDev(temps);
    const avgErrorPct = this.mean(errorPcts);
    const avgTemp = this.mean(temps);

    // ── Degradation trend ──
    const degradationPct = this.calcDegradation(snaps);

    // ── Uptime ──
    const latestUptime = snaps[snaps.length - 1].uptimeSeconds;
    const uptimeHours = latestUptime / 3600;

    // ── Composite score (0–100) ──
    let score = 100;

    // Hashrate efficiency (worth up to 35 points)
    if (hashEfficiency < 1) {
      score -= Math.min(35, (1 - hashEfficiency) * 70);
    }

    // Error rate (worth up to 25 points)
    score -= Math.min(25, avgErrorPct * 5);

    // Hashrate stability (worth up to 20 points)
    // CV > 0.15 is quite unstable
    score -= Math.min(20, hashrateStability * 100);

    // Temperature penalty (worth up to 10 points)
    if (avgTemp > 65) {
      score -= Math.min(10, (avgTemp - 65) * 2);
    }

    // Degradation trend (worth up to 10 points)
    if (degradationPct > 0) {
      score -= Math.min(10, degradationPct * 2);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    const grade = this.scoreToGrade(score);
    const trendDirection = degradationPct < -1 ? 'improving'
      : degradationPct > 1 ? 'degrading'
      : 'stable';

    return {
      score,
      grade,
      hashEfficiency,
      avgErrorPct,
      avgTemp,
      tempStability,
      hashrateStability,
      uptimeHours,
      degradationPct,
      trendDirection,
      sampleCount: snaps.length,
      oldestSample: snaps[0].timestamp,
      newestSample: snaps[snaps.length - 1].timestamp,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════

  private calcDegradation(snaps: HealthSnapshot[]): number {
    if (snaps.length < 10) return 0;

    // Compare first 20% of samples to last 20% at same frequency
    const fifth = Math.floor(snaps.length / 5);
    const earlySnaps = snaps.slice(0, fifth);
    const lateSnaps = snaps.slice(-fifth);

    const earlyHash = this.mean(earlySnaps.map(s => s.hashRate));
    const lateHash = this.mean(lateSnaps.map(s => s.hashRate));

    if (earlyHash <= 0) return 0;
    return ((earlyHash - lateHash) / earlyHash) * 100;
  }

  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private stdDev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const avg = this.mean(arr);
    const sqDiffs = arr.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(sqDiffs));
  }

  private scoreToGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 95) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  private emptyReport(): HealthReport {
    return {
      score: 0,
      grade: 'F',
      hashEfficiency: 0,
      avgErrorPct: 0,
      avgTemp: 0,
      tempStability: 0,
      hashrateStability: 0,
      uptimeHours: 0,
      degradationPct: 0,
      trendDirection: 'stable',
      sampleCount: 0,
      oldestSample: 0,
      newestSample: 0,
    };
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.snapshots = raw ? JSON.parse(raw) : [];
    } catch {
      this.snapshots = [];
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshots));
    } catch { /* storage full — drop oldest */
      this.snapshots = this.snapshots.slice(-500);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshots)); } catch {}
    }
  }
}
