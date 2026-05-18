import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { LoadingService } from 'src/app/services/loading.service';

interface PoolProfile {
  name: string;
  url: string;
  port: number;
  user: string;
  pass: string;
  difficulty: number;
  extranonceSubscribe: boolean;
  tls: number;
}

interface PoolProfilesResponse {
  profiles: PoolProfile[];
  activeIndex: number;
}

@Component({
  selector: 'app-pool-profiles',
  templateUrl: './pool-profiles.component.html',
  styleUrls: ['./pool-profiles.component.scss'],
})
export class PoolProfilesComponent implements OnInit {
  profiles: PoolProfile[] = [];
  activeIndex: number = 0;
  showAddForm: boolean = false;
  addForm!: FormGroup;

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private loadingService: LoadingService,
  ) {}

  ngOnInit(): void {
    this.loadProfiles();
    this.addForm = this.fb.group({
      name: ['', Validators.required],
      url: ['', Validators.required],
      port: [3333, [Validators.required, Validators.min(1), Validators.max(65535)]],
      user: ['', Validators.required],
      pass: ['x'],
      difficulty: [1, [Validators.required, Validators.min(0)]],
      extranonceSubscribe: [false],
      tls: [0],
    });
  }

  loadProfiles(): void {
    this.http.get<PoolProfilesResponse>('/api/lottoaxe/profiles')
      .pipe(this.loadingService.lockUIUntilComplete())
      .subscribe({
        next: (data) => {
          this.profiles = data.profiles;
          this.activeIndex = data.activeIndex;
        },
        error: () => this.toastr.error('Failed to load pool profiles'),
      });
  }

  activateProfile(index: number): void {
    this.http.put<any>(`/api/lottoaxe/profiles/activate?index=${index}`, {})
      .pipe(this.loadingService.lockUIUntilComplete())
      .subscribe({
        next: (resp) => {
          this.activeIndex = index;
          this.toastr.success(resp.message);
        },
        error: () => this.toastr.error('Failed to activate profile'),
      });
  }

  deleteProfile(index: number): void {
    if (!confirm(`Delete profile "${this.profiles[index].name}"?`)) return;
    this.http.delete<any>(`/api/lottoaxe/profiles?index=${index}`)
      .pipe(this.loadingService.lockUIUntilComplete())
      .subscribe({
        next: () => {
          this.toastr.success('Profile deleted');
          this.loadProfiles();
        },
        error: () => this.toastr.error('Failed to delete profile'),
      });
  }

  addProfile(): void {
    if (!this.addForm.valid) return;
    this.http.post<any>('/api/lottoaxe/profiles', this.addForm.value)
      .pipe(this.loadingService.lockUIUntilComplete())
      .subscribe({
        next: () => {
          this.toastr.success('Profile added');
          this.showAddForm = false;
          this.addForm.reset({ port: 3333, pass: 'x', difficulty: 1, tls: 0, extranonceSubscribe: false });
          this.loadProfiles();
        },
        error: (err) => this.toastr.error(err.error?.message || 'Failed to add profile'),
      });
  }
}
