import { apiClient } from './api';

export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatbotAskRequest = {
  message: string;
  subject?: string;
  topic?: string;
  history?: ChatTurn[];
};

export type ChatbotAskResponse = {
  reply: string;
  used_model: string;
  context_used?: string | null;
};

export async function askStudentChatbot(payload: ChatbotAskRequest): Promise<ChatbotAskResponse> {
  return apiClient.post('/chatbot/ask', payload, true);
}
