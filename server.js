// Gemini-Make Bridge Server (clean version)
// Serves static files from public/ and provides optional Make.com + Gemini proxy endpoints

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const CONFIG = {
  MAKE_API_TOKEN: process.env.MAKE_API_TOKEN || '',
  MAKE_BASE_URL: process.env.MAKE_BASE_URL || 'https://eu2.make.com/api/v2',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  GEMINI_MODEL: 'gemini-1.5-pro-latest'
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helpers
async function callMakeAPI(endpoint, method = 'GET', data = null) {
  const url = `${CONFIG.MAKE_BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      Authorization: `Token ${CONFIG.MAKE_API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  };
  if (data) options.body = JSON.stringify(data);
  const response = await fetch(url, options);
  const payload = response.ok ? await response.json() : await response.text();
  return { ok: response.ok, status: response.status, data: payload };
}

function generateFallbackResponse(userMessage) {
  const lower = (userMessage || '').toLowerCase();
  if (lower.includes('pdf') && (lower.includes('generate') || lower.includes('create'))) {
    return "I'll create a PDF generation scenario for you right away! This will accept structured data and generate professional PDFs with custom styling. {\"action\": \"CREATE_PDF_SCENARIO\", \"params\": {}}";
  }
  if (lower.includes('email') && (lower.includes('send') || lower.includes('create'))) {
    return "I'll build an email sending scenario that can send emails through Gmail or other email services. {\"action\": \"CREATE_EMAIL_SCENARIO\", \"params\": {}}";
  }
  if (lower.includes('list') && lower.includes('scenario')) {
    return "Let me fetch all your current Make.com scenarios for you. {\"action\": \"LIST_SCENARIOS\", \"params\": {}}";
  }
  if (lower.includes('sheets') || lower.includes('spreadsheet')) {
    return "I'll create a Google Sheets integration scenario for you. {\"action\": \"CREATE_SHEETS_SCENARIO\", \"params\": {}}";
  }
  return `I understand you want to: "${userMessage}". I can help you build Make.com scenarios! Just tell me specifically what automation you need and I'll create it for you.`;
}

async function callGeminiAPI(messages, systemPrompt = '') {
  if (!CONFIG.GOOGLE_API_KEY) {
    return generateFallbackResponse(messages[messages.length - 1]?.content || '');
  }
  try {
    const conversationHistory = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    if (systemPrompt) {
      conversationHistory.unshift({ role: 'model', parts: [{ text: "I understand. I'll help you build Make.com scenarios using natural language." }] });
      conversationHistory.unshift({ role: 'user', parts: [{ text: systemPrompt }] });
    }

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: conversationHistory,
        generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 1024 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
        ]
      })
    });

    if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || generateFallbackResponse(messages[messages.length - 1]?.content || '');
  } catch (err) {
    console.error('Gemini API call failed:', err);
    return generateFallbackResponse(messages[messages.length - 1]?.content || '');
  }
}

const GEMINI_SYSTEM_PROMPT = `You are a Make.com automation expert powered by Google’s Gemini AI. You help users build scenarios by understanding their natural language requests and translating them into specific Make.com API calls.

Available actions:
- CREATE_PDF_SCENARIO: Creates a PDF generation scenario
- CREATE_EMAIL_SCENARIO: Creates an email sending scenario
- CREATE_SHEETS_SCENARIO: Creates a Google Sheets integration
- LIST_SCENARIOS: Lists all user scenarios
- ACTIVATE_SCENARIO: Activates a scenario by ID
- GET_SCENARIO_INFO: Gets details about a specific scenario

When a user describes what they want to build, respond with:
1. A friendly explanation of what you’ll create
1. A JSON action block like: {"action": "CREATE_PDF_SCENARIO", "params": {...}}

Keep responses helpful and technical but friendly. You are powered by Gemini Pro, Google’s most advanced AI model.`;

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/test-make', async (req, res) => {
  try {
    if (!CONFIG.MAKE_API_TOKEN) {
      return res.json({ ok: false, status: 401, data: 'MAKE_API_TOKEN not configured' });
    }
    const result = await callMakeAPI('/organizations');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};
    const messages = [...history, { role: 'user', content: message }];
    const geminiResponse = await callGeminiAPI(messages, GEMINI_SYSTEM_PROMPT);

    let actionResult = null;
    const actionMatch = geminiResponse && geminiResponse.match(/\{"action":\s*"([^"]+)"[^}]*\}/);
    if (actionMatch) {
      try {
        const action = JSON.parse(actionMatch[0]);
        actionResult = await executeAction(action);
      } catch (error) {
        console.error('Action execution error:', error);
      }
    }

    res.json({
      response: geminiResponse,
      action: actionResult,
      history: [...messages, { role: 'assistant', content: geminiResponse }]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function executeAction(action) {
  switch (action.action) {
    case 'CREATE_PDF_SCENARIO':
      return await createPDFScenario();
    case 'LIST_SCENARIOS':
      return await listScenarios();
    case 'ACTIVATE_SCENARIO':
      return await activateScenario(action.params.scenarioId);
    default:
      return { error: 'Unknown action' };
  }
}

async function createPDFScenario() {
  const scenarioBlueprint = {
    name: 'PDF Generator by Gemini',
    blueprint: JSON.stringify({
      flow: [
        { id: 1, module: 'webhooks:webhook', version: 1, parameters: { hook: { name: 'PDF Generator Webhook' } }, mapper: {}, metadata: { designer: { x: 0, y: 0 } } },
        { id: 2, module: 'util:SetVariable2', version: 1, parameters: {}, mapper: { name: 'htmlContent', value: "<!DOCTYPE html><html><head><title>{{1.title}}</title><style>body{font-family:Arial,sans-serif;margin:40px;line-height:1.6;color:#333}h1{color:#2c3e50;border-bottom:3px solid #3498db;padding-bottom:10px;margin-bottom:20px}h2{color:#34495e;margin-top:25px;margin-bottom:15px}.content{margin:15px 0;font-size:14px}.section{margin:20px 0;padding:15px;border-left:4px solid #3498db;background-color:#f8f9fa}</style></head><body><h1>{{1.title}}</h1><div class='content'>{{1.content}}</div></body></html>" }, metadata: { designer: { x: 300, y: 0 } } },
        { id: 3, module: 'webhooks:response', version: 1, parameters: {}, mapper: { status: '200', body: JSON.stringify({ success: true, message: 'PDF content generated', html: '{{2.htmlContent}}' }) }, metadata: { designer: { x: 600, y: 0 } } }
      ]
    }),
    scheduling: JSON.stringify({ type: 'indefinitely' })
  };

  const result = await callMakeAPI('/scenarios', 'POST', scenarioBlueprint);
  if (result.ok && result.data.scenario) {
    const scenarioId = result.data.scenario.id;
    await activateScenario(scenarioId);
    return { success: true, scenarioId, message: 'PDF generator scenario created and activated!', webhookUrl: result.data.scenario.webhookUrl || 'Available after activation' };
  }
  return { success: false, error: result.data };
}

async function listScenarios() {
  const result = await callMakeAPI('/scenarios');
  if (result.ok) {
    return { success: true, scenarios: result.data.scenarios || [], count: result.data.scenarios?.length || 0 };
  }
  return { success: false, error: result.data };
}

async function activateScenario(scenarioId) {
  const result = await callMakeAPI(`/scenarios/${scenarioId}`, 'PATCH', { isActive: true, scheduling: JSON.stringify({ type: 'indefinitely' }) });
  return { success: result.ok, scenarioId, message: result.ok ? 'Scenario activated successfully!' : 'Failed to activate scenario', error: result.ok ? null : result.data };
}

app.all('/api/make/*', async (req, res) => {
  try {
    const endpoint = req.path.replace('/api/make', '');
    const result = await callMakeAPI(endpoint, req.method, req.body);
    res.status(result.status).json(result.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT}`);
  console.log(`🔧 Make API Token: ${CONFIG.MAKE_API_TOKEN ? CONFIG.MAKE_API_TOKEN.substring(0, 8) + '...' : '(not set)'}`);
  console.log(`🤖 Gemini API: ${CONFIG.GOOGLE_API_KEY ? 'Connected (Gemini Pro)' : 'Fallback mode'}`);
});

module.exports = app;
