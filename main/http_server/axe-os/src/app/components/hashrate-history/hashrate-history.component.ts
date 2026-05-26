import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Observable, Subject, interval, switchMap, startWith, shareReplay, takeUntil, tap } from 'rxjs';
import { SystemApiService } from 'src/app/services/system.service';
import { LoadingService } from 'src/app/services/loading.service';
import { LocalStorageService } from 'src/app/local-storage.service';
import { SystemInfo as ISystemInfo } from 'src/app/generated/models';

const HISTORY_KEY = 'LA_HASHRATE_HISTORY';
const TIME_RANGE_KEY = 'LA_HASHRATE_TIME_RANGE';
const MAX_ENTRIES = 720; // 1 hour at 5s intervals

interface HistoryDataPoint {
  timestamp: number;
  hashRate: number;
  temp: number;
  power: number;
}

interface TimeRangeOption {
  label: string;
  value: number; // seconds
}

@Component({
  selector: 'app-hashrate-history',
  templateUrl: './hashrate-history.component.html',
  styleUrls: ['./hashrate-history.component.scss']
})
export class HashrateHistoryComponent implements OnInit, OnDestroy {
  info$!: Observable<ISystemInfo>;
  form!: FormGroup;
  private destroy$ = new Subject<void>();

  historyBuffer: HistoryDataPoint[] = [];

  chartData: any = {};
  chartOptions: any = {};

  timeRangeOptions: TimeRangeOption[] = [
    { label: '5 Minutes', value: 300 },
    { label: '15 Minutes', value: 900 },
    { label: '30 Minutes', value: 1800 },
    { label: '1 Hour', value: 3600 }
  ];

  constructor(
    private fb: FormBuilder,
    private systemService: SystemApiService,
    private loadingService: LoadingService,
    private localStorageService: LocalStorageService
  ) {}

  ngOnInit(): void {
    this.loadingService.loading$.next(true);

    // Load saved history from localStorage
    const savedHistory: HistoryDataPoint[] | null = this.localStorageService.getObject(HISTORY_KEY);
    if (savedHistory && Array.isArray(savedHistory)) {
      this.historyBuffer = savedHistory.slice(-MAX_ENTRIES);
    }

    // Load saved time range preference
    const savedRange = this.localStorageService.getNumber(TIME_RANGE_KEY);
    this.form = this.fb.group({
      timeRange: [savedRange ?? 900]
    });

    this.form.get('timeRange')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        this.localStorageService.setNumber(TIME_RANGE_KEY, value);
        this.rebuildChart();
      });

    // Initialize chart options
    this.initChartOptions();

    this.info$ = interval(5000).pipe(
      startWith(0),
      switchMap(() => this.systemService.getInfo()),
      tap(info => {
        this.loadingService.loading$.next(false);

        // Convert units as the energy-calc component does
        info.voltage = info.voltage / 1000;
        info.current = info.current / 1000;
        info.coreVoltageActual = info.coreVoltageActual / 1000;
        info.coreVoltage = info.coreVoltage / 1000;

        // Push new data point
        this.historyBuffer.push({
          timestamp: Date.now(),
          hashRate: info.hashRate ?? 0,
          temp: info.temp ?? 0,
          power: info.power ?? 0
        });

        // Trim to max entries
        if (this.historyBuffer.length > MAX_ENTRIES) {
          this.historyBuffer = this.historyBuffer.slice(-MAX_ENTRIES);
        }

        // Persist to localStorage
        this.localStorageService.setObject(HISTORY_KEY, this.historyBuffer);

        // Rebuild chart data
        this.rebuildChart();
      }),
      shareReplay({ refCount: true, bufferSize: 1 }),
      takeUntil(this.destroy$)
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------------------------------------------------------------------------
  // Chart Data
  // ---------------------------------------------------------------------------

  private getFilteredData(): HistoryDataPoint[] {
    const rangeSeconds: number = this.form.get('timeRange')?.value ?? 900;
    const cutoff = Date.now() - (rangeSeconds * 1000);
    return this.historyBuffer.filter(dp => dp.timestamp >= cutoff);
  }

  getChartData(): { labels: string[]; datasets: any[] } {
    const filtered = this.getFilteredData();
    const labels = filtered.map(dp => {
      const d = new Date(dp.timestamp);
      return d.getHours().toString().padStart(2, '0') + ':' +
             d.getMinutes().toString().padStart(2, '0') + ':' +
             d.getSeconds().toString().padStart(2, '0');
    });

    return {
      labels,
      datasets: [
        {
          label: 'Hashrate (GH/s)',
          data: filtered.map(dp => dp.hashRate),
          borderColor: '#8DFF00',
          backgroundColor: 'rgba(141, 255, 0, 0.08)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          yAxisID: 'y'
        },
        {
          label: 'Temperature (C)',
          data: filtered.map(dp => dp.temp),
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderDash: [4, 2],
          yAxisID: 'y1'
        },
        {
          label: 'Power (W)',
          data: filtered.map(dp => dp.power),
          borderColor: '#38bdf8',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderDash: [6, 3],
          yAxisID: 'y2'
        }
      ]
    };
  }

  private rebuildChart(): void {
    this.chartData = this.getChartData();
  }

  private initChartOptions(): void {
    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: 'rgba(255, 255, 255, 0.65)',
            font: { size: 11 },
            usePointStyle: true,
            pointStyle: 'line'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(20, 20, 20, 0.9)',
          borderColor: 'rgba(141, 255, 0, 0.2)',
          borderWidth: 1,
          titleColor: 'rgba(255, 255, 255, 0.8)',
          bodyColor: 'rgba(255, 255, 255, 0.65)',
          padding: 10,
          cornerRadius: 6
        }
      },
      scales: {
        x: {
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)',
            maxTicksLimit: 10,
            font: { size: 10 }
          },
          grid: {
            color: 'rgba(141, 255, 0, 0.08)',
            drawBorder: false
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'GH/s',
            color: '#8DFF00',
            font: { size: 11 }
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)',
            font: { size: 10 }
          },
          grid: {
            color: 'rgba(141, 255, 0, 0.08)',
            drawBorder: false
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'C',
            color: '#f59e0b',
            font: { size: 11 }
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)',
            font: { size: 10 }
          },
          grid: {
            drawOnChartArea: false
          }
        },
        y2: {
          type: 'linear',
          display: false,
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Hashrate Statistics
  // ---------------------------------------------------------------------------

  getCurrentHashrate(info: ISystemInfo): number {
    return info.hashRate ?? 0;
  }

  getAvgHashrate(): number {
    const filtered = this.getFilteredData();
    if (filtered.length === 0) return 0;
    const sum = filtered.reduce((acc, dp) => acc + dp.hashRate, 0);
    return sum / filtered.length;
  }

  getMinHashrate(): number {
    const filtered = this.getFilteredData();
    if (filtered.length === 0) return 0;
    return Math.min(...filtered.map(dp => dp.hashRate));
  }

  getMaxHashrate(): number {
    const filtered = this.getFilteredData();
    if (filtered.length === 0) return 0;
    return Math.max(...filtered.map(dp => dp.hashRate));
  }

  // ---------------------------------------------------------------------------
  // Uptime
  // ---------------------------------------------------------------------------

  getUptimeFormatted(info: ISystemInfo): string {
    const totalSeconds = info.uptimeSeconds;
    if (!totalSeconds || totalSeconds <= 0) return 'Just started';

    const intervals: { label: string; seconds: number }[] = [
      { label: 'd', seconds: 86400 },
      { label: 'h', seconds: 3600 },
      { label: 'm', seconds: 60 },
      { label: 's', seconds: 1 }
    ];

    let remaining = Math.floor(totalSeconds);
    const parts: string[] = [];

    for (const iv of intervals) {
      if (parts.length >= 3) break;
      const count = Math.floor(remaining / iv.seconds);
      if (count > 0) {
        parts.push(`${count}${iv.label}`);
        remaining -= count * iv.seconds;
      }
    }

    return parts.length > 0 ? parts.join(' ') : '< 1s';
  }

  // ---------------------------------------------------------------------------
  // Display Helpers
  // ---------------------------------------------------------------------------

  getDataPointCount(): number {
    return this.getFilteredData().length;
  }

  getTimeRangeLabel(): string {
    const value = this.form.get('timeRange')?.value;
    const option = this.timeRangeOptions.find(o => o.value === value);
    return option?.label ?? '15 Minutes';
  }
}
