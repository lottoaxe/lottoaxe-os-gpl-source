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
import { TermsComponent } from './components/terms/terms.component';
import { LotteryStatsComponent } from './components/lottery-stats/lottery-stats.component';
import { AchievementsComponent } from './components/achievements/achievements.component';
import { EnergyCalcComponent } from './components/energy-calc/energy-calc.component';
import { HashrateHistoryComponent } from './components/hashrate-history/hashrate-history.component';
import { ThermalPredictionComponent } from './components/thermal-prediction/thermal-prediction.component';
import { GoldenHashComponent } from './components/golden-hash/golden-hash.component';
import { MiningAuraComponent } from './components/mining-aura/mining-aura.component';
import { OverclockSchedulerComponent } from './components/overclock-scheduler/overclock-scheduler.component';
import { HowToComponent } from './components/how-to/how-to.component';
import { AutoTuneComponent } from './components/auto-tune/auto-tune.component';
import { AsicHealthComponent } from './components/asic-health/asic-health.component';
import { NearMissComponent } from './components/near-miss/near-miss.component';
import { SoloRadioComponent } from './components/solo-radio/solo-radio.component';
import { HashDnaComponent } from './components/hash-dna/hash-dna.component';
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
        title: `${TITLE_PREFIX} Fleet`,
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
      },
      {
        path: 'lottery',
        component: LotteryStatsComponent,
        title: `${TITLE_PREFIX} Lottery`,
      },
      {
        path: 'achievements',
        component: AchievementsComponent,
        title: `${TITLE_PREFIX} Achievements`,
      },
      {
        path: 'energy',
        component: EnergyCalcComponent,
        title: `${TITLE_PREFIX} Energy`,
      },
      {
        path: 'terms',
        component: TermsComponent,
        title: `${TITLE_PREFIX} Terms`,
      },
      {
        path: 'hashrate-history',
        component: HashrateHistoryComponent,
        title: `${TITLE_PREFIX} Hashrate History`,
      },
      {
        path: 'thermal',
        component: ThermalPredictionComponent,
        title: `${TITLE_PREFIX} Thermal`,
      },
      {
        path: 'golden-hash',
        component: GoldenHashComponent,
        title: `${TITLE_PREFIX} Golden Hash`,
      },
      {
        path: 'mining-aura',
        component: MiningAuraComponent,
        title: `${TITLE_PREFIX} Mining Aura`,
      },
      {
        path: 'overclock-scheduler',
        component: OverclockSchedulerComponent,
        title: `${TITLE_PREFIX} Overclock Scheduler`,
      },
      {
        path: 'how-to',
        component: HowToComponent,
        title: `${TITLE_PREFIX} How To`,
      },
      {
        path: 'auto-tune',
        component: AutoTuneComponent,
        title: `${TITLE_PREFIX} Auto-Tune`,
      },
      {
        path: 'asic-health',
        component: AsicHealthComponent,
        title: `${TITLE_PREFIX} ASIC Health`,
      },
      {
        path: 'near-miss',
        component: NearMissComponent,
        title: `${TITLE_PREFIX} Near Miss`,
      },
      {
        path: 'solo-radio',
        component: SoloRadioComponent,
        title: `${TITLE_PREFIX} Solo Radio`,
      },
      {
        path: 'hash-dna',
        component: HashDnaComponent,
        title: `${TITLE_PREFIX} Hash DNA`,
      }
    ]
  },

];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
