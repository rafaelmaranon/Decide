# DECIDE — Real-time Incident Decision Assistant

Minimal, deterministic web app for ops decision support. No backend, no auth, no DB.

## Run locally

Option A: Use a simple static server (Python 3)
```
python3 -m http.server 8080
```
Then open http://localhost:8080 in your browser.

Option B: Open `index.html` directly (most browsers will load it fine).

## Demo flow (per spec)
- Click "Blocked 1 min (transient)" → shows Monitor
- Click "Blocked 6 min with rider" → shows Remote Assist
- Press Confirm → sets currentIntervention=Remote Assist; attemptCount=1
- Click "+5m (still blocked)" → recommendation escalates to Field Recovery (closed-loop)
- Click "Stuck with police" → shows Field Recovery immediately
- Click "Degraded not drivable" → shows Service

## UI Elements
- Situation Strip: condition, time, rider, police, drivable, intervention
- Decision Card: big icon + state name, priority badge, one-line why
- Confidence Cues: 3 short bullets (labels + short answers)
- Actions: Confirm, Escalate, Override (override modal)
- Scenario Selector: 5 presets + "+5m" and "Reset Attempts"

## Decision logic (rules-first)
Base rules (in order):
1. Degraded AND not drivable → Service, High
2. Stuck AND police present → Field Recovery, High
3. Stuck AND rider onboard → Remote Assist, High
4. Blocked AND time ≥ 5 → Remote Assist, Medium
5. Else → Monitor, Low

Closed-loop rule:
- If currentIntervention=remote AND attemptCount ≥ 1 AND unresolved (Blocked/Stuck AND time ≥ 5) → Field Recovery, High

## Notes
- Actions immediately update inputs and re-run evaluation.
- All logic is in `app.js`. Styling in `styles.css`. Markup in `index.html`.
