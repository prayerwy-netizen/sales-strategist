-- Supabase 数据库表结构
-- 在 Supabase Dashboard SQL Editor 中执行此脚本

-- 项目表
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_type TEXT NOT NULL CHECK (client_type IN ('终端客户', '代理商', '厂家伙伴')),
  stage TEXT NOT NULL CHECK (stage IN ('初次接触', '需求确认', '方案演示', '商务谈判', '签约', '实施', '品牌管理')),
  color TEXT NOT NULL DEFAULT '#3B82F6',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT,
  budget TEXT,
  decision_maker TEXT,
  competitors TEXT,
  next_step TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 项目进展历史表
CREATE TABLE progress_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('report', 'task_completed', 'kr_progress', 'stage_change')),
  content TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 任务表
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  date DATE NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  kr_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OKR表
CREATE TABLE okrs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id)
);

-- Key Results 表
CREATE TABLE key_results (
  id TEXT PRIMARY KEY,
  okr_id TEXT NOT NULL REFERENCES okrs(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX idx_progress_entries_project_id ON progress_entries(project_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_date ON tasks(date);
CREATE INDEX idx_key_results_okr_id ON key_results(okr_id);

-- 启用 RLS (Row Level Security) 但允许匿名访问（因为暂时不需要登录）
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE okrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_results ENABLE ROW LEVEL SECURITY;

-- 创建策略允许所有操作（单用户模式）
CREATE POLICY "Allow all for projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for progress_entries" ON progress_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for okrs" ON okrs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for key_results" ON key_results FOR ALL USING (true) WITH CHECK (true);
