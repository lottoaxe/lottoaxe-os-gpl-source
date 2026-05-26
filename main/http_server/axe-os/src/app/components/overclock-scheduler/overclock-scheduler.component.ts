import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { Observable, Subject, interval, switchMap, startWith, shareReplay, takeUntil, finalize } from 'rxjs';
import { SystemApiService } from 'src/app/services/system.service';
import { LoadingService } from 'src/app/services/loading.service';
import { LocalStorageService } from 'src/app/local-storage.service';
import { SystemInfo as ISystemInfo } from 'src/app/generated/models';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ScheduleEntry {
  id: string;
  name: string;
  enabled: boolean;
  startHour: number;   // 0-23
  startMinute: number;  // 0-59
  endHour: number;
  endMinute: number;
  days: boolean[];      // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  frequency: number;    // MHz
  coreVoltage: number;  // mV
  fanSpeed: number;     // 0-100 percent
}

export interface PresetProfile {
  name: string;
  label: string;
  frequency: number;
  coreVoltage: number;
  fanSpeed: number;
  color: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'LA_OC_SCHEDULES';
const TIME_FORMAT_KEY = 'LA_OC_TIME_FORMAT';

const PRESET_PROFILES: PresetProfile[] = [
  { name: 'silent',      label: 'Silent',      frequency: 400, coreVoltage: 1100, fanSpeed: 25,  color: '#64748b' },
  { name: 'eco',         label: 'Eco',         frequency: 425, coreVoltage: 1150, fanSpeed: 35,  color: '#22c55e' },
  { name: 'balanced',    label: 'Balanced',    frequency: 485, coreVoltage: 1200, fanSpeed: 50,  color: '#38bdf8' },
  { name: 'performance', label: 'Performance', frequency: 525, coreVoltage: 1250, fanSpeed: 70,  color: '#f59e0b' },
  { name: 'lotto',       label: 'Lotto',       frequency: 550, coreVoltage: 1275, fanSpeed: 85,  color: '#a855f7' },
  { name: 'yolo',        label: 'YOLO',        frequency: 575, coreVoltage: 1300, fanSpeed: 100, color: '#ef4444' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'app-overclock-scheduler',
  templateUrl: './overclock-scheduler.component.html',
  styleUrls: ['./overclock-scheduler.component.scss']
})
export class OverclockSchedulerComponent implements OnInit, OnDestroy {

  public info$!: Observable<ISystemInfo>;
  public schedules: ScheduleEntry[] = [];
  public presets: PresetProfile[] = PRESET_PROFILES;
  public dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  public editingId: string | null = null;
  public editForm!: FormGroup;
  public use24HourFormat: boolean = true;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private systemService: SystemApiService,
    private loadingService: LoadingService,
    private localStorageService: LocalStorageService
  ) {}

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  ngOnInit(): void {
    this.loadSchedules();
    this.loadTimeFormat();
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

    this.editForm = this.fb.group({
      name: [''],
      startHour: [0],
      startMinute: [0],
      endHour: [0],
      endMinute: [0],
      days: this.fb.array([true, true, true, true, true, true, true]),
      frequency: [485],
      coreVoltage: [1200],
      fanSpeed: [50],
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // -----------------------------------------------------------------------
  // Schedule CRUD
  // -----------------------------------------------------------------------

  addSchedule(): void {
    const entry: ScheduleEntry = {
      id: this.generateId(),
      name: 'Schedule ' + (this.schedules.length + 1),
      enabled: true,
      startHour: 0,
      startMinute: 0,
      endHour: 6,
      endMinute: 0,
      days: [true, true, true, true, true, true, true],
      frequency: 485,
      coreVoltage: 1200,
      fanSpeed: 50,
    };
    this.schedules.push(entry);
    this.saveSchedules();
    this.startEditing(entry);
  }

  removeSchedule(id: string): void {
    this.schedules = this.schedules.filter(s => s.id !== id);
    if (this.editingId === id) {
      this.editingId = null;
    }
    this.saveSchedules();
  }

  toggleSchedule(id: string): void {
    const entry = this.schedules.find(s => s.id === id);
    if (entry) {
      entry.enabled = !entry.enabled;
      this.saveSchedules();
    }
  }

  duplicateSchedule(entry: ScheduleEntry): void {
    const copy: ScheduleEntry = {
      ...entry,
      id: this.generateId(),
      name: entry.name + ' (copy)',
    };
    this.schedules.push(copy);
    this.saveSchedules();
  }

  // -----------------------------------------------------------------------
  // Editing
  // -----------------------------------------------------------------------

  startEditing(entry: ScheduleEntry): void {
    this.editingId = entry.id;
    this.editForm.patchValue({
      name: entry.name,
      startHour: entry.startHour,
      startMinute: entry.startMinute,
      endHour: entry.endHour,
      endMinute: entry.endMinute,
      frequency: entry.frequency,
      coreVoltage: entry.coreVoltage,
      fanSpeed: entry.fanSpeed,
    });
    const daysArray = this.editForm.get('days') as FormArray;
    entry.days.forEach((val, i) => daysArray.at(i).setValue(val));
  }

  saveEditing(): void {
    if (!this.editingId) return;
    const entry = this.schedules.find(s => s.id === this.editingId);
    if (!entry) return;

    const vals = this.editForm.value;
    entry.name = vals.name;
    entry.startHour = vals.startHour;
    entry.startMinute = vals.startMinute;
    entry.endHour = vals.endHour;
    entry.endMinute = vals.endMinute;
    entry.days = vals.days;
    entry.frequency = vals.frequency;
    entry.coreVoltage = vals.coreVoltage;
    entry.fanSpeed = vals.fanSpeed;

    this.editingId = null;
    this.saveSchedules();
  }

  cancelEditing(): void {
    this.editingId = null;
  }

  applyPreset(preset: PresetProfile): void {
    this.editForm.patchValue({
      frequency: preset.frequency,
      coreVoltage: preset.coreVoltage,
      fanSpeed: preset.fanSpeed,
    });
  }

  get daysFormArray(): FormArray {
    return this.editForm.get('days') as FormArray;
  }

  // -----------------------------------------------------------------------
  // Quick presets (full schedule presets)
  // -----------------------------------------------------------------------

  addNightMode(): void {
    const entry: ScheduleEntry = {
      id: this.generateId(),
      name: 'Night Mode',
      enabled: true,
      startHour: 22,
      startMinute: 0,
      endHour: 7,
      endMinute: 0,
      days: [true, true, true, true, true, true, true],
      frequency: 400,
      coreVoltage: 1100,
      fanSpeed: 25,
    };
    this.schedules.push(entry);
    this.saveSchedules();
  }

  addPeakHours(): void {
    const entry: ScheduleEntry = {
      id: this.generateId(),
      name: 'Peak Hours',
      enabled: true,
      startHour: 14,
      startMinute: 0,
      endHour: 20,
      endMinute: 0,
      days: [false, true, true, true, true, true, false],
      frequency: 425,
      coreVoltage: 1150,
      fanSpeed: 35,
    };
    this.schedules.push(entry);
    this.saveSchedules();
  }

  addWeekendOC(): void {
    const entry: ScheduleEntry = {
      id: this.generateId(),
      name: 'Weekend OC',
      enabled: true,
      startHour: 0,
      startMinute: 0,
      endHour: 23,
      endMinute: 59,
      days: [true, false, false, false, false, false, true],
      frequency: 550,
      coreVoltage: 1275,
      fanSpeed: 85,
    };
    this.schedules.push(entry);
    this.saveSchedules();
  }

  // -----------------------------------------------------------------------
  // Schedule Active Checks
  // -----------------------------------------------------------------------

  getActiveSchedule(): ScheduleEntry | null {
    for (const entry of this.schedules) {
      if (entry.enabled && this.isScheduleActive(entry)) {
        return entry;
      }
    }
    return null;
  }

  isScheduleActive(entry: ScheduleEntry): boolean {
    const now = new Date();
    const currentDay = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = entry.startHour * 60 + entry.startMinute;
    const endMinutes = entry.endHour * 60 + entry.endMinute;

    if (!entry.days[currentDay]) {
      // Check if an overnight schedule from yesterday is still active
      const yesterday = (currentDay + 6) % 7;
      if (entry.days[yesterday] && startMinutes > endMinutes && currentMinutes < endMinutes) {
        return true;
      }
      return false;
    }

    // Same-day schedule (e.g., 09:00 - 17:00)
    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    // Overnight schedule (e.g., 22:00 - 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  // -----------------------------------------------------------------------
  // Time Format Toggle
  // -----------------------------------------------------------------------

  toggleTimeFormat(): void {
    this.use24HourFormat = !this.use24HourFormat;
    this.localStorageService.setBool(TIME_FORMAT_KEY, this.use24HourFormat);
  }

  private loadTimeFormat(): void {
    const stored = this.localStorageService.getItem(TIME_FORMAT_KEY);
    if (stored !== null) {
      this.use24HourFormat = stored === 'true';
    }
  }

  // -----------------------------------------------------------------------
  // Time Display Helpers
  // -----------------------------------------------------------------------

  getCurrentTimeDisplay(): string {
    const now = new Date();
    return this.formatTime(now.getHours(), now.getMinutes());
  }

  getCurrentDayDisplay(): string {
    return this.dayNames[new Date().getDay()];
  }

  getNextTransition(): string {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let closestMinutes = Infinity;
    let closestLabel = '';

    for (const entry of this.schedules) {
      if (!entry.enabled) continue;
      const startMin = entry.startHour * 60 + entry.startMinute;
      const endMin = entry.endHour * 60 + entry.endMinute;

      // Check upcoming start
      let diffStart = startMin - currentMinutes;
      if (diffStart < 0) diffStart += 1440;
      if (diffStart < closestMinutes && diffStart > 0) {
        closestMinutes = diffStart;
        closestLabel = entry.name + ' starts';
      }

      // Check upcoming end
      let diffEnd = endMin - currentMinutes;
      if (diffEnd < 0) diffEnd += 1440;
      if (diffEnd < closestMinutes && diffEnd > 0) {
        closestMinutes = diffEnd;
        closestLabel = entry.name + ' ends';
      }
    }

    if (closestLabel === '') return 'None';
    const hrs = Math.floor(closestMinutes / 60);
    const mins = closestMinutes % 60;
    if (hrs > 0) {
      return closestLabel + ' in ' + hrs + 'h ' + mins + 'm';
    }
    return closestLabel + ' in ' + mins + 'm';
  }

  formatScheduleTime(hour: number, minute: number): string {
    return this.formatTime(hour, minute);
  }

  formatTime(hour: number, minute: number): string {
    if (this.use24HourFormat) {
      return this.padTime(hour) + ':' + this.padTime(minute);
    }
    const period = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return h12 + ':' + this.padTime(minute) + ' ' + period;
  }

  getActiveDaysDisplay(entry: ScheduleEntry): string {
    const active = entry.days
      .map((enabled, i) => enabled ? this.dayNames[i] : null)
      .filter(d => d !== null);
    if (active.length === 7) return 'Every day';
    if (active.length === 0) return 'No days';
    return active.join(', ');
  }

  // -----------------------------------------------------------------------
  // Timeline Visualization (24-hour bar)
  // -----------------------------------------------------------------------

  getTimelineSegments(): { hour: number; active: boolean; scheduleName: string; color: string }[] {
    const segments: { hour: number; active: boolean; scheduleName: string; color: string }[] = [];
    const now = new Date();
    const currentDay = now.getDay();

    for (let h = 0; h < 24; h++) {
      let isActive = false;
      let name = '';
      let color = '';

      for (const entry of this.schedules) {
        if (!entry.enabled || !entry.days[currentDay]) continue;
        const startMin = entry.startHour * 60 + entry.startMinute;
        const endMin = entry.endHour * 60 + entry.endMinute;
        const hourMin = h * 60;

        if (startMin <= endMin) {
          if (hourMin >= startMin && hourMin < endMin) {
            isActive = true;
            name = entry.name;
            color = this.getScheduleColor(entry);
            break;
          }
        } else {
          // Overnight
          if (hourMin >= startMin || hourMin < endMin) {
            isActive = true;
            name = entry.name;
            color = this.getScheduleColor(entry);
            break;
          }
        }
      }

      segments.push({ hour: h, active: isActive, scheduleName: name, color: color || 'transparent' });
    }
    return segments;
  }

  getScheduleColor(entry: ScheduleEntry): string {
    // Color based on frequency intensity
    if (entry.frequency >= 550) return '#a855f7';
    if (entry.frequency >= 500) return '#f59e0b';
    if (entry.frequency >= 450) return '#38bdf8';
    if (entry.frequency >= 425) return '#22c55e';
    return '#64748b';
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  private loadSchedules(): void {
    const stored = this.localStorageService.getObject(STORAGE_KEY);
    if (stored && Array.isArray(stored)) {
      this.schedules = stored as ScheduleEntry[];
    }
  }

  saveSchedules(): void {
    this.localStorageService.setObject(STORAGE_KEY, this.schedules);
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  private generateId(): string {
    return 'oc_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  }

  private padTime(n: number): string {
    return n < 10 ? '0' + n : '' + n;
  }

  trackById(_index: number, item: ScheduleEntry): string {
    return item.id;
  }
}
