import { Component, ElementRef, Input, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject, interval, startWith, switchMap, takeUntil, shareReplay, finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { SystemApiService } from 'src/app/services/system.service';
import { LayoutService } from './service/app.layout.service';
import { SensitiveData } from 'src/app/services/sensitive-data.service';
import { DashboardEditService } from 'src/app/services/dashboard-edit.service';
import { SystemInfo as ISystemInfo } from 'src/app/generated/models';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-topbar',
  templateUrl: './app.topbar.component.html'
})
export class AppTopBarComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  public info$!: Observable<ISystemInfo>;
  public sensitiveDataHidden: boolean = false;
  public isMiningPaused: boolean = false;
  public items!: MenuItem[];

  @Input() isAPMode: boolean = false;

  @ViewChild('menubutton') menuButton!: ElementRef;

  constructor(
    public layoutService: LayoutService,
    private systemService: SystemApiService,
    private toastr: ToastrService,
    private sensitiveData: SensitiveData,
    public dashboardEdit: DashboardEditService,
  ) {
    // Poll every 5 seconds so the topbar stats stay live across all pages
    this.info$ = interval(5000).pipe(
      startWith(0),
      switchMap(() => this.systemService.getInfo()),
      takeUntil(this.destroy$),
      shareReplay({ refCount: true, bufferSize: 1 })
    );
  }

  ngOnInit() {
    this.sensitiveData.hidden
      .pipe(takeUntil(this.destroy$))
      .subscribe((hidden: boolean) => {
        this.sensitiveDataHidden = hidden;
      });

    this.info$.pipe(takeUntil(this.destroy$)).subscribe((info: ISystemInfo) => {
      if ((info as any).miningPaused !== undefined) {
        this.isMiningPaused = (info as any).miningPaused;
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public toggleSensitiveData() {
    this.sensitiveData.toggle();
  }

  public toggleMiningPaused() {
    const verb = this.isMiningPaused ? 'resume' : 'pause';
    if (!confirm(`Are you sure you want to ${verb} mining?`)) return;
    const action = this.isMiningPaused
      ? this.systemService.resumeMining()
      : this.systemService.pauseMining();
    const newPausedState = !this.isMiningPaused;
    action.subscribe({
      next: (response) => {
        this.isMiningPaused = newPausedState;
        this.toastr.success(response.message);
      },
      error: () => this.toastr.error('Failed to change mining state')
    });
  }

  public restart() {
    if (!confirm('Are you sure you want to restart the device? Mining will be interrupted for ~30 seconds.')) return;
    this.systemService.restart().subscribe({
      next: () => this.toastr.success('Device restarted'),
      error: () => this.toastr.error('Restart failed')
    });
  }
}
