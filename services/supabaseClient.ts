import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 从环境变量获取 Supabase 配置
const getSupabaseConfig = () => {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  return { url, key };
};

// 延迟初始化 Supabase 客户端
let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    return null;
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
};

// 兼容旧代码的导出（如果 Supabase 未配置则返回 null）
export const supabase = (() => {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    console.warn('Supabase 配置缺失，数据将不会持久化。');
    return null;
  }
  return createClient(url, key);
})();

// 检查 Supabase 是否已配置
export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
};
