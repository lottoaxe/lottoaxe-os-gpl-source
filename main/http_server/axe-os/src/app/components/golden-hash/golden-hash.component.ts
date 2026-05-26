import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Observable, Subject, interval, switchMap, startWith, shareReplay, takeUntil, finalize, pairwise, filter, map } from 'rxjs';
import { SystemApiService } from 'src/app/services/system.service';
import { LoadingService } from 'src/app/services/loading.service';
import { SystemInfo as ISystemInfo } from 'src/app/generated/models';

/** Difficulty tier thresholds and display metadata. */
const DIFFICULTY_TIERS = [
  { name: 'legendary', label: 'Legendary', min: 100_000_000, color: '#f59e0b' },
  { name: 'epic',      label: 'Epic',      min: 10_000_000,  color: '#a78bfa' },
  { name: 'rare',      label: 'Rare',      min: 1_000_000,   color: '#3b82f6' },
  { name: 'uncommon',  label: 'Uncommon',  min: 100_000,     color: '#22c55e' },
  { name: 'common',    label: 'Common',    min: 0,           color: '#6b7280' },
] as const;

/** Pulse threshold: only shares above this difficulty trigger the radar pulse. */
const PULSE_THRESHOLD = 1_000_000;

/** Maximum number of events kept in the rolling log. */
const MAX_EVENTS = 50;

export interface ShareEvent {
  timestamp: Date;
  difficulty: number;
  isRecord: boolean;
}

interface ActivePulse {
  startTime: number;
  difficulty: number;
}

@Component({
  selector: 'app-golden-hash',
  templateUrl: './golden-hash.component.html',
  styleUrls: ['./golden-hash.component.scss']
})
export class GoldenHashComponent implements OnInit, OnDestroy, AfterViewInit {

  @ViewChild('radarCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  public info$!: Observable<ISystemInfo>;
  public events: ShareEvent[] = [];
  public previousBestSessionDiff = 0;

  /** Exposed for template iteration. */
  public readonly tiers = DIFFICULTY_TIERS;

  private destroy$ = new Subject<void>();
  private activePulses: ActivePulse[] = [];
  private sweepAngle = 0;
  private animationId = 0;
  private lastFrameTime = 0;
  private canvasReady = false;
  private latestInfo: ISystemInfo | null = null;

  constructor(
    private systemService: SystemApiService,
    private loadingService: LoadingService
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

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

    // Detect new shares by comparing accepted share count between polls.
    // Previously this only tracked bestSessionDiff changes, which missed
    // every share that wasn't a new session record — causing the feed to
    // appear permanently stuck.
    this.info$.pipe(
      map(info => ({ accepted: info.sharesAccepted, diff: info.bestSessionDiff })),
      pairwise(),
      filter(([prev, curr]) => curr.accepted > prev.accepted),
      takeUntil(this.destroy$)
    ).subscribe(([prev, curr]) => {
      this.onNewShare(curr.diff);
    });

    // Keep a reference to latest info for computed helpers.
    this.info$.pipe(takeUntil(this.destroy$)).subscribe(info => {
      this.latestInfo = info;

      // Seed previous on first poll.
      if (this.previousBestSessionDiff === 0 && info.bestSessionDiff > 0) {
        this.previousBestSessionDiff = info.bestSessionDiff;
      }
    });
  }

  ngAfterViewInit(): void {
    this.canvasReady = true;
    this.lastFrameTime = performance.now();
    this.animate();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  // ---------------------------------------------------------------------------
  // Share Detection
  // ---------------------------------------------------------------------------

  private onNewShare(difficulty: number): void {
    const isRecord = difficulty > this.previousBestSessionDiff;
    this.previousBestSessionDiff = difficulty;

    this.events.unshift({ timestamp: new Date(), difficulty, isRecord });
    if (this.events.length > MAX_EVENTS) {
      this.events.length = MAX_EVENTS;
    }

    if (difficulty >= PULSE_THRESHOLD) {
      this.activePulses.push({ startTime: performance.now(), difficulty });
    }
  }

  // ---------------------------------------------------------------------------
  // Canvas Animation
  // ---------------------------------------------------------------------------

  private animate(): void {
    if (!this.canvasReady) return;

    const now = performance.now();
    const dt = (now - this.lastFrameTime) / 1000; // seconds
    this.lastFrameTime = now;

    // Rotate sweep at ~45 degrees per second.
    this.sweepAngle += dt * (Math.PI / 4);
    if (this.sweepAngle > Math.PI * 2) {
      this.sweepAngle -= Math.PI * 2;
    }

    this.drawRadar(now);

    // Prune pulses older than 2 seconds.
    this.activePulses = this.activePulses.filter(p => now - p.startTime < 2000);

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  private drawRadar(now: number): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;

    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      ctx.scale(dpr, dpr);
    }

    const cx = cssWidth / 2;
    const cy = cssHeight / 2;
    const radius = Math.min(cx, cy) - 4;

    // Clear
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Dark circle background
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 10, 18, 0.9)';
    ctx.fill();

    // Concentric rings
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (i / 4), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Crosshairs
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // Sweep line
    const sweepX = cx + Math.cos(this.sweepAngle) * radius;
    const sweepY = cy + Math.sin(this.sweepAngle) * radius;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sweepX, sweepY);
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sweep trail (fading arc behind the line)
    const trailAngle = Math.PI / 4; // 45 degree trail
    const gradient = ctx.createConicGradient(this.sweepAngle - trailAngle, cx, cy);
    gradient.addColorStop(0, 'rgba(167, 139, 250, 0)');
    gradient.addColorStop(trailAngle / (Math.PI * 2), 'rgba(167, 139, 250, 0.12)');
    gradient.addColorStop(trailAngle / (Math.PI * 2) + 0.001, 'rgba(167, 139, 250, 0)');

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, this.sweepAngle - trailAngle, this.sweepAngle);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#a78bfa';
    ctx.fill();

    // Active pulses (expanding golden rings)
    for (const pulse of this.activePulses) {
      const elapsed = (now - pulse.startTime) / 2000; // 0..1 over 2 seconds
      if (elapsed > 1) continue;

      const pulseRadius = radius * elapsed;
      const alpha = 1 - elapsed;
      const tier = this.getDifficultyTier(pulse.difficulty);
      const color = this.getTierColor(tier);

      // Outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = this.hexToRgba(color, alpha * 0.8);
      ctx.lineWidth = 3 - elapsed * 2;
      ctx.stroke();

      // Inner glow
      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius * 0.95, 0, Math.PI * 2);
      ctx.strokeStyle = this.hexToRgba(color, alpha * 0.3);
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    // Outer border ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // Difficulty Tier System
  // ---------------------------------------------------------------------------

  getDifficultyTier(diff: number): string {
    for (const tier of DIFFICULTY_TIERS) {
      if (diff >= tier.min) return tier.name;
    }
    return 'common';
  }

  getTierColor(tierName: string): string {
    const tier = DIFFICULTY_TIERS.find(t => t.name === tierName);
    return tier ? tier.color : '#6b7280';
  }

  getTierLabel(tierName: string): string {
    const tier = DIFFICULTY_TIERS.find(t => t.name === tierName);
    return tier ? tier.label : 'Common';
  }

  // ---------------------------------------------------------------------------
  // Computed Stats
  // ---------------------------------------------------------------------------

  getSharesPerMinute(info: ISystemInfo): string {
    if (!info.uptimeSeconds || info.uptimeSeconds === 0) return '0.00';
    const spm = (info.sharesAccepted / info.uptimeSeconds) * 60;
    return spm.toFixed(2);
  }

  getTimeSinceLastShare(): string {
    if (this.events.length === 0) return 'N/A';
    const lastEvent = this.events[0];
    const diffMs = Date.now() - lastEvent.timestamp.getTime();
    const seconds = Math.floor(diffMs / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  }

  // ---------------------------------------------------------------------------
  // Formatting Helpers
  // ---------------------------------------------------------------------------

  formatDifficulty(value: number): string {
    if (value == null || value < 0) return '0';

    const suffixes = ['', 'K', 'M', 'G', 'T', 'P', 'E'];
    if (value < 1000) return value.toFixed(0);

    const power = Math.min(Math.floor(Math.log10(value) / 3), suffixes.length - 1);
    const scaled = value / Math.pow(1000, power);
    const suffix = suffixes[power] ?? '';

    if (scaled < 10) return scaled.toFixed(2) + ' ' + suffix;
    if (scaled < 100) return scaled.toFixed(1) + ' ' + suffix;
    return scaled.toFixed(0) + ' ' + suffix;
  }

  formatTimestamp(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
