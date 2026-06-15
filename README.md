# RhythmIQ — ACLS Megacode Training Simulator

A browser-based virtual bedside patient monitor for ACLS / BLS / PALS / Code Blue training. One device (laptop/projector) displays the patient monitor; another device (instructor's phone) acts as a wireless controller. Both sync in real time over the same room code.

![status](https://img.shields.io/badge/status-active-39ff6a)

## Features

- ICU-style dark monitor display (ECG, Pleth, Resp, Capnograph — all canvas-animated, not images)
- HR, NIBP, SpO₂, RR, EtCO₂, Temp numerics with alarm banner
- 20 ECG rhythms: Sinus (normal/tachy/brady), SVT, AFib, AFlutter, 1°/2° Mobitz I & II/3° AV block, Monomorphic & Polymorphic VT, Torsades, VFib (coarse/fine), Asystole, LBBB, RBBB, STEMI, NSTEMI
- Independent parameter control — set HR, pulse, BP, SpO₂, RR, EtCO₂, Temp independently of the ECG rhythm
- One-tap scenarios: PEA, ROSC, Shock, Stable baseline
- Cardiac arrest toggle
- Cross-device sync (laptop ↔ phone) via Firebase Realtime Database, with local same-browser fallback
- Responsive — works on laptops, tablets, phones

## Live Demo

This is a PWA — installable on phones/tablets/laptops ("Add to Home Screen" / "Install app"), works offline (app shell cached via service worker).

Open `index.html` in a browser. Same-browser tabs sync immediately. For cross-device sync, see [SETUP.md](SETUP.md) to add your free Firebase config.

## Deploy with GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Build and deployment → Source** → select **GitHub Actions**.
3. Push to `main` — the included workflow (`.github/workflows/deploy.yml`) deploys automatically.
4. Your app will be live at `https://<username>.github.io/<repo-name>/`.
5. On a phone, open that URL in Chrome/Safari and choose **Add to Home Screen** to install it as a PWA.

## Quick Start

1. Open `index.html`
2. Choose **Patient Monitor** (project this on the big screen) or **Instructor Controller** (use on your phone)
3. Generate or enter a room code on both devices
4. Run your megacode scenario

## Project Structure

```
.
├── index.html       # App shell, landing page, monitor & controller UI
├── app.js           # State, sync layer, waveform engine
├── manifest.json    # PWA manifest
├── sw.js            # Service worker (offline caching)
├── icon-192.png
├── icon-512.png
├── SETUP.md          # Firebase setup for cross-device sync
└── .github/workflows/deploy.yml  # GitHub Pages auto-deploy
```

## Tech

Vanilla JS, HTML5 Canvas, Firebase Realtime Database (optional, for cross-device sync). No build step required.

## License

MIT — free to use and adapt for training purposes.

## Disclaimer

For educational/simulation use only. Not a medical device. Do not use for actual patient monitoring.
