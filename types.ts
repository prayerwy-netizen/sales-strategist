export type ProjectStage = 
  | '初次接触' 
  | '需求确认' 
  | '方案演示' 
  | '商务谈判' 
  | '签约' 
  | '实施' 
  | '品牌管理';

export type ClientType = '终端客户' | '代理商' | '厂家伙伴';

// 项目进展记录
export interface ProgressEntry {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'report' | 'task_completed' | 'kr_progress' | 'stage_change';
  content: string;
  details?: string; // 额外详情
}

export interface Project {
  id: string;
  name: string;
  clientName: string;
  clientType: ClientType;
  stage: ProjectStage;
  color: string;
  updatedAt: string; // ISO Date string
  description?: string; // 项目整体描述：背景、目标、关键信息
  budget?: string; // 预算范围
  decisionMaker?: string; // 关键决策人
  competitors?: string; // 竞品情况
  nextStep?: string; // 当前下一步计划
  progressHistory?: ProgressEntry[]; // 项目进展历史
}

export interface Task {
  id: string;
  projectId: string;
  content: string;
  date: string; // YYYY-MM-DD
  isCompleted: boolean;
  krId?: string; // 关联的 Key Result ID
}

export interface OKR {
  id: string;
  projectId: string;
  objective: string;
  keyResults: {
    id: string;
    content: string;
    progress: number; // 0-100
  }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
}

export interface ReportAnalysisResult {
  analysis: string; // The sharp advice
  suggestedTasks: {
    content: string;
    date: string; // YYYY-MM-DD
    suggestedKRContent?: string; // AI建议关联的KR内容
  }[];
  suggestedOKR?: {
    objective: string;
    keyResults: string[];
  };
  projectUpdates?: {
    description?: string;
    budget?: string;
    decisionMaker?: string;
    competitors?: string;
    nextStep?: string;
  };
}

// AI 洞察结果（包含可转化的建议）
export interface ProjectInsightResult {
  analysis: string; // 项目状态分析
  risks: string[]; // 风险点
  suggestedTasks: {
    content: string;
    date: string;
  }[];
  suggestedKRs: string[]; // 建议的关键结果
}