import 'chartjs-adapter-moment';

import { CommonModule, HashLocationStrategy, LocationStrategy } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { Api } from './generated/api';
import { ApiConfiguration } from './generated/api-configuration';
import { EditComponent } from './components/edit/edit.component';
import { PoolComponent } from './components/pool/pool.component';
import { NetworkEditComponent } from './components/network-edit/network.edit.component';
import { HomeComponent } from './components/home/home.component';
import { ModalComponent } from './components/modal/modal.component';
import { TooltipIconComponent } from './components/tooltip-icon/tooltip-icon.component';
import { TooltipTextIconComponent } from './components/tooltip-text-icon/tooltip-text-icon.component';
import { ConfettiComponent } from './components/confetti/confetti.component';
import { SnowflakesComponent } from './components/snowflakes/snowflakes.component';
import { LogsComponent } from './components/logs/logs.component';
import { SystemComponent } from './components/system/system.component';
import { UpdateComponent } from './components/update/update.component';
import { NetworkComponent } from './components/network/network.component';
import { SettingsComponent } from './components/settings/settings.component';
import { SwarmComponent } from './components/swarm/swarm.component';
import { ScoreboardComponent } from './components/scoreboard/scoreboard.component';
import { ThemeConfigComponent } from './components/design/theme-config.component';
import { DesignComponent } from './components/design/design.component';
import { AppLayoutModule } from './layout/app.layout.module';
import { ANSIPipe } from './pipes/ansi.pipe';
import { DateAgoPipe } from './pipes/date-ago.pipe';
import { DiffSuffixPipe } from './pipes/diff-suffix.pipe';
import { AddressPipe } from './pipes/address.pipe';
import { SatsPipe } from './pipes/sats.pipe';
import { PrimeNGModule } from './prime-ng.module';
import { MessageModule } from 'primeng/message';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { DialogService as PrimeDialogService } from 'primeng/dynamicdialog';
import { DialogService, DialogListComponent } from './services/dialog.service';
import { PoolProfilesComponent } from './components/pool-profiles/pool-profiles.component';
import { TuningPresetsComponent } from './components/tuning-presets/tuning-presets.component';
import { ConfigBackupComponent } from './components/config-backup/config-backup.component';
import { BootSplashComponent } from './components/boot-splash/boot-splash.component';
import { DisclaimerComponent } from './components/disclaimer/disclaimer.component';
import { TermsComponent } from './components/terms/terms.component';
import { HoldConfirmComponent } from './components/hold-confirm/hold-confirm.component';
import { AchievementsComponent } from './components/achievements/achievements.component';
import { LotteryStatsComponent } from './components/lottery-stats/lottery-stats.component';
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

const components = [
  AppComponent,
  EditComponent,
  NetworkEditComponent,
  HomeComponent,
  ModalComponent,
  TooltipIconComponent,
  TooltipTextIconComponent,
  ConfettiComponent,
  SnowflakesComponent,
  NetworkComponent,
  SettingsComponent,
  LogsComponent,
  SystemComponent,
  UpdateComponent,
  PoolComponent
];

@NgModule({
  declarations: [
    ...components,

    ANSIPipe,
    DateAgoPipe,
    SwarmComponent,
    ScoreboardComponent,
    SettingsComponent,
    AddressPipe,
    SatsPipe,
    ThemeConfigComponent,
    DesignComponent,
    PoolComponent,
    PoolProfilesComponent,
    TuningPresetsComponent,
    ConfigBackupComponent,
    BootSplashComponent,
    DisclaimerComponent,
    TermsComponent,
    HoldConfirmComponent,
    DialogListComponent,
    AchievementsComponent,
    LotteryStatsComponent,
    EnergyCalcComponent,
    HashrateHistoryComponent,
    ThermalPredictionComponent,
    GoldenHashComponent,
    MiningAuraComponent,
    OverclockSchedulerComponent,
    HowToComponent,
    AutoTuneComponent,
    AsicHealthComponent,
    NearMissComponent,
    SoloRadioComponent,
    HashDnaComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    ToastrModule.forRoot({
      positionClass: 'toast-bottom-right'
    }),
    BrowserAnimationsModule,
    CommonModule,
    PrimeNGModule,
    AppLayoutModule,
    MessageModule,
    TooltipModule,
    DialogModule
  ],
  providers: [
    { provide: LocationStrategy, useClass: HashLocationStrategy },
    { provide: ApiConfiguration, useValue: { rootUrl: '' } },
    Api,
    DialogService,
    PrimeDialogService,
    provideHttpClient()
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
