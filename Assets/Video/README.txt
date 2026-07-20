Training chamber sim-feed videos (looped while the player trains).

Drop files here — the overlay picks them up automatically, no code changes:

  training_<programId>.mp4   per-program feed (checked first)
  training.mp4               shared fallback for all programs

Program ids: strength_sim, endurance_sim, overdrive_arena, bulwark_sim
(defined in js/systems/TrainingAreaSystem.js STATION_DEFS)

Until a file exists the overlay shows an animated holo placeholder.
Videos autoplay muted and loop; mp4 (H.264) is the safe codec choice.
