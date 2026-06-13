import { apiClient } from './api';

export interface GamificationProfile {
  user_id: number;
  total_xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  badges: string[];
  xp_to_next_level: number;
}

export interface AchievementInfo {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  name: string;
  total_xp: number;
  level: number;
}

export const gamificationService = {
  getProfile: async (): Promise<GamificationProfile> => {
    return apiClient.get('/gamification/me', true);
  },

  getAchievements: async (): Promise<AchievementInfo[]> => {
    return apiClient.get('/gamification/achievements', true);
  },

  getLeaderboard: async (limit: number = 20): Promise<LeaderboardEntry[]> => {
    return apiClient.get(`/gamification/leaderboard?limit=${encodeURIComponent(String(limit))}`, true);
  },
};
