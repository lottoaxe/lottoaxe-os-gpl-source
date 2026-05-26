import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Observable, Subject, interval, map, shareReplay, startWith, switchMap, takeUntil, tap } from 'rxjs';
import { SystemApiService } from 'src/app/services/system.service';
import { LoadingService } from 'src/app/services/loading.service';
import { LocalStorageService } from 'src/app/local-storage.service';
import { SystemInfo as ISystemInfo } from 'src/app/generated/models';

const ENERGY_SETTINGS_KEY = 'LA_ENERGY_SETTINGS';
const EXPECTED_BLOCK_REWARD_BTC = 3.125;
const BLOCKS_PER_DAY = 144;
const DAYS_PER_MONTH = 30.44;
const DAYS_PER_YEAR = 365.25;

interface EnergySettings {
  electricityRate: number;
  currency: string;
  btcPrice: number;
}

@Component({
  selector: 'app-energy-calc',
  templateUrl: './energy-calc.component.html',
  styleUrls: ['./energy-calc.component.scss']
})
export class EnergyCalcComponent implements OnInit, OnDestroy {
  info$!: Observable<ISystemInfo>;
  form!: FormGroup;
  private destroy$ = new Subject<void>();

  currencySymbols: Record<string, string> = {
    'USD': '$', 'EUR': '€', 'GBP': '£', 'CAD': 'C$', 'AUD': 'A$', 'JPY': '¥'
  };

  currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];

  constructor(
    private fb: FormBuilder,
    private systemService: SystemApiService,
    private loadingService: LoadingService,
    private localStorageService: LocalStorageService
  ) {}

  ngOnInit(): void {
    this.loadingService.loading$.next(true);

    const saved: EnergySettings | null = this.localStorageService.getObject(ENERGY_SETTINGS_KEY);
    this.form = this.fb.group({
      electricityRate: [saved?.electricityRate ?? 0.12],
      currency: [saved?.currency ?? 'USD'],
      btcPrice: [saved?.btcPrice ?? 100000]
    });

    this.form.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(values => {
        this.localStorageService.setObject(ENERGY_SETTINGS_KEY, values);
      });

    this.info$ = interval(5000).pipe(
      startWith(0),
      switchMap(() => this.systemService.getInfo()),
      tap(() => this.loadingService.loading$.next(false)),
      map(info => {
        info.voltage = info.voltage / 1000;
        info.current = info.current / 1000;
        info.coreVoltageActual = info.coreVoltageActual / 1000;
        info.coreVoltage = info.coreVoltage / 1000;
        return info;
      }),
      shareReplay({ refCount: true, bufferSize: 1 }),
      takeUntil(this.destroy$)
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get sym(): string {
    return this.currencySymbols[this.form.get('currency')?.value] ?? '$';
  }

  get electricityRate(): number {
    return this.form.get('electricityRate')?.value ?? 0.12;
  }

  get btcPrice(): number {
    return this.form.get('btcPrice')?.value ?? 100000;
  }

  // --- Energy cost calculations ---

  getPowerKw(info: ISystemInfo): number {
    return (info.power ?? 0) / 1000;
  }

  getCostPerHour(info: ISystemInfo): number {
    return this.getPowerKw(info) * this.electricityRate;
  }

  getCostPerDay(info: ISystemInfo): number {
    return this.getCostPerHour(info) * 24;
  }

  getCostPerWeek(info: ISystemInfo): number {
    return this.getCostPerDay(info) * 7;
  }

  getCostPerMonth(info: ISystemInfo): number {
    return this.getCostPerDay(info) * DAYS_PER_MONTH;
  }

  getCostPerYear(info: ISystemInfo): number {
    return this.getCostPerDay(info) * DAYS_PER_YEAR;
  }

  getKWhPerDay(info: ISystemInfo): number {
    return this.getPowerKw(info) * 24;
  }

  getKWhPerMonth(info: ISystemInfo): number {
    return this.getKWhPerDay(info) * DAYS_PER_MONTH;
  }

  // --- Mining economics ---

  getExpectedBlockRewardFiat(): number {
    return EXPECTED_BLOCK_REWARD_BTC * this.btcPrice;
  }

  getNetworkHashrateGh(info: ISystemInfo): number {
    if (!info.networkDifficulty || info.networkDifficulty === 0) return 1;
    return (info.networkDifficulty * Math.pow(2, 32)) / 600 / 1e9;
  }

  getHashRateShare(info: ISystemInfo): number {
    const networkGh = this.getNetworkHashrateGh(info);
    if (networkGh === 0) return 0;
    return (info.hashRate ?? 0) / networkGh;
  }

  getExpectedDailyRevenueBTC(info: ISystemInfo): number {
    return this.getHashRateShare(info) * BLOCKS_PER_DAY * EXPECTED_BLOCK_REWARD_BTC;
  }

  getExpectedDailyRevenueFiat(info: ISystemInfo): number {
    return this.getExpectedDailyRevenueBTC(info) * this.btcPrice;
  }

  getDailyProfit(info: ISystemInfo): number {
    return this.getExpectedDailyRevenueFiat(info) - this.getCostPerDay(info);
  }

  getBreakEvenBTCPrice(info: ISystemInfo): number {
    const dailyBTC = this.getExpectedDailyRevenueBTC(info);
    if (dailyBTC <= 0) return Infinity;
    return this.getCostPerDay(info) / dailyBTC;
  }

  getYearsToFindBlock(info: ISystemInfo): number {
    const share = this.getHashRateShare(info);
    if (share <= 0) return Infinity;
    const blocksPerYear = BLOCKS_PER_DAY * DAYS_PER_YEAR;
    return 1 / (share * blocksPerYear);
  }

  // --- Efficiency stats ---

  getJoulesPerTerahash(info: ISystemInfo): number {
    const hashRateTh = (info.hashRate ?? 0) / 1000;
    if (hashRateTh <= 0) return 0;
    return info.power / hashRateTh;
  }

  getWattsPerGigahash(info: ISystemInfo): number {
    if (!info.hashRate || info.hashRate <= 0) return 0;
    return info.power / info.hashRate;
  }

  // --- Display helpers ---

  formatCost(value: number): string {
    if (value < 0.01 && value > 0) {
      return value.toFixed(6);
    }
    return value.toFixed(2);
  }

  formatBTC(value: number): string {
    if (value <= 0) return '0';
    if (value < 0.00000001) return value.toExponential(2);
    return value.toFixed(8);
  }

  formatYears(years: number): string {
    if (!isFinite(years)) return 'N/A';
    if (years >= 1000000) {
      return (years / 1000000).toFixed(1) + 'M years';
    }
    if (years >= 1000) {
      return (years / 1000).toFixed(1) + 'K years';
    }
    if (years >= 1) {
      return years.toFixed(1) + ' years';
    }
    const days = years * DAYS_PER_YEAR;
    if (days >= 1) {
      return days.toFixed(0) + ' days';
    }
    const hours = days * 24;
    return hours.toFixed(0) + ' hours';
  }

  formatLargeNumber(value: number): string {
    if (!isFinite(value)) return 'N/A';
    if (value >= 1e12) return (value / 1e12).toFixed(1) + 'T';
    if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B';
    if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
    return value.toFixed(0);
  }
}
