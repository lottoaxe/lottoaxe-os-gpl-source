import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, interval, pairwise, filter, startWith, switchMap, takeUntil } from 'rxjs';
import { SystemApiService } from 'src/app/services/system.service';
import { LocalStorageService } from 'src/app/local-storage.service';
import { SystemInfo as ISystemInfo } from 'src/app/generated/models';
import { DiffSuffixPipe } from 'src/app/pipes/diff-suffix.pipe';

const LUCKY_SHARE_THRESHOLD_KEY = 'LUCKY_SHARE_THRESHOLD_MULTIPLIER';
const LUCKY_SHARE_ENABLED_KEY = 'LUCKY_SHARE_ENABLED';

type AnimationTier = 'nice' | 'mega' | 'giga' | 'legendary';

@Component({
  selector: 'app-lucky-share',
  templateUrl: './lucky-share.component.html',
  styleUrls: ['./lucky-share.component.scss']
})
export class LuckyShareComponent implements OnInit, OnDestroy {
  showAnimation = false;
  animationTier: AnimationTier = 'nice';
  shareValue: number = 0;
  shareLabel: string = '';

  private lastBestSessionDiff: number = 0;
  private destroy$ = new Subject<void>();
  private dismissTimer: any = null;

  constructor(
    private systemService: SystemApiService,
    private localStorageService: LocalStorageService
  ) {}

  ngOnInit(): void {
    const enabled = this.localStorageService.getItem(LUCKY_SHARE_ENABLED_KEY);
    if (enabled === 'false') {
      return;
    }

    interval(5000).pipe(
      startWith(0),
      switchMap(() => this.systemService.getInfo()),
      startWith(null as unknown as ISystemInfo),
      pairwise(),
      filter(([prev, curr]) => prev !== null && curr !== null),
      takeUntil(this.destroy$)
    ).subscribe(([prev, curr]) => {
      this.evaluateShare(prev, curr);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }
  }

  private getThresholdMultiplier(): number {
    const stored = this.localStorageService.getNumber(LUCKY_SHARE_THRESHOLD_KEY);
    return stored ?? 1.5;
  }

  private evaluateShare(prev: ISystemInfo, curr: ISystemInfo): void {
    const oldDiff = prev.bestSessionDiff ?? 0;
    const newDiff = curr.bestSessionDiff ?? 0;
    const multiplier = this.getThresholdMultiplier();

    // Trigger when bestSessionDiff increases significantly
    if (newDiff > oldDiff * multiplier && newDiff > 100000) {
      this.triggerAnimation(newDiff);
    }
  }

  private triggerAnimation(diff: number): void {
    this.shareValue = diff;
    this.animationTier = this.determineTier(diff);
    this.shareLabel = this.getTierLabel();
    this.showAnimation = true;

    // Auto-dismiss after 5 seconds
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }
    this.dismissTimer = setTimeout(() => {
      this.dismiss();
    }, 5000);
  }

  private determineTier(diff: number): AnimationTier {
    if (diff >= 1_000_000_000_000) {
      return 'legendary';
    } else if (diff >= 1_000_000_000) {
      return 'giga';
    } else if (diff >= 100_000_000) {
      return 'mega';
    } else {
      return 'nice';
    }
  }

  getTierLabel(): string {
    switch (this.animationTier) {
      case 'legendary': return 'LEGENDARY!!!';
      case 'giga':      return 'GIGA SHARE!!';
      case 'mega':      return 'MEGA SHARE!';
      case 'nice':      return 'NICE SHARE!';
    }
  }

  formatDiff(value: number): string {
    return DiffSuffixPipe.transform(value);
  }

  dismiss(): void {
    this.showAnimation = false;
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }
}
