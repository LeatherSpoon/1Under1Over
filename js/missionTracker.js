import { MissionTracker } from './ui/MissionTracker.js';

export function initMissionTracker({ codexSystem }) {
  const missionTracker = new MissionTracker({ codexSystem });
  window.missionTracker = missionTracker;
  missionTracker.setMain('First Contact: walk 50 steps to begin.');
  return missionTracker;
}
