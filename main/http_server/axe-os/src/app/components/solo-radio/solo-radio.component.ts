import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, interval, switchMap, startWith, shareReplay, takeUntil, finalize, catchError, of, map } from 'rxjs';
import { SystemApiService } from 'src/app/services/system.service';
import { LoadingService } from 'src/app/services/loading.service';
import { SystemInfo as ISystemInfo } from 'src/app/generated/models';

const STORAGE_KEY = 'LA_SOLO_RADIO';
const BTC_PRICE_KEY = 'LA_BTC_PRICE';

interface BlockEntry {
  height: number;
  timestamp: number;
  poolName: string;
  isSolo: boolean;
  reward: number; // in BTC
  rewardUsd: number;
  size: number; // in bytes
  txCount: number;
  difficulty: number;
  hashrate: string; // estimated miner hashrate if solo
}

@Component({
  selector: 'app-solo-radio',
  templateUrl: './solo-radio.component.html',
  styleUrls: ['./solo-radio.component.scss']
})
export class SoloRadioComponent implements OnInit, OnDestroy {

  public info$!: Observable<ISystemInfo>;
  private destroy$ = new Subject<void>();

  // Block feed
  public blocks: BlockEntry[] = [];
  public soloBlocks: BlockEntry[] = [];
  public latestBlock: BlockEntry | null = null;

  // Stats
  public totalBlocksTracked = 0;
  public soloBlocksFound = 0;
  public lastSoloBlock: BlockEntry | null = null;
  public soloBlockRate = ''; // e.g. "~2 per week"

  // BTC price
  public btcPrice = 0;

  // Known solo mining pools
  private soloPoolPatterns = [
    'solo', 'ckpool', 'solo.ckpool', 'solomining',
    'solopool', 'solohash', 'solo mining',
    'unknown', 'Unknown'
  ];

  // Known large pool names to exclude from "solo" detection
  private knownPools = [
    'Foundry', 'AntPool', 'F2Pool', 'ViaBTC', 'Binance',
    'MARA', 'Luxor', 'BTC.com', 'Braiins', 'SBI Crypto',
    'OCEAN', 'SpiderPool', 'Poolin', 'SlushPool',
    'Ultimus', 'BitFuFu', 'SecPool', 'PEGA', 'EMCDPool',
    'WhitePool', 'Titan', 'rawpool', 'Huobi', 'BTC.TOP',
    'KuCoinPool', 'NovaBlock', '1THash', 'Sigmapool',
    'BytePool', 'okpool', 'OKExPool'
  ];

  // Loading state
  public loading = true;
  public lastFetch = 0;
  public feedStatus = 'Connecting...';

  constructor(
    private systemService: SystemApiService,
    private loadingService: LoadingService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadHistory();
    this.loadingService.loading$.next(true);

    // Poll system info
    const poll$ = interval(5000).pipe(startWith(0), takeUntil(this.destroy$));
    this.info$ = poll$.pipe(
      switchMap(() => this.systemService.getInfo().pipe(
        finalize(() => this.loadingService.loading$.next(false))
      )),
      shareReplay({ refCount: true, bufferSize: 1 })
    );

    // Fetch BTC price on init
    this.fetchBtcPrice();

    // Poll blocks every 30 seconds
    interval(30000).pipe(
      startWith(0),
      takeUntil(this.destroy$)
    ).subscribe(() => this.fetchLatestBlocks());

    // Refresh BTC price every 5 minutes
    interval(300000).pipe(
      startWith(0),
      takeUntil(this.destroy$)
    ).subscribe(() => this.fetchBtcPrice());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private fetchBtcPrice(): void {
    // Try cached price first
    try {
      const cached = localStorage.getItem(BTC_PRICE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp < 300000) {
          this.btcPrice = data.price;
          return;
        }
      }
    } catch {}

    this.http.get<any>('https://mempool.space/api/v1/prices').pipe(
      catchError(() => of(null))
    ).subscribe(data => {
      if (data && data.USD) {
        this.btcPrice = data.USD;
        try {
          localStorage.setItem(BTC_PRICE_KEY, JSON.stringify({ price: data.USD, timestamp: Date.now() }));
        } catch {}
      }
    });
  }

  private fetchLatestBlocks(): void {
    this.feedStatus = 'Scanning...';

    this.http.get<any[]>('https://mempool.space/api/v1/blocks').pipe(
      catchError(() => {
        this.feedStatus = 'Offline — using cached data';
        return of(null);
      })
    ).subscribe(data => {
      if (!data) return;

      this.loading = false;
      this.lastFetch = Date.now();
      this.feedStatus = 'Live';

      const newBlocks: BlockEntry[] = [];

      for (const block of data) {
        // Skip if already tracked
        if (this.blocks.some(b => b.height === block.height)) continue;

        const poolName = block.extras?.pool?.name || this.extractPoolFromCoinbase(block.extras?.coinbaseTx?.scriptsig || '') || 'Unknown';
        const isSolo = this.isSoloMiner(poolName);
        const rewardBtc = (block.extras?.reward || 0) / 1e8;

        const entry: BlockEntry = {
          height: block.height,
          timestamp: block.timestamp * 1000,
          poolName: poolName,
          isSolo: isSolo,
          reward: rewardBtc,
          rewardUsd: rewardBtc * this.btcPrice,
          size: block.size || 0,
          txCount: block.tx_count || 0,
          difficulty: block.difficulty || 0,
          hashrate: isSolo ? this.estimateSoloHashrate(block) : ''
        };

        newBlocks.push(entry);
      }

      if (newBlocks.length > 0) {
        this.blocks = [...newBlocks, ...this.blocks].slice(0, 500);
        this.soloBlocks = this.blocks.filter(b => b.isSolo);
        this.latestBlock = this.blocks[0];
        this.totalBlocksTracked = this.blocks.length;
        this.soloBlocksFound = this.soloBlocks.length;
        this.lastSoloBlock = this.soloBlocks[0] || null;
        this.calculateSoloRate();
        this.saveHistory();
      }
    });
  }

  private extractPoolFromCoinbase(scriptsig: string): string {
    // Try to extract ASCII from coinbase scriptsig
    try {
      const ascii = scriptsig.replace(/[^\x20-\x7E]/g, '');
      if (ascii.length > 3) return ascii.substring(0, 30);
    } catch {}
    return '';
  }

  private isSoloMiner(poolName: string): boolean {
    const lower = poolName.toLowerCase();
    // If it matches a known large pool, it's NOT solo
    for (const pool of this.knownPools) {
      if (lower.includes(pool.toLowerCase())) return false;
    }
    // If it matches solo patterns or is unknown/empty
    for (const pattern of this.soloPoolPatterns) {
      if (lower.includes(pattern.toLowerCase())) return true;
    }
    // If pool name is very short or empty, likely solo
    if (poolName.length < 3) return true;
    return false;
  }

  private estimateSoloHashrate(block: any): string {
    // This is a rough estimate — solo miners can be any size
    // We don't really know, so we show "Unknown" for most
    return 'Unknown';
  }

  private calculateSoloRate(): void {
    if (this.soloBlocks.length < 2) {
      this.soloBlockRate = 'Calculating...';
      return;
    }

    const oldest = this.soloBlocks[this.soloBlocks.length - 1].timestamp;
    const newest = this.soloBlocks[0].timestamp;
    const spanHours = (newest - oldest) / (1000 * 3600);

    if (spanHours <= 0) {
      this.soloBlockRate = 'N/A';
      return;
    }

    const ratePerDay = (this.soloBlocks.length / spanHours) * 24;

    if (ratePerDay >= 1) {
      this.soloBlockRate = '~' + ratePerDay.toFixed(1) + ' per day';
    } else {
      const perWeek = ratePerDay * 7;
      if (perWeek >= 1) {
        this.soloBlockRate = '~' + perWeek.toFixed(1) + ' per week';
      } else {
        this.soloBlockRate = '~' + (ratePerDay * 30).toFixed(1) + ' per month';
      }
    }
  }

  // ── Display helpers ──

  getBlockAge(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return seconds + 's ago';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  }

  formatBtc(btc: number): string {
    if (btc >= 1) return btc.toFixed(4);
    return btc.toFixed(8);
  }

  formatUsd(usd: number): string {
    if (usd >= 1000000) return '$' + (usd / 1000000).toFixed(2) + 'M';
    if (usd >= 1000) return '$' + (usd / 1000).toFixed(1) + 'K';
    return '$' + usd.toFixed(0);
  }

  formatSize(bytes: number): string {
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + ' KB';
    return bytes + ' B';
  }

  getYourOddsVsPool(info: ISystemInfo, block: BlockEntry): string {
    if (!info.hashRate || !block.difficulty) return 'N/A';
    // Your hashrate vs network
    const networkHashrate = (block.difficulty * Math.pow(2, 32)) / 600;
    const yourHashrate = info.hashRate * 1e9;
    const ratio = networkHashrate / yourHashrate;
    if (ratio >= 1e12) return '1 in ' + (ratio / 1e12).toFixed(1) + 'T';
    if (ratio >= 1e9) return '1 in ' + (ratio / 1e9).toFixed(1) + 'B';
    if (ratio >= 1e6) return '1 in ' + (ratio / 1e6).toFixed(1) + 'M';
    if (ratio >= 1e3) return '1 in ' + (ratio / 1e3).toFixed(1) + 'K';
    return '1 in ' + ratio.toFixed(0);
  }

  // ── Persistence ──

  private loadHistory(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.blocks = parsed.blocks || [];
        this.soloBlocks = this.blocks.filter(b => b.isSolo);
        this.totalBlocksTracked = this.blocks.length;
        this.soloBlocksFound = this.soloBlocks.length;
        this.latestBlock = this.blocks[0] || null;
        this.lastSoloBlock = this.soloBlocks[0] || null;
        this.calculateSoloRate();
      }
    } catch {}
  }

  private saveHistory(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        blocks: this.blocks.slice(0, 200) // Only keep last 200
      }));
    } catch {}
  }

  clearHistory(): void {
    this.blocks = [];
    this.soloBlocks = [];
    this.latestBlock = null;
    this.lastSoloBlock = null;
    this.totalBlocksTracked = 0;
    this.soloBlocksFound = 0;
    this.soloBlockRate = '';
    localStorage.removeItem(STORAGE_KEY);
  }
}
