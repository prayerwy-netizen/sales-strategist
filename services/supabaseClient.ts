import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 从环境变量获取 Supabase 配置
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 单例 Supabase 客户端
let supabaseInstance: SupabaseClient | null = null;

// 获取 Supabase 客户端（单例模式，确保只创建一个实例）
export const getSupabase = (): SupabaseClient | null => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });
  }
  return supabaseInstance;
};

// 检查 Supabase 是否已配置
export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};
