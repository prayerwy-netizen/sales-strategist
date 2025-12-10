import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, Sparkles, Check, ChevronRight } from 'lucide-react';
import { Project, ProjectStage, ClientType, OKR } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

// 生成唯一 ID 的工具函数
const generateId = (prefix: string = '') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
};

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: Omit<Project, 'id' | 'updatedAt'>, okr?: { objective: string; keyResults: string[] }) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ExtractedInfo {
  name?: string;
  clientName?: string;
  clientType?: ClientType;
  stage?: ProjectStage;
  description?: string;
  budget?: string;
  decisionMaker?: string;
  competitors?: string;
  nextStep?: string;
  suggestedOKR?: {
    objective: string;
    keyResults: string[];
  };
}

const COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4',
];

const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose, onSave }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [extractedInfo, setExtractedInfo] = useState<ExtractedInfo>({});
  const [selectedColor, setSelectedColor] = useState(COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [showSummary, setShowSummary] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<{role: string; parts: {text: string}[]}[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize conversation when modal opens
  useEffect(() => {
    if (isOpen) {
      setMessages([{
        id: '1',
        role: 'assistant',
        content: '我是你的销售军师，来帮你梳理这个新项目。\n\n先告诉我：这是个什么项目？客户叫什么？'
      }]);
      setExtractedInfo({});
      setShowSummary(false);
      setSelectedColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
      setConversationHistory([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage = inputText.trim();
    const newUserMsg: ChatMessage = {
      id: generateId('msg'),
      role: 'user',
      content: userMessage
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.API_KEY || '';
      if (!apiKey) {
        throw new Error('Gemini API Key 未配置');
      }
      const ai = new GoogleGenAI({ apiKey });

      const systemPrompt = `你是"销售军师"，正在帮用户创建一个新的ToB销售项目。

你的任务：
1. 通过对话逐步收集项目关键信息
2. 每次只问1-2个问题，不要一次问太多
3. 说话直接、不啰嗦
4. 当信息收集足够时，总结并输出结构化数据

需要收集的信息：
- 项目名称（必填）
- 客户名称（必填）
- 客户类型：终端客户/代理商/厂家伙伴
- 当前阶段：初次接触/需求确认/方案演示/商务谈判/签约/实施/品牌管理
- 项目背景和目标（description）
- 预算范围（budget）
- 关键决策人（decisionMaker）
- 竞品情况（competitors）
- 当前下一步计划（nextStep）

对话策略：
1. 先确认基本信息（项目名、客户名、客户类型）
2. 再了解项目背景和当前进展
3. 然后问关键人物和竞争情况
4. 最后确认预算和下一步

当你认为信息已经足够（至少有项目名、客户名、客户类型、阶段、和一些背景描述），在回复的最后添加JSON格式的提取结果：

【信息提取】
\`\`\`json
{
  "name": "项目名称",
  "clientName": "客户名称",
  "clientType": "终端客户|代理商|厂家伙伴",
  "stage": "当前阶段",
  "description": "项目描述",
  "budget": "预算范围",
  "decisionMaker": "关键决策人",
  "competitors": "竞品情况",
  "nextStep": "下一步计划",
  "suggestedOKR": {
    "objective": "基于项目信息的推荐目标",
    "keyResults": ["KR1", "KR2", "KR3"]
  },
  "complete": true
}
\`\`\`

只有当信息足够完整时才输出JSON，complete设为true。如果信息还不够，继续追问。`;

      const newHistory = [
        ...conversationHistory,
        { role: 'user', parts: [{ text: userMessage }] }
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: newHistory,
        config: {
          systemInstruction: systemPrompt
        }
      });

      const responseText = response.text || "请再说详细一点？";

      // Update conversation history
      setConversationHistory([
        ...newHistory,
        { role: 'model', parts: [{ text: responseText }] }
      ]);

      // Check if there's extracted JSON
      const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        try {
          const extracted = JSON.parse(jsonMatch[1]) as ExtractedInfo & { complete?: boolean };
          setExtractedInfo(prev => ({ ...prev, ...extracted }));

          if (extracted.complete) {
            // Remove JSON from displayed message
            const cleanedResponse = responseText.replace(/【信息提取】[\s\S]*```json[\s\S]*```/, '').trim();
            setMessages(prev => [...prev, {
              id: generateId('msg'),
              role: 'assistant',
              content: cleanedResponse || '好，信息收集完毕！我帮你整理了项目概况，确认一下？'
            }]);
            setShowSummary(true);
          } else {
            const cleanedResponse = responseText.replace(/```json[\s\S]*```/, '').trim();
            setMessages(prev => [...prev, {
              id: generateId('msg'),
              role: 'assistant',
              content: cleanedResponse
            }]);
          }
        } catch (e) {
          // JSON parse failed, show original response
          setMessages(prev => [...prev, {
            id: generateId('msg'),
            role: 'assistant',
            content: responseText.replace(/```json[\s\S]*```/, '').trim()
          }]);
        }
      } else {
        setMessages(prev => [...prev, {
          id: generateId('msg'),
          role: 'assistant',
          content: responseText
        }]);
      }

    } catch (e) {
      console.error('AI error:', e);
      setMessages(prev => [...prev, {
        id: generateId('msg'),
        role: 'assistant',
        content: '连接出了点问题，请重试。'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmCreate = () => {
    if (!extractedInfo.name || !extractedInfo.clientName) {
      alert('项目名称和客户名称是必填的');
      return;
    }

    const projectData: Omit<Project, 'id' | 'updatedAt'> = {
      name: extractedInfo.name,
      clientName: extractedInfo.clientName,
      clientType: extractedInfo.clientType || '终端客户',
      stage: extractedInfo.stage || '初次接触',
      color: selectedColor,
      description: extractedInfo.description,
      budget: extractedInfo.budget,
      decisionMaker: extractedInfo.decisionMaker,
      competitors: extractedInfo.competitors,
      nextStep: extractedInfo.nextStep,
    };

    onSave(projectData, extractedInfo.suggestedOKR);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-primary" />
          <h2 className="text-lg font-bold">AI 创建项目</h2>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
          <X size={24} />
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2 flex-shrink-0 text-xs font-bold text-indigo-600">
                AI
              </div>
            )}
            <div className={`max-w-[80%] p-3 rounded-2xl text-sm whitespace-pre-line ${
              msg.role === 'user'
                ? 'bg-primary text-white rounded-br-none'
                : 'bg-gray-100 text-gray-800 rounded-bl-none'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm ml-10">
            <Loader2 className="animate-spin" size={16} />
            思考中...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Summary Card (when complete) */}
      {showSummary && extractedInfo.name && (
        <div className="border-t border-gray-100 bg-gray-50 p-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-4">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Check size={18} className="text-green-500" /> 项目信息确认
            </h3>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: selectedColor }}></div>
                <span className="font-medium">{extractedInfo.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-gray-600">
                <div>客户：{extractedInfo.clientName}</div>
                <div>类型：{extractedInfo.clientType || '终端客户'}</div>
                <div>阶段：{extractedInfo.stage || '初次接触'}</div>
                {extractedInfo.budget && <div>预算：{extractedInfo.budget}</div>}
              </div>
              {extractedInfo.description && (
                <p className="text-gray-600 text-xs mt-2 bg-gray-50 p-2 rounded">
                  {extractedInfo.description}
                </p>
              )}
              {extractedInfo.suggestedOKR && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-primary font-medium mb-1">推荐OKR</p>
                  <p className="text-gray-800 font-medium text-xs">{extractedInfo.suggestedOKR.objective}</p>
                  <div className="mt-1 space-y-1">
                    {extractedInfo.suggestedOKR.keyResults.map((kr, i) => (
                      <p key={i} className="text-xs text-gray-500">• {kr}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Color Selector */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">选择颜色</p>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setSelectedColor(c)}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      selectedColor === c ? 'ring-2 ring-offset-1 ring-primary scale-110' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleConfirmCreate}
            className="w-full bg-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg"
          >
            创建项目 <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Input Area (hide when showing summary) */}
      {!showSummary && (
        <div className="p-3 bg-white border-t border-gray-100 flex gap-2">
          <input
            ref={inputRef}
            className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="说说项目情况..."
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() || isLoading}
            className="p-2.5 bg-primary text-white rounded-full disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      )}

      {/* Continue editing button when summary is shown */}
      {showSummary && (
        <button
          onClick={() => setShowSummary(false)}
          className="mx-4 mb-4 text-sm text-gray-500 hover:text-gray-700"
        >
          继续补充信息...
        </button>
      )}
    </div>
  );
};

export default NewProjectModal;
