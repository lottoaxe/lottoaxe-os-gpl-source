import { Component } from '@angular/core';

interface GuideSection {
  title: string;
  icon: string;
  content: string;
  tips?: string[];
}

@Component({
  selector: 'app-how-to',
  templateUrl: './how-to.component.html',
  styleUrls: ['./how-to.component.scss']
})
export class HowToComponent {

  guides: GuideSection[] = [
    {
      title: 'How to Update Your Firmware',
      icon: 'pi pi-sync',
      content: `Keeping your miner up to date ensures you have the latest optimizations and features. LottoAxe OS checks for updates automatically — when a new version is available, you'll see a green banner at the top of the dashboard.`,
      tips: [
        'Go to the <strong>Update</strong> page from the sidebar menu.',
        'Download both <code>www.bin</code> and <code>esp-miner.bin</code> from the update link or lottoaxe.com.',
        'Click <strong>"Choose .bin Files"</strong> and select both files at once.',
        'The update will upload the UI first, then the firmware. Your miner will automatically reboot when done.',
        'Do <strong>NOT</strong> unplug your miner during the update process.',
        'After the reboot, do a hard refresh in your browser (Ctrl + Shift + R) to clear any cached files.'
      ]
    },
    {
      title: 'How to Tune Your Miner',
      icon: 'pi pi-sliders-h',
      content: `Tuning adjusts your ASIC frequency and voltage to find the best balance between hashrate, power, and temperature. Every chip is different — what works for one miner may not be optimal for another.`,
      tips: [
        'Navigate to <strong>Tuning</strong> in the sidebar under Configure.',
        'Start with the default settings and let the miner stabilize for 10-15 minutes before making changes.',
        'Increase frequency in small increments (25 MHz at a time) and monitor temperature.',
        'Keep ASIC temperature below <strong>65°C</strong> for longevity. Above 72°C, the miner will throttle automatically.',
        'Use the <strong>Thermal</strong> page under Tools to monitor temperature trends and predictions.',
        'If you see a high rejection rate, lower the frequency slightly — your chip may not be stable at that setting.',
        'Good efficiency is typically under <strong>25 J/TH</strong>. Check the Efficiency card on the Dashboard.'
      ]
    },
    {
      title: 'How to Set Up Your Pool',
      icon: 'pi pi-server',
      content: `LottoAxe OS is designed for solo mining — you're mining for a full block reward rather than sharing with a pool. This means lower frequency payouts but the chance at a massive win.`,
      tips: [
        'Go to <strong>Pool</strong> under Configure to set your mining pool.',
        'For solo mining, use a solo pool like <code>solo.ckpool.org</code> or <code>public-pool.io</code>.',
        'Enter your Bitcoin/crypto wallet address as the <strong>User</strong> field.',
        'Set a <strong>Fallback Pool</strong> in case your primary pool goes down — your miner will switch automatically.',
        'Use <strong>Pool Profiles</strong> to save multiple configurations and switch between them easily.',
        'The Pool card on the Dashboard shows your connection status, share time, and difficulty.'
      ]
    },
    {
      title: 'Understanding the Dashboard',
      icon: 'pi pi-home',
      content: `The Dashboard is your mining command center. It shows real-time statistics about your miner's performance, efficiency, and luck.`,
      tips: [
        '<strong>Hashrate</strong> — Your mining speed in GH/s. The 1M, 10M, and 1H averages smooth out fluctuations.',
        '<strong>Efficiency</strong> — Measured in J/TH (Joules per Terahash). Lower is better.',
        '<strong>Shares</strong> — Valid hashes submitted to the pool. A steady count means your miner is working correctly.',
        '<strong>Best Difficulty</strong> — The highest difficulty share your miner has found. This is your "closest to winning" score.',
        '<strong>Session Best</strong> vs <strong>All-Time Best</strong> — Session resets on reboot, All-Time persists.',
        'The chart shows hashrate and temperature over time. Use the dropdowns to change metrics.'
      ]
    },
    {
      title: 'Using the Golden Hash Radar',
      icon: 'pi pi-search',
      content: `The Golden Hash Radar is your share discovery visualization. It shows a real-time radar that lights up when your miner finds high-difficulty shares — the closer you get to a block, the bigger the pulse.`,
      tips: [
        'Navigate to <strong>Golden Hash</strong> in the Mining section.',
        'The radar scans continuously while your miner is running.',
        'Share difficulty tiers: Common (grey), Uncommon (green), Rare (blue), Epic (purple), Legendary (gold).',
        'The event log at the bottom keeps a history of your best finds.',
        'A "NEW RECORD" badge appears when you beat your session best difficulty.'
      ]
    },
    {
      title: 'Mining Aura & Visual Effects',
      icon: 'pi pi-palette',
      content: `Mining Aura provides an ambient visual representation of your miner's performance. The aura changes color and intensity based on how well your miner is running.`,
      tips: [
        'Navigate to <strong>Mining Aura</strong> in the Mining section.',
        'Aura states range from Dormant (offline) to Legendary (peak performance).',
        'The performance score (0-100) is based on hashrate, efficiency, and acceptance rate.',
        'Watch for the Legendary aura — it triggers when your hashrate is high or you find a massive share.'
      ]
    },
    {
      title: 'Overclock Scheduler',
      icon: 'pi pi-clock',
      content: `The OC Scheduler lets you automatically change your miner's frequency based on time of day. Run quieter at night, push harder during cheap electricity hours, or go full power on weekends.`,
      tips: [
        'Navigate to <strong>OC Scheduler</strong> under Configure.',
        'Use the preset profiles (Silent, Eco, Balanced, Performance, Lotto, YOLO) as starting points.',
        'Quick-add templates make common schedules easy — Night Mode, Peak Hours, Weekend OC.',
        'Set specific days of the week for each schedule entry.',
        'The 24-hour timeline at the top shows your active schedules visually.',
        'Schedules are saved locally and survive page reloads.'
      ]
    },
    {
      title: 'Network & WiFi Setup',
      icon: 'pi pi-wifi',
      content: `Your miner connects to your WiFi network to communicate with the mining pool and serve the dashboard. A stable network connection is important for consistent mining.`,
      tips: [
        'Navigate to <strong>Network</strong> under Configure to view or change WiFi settings.',
        'Use a 2.4GHz WiFi network for the best range and compatibility with ESP32.',
        'Place your miner within good WiFi range — weak signal causes pool disconnections.',
        'The hostname setting lets you find your miner easily on your network.',
        'If you lose connection, the miner creates an AP (access point) you can connect to directly for reconfiguration.'
      ]
    }
  ];
}
