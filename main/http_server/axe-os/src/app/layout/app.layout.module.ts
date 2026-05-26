import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { BadgeModule } from 'primeng/badge';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { RadioButtonModule } from 'primeng/radiobutton';
import { RippleModule } from 'primeng/ripple';
import { SidebarModule } from 'primeng/sidebar';
import { TooltipModule } from 'primeng/tooltip';
import { PrimeNGModule } from '../prime-ng.module';
import { AppFooterComponent } from './app.footer.component';
import { AppLayoutComponent } from './app.layout.component';
import { AppMenuComponent } from './app.menu.component';
import { AppMenuitemComponent } from './app.menuitem.component';
import { AppSidebarComponent } from './app.sidebar.component';
import { AppTopBarComponent } from './app.topbar.component';
import { LoadingComponent } from '../components/loading/loading.component';
import { WifiIconComponent } from '../components/wifi-icon/wifi-icon.component';
import { LuckyShareComponent } from '../components/lucky-share/lucky-share.component';
import { HashSuffixPipe } from '../pipes/hash-suffix.pipe';
import { DiffSuffixPipe } from '../pipes/diff-suffix.pipe';

@NgModule({
    declarations: [
        AppMenuitemComponent,
        AppTopBarComponent,
        AppFooterComponent,
        AppMenuComponent,
        AppSidebarComponent,
        AppLayoutComponent,
        LoadingComponent,
        WifiIconComponent,
        LuckyShareComponent,
        HashSuffixPipe,
        DiffSuffixPipe,
    ],
    imports: [
        BrowserModule,
        FormsModule,
        HttpClientModule,
        BrowserAnimationsModule,
        InputTextModule,
        SidebarModule,
        BadgeModule,
        RadioButtonModule,
        InputSwitchModule,
        RippleModule,
        RouterModule,
        PrimeNGModule,
        TooltipModule,
    ],
    exports: [AppLayoutComponent, WifiIconComponent, HashSuffixPipe, DiffSuffixPipe, LuckyShareComponent]
})
export class AppLayoutModule { }
