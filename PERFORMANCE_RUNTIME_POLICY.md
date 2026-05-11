# Moguria v2.4 Runtime Performance Policy

Moguria is designed for mobile browser play. Visual effects should feel rich, but must not cause heat, input lag, freezes, or browser crashes.

## Rules

- Cap particles, projectiles, drops, and transient effects.
- Reduce particle count automatically when FPS drops.
- Keep gameplay input independent from heavy visual effects.
- Prefer short-lived Canvas effects over large images or videos during battle.
- Use audio sparingly and avoid excessive simultaneous playback.
- Keep boss and chain effects readable, not screen-filling.

## Current safeguards

- `MoguriaPerformance` monitors FPS and reports quality level.
- `MoguriaConfig.performance` defines object caps.
- Particle bursts are reduced on medium/low FPS.
- Visual effects are capped and oldest effects are removed first.
- Projectiles and drops have upper limits.

## Future additions

- Optional low-power mode toggle.
- Device class detection.
- Separate “performance” and “rich effects” settings.
- WebAudio pooling when real SE/BGM assets are added.
