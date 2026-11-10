import express from 'express';
import { chatWithBot, clearChatHistory, assistantTurn } from '../controllers/chatbotController.js';

const chatbotRouter = express.Router();

// Unified Multi-Turn Clinical & Platform Assistant (Symptom Triage + DDI + Doctor Lookup + RAG)
chatbotRouter.post("/assistant", assistantTurn);

// Chat with the RAG bot (no auth required — accessible to all visitors)
chatbotRouter.post("/chat", chatWithBot);

// Clear chat history (optional)
chatbotRouter.post("/clear", clearChatHistory);

export default chatbotRouter;
