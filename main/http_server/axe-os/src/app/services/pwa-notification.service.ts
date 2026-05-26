import { Injectable, OnDestroy } from '@angular/core';
import { Subject, takeUntil, interval, startWith, switchMap } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { SystemApiService } from './system.service';

/**
 * Mining Alert Service
 *
 * Monitors miner state via polling and fires in-app toast notifications
 * for key events: new best difficulty, block found, overheat, miner offline.
 *
 * Works on HTTP — no browser permissions or HTTPS required.
 * Also attempts native browser Notification API as a bonus when available.
 *
 * Alerts are toggleable via the bell icon in the topbar.
 */

const ALERTS_ENABLED_KEY = 'la_mining_alerts_enabled';

@Injectable({ providedIn: 'root' })
export class PwaNotificationService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private lastBestDiff = 0;
  private lastSharesAccepted = 0;
  private wasOffline = false;
  private overheatNotified = false;
  private monitoring = false;
  private _enabled: boolean;
  private nativePerm = false;

  // Thresholds
  private readonly OVERHEAT_TEMP = 65;
  private readonly CRITICAL_TEMP = 70;

  constructor(
    private systemService: SystemApiService,
    private toastr: ToastrService,
  ) {
    // Restore toggle state from localStorage (default OFF for new users)
    const stored = localStorage.getItem(ALERTS_ENABLED_KEY);
    this._enabled = stored === 'true';

    // Check if native notifications are already granted
    if ('Notification' in window && Notification.permission === 'granted') {
      this.nativePerm = true;
    }
  }

  /** Whether alert monitoring is supported (always true — uses toasts) */
  get isSupported(): boolean {
    return true;
  }

  /** Whether alerts are currently enabled */
  get isEnabled(): boolean {
    return this._enabled;
  }

  /** Toggle alerts on/off */
  toggle(): void {
    this._enabled = !this._enabled;
    localStorage.setItem(ALERTS_ENABLED_KEY, String(this._enabled));

    if (this._enabled) {
      this.toastr.success('Mining alerts enabled', 'Alerts ON');
      this.startMonitoring();
      // Try to get native notification permission as a bonus
      this.tryNativePermission();
    } else {
      this.toastr.info('Mining alerts disabled', 'Alerts OFF');
    }
  }

  /** Start monitoring — call once from app layout */
  start(): void {
    if (this._enabled) {
      this.startMonitoring();
      // Silently try native permission (no prompt, just check)
      if ('Notification' in window && Notification.permission === 'granted') {
        this.nativePerm = true;
      }
    }
  }

  /** Request native notification permission (called from user click) */
  async requestPermission(): Promise<void> {
    this.toggle();
  }

  private tryNativePermission(): void {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      this.nativePerm = true;
      return;
    }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        this.nativePerm = perm === 'granted';
      });
    }
  }

  private startMonitoring(): void {
    if (this.monitoring) return;
    this.monitoring = true;

    interval(10000).pipe(
      startWith(0),
      switchMap(() => this.systemService.getInfo()),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (info) => this.evaluateState(info),
      error: () => {
        if (this._enabled && !this.wasOffline) {
          this.wasOffline = true;
          this.alert(
            'Miner Offline',
            'Your Bitaxe is not responding. Check your device.',
            'error'
          );
        }
      }
    });
  }

  private evaluateState(info: any): void {
    if (!this._enabled) return;

    // Miner came back online
    if (this.wasOffline) {
      this.wasOffline = false;
      this.alert(
        'Miner Back Online',
        `Hashrate: ${this.fmtHash(info.hashRate)} — Temp: ${info.temp}°C`,
        'success'
      );
    }

    // ---- Block Found ----
    if (info.blockFound) {
      this.alert(
        'BLOCK FOUND!!!',
        'Your Bitaxe just found a Bitcoin block! Check your wallet!',
        'block'
      );
    }

    // ---- New Best Difficulty ----
    const bestDiff = info.bestDiff || 0;
    if (this.lastBestDiff > 0 && bestDiff > this.lastBestDiff) {
      const pct = ((bestDiff / this.lastBestDiff - 1) * 100).toFixed(0);
      this.alert(
        'New Best Difficulty!',
        `${this.fmtDiff(bestDiff)} — ${pct}% higher than previous best!`,
        'achievement'
      );
    }
    this.lastBestDiff = bestDiff;

    // ---- Overheat ----
    const temp = info.temp || 0;
    if (temp >= this.CRITICAL_TEMP && !this.overheatNotified) {
      this.overheatNotified = true;
      this.alert(
        'CRITICAL: Overheating!',
        `ASIC temperature is ${temp}°C — safety shutdown imminent!`,
        'error'
      );
    } else if (temp >= this.OVERHEAT_TEMP && !this.overheatNotified) {
      this.overheatNotified = true;
      this.alert(
        'Temperature Warning',
        `ASIC temp is ${temp}°C — auto-throttle may activate.`,
        'warning'
      );
    } else if (temp < this.OVERHEAT_TEMP - 3) {
      this.overheatNotified = false;
    }

    this.lastSharesAccepted = info.sharesAccepted || 0;
  }

  private alert(title: string, body: string, type: string): void {
    // In-app toast notification (always works)
    const toastOpts = {
      timeOut: type === 'block' ? 0 : type === 'error' ? 15000 : 8000,
      extendedTimeOut: 3000,
      closeButton: true,
      progressBar: true,
      tapToDismiss: true,
      positionClass: 'toast-top-right',
    };

    switch (type) {
      case 'block':
        this.toastr.success(body, title, { ...toastOpts, disableTimeOut: true });
        break;
      case 'achievement':
        this.toastr.success(body, title, toastOpts);
        break;
      case 'error':
        this.toastr.error(body, title, toastOpts);
        break;
      case 'warning':
        this.toastr.warning(body, title, toastOpts);
        break;
      default:
        this.toastr.info(body, title, toastOpts);
    }

    // Native browser notification as a bonus (if tab not focused + permission granted)
    if (this.nativePerm && !document.hasFocus()) {
      try {
        const n = new Notification(title, {
          body,
          icon: '/assets/icons/icon-192x192.png',
          tag: `lottoaxe-${type}`,
        });
        if (type !== 'block' && type !== 'error') {
          setTimeout(() => n.close(), 8000);
        }
        n.onclick = () => { window.focus(); n.close(); };
      } catch (_) {}
    }
  }

  private fmtHash(hr: number): string {
    if (hr >= 1000) return (hr / 1000).toFixed(1) + ' Th/s';
    return hr.toFixed(0) + ' Gh/s';
  }

  private fmtDiff(d: number): string {
    if (d >= 1e12) return (d / 1e12).toFixed(2) + 'T';
    if (d >= 1e9) return (d / 1e9).toFixed(2) + 'G';
    if (d >= 1e6) return (d / 1e6).toFixed(2) + 'M';
    if (d >= 1e3) return (d / 1e3).toFixed(2) + 'K';
    return d.toFixed(0);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
