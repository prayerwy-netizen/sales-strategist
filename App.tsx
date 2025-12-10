import React, { useState, useEffect } from 'react';
import { Calendar, Layout, User, Mic, Loader2 } from 'lucide-react';
import CalendarView from './components/CalendarView';
import ProjectKanban from './components/ProjectKanban';
import ProjectDetail from './components/ProjectDetail';
import MePage from './components/MePage';
import DailyReportModal from './components/DailyReportModal';
import NewProjectModal from './components/NewProjectModal';
import { Project, Task, ProjectStage, OKR, ProgressEntry } from './types';
import { isSupabaseConfigured } from './services/supabaseClient';
import * as dataService from './services/dataService';

// 生成唯一 ID 的工具函数
const generateId = (prefix: string = '') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
};

type Tab = 'calendar' | 'projects' | 'me';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('calendar');
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [okrs, setOkrs] = useState<OKR[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Navigation State
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);

  // 初始化加载数据
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        if (isSupabaseConfigured()) {
          const [loadedProjects, loadedTasks, loadedOkrs] = await Promise.all([
            dataService.fetchProjects(),
            dataService.fetchTasks(),
            dataService.fetchOkrs()
          ]);
          setProjects(loadedProjects);
          setTasks(loadedTasks);
          setOkrs(loadedOkrs);
        } else {
          console.warn('Supabase 未配置，使用本地示例数据');
          // 使用本地示例数据
          setProjects([
            { id: '1', name: 'Alpha Tech 采购案', clientName: 'Alpha Tech', clientType: '终端客户', stage: '商务谈判', color: '#EF4444', updatedAt: new Date().toISOString() },
            { id: '2', name: 'Beta 渠道拓展', clientName: 'Beta Inc', clientType: '代理商', stage: '初次接触', color: '#3B82F6', updatedAt: new Date().toISOString() },
          ]);
          setTasks([
            { id: 't1', projectId: '1', content: '发送最终报价单', date: new Date().toISOString().split('T')[0], isCompleted: false },
          ]);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Handlers
  const handleOpenNewProjectModal = () => {
    setIsNewProjectModalOpen(true);
  };

  const handleSaveNewProject = async (projectData: Omit<Project, 'id' | 'updatedAt'>, suggestedOKR?: { objective: string; keyResults: string[] }) => {
    const projectId = generateId('project');
    const newProject: Project = {
      ...projectData,
      id: projectId,
      updatedAt: new Date().toISOString()
    };

    // 先更新本地状态
    setProjects(prev => [...prev, newProject]);

    // 持久化到数据库
    await dataService.createProject(newProject);

    // If OKR was suggested, create it
    if (suggestedOKR) {
      const newOKR: OKR = {
        id: generateId('okr'),
        projectId: projectId,
        objective: suggestedOKR.objective,
        keyResults: suggestedOKR.keyResults.map((kr) => ({
          id: generateId('kr'),
          content: kr,
          progress: 0
        }))
      };
      setOkrs(prev => [...prev, newOKR]);
      await dataService.upsertOkr(newOKR);
    }
  };

  const handleUpdateStage = async (projectId: string, newStage: ProjectStage) => {
    const project = projects.find(p => p.id === projectId);
    if (project && project.stage !== newStage) {
      // 记录阶段变更到项目进展
      await addProgressToProject(projectId, {
        date: new Date().toISOString().split('T')[0],
        type: 'stage_change',
        content: `阶段推进：${project.stage} → ${newStage}`
      });
    }

    const updatedProject = { ...project!, stage: newStage, updatedAt: new Date().toISOString() };
    setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
    await dataService.updateProject(updatedProject);
  };

  const handleSaveTasks = async (newTasks: { content: string, date: string, projectId: string, krId?: string }[]) => {
    const tasksToAdd: Task[] = newTasks.map((t) => ({
      id: generateId('task'),
      projectId: t.projectId,
      content: t.content,
      date: t.date,
      isCompleted: false,
      krId: t.krId
    }));

    setTasks(prev => [...prev, ...tasksToAdd]);

    // 批量持久化
    for (const task of tasksToAdd) {
      await dataService.createTask(task);
    }
  };

  // 添加进展记录到项目
  const addProgressToProject = async (projectId: string, entry: Omit<ProgressEntry, 'id'>) => {
    const newEntry: ProgressEntry = {
      ...entry,
      id: generateId('progress')
    };

    setProjects(prev => prev.map(p => {
      if (p.id === projectId) {
        return {
          ...p,
          progressHistory: [...(p.progressHistory || []), newEntry],
          updatedAt: new Date().toISOString()
        };
      }
      return p;
    }));

    // 持久化进展记录
    await dataService.addProgressEntry(projectId, newEntry);
  };

  const handleToggleTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (!task.isCompleted && task.projectId) {
      // 任务被标记为完成，记录到项目进展
      await addProgressToProject(task.projectId, {
        date: new Date().toISOString().split('T')[0],
        type: 'task_completed',
        content: `完成任务：${task.content}`
      });
    }

    const updatedTask = { ...task, isCompleted: !task.isCompleted };
    setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    await dataService.updateTask(updatedTask);
  };

  const handleDeleteTask = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    await dataService.deleteTask(taskId);
  };

  const handleEditTask = async (taskId: string, content: string, date: string, krId?: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedTask = { ...task, content, date, krId: krId !== undefined ? krId : task.krId };
    setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    await dataService.updateTask(updatedTask);
  };

  const handleUpdateOKR = async (newOkr: OKR) => {
    setOkrs(prev => {
      const existingIdx = prev.findIndex(o => o.projectId === newOkr.projectId);
      if (existingIdx >= 0) {
        const oldOkr = prev[existingIdx];
        // 检查 KR 进度变化并记录
        newOkr.keyResults.forEach(newKr => {
          const oldKr = oldOkr.keyResults.find(kr => kr.id === newKr.id);
          if (oldKr && oldKr.progress !== newKr.progress) {
            addProgressToProject(newOkr.projectId, {
              date: new Date().toISOString().split('T')[0],
              type: 'kr_progress',
              content: `KR进度更新：${newKr.content.slice(0, 20)}${newKr.content.length > 20 ? '...' : ''}`,
              details: `${oldKr.progress}% → ${newKr.progress}%`
            });
          }
        });
        // 检查是否有新增 KR
        const newKRs = newOkr.keyResults.filter(
          kr => !oldOkr.keyResults.find(old => old.id === kr.id)
        );
        if (newKRs.length > 0) {
          addProgressToProject(newOkr.projectId, {
            date: new Date().toISOString().split('T')[0],
            type: 'kr_progress',
            content: `新增${newKRs.length}个KR`,
            details: newKRs.map(kr => kr.content).join('; ')
          });
        }
        const updated = [...prev];
        updated[existingIdx] = newOkr;
        return updated;
      }
      // 新建 OKR
      addProgressToProject(newOkr.projectId, {
        date: new Date().toISOString().split('T')[0],
        type: 'kr_progress',
        content: `设定OKR：${newOkr.objective}`,
        details: `包含${newOkr.keyResults.length}个KR`
      });
      return [...prev, newOkr];
    });

    // 持久化 OKR
    await dataService.upsertOkr(newOkr);
  };

  const handleUpdateProject = async (updatedProject: Project) => {
    const projectWithTime = { ...updatedProject, updatedAt: new Date().toISOString() };

    setProjects(prev => prev.map(p =>
      p.id === updatedProject.id ? projectWithTime : p
    ));

    // Also update selectedProject so the detail view shows the new data
    if (selectedProject?.id === updatedProject.id) {
      setSelectedProject(projectWithTime);
    }

    await dataService.updateProject(projectWithTime);
  };

  const handleAddTask = async (task: { content: string; date: string; projectId?: string; krId?: string }) => {
    const newTask: Task = {
      id: generateId('task'),
      projectId: task.projectId || '',
      content: task.content,
      date: task.date,
      isCompleted: false,
      krId: task.krId
    };

    setTasks(prev => [...prev, newTask]);
    await dataService.createTask(newTask);
  };

  const handleDeleteProject = async (projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    setTasks(prev => prev.filter(t => t.projectId !== projectId));
    setOkrs(prev => prev.filter(o => o.projectId !== projectId));

    // 删除项目会级联删除相关数据（数据库有 ON DELETE CASCADE）
    await dataService.deleteProject(projectId);
  };

  // 加载中显示
  if (isLoading) {
    return (
      <div className="h-full flex flex-col bg-white max-w-md mx-auto shadow-2xl items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="mt-4 text-gray-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white max-w-md mx-auto shadow-2xl overflow-hidden relative">

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'calendar' && (
          <CalendarView
            tasks={tasks}
            projects={projects}
            okrs={okrs}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
            onEditTask={handleEditTask}
            onAddTask={handleAddTask}
          />
        )}
        {activeTab === 'projects' && (
          <ProjectKanban
            projects={projects}
            onProjectClick={setSelectedProject}
            onAddProject={handleOpenNewProjectModal}
            onUpdateProjectStage={handleUpdateStage}
          />
        )}
        {activeTab === 'me' && <MePage projects={projects} okrs={okrs} tasks={tasks} />}
      </div>

      {/* Floating Action Button for Report (Only visible on Calendar) */}
      {activeTab === 'calendar' && !selectedProject && (
        <button
          onClick={() => setIsReportModalOpen(true)}
          className="absolute bottom-24 right-6 bg-primary text-white p-4 rounded-full shadow-lg shadow-indigo-300 hover:scale-105 transition-transform z-10 flex items-center gap-2 font-bold"
        >
          <Mic size={24} /> 今日汇报
        </button>
      )}

      {/* Bottom Navigation */}
      <nav className="h-16 border-t border-gray-100 flex items-center justify-around bg-white z-20">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'calendar' ? 'text-primary' : 'text-gray-400'}`}
        >
          <Calendar size={24} />
          <span className="text-[10px]">日历</span>
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'projects' ? 'text-primary' : 'text-gray-400'}`}
        >
          <Layout size={24} />
          <span className="text-[10px]">项目</span>
        </button>
        <button
          onClick={() => setActiveTab('me')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'me' ? 'text-primary' : 'text-gray-400'}`}
        >
          <User size={24} />
          <span className="text-[10px]">我的</span>
        </button>
      </nav>

      {/* Modals & Overlays */}
      <DailyReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        projects={projects}
        onSaveTasks={handleSaveTasks}
        onSaveOKR={handleUpdateOKR}
        onUpdateProject={handleUpdateProject}
        okrs={okrs}
        tasks={tasks}
      />

      {selectedProject && (
        <ProjectDetail
            project={selectedProject}
            tasks={tasks.filter(t => t.projectId === selectedProject.id)}
            okr={okrs.find(o => o.projectId === selectedProject.id)}
            onBack={() => setSelectedProject(null)}
            onUpdateOKR={handleUpdateOKR}
            onUpdateProject={handleUpdateProject}
            onAddTask={handleAddTask}
            onEditTask={handleEditTask}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
            onDeleteProject={(projectId) => {
              handleDeleteProject(projectId);
              setSelectedProject(null);
            }}
        />
      )}

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onSave={handleSaveNewProject}
      />
    </div>
  );
};

export default App;
