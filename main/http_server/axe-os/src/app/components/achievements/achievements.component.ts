import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject, interval, switchMap, startWith, shareReplay, takeUntil, tap, map } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { SystemApiService } from 'src/app/services/system.service';
import { LoadingService } from 'src/app/services/loading.service';
import { LocalStorageService } from 'src/app/local-storage.service';
import { SystemInfo as ISystemInfo } from 'src/app/generated/models';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'mining' | 'uptime' | 'thermal' | 'shares' | 'milestone';
  tier: 'bronze' | 'silver' | 'gold' | 'diamond';
  condition: (info: ISystemInfo) => boolean;
  progress?: (info: ISystemInfo) => number; // 0-100
  secret?: boolean;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: number;   // timestamp
  notified: boolean;
}

// ---------------------------------------------------------------------------
// Achievement definitions
// ---------------------------------------------------------------------------

const ACHIEVEMENTS: Achievement[] = [
  // ---- Mining (shares accepted) ----
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Accept your very first share.',
    icon: 'pi-bolt',
    category: 'mining',
    tier: 'bronze',
    condition: (i) => i.sharesAccepted >= 1,
    progress: (i) => Math.min(100, (i.sharesAccepted / 1) * 100),
  },
  {
    id: 'thousand_strong',
    name: 'Thousand Strong',
    description: 'Accept 1,000 shares.',
    icon: 'pi-chart-bar',
    category: 'mining',
    tier: 'silver',
    condition: (i) => i.sharesAccepted >= 1_000,
    progress: (i) => Math.min(100, (i.sharesAccepted / 1_000) * 100),
  },
  {
    id: 'ten_thousand_club',
    name: 'Ten Thousand Club',
    description: 'Accept 10,000 shares.',
    icon: 'pi-chart-line',
    category: 'mining',
    tier: 'gold',
    condition: (i) => i.sharesAccepted >= 10_000,
    progress: (i) => Math.min(100, (i.sharesAccepted / 10_000) * 100),
  },
  {
    id: 'hundred_k',
    name: 'Hundred K',
    description: 'Accept 100,000 shares.',
    icon: 'pi-star-fill',
    category: 'mining',
    tier: 'diamond',
    condition: (i) => i.sharesAccepted >= 100_000,
    progress: (i) => Math.min(100, (i.sharesAccepted / 100_000) * 100),
  },

  // ---- Shares / Difficulty ----
  {
    id: 'mega_share',
    name: 'Mega Share',
    description: 'Find a share above 1M difficulty.',
    icon: 'pi-angle-double-up',
    category: 'shares',
    tier: 'bronze',
    condition: (i) => i.bestDiff > 1_000_000,
    progress: (i) => Math.min(100, (i.bestDiff / 1_000_000) * 100),
  },
  {
    id: 'giga_share',
    name: 'Giga Share',
    description: 'Find a share above 1G difficulty.',
    icon: 'pi-sort-amount-up',
    category: 'shares',
    tier: 'silver',
    condition: (i) => i.bestDiff > 1_000_000_000,
    progress: (i) => Math.min(100, (i.bestDiff / 1_000_000_000) * 100),
  },
  {
    id: 'tera_share',
    name: 'Tera Share',
    description: 'Find a share above 1T difficulty.',
    icon: 'pi-arrow-up-right',
    category: 'shares',
    tier: 'gold',
    condition: (i) => i.bestDiff > 1_000_000_000_000,
    progress: (i) => Math.min(100, (i.bestDiff / 1_000_000_000_000) * 100),
  },
  {
    id: 'network_challenger',
    name: 'Network Challenger',
    description: 'Best difficulty exceeds 0.0001% of network difficulty.',
    icon: 'pi-globe',
    category: 'shares',
    tier: 'diamond',
    condition: (i) => i.bestDiff > i.networkDifficulty * 0.000001,
    progress: (i) => {
      const target = i.networkDifficulty * 0.000001;
      return target > 0 ? Math.min(100, (i.bestDiff / target) * 100) : 0;
    },
    secret: true,
  },

  // ---- Uptime ----
  {
    id: 'getting_started',
    name: 'Getting Started',
    description: 'Keep your miner running for 1 hour.',
    icon: 'pi-clock',
    category: 'uptime',
    tier: 'bronze',
    condition: (i) => i.uptimeSeconds > 3_600,
    progress: (i) => Math.min(100, (i.uptimeSeconds / 3_600) * 100),
  },
  {
    id: 'marathon_runner',
    name: 'Marathon Runner',
    description: 'Keep your miner running for 72 hours straight.',
    icon: 'pi-stopwatch',
    category: 'uptime',
    tier: 'silver',
    condition: (i) => i.uptimeSeconds > 259_200,
    progress: (i) => Math.min(100, (i.uptimeSeconds / 259_200) * 100),
  },
  {
    id: 'iron_miner',
    name: 'Iron Miner',
    description: 'Keep your miner running for 1 week straight.',
    icon: 'pi-shield',
    category: 'uptime',
    tier: 'gold',
    condition: (i) => i.uptimeSeconds > 604_800,
    progress: (i) => Math.min(100, (i.uptimeSeconds / 604_800) * 100),
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: 'Keep your miner running for 30 days straight.',
    icon: 'pi-verified',
    category: 'uptime',
    tier: 'diamond',
    condition: (i) => i.uptimeSeconds > 2_592_000,
    progress: (i) => Math.min(100, (i.uptimeSeconds / 2_592_000) * 100),
  },

  // ---- Thermal ----
  {
    id: 'cool_customer',
    name: 'Cool Customer',
    description: 'Run with ASIC temperature below 45 C.',
    icon: 'pi-wave-pulse',
    category: 'thermal',
    tier: 'bronze',
    condition: (i) => i.temp > 0 && i.temp < 45,
    progress: (i) => i.temp > 0 ? Math.min(100, Math.max(0, ((60 - i.temp) / 15) * 100)) : 0,
  },
  {
    id: 'thermal_master',
    name: 'Thermal Master',
    description: 'Hash above 400 GH/s while staying under 50 C.',
    icon: 'pi-sparkles',
    category: 'thermal',
    tier: 'silver',
    condition: (i) => i.temp > 0 && i.temp < 50 && i.hashRate > 400,
    progress: (i) => {
      const tempOk = i.temp > 0 && i.temp < 50 ? 50 : Math.max(0, ((60 - i.temp) / 10) * 50);
      const hrOk = Math.min(50, (i.hashRate / 400) * 50);
      return Math.min(100, tempOk + hrOk);
    },
  },

  // ---- Milestone ----
  {
    id: 'lottery_hunter',
    name: 'Lottery Hunter',
    description: 'Your best difficulty reached a meaningful fraction of network difficulty.',
    icon: 'pi-trophy',
    category: 'milestone',
    tier: 'gold',
    condition: (i) => i.bestDiff > i.networkDifficulty * 0.0000001,
    progress: (i) => {
      const target = i.networkDifficulty * 0.0000001;
      return target > 0 ? Math.min(100, (i.bestDiff / target) * 100) : 0;
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'LA_ACHIEVEMENTS';

export type AchievementCategory = Achievement['category'];

const TIER_ORDER: Record<Achievement['tier'], number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  diamond: 3,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'app-achievements',
  templateUrl: './achievements.component.html',
  styleUrls: ['./achievements.component.scss']
})
export class AchievementsComponent implements OnInit, OnDestroy {

  public info$!: Observable<ISystemInfo>;
  public achievements: Achievement[] = ACHIEVEMENTS;
  public unlockedMap: Record<string, UnlockedAchievement> = {};
  public selectedCategory: AchievementCategory | 'all' = 'all';
  public recentlyUnlocked: Set<string> = new Set();

  public categories: { label: string; value: AchievementCategory | 'all' }[] = [
    { label: 'All', value: 'all' },
    { label: 'Mining', value: 'mining' },
    { label: 'Uptime', value: 'uptime' },
    { label: 'Thermal', value: 'thermal' },
    { label: 'Shares', value: 'shares' },
    { label: 'Milestone', value: 'milestone' },
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private systemService: SystemApiService,
    private loadingService: LoadingService,
    private localStorageService: LocalStorageService,
    private toastr: ToastrService,
  ) {}

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  ngOnInit(): void {
    this.loadUnlocked();
    this.loadingService.loading$.next(true);

    this.info$ = interval(5000).pipe(
      startWith(0),
      switchMap(() => this.systemService.getInfo()),
      tap(info => this.evaluateAchievements(info)),
      shareReplay({ refCount: true, bufferSize: 1 }),
      takeUntil(this.destroy$),
    );

    // First emission turns off the global loader
    this.info$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.loadingService.loading$.next(false),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // -----------------------------------------------------------------------
  // Achievement evaluation
  // -----------------------------------------------------------------------

  private evaluateAchievements(info: ISystemInfo): void {
    let changed = false;

    for (const achievement of ACHIEVEMENTS) {
      if (this.unlockedMap[achievement.id]) {
        continue;
      }
      try {
        if (achievement.condition(info)) {
          const unlocked: UnlockedAchievement = {
            id: achievement.id,
            unlockedAt: Date.now(),
            notified: true,
          };
          this.unlockedMap[achievement.id] = unlocked;
          this.recentlyUnlocked.add(achievement.id);
          changed = true;

          this.toastr.success(
            achievement.description,
            `Achievement Unlocked: ${achievement.name}`,
            { timeOut: 6000, progressBar: true }
          );

          // Clear the "recently unlocked" glow after 10 seconds
          setTimeout(() => this.recentlyUnlocked.delete(achievement.id), 10_000);
        }
      } catch {
        // Condition threw (e.g. missing field) -- skip silently
      }
    }

    if (changed) {
      this.saveUnlocked();
    }
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  private loadUnlocked(): void {
    const stored = this.localStorageService.getObject(STORAGE_KEY);
    if (stored && typeof stored === 'object') {
      this.unlockedMap = stored as Record<string, UnlockedAchievement>;
    }
  }

  private saveUnlocked(): void {
    this.localStorageService.setObject(STORAGE_KEY, this.unlockedMap);
  }

  // -----------------------------------------------------------------------
  // Template helpers
  // -----------------------------------------------------------------------

  get filteredAchievements(): Achievement[] {
    const list = this.selectedCategory === 'all'
      ? this.achievements
      : this.achievements.filter(a => a.category === this.selectedCategory);

    // Sort: unlocked first (most recent first), then by tier descending
    return [...list].sort((a, b) => {
      const aUnlocked = !!this.unlockedMap[a.id];
      const bUnlocked = !!this.unlockedMap[b.id];
      if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
      if (aUnlocked && bUnlocked) {
        return this.unlockedMap[b.id].unlockedAt - this.unlockedMap[a.id].unlockedAt;
      }
      return TIER_ORDER[b.tier] - TIER_ORDER[a.tier];
    });
  }

  get unlockedCount(): number {
    return Object.keys(this.unlockedMap).length;
  }

  get totalCount(): number {
    return ACHIEVEMENTS.length;
  }

  isUnlocked(achievement: Achievement): boolean {
    return !!this.unlockedMap[achievement.id];
  }

  isRecentlyUnlocked(achievement: Achievement): boolean {
    return this.recentlyUnlocked.has(achievement.id);
  }

  getProgress(achievement: Achievement, info: ISystemInfo): number {
    if (this.isUnlocked(achievement)) return 100;
    if (!achievement.progress) return 0;
    try {
      return Math.round(Math.min(100, Math.max(0, achievement.progress(info))));
    } catch {
      return 0;
    }
  }

  getTimeAgo(achievement: Achievement): string {
    const unlocked = this.unlockedMap[achievement.id];
    if (!unlocked) return '';
    const seconds = Math.floor((Date.now() - unlocked.unlockedAt) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  getTierColor(tier: Achievement['tier']): string {
    switch (tier) {
      case 'bronze': return '#CD7F32';
      case 'silver': return '#C0C0C0';
      case 'gold': return '#FFD700';
      case 'diamond': return '#B9F2FF';
    }
  }

  selectCategory(category: AchievementCategory | 'all'): void {
    this.selectedCategory = category;
  }

  trackById(_index: number, item: Achievement): string {
    return item.id;
  }
}
