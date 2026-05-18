import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

export interface ThemeSettings {
  colorScheme: string;
  accentColors?: {
    [key: string]: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly mockSettings: ThemeSettings = {
    colorScheme: 'dark',
    accentColors: {
      '--primary-color': '#8DFF00',
      '--primary-color-text': '#050505',
      '--highlight-bg': '#8DFF00',
      '--highlight-text-color': '#050505',
      '--focus-ring': '0 0 0 0.2rem rgba(141,255,0,0.25)',
      '--slider-bg': '#2A2A2A',
      '--slider-range-bg': '#8DFF00',
      '--slider-handle-bg': '#8DFF00',
      '--progressbar-bg': '#2A2A2A',
      '--progressbar-value-bg': '#8DFF00',
      '--checkbox-border': '#8DFF00',
      '--checkbox-bg': '#8DFF00',
      '--checkbox-hover-bg': '#6BFF00',
      '--button-bg': '#8DFF00',
      '--button-hover-bg': '#6BFF00',
      '--button-focus-shadow': '0 0 0 2px #050505, 0 0 0 4px #8DFF00',
      '--togglebutton-bg': '#8DFF00',
      '--togglebutton-border': '1px solid #8DFF00',
      '--togglebutton-hover-bg': '#6BFF00',
      '--togglebutton-hover-border': '1px solid #6BFF00',
      '--togglebutton-text-color': '#050505'
    }
  };

  private themeSettingsSubject = new BehaviorSubject<ThemeSettings>(this.mockSettings);
  private themeSettings$ = this.themeSettingsSubject.asObservable();

  constructor(private http: HttpClient) {
    if (environment.production) {
      this.http.get<ThemeSettings>('/api/theme').pipe(
        catchError(() => of(this.mockSettings)),
        tap(settings => this.themeSettingsSubject.next(settings))
      ).subscribe();
    }
  }

  getThemeSettings(): Observable<ThemeSettings> {
    return this.themeSettings$;
  }

  saveThemeSettings(settings: ThemeSettings): Observable<void> {
    if (environment.production) {
      return this.http.post<void>('/api/theme', settings).pipe(
        tap(() => this.themeSettingsSubject.next(settings))
      );
    } else {
      this.themeSettingsSubject.next(settings);
      return of(void 0);
    }
  }
}
