import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { LoadingService } from 'src/app/services/loading.service';
import { SystemApiService } from 'src/app/services/system.service';

@Component({
  selector: 'app-config-backup',
  templateUrl: './config-backup.component.html',
  styleUrls: ['./config-backup.component.scss'],
})
export class ConfigBackupComponent {
  importing: boolean = false;

  constructor(
    private http: HttpClient,
    private toastr: ToastrService,
    private loadingService: LoadingService,
    private systemService: SystemApiService,
  ) {}

  exportConfig(): void {
    this.http.get('/api/lottoaxe/config/export', { responseType: 'blob' })
      .pipe(this.loadingService.lockUIUntilComplete())
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'lottoaxe-config.json';
          a.click();
          window.URL.revokeObjectURL(url);
          this.toastr.success('Config exported');
        },
        error: () => this.toastr.error('Export failed'),
      });
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        if (json._firmware !== 'LottoAxe OS') {
          this.toastr.error('Invalid config file: not a LottoAxe OS backup');
          return;
        }
        this.importConfig(json);
      } catch {
        this.toastr.error('Invalid JSON file');
      }
    };

    reader.readAsText(file);
    input.value = '';
  }

  private importConfig(json: any): void {
    if (!confirm('Import this config? Current settings will be overwritten. A restart is required after import.')) return;

    this.http.post<any>('/api/lottoaxe/config/import', json)
      .pipe(this.loadingService.lockUIUntilComplete())
      .subscribe({
        next: (resp) => {
          this.toastr.success(resp.message);
        },
        error: () => this.toastr.error('Import failed'),
      });
  }

  factoryReset(): void {
    const msg = 'FACTORY RESET will erase ALL settings (WiFi, pool, tuning) and reboot the device. '
      + 'You will need to reconnect via the Bitaxe AP. Are you sure?';
    if (!confirm(msg)) return;
    if (!confirm('This cannot be undone. Confirm factory reset?')) return;

    this.http.post<any>('/api/lottoaxe/config/factory-reset', {})
      .subscribe({
        next: () => {
          this.toastr.warning('Factory reset in progress. Device is rebooting...');
        },
        error: () => {
          this.toastr.warning('Device is rebooting after factory reset...');
        },
      });
  }

  restart(): void {
    this.systemService.restart().subscribe({
      next: () => this.toastr.success('Device restarted'),
      error: () => this.toastr.error('Restart failed'),
    });
  }
}
