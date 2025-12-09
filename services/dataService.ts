import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Project, Task, OKR, ProgressEntry } from '../types';

// ==================== 类型转换 ====================

// 数据库行类型 -> 前端类型
const dbProjectToProject = (row: any): Project => ({
  id: row.id,
  name: row.name,
  clientName: row.client_name,
  clientType: row.client_type,
  stage: row.stage,
  color: row.color,
  updatedAt: row.updated_at,
  description: row.description || undefined,
  budget: row.budget || undefined,
  decisionMaker: row.decision_maker || undefined,
  competitors: row.competitors || undefined,
  nextStep: row.next_step || undefined,
  progressHistory: [] // 单独加载
});

const dbTaskToTask = (row: any): Task => ({
  id: row.id,
  projectId: row.project_id || '',
  content: row.content,
  date: row.date,
  isCompleted: row.is_completed,
  krId: row.kr_id || undefined
});

const dbOkrToOkr = (row: any, keyResults: any[]): OKR => ({
  id: row.id,
  projectId: row.project_id,
  objective: row.objective,
  keyResults: keyResults.map(kr => ({
    id: kr.id,
    content: kr.content,
    progress: kr.progress
  }))
});

const dbProgressToProgress = (row: any): ProgressEntry => ({
  id: row.id,
  date: row.date,
  type: row.type,
  content: row.content,
  details: row.details || undefined
});

// ==================== Projects ====================

export const fetchProjects = async (): Promise<Project[]> => {
  if (!isSupabaseConfigured()) return [];

  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching projects:', error);
    return [];
  }

  // 获取每个项目的进展历史
  const projectsWithHistory = await Promise.all(
    (projects || []).map(async (p) => {
      const { data: history } = await supabase
        .from('progress_entries')
        .select('*')
        .eq('project_id', p.id)
        .order('date', { ascending: false });

      return {
        ...dbProjectToProject(p),
        progressHistory: (history || []).map(dbProgressToProgress)
      };
    })
  );

  return projectsWithHistory;
};

export const createProject = async (project: Project): Promise<Project | null> => {
  if (!isSupabaseConfigured()) return project;

  const { data, error } = await supabase
    .from('projects')
    .insert({
      id: project.id,
      name: project.name,
      client_name: project.clientName,
      client_type: project.clientType,
      stage: project.stage,
      color: project.color,
      updated_at: project.updatedAt,
      description: project.description || null,
      budget: project.budget || null,
      decision_maker: project.decisionMaker || null,
      competitors: project.competitors || null,
      next_step: project.nextStep || null
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating project:', error);
    return null;
  }

  return dbProjectToProject(data);
};

export const updateProject = async (project: Project): Promise<boolean> => {
  if (!isSupabaseConfigured()) return true;

  const { error } = await supabase
    .from('projects')
    .update({
      name: project.name,
      client_name: project.clientName,
      client_type: project.clientType,
      stage: project.stage,
      color: project.color,
      updated_at: project.updatedAt,
      description: project.description || null,
      budget: project.budget || null,
      decision_maker: project.decisionMaker || null,
      competitors: project.competitors || null,
      next_step: project.nextStep || null
    })
    .eq('id', project.id);

  if (error) {
    console.error('Error updating project:', error);
    return false;
  }
  return true;
};

export const deleteProject = async (projectId: string): Promise<boolean> => {
  if (!isSupabaseConfigured()) return true;

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) {
    console.error('Error deleting project:', error);
    return false;
  }
  return true;
};

// ==================== Progress Entries ====================

export const addProgressEntry = async (projectId: string, entry: ProgressEntry): Promise<boolean> => {
  if (!isSupabaseConfigured()) return true;

  const { error } = await supabase
    .from('progress_entries')
    .insert({
      id: entry.id,
      project_id: projectId,
      date: entry.date,
      type: entry.type,
      content: entry.content,
      details: entry.details || null
    });

  if (error) {
    console.error('Error adding progress entry:', error);
    return false;
  }
  return true;
};

// ==================== Tasks ====================

export const fetchTasks = async (): Promise<Task[]> => {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }

  return (data || []).map(dbTaskToTask);
};

export const createTask = async (task: Task): Promise<Task | null> => {
  if (!isSupabaseConfigured()) return task;

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      id: task.id,
      project_id: task.projectId || null,
      content: task.content,
      date: task.date,
      is_completed: task.isCompleted,
      kr_id: task.krId || null
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating task:', error);
    return null;
  }

  return dbTaskToTask(data);
};

export const updateTask = async (task: Task): Promise<boolean> => {
  if (!isSupabaseConfigured()) return true;

  const { error } = await supabase
    .from('tasks')
    .update({
      content: task.content,
      date: task.date,
      is_completed: task.isCompleted,
      kr_id: task.krId || null
    })
    .eq('id', task.id);

  if (error) {
    console.error('Error updating task:', error);
    return false;
  }
  return true;
};

export const deleteTask = async (taskId: string): Promise<boolean> => {
  if (!isSupabaseConfigured()) return true;

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    console.error('Error deleting task:', error);
    return false;
  }
  return true;
};

// ==================== OKRs ====================

export const fetchOkrs = async (): Promise<OKR[]> => {
  if (!isSupabaseConfigured()) return [];

  const { data: okrs, error: okrError } = await supabase
    .from('okrs')
    .select('*');

  if (okrError) {
    console.error('Error fetching OKRs:', okrError);
    return [];
  }

  // 获取所有 key results
  const { data: keyResults, error: krError } = await supabase
    .from('key_results')
    .select('*');

  if (krError) {
    console.error('Error fetching key results:', krError);
    return [];
  }

  return (okrs || []).map(okr =>
    dbOkrToOkr(okr, (keyResults || []).filter(kr => kr.okr_id === okr.id))
  );
};

export const upsertOkr = async (okr: OKR): Promise<boolean> => {
  if (!isSupabaseConfigured()) return true;

  // Upsert OKR
  const { error: okrError } = await supabase
    .from('okrs')
    .upsert({
      id: okr.id,
      project_id: okr.projectId,
      objective: okr.objective,
      updated_at: new Date().toISOString()
    });

  if (okrError) {
    console.error('Error upserting OKR:', okrError);
    return false;
  }

  // 删除旧的 key results
  await supabase
    .from('key_results')
    .delete()
    .eq('okr_id', okr.id);

  // 插入新的 key results
  if (okr.keyResults.length > 0) {
    const { error: krError } = await supabase
      .from('key_results')
      .insert(
        okr.keyResults.map(kr => ({
          id: kr.id,
          okr_id: okr.id,
          content: kr.content,
          progress: kr.progress
        }))
      );

    if (krError) {
      console.error('Error inserting key results:', krError);
      return false;
    }
  }

  return true;
};

export const deleteOkr = async (okrId: string): Promise<boolean> => {
  if (!isSupabaseConfigured()) return true;

  const { error } = await supabase
    .from('okrs')
    .delete()
    .eq('id', okrId);

  if (error) {
    console.error('Error deleting OKR:', error);
    return false;
  }
  return true;
};

// ==================== 数据导出 ====================

export interface ExportData {
  exportedAt: string;
  projects: Project[];
  tasks: Task[];
  okrs: OKR[];
}

export const exportAllData = async (): Promise<ExportData> => {
  const projects = await fetchProjects();
  const tasks = await fetchTasks();
  const okrs = await fetchOkrs();

  return {
    exportedAt: new Date().toISOString(),
    projects,
    tasks,
    okrs
  };
};

export const downloadDataAsJson = async () => {
  const data = await exportAllData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales-assistant-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const downloadDataAsCsv = async () => {
  const data = await exportAllData();

  // 导出项目
  const projectsCsv = [
    ['ID', '项目名称', '客户名称', '客户类型', '阶段', '预算', '决策人', '竞品', '下一步', '更新时间'].join(','),
    ...data.projects.map(p => [
      p.id,
      `"${p.name}"`,
      `"${p.clientName}"`,
      p.clientType,
      p.stage,
      `"${p.budget || ''}"`,
      `"${p.decisionMaker || ''}"`,
      `"${p.competitors || ''}"`,
      `"${p.nextStep || ''}"`,
      p.updatedAt
    ].join(','))
  ].join('\n');

  // 导出任务
  const tasksCsv = [
    ['ID', '项目ID', '内容', '日期', '是否完成', 'KR ID'].join(','),
    ...data.tasks.map(t => [
      t.id,
      t.projectId,
      `"${t.content}"`,
      t.date,
      t.isCompleted ? '是' : '否',
      t.krId || ''
    ].join(','))
  ].join('\n');

  // 导出 OKR
  const okrsCsv = [
    ['OKR ID', '项目ID', '目标', 'KR ID', 'KR内容', '进度'].join(','),
    ...data.okrs.flatMap(o =>
      o.keyResults.map(kr => [
        o.id,
        o.projectId,
        `"${o.objective}"`,
        kr.id,
        `"${kr.content}"`,
        kr.progress
      ].join(','))
    )
  ].join('\n');

  // 合并所有数据
  const fullCsv = `# 项目数据\n${projectsCsv}\n\n# 任务数据\n${tasksCsv}\n\n# OKR数据\n${okrsCsv}`;

  const blob = new Blob(['\ufeff' + fullCsv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales-assistant-backup-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
