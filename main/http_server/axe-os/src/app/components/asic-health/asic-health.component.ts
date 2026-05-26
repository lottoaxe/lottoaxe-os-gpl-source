import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { SystemApiService } from 'src/app/services/system.service';
import { AsicHealthService, HealthReport, HealthSnapshot } from 'src/app/services/asic-health.service';

@Component({
  selector: 'app-asic-health',
  templateUrl: './asic-health.component.html',
  styleUrls: ['./asic-health.component.scss'],
})
export class AsicHealthComponent implements OnInit, OnDestroy {

  // ── Report ──
  report: HealthReport | null = null;
  timeWindow = 24; // hours

  // ── Live stats ──
  currentHashRate = 0;
  currentTemp = 0;
  currentPower = 0;
  currentErrorPct = 0;
  currentFrequency = 0;
  currentVoltage = 0;
  asicModel = '';

  // ── Chart data (hashrate over time) ──
  chartLabels: string[] = [];
  chartData: number[] = [];

  // ── Snapshot count ──
  totalSnapshots = 0;
  collecting = false;

  private pollSub: Subscription | null = null;

  constructor(
    private systemService: SystemApiService,
    private healthService: AsicHealthService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadAsicInfo();
    this.refreshReport();
    this.startCollecting();
  }

  ngOnDestroy(): void {
    this.stopCollecting();
  }

  // ═══════════════════════════════════════════════════════════════
  //  DATA COLLECTION
  // ═══════════════════════════════════════════════════════════════

  startCollecting(): void {
    if (this.pollSub) return;
    this.collecting = true;

    // Poll every 60 seconds
    this.pollSub = timer(0, 60000).pipe(
      switchMap(() => this.systemService.getInfo())
    ).subscribe({
      next: (info) => {
        this.currentHashRate = info.hashRate || 0;
        this.currentTemp = info.temp || 0;
        this.currentPower = info.power || 0;
        this.currentErrorPct = info.errorPercentage || 0;
        this.currentFrequency = info.frequency || 0;
        this.currentVoltage = info.coreVoltage || 0;

        // Record the snapshot
        this.healthService.record({
          hashRate: info.hashRate || 0,
          expectedHashrate: info.expectedHashrate || 0,
          errorPercentage: info.errorPercentage || 0,
          temp: info.temp || 0,
          power: info.power || 0,
          frequency: info.frequency || 0,
          coreVoltage: info.coreVoltage || 0,
          uptimeSeconds: info.uptimeSeconds || 0,
        });

        this.totalSnapshots = this.healthService.getSnapshots().length;
        this.refreshReport();
      },
      error: () => {},
    });
  }

  stopCollecting(): void {
    if (this.pollSub) {
      this.pollSub.unsubscribe();
      this.pollSub = null;
    }
    this.collecting = false;
  }

  loadAsicInfo(): void {
    this.systemService.getAsicSettings().subscribe(asic => {
      this.asicModel = asic.ASICModel || '';
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  REPORT
  // ═══════════════════════════════════════════════════════════════

  refreshReport(): void {
    this.report = this.healthService.getReport(this.timeWindow);
    this.buildChart();
  }

  setTimeWindow(hours: number): void {
    this.timeWindow = hours;
    this.refreshReport();
  }

  clearData(): void {
    this.healthService.clear();
    this.report = null;
    this.totalSnapshots = 0;
    this.chartLabels = [];
    this.chartData = [];
    this.toastr.info('Health data cleared');
  }

  // ═══════════════════════════════════════════════════════════════
  //  MINI CHART
  // ═══════════════════════════════════════════════════════════════

  private buildChart(): void {
    const snaps = this.healthService.getRecentSnapshots(this.timeWindow);
    if (snaps.length === 0) {
      this.chartLabels = [];
      this.chartData = [];
      return;
    }

    // Downsample to max ~60 points
    const step = Math.max(1, Math.floor(snaps.length / 60));
    const sampled = snaps.filter((_, i) => i % step === 0);

    this.chartLabels = sampled.map(s => {
      const d = new Date(s.timestamp);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    });
    this.chartData = sampled.map(s => s.hashRate);
  }

  // ═══════════════════════════════════════════════════════════════
  //  VIEW HELPERS
  // ═══════════════════════════════════════════════════════════════

  getScoreColor(score: number): string {
    if (score >= 85) return '#8DFF00';
    if (score >= 70) return '#38bdf8';
    if (score >= 55) return '#FFB300';
    if (score >= 40) return '#FF6B00';
    return '#FF3B3B';
  }

  getGradeColor(grade: string): string {
    switch (grade) {
      case 'A+': case 'A': return '#8DFF00';
      case 'B': return '#38bdf8';
      case 'C': return '#FFB300';
      case 'D': return '#FF6B00';
      case 'F': return '#FF3B3B';
      default: return '#71717a';
    }
  }

  getTrendIcon(dir: string): string {
    switch (dir) {
      case 'improving': return 'pi pi-arrow-up';
      case 'degrading': return 'pi pi-arrow-down';
      default: return 'pi pi-minus';
    }
  }

  getTrendColor(dir: string): string {
    switch (dir) {
      case 'improving': return '#8DFF00';
      case 'degrading': return '#FF3B3B';
      default: return '#71717a';
    }
  }

  formatDuration(hours: number): string {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  }

  get dataAge(): string {
    if (!this.report || !this.report.oldestSample) return '--';
    const hours = (Date.now() - this.report.oldestSample) / 3600000;
    return this.formatDuration(hours);
  }

  getBarHeight(val: number): number {
    if (this.chartData.length === 0) return 0;
    const max = Math.max(...this.chartData);
    const min = Math.min(...this.chartData);
    const range = max - min || 1;
    return Math.max(5, ((val - min) / range) * 90 + 10);
  }

  // Score ring SVG helpers
  get scoreCircumference(): number { return 2 * Math.PI * 54; }
  get scoreDashOffset(): number {
    if (!this.report) return this.scoreCircumference;
    return this.scoreCircumference * (1 - this.report.score / 100);
  }
}
