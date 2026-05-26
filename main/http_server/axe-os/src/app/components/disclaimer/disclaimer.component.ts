import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-disclaimer',
  templateUrl: './disclaimer.component.html',
})
export class DisclaimerComponent implements OnInit {
  visible = false;

  ngOnInit() {
    const accepted = localStorage.getItem('lottoaxe_disclaimer_accepted');
    if (!accepted) {
      this.visible = true;
    }
  }

  accept() {
    localStorage.setItem('lottoaxe_disclaimer_accepted', new Date().toISOString());
    this.visible = false;
  }
}
