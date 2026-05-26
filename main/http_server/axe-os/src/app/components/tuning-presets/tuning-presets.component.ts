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
  experimental?: boolean;
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

// Per-ASIC preset definitions — frequency/voltage tuned to each chip's safe range
const ASIC_PRESETS: Record<string, TuningPreset[]> = {
  BM1397: [
    {
      id: 'silent', name: 'Silent', icon: 'pi-moon', variant: 'la-preset--silent',
      description: 'Whisper quiet. Minimal fan noise for bedrooms and offices.',
      frequency: 400, voltage: 1100, fanSpeed: 30, autoFan: false, tempTarget: 50,
      estHashrate: '~200 GH/s', estPower: '~8W', riskLevel: 'low',
    },
    {
      id: 'eco', name: 'Eco', icon: 'pi-leaf', variant: 'la-preset--eco',
      description: 'Low power, efficient operation. Best J/TH ratio.',
      frequency: 425, voltage: 1200, fanSpeed: 0, autoFan: true, tempTarget: 55,
      estHashrate: '~250 GH/s', estPower: '~10W', riskLevel: 'low',
    },
    {
      id: 'balanced', name: 'Balanced', icon: 'pi-sliders-h', variant: 'la-preset--balanced',
      description: 'Default settings. Good hashrate with moderate power draw.',
      frequency: 500, voltage: 1300, fanSpeed: 0, autoFan: true, tempTarget: 60,
      estHashrate: '~350 GH/s', estPower: '~12W', riskLevel: 'medium',
    },
    {
      id: 'performance', name: 'Performance', icon: 'pi-bolt', variant: 'la-preset--performance',
      description: 'Higher hashrate. More power and heat but still safe.',
      frequency: 550, voltage: 1400, fanSpeed: 0, autoFan: true, tempTarget: 62,
      estHashrate: '~400 GH/s', estPower: '~16W', riskLevel: 'medium',
    },
    {
      id: 'lotto', name: 'Lotto Mode', icon: 'pi-star', variant: 'la-preset--lotto',
      description: 'Maximum hashrate for solo block hunting. Full send.',
      frequency: 600, voltage: 1500, fanSpeed: 100, autoFan: false, tempTarget: 65,
      estHashrate: '~450 GH/s', estPower: '~20W', riskLevel: 'high', experimental: true,
    },
    {
      id: 'overclock', name: 'YOLO OC', icon: 'pi-exclamation-triangle', variant: 'la-preset--overclock',
      description: 'Push past safe limits. May cause instability or hardware damage.',
      frequency: 600, voltage: 1500, fanSpeed: 100, autoFan: false, tempTarget: 65,
      estHashrate: '~450+ GH/s', estPower: '~22W+', riskLevel: 'extreme', experimental: true,
    },
  ],
  BM1366: [
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
      estHashrate: '~600 GH/s', estPower: '~18W', riskLevel: 'high', experimental: true,
    },
    {
      id: 'overclock', name: 'YOLO OC', icon: 'pi-exclamation-triangle', variant: 'la-preset--overclock',
      description: 'Push past safe limits. May cause instability or hardware damage.',
      frequency: 575, voltage: 1300, fanSpeed: 100, autoFan: false, tempTarget: 65,
      estHashrate: '~620+ GH/s', estPower: '~20W+', riskLevel: 'extreme', experimental: true,
    },
  ],
  BM1368: [
    {
      id: 'silent', name: 'Silent', icon: 'pi-moon', variant: 'la-preset--silent',
      description: 'Whisper quiet. Minimal fan noise for bedrooms and offices.',
      frequency: 400, voltage: 1100, fanSpeed: 30, autoFan: false, tempTarget: 50,
      estHashrate: '~350 GH/s', estPower: '~9W', riskLevel: 'low',
    },
    {
      id: 'eco', name: 'Eco', icon: 'pi-leaf', variant: 'la-preset--eco',
      description: 'Low power, efficient operation. Best J/TH ratio.',
      frequency: 425, voltage: 1150, fanSpeed: 0, autoFan: true, tempTarget: 55,
      estHashrate: '~400 GH/s', estPower: '~11W', riskLevel: 'low',
    },
    {
      id: 'balanced', name: 'Balanced', icon: 'pi-sliders-h', variant: 'la-preset--balanced',
      description: 'Default settings. Good hashrate with moderate power draw.',
      frequency: 490, voltage: 1200, fanSpeed: 0, autoFan: true, tempTarget: 60,
      estHashrate: '~500 GH/s', estPower: '~13W', riskLevel: 'medium',
    },
    {
      id: 'performance', name: 'Performance', icon: 'pi-bolt', variant: 'la-preset--performance',
      description: 'Higher hashrate. More power and heat but still safe.',
      frequency: 525, voltage: 1250, fanSpeed: 0, autoFan: true, tempTarget: 62,
      estHashrate: '~575 GH/s', estPower: '~16W', riskLevel: 'medium',
    },
    {
      id: 'lotto', name: 'Lotto Mode', icon: 'pi-star', variant: 'la-preset--lotto',
      description: 'Maximum hashrate for solo block hunting. Full send.',
      frequency: 575, voltage: 1300, fanSpeed: 100, autoFan: false, tempTarget: 65,
      estHashrate: '~625 GH/s', estPower: '~19W', riskLevel: 'high', experimental: true,
    },
    {
      id: 'overclock', name: 'YOLO OC', icon: 'pi-exclamation-triangle', variant: 'la-preset--overclock',
      description: 'Push past safe limits. May cause instability or hardware damage.',
      frequency: 575, voltage: 1300, fanSpeed: 100, autoFan: false, tempTarget: 65,
      estHashrate: '~650+ GH/s', estPower: '~21W+', riskLevel: 'extreme', experimental: true,
    },
  ],
  BM1370: [
    {
      id: 'silent', name: 'Silent', icon: 'pi-moon', variant: 'la-preset--silent',
      description: 'Whisper quiet. Minimal fan noise for bedrooms and offices.',
      frequency: 400, voltage: 1000, fanSpeed: 30, autoFan: false, tempTarget: 50,
      estHashrate: '~500 GH/s', estPower: '~10W', riskLevel: 'low',
    },
    {
      id: 'eco', name: 'Eco', icon: 'pi-leaf', variant: 'la-preset--eco',
      description: 'Low power, efficient operation. Best J/TH ratio.',
      frequency: 490, voltage: 1060, fanSpeed: 0, autoFan: true, tempTarget: 55,
      estHashrate: '~650 GH/s', estPower: '~13W', riskLevel: 'low',
    },
    {
      id: 'balanced', name: 'Balanced', icon: 'pi-sliders-h', variant: 'la-preset--balanced',
      description: 'Default settings. Good hashrate with moderate power draw.',
      frequency: 525, voltage: 1150, fanSpeed: 0, autoFan: true, tempTarget: 60,
      estHashrate: '~750 GH/s', estPower: '~16W', riskLevel: 'medium',
    },
    {
      id: 'performance', name: 'Performance', icon: 'pi-bolt', variant: 'la-preset--performance',
      description: 'Higher hashrate. More power and heat but still safe.',
      frequency: 600, voltage: 1200, fanSpeed: 0, autoFan: true, tempTarget: 62,
      estHashrate: '~850 GH/s', estPower: '~20W', riskLevel: 'medium',
    },
    {
      id: 'lotto', name: 'Lotto Mode', icon: 'pi-star', variant: 'la-preset--lotto',
      description: 'Maximum hashrate for solo block hunting. Full send.',
      frequency: 625, voltage: 1250, fanSpeed: 100, autoFan: false, tempTarget: 65,
      estHashrate: '~900 GH/s', estPower: '~24W', riskLevel: 'high', experimental: true,
    },
    {
      id: 'overclock', name: 'YOLO OC', icon: 'pi-exclamation-triangle', variant: 'la-preset--overclock',
      description: 'Push past safe limits. May cause instability or hardware damage.',
      frequency: 625, voltage: 1250, fanSpeed: 100, autoFan: false, tempTarget: 65,
      estHashrate: '~950+ GH/s', estPower: '~26W+', riskLevel: 'extreme', experimental: true,
    },
  ],
};

@Component({
  selector: 'app-tuning-presets',
  templateUrl: './tuning-presets.component.html',
  styleUrls: ['./tuning-presets.component.scss'],
})
export class TuningPresetsComponent implements OnInit {
  presets: TuningPreset[] = [];

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

  // Inline editing state: tracks which presets are in edit mode and their overridden values
  editingPresets: Set<string> = new Set();
  presetOverrides: Record<string, Partial<Pick<TuningPreset, 'frequency' | 'voltage' | 'fanSpeed' | 'tempTarget'>>> = {};

  customForm!: FormGroup;

  frequencyOptions: number[] = [];
  voltageOptions: number[] = [];

  // Dynamic limits — populated from the ASIC settings API
  FREQ_MIN = 400;
  FREQ_MAX = 575;
  VOLT_MIN = 1100;
  VOLT_MAX = 1300;
  readonly TEMP_MIN = 35;
  readonly TEMP_MAX = 66;
  readonly FAN_MIN = 0;
  readonly FAN_MAX = 100;

  // Extended OC limits — unlocked by YOLO OC or custom overclock toggle
  readonly OC_FREQ_MIN = 100;
  readonly OC_FREQ_MAX = 1000;
  readonly OC_VOLT_MIN = 800;
  readonly OC_VOLT_MAX = 2000;
  overclockUnlocked = false;

  // ASIC identity from API
  asicModel: string = '';
  deviceModel: string = '';

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
      this.asicModel = asic.ASICModel || '';
      this.deviceModel = asic.deviceModel || '';

      // Derive dynamic limits from the options arrays
      if (this.frequencyOptions.length > 0) {
        this.FREQ_MIN = Math.min(...this.frequencyOptions);
        this.FREQ_MAX = Math.max(...this.frequencyOptions);
      }
      if (this.voltageOptions.length > 0) {
        this.VOLT_MIN = Math.min(...this.voltageOptions);
        this.VOLT_MAX = Math.max(...this.voltageOptions);
      }

      // Select per-ASIC preset table, fall back to BM1366
      this.presets = ASIC_PRESETS[this.asicModel] || ASIC_PRESETS['BM1366'];

      // Update form validators with the real ASIC ranges
      this.updateFormValidators();
    });
  }

  /** Refresh form validators based on whether overclock is unlocked */
  updateFormValidators(): void {
    const fMin = this.overclockUnlocked ? this.OC_FREQ_MIN : this.FREQ_MIN;
    const fMax = this.overclockUnlocked ? this.OC_FREQ_MAX : this.FREQ_MAX;
    const vMin = this.overclockUnlocked ? this.OC_VOLT_MIN : this.VOLT_MIN;
    const vMax = this.overclockUnlocked ? this.OC_VOLT_MAX : this.VOLT_MAX;

    this.customForm.get('frequency')?.setValidators([
      Validators.required, Validators.min(fMin), Validators.max(fMax),
    ]);
    this.customForm.get('coreVoltage')?.setValidators([
      Validators.required, Validators.min(vMin), Validators.max(vMax),
    ]);
    this.customForm.get('frequency')?.updateValueAndValidity();
    this.customForm.get('coreVoltage')?.updateValueAndValidity();
  }

  toggleOverclock(): void {
    this.overclockUnlocked = !this.overclockUnlocked;
    this.updateFormValidators();
  }

  get activeFreqMin(): number { return this.overclockUnlocked ? this.OC_FREQ_MIN : this.FREQ_MIN; }
  get activeFreqMax(): number { return this.overclockUnlocked ? this.OC_FREQ_MAX : this.FREQ_MAX; }
  get activeVoltMin(): number { return this.overclockUnlocked ? this.OC_VOLT_MIN : this.VOLT_MIN; }
  get activeVoltMax(): number { return this.overclockUnlocked ? this.OC_VOLT_MAX : this.VOLT_MAX; }

  requestApplyPreset(preset: TuningPreset): void {
    // Build an effective preset using any inline overrides
    const overrides = this.presetOverrides[preset.id];
    if (overrides && this.hasOverrides(preset)) {
      this.pendingPreset = {
        ...preset,
        name: preset.name + ' (Edited)',
        frequency: overrides.frequency ?? preset.frequency,
        voltage: overrides.voltage ?? preset.voltage,
        fanSpeed: overrides.fanSpeed ?? preset.fanSpeed,
        tempTarget: overrides.tempTarget ?? preset.tempTarget,
        riskLevel: this.getOverrideRiskLevel(
          overrides.frequency ?? preset.frequency,
          overrides.voltage ?? preset.voltage,
        ),
      };
    } else {
      this.pendingPreset = { ...preset };
    }
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

  // ---- Inline preset editing ----

  toggleEditPreset(preset: TuningPreset): void {
    if (this.editingPresets.has(preset.id)) {
      // Exit edit mode — discard overrides
      this.editingPresets.delete(preset.id);
      delete this.presetOverrides[preset.id];
    } else {
      // Enter edit mode — seed with current preset values
      this.editingPresets.add(preset.id);
      this.presetOverrides[preset.id] = {
        frequency: preset.frequency,
        voltage: preset.voltage,
        fanSpeed: preset.fanSpeed,
        tempTarget: preset.tempTarget,
      };
    }
  }

  isEditing(preset: TuningPreset): boolean {
    return this.editingPresets.has(preset.id);
  }

  getEffectiveValue(preset: TuningPreset, field: 'frequency' | 'voltage' | 'fanSpeed' | 'tempTarget'): number {
    const overrides = this.presetOverrides[preset.id];
    if (overrides && overrides[field] !== undefined) {
      return overrides[field]!;
    }
    return preset[field];
  }

  updatePresetOverride(preset: TuningPreset, field: 'frequency' | 'voltage' | 'fanSpeed' | 'tempTarget', event: Event): void {
    const input = event.target as HTMLInputElement;
    let val = parseInt(input.value, 10);
    if (isNaN(val)) return;

    // Use extended OC limits for YOLO/overclock presets, normal limits otherwise
    const isOC = preset.id === 'overclock' || preset.id === 'lotto';
    const fMin = isOC ? this.OC_FREQ_MIN : this.FREQ_MIN;
    const fMax = isOC ? this.OC_FREQ_MAX : this.FREQ_MAX;
    const vMin = isOC ? this.OC_VOLT_MIN : this.VOLT_MIN;
    const vMax = isOC ? this.OC_VOLT_MAX : this.VOLT_MAX;

    if (field === 'frequency') val = Math.max(fMin, Math.min(fMax, val));
    if (field === 'voltage') val = Math.max(vMin, Math.min(vMax, val));
    if (field === 'fanSpeed') val = Math.max(0, Math.min(100, val));
    if (field === 'tempTarget') val = Math.max(this.TEMP_MIN, Math.min(this.TEMP_MAX, val));

    if (!this.presetOverrides[preset.id]) {
      this.presetOverrides[preset.id] = {};
    }
    this.presetOverrides[preset.id][field] = val;
  }

  hasOverrides(preset: TuningPreset): boolean {
    const o = this.presetOverrides[preset.id];
    if (!o) return false;
    return o.frequency !== preset.frequency
      || o.voltage !== preset.voltage
      || o.fanSpeed !== preset.fanSpeed
      || o.tempTarget !== preset.tempTarget;
  }

  resetPresetOverrides(preset: TuningPreset): void {
    this.presetOverrides[preset.id] = {
      frequency: preset.frequency,
      voltage: preset.voltage,
      fanSpeed: preset.fanSpeed,
      tempTarget: preset.tempTarget,
    };
  }

  getCustomRiskLevel(): 'low' | 'medium' | 'high' | 'extreme' {
    const f = this.customForm.value.frequency;
    const v = this.customForm.value.coreVoltage;
    // Always measure risk against the ASIC's *stock* range so OC values correctly read as extreme
    const freqRange = this.FREQ_MAX - this.FREQ_MIN;
    const voltRange = this.VOLT_MAX - this.VOLT_MIN;
    const freqPct = freqRange > 0 ? (f - this.FREQ_MIN) / freqRange : 0;
    const voltPct = voltRange > 0 ? (v - this.VOLT_MIN) / voltRange : 0;
    const risk = Math.max(freqPct, voltPct);
    if (risk >= 0.9) return 'extreme';
    if (risk >= 0.7) return 'high';
    if (risk >= 0.4) return 'medium';
    return 'low';
  }

  getOverrideRiskLevel(freq: number, volt: number): 'low' | 'medium' | 'high' | 'extreme' {
    const freqRange = this.FREQ_MAX - this.FREQ_MIN;
    const voltRange = this.VOLT_MAX - this.VOLT_MIN;
    const freqPct = freqRange > 0 ? (freq - this.FREQ_MIN) / freqRange : 0;
    const voltPct = voltRange > 0 ? (volt - this.VOLT_MIN) / voltRange : 0;
    const risk = Math.max(freqPct, voltPct);
    if (risk >= 0.9) return 'extreme';
    if (risk >= 0.7) return 'high';
    if (risk >= 0.4) return 'medium';
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
