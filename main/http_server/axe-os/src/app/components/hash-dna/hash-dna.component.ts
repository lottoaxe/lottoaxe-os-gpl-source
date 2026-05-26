import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject, interval, switchMap, startWith, shareReplay, takeUntil, finalize, take, catchError, of } from 'rxjs';
import { SystemApiService } from 'src/app/services/system.service';
import { LoadingService } from 'src/app/services/loading.service';
import { SystemInfo as ISystemInfo, SystemScoreboardEntry } from 'src/app/generated/models';

const STORAGE_KEY = 'LA_HASH_DNA';

// Known hex words to detect (4+ chars only — 3-letter words are too common in random hex)
const HEX_WORDS = [
  'DEAD', 'BEEF', 'CAFE', 'BABE', 'FACE', 'FADE', 'FEED',
  'DEAF', 'DECADE', 'FACADE', 'ACCEDE', 'DEFACE',
  'B00B', 'BADD', 'BEAD', 'DEED',
  'C0DE', 'D00D', 'F00D', 'C0FF', 'B00F', 'F00F',
  'ABCDEF', '1337', 'DECE', 'SEED', 'ABED'
];

interface RarityTrait {
  name: string;
  description: string;
  icon: string;
  color: string;
  score: number;
}

interface HashSpecimen {
  hash: string;  // nonce or hash representation
  timestamp: number;
  difficulty: number;
  traits: RarityTrait[];
  totalScore: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
  rarityColor: string;
}

@Component({
  selector: 'app-hash-dna',
  templateUrl: './hash-dna.component.html',
  styleUrls: ['./hash-dna.component.scss']
})
export class HashDnaComponent implements OnInit, OnDestroy {

  public info$!: Observable<ISystemInfo>;
  public scoreboard$!: Observable<SystemScoreboardEntry[]>;
  private destroy$ = new Subject<void>();

  // Collection
  public collection: HashSpecimen[] = [];
  public latestSpecimen: HashSpecimen | null = null;
  public bestSpecimen: HashSpecimen | null = null;

  // Stats
  public totalAnalyzed = 0;
  public rarityCounts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };

  // Tracking
  private lastProcessedHashes = new Set<string>();

  // Filter
  public filterRarity: string = 'all';

  constructor(
    private systemService: SystemApiService,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.loadCollection();
    this.loadingService.loading$.next(true);

    const poll$ = interval(5000).pipe(startWith(0), takeUntil(this.destroy$));

    this.info$ = poll$.pipe(
      switchMap(() => this.systemService.getInfo()),
      shareReplay({ refCount: true, bufferSize: 1 })
    );

    this.scoreboard$ = poll$.pipe(
      switchMap(() => this.systemService.getScoreboard().pipe(
        catchError(() => of([] as SystemScoreboardEntry[]))
      )),
      shareReplay({ refCount: true, bufferSize: 1 })
    );

    // Dismiss loading after first data arrives
    this.scoreboard$.pipe(take(1)).subscribe(() => {
      this.loadingService.loading$.next(false);
    });

    // Analyze scoreboard entries for rare hashes
    this.scoreboard$.pipe(takeUntil(this.destroy$)).subscribe(entries => {
      this.analyzeScoreboard(entries);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private analyzeScoreboard(entries: SystemScoreboardEntry[]): void {
    if (!entries || entries.length === 0) return;

    for (const entry of entries) {
      // Create a unique hash-like string from scoreboard entry data
      const hashStr = (entry.nonce || '') + (entry.extranonce2 || '') + (entry.job_id || '') + entry.difficulty;

      if (this.lastProcessedHashes.has(hashStr)) continue;
      this.lastProcessedHashes.add(hashStr);

      // Keep set from growing too large
      if (this.lastProcessedHashes.size > 500) {
        const arr = Array.from(this.lastProcessedHashes);
        this.lastProcessedHashes = new Set(arr.slice(-250));
      }

      // Build a hex string to analyze from available data
      const hexToAnalyze = ((entry.nonce || '00000000') + (entry.extranonce2 || '00000000')).toUpperCase().replace(/[^0-9A-F]/g, '');

      if (hexToAnalyze.length < 4) continue;

      const traits = this.analyzeHash(hexToAnalyze);
      const totalScore = traits.reduce((sum, t) => sum + t.score, 0);
      const rarity = this.scoreToRarity(totalScore);

      const specimen: HashSpecimen = {
        hash: hexToAnalyze,
        timestamp: Date.now(),
        difficulty: entry.difficulty,
        traits: traits,
        totalScore: totalScore,
        rarity: rarity,
        rarityColor: this.getRarityColor(rarity)
      };

      this.totalAnalyzed++;

      // Only keep specimens with actual traits (not just random hex)
      if (traits.length > 0) {
        this.collection.unshift(specimen);
        this.rarityCounts[rarity]++;
        this.latestSpecimen = specimen;

        if (!this.bestSpecimen || totalScore > this.bestSpecimen.totalScore) {
          this.bestSpecimen = specimen;
        }
      }

      // Cap collection size
      if (this.collection.length > 300) {
        this.collection = this.collection.slice(0, 300);
      }
    }

    this.saveCollection();
  }

  private analyzeHash(hex: string): RarityTrait[] {
    const traits: RarityTrait[] = [];

    // 1. Leading zeros (3+ required — 2 leading zeros are common in random hex)
    const leadingZeros = hex.match(/^0+/);
    if (leadingZeros && leadingZeros[0].length >= 3) {
      const count = leadingZeros[0].length;
      traits.push({
        name: 'Leading Zeros',
        description: count + ' leading zeros',
        icon: 'pi-circle',
        color: '#00C8FF',
        score: count * 5
      });
    }

    // 2. Hex words
    for (const word of HEX_WORDS) {
      if (hex.includes(word)) {
        const wordScore = word.length >= 6 ? 30 : word.length >= 4 ? 20 : 10;
        traits.push({
          name: 'Hex Word',
          description: '"' + word + '" found',
          icon: 'pi-book',
          color: '#FFD700',
          score: wordScore
        });
        break; // Only count first word found
      }
    }

    // 3. Palindrome check (first 8 chars)
    const first8 = hex.substring(0, 8);
    if (first8.length >= 8 && first8 === first8.split('').reverse().join('')) {
      traits.push({
        name: 'Palindrome',
        description: 'First 8 chars mirror',
        icon: 'pi-arrows-h',
        color: '#A855F7',
        score: 40
      });
    } else {
      // Check for 4-char palindrome
      const first4 = hex.substring(0, 4);
      if (first4 === first4.split('').reverse().join('')) {
        traits.push({
          name: 'Mini Palindrome',
          description: 'First 4 chars mirror',
          icon: 'pi-arrows-h',
          color: '#A855F7',
          score: 15
        });
      }
    }

    // 4. Repeating character (e.g., AAAA, BBBB) — need 4+ repeats
    const repeatMatch = hex.match(/(.)\1{3,}/);
    if (repeatMatch) {
      const len = repeatMatch[0].length;
      traits.push({
        name: 'Repeater',
        description: repeatMatch[0].substring(0, 8) + (len > 8 ? '...' : '') + ' (' + len + 'x)',
        icon: 'pi-replay',
        color: '#F59E0B',
        score: len * 4
      });
    }

    // 5. Sequential run (e.g., 123456, ABCDEF)
    const seqUp = this.findSequentialRun(hex, true);
    const seqDown = this.findSequentialRun(hex, false);
    const seqLen = Math.max(seqUp, seqDown);
    if (seqLen >= 4) {
      traits.push({
        name: 'Sequence',
        description: seqLen + '-char sequential run',
        icon: 'pi-sort-amount-up',
        color: '#8DFF00',
        score: seqLen * 6
      });
    }

    // 6. All same character
    if (hex.length >= 6 && new Set(hex.split('')).size === 1) {
      traits.push({
        name: 'Monochrome',
        description: 'All same character!',
        icon: 'pi-circle-fill',
        color: '#FF3B3B',
        score: 100
      });
    }

    // 7. Binary pattern (only 0s and 1s)
    if (hex.length >= 6 && /^[01]+$/.test(hex)) {
      traits.push({
        name: 'Binary',
        description: 'Only 0s and 1s',
        icon: 'pi-code',
        color: '#00FF88',
        score: 25
      });
    }

    // 8. Lucky 7s (need 5+ — four 7s is too common in 16-char hex)
    const sevenCount = (hex.match(/7/g) || []).length;
    if (sevenCount >= 5) {
      traits.push({
        name: 'Lucky 7s',
        description: sevenCount + ' sevens found',
        icon: 'pi-star',
        color: '#FFD700',
        score: sevenCount * 4
      });
    }

    return traits;
  }

  private findSequentialRun(hex: string, ascending: boolean): number {
    const chars = '0123456789ABCDEF';
    let maxRun = 1;
    let currentRun = 1;

    for (let i = 1; i < hex.length; i++) {
      const prev = chars.indexOf(hex[i - 1]);
      const curr = chars.indexOf(hex[i]);
      if (prev < 0 || curr < 0) { currentRun = 1; continue; }

      if (ascending ? curr === prev + 1 : curr === prev - 1) {
        currentRun++;
        maxRun = Math.max(maxRun, currentRun);
      } else {
        currentRun = 1;
      }
    }
    return maxRun;
  }

  private scoreToRarity(score: number): 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' {
    if (score >= 100) return 'mythic';
    if (score >= 70) return 'legendary';
    if (score >= 45) return 'epic';
    if (score >= 25) return 'rare';
    if (score >= 12) return 'uncommon';
    return 'common';
  }

  getRarityColor(rarity: string): string {
    switch (rarity) {
      case 'mythic': return '#FF3B3B';
      case 'legendary': return '#FFD700';
      case 'epic': return '#A855F7';
      case 'rare': return '#00C8FF';
      case 'uncommon': return '#8DFF00';
      default: return 'rgba(255,255,255,0.4)';
    }
  }

  getRarityLabel(rarity: string): string {
    return rarity.charAt(0).toUpperCase() + rarity.slice(1);
  }

  getRarityGlow(rarity: string): string {
    const color = this.getRarityColor(rarity);
    return '0 0 15px ' + color + '33';
  }

  getFilteredCollection(): HashSpecimen[] {
    if (this.filterRarity === 'all') return this.collection;
    return this.collection.filter(s => s.rarity === this.filterRarity);
  }

  formatHash(hash: string): string {
    // Add spaces every 4 chars for readability
    return hash.match(/.{1,4}/g)?.join(' ') || hash;
  }

  getSpecimenAge(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return seconds + 's ago';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  }

  // ── Persistence ──
  private loadCollection(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.collection = parsed.collection || [];
        this.bestSpecimen = parsed.bestSpecimen || null;
        this.totalAnalyzed = parsed.totalAnalyzed || 0;
        this.rarityCounts = parsed.rarityCounts || { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
      }
    } catch {}
  }

  private saveCollection(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        collection: this.collection.slice(0, 200),
        bestSpecimen: this.bestSpecimen,
        totalAnalyzed: this.totalAnalyzed,
        rarityCounts: this.rarityCounts
      }));
    } catch {}
  }

  clearCollection(): void {
    this.collection = [];
    this.bestSpecimen = null;
    this.latestSpecimen = null;
    this.totalAnalyzed = 0;
    this.rarityCounts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
    this.lastProcessedHashes.clear();
    localStorage.removeItem(STORAGE_KEY);
  }
}
