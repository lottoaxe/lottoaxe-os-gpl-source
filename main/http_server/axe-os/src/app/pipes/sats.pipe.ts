import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'sats',
  pure: true
})
export class SatsPipe implements PipeTransform {
  private static _this = new SatsPipe();

  public static transform(value: number, coin?: string): string {
    return this._this.transform(value, coin);
  }

  transform(value: number, coin?: string): string {
    const ticker = coin || 'BTC';
    if (!value) return '0 ' + ticker;
    const coins = value / 100_000_000;
    // Show 2 decimals for large amounts, 4 for smaller
    const decimals = coins >= 1 ? 2 : 4;
    return coins.toFixed(decimals) + ' ' + ticker;
  }
}
