import { Component, OnInit } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { SystemApiService } from '../services/system.service';
import { LayoutService } from './service/app.layout.service';
import { SystemInfo as ISystemInfo } from 'src/app/generated/models';

@Component({
  selector: 'app-menu',
  templateUrl: './app.menu.component.html'
})
export class AppMenuComponent implements OnInit {
  public info$!: Observable<ISystemInfo>;

  model: any[] = [];

  constructor(public layoutService: LayoutService,
    private systemService: SystemApiService,
  ) {
    this.info$ = this.systemService.getInfo().pipe(shareReplay({ refCount: true, bufferSize: 1 }))
  }

  ngOnInit() {
    this.model = [
      {
        label: 'MINING',
        items: [
          { label: 'Dashboard', icon: 'pi pi-fw pi-home', routerLink: ['/'] },
          { label: 'Lottery', icon: 'pi pi-fw pi-star', routerLink: ['lottery'] },
          { label: 'Golden Hash', icon: 'pi pi-fw pi-search', routerLink: ['golden-hash'] },
          { label: 'Mining Aura', icon: 'pi pi-fw pi-palette', routerLink: ['mining-aura'] },
          { label: 'Achievements', icon: 'pi pi-fw pi-verified', routerLink: ['achievements'] },
          { label: 'Near Miss', icon: 'pi pi-fw pi-bullseye', routerLink: ['near-miss'] },
          { label: 'Solo Radio', icon: 'pi pi-fw pi-wifi', routerLink: ['solo-radio'] },
          { label: 'Hash DNA', icon: 'pi pi-fw pi-sparkles', routerLink: ['hash-dna'] },
          { label: 'Scoreboard', icon: 'pi pi-fw pi-trophy', routerLink: ['scoreboard'] },
          { label: 'Fleet', icon: 'pi pi-fw pi-sitemap', routerLink: ['swarm'] },
          { label: 'Logs', icon: 'pi pi-fw pi-list', routerLink: ['logs'] },
          { label: 'System', icon: 'pi pi-fw pi-wave-pulse', routerLink: ['system'] },
        ]
      },
      {
        label: 'CONFIGURE',
        items: [
          { label: 'Pool', icon: 'pi pi-fw pi-server', routerLink: ['pool'] },
          { label: 'Pool Profiles', icon: 'pi pi-fw pi-bookmark', routerLink: ['pool-profiles'] },
          { label: 'Tuning', icon: 'pi pi-fw pi-sliders-h', routerLink: ['tuning'] },
          { label: 'Auto-Tune', icon: 'pi pi-fw pi-bolt', routerLink: ['auto-tune'] },
          { label: 'OC Scheduler', icon: 'pi pi-fw pi-clock', routerLink: ['overclock-scheduler'] },
          { label: 'Network', icon: 'pi pi-fw pi-wifi', routerLink: ['network'] },
          { label: 'Settings', icon: 'pi pi-fw pi-cog', routerLink: ['settings'] },
        ]
      },
      {
        label: 'TOOLS',
        items: [
          { label: 'Energy Calc', icon: 'pi pi-fw pi-bolt', routerLink: ['energy'] },
          { label: 'Hashrate History', icon: 'pi pi-fw pi-chart-line', routerLink: ['hashrate-history'] },
          { label: 'ASIC Health', icon: 'pi pi-fw pi-heart', routerLink: ['asic-health'] },
          { label: 'Thermal', icon: 'pi pi-fw pi-sun', routerLink: ['thermal'] },
          { label: 'Theme', icon: 'pi pi-fw pi-palette', routerLink: ['design'] },
          { label: 'Config', icon: 'pi pi-fw pi-download', routerLink: ['config'] },
          { label: 'How To', icon: 'pi pi-fw pi-question-circle', routerLink: ['how-to'] },
          { label: 'Update', icon: 'pi pi-fw pi-sync', routerLink: ['update'] },
          { label: 'Terms', icon: 'pi pi-fw pi-file', routerLink: ['terms'] },
        ]
      }
    ];
  }
}
