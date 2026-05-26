import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { SystemApiService } from 'src/app/services/system.service';
import { SystemInfo as ISystemInfo, SystemAsic as ISystemASIC } from 'src/app/generated/models';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

interface TuneStep {
  frequency: number;
  voltage: number;
  hashRate: number;
  avgHashRate: number;
  errorPct: number;
  temp: number;
  power: number;
  efficiency: number; // GH/s per watt
  stable: boolean;
  status: 'pending' | 'testing' | 'passed' | 'failed' | 'skipped';
  samples: number[];
}

interface TuneResult {
  bestStep: TuneStep | null;
  bestEfficiency: TuneStep | null;
  allSteps: TuneStep[];
  startedAt: Date;
  finishedAt: Date | null;
  originalFrequency: number;
  originalVoltage: number;
}

type TuneMode = 'max-hashrate' | 'best-efficiency' | 'balanced';
type TuneState = 'idle' | 'running' | 'paused' | 'complete' | 'aborted';

@Component({
  selector: 'app-auto-tune',
  templateUrl: './auto-tune.component.html',
  styleUrls: ['./auto-tune.component.scss'],
})
export class AutoTuneComponent implements OnInit, OnDestroy {

  // ── ASIC info ──
  asicModel = '';
  deviceModel = '';
  frequencyOptions: number[] = [];
  voltageOptions: number[] = [];

  // ── Current live state ──
  currentFrequency = 0;
  currentVoltage = 0;
  currentHashRate = 0;
  currentTemp = 0;
  currentPower = 0;
  currentErrorPct = 0;

  // ── Tune config ──
  tuneMode: TuneMode = 'max-hashrate';
  maxTemp = 65;          // abort step if temp exceeds
  maxErrorPct = 5;       // fail step if error % exceeds
  settleTime = 30;       // seconds to wait after applying settings
  sampleCount = 5;       // number of polls to average
  sampleInterval = 6;    // seconds between each poll

  // ── Scan range (user-configurable) ──
  startFreq = 400;
  stopFreq = 625;
  freqStep = 25;
  startVolt = 1100;
  stopVolt = 1300;
  voltStep = 50;

  // ── Tune state ──
  state: TuneState = 'idle';
  steps: TuneStep[] = [];
  currentStepIdx = -1;
  progress = 0;
  statusMessage = 'Ready to tune';
  result: TuneResult | null = null;

  // ── Saved results history ──
  savedResults: { date: string; mode: string; best: TuneStep }[] = [];

  // ── Internal ──
  private pollSub: Subscription | null = null;
  private settleTimer: any = null;
  private abortRequested = false;
  private originalFrequency = 0;
  private originalVoltage = 0;

  constructor(
    private systemService: SystemApiService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadCurrentState();
    this.loadAsicSettings();
    this.loadSavedResults();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // ═══════════════════════════════════════════════════════════════
  //  DATA LOADING
  // ═══════════════════════════════════════════════════════════════

  loadCurrentState(): void {
    this.systemService.getInfo().subscribe(info => {
      this.currentFrequency = info.frequency || 0;
      this.currentVoltage = info.coreVoltage || 0;
      this.currentHashRate = info.hashRate || 0;
      this.currentTemp = info.temp || 0;
      this.currentPower = info.power || 0;
      this.currentErrorPct = info.errorPercentage || 0;
    });
  }

  loadAsicSettings(): void {
    this.systemService.getAsicSettings().subscribe(asic => {
      this.frequencyOptions = asic.frequencyOptions || [];
      this.voltageOptions = asic.voltageOptions || [];
      this.asicModel = asic.ASICModel || '';
      this.deviceModel = asic.deviceModel || '';

      // Initialize scan range defaults from ASIC options
      if (this.frequencyOptions.length > 0) {
        this.startFreq = Math.min(...this.frequencyOptions);
        this.stopFreq = Math.max(...this.frequencyOptions) + 50; // go above stock max
        // Derive step from the spacing in the options
        if (this.frequencyOptions.length >= 2) {
          const sorted = [...this.frequencyOptions].sort((a, b) => a - b);
          this.freqStep = sorted[1] - sorted[0];
        }
      }
      if (this.voltageOptions.length > 0) {
        this.startVolt = Math.min(...this.voltageOptions);
        this.stopVolt = Math.max(...this.voltageOptions);
        if (this.voltageOptions.length >= 2) {
          const sorted = [...this.voltageOptions].sort((a, b) => a - b);
          this.voltStep = sorted[1] - sorted[0];
        }
      }
    });
  }

  loadSavedResults(): void {
    try {
      const raw = localStorage.getItem('LA_AUTOTUNE_HISTORY');
      this.savedResults = raw ? JSON.parse(raw) : [];
    } catch {
      this.savedResults = [];
    }
  }

  saveResult(step: TuneStep, mode: string): void {
    this.savedResults.unshift({
      date: new Date().toISOString(),
      mode,
      best: { ...step },
    });
    // Keep last 10
    if (this.savedResults.length > 10) this.savedResults.length = 10;
    localStorage.setItem('LA_AUTOTUNE_HISTORY', JSON.stringify(this.savedResults));
  }

  // ═══════════════════════════════════════════════════════════════
  //  BUILD STEPS
  // ═══════════════════════════════════════════════════════════════

  buildSteps(): TuneStep[] {
    const steps: TuneStep[] = [];

    // Build frequency and voltage ranges from user-defined start/stop/step
    const freqs = this.generateRange(this.startFreq, this.stopFreq, this.freqStep);
    const volts = this.generateRange(this.startVolt, this.stopVolt, this.voltStep);

    if (this.tuneMode === 'max-hashrate') {
      // Test each frequency at each voltage from low to high
      for (const freq of freqs) {
        for (const volt of volts) {
          steps.push(this.createStep(freq, volt));
        }
      }
    } else if (this.tuneMode === 'best-efficiency') {
      // Test lowest voltages first at each frequency
      for (const freq of freqs) {
        for (const volt of volts) {
          steps.push(this.createStep(freq, volt));
        }
      }
    } else {
      // Balanced: test a smart subset — each frequency at middle and one-above voltage
      const midVoltIdx = Math.floor(volts.length / 2);
      for (const freq of freqs) {
        steps.push(this.createStep(freq, volts[midVoltIdx]));
        if (midVoltIdx + 1 < volts.length) {
          steps.push(this.createStep(freq, volts[midVoltIdx + 1]));
        }
      }
    }

    return steps;
  }

  /** Generate an array of values from start to stop (inclusive) with given step */
  private generateRange(start: number, stop: number, step: number): number[] {
    const result: number[] = [];
    const s = Math.max(1, Math.abs(step)); // prevent infinite loops
    for (let v = start; v <= stop; v += s) {
      result.push(v);
    }
    // Always include the stop value if it wasn't hit exactly
    if (result.length > 0 && result[result.length - 1] < stop) {
      result.push(stop);
    }
    return result;
  }

  private createStep(freq: number, volt: number): TuneStep {
    return {
      frequency: freq,
      voltage: volt,
      hashRate: 0,
      avgHashRate: 0,
      errorPct: 0,
      temp: 0,
      power: 0,
      efficiency: 0,
      stable: false,
      status: 'pending',
      samples: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  TUNE CONTROL
  // ═══════════════════════════════════════════════════════════════

  startTune(): void {
    if (this.state === 'running') return;

    this.originalFrequency = this.currentFrequency;
    this.originalVoltage = this.currentVoltage;
    this.steps = this.buildSteps();
    this.currentStepIdx = -1;
    this.progress = 0;
    this.abortRequested = false;
    this.result = {
      bestStep: null,
      bestEfficiency: null,
      allSteps: this.steps,
      startedAt: new Date(),
      finishedAt: null,
      originalFrequency: this.originalFrequency,
      originalVoltage: this.originalVoltage,
    };
    this.state = 'running';
    this.statusMessage = 'Starting auto-tune...';
    this.toastr.info('Auto-Tune started', 'Tuning');

    this.runNextStep();
  }

  abortTune(): void {
    this.abortRequested = true;
    this.state = 'aborted';
    this.statusMessage = 'Aborting... restoring original settings';
    this.cleanup();
    this.restoreOriginal();
  }

  pauseTune(): void {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.statusMessage = 'Paused';
    this.cleanup();
  }

  resumeTune(): void {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.runNextStep();
  }

  applyBest(): void {
    if (!this.result?.bestStep) return;
    const best = this.result.bestStep;
    this.applySettings(best.frequency, best.voltage).then(() => {
      this.toastr.success(
        `Applied ${best.frequency} MHz / ${best.voltage} mV — ${best.avgHashRate.toFixed(1)} GH/s`,
        'Best Settings Applied'
      );
      this.loadCurrentState();
    });
  }

  applyEfficient(): void {
    if (!this.result?.bestEfficiency) return;
    const best = this.result.bestEfficiency;
    this.applySettings(best.frequency, best.voltage).then(() => {
      this.toastr.success(
        `Applied ${best.frequency} MHz / ${best.voltage} mV — ${best.efficiency.toFixed(2)} GH/W`,
        'Efficient Settings Applied'
      );
      this.loadCurrentState();
    });
  }

  restoreOriginal(): void {
    this.applySettings(this.originalFrequency, this.originalVoltage).then(() => {
      this.toastr.info('Original settings restored', 'Restored');
      this.loadCurrentState();
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  STEP EXECUTION
  // ═══════════════════════════════════════════════════════════════

  private async runNextStep(): Promise<void> {
    if (this.abortRequested || this.state !== 'running') return;

    this.currentStepIdx++;
    if (this.currentStepIdx >= this.steps.length) {
      this.finishTune();
      return;
    }

    const step = this.steps[this.currentStepIdx];
    step.status = 'testing';
    this.progress = Math.round(((this.currentStepIdx) / this.steps.length) * 100);
    this.statusMessage = `Testing ${step.frequency} MHz / ${step.voltage} mV (${this.currentStepIdx + 1}/${this.steps.length})`;

    // Apply the frequency/voltage
    try {
      await this.applySettings(step.frequency, step.voltage);
    } catch {
      step.status = 'failed';
      step.stable = false;
      this.runNextStep();
      return;
    }

    // Wait for stabilization
    this.statusMessage = `Settling... ${step.frequency} MHz / ${step.voltage} mV (${this.settleTime}s)`;
    await this.sleep(this.settleTime * 1000);

    if (this.abortRequested || this.state !== 'running') return;

    // Collect samples
    this.statusMessage = `Sampling ${step.frequency} MHz / ${step.voltage} mV...`;
    await this.collectSamples(step);

    if (this.abortRequested || this.state !== 'running') return;

    // Evaluate step
    this.evaluateStep(step);

    // Continue to next
    this.runNextStep();
  }

  private async collectSamples(step: TuneStep): Promise<void> {
    const samples: number[] = [];
    let totalTemp = 0;
    let totalPower = 0;
    let totalError = 0;

    for (let i = 0; i < this.sampleCount; i++) {
      if (this.abortRequested || this.state !== 'running') return;

      try {
        const info = await this.systemService.getInfo().toPromise();
        if (info) {
          const hr = info.hashRate || 0;
          samples.push(hr);
          totalTemp += info.temp || 0;
          totalPower += info.power || 0;
          totalError += info.errorPercentage || 0;

          // Live update
          this.currentHashRate = hr;
          this.currentTemp = info.temp || 0;
          this.currentPower = info.power || 0;
          this.currentErrorPct = info.errorPercentage || 0;

          // Safety: abort this step if temp is too high
          if ((info.temp || 0) > this.maxTemp) {
            step.status = 'failed';
            step.stable = false;
            this.statusMessage = `${step.frequency} MHz / ${step.voltage} mV — TOO HOT (${info.temp}°C)`;
            return;
          }
        }
      } catch { /* ignore poll errors */ }

      if (i < this.sampleCount - 1) {
        await this.sleep(this.sampleInterval * 1000);
      }
    }

    step.samples = samples;
    step.hashRate = samples.length ? samples[samples.length - 1] : 0;
    step.avgHashRate = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
    step.temp = this.sampleCount > 0 ? totalTemp / this.sampleCount : 0;
    step.power = this.sampleCount > 0 ? totalPower / this.sampleCount : 0;
    step.errorPct = this.sampleCount > 0 ? totalError / this.sampleCount : 0;
    step.efficiency = step.power > 0 ? step.avgHashRate / step.power : 0;
  }

  private evaluateStep(step: TuneStep): void {
    if (step.status === 'failed') return; // already failed (temp)

    // Check error rate
    if (step.errorPct > this.maxErrorPct) {
      step.status = 'failed';
      step.stable = false;
      return;
    }

    // Check hashrate variance (unstable if samples vary > 20%)
    if (step.samples.length >= 3) {
      const mean = step.avgHashRate;
      const maxDev = Math.max(...step.samples.map(s => Math.abs(s - mean)));
      if (mean > 0 && (maxDev / mean) > 0.20) {
        step.status = 'failed';
        step.stable = false;
        return;
      }
    }

    // Check for zero hashrate
    if (step.avgHashRate <= 0) {
      step.status = 'failed';
      step.stable = false;
      return;
    }

    step.status = 'passed';
    step.stable = true;
  }

  private finishTune(): void {
    this.state = 'complete';
    this.progress = 100;

    const passed = this.steps.filter(s => s.status === 'passed');

    if (passed.length === 0) {
      this.statusMessage = 'No stable settings found!';
      this.toastr.warning('No stable settings were found during tuning', 'Auto-Tune Complete');
      this.restoreOriginal();
      return;
    }

    // Find best hashrate
    const bestHashrate = passed.reduce((best, s) => s.avgHashRate > best.avgHashRate ? s : best, passed[0]);

    // Find best efficiency
    const bestEfficiency = passed.reduce((best, s) => s.efficiency > best.efficiency ? s : best, passed[0]);

    if (this.result) {
      this.result.bestStep = bestHashrate;
      this.result.bestEfficiency = bestEfficiency;
      this.result.finishedAt = new Date();
    }

    this.statusMessage = `Complete! Best: ${bestHashrate.frequency} MHz / ${bestHashrate.voltage} mV = ${bestHashrate.avgHashRate.toFixed(1)} GH/s`;
    this.toastr.success(
      `Best: ${bestHashrate.frequency} MHz @ ${bestHashrate.avgHashRate.toFixed(1)} GH/s`,
      'Auto-Tune Complete'
    );

    this.saveResult(bestHashrate, this.tuneMode);

    // Auto-apply based on mode
    if (this.tuneMode === 'best-efficiency') {
      this.applyEfficient();
    } else {
      this.applyBest();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════

  private applySettings(freq: number, volt: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.systemService.updateSystem('', {
        frequency: freq,
        coreVoltage: volt,
      }).subscribe({
        next: () => resolve(),
        error: (err) => reject(err),
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.settleTimer = setTimeout(resolve, ms);
    });
  }

  private cleanup(): void {
    if (this.pollSub) {
      this.pollSub.unsubscribe();
      this.pollSub = null;
    }
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
  }

  get totalSteps(): number {
    return this.steps.length;
  }

  get passedSteps(): number {
    return this.steps.filter(s => s.status === 'passed').length;
  }

  get failedSteps(): number {
    return this.steps.filter(s => s.status === 'failed').length;
  }

  get estimatedTimeRemaining(): string {
    if (this.state !== 'running' || this.currentStepIdx < 0) return '--';
    const remaining = this.steps.length - this.currentStepIdx - 1;
    const perStep = this.settleTime + (this.sampleCount * this.sampleInterval);
    const totalSec = remaining * perStep;
    if (totalSec < 60) return `${totalSec}s`;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs}s`;
  }

  getStepStatusIcon(step: TuneStep): string {
    switch (step.status) {
      case 'passed': return 'pi pi-check-circle';
      case 'failed': return 'pi pi-times-circle';
      case 'testing': return 'pi pi-spin pi-spinner';
      case 'skipped': return 'pi pi-minus-circle';
      default: return 'pi pi-circle';
    }
  }

  getStepStatusColor(step: TuneStep): string {
    switch (step.status) {
      case 'passed': return '#8DFF00';
      case 'failed': return '#FF3B3B';
      case 'testing': return '#38bdf8';
      case 'skipped': return '#71717a';
      default: return '#52525b';
    }
  }

  clearHistory(): void {
    this.savedResults = [];
    localStorage.removeItem('LA_AUTOTUNE_HISTORY');
    this.toastr.info('History cleared');
  }

  getModeLabel(mode: string): string {
    switch (mode) {
      case 'max-hashrate': return 'Max Hashrate';
      case 'best-efficiency': return 'Best Efficiency';
      case 'balanced': return 'Balanced';
      default: return mode;
    }
  }
}
