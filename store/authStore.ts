import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  username: string;
  avatar_id: string;
  avatar_color: string;
  points: number;
  wins: number;
  losses: number;
  total_questions_answered: number;
  correct_answers: number;
  owned_cosmetics: string[];
}

interface AuthState {
  session: any | null;
  profile: UserProfile | null;
  loading: boolean;
  setSession: (session: any) => void;
  setProfile: (profile: UserProfile) => void;
  loadProfile: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  loading: false,

  setSession: (session) => set({ session }),

  setProfile: (profile) => set({ profile }),

  loadProfile: async (userId: string) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error && data) {
      set({ profile: data as UserProfile });
    }
    set({ loading: false });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },
}));
