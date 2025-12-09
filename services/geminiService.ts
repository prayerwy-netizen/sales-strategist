import { GoogleGenAI, Type } from "@google/genai";
import { ReportAnalysisResult, Project, ProjectStage, ClientType, Task, ProjectInsightResult, OKR } from "../types";

// Initialize Gemini Client
// NOTE: In a real app, never expose API keys on the client. 
// This is for demonstration purposes using the provided runtime environment variable.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION_SHARP = `
你是一个名为“销售军师”的ToB销售和品牌专家。你的风格非常直接、犀利、不留情面。
不要说废话，不要用客套话。
直接指出用户的问题，分析客户的真实心理，并给出具体的、可执行的下一步行动建议。
如果用户犯了错（比如跟进太慢、被客户忽悠），要严厉地指出来。
`;

/**
 * Transcribes audio blob to text using Gemini Flash.
 */
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    // Convert Blob to Base64
    const base64Data = await blobToBase64(audioBlob);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type || 'audio/webm',
              data: base64Data
            }
          },
          {
            text: "请将这段语音精准转写为文字。忽略口语中的结巴和重复，直接输出整洁的文本。"
          }
        ]
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("语音转写失败，请重试。");
  }
};

/**
 * Analyzes the daily report and generates tasks and OKR suggestions using Gemini.
 */
export const analyzeDailyReport = async (
  reportText: string,
  projectNames: string[],
  includeOKR: boolean = false
): Promise<ReportAnalysisResult> => {
  try {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const prompt = `
      今日工作汇报内容：
      "${reportText}"

      涉及项目：${projectNames.join(', ')}
      今天日期：${today.toISOString().split('T')[0]}

      请分析以上汇报，按以下要求输出：

      1. analysis（分析）：分析客户心理或当前局势，给出下一步行动建议。用直接、犀利的语气。

      2. suggestedTasks（待办任务）：从建议中提炼出3-5个具体的待办任务，每个任务包含：
         - content: 任务内容（具体、可执行）
         - date: 计划日期（YYYY-MM-DD格式，通常是明天或近几天）

      ${includeOKR ? `
      3. suggestedOKR（OKR建议）：如果汇报中提到了项目目标或阶段性成果，提炼出：
         - objective: 一个清晰的目标（O）
         - keyResults: 3个可量化的关键结果（KRs）
      ` : ''}
    `;

    const responseSchema: any = {
      type: Type.OBJECT,
      properties: {
        analysis: {
          type: Type.STRING,
          description: "Direct and sharp analysis of the situation and advice.",
        },
        suggestedTasks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              content: { type: Type.STRING, description: "Specific actionable task" },
              date: { type: Type.STRING, description: "YYYY-MM-DD format" }
            },
            required: ['content', 'date']
          }
        }
      },
      required: ['analysis', 'suggestedTasks']
    };

    if (includeOKR) {
      responseSchema.properties.suggestedOKR = {
        type: Type.OBJECT,
        properties: {
          objective: { type: Type.STRING, description: "Clear objective" },
          keyResults: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_SHARP,
        responseMimeType: "application/json",
        responseSchema
      }
    });

    if (response.text) {
      const result = JSON.parse(response.text) as ReportAnalysisResult;
      // Ensure dates are valid
      result.suggestedTasks = result.suggestedTasks.map(task => ({
        ...task,
        date: task.date || tomorrowStr
      }));
      return result;
    }
    throw new Error("No response from AI");

  } catch (error) {
    console.error("Analysis error:", error);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      analysis: "分析服务暂时不可用，但我建议你立刻复盘今天的沟通细节。",
      suggestedTasks: [
        { content: "复盘今天的工作内容", date: tomorrow.toISOString().split('T')[0] }
      ]
    };
  }
};

/**
 * Generates OKR suggestions based on complete project info.
 */
export const generateOKR = async (project: Project, existingOkr?: OKR, tasks?: Task[]): Promise<{objective: string, keyResults: string[]}> => {
  try {
    // 构建项目进展历史
    const progressSummary = project.progressHistory && project.progressHistory.length > 0
      ? project.progressHistory
          .slice(-10)
          .map(p => `[${p.date}] ${p.content}${p.details ? ` (${p.details})` : ''}`)
          .join('\n')
      : '暂无历史记录';

    // 构建任务情况
    const pendingTasks = tasks?.filter(t => !t.isCompleted) || [];
    const completedTasks = tasks?.filter(t => t.isCompleted) || [];

    const prompt = `
      为以下ToB销售项目制定OKR（目标与关键结果）。

      ## 项目全貌

      ### 基本信息
      - 项目名称：${project.name}
      - 客户名称：${project.clientName}
      - 客户类型：${project.clientType}
      - 当前阶段：${project.stage}
      ${project.description ? `- 项目背景：${project.description}` : ''}
      ${project.budget ? `- 预算范围：${project.budget}` : ''}
      ${project.decisionMaker ? `- 关键决策人：${project.decisionMaker}` : ''}
      ${project.competitors ? `- 竞品情况：${project.competitors}` : ''}
      ${project.nextStep ? `- 当前计划：${project.nextStep}` : ''}

      ### 现有OKR
      ${existingOkr ? `目标：${existingOkr.objective}\n关键结果：\n${existingOkr.keyResults.map((kr, i) => `  ${i+1}. ${kr.content} (进度${kr.progress}%)`).join('\n')}` : '暂无OKR'}

      ### 任务情况
      - 待完成：${pendingTasks.length}个
      - 已完成：${completedTasks.length}个
      ${pendingTasks.length > 0 ? `待办任务：\n${pendingTasks.slice(0, 5).map(t => `  - ${t.content}`).join('\n')}` : ''}

      ### 项目进展历史（最近）
      ${progressSummary}

      ## 要求
      1. 目标（Objective）要清晰、有挑战性，符合当前项目阶段
      2. 关键结果（Key Results）必须：
         - 可量化、可衡量
         - 与项目当前阶段和背景强相关
         - 能够真正推动项目向前
         - **必须提供3-5个关键结果**
      3. 如果已有OKR，建议的应该是补充而非重复
      4. 结合项目进展历史，给出针对性建议

      **重要：必须同时返回 objective 和 keyResults（至少3个）**
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            systemInstruction: SYSTEM_INSTRUCTION_SHARP,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    objective: { type: Type.STRING },
                    keyResults: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                },
                required: ['objective', 'keyResults']
            }
        }
    });

    const text = response.text;
    if (text) {
        const parsed = JSON.parse(text);
        // 验证返回结构
        if (parsed && parsed.objective && Array.isArray(parsed.keyResults) && parsed.keyResults.length > 0) {
            return parsed;
        }
        console.error('Invalid OKR response structure:', parsed);
    }
    throw new Error("Failed to generate OKR");
  } catch (e) {
      console.error('generateOKR error:', e);
      return {
          objective: "推进项目至下一阶段",
          keyResults: ["完成关键决策人拜访", "确定预算范围", "提交初步方案"]
      };
  }
};

/**
 * Generates AI insight for a project based on its current state and tasks.
 * Returns structured data that can be converted to OKR and tasks.
 */
export const generateProjectInsight = async (project: Project, tasks: Task[], okr?: OKR): Promise<ProjectInsightResult> => {
  try {
    const pendingTasks = tasks.filter(t => !t.isCompleted);
    const completedTasks = tasks.filter(t => t.isCompleted);
    const overdueTasks = pendingTasks.filter(t => t.date < new Date().toISOString().split('T')[0]);
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    // 构建项目进展历史
    const progressSummary = project.progressHistory && project.progressHistory.length > 0
      ? project.progressHistory
          .slice(-10)
          .map(p => `[${p.date}] ${p.content}${p.details ? ` (${p.details})` : ''}`)
          .join('\n')
      : '暂无历史记录';

    const prompt = `
      分析以下ToB销售项目的当前状态，并给出结构化的建议。

      ## 项目全貌

      ### 基本信息
      - 项目名称：${project.name}
      - 客户名称：${project.clientName}
      - 客户类型：${project.clientType}
      - 当前阶段：${project.stage}
      ${project.description ? `- 项目背景：${project.description}` : ''}
      ${project.budget ? `- 预算范围：${project.budget}` : ''}
      ${project.decisionMaker ? `- 关键决策人：${project.decisionMaker}` : ''}
      ${project.competitors ? `- 竞品情况：${project.competitors}` : ''}
      ${project.nextStep ? `- 当前计划：${project.nextStep}` : ''}

      ### 当前OKR
      ${okr ? `目标：${okr.objective}\n关键结果：\n${okr.keyResults.map((kr, i) => `  ${i+1}. ${kr.content} (进度${kr.progress}%)`).join('\n')}` : '暂无OKR'}

      ### 任务情况
      - 待完成：${pendingTasks.length}个
      - 已完成：${completedTasks.length}个
      - 过期未完成：${overdueTasks.length}个
      ${pendingTasks.length > 0 ? `待办事项：\n${pendingTasks.map(t => `- ${t.content} (${t.date})`).join('\n')}` : ''}

      ### 项目进展历史（最近）
      ${progressSummary}

      今天日期：${today}

      ## 要求
      请分析项目状态并给出：
      1. analysis: 项目状态分析和核心建议（2-3句话，直接、犀利）
      2. risks: 2-3个最需要关注的风险点
      3. suggestedTasks: 2-4个建议的下一步行动任务，每个任务包含内容和建议日期（格式YYYY-MM-DD，通常是近几天）
      4. suggestedKRs: 1-2个建议添加或关注的关键结果（如果当前OKR缺失或不完善）

      建议必须：
      - 与项目当前阶段和背景强相关
      - 具体、可执行
      - 如果有过期任务要严厉指出
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_SHARP,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING },
            risks: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            suggestedTasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  content: { type: Type.STRING },
                  date: { type: Type.STRING }
                },
                required: ['content', 'date']
              }
            },
            suggestedKRs: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ['analysis', 'risks', 'suggestedTasks', 'suggestedKRs']
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as ProjectInsightResult;
    }
    throw new Error('No response');
  } catch (e) {
    console.error('Insight error:', e);
    return {
      analysis: '分析服务暂时不可用，请稍后再试。',
      risks: [],
      suggestedTasks: [],
      suggestedKRs: []
    };
  }
};

/**
 * Conversational daily report analysis with follow-up questions
 */
export const chatDailyReport = async (
  conversationHistory: {role: string; parts: {text: string}[]}[],
  project: Project,
  existingKRs: string[],
  completedTasks?: string[],
  pendingTasks?: string[]
): Promise<{
  response: string;
  extractedData?: ReportAnalysisResult;
  isComplete: boolean;
}> => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 构建项目进展历史摘要
    const progressSummary = project.progressHistory && project.progressHistory.length > 0
      ? project.progressHistory
          .slice(-10) // 最近10条
          .map(p => `[${p.date}] ${p.content}${p.details ? ` (${p.details})` : ''}`)
          .join('\n')
      : '暂无历史记录';

    const systemPrompt = `你是"销售军师"，正在帮用户做每日工作汇报。你的风格直接、犀利、不啰嗦。

## 项目全貌

### 基本信息
- 项目名称：${project.name}
- 客户名称：${project.clientName}
- 客户类型：${project.clientType}
- 当前阶段：${project.stage}
${project.description ? `- 项目背景：${project.description}` : ''}
${project.budget ? `- 预算范围：${project.budget}` : ''}
${project.decisionMaker ? `- 关键决策人：${project.decisionMaker}` : ''}
${project.competitors ? `- 竞品情况：${project.competitors}` : ''}
${project.nextStep ? `- 当前计划：${project.nextStep}` : ''}

### 当前OKR
${existingKRs.length > 0 ? existingKRs.map((kr, i) => `${i+1}. ${kr}`).join('\n') : '暂未设定KR'}

### 任务情况
${completedTasks && completedTasks.length > 0 ? `已完成：\n${completedTasks.map(t => `✓ ${t}`).join('\n')}` : ''}
${pendingTasks && pendingTasks.length > 0 ? `待完成：\n${pendingTasks.map(t => `○ ${t}`).join('\n')}` : ''}

### 项目进展历史（最近）
${progressSummary}

---
今天日期：${todayStr}

## 你的任务
1. 基于以上项目全貌，理解项目当前状态
2. 通过对话收集今日工作汇报的关键信息
3. 每次只问1-2个问题，追问要点：今天做了什么？遇到什么问题？客户反馈如何？下一步计划？
4. 结合项目历史，给出有针对性的建议
5. 当信息足够时，输出结构化数据

当你认为汇报信息足够完整时，在回复最后添加JSON：

【汇报提取】
\`\`\`json
{
  "analysis": "你的犀利点评和建议（要结合项目历史给出有价值的洞察）",
  "suggestedTasks": [
    {"content": "具体任务", "date": "YYYY-MM-DD", "suggestedKRContent": "关联的KR内容（如果有）"}
  ],
  "suggestedOKR": {
    "objective": "建议的目标（如果需要新增）",
    "keyResults": ["KR1", "KR2"]
  },
  "projectUpdates": {
    "description": "更新的项目描述（如果有新信息）",
    "budget": "更新的预算信息（如果提到）",
    "decisionMaker": "更新的决策人信息（如果提到）",
    "competitors": "更新的竞品信息（如果提到）",
    "nextStep": "更新的下一步计划（如果提到）"
  },
  "complete": true
}
\`\`\`

注意：
- suggestedTasks中的suggestedKRContent应该匹配现有KR或建议的新KR
- projectUpdates只包含用户明确提到的新信息，没提到的字段不要包含
- 如果信息还不够，继续追问，不要输出JSON`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: conversationHistory,
      config: {
        systemInstruction: systemPrompt
      }
    });

    const responseText = response.text || "请再说详细一点？";

    // Check if there's extracted JSON
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        const extracted = JSON.parse(jsonMatch[1]) as ReportAnalysisResult & { complete?: boolean };
        const cleanedResponse = responseText.replace(/【汇报提取】[\s\S]*```json[\s\S]*```/, '').trim();

        return {
          response: cleanedResponse || '好，信息收集完毕！我帮你整理了汇报内容，确认一下？',
          extractedData: extracted,
          isComplete: extracted.complete || false
        };
      } catch (e) {
        // JSON parse failed
        return {
          response: responseText.replace(/```json[\s\S]*```/, '').trim(),
          isComplete: false
        };
      }
    }

    return {
      response: responseText,
      isComplete: false
    };
  } catch (error) {
    console.error("Chat report error:", error);
    return {
      response: "连接出了点问题，请重试。",
      isComplete: false
    };
  }
};

/**
 * Chat about a specific task - for daily task review
 */
export const chatTaskReport = async (
  conversationHistory: {role: string; parts: {text: string}[]}[],
  task: Task,
  project: Project,
  allDayTasks: Task[]
): Promise<{
  response: string;
  taskCompleted?: boolean;
  newTaskSuggestion?: { content: string; date: string };
}> => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const otherTasks = allDayTasks.filter(t => t.id !== task.id);
    const completedCount = allDayTasks.filter(t => t.isCompleted).length;

    // 构建项目进展历史摘要
    const progressSummary = project.progressHistory && project.progressHistory.length > 0
      ? project.progressHistory
          .slice(-5)
          .map(p => `[${p.date}] ${p.content}`)
          .join('\n')
      : '暂无历史记录';

    const systemPrompt = `你是"销售军师"，正在帮用户汇报任务完成情况。你的风格直接、简洁。

## 当前任务
- 任务内容：${task.content}
- 计划日期：${task.date}
- 完成状态：${task.isCompleted ? '已完成' : '未完成'}

## 关联项目
- 项目名称：${project.name}
- 客户名称：${project.clientName}
- 当前阶段：${project.stage}
${project.nextStep ? `- 下一步计划：${project.nextStep}` : ''}

## 今日其他任务（共${allDayTasks.length}个，已完成${completedCount}个）
${otherTasks.map(t => `${t.isCompleted ? '✓' : '○'} ${t.content}`).join('\n') || '无'}

## 项目近期进展
${progressSummary}

---
今天日期：${todayStr}

## 你的任务
1. 追问任务完成情况：做了什么？结果如何？有什么收获或问题？
2. 如果任务完成了，给予简短肯定并问下一步
3. 如果任务没完成，问原因和计划
4. 根据对话内容给出建议

当用户明确表示任务完成时，在回复末尾添加：
【任务完成】

如果用户提到了新的待办事项，在回复末尾添加：
【新建任务】
\`\`\`json
{"content": "任务内容", "date": "YYYY-MM-DD"}
\`\`\`

保持简洁，每次回复不超过3句话。`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: conversationHistory,
      config: {
        systemInstruction: systemPrompt
      }
    });

    const responseText = response.text || "请告诉我这个任务的完成情况？";

    // Check for task completion marker
    const taskCompleted = responseText.includes('【任务完成】');

    // Check for new task suggestion
    let newTaskSuggestion: { content: string; date: string } | undefined;
    const taskMatch = responseText.match(/【新建任务】\s*```json\s*([\s\S]*?)\s*```/);
    if (taskMatch) {
      try {
        newTaskSuggestion = JSON.parse(taskMatch[1]);
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Clean up response text
    let cleanedResponse = responseText
      .replace(/【任务完成】/g, '')
      .replace(/【新建任务】\s*```json[\s\S]*?```/g, '')
      .trim();

    return {
      response: cleanedResponse,
      taskCompleted,
      newTaskSuggestion
    };
  } catch (error) {
    console.error("Task chat error:", error);
    return {
      response: "连接出了点问题，请重试。"
    };
  }
};

/**
 * Helper to convert Blob to Base64 string
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};