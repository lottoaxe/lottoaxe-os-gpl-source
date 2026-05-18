import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-boot-splash',
  templateUrl: './boot-splash.component.html',
  styleUrls: ['./boot-splash.component.scss']
})
export class BootSplashComponent implements OnInit {
  visible = true;
  bootLines: string[] = [];
  progress = 0;

  private readonly lines = [
    '[BIOS] BM1366 ASIC detected...',
    '[INIT] Loading LottoAxe OS v1.0',
    '[POOL] Connecting to stratum...',
    '[ASIC] Frequency lock: OK',
    '[HASH] Mining engine ready'
  ];

  ngOnInit() {
    this.animateBoot();
  }

  private animateBoot() {
    let i = 0;
    const interval = setInterval(() => {
      if (i < this.lines.length) {
        this.bootLines.push(this.lines[i]);
        this.progress = ((i + 1) / this.lines.length) * 100;
        i++;
      } else {
        clearInterval(interval);
        setTimeout(() => this.visible = false, 400);
      }
    }, 300);
  }
}
