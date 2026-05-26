import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Observable, switchMap, shareReplay, timer, distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { FileUploadHandlerEvent, FileUpload } from 'primeng/fileupload';
import { LoadingService } from 'src/app/services/loading.service';
import { SystemApiService } from 'src/app/services/system.service';
import { UpdateCheckService, UpdateStatus } from 'src/app/services/update-check.service';
import { ModalComponent } from '../modal/modal.component';
import { SystemInfo } from 'src/app/generated/models';

@Component({
  selector: 'app-update',
  templateUrl: './update.component.html',
  styleUrls: ['./update.component.scss']
})
export class UpdateComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  public firmwareUpdateProgress: number = 0;
  public websiteUpdateProgress: number = 0;

  public uploadStep: number = 0;
  public totalSteps: number = 0;
  public currentStepLabel: string = '';

  public versionStatus: UpdateStatus | null = null;
  public info$: Observable<SystemInfo>;

  public updateStatus: 'progress' | 'success' | 'error' = 'progress';
  public updateMessage: string = '';

  @ViewChild('fileUpload') fileUpload!: FileUpload;
  @ViewChild('progressModal') progressModal?: ModalComponent;

  constructor(
    private systemService: SystemApiService,
    private toastrService: ToastrService,
    private loadingService: LoadingService,
    private updateCheck: UpdateCheckService,
  ) {
    this.info$ = timer(0, 5000).pipe(
      switchMap(() => this.systemService.getInfo()),
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
      shareReplay({ refCount: true, bufferSize: 1 })
    );
  }

  ngOnInit(): void {
    this.updateCheck.status$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.versionStatus = status;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFilesSelected(event: FileUploadHandlerEvent): void {
    const files = event.files;
    this.fileUpload.clear();

    const wwwFile = files.find((f: File) => f.name === 'www.bin');
    const fwFile = files.find((f: File) => f.name === 'esp-miner.bin');

    // Validate files
    const invalidFiles = files.filter((f: File) => f.name !== 'www.bin' && f.name !== 'esp-miner.bin');
    if (invalidFiles.length > 0) {
      this.toastrService.error(`Unrecognized file(s): ${invalidFiles.map((f: File) => f.name).join(', ')}. Expected www.bin and/or esp-miner.bin.`);
      return;
    }

    if (!wwwFile && !fwFile) {
      this.toastrService.error('No valid update files selected. Expected www.bin and/or esp-miner.bin.');
      return;
    }

    // Calculate steps
    const hasWww = !!wwwFile;
    const hasFw = !!fwFile;
    this.totalSteps = (hasWww ? 1 : 0) + (hasFw ? 1 : 0);
    this.uploadStep = 0;
    this.updateStatus = 'progress';
    this.updateMessage = '';
    this.firmwareUpdateProgress = 0;
    this.websiteUpdateProgress = 0;

    if (this.progressModal) {
      this.progressModal.isVisible = true;
    }

    if (hasWww && hasFw) {
      // Upload both: www first, then firmware
      this.uploadWww(wwwFile!, () => {
        this.uploadFirmware(fwFile!);
      });
    } else if (hasWww) {
      this.uploadWww(wwwFile!);
    } else if (hasFw) {
      this.uploadFirmware(fwFile!);
    }
  }

  private uploadWww(file: File, onSuccess?: () => void): void {
    this.uploadStep++;
    this.currentStepLabel = this.totalSteps > 1
      ? `Uploading UI update (www.bin)...`
      : `Uploading UI update...`;

    this.systemService.performWWWOTAUpdate(file).subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.websiteUpdateProgress = Math.round((event.loaded / (event.total as number)) * 100);
        } else if (event.type === HttpEventType.Response) {
          if (event.ok) {
            if (onSuccess) {
              // Continue to firmware upload
              onSuccess();
            } else {
              // Only www update — done
              this.updateStatus = 'success';
              this.updateMessage = 'UI updated successfully! The page will reload in a few seconds.';
              setTimeout(() => window.location.reload(), 3000);
            }
          } else {
            this.updateStatus = 'error';
            this.updateMessage = event.statusText || 'UI update failed.';
          }
        }
      },
      error: (err) => {
        this.updateStatus = 'error';
        this.updateMessage = err.error?.message || err.error || err.message || 'UI update failed.';
      }
    });
  }

  private uploadFirmware(file: File): void {
    this.uploadStep++;
    this.currentStepLabel = this.totalSteps > 1
      ? `Uploading firmware (esp-miner.bin)...`
      : `Uploading firmware update...`;

    this.systemService.performOTAUpdate(file).subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.firmwareUpdateProgress = Math.round((event.loaded / (event.total as number)) * 100);
        } else if (event.type === HttpEventType.Response) {
          if (event.ok) {
            this.updateStatus = 'success';
            this.updateMessage = 'Update complete! Your miner is rebooting with the new firmware. This page will reload shortly.';
            setTimeout(() => window.location.reload(), 5000);
          } else {
            this.updateStatus = 'error';
            this.updateMessage = event.statusText || 'Firmware update failed.';
          }
        }
      },
      error: (err) => {
        this.updateStatus = 'error';
        this.updateMessage = err.error?.message || err.error || err.message || 'Firmware update failed.';
      }
    });
  }
}
