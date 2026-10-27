# Manual test checklist

Run `npm run dev` and open http://localhost:5173. ✅ = verified in the in-app browser during development; ☐ = still needs a physical device or a manual pass.

## Solo
- ✅ Setup → lights → race → results with 5 medium bots, 1 minute
- ✅ Typo is highlighted in red, "Fix the error" hint shows, backspace clears it, accuracy drops (96%)
- ✅ Car accelerates and overtakes bots (P6 → P1); off-screen cars show edge markers with gaps
- ✅ Results: podium, per-driver table, ranking follows distance → eff. WPM → accuracy
- ☐ Pause/resume freezes the clock and the lights
- ☐ Jump start: type during the lights → "JUMP START" banner, input ignored for 2 s after lights out

## Multiplayer (two windows)
- ✅ Create room → code shown with Copy; second window joins via `?room=CODE` or by typing it
- ✅ Lobby shows both drivers, cars, connection state, readiness; Start is only enabled when everyone is ready
- ✅ Both see the same passage and lights; typing progress shows on both tracks
- ✅ Refreshing a player mid-race restores the seat, progress (95 chars) and remaining time
- ✅ Results are identical in both windows; "Return to lobby" starts a fresh race with a new passage and zero progress
- ☐ Kill the network on one client mid-race → "Connection lost" overlay; others keep racing
- ☐ Host leaves the lobby → host passes to the other player

## Responsive
- ✅ Desktop: about 70/30 track/typing split
- ✅ Mobile portrait (375×812 emulation): stacked about 50/50, compact telemetry, "Tap here to type"
- ☐ Real iOS Safari and Android Chrome: open the keyboard, check the passage and cursor stay visible (layout shrinks the track via `visualViewport`)
- ☐ Landscape phone
- ☐ OS "reduce motion" on → no shake/particles, instant scrolling
