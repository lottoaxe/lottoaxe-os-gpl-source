import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject, interval, switchMap, startWith, shareReplay, takeUntil, finalize } from 'rxjs';
import { tap } from 'rxjs/operators';
import { SystemApiService } from 'src/app/services/system.service';
import { LoadingService } from 'src/app/services/loading.service';
import { SystemInfo as ISystemInfo } from 'src/app/generated/models';

const THROTTLE_TEMP = 65;
const SHUTDOWN_TEMP = 72;
const MAX_GAUGE_TEMP = 80;
const BUFFER_SIZE = 60; // 60 readings @ 5s = 5 minutes
const POLL_INTERVAL_MS = 5000;

interface ThermalReading {
  timestamp: number;
  temp: number;
  power: number;
  fanRpm: number;
}

type ThermalStatus = 'cool' | 'warm' | 'hot' | 'throttling' | 'critical';

interface CoolingRecommendation {
  icon: string;
  text: string;
  priority: 'info' | 'warning' | 'critical';
}

@Component({
  selector: 'app-thermal-prediction',
  templateUrl: './thermal-prediction.component.html',
  styleUrls: ['./thermal-prediction.component.scss']
})
export class ThermalPredictionComponent implements OnInit, OnDestroy {
  info$!: Observable<ISystemInfo>;
  private destroy$ = new Subject<void>();

  thermalBuffer: ThermalReading[] = [];

  constructor(
    private systemService: SystemApiService,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.loadingService.loading$.next(true);

    this.info$ = interval(POLL_INTERVAL_MS).pipe(
      startWith(0),
      switchMap(() => this.systemService.getInfo()),
      tap(info => {
        this.loadingService.loading$.next(false);
        this.recordReading(info);
      }),
      shareReplay({ refCount: true, bufferSize: 1 }),
      takeUntil(this.destroy$),
      finalize(() => this.loadingService.loading$.next(false))
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // --- Buffer management ---

  private recordReading(info: ISystemInfo): void {
    this.thermalBuffer.push({
      timestamp: Date.now(),
      temp: info.temp,
      power: info.power,
      fanRpm: info.fanrpm
    });

    if (this.thermalBuffer.length > BUFFER_SIZE) {
      this.thermalBuffer = this.thermalBuffer.slice(-BUFFER_SIZE);
    }
  }

  // --- Linear regression for temperature trend ---

  getTempTrend(): number {
    if (this.thermalBuffer.length < 3) {
      return 0;
    }

    const n = this.thermalBuffer.length;
    const readings = this.thermalBuffer;

    // Convert timestamps to minutes relative to first reading
    const t0 = readings[0].timestamp;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const x = (readings[i].timestamp - t0) / 60000; // minutes
      const y = readings[i].temp;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      return 0;
    }

    // Slope = degrees per minute
    return (n * sumXY - sumX * sumY) / denominator;
  }

  // --- Prediction methods ---

  getTimeToThrottle(info: ISystemInfo): number | null {
    return this.getTimeToThreshold(info, THROTTLE_TEMP);
  }

  getTimeToShutdown(info: ISystemInfo): number | null {
    return this.getTimeToThreshold(info, SHUTDOWN_TEMP);
  }

  private getTimeToThreshold(info: ISystemInfo, threshold: number): number | null {
    if (info.temp >= threshold) {
      return null; // already above threshold
    }

    const trend = this.getTempTrend();
    if (trend <= 0) {
      return null; // cooling or stable, won't reach threshold
    }

    const degreesRemaining = threshold - info.temp;
    const minutesToThreshold = degreesRemaining / trend;
    return minutesToThreshold * 60; // convert to seconds
  }

  formatCountdown(seconds: number | null): string {
    if (seconds === null) {
      return 'Safe';
    }

    if (seconds > 3600) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }

    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  }

  // --- Thermal health score ---

  getThermalScore(info: ISystemInfo): number {
    const temp = info.temp;
    if (temp > 72) return 0;
    if (temp > 65) return 30;
    if (temp > 55) return 60;
    if (temp > 40) return 80;
    return 100;
  }

  // --- Status & color ---

  getThermalStatus(info: ISystemInfo): ThermalStatus {
    const temp = info.temp;
    if (temp > 72) return 'critical';
    if (temp > 65) return 'throttling';
    if (temp > 55) return 'hot';
    if (temp > 40) return 'warm';
    return 'cool';
  }

  getThermalStatusLabel(info: ISystemInfo): string {
    return this.getThermalStatus(info).toUpperCase();
  }

  getThermalColor(info: ISystemInfo): string {
    const status = this.getThermalStatus(info);
    switch (status) {
      case 'cool':       return '#22c55e';
      case 'warm':       return '#eab308';
      case 'hot':        return '#f59e0b';
      case 'throttling': return '#ef4444';
      case 'critical':   return '#dc2626';
    }
  }

  // --- Gauge ---

  getGaugePercent(info: ISystemInfo): number {
    return Math.min(100, Math.max(0, (info.temp / MAX_GAUGE_TEMP) * 100));
  }

  getThrottleMarkerPercent(): number {
    return (THROTTLE_TEMP / MAX_GAUGE_TEMP) * 100;
  }

  getShutdownMarkerPercent(): number {
    return (SHUTDOWN_TEMP / MAX_GAUGE_TEMP) * 100;
  }

  // --- Efficiency impact ---

  getEfficiencyImpact(info: ISystemInfo): string {
    const temp = info.temp;
    if (temp <= 55) return 'None';
    if (temp <= 60) return '~2-5% hashrate reduction';
    if (temp <= 65) return '~5-15% hashrate reduction';
    if (temp <= 70) return '~15-30% hashrate reduction';
    if (temp <= 72) return '~30-50% hashrate reduction';
    return 'Mining halted - critical thermal shutdown';
  }

  // --- Trend display ---

  getTrendDisplay(): string {
    const trend = this.getTempTrend();
    if (Math.abs(trend) < 0.01) return 'Stable';
    const sign = trend > 0 ? '+' : '';
    return `${sign}${trend.toFixed(2)} °C/min`;
  }

  getTrendDirection(): 'rising' | 'falling' | 'stable' {
    const trend = this.getTempTrend();
    if (trend > 0.01) return 'rising';
    if (trend < -0.01) return 'falling';
    return 'stable';
  }

  // --- Cooling recommendations ---

  getCoolingRecommendations(info: ISystemInfo): CoolingRecommendation[] {
    const recs: CoolingRecommendation[] = [];
    const status = this.getThermalStatus(info);
    const trend = this.getTempTrend();

    if (status === 'critical') {
      recs.push({
        icon: 'pi pi-exclamation-triangle',
        text: 'CRITICAL: Reduce frequency immediately or power off to prevent hardware damage',
        priority: 'critical'
      });
      recs.push({
        icon: 'pi pi-exclamation-triangle',
        text: 'Check heatsink contact and thermal paste application',
        priority: 'critical'
      });
    }

    if (status === 'throttling' || status === 'critical') {
      recs.push({
        icon: 'pi pi-bolt',
        text: 'Lower ASIC frequency to reduce heat generation',
        priority: 'critical'
      });
      recs.push({
        icon: 'pi pi-cog',
        text: 'Lower core voltage if overclocking is enabled',
        priority: 'warning'
      });
    }

    if (info.fanrpm < 2000 && status !== 'cool') {
      recs.push({
        icon: 'pi pi-sync',
        text: 'Fan RPM is low - check fan connection or increase fan speed',
        priority: 'warning'
      });
    }

    if (info.autofanspeed === 0 && (status === 'hot' || status === 'throttling' || status === 'critical')) {
      recs.push({
        icon: 'pi pi-cog',
        text: 'Enable automatic fan speed control for better thermal management',
        priority: 'warning'
      });
    }

    if (status === 'hot') {
      recs.push({
        icon: 'pi pi-arrows-alt',
        text: 'Improve airflow around the device - ensure vents are unobstructed',
        priority: 'warning'
      });
      recs.push({
        icon: 'pi pi-sun',
        text: 'Move device away from direct sunlight or heat sources',
        priority: 'info'
      });
    }

    if (trend > 0.5 && status !== 'cool') {
      recs.push({
        icon: 'pi pi-chart-line',
        text: 'Temperature is rising rapidly - monitor closely',
        priority: 'warning'
      });
    }

    if (status === 'warm') {
      recs.push({
        icon: 'pi pi-check-circle',
        text: 'Temperature is within acceptable range but could be improved',
        priority: 'info'
      });
      recs.push({
        icon: 'pi pi-arrows-alt',
        text: 'Consider adding auxiliary cooling for extended operation',
        priority: 'info'
      });
    }

    if (status === 'cool') {
      recs.push({
        icon: 'pi pi-shield',
        text: 'Thermal performance is excellent - no action needed',
        priority: 'info'
      });
    }

    return recs;
  }

  // --- Data readiness ---

  getBufferFill(): number {
    return Math.round((this.thermalBuffer.length / BUFFER_SIZE) * 100);
  }

  hasEnoughData(): boolean {
    return this.thermalBuffer.length >= 3;
  }
}
