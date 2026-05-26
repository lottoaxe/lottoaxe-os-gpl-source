import { Component, Input, Output, EventEmitter, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-hold-confirm',
  templateUrl: './hold-confirm.component.html',
})
export class HoldConfirmComponent implements OnDestroy {
  @Input() label: string = 'Hold to Confirm';
  @Input() holdDuration: number = 3000;
  @Input() severity: string = 'danger';
  @Input() icon: string = '';
  @Input() disabled: boolean = false;
  @Output() confirmed = new EventEmitter<void>();

  progress = 0;
  holding = false;
  private intervalRef: any = null;
  private readonly TICK_MS = 30;

  onHoldStart(event: Event) {
    if (this.disabled) return;
    event.preventDefault();
    this.holding = true;
    this.progress = 0;

    const increment = (this.TICK_MS / this.holdDuration) * 100;

    this.intervalRef = setInterval(() => {
      this.progress += increment;
      if (this.progress >= 100) {
        this.progress = 100;
        this.reset();
        this.confirmed.emit();
      }
    }, this.TICK_MS);
  }

  onHoldEnd() {
    this.reset();
  }

  get displayLabel(): string {
    if (this.holding && this.progress > 0) {
      return `Hold... (${Math.round(this.progress)}%)`;
    }
    return this.label;
  }

  private reset() {
    this.holding = false;
    this.progress = 0;
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  ngOnDestroy() {
    this.reset();
  }
}
