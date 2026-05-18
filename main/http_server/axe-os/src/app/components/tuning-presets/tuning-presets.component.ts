import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { LoadingService } from 'src/app/services/loading.service';
import { SystemApiService } from 'src/app/services/system.service';

interface TuningPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  variant: string;
  frequency: number;
  voltage: number;
  fanSpeed: number;
  autoFan: boolean;
  tempTarget: number;
  estHashrate: string;
  estPower: string;
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

interface SafetyState {
  throttled: boolean;
  throttleCount: number;
  originalFrequency: number;
  currentFrequency: number;
}

interface PresetsResponse {
  presets: any[];
  safety: SafetyState;
}

@Component({
  selector: 'app-tuning-presets',
  templateUrl: './tuning-presets.component.html',
  styleUrls: ['./tuning-presets.component.scss'],
})
export class TuningPresetsComponent implements OnInit {
  presets: TuningPreset[] = [
    {
      id: 'silent', name: 'Silent', icon: 'pi-moon', variant: 'la-preset--silent',
      description: 'Whisper quiet. Minimal fan noise for bedrooms and offices.',
      frequency: 400, voltage: 1100, fanSpeed: 30, autoFan: false, tempTarget: 50,
      estHashrate: '~300 GH/s', estPower: '~8W', riskLevel: 'low',
    },
    {
      id: 'eco', name: 'Eco', icon: 'pi-leaf', variant: 'la-preset--eco',
      description: 'Low power, efficient operation. Best J/TH ratio.',
      frequency: 425, voltage: 1150, fanSpeed: 0, autoFan: true, tempTarget: 55,
      estHashrate: '~370 GH/s', estPower: '~10W', riskLevel: 'low',
    },
    {
      id: 'balanced', name: 'Balanced', icon: 'pi-sliders-h', variant: 'la-preset--balanced',
      description: 'Default settings. Good hashrate with moderate power draw.',
      frequency: 485, voltage: 1200, fanSpeed: 0, autoFan: true, tempTarget: 60,
      estHashrate: '~475 GH/s', estPower: '~12W', riskLevel: 'medium',
    },
    {
      id: 'performance', name: 'Performance', icon: 'pi-bolt', variant: 'la-preset--performance',
      description: 'Higher hashrate. More power and heat but still safe.',
      frequency: 525, voltage: 1250, fanSpeed: 0, autoFan: true, tempTarget: 62,
      estHashrate: '~550 GH/s', estPower: '~15W', riskLevel: 'medium',
    },
    {
      id: 'lotto', name: 'Lotto Mode', icon: 'pi-star', variant: 'la-preset--lotto',
      description: 'Maximum hashrate for solo block hunting. Full send.',
      frequency: 575, voltage: 1300, fanSpeed: 100, autoFan: false, tempTarget: 65,
      estHashrate: '~600 GH/s', estPower: '~18W', riskLevel: 'high',
    },
    {
      id: 'overclock', name: 'YOLO OC', icon: 'pi-exclamation-triangle', variant: 'la-preset--overclock',
      description: 'Push past safe limits. May cause instability or hardware damage.',
      frequency: 575, voltage: 1300, fanSpeed: 100, autoFan: false, tempTarget: 65,
      estHashrate: '~620+ GH/s', estPower: '~20W+', riskLevel: 'extreme',
    },
  ];

  safety: SafetyState = { throttled: false, throttleCount: 0, originalFrequency: 0, currentFrequency: 0 };
  currentFrequency: number = 0;
  currentVoltage: number = 0;
  currentTemp: number = 0;
  currentFanSpeed: number = 0;
  currentHashrate: number = 0;
  currentPower: number = 0;

  showDisclosure: boolean = false;
  showCustomTuning: boolean = false;
  pendingPreset: TuningPreset | null = null;
  disclaimerAccepted: boolean = false;

  customForm!: FormGroup;

  frequencyOptions: number[] = [];
  voltageOptions: number[] = [];

  readonly FREQ_MIN = 400;
  readonly FREQ_MAX = 575;
  readonly VOLT_MIN = 1100;
  readonly VOLT_MAX = 1300;
  readonly TEMP_MIN = 35;
  readonly TEMP_MAX = 66;
  readonly FAN_MIN = 0;
  readonly FAN_MAX = 100;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private toastr: ToastrService,
    private loadingService: LoadingService,
    private systemService: SystemApiService,
  ) {}

  ngOnInit(): void {
    this.customForm = this.fb.group({
      frequency: [485, [Validators.required, Validators.min(this.FREQ_MIN), Validators.max(this.FREQ_MAX)]],
      coreVoltage: [1200, [Validators.required, Validators.min(this.VOLT_MIN), Validators.max(this.VOLT_MAX)]],
      autofanspeed: [true],
      manualFanSpeed: [70, [Validators.required, Validators.min(0), Validators.max(100)]],
      temptarget: [60, [Validators.required, Validators.min(this.TEMP_MIN), Validators.max(this.TEMP_MAX)]],
    });

    this.loadCurrentState();
    this.loadSafety();
    this.loadAsicSettings();
  }

  loadCurrentState(): void {
    this.systemService.getInfo().subscribe(info => {
      this.currentFrequency = info.frequency || 0;
      this.currentVoltage = info.coreVoltage || 0;
      this.currentTemp = info.temp || 0;
      this.currentFanSpeed = info.fanspeed || 0;
      this.currentHashrate = info.hashRate || 0;
      this.currentPower = info.power || 0;

      this.customForm.patchValue({
        frequency: info.frequency,
        coreVoltage: info.coreVoltage,
        autofanspeed: info.autofanspeed === 1,
        manualFanSpeed: info.manualFanSpeed,
        temptarget: info.temptarget,
      });
    });
  }

  loadSafety(): void {
    this.http.get<PresetsResponse>('/api/lottoaxe/presets').subscribe({
      next: (data) => { this.safety = data.safety; },
      error: () => {},
    });
  }

  loadAsicSettings(): void {
    this.systemService.getAsicSettings().subscribe(asic => {
      this.frequencyOptions = asic.frequencyOptions || [];
      this.voltageOptions = asic.voltageOptions || [];
    });
  }

  requestApplyPreset(preset: TuningPreset): void {
    this.pendingPreset = preset;
    this.disclaimerAccepted = false;
    this.showDisclosure = true;
  }

  confirmApplyPreset(): void {
    if (!this.pendingPreset || !this.disclaimerAccepted) return;
    this.showDisclosure = false;

    const preset = this.pendingPreset;
    const payload: any = {
      frequency: preset.frequency,
      coreVoltage: preset.voltage,
      autofanspeed: preset.autoFan ? 1 : 0,
      temptarget: preset.tempTarget,
    };
    if (!preset.autoFan) {
      payload.manualFanSpeed = preset.fanSpeed;
    }

    this.systemService.updateSystem('', payload)
      .pipe(this.loadingService.lockUIUntilComplete())
      .subscribe({
        next: () => {
          this.toastr.success(`"${preset.name}" applied — ${preset.frequency} MHz, ${preset.voltage} mV`);
          this.pendingPreset = null;
          this.loadCurrentState();
        },
        error: () => this.toastr.error('Failed to apply preset'),
      });
  }

  cancelDisclosure(): void {
    this.showDisclosure = false;
    this.pendingPreset = null;
  }

  applyCustomTuning(): void {
    if (!this.customForm.valid) return;

    this.pendingPreset = {
      id: 'custom', name: 'Custom Tune', icon: 'pi-cog', variant: '',
      description: 'Your custom settings',
      frequency: this.customForm.value.frequency,
      voltage: this.customForm.value.coreVoltage,
      fanSpeed: this.customForm.value.manualFanSpeed,
      autoFan: this.customForm.value.autofanspeed,
      tempTarget: this.customForm.value.temptarget,
      estHashrate: '—', estPower: '—',
      riskLevel: this.getCustomRiskLevel(),
    };
    this.disclaimerAccepted = false;
    this.showDisclosure = true;
  }

  getCustomRiskLevel(): 'low' | 'medium' | 'high' | 'extreme' {
    const f = this.customForm.value.frequency;
    const v = this.customForm.value.coreVoltage;
    if (f >= 560 && v >= 1280) return 'extreme';
    if (f >= 525 || v >= 1250) return 'high';
    if (f >= 475 || v >= 1200) return 'medium';
    return 'low';
  }

  getRiskColor(level: string): string {
    switch (level) {
      case 'low': return '#8DFF00';
      case 'medium': return '#FFB300';
      case 'high': return '#FF6B00';
      case 'extreme': return '#FF3B3B';
      default: return '#A1A1AA';
    }
  }

  getRiskLabel(level: string): string {
    switch (level) {
      case 'low': return 'SAFE';
      case 'medium': return 'MODERATE';
      case 'high': return 'AGGRESSIVE';
      case 'extreme': return 'DANGEROUS';
      default: return '—';
    }
  }

  getPresetIcon(name: string): string {
    const found = this.presets.find(p => p.name === name);
    return found ? found.icon : 'pi-cog';
  }

  getPresetSeverity(name: string): string {
    switch (name) {
      case 'Silent': return 'info';
      case 'Eco': return 'success';
      case 'Balanced': return 'info';
      case 'Performance': return 'warning';
      case 'Lotto Mode': return 'danger';
      case 'YOLO OC': return 'danger';
      default: return 'info';
    }
  }
}
