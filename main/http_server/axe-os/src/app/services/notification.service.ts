import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, catchError, map, of, switchMap, timer, takeUntil } from 'rxjs';

const NOTIFICATIONS_URL = 'https://lottoaxe.com/notifications.json';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const DISMISSED_KEY = 'la_dismissed_notifications';

export interface RemoteNotification {
  id: string;
  type: 'info' | 'warning' | 'urgent';
  title: string;
  message: string;
  link?: string;
  linkText?: string;
  expires?: string;   // ISO 8601 date string
  priority?: number;  // lower = higher priority (default 10)
}

interface NotificationsManifest {
  notifications: RemoteNotification[];
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService implements OnDestroy {

  private destroy$ = new Subject<void>();
  private notifications$ = new BehaviorSubject<RemoteNotification[]>([]);

  /** Active, non-dismissed, non-expired notifications sorted by priority. */
  public active$: Observable<RemoteNotification[]> = this.notifications$.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Begin polling for remote notifications.
   * Call once from the root layout component.
   */
  startPolling(): void {
    timer(3000, POLL_INTERVAL_MS).pipe(
      takeUntil(this.destroy$),
      switchMap(() => this.fetchNotifications())
    ).subscribe();
  }

  /**
   * Dismiss a notification by ID. Persists to localStorage so it
   * stays dismissed across page reloads.
   */
  dismiss(id: string): void {
    const dismissed = this.getDismissed();
    dismissed.add(id);
    this.saveDismissed(dismissed);

    // Re-filter the current list
    const current = this.notifications$.value.filter(n => n.id !== id);
    this.notifications$.next(current);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private fetchNotifications(): Observable<void> {
    return this.http.get<NotificationsManifest>(NOTIFICATIONS_URL).pipe(
      map(manifest => {
        const now = new Date();
        const dismissed = this.getDismissed();

        const active = (manifest.notifications || [])
          // Filter expired
          .filter(n => !n.expires || new Date(n.expires) > now)
          // Filter dismissed
          .filter(n => !dismissed.has(n.id))
          // Sort by priority (lower = first)
          .sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));

        this.notifications$.next(active);
      }),
      catchError(() => {
        // Network error, CORS issue, invalid JSON — silently ignore.
        // The device is behind a miner's home network; transient failures
        // are expected and harmless.
        return of(undefined);
      })
    );
  }

  private getDismissed(): Set<string> {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set();
    }
  }

  private saveDismissed(dismissed: Set<string>): void {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
    } catch {
      // localStorage quota or private browsing — ignore
    }
  }
}
