# RhythmIQ Megacode Simulator — Setup

## Quick start (single device / same-browser testing)
Just open `index.html`. Choose "Patient Monitor" or "Instructor Controller",
generate a room code, and connect. If you open the controller and monitor in
two tabs of the **same browser**, they will sync instantly via
BroadcastChannel/localStorage — no setup needed.

## Cross-device sync (laptop + phone) — Firebase setup (free, 5 minutes)
To sync between two different devices (e.g., laptop projecting the monitor,
phone as the controller), you need a free Firebase Realtime Database:

1. Go to https://console.firebase.google.com and create a free project.
2. In the project, go to **Build → Realtime Database → Create Database**.
   - Choose any region.
   - Start in **test mode** (read/write open) — fine for training use on a
     local network. For longer-term use, tighten the rules.
3. Go to **Project Settings → General → Your apps → Web app**, register an
   app, and copy the config object.
4. Open `app.js` and replace the `FIREBASE_CONFIG` object near the top with
   your copied values:

```js
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT"
};
```

5. Re-host or re-open `index.html`. Both devices, on any network, can now
   connect using the same room code (e.g., "ABCD") and will sync in real
   time.

## Usage in a training session
1. On the laptop/projector: open the app → **Patient Monitor** → generate a
   room code → Connect. Project this screen full-screen for trainees.
2. On the instructor's phone: open the same URL → **Instructor Controller**
   → enter the **same room code** → Connect.
3. Use rhythm buttons, sliders, scenario presets, and the cardiac arrest
   toggle to run the megacode. All changes appear on the monitor instantly.

## Notes
- All ECG, pleth, respiration, and capnograph waveforms are generated
  mathematically in real time (canvas), not static images.
- "Independent parameter control" scenarios (PEA, ROSC, Shock) are built in
  as one-tap presets, and every parameter can also be set independently.
- Works on laptops, tablets, and phones; monitor view rearranges to a
  mobile-friendly layout below 700px width.
