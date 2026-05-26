import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, timer } from 'rxjs';
import { SystemApiService } from './system.service';

const VERSION_URL = 'https://lottoaxe.com/version.json';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check once per hour

export interface VersionManifest {
  version: string;
  released: string;
  changelog: string;
  downloadUrl: string;
  firmwareFiles?: {
    'esp-miner'?: string;
    'www'?: string;
  };
}

export interface UpdateStatus {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  changelog: string;
  downloadUrl: string;
  released: string;
  dismissed: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class UpdateCheckService {

  private updateStatus$ = new BehaviorSubject<UpdateStatus | null>(null);

  /** Observable that components can subscribe to for update state. */
  public status$: Observable<UpdateStatus | null> = this.updateStatus$.asObservable();

  constructor(
    private http: HttpClient,
    private systemService: SystemApiService
  ) {}

  /**
   * Start periodic update checks.
   * Call once from the root layout component.
   */
  startChecking(): void {
    // Check immediately, then every hour
    timer(0, CHECK_INTERVAL_MS).pipe(
      switchMap(() => this.checkForUpdate())
    ).subscribe();
  }

  /**
   * Dismiss the update banner for this session.
   * It will reappear on next page reload.
   */
  dismiss(): void {
    const current = this.updateStatus$.value;
    if (current) {
      this.updateStatus$.next({ ...current, dismissed: true });
    }
  }

  /**
   * Fetch the remote version manifest and compare against running firmware.
   */
  private checkForUpdate(): Observable<void> {
    return this.systemService.getInfo().pipe(
      switchMap(info => {
        const currentVersion = info.version || info.axeOSVersion || '0.0.0';

        return this.http.get<VersionManifest>(VERSION_URL).pipe(
          map(manifest => {
            const isNewer = this.isNewerVersion(manifest.version, currentVersion);

            this.updateStatus$.next({
              available: isNewer,
              currentVersion,
              latestVersion: manifest.version,
              changelog: manifest.changelog || '',
              downloadUrl: manifest.downloadUrl || 'https://lottoaxe.com/download.html',
              released: manifest.released || '',
              dismissed: false
            });
          }),
          catchError(() => {
            // Network error or CORS issue — silently ignore
            return of(undefined);
          })
        );
      }),
      catchError(() => of(undefined))
    );
  }

  /**
   * Simple semver comparison: returns true if remote > local.
   * Handles versions like "2.0.0", "v2.0.0", "2.0.0-beta.1"
   */
  private isNewerVersion(remote: string, local: string): boolean {
    const parse = (v: string): number[] => {
      // Strip leading 'v' and anything after a dash (pre-release tag)
      const clean = v.replace(/^v/i, '').split('-')[0];
      return clean.split('.').map(n => parseInt(n, 10) || 0);
    };

    const r = parse(remote);
    const l = parse(local);
    const maxLen = Math.max(r.length, l.length);

    for (let i = 0; i < maxLen; i++) {
      const rv = r[i] || 0;
      const lv = l[i] || 0;
      if (rv > lv) return true;
      if (rv < lv) return false;
    }

    return false; // equal
  }
}
