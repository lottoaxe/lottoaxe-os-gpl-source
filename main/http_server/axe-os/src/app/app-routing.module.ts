import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { HomeComponent } from './components/home/home.component';
import { LogsComponent } from './components/logs/logs.component';
import { SystemComponent } from './components/system/system.component';
import { UpdateComponent } from './components/update/update.component';
import { SettingsComponent } from './components/settings/settings.component';
import { NetworkComponent } from './components/network/network.component';
import { SwarmComponent } from './components/swarm/swarm.component';
import { ScoreboardComponent } from './components/scoreboard/scoreboard.component';
import { DesignComponent } from './components/design/design.component';
import { PoolComponent } from './components/pool/pool.component';
import { PoolProfilesComponent } from './components/pool-profiles/pool-profiles.component';
import { TuningPresetsComponent } from './components/tuning-presets/tuning-presets.component';
import { ConfigBackupComponent } from './components/config-backup/config-backup.component';
import { AppLayoutComponent } from './layout/app.layout.component';
import { ApModeGuard } from './guards/ap-mode.guard';

const TITLE_PREFIX = 'LottoAxe OS';

const routes: Routes = [
  {
      path: 'ap',
      component: AppLayoutComponent,
      children: [
        {
          path: '',
          component: NetworkComponent,
          title: `${TITLE_PREFIX} Network`,
        }
      ]
  },
  {
    path: '',
    component: AppLayoutComponent,
    canActivate: [ApModeGuard],
    children: [
      {
        path: '',
        component: HomeComponent,
        title: TITLE_PREFIX,
      },
      {
        path: 'logs',
        component: LogsComponent,
        title: `${TITLE_PREFIX} Logs`,
      },
      {
        path: 'system',
        component: SystemComponent,
        title: `${TITLE_PREFIX} System`,
      },
      {
        path: 'update',
        component: UpdateComponent,
        title: `${TITLE_PREFIX} Update`,
      },
      {
        path: 'network',
        component: NetworkComponent,
        title: `${TITLE_PREFIX} Network`,
      },
      {
        path: 'settings',
        component: SettingsComponent,
        title: `${TITLE_PREFIX} Settings`,
      },
      {
        path: 'swarm',
        component: SwarmComponent,
        title: `${TITLE_PREFIX} Swarm`,
      },
      {
        path: 'scoreboard',
        component: ScoreboardComponent,
        title: `${TITLE_PREFIX} Scoreboard`,
      },
      {
        path: 'design',
        component: DesignComponent,
        title: `${TITLE_PREFIX} Theme`,
      },
      {
        path: 'pool',
        component: PoolComponent,
        title: `${TITLE_PREFIX} Pool`,
      },
      {
        path: 'pool-profiles',
        component: PoolProfilesComponent,
        title: `${TITLE_PREFIX} Pool Profiles`,
      },
      {
        path: 'tuning',
        component: TuningPresetsComponent,
        title: `${TITLE_PREFIX} Tuning`,
      },
      {
        path: 'config',
        component: ConfigBackupComponent,
        title: `${TITLE_PREFIX} Config`,
      }
    ]
  },

];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
