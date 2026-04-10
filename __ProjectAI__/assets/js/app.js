// ─── STATE ───────────────────────────────────────────────────────────────────
let chats = JSON.parse(localStorage.getItem('aura_chats') || '[]');
let currentChatId = null;
let activeAgent = null;
let attachedFiles = [];
let isLoading = false;
let abortController = null;
let stopRequested = false;
let isPuterSignedIn = false;
let puterUserName = '';
let chatListCollapsed = false;
let sidebarCollapsed = false;
let voiceRecognition = null;
let isListening = false;
let attachMenuOpen = false;
let scrollFrameId = null;
let restoreScrollTimers = [];
const CURRENT_CHAT_STORAGE_KEY = 'aura_current_chat_id';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'maeai.sidebar.collapsed';
const LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEY = 'sidebar_collapsed';
const VAULT_PANEL_STORAGE_KEY = 'maeai.vault.open';
const GOOGLE_LOCAL_ONLY_STORAGE_KEY = 'maeai.google.localOnly';
const FIREBASE_CONFIG_STORAGE_KEY = 'maeai.firebase.config';
const QWEN_CONFIG_STORAGE_KEY = 'maeai.qwen.config';
const GROQ_CONFIG_STORAGE_KEY = 'maeai.groq.config';
const HF_CONFIG_STORAGE_KEY = 'maeai.hf.config';
const BACKEND_CONFIG_STORAGE_KEY = 'maeai.backend.config';
const AI_PROVIDER_STORAGE_KEY = 'maeai.ai.provider';

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let googleUser = null;
let firebaseSyncReady = false;
let localOnlyMode = localStorage.getItem(GOOGLE_LOCAL_ONLY_STORAGE_KEY) === 'true';
let cloudSyncTimer = null;

function getModel(){ return document.getElementById('model-select').value }

function isPuterEnabled(){
  return window.ENABLE_PUTER === true;
}

function isQwenModel(model){
  const value = String(model || '').toLowerCase();
  return value === 'qwen' || value.startsWith('qwen:');
}

function isQrogModel(model){
  const value = String(model || '').toLowerCase();
  return value === 'qrog' || value.startsWith('qrog:');
}

function isHfModel(model){
  const value = String(model || '').toLowerCase();
  return value === 'hf' || value.startsWith('hf:');
}

function isBackendModel(model){
  const value = String(model || '').toLowerCase();
  return value === 'backend' || value.startsWith('backend:') || value.startsWith('duck:') || value.startsWith('g4f:') || value.startsWith('supermax:') || value === 'supermax' || value.startsWith('openspace:') || value === 'openspace';
}

function isAgentScopeModel(model){
  const value = String(model || '').toLowerCase();
  return value === 'agentscope' || value.startsWith('agentscope:');
}

function getPrefixedModelName(model, prefix){
  const value = String(model || '').trim();
  const lower = value.toLowerCase();
  const normalizedPrefix = String(prefix || '').toLowerCase() + ':';

  if(lower === String(prefix || '').toLowerCase()) return '';
  if(lower.startsWith(normalizedPrefix)) return value.slice(normalizedPrefix.length);
  return value;
}

function normalizeGroqModelName(model){
  const value = String(model || '').trim();
  const lower = value.toLowerCase();

  const aliasMap = {
    'llama-4-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
    'llama-4-maverick': 'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llama 4 maverick': 'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llma-4-maverick': 'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llma 4 maverick': 'meta-llama/llama-4-maverick-17b-128e-instruct',
    'maverick': 'meta-llama/llama-4-maverick-17b-128e-instruct'
  };

  return aliasMap[lower] || value;
}

function getGroqKeyHelpText(apiKey){
  const key = String(apiKey || '').trim();
  if(!key) return 'Thiếu Groq API key. Hãy cấu hình trong Settings > Groq.';
  if(/^your_/i.test(key)) return 'Bạn đang dùng Groq key mẫu (YOUR_GROQ_API_KEY). Hãy thay bằng key thật dạng gsk_...';
  if(!/^gsk_[A-Za-z0-9_-]+$/i.test(key)) return 'Groq API key không đúng định dạng. Key hợp lệ thường bắt đầu bằng gsk_';
  return '';
}

function getAIProvider(){
  return localStorage.getItem(AI_PROVIDER_STORAGE_KEY) || 'qwen';
}

function getFirebaseConfig(){
  const fallback = window.FIREBASE_CONFIG || {};
  let stored = {};

  try {
    const parsed = JSON.parse(localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY) || '{}');
    if(parsed && typeof parsed === 'object'){
      stored = parsed;
    }
  } catch {}

  const config = {
    apiKey: stored.apiKey || fallback.apiKey || '',
    authDomain: stored.authDomain || fallback.authDomain || '',
    projectId: stored.projectId || fallback.projectId || '',
    appId: stored.appId || fallback.appId || '',
    storageBucket: stored.storageBucket || fallback.storageBucket || '',
    messagingSenderId: stored.messagingSenderId || fallback.messagingSenderId || '',
    measurementId: stored.measurementId || fallback.measurementId || ''
  };

  return config;
}

function getQwenConfig(){
  const fallback = window.QWEN_CONFIG || {};
  let stored = {};

  try {
    const parsed = JSON.parse(localStorage.getItem(QWEN_CONFIG_STORAGE_KEY) || '{}');
    if(parsed && typeof parsed === 'object'){
      stored = parsed;
    }
  } catch {}

  return {
    apiKey: stored.apiKey || fallback.apiKey || '',
    baseUrl: String(stored.baseUrl || fallback.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, ''),
    defaultModel: stored.defaultModel || fallback.defaultModel || 'qwen3.5-plus'
  };
}

function getGroqConfig(){
  const fallback = window.GROQ_CONFIG || {};
  let stored = {};

  try {
    const parsed = JSON.parse(localStorage.getItem(GROQ_CONFIG_STORAGE_KEY) || '{}');
    if(parsed && typeof parsed === 'object'){
      stored = parsed;
    }
  } catch {}

  return {
    apiKey: stored.apiKey || fallback.apiKey || '',
    baseUrl: String(stored.baseUrl || fallback.baseUrl || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    defaultModel: normalizeGroqModelName(stored.defaultModel || fallback.defaultModel || 'llama-3.3-70b-versatile')
  };
}

function getHfConfig(){
  const fallback = window.HF_CONFIG || {};
  let stored = {};

  try {
    const parsed = JSON.parse(localStorage.getItem(HF_CONFIG_STORAGE_KEY) || '{}');
    if(parsed && typeof parsed === 'object'){
      stored = parsed;
    }
  } catch {}

  return {
    apiKey: stored.apiKey || fallback.apiKey || '',
    baseUrl: String(stored.baseUrl || fallback.baseUrl || 'https://router.huggingface.co/v1').replace(/\/+$/, ''),
    defaultModel: stored.defaultModel || fallback.defaultModel || 'Qwen/Qwen2.5-7B-Instruct'
  };
}

function getBackendConfig(){
  const fallback = window.BACKEND_CONFIG || {};
  let stored = {};

  try {
    const parsed = JSON.parse(localStorage.getItem(BACKEND_CONFIG_STORAGE_KEY) || '{}');
    if(parsed && typeof parsed === 'object'){
      stored = parsed;
    }
  } catch {}

  return {
    apiKey: stored.apiKey || fallback.apiKey || '',
    baseUrl: String(stored.baseUrl || fallback.baseUrl || 'http://127.0.0.1:8080').replace(/\/+$/, ''),
    defaultModel: stored.defaultModel || fallback.defaultModel || 'backend:MaeAI Tuxue V1'
  };
}

function getAgentScopeConfig(){
  const fallback = window.AGENTSCOPE_CONFIG || {};
  return {
    baseUrl: String(fallback.baseUrl || 'http://127.0.0.1:8000').replace(/\/+$/, ''),
    defaultModel: fallback.defaultModel || 'agentscope:coder'
  };
}

function getHfEndpointCandidates(baseUrl){
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  if(normalized){
    return [normalized];
  }
  return ['https://router.huggingface.co/v1'];
}

function getHfTokenHelpText(apiKey){
  const key = String(apiKey || '').trim();
  if(!key) return 'Thiếu token MaeAI. Hãy dán token dạng hf_... trong Settings.';
  if(/^your_/i.test(key)) return 'Bạn đang dùng token mẫu (YOUR_HF_TOKEN). Hãy thay bằng token thật dạng hf_...';
  if(!/^hf_[A-Za-z0-9]+$/i.test(key)) return 'HF token không đúng định dạng. Token hợp lệ thường bắt đầu bằng hf_';
  return '';
}

function normalizeHfModelName(model){
  const value = String(model || '').trim();
  const lower = value.toLowerCase();

  const aliasMap = {
    'mistra': 'mistralai/Mistral-Nemo-Instruct-2407',
    'mistral': 'mistralai/Mistral-Nemo-Instruct-2407',
    'mistralai/mistral-7b-instruct-v0.3': 'mistralai/Mistral-Nemo-Instruct-2407'
  };

  return aliasMap[lower] || value;
}

function getHfModelCandidates(selectedModel, defaultModel){
  const primary = normalizeHfModelName(getPrefixedModelName(selectedModel, 'hf') || defaultModel);
  const fallback = [
    'mistralai/Mistral-Nemo-Instruct-2407',
    'meta-llama/Meta-Llama-3-8B-Instruct',
    'Qwen/Qwen2.5-7B-Instruct'
  ];

  return [...new Set([primary, ...fallback])];
}

function isQwenCodingPlanKey(apiKey){
  return /^sk-sp-[A-Za-z0-9_-]+$/i.test(String(apiKey || '').trim());
}

function getQwenKeyHelpText(apiKey){
  const key = String(apiKey || '').trim();
  if(!key) return 'Thiếu Qwen API key.';
  if(/^your_/i.test(key)) return 'Bạn đang dùng Qwen key mẫu. Hãy thay bằng key thật dạng sk-cb-... hoặc sk-sp-...';
  if(!/^sk-[A-Za-z0-9_-]+$/i.test(key)) return 'Qwen API key không đúng định dạng. Key hợp lệ thường bắt đầu bằng sk-';
  return '';
}

function getQwenEndpointCandidates(baseUrl, apiKey){
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  const key = String(apiKey || '').trim().toLowerCase();
  const cn = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const intl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

  const candidates = [normalized || intl];

  if(key.startsWith('sk-cb-')){
    candidates.unshift(cn);
  } else if(key.startsWith('sk-sp-')){
    candidates.unshift(intl);
  }

  if(!candidates.includes(cn)) candidates.push(cn);
  if(!candidates.includes(intl)) candidates.push(intl);

  return [...new Set(candidates)];
}

function normalizeMessagesForQwen(messages){
  return messages.map(message => {
    if(typeof message.content === 'string'){
      return { role: message.role, content: message.content };
    }

    if(Array.isArray(message.content)){
      const merged = message.content
        .map(part => {
          if(typeof part === 'string') return part;
          if(typeof part?.text === 'string') return part.text;
          if(part?.type === 'file') return '[File đính kèm không được gửi sang Qwen API trong chế độ frontend]';
          return '';
        })
        .filter(Boolean)
        .join('\n');

      return { role: message.role, content: merged };
    }

    return { role: message.role, content: String(message.content || '') };
  });
}

async function fetchWithTimeout(url, options, timeoutMs = 90000){
  const controller = new AbortController();
  const externalSignal = options?.signal;
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if(externalSignal){
    if(externalSignal.aborted){
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const safeOptions = { ...options };
    delete safeOptions.signal;
    return await fetch(url, { ...safeOptions, signal: controller.signal });
  } catch (err) {
    if(err?.name === 'AbortError'){
      if(stopRequested) throw new Error('__STOPPED__');
      if(!timedOut && externalSignal?.aborted) throw new Error('__STOPPED__');
      throw new Error('Yêu cầu tới AI bị timeout. Vui lòng thử lại.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if(externalSignal){
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

async function readChunkWithTimeout(reader, timeoutMs = 45000){
  let timeoutId;
  const timeoutPromise = new Promise(resolve => {
    timeoutId = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  try {
    const result = await Promise.race([reader.read(), timeoutPromise]);
    if(result?.timedOut) return { timedOut: true, done: false, value: null };
    return { timedOut: false, done: !!result.done, value: result.value };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function streamQwenChat(messages, model, onDelta){
  const cfg = getQwenConfig();
  if(!cfg.apiKey){
    throw new Error('Thiếu Qwen API key. Hãy cấu hình window.QWEN_CONFIG.apiKey');
  }

  const keyHelp = getQwenKeyHelpText(cfg.apiKey);
  if(keyHelp){
    throw new Error(keyHelp);
  }

  const endpointCandidates = getQwenEndpointCandidates(cfg.baseUrl, cfg.apiKey);
  const requestBody = JSON.stringify({
    model: getPrefixedModelName(model, 'qwen') || cfg.defaultModel,
    messages,
    stream: true,
    max_tokens: 4096
  });

  let response = null;
  let lastStatus = 0;
  let lastErrText = '';
  let lastEndpoint = '';
  const attemptSummaries = [];

  for(const endpoint of endpointCandidates){
    lastEndpoint = endpoint;
    response = await fetchWithTimeout(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`
      },
      body: requestBody,
      signal: abortController?.signal
    }, 120000);

    if(response.ok){
      break;
    }

    lastStatus = response.status;
    lastErrText = await response.text();
    attemptSummaries.push(`${endpoint} -> ${response.status}`);

    // 401 means key invalid/expired, don't continue to avoid noisy extra failures.
    if(response.status === 401){
      break;
    }

    // 403 can happen due region/permission restrictions; try next endpoint candidate.
    if(response.status === 403){
      continue;
    }

    throw new Error(`Qwen API lỗi ${response.status}: ${lastErrText.slice(0, 600)}`);
  }

  if(!response || !response.ok){
    const compactErr = String(lastErrText || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const attempts = attemptSummaries.length ? ` | attempts: ${attemptSummaries.join(' ; ')}` : '';

    if(lastStatus === 401){
      const backendCfg = getBackendConfig();
      if(backendCfg?.baseUrl){
        showToast('Qwen bị từ chối (401), đang tự chuyển sang Backend fallback...');
        await streamBackendChat(
          normalizeMessagesForOpenAI(messages),
          backendCfg.defaultModel || 'backend:MaeAI Tuxue V1',
          onDelta
        );
        return;
      }

      throw new Error(`Qwen API key không hợp lệ hoặc đã hết hạn (401) tại ${lastEndpoint || 'DashScope'}. Hãy cập nhật key mới trong Settings > Qwen.${attempts}`);
    }

    if(lastStatus === 403){
      throw new Error(`Qwen key chưa có quyền truy cập model/region (403). Hãy kiểm tra quyền model và endpoint DashScope CN/INTL trong Settings > Qwen.${attempts}`);
    }

    const tip = 'Kiểm tra lại Qwen API key, model và endpoint (dashscope.aliyuncs.com hoặc dashscope-intl.aliyuncs.com).';
    throw new Error(`Qwen API lỗi ${lastStatus || 400}: ${compactErr || 'Unknown error'} | ${tip}${attempts}`);
  }

  if(!response.body){
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if(text) onDelta(text);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let hasAnyDelta = false;

  while(true){
    if(stopRequested){
      try { await reader.cancel(); } catch {}
      break;
    }
    const next = await readChunkWithTimeout(reader, 45000);
    if(next.timedOut){
      if(hasAnyDelta) break;
      throw new Error('Qwen phản hồi quá lâu. Vui lòng thử lại.');
    }
    const { done, value } = next;
    if(done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for(const rawLine of lines){
      const line = rawLine.trim();
      if(!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if(!payload || payload === '[DONE]') continue;

      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta = chunk?.choices?.map(choice => {
        if(typeof choice?.delta?.content === 'string') return choice.delta.content;
        if(Array.isArray(choice?.delta?.content)){
          return choice.delta.content.map(part => part?.text || '').join('');
        }
        return '';
      }).join('') || '';

      if(delta){
        hasAnyDelta = true;
        onDelta(delta);
      }
    }
  }
}

async function streamGroqChat(messages, model, onDelta){
  const cfg = getGroqConfig();
  const keyHelp = getGroqKeyHelpText(cfg.apiKey);
  if(keyHelp){
    throw new Error(keyHelp);
  }

  const resolvedModel = normalizeGroqModelName(getPrefixedModelName(model, 'qrog') || cfg.defaultModel);

  const response = await fetchWithTimeout(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages,
      stream: true,
      max_tokens: 4096
    }),
    signal: abortController?.signal
  }, 120000);

  if(!response.ok){
    const errText = await response.text();
    if(response.status === 401){
      throw new Error('Groq API lỗi 401: Invalid API Key. Vào Settings và dán Groq key thật (gsk_...).');
    }
    throw new Error(`Groq API lỗi ${response.status}: ${errText.slice(0, 600)}`);
  }

  if(!response.body){
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if(text) onDelta(text);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let hasAnyDelta = false;

  while(true){
    if(stopRequested){
      try { await reader.cancel(); } catch {}
      break;
    }
    const next = await readChunkWithTimeout(reader, 45000);
    if(next.timedOut){
      if(hasAnyDelta) break;
      throw new Error('Groq phản hồi quá lâu. Vui lòng thử lại.');
    }
    const { done, value } = next;
    if(done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for(const rawLine of lines){
      const line = rawLine.trim();
      if(!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if(!payload || payload === '[DONE]') continue;

      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta = chunk?.choices?.map(choice => {
        if(typeof choice?.delta?.content === 'string') return choice.delta.content;
        if(Array.isArray(choice?.delta?.content)){
          return choice.delta.content.map(part => part?.text || '').join('');
        }
        return '';
      }).join('') || '';

      if(delta){
        hasAnyDelta = true;
        onDelta(delta);
      }
    }
  }
}

async function streamHfChat(messages, model, onDelta){
  const cfg = getHfConfig();
  const tokenHelp = getHfTokenHelpText(cfg.apiKey);
  if(tokenHelp){
    throw new Error(tokenHelp);
  }

  const endpointCandidates = getHfEndpointCandidates(cfg.baseUrl);
  const modelCandidates = getHfModelCandidates(model, cfg.defaultModel);

  let response = null;
  let lastStatus = 0;
  let lastErrText = '';
  let hadCorsLikeError = false;

  for(const endpoint of endpointCandidates){
    for(const modelId of modelCandidates){
      const streamPayload = JSON.stringify({
        model: modelId,
        messages,
        stream: true,
        max_tokens: 4096
      });

      try {
        response = await fetchWithTimeout(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.apiKey}`
          },
          body: streamPayload,
          signal: abortController?.signal
        }, 120000);
      } catch (err) {
        hadCorsLikeError = true;
        continue;
      }

      if(response.ok){
        break;
      }

      lastStatus = response.status;
      lastErrText = await response.text();

      // Some HF routes reject streaming payload. Retry once in non-stream mode.
      if(lastStatus === 400){
        const nonStreamPayload = JSON.stringify({
          model: modelId,
          messages,
          max_tokens: 4096
        });

        try {
          response = await fetchWithTimeout(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${cfg.apiKey}`
            },
            body: nonStreamPayload,
            signal: abortController?.signal
          }, 120000);
        } catch (err) {
          hadCorsLikeError = true;
          continue;
        }

        if(response.ok){
          break;
        }

        lastStatus = response.status;
        lastErrText = await response.text();
      }
    }

    if(response?.ok){
      break;
    }
  }

  if(!response || !response.ok){
    if(hadCorsLikeError && !lastStatus){
      throw new Error('MaeAI bị chặn CORS trên trình duyệt. Hãy dùng HF Router URL https://router.huggingface.co/v1 hoặc chạy qua backend proxy (/api/hf).');
    }
    if(lastStatus === 401){
      throw new Error('HF trả về 401 Unauthorized. Kiểm tra token dạng hf_..., quyền Read, và model có quyền truy cập trên tài khoản của bạn.');
    }
    throw new Error(`MaeAI API lỗi ${lastStatus || 0}: ${String(lastErrText || 'Không thể kết nối endpoint').slice(0, 600)}`);
  }

  if(!response.body){
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if(text) onDelta(text);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let hasAnyDelta = false;

  while(true){
    if(stopRequested){
      try { await reader.cancel(); } catch {}
      break;
    }
    const next = await readChunkWithTimeout(reader, 45000);
    if(next.timedOut){
      if(hasAnyDelta) break;
      throw new Error('MaeAI phản hồi quá lâu. Vui lòng thử lại.');
    }
    const { done, value } = next;
    if(done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for(const rawLine of lines){
      const line = rawLine.trim();
      if(!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if(!payload || payload === '[DONE]') continue;

      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta = chunk?.choices?.map(choice => {
        if(typeof choice?.delta?.content === 'string') return choice.delta.content;
        if(Array.isArray(choice?.delta?.content)){
          return choice.delta.content.map(part => part?.text || '').join('');
        }
        return '';
      }).join('') || '';

      if(delta){
        hasAnyDelta = true;
        onDelta(delta);
      }
    }
  }
}

async function streamBackendChat(messages, model, onDelta){
  const cfg = getBackendConfig();
  if(!cfg.apiKey){
    throw new Error('Thiếu Backend API key. Hãy cấu hình backend settings.');
  }

  const requestBody = JSON.stringify({
    model: getPrefixedModelName(model, 'backend') || model,
    messages,
    stream: false,
    max_tokens: 4096
  });

  const authCandidates = [...new Set([cfg.apiKey, 'silas123'].map(v => String(v || '').trim()).filter(Boolean))];
  let lastErr = null;

  for(const apiKey of authCandidates){
    const response = await fetchWithTimeout(`${cfg.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'ngrok-skip-browser-warning': 'true'
      },
      body: requestBody,
      signal: abortController?.signal
    }, 120000);

    if(response.ok){
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || '';
      if(text) onDelta(text);
      return;
    }

    const errText = await response.text();
    lastErr = new Error(`Backend API lỗi ${response.status}: ${errText.slice(0, 600)}`);
    if(response.status !== 401) break;
  }

  throw lastErr || new Error('Backend API lỗi không xác định');
}

async function streamAgentScopeChat(messages, model, onDelta){
  const cfg = getAgentScopeConfig();
  const targetName = getPrefixedModelName(model, 'agentscope') || 'coder';
  const lastUserMsg = messages.slice().reverse().find(m => m.role === 'user')?.content || '';
  
  const requestBody = JSON.stringify({
    message: String(lastUserMsg),
    target: targetName
  });

  const response = await fetchWithTimeout(`${cfg.baseUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody,
    signal: abortController?.signal
  }, 120000);

  if(response.ok){
    const data = await response.json();
    const text = data?.response || '';
    if(text) onDelta(text);
    return;
  }

  const errText = await response.text();
  throw new Error(`AgentScope API lỗi ${response.status}: ${errText.slice(0, 600)}`);
}

function normalizeMessagesForOpenAI(messages){
  return messages.map(message => {
    if(typeof message.content === 'string'){
      return { role: message.role, content: message.content };
    }

    if(Array.isArray(message.content)){
      const merged = message.content
        .map(part => {
          if(typeof part === 'string') return part;
          if(typeof part?.text === 'string') return part.text;
          if(part?.type === 'file') return '[Attached file path omitted in direct API mode]';
          return '';
        })
        .filter(Boolean)
        .join('\n');

      return { role: message.role, content: merged };
    }

    return { role: message.role, content: String(message.content || '') };
  });
}

function isMobileViewport(){
  return window.matchMedia('(max-width: 700px)').matches;
}

function getStoredSidebarCollapsed(){
  const value = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
  if(value === 'true' || value === 'false') return value === 'true';

  const legacy = localStorage.getItem(LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEY);
  if(legacy === 'true' || legacy === 'false'){
    const parsed = legacy === 'true';
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(parsed));
    return parsed;
  }

  return false;
}

function isSidebarCollapsed(){
  const sidebar = document.getElementById('sidebar');
  return sidebar ? sidebar.classList.contains('collapsed') : getStoredSidebarCollapsed();
}

function setSidebarCollapsedState(collapsed){
  const sidebar = document.getElementById('sidebar');
  sidebarCollapsed = collapsed;
  if(sidebar){
    if(isMobileViewport()){
      sidebar.classList.remove('collapsed');
    } else {
      sidebar.classList.toggle('collapsed', collapsed);
    }
  }
  localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
}

function syncSidebarByViewport(){
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;

  if(isMobileViewport()){
    // Mobile uses drawer behavior only.
    sidebar.classList.remove('collapsed');
    sidebar.classList.remove('open');
    return;
  }

  // Desktop uses collapsible behavior only.
  sidebar.classList.remove('open');
  setSidebarCollapsedState(getStoredSidebarCollapsed());
}

// ─── CHAT LIST TOGGLE ────────────────────────────────────────────────────────
function toggleChatListCollapse(){
  const chatList = document.getElementById('chat-list');
  const icon = document.getElementById('toggle-chat-list-icon');
  if(!chatList) return;
  chatListCollapsed = !chatListCollapsed;
  if(chatListCollapsed){
    chatList.classList.add('collapsed');
    if(icon) icon.style.transform = 'rotate(-90deg)';
  } else {
    chatList.classList.remove('collapsed');
    if(icon) icon.style.transform = 'rotate(0)';
  }
  localStorage.setItem('chat_list_collapsed', chatListCollapsed);
}

// ─── SIDEBAR TOGGLE ──────────────────────────────────────────────────────────
function toggleSidebarCollapse(){
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;

  if(isMobileViewport()){
    sidebar.classList.toggle('open');
    return;
  }

  const next = !sidebar.classList.contains('collapsed');
  setSidebarCollapsedState(next);
}

function setVaultPanelState(open){
  const panel = document.getElementById('vault-panel');
  const toggleBtn = document.getElementById('vault-toggle-btn');
  if(!panel || !toggleBtn) return;

  panel.classList.toggle('open', open);
  panel.setAttribute('aria-hidden', String(!open));
  toggleBtn.setAttribute('aria-expanded', String(open));
  toggleBtn.classList.toggle('active', open);
  localStorage.setItem(VAULT_PANEL_STORAGE_KEY, String(open));
}

function hasFirebaseConfig(){
  const config = getFirebaseConfig();
  return !!(config.apiKey && config.authDomain && config.projectId && config.appId);
}

function updateAuthGate(){
  const locked = !localOnlyMode && !googleUser;
  document.body.classList.toggle('auth-locked', locked);
  renderGoogleAuthUI();
}

function getGoogleDisplayName(user){
  return user?.displayName || user?.email || 'Tài khoản Google';
}

function renderGoogleAuthUI(){
  const loginBtnLabel = document.getElementById('auth-google-btn-label');
  const authNote = document.querySelector('.auth-note');
  const signedIn = !!googleUser;

  if(loginBtnLabel){
    loginBtnLabel.textContent = signedIn ? 'Đã đăng nhập Google' : 'Tiếp tục với Google';
  }

  if(authNote){
    authNote.textContent = hasFirebaseConfig()
      ? (signedIn ? 'Lịch sử sẽ được đồng bộ tự động lên Google.' : 'Đăng nhập Google để đồng bộ lịch sử chat trên nhiều thiết bị.')
      : 'Cần cấu hình Firebase để bật đăng nhập Google và đồng bộ lịch sử.';
  }

  updateSidebarAccount();
}

function updateSidebarAccount(){
  const avatar = document.querySelector('.sidebar-account-avatar');
  const name = document.querySelector('.sidebar-account-name');
  
  if(!avatar || !name) return;

  if(googleUser){
    // Get user's display name or email
    const displayName = googleUser.displayName || googleUser.email || 'Tài khoản Google';
    name.textContent = displayName;
    
    // Get initials for avatar
    let initials = 'G';
    if(googleUser.displayName){
      const names = googleUser.displayName.split(' ');
      initials = names.map(n => n[0]).join('').substring(0, 2).toUpperCase();
    } else if(googleUser.email){
      initials = googleUser.email[0].toUpperCase();
    }
    avatar.textContent = initials;
  } else {
    // When not logged in
    name.textContent = 'Tài khoản MaeAI';
    avatar.textContent = 'KT';
  }
}

function persistChatsLocally(){
  localStorage.setItem('aura_chats', JSON.stringify(chats));
}

function scheduleCloudSync(immediate = false){
  if(!firebaseSyncReady || !googleUser) return;
  if(cloudSyncTimer){
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
  }

  if(immediate){
    syncChatsToCloud();
    return;
  }

  cloudSyncTimer = setTimeout(() => {
    syncChatsToCloud();
  }, 900);
}

function saveChats(){
  const currentChat = chats.find(c => c.id === currentChatId);
  if(currentChat){
    currentChat.updated = Date.now();
  }
  persistChatsLocally();
  scheduleCloudSync();
}

function normalizeChat(chat){
  return {
    id: String(chat.id || `chat_${Date.now()}`),
    title: String(chat.title || 'Cuộc trò chuyện mới'),
    messages: Array.isArray(chat.messages) ? chat.messages : [],
    created: Number(chat.created || Date.now()),
    updated: Number(chat.updated || chat.created || Date.now())
  };
}

function mergeChatLists(localChats, cloudChats){
  const merged = new Map();

  [...localChats, ...cloudChats].forEach(chat => {
    if(!chat || !chat.id) return;
    const normalized = normalizeChat(chat);
    const existing = merged.get(normalized.id);
    if(!existing || normalized.updated >= existing.updated){
      merged.set(normalized.id, normalized);
    }
  });

  return Array.from(merged.values()).sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
}

async function loadChatsFromCloud(){
  if(!firebaseDb || !googleUser) return;

  try {
    const snapshot = await firebaseDb.collection('users').doc(googleUser.uid).collection('chats').get();
    const cloudChats = snapshot.docs.map(doc => normalizeChat(doc.data()));
    chats = mergeChatLists(chats, cloudChats);
    persistChatsLocally();
    renderChatList();

    const savedChatId = localStorage.getItem(CURRENT_CHAT_STORAGE_KEY);
    if(savedChatId && chats.some(c => c.id === savedChatId)){
      loadChat(savedChatId);
    } else if(chats.length > 0){
      loadChat(chats[0].id);
    } else {
      renderMessages([]);
    }

    updateAuthGate();
  } catch (err) {
    showToast('Không thể tải lịch sử từ Google');
  }
}

async function syncChatsToCloud(){
  if(!firebaseDb || !googleUser || !firebaseSyncReady) return;

  try {
    const collectionRef = firebaseDb.collection('users').doc(googleUser.uid).collection('chats');
    const tasks = [];

    chats.forEach(chat => {
      const payload = normalizeChat(chat);
      tasks.push(collectionRef.doc(payload.id).set(payload, { merge: true }));
    });

    const results = await Promise.allSettled(tasks);
    const rejected = results.filter(result => result.status === 'rejected');

    if(rejected.length > 0){
      throw rejected[0].reason || new Error('Không thể đồng bộ lịch sử lên Google');
    }
  } catch (err) {
    showToast('Không thể đồng bộ lịch sử lên Google');
  }
}

function unlockLocalMode(){
  localOnlyMode = true;
  localStorage.setItem(GOOGLE_LOCAL_ONLY_STORAGE_KEY, 'true');
  updateAuthGate();
  renderChatList();
  const savedChatId = localStorage.getItem(CURRENT_CHAT_STORAGE_KEY);
  if(savedChatId && chats.some(c => c.id === savedChatId)){
    loadChat(savedChatId);
  } else if(chats.length > 0){
    loadChat(chats[0].id);
  } else {
    renderMessages([]);
  }
}

async function initGoogleSync(){
  const firebaseConfig = getFirebaseConfig();

  if(typeof firebase === 'undefined' || !hasFirebaseConfig()){
    firebaseSyncReady = false;
    updateAuthGate();
    return;
  }

  try {
    if(!firebase.apps.length){
      firebaseApp = firebase.initializeApp(firebaseConfig);
    } else {
      firebaseApp = firebase.app();
    }

    firebaseAuth = firebase.auth();
    firebaseDb = firebase.firestore();
    firebaseSyncReady = true;

    firebaseAuth.onAuthStateChanged(async user => {
      googleUser = user || null;

      if(user){
        localOnlyMode = false;
        localStorage.removeItem(GOOGLE_LOCAL_ONLY_STORAGE_KEY);
        updateAuthGate();
        await loadChatsFromCloud();
        await syncChatsToCloud();
      } else {
        if(!localOnlyMode){
          updateAuthGate();
        }
      }

      renderGoogleAuthUI();
      updateGreeting();
    });

    renderGoogleAuthUI();
  } catch (err) {
    firebaseSyncReady = false;
    showToast('Firebase chưa được cấu hình đúng');
    updateAuthGate();
  }
}

async function handleGoogleAuthClick(){
  if(googleUser){
    try {
      if(firebaseAuth){
        await firebaseAuth.signOut();
      }
      googleUser = null;
      if(!localOnlyMode){
        updateAuthGate();
      }
      renderGoogleAuthUI();
      showToast('Đã đăng xuất Google');
    } catch (err) {
      showToast('Không thể đăng xuất Google');
    }
    return;
  }

  if(!firebaseSyncReady || !firebaseAuth || !hasFirebaseConfig()){
    showToast('Cần cấu hình Firebase để đăng nhập Google');
    return;
  }

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await firebaseAuth.signInWithPopup(provider);
  } catch (err) {
    showToast('Không thể đăng nhập Google');
  }
}

function continueLocalOnly(){
  unlockLocalMode();
  showToast('Đang dùng chế độ cục bộ');
}

function toggleVaultPanel(){
  const panel = document.getElementById('vault-panel');
  if(!panel) return;
  const next = !panel.classList.contains('open');
  setVaultPanelState(next);
}

function toggleAccountMenu(e){
  e.stopPropagation();
  const menu = document.getElementById('account-menu');
  if(!menu) return;
  menu.classList.toggle('open');
  if(menu.classList.contains('open')){
    document.addEventListener('click', closeAccountMenu);
  } else {
    document.removeEventListener('click', closeAccountMenu);
  }
}

function closeAccountMenu(e){
  const menu = document.getElementById('account-menu');
  const btn = document.getElementById('sidebar-account-btn');
  if(menu && btn && !menu.contains(e.target) && !btn.contains(e.target)){
    menu.classList.remove('open');
    document.removeEventListener('click', closeAccountMenu);
  }
}

function openSettings(){
  const currentProvider = getAIProvider();

  const providerInput = window.prompt('Provider (qwen / qrog / hf / backend / firebase):', currentProvider);
  if(providerInput == null) return;

  const provider = providerInput.trim().toLowerCase();
  if(!provider){
    showToast('Provider không hợp lệ');
    return;
  }

  localStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider);

  if(provider === 'qwen'){
    const qwenCfg = getQwenConfig();
    const baseUrlInput = window.prompt('Qwen Base URL (vd: https://dashscope.aliyuncs.com/compatible-mode/v1 hoặc https://dashscope-intl.aliyuncs.com/compatible-mode/v1):', qwenCfg.baseUrl);
    if(baseUrlInput == null) return;

    const apiKeyInput = window.prompt('Qwen API Key (sk-cb-xxxxx hoặc sk-sp-xxxxx):', qwenCfg.apiKey || '');
    if(apiKeyInput == null) return;

    const modelInput = window.prompt('Qwen model mặc định (qwen3.5-plus / qwen3.5-flash / qwen3-max / qwen3-vl-plus / qwen3-vl-flash / qwen3-omni-flash):', qwenCfg.defaultModel || 'qwen3.5-plus');
    if(modelInput == null) return;

    localStorage.setItem(QWEN_CONFIG_STORAGE_KEY, JSON.stringify({
      apiKey: apiKeyInput.trim(),
      baseUrl: baseUrlInput.trim(),
      defaultModel: modelInput.trim() || 'qwen3.5-plus'
    }));

    showToast('Đã lưu Qwen settings');
    return;
  }

  if(provider === 'qrog'){
    const groqCfg = getGroqConfig();
    const baseUrlInput = window.prompt('Groq Base URL:', groqCfg.baseUrl || 'https://api.groq.com/openai/v1');
    if(baseUrlInput == null) return;

    const apiKeyInput = window.prompt('Groq API Key (gsk_...):', groqCfg.apiKey || '');
    if(apiKeyInput == null) return;

    const modelInput = window.prompt('Groq model mặc định (llama-3.3-70b-versatile / llama-3.1-8b-instant / meta-llama/llama-4-scout-17b-16e-instruct / meta-llama/llama-4-maverick-17b-128e-instruct / mixtral-8x7b-32768 / gemma2-9b-it):', groqCfg.defaultModel || 'llama-3.3-70b-versatile');
    if(modelInput == null) return;

    localStorage.setItem(GROQ_CONFIG_STORAGE_KEY, JSON.stringify({
      apiKey: apiKeyInput.trim(),
      baseUrl: baseUrlInput.trim(),
      defaultModel: normalizeGroqModelName(modelInput.trim() || 'llama-3.3-70b-versatile')
    }));

    showToast('Đã lưu Groq settings');
    return;
  }

  if(provider === 'firebase'){
    const firebaseCfg = getFirebaseConfig();
    const apiKeyInput = window.prompt('Firebase API Key:', firebaseCfg.apiKey || '');
    if(apiKeyInput == null) return;

    const authDomainInput = window.prompt('Firebase Auth Domain:', firebaseCfg.authDomain || '');
    if(authDomainInput == null) return;

    const projectIdInput = window.prompt('Firebase Project ID:', firebaseCfg.projectId || '');
    if(projectIdInput == null) return;

    const appIdInput = window.prompt('Firebase App ID:', firebaseCfg.appId || '');
    if(appIdInput == null) return;

    const storageBucketInput = window.prompt('Firebase Storage Bucket:', firebaseCfg.storageBucket || '');
    if(storageBucketInput == null) return;

    const messagingSenderIdInput = window.prompt('Firebase Messaging Sender ID:', firebaseCfg.messagingSenderId || '');
    if(messagingSenderIdInput == null) return;

    const measurementIdInput = window.prompt('Firebase Measurement ID (optional):', firebaseCfg.measurementId || '');
    if(measurementIdInput == null) return;

    localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify({
      apiKey: apiKeyInput.trim(),
      authDomain: authDomainInput.trim(),
      projectId: projectIdInput.trim(),
      appId: appIdInput.trim(),
      storageBucket: storageBucketInput.trim(),
      messagingSenderId: messagingSenderIdInput.trim(),
      measurementId: measurementIdInput.trim()
    }));

    showToast('Đã lưu Firebase settings');
    return;
  }

  if(provider === 'hf'){
    const hfCfg = getHfConfig();
    const baseUrlInput = window.prompt('HF Base URL (khuyên dùng: https://router.huggingface.co/v1):', hfCfg.baseUrl || 'https://router.huggingface.co/v1');
    if(baseUrlInput == null) return;

    const apiKeyInput = window.prompt('HF User Access Token (hf_...):', hfCfg.apiKey || '');
    if(apiKeyInput == null) return;

    const modelInput = window.prompt('MaeAI model mặc định (mistralai/Mistral-Nemo-Instruct-2407 / meta-llama/Meta-Llama-3-8B-Instruct / Qwen/Qwen2.5-7B-Instruct):', hfCfg.defaultModel || 'Qwen/Qwen2.5-7B-Instruct');
    if(modelInput == null) return;

    localStorage.setItem(HF_CONFIG_STORAGE_KEY, JSON.stringify({
      apiKey: apiKeyInput.trim(),
      baseUrl: baseUrlInput.trim(),
      defaultModel: modelInput.trim() || 'Qwen/Qwen2.5-7B-Instruct'
    }));

    showToast('Đã lưu MaeAI settings');
    return;
  }

  if(provider === 'backend'){
    const backendCfg = getBackendConfig();
    const baseUrlInput = window.prompt('Backend Base URL (vd: http://127.0.0.1:8080):', backendCfg.baseUrl || 'http://127.0.0.1:8080');
    if(baseUrlInput == null) return;

    const apiKeyInput = window.prompt('Backend API Key (Bearer token):', backendCfg.apiKey || '');
    if(apiKeyInput == null) return;

    const modelInput = window.prompt('Backend model mặc định (khuyên dùng: backend:MaeAI Tuxue V1):', backendCfg.defaultModel || 'backend:MaeAI Tuxue V1');
    if(modelInput == null) return;

    localStorage.setItem(BACKEND_CONFIG_STORAGE_KEY, JSON.stringify({
      apiKey: apiKeyInput.trim(),
      baseUrl: baseUrlInput.trim(),
      defaultModel: modelInput.trim() || 'backend:MaeAI Tuxue V1'
    }));

    showToast('Đã lưu backend settings');
    return;
  }

  showToast('Đã lưu provider: ' + provider);
}
function changeLanguage(){ showToast('Thay đổi ngôn ngữ (đang phát triển)'); }
function openHelp(){ showToast('Trợ giúp (đang phát triển)'); }
function openUpgrade(){ showToast('Nâng cấp gói (đang phát triển)'); }
function handleLogout(){ 
  document.getElementById('account-menu').classList.remove('open'); 
  document.removeEventListener('click', closeAccountMenu);
  handleGoogleAuthClick();
}

function updateGreeting(){
  const hour = new Date().getHours();
  const greetingEmoji = document.getElementById('greeting-emoji');
  const greetingText = document.getElementById('greeting-text');
  
  if(!greetingEmoji || !greetingText) return;
  
  let emoji = '☀️';
  let greeting = 'Buổi sáng';
  
  if(hour >= 12 && hour < 17){
    emoji = '☀️';
    greeting = 'Buổi chiều';
  } else if(hour >= 17 && hour < 21){
    emoji = '🌅';
    greeting = 'Buổi tối';
  } else if(hour >= 21 || hour < 5){
    emoji = '🌙';
    greeting = 'Buổi tối khuya';
  } else {
    emoji = '🌅';
    greeting = 'Buổi sáng';
  }
  
  // Get username from googleUser
  let userName = 'bạn';
  if(googleUser){
    const displayName = googleUser.displayName || googleUser.email || 'bạn';
    // Extract first name if displayName has multiple words
    userName = displayName.split(' ')[0];
  }
  
  greetingEmoji.textContent = emoji;
  greetingText.textContent = greeting + ', ' + userName;
}

// ─── INIT ────────────────────────────────────────────────────────────────────
window.onload = () => {
  updateGreeting();
  renderChatList();
  const savedChatId = localStorage.getItem(CURRENT_CHAT_STORAGE_KEY);
  if(savedChatId && chats.some(c => c.id === savedChatId)){
    loadChat(savedChatId);
  } else if(chats.length > 0){
    loadChat(chats[0].id);
  }
  checkPuterStatus();
  if(isPuterEnabled()){
    refreshPuterSession();
  }
  chatListCollapsed = localStorage.getItem('chat_list_collapsed') === 'true';
  if(chatListCollapsed){
    const chatList = document.getElementById('chat-list');
    const icon = document.getElementById('toggle-chat-list-icon');
    if(chatList) chatList.classList.add('collapsed');
    if(icon) icon.style.transform = 'rotate(-90deg)';
  }
  syncSidebarByViewport();
  setVaultPanelState(localStorage.getItem(VAULT_PANEL_STORAGE_KEY) === 'true');
  updateAuthGate();
  initGoogleSync();

  const composerInput = document.getElementById('user-input');
  if(composerInput){
    composerInput.addEventListener('input', updateInputActionButtons);
    composerInput.addEventListener('keyup', updateInputActionButtons);
    composerInput.addEventListener('change', updateInputActionButtons);
    updateInputActionButtons();
  }

  window.addEventListener('resize', syncSidebarByViewport);
  
  // Update greeting every minute to reflect time changes and user login
  setInterval(() => {
    updateGreeting();
  }, 60000);
};

// ─── PUTER STATUS ────────────────────────────────────────────────────────────
function checkPuterStatus(){
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  if(!dot && !label) return;
  if(!isPuterEnabled()){
    if(dot) dot.classList.add('offline');
    if(label) label.textContent = 'Puter đang tắt';
    return;
  }
  if(window.puter && window.puter.ai && typeof window.puter.ai.chat === 'function'){
    if(dot) dot.classList.remove('offline');
    if(label) label.textContent = isPuterSignedIn ? 'Đã đăng nhập Puter' : 'Puter sẵn sàng';
  } else {
    if(dot) dot.classList.add('offline');
    if(label) label.textContent='Puter chưa tải';
  }
}

async function refreshPuterSession(){
  if(!isPuterEnabled()){
    isPuterSignedIn = false;
    puterUserName = '';
    renderPuterAuthUI();
    return;
  }

  if(!(window.puter && window.puter.auth)){
    renderPuterAuthUI();
    return;
  }

  try {
    if(typeof puter.auth.getUser === 'function'){
      const user = await puter.auth.getUser();
      if(user){
        isPuterSignedIn = true;
        puterUserName = pickPuterUserName(user);
      }
    }
  } catch (e) {}

  renderPuterAuthUI();
  checkPuterStatus();
}

function pickPuterUserName(data){
  if(!data) return '';
  return data.username || data.name || data.email || data.id || '';
}

function renderPuterAuthUI(){
  const authBtn = document.getElementById('puter-auth-btn');
  const userLabel = document.getElementById('puter-user-label');
  if(!authBtn || !userLabel) return;

  if(!isPuterEnabled()){
    authBtn.textContent = 'Puter đang tắt';
    authBtn.classList.remove('is-signed-in');
    userLabel.textContent = 'Đang dùng chế độ API trực tiếp';
    return;
  }

  authBtn.textContent = isPuterSignedIn ? 'Đăng xuất Puter' : 'Đăng nhập Puter';
  authBtn.classList.toggle('is-signed-in', isPuterSignedIn);
  userLabel.textContent = isPuterSignedIn
    ? `Tài khoản: ${puterUserName || 'Đã xác thực'}`
    : 'Chưa đăng nhập';
}

async function handlePuterAuthClick(){
  if(!isPuterEnabled()){
    showToast('Puter đang tắt trong cấu hình');
    return;
  }

  if(!(window.puter && window.puter.auth)){
    showToast('Puter chưa sẵn sàng, vui lòng tải lại trang');
    checkPuterStatus();
    return;
  }

  try {
    if(!isPuterSignedIn){
      const res = await puter.auth.signIn();
      const user = res?.user || res;
      isPuterSignedIn = true;
      puterUserName = pickPuterUserName(user);
      showToast('Đăng nhập Puter thành công');
    } else if(typeof puter.auth.signOut === 'function'){
      await puter.auth.signOut();
      isPuterSignedIn = false;
      puterUserName = '';
      showToast('Đã đăng xuất Puter');
    } else {
      showToast('SDK hiện tại chưa hỗ trợ signOut()');
    }
  } catch (err){
    showToast('Không thể xác thực Puter');
  }

  renderPuterAuthUI();
  checkPuterStatus();
}

// ─── CHAT MANAGEMENT ─────────────────────────────────────────────────────────
function isEmptyDraftChat(chat){
  return !!chat && Array.isArray(chat.messages) && chat.messages.length === 0;
}

function pruneEmptyDraftChat(chatId, rerender = true){
  if(!chatId) return false;
  const draft = chats.find(c => c.id === chatId);
  if(!isEmptyDraftChat(draft)) return false;

  chats = chats.filter(c => c.id !== chatId);

  if(currentChatId === chatId){
    currentChatId = null;
    localStorage.removeItem(CURRENT_CHAT_STORAGE_KEY);
  }

  persistChatsLocally();
  scheduleCloudSync();
  if(rerender){
    renderChatList();
  }
  return true;
}

function newChat(){
  pruneEmptyDraftChat(currentChatId, false);
  const id = 'chat_'+Date.now();
  const chat = { id, title:'Cuộc trò chuyện mới', messages:[], created:Date.now() };
  chats.unshift(chat);
  saveChats(); renderChatList(); updateGreeting(); loadChat(id);
}

function loadChat(id){
  if(currentChatId && currentChatId !== id){
    pruneEmptyDraftChat(currentChatId, false);
  }
  currentChatId = id;
  const chat = chats.find(c=>c.id===id);
  if(!chat) return;
  localStorage.setItem(CURRENT_CHAT_STORAGE_KEY, id);
  const chatTitleEl = document.getElementById('chat-title');
  if(chatTitleEl) chatTitleEl.textContent = chat.title;
  document.title = 'MaeAI — ' + chat.title;
  renderMessages(chat.messages);
  if(Array.isArray(chat.messages) && chat.messages.length > 0){
    scheduleRestoreScrollToBottom();
  }
  updateInputActionButtons();
  document.querySelectorAll('.chat-item').forEach(el=>el.classList.toggle('active', el.dataset.id===id));
}

function deleteChat(id,e){
  e.stopPropagation();
  chats = chats.filter(c=>c.id!==id);
  saveChats(); renderChatList();
  if(currentChatId===id){
    if(chats.length > 0){
      loadChat(chats[0].id);
    } else {
      currentChatId = null;
      localStorage.removeItem(CURRENT_CHAT_STORAGE_KEY);
      renderMessages([]);
      const chatTitleEl = document.getElementById('chat-title');
      if(chatTitleEl) chatTitleEl.textContent='';
      document.title = 'MaeAI';
    }
  }
}

function saveChats(){
  const currentChat = chats.find(c => c.id === currentChatId);
  if(currentChat){
    currentChat.updated = Date.now();
  }
  persistChatsLocally();
  scheduleCloudSync();
}

function getCurrentChat(){
  if(!currentChatId){ newChat(); }
  return chats.find(c=>c.id===currentChatId);
}

function renderChatList(){
  const el = document.getElementById('chat-list');
  el.innerHTML = chats.map(c=>`
    <div class="chat-item" data-id="${c.id}" onclick="loadChat('${c.id}')">
      <svg class="chat-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      <span class="chat-item-title">${escHtml(c.title)}</span>
      <button class="chat-item-del" onclick="deleteChat('${c.id}',event)" title="Xoá">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');
}

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
async function sendMessage(){
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if(!text || isLoading) return;
  const selectedModel = getModel();

  const chat = getCurrentChat();
  const filesSnapshot = attachedFiles.map(file => ({ ...file }));
  let userContent = buildUserContent(text, filesSnapshot);
  const userMessage = { role:'user', content:userContent, _display:text };
  chat.messages.push(userMessage);
  if(chat.messages.length===1) {
    chat.title = text.slice(0,40)+(text.length>40?'...':'');
    document.title = 'MaeAI — ' + chat.title;
  }
  saveChats();
  renderChatList();
  renderMessages(chat.messages);

  input.value=''; input.style.height=''; document.getElementById('char-count').textContent='0 ký tự'; updateInputActionButtons();
  attachedFiles=[];document.getElementById('file-preview').innerHTML='';

  const puterReady = !!(window.puter && window.puter.ai && typeof window.puter.ai.chat === 'function');
  const directApiReady = isQwenModel(selectedModel) || isQrogModel(selectedModel) || isHfModel(selectedModel) || isBackendModel(selectedModel) || isAgentScopeModel(selectedModel);
  if(!puterReady && !directApiReady){
    showToast('Chỉ hỗ trợ Qwen, Qrog, MaeAI, backend hoặc AgentScope');
    checkPuterStatus();
    return;
  }

  await streamAIResponse(chat, filesSnapshot);
}

function buildUserContent(text, files = attachedFiles){
  let sysPrefix = buildSystemPrefix();
  let fullText = sysPrefix ? sysPrefix+'\n\n'+text : text;
  const textFiles = files.filter(f => f.type === 'text');
  if(textFiles.length===0) return fullText;
  const fileNotes = textFiles.map(f=>{
    return `- File văn bản đính kèm: ${f.name}\n${String(f.data).slice(0, 12000)}`;
  }).join('\n\n');
  return `${fullText}\n\n[Thông tin file đính kèm]\n${fileNotes}`;
}

async function uploadImageAttachment(file){
  const match = String(file.data || '').match(/^data:([^;]+);base64,(.+)$/);
  if(!match) throw new Error(`Không thể đọc dữ liệu ảnh: ${file.name}`);

  const mimeType = match[1] || file.type || 'image/png';
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i += 1){
    bytes[i] = binary.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: mimeType });
  const extension = (mimeType.split('/')[1] || 'png').split('+')[0];
  const uploadPath = `maeai-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  await puter.fs.write(uploadPath, blob);
  return uploadPath;
}

async function buildAiMessages(chat, files = []){
  const messages = [];
  const cleanupPaths = [];
  const lastUserIndex = chat.messages.length - 1;

  for(let i = 0; i < chat.messages.length; i += 1){
    const message = chat.messages[i];
    const attachmentFiles = i === lastUserIndex ? files : [];

    if(message.role !== 'user' || attachmentFiles.length === 0){
      messages.push({ role: message.role, content: message.content });
      continue;
    }

    const promptText = typeof message.content === 'string' ? message.content : (message._display || '');
    const contentParts = [];

    if(promptText){
      contentParts.push({ type: 'text', text: promptText });
    }

    for(const file of attachmentFiles){
      if(file.type === 'image'){
        const uploadPath = await uploadImageAttachment(file);
        cleanupPaths.push(uploadPath);
        contentParts.push({ type: 'file', puter_path: uploadPath });
        continue;
      }

      contentParts.push({
        type: 'text',
        text: `File đính kèm: ${file.name}\n${String(file.data).slice(0, 12000)}`
      });
    }

    messages.push({ role: 'user', content: contentParts.length ? contentParts : promptText });
  }

  return { messages, cleanupPaths };
}

function buildSystemPrefix(){
  const claudeStyle = 'Trình bày theo phong cách Claude: dùng Markdown rõ ràng với tiêu đề ## hoặc ### cho các mục chính; tiêu đề phải nổi bật hơn nội dung thường; tách phần lớn bằng ---; dùng danh sách bằng dấu - và không dùng ký tự •; ưu tiên code inline cho từ khóa kỹ thuật; mọi đoạn code phải đặt trong fenced code block có ghi rõ ngôn ngữ (ví dụ ```python); nếu cần vẽ sơ đồ thì trả về block ```mermaid hợp lệ; không trả code thuần; giọng văn điềm tĩnh, mạch lạc.';
  if(activeAgent==='code') return `[Chế độ Code Agent] Bạn là chuyên gia lập trình. Hãy viết code chất lượng cao với giải thích rõ ràng. Luôn dùng code blocks kèm ngôn ngữ.\n${claudeStyle}`;
  if(activeAgent==='web') return `[Chế độ Web Search] Hãy trả lời dựa trên kiến thức hiện tại của bạn. Nếu cần thông tin mới hơn, hãy nói rõ giới hạn kiến thức.\n${claudeStyle}`;
  if(activeAgent==='file') return `[Chế độ Phân tích File] Phân tích kỹ nội dung file được đính kèm, đưa ra insights quan trọng.\n${claudeStyle}`;
  if(activeAgent==='think') return `[Chế độ Suy nghĩ sâu] Hãy suy nghĩ từng bước một (step by step) trước khi đưa ra câu trả lời. Đặt phần suy luận trong <thinking> tags.\n${claudeStyle}`;
  return claudeStyle;
}

async function streamAIResponse(chat, files = []){
  isLoading = true;
  stopRequested = false;
  abortController = new AbortController();
  const sendBtn = document.getElementById('send-btn');
  const voiceBtn = document.getElementById('voice-btn');
  const input = document.getElementById('user-input');
  setVoiceWaitingState();
  if(sendBtn) sendBtn.disabled = true;
  if(voiceBtn) voiceBtn.disabled = true;
  if(input) input.disabled = true;

  const thinkingId = 'thinking_'+Date.now();
  appendThinking(thinkingId);

  let aiPayload = [];
  let cleanupPaths = [];
  const selectedModel = getModel();

  try {
    const built = await buildAiMessages(chat, files);
    aiPayload = built.messages;
    cleanupPaths = built.cleanupPaths;

    let fullText = '';
    const assistantId = 'assistant_'+Date.now();
    let assistantBubbleVisible = false;
    let visibleText = '';
    let revealTimer = null;

    const stopRevealTimer = () => {
      if(revealTimer){
        clearInterval(revealTimer);
        revealTimer = null;
      }
    };

    const startRevealTimer = () => {
      if(revealTimer) return;
      revealTimer = setInterval(() => {
        if(visibleText.length >= fullText.length){
          stopRevealTimer();
          return;
        }

        const remaining = fullText.length - visibleText.length;
        const step = remaining > 220 ? 4 : remaining > 120 ? 3 : remaining > 60 ? 2 : 1;
        visibleText = fullText.slice(0, Math.min(fullText.length, visibleText.length + step));

        if(!assistantBubbleVisible){
          removeThinking(thinkingId);
          appendAssistantBubble(assistantId, visibleText);
          assistantBubbleVisible = true;
        } else {
          updateAssistantBubble(assistantId, visibleText);
        }
      }, 24);
    };

    if(isQwenModel(selectedModel)){
      const qwenMessages = normalizeMessagesForQwen(aiPayload);
      await streamQwenChat(qwenMessages, selectedModel, (deltaText) => {
        if(deltaText){
          fullText += deltaText;
          startRevealTimer();
        }
      });
    } else if(isQrogModel(selectedModel)){
      const groqMessages = normalizeMessagesForOpenAI(aiPayload);
      await streamGroqChat(groqMessages, selectedModel, (deltaText) => {
        if(deltaText){
          fullText += deltaText;
          startRevealTimer();
        }
      });
    } else if(isHfModel(selectedModel)){
      const hfMessages = normalizeMessagesForOpenAI(aiPayload);
      await streamHfChat(hfMessages, selectedModel, (deltaText) => {
        if(deltaText){
          fullText += deltaText;
          startRevealTimer();
        }
      });
    } else if(isBackendModel(selectedModel)){
      const backendMessages = normalizeMessagesForOpenAI(aiPayload);
      await streamBackendChat(backendMessages, selectedModel, (deltaText) => {
        if(deltaText){
          fullText += deltaText;
          startRevealTimer();
        }
      });
    } else if(isAgentScopeModel(selectedModel)){
      await streamAgentScopeChat(aiPayload, selectedModel, (deltaText) => {
        if(deltaText){
          fullText += deltaText;
          startRevealTimer();
        }
      });
    } else {
      const stream = await puter.ai.chat(aiPayload, { model: selectedModel, stream: true });
      if(stream && stream[Symbol.asyncIterator]){
        const iterator = stream[Symbol.asyncIterator]();
        while(true){
          if(stopRequested) break;
          const nextChunk = await readIteratorNext(iterator, 120000);
          if(nextChunk.timedOut){
            showToast('Puter phản hồi quá lâu, đã tự kết thúc lượt trả lời');
            break;
          }
          if(nextChunk.done) break;

          const deltaText = extractPuterText(nextChunk.value);
          if(deltaText){
            fullText += deltaText;
            startRevealTimer();
          }
        }
      } else {
        fullText = extractPuterText(stream) || String(stream || '');
        startRevealTimer();
      }
    }

    stopRevealTimer();
    if(!assistantBubbleVisible){
      removeThinking(thinkingId);
      appendAssistantBubble(assistantId, fullText);
      assistantBubbleVisible = true;
    }

    if(visibleText !== fullText){
      visibleText = fullText;
      updateAssistantBubble(assistantId, visibleText);
    }

    chat.messages.push({ role:'assistant', content:fullText });
    saveChats();
    finalizeAssistantBubble(assistantId, fullText);

  } catch(err){
    removeThinking(thinkingId);
    if(err?.message === '__STOPPED__' || stopRequested){
      showToast('Đã dừng trả lời');
    } else {
      showError('Lỗi: '+err.message);
      appendErrorBubble(err.message);
    }
  } finally {
    for(const path of cleanupPaths){
      try {
        await puter.fs.delete(path);
      } catch {}
    }
    isLoading = false;
    stopRequested = false;
    abortController = null;
    clearVoiceWaitingState();
    if(sendBtn) sendBtn.disabled = false;
    if(voiceBtn) voiceBtn.disabled = false;
    if(input) input.disabled = false;
    renderMessages(chat.messages);
    updateInputActionButtons();
  }
}

function extractPuterText(payload){
  if(payload == null) return '';
  if(typeof payload === 'string') return payload;
  if(typeof payload?.text === 'string') return payload.text;
  if(typeof payload?.content === 'string') return payload.content;
  if(typeof payload?.delta === 'string') return payload.delta;
  if(typeof payload?.delta?.content === 'string') return payload.delta.content;
  if(typeof payload?.message?.content === 'string') return payload.message.content;
  if(Array.isArray(payload?.message?.content)){
    return payload.message.content
      .map(item => {
        if(typeof item === 'string') return item;
        if(typeof item?.text === 'string') return item.text;
        if(typeof item?.content === 'string') return item.content;
        return '';
      })
      .join('');
  }
  if(Array.isArray(payload?.choices)){
    return payload.choices
      .map(choice => {
        if(typeof choice?.text === 'string') return choice.text;
        if(typeof choice?.delta?.content === 'string') return choice.delta.content;
        if(typeof choice?.message?.content === 'string') return choice.message.content;
        return '';
      })
      .join('');
  }
  return '';
}

async function readIteratorNext(iterator, timeoutMs){
  let timeoutId;
  const timeoutPromise = new Promise(resolve => {
    timeoutId = setTimeout(() => resolve({ timedOut:true }), timeoutMs);
  });

  try {
    const nextResult = await Promise.race([
      iterator.next(),
      timeoutPromise
    ]);

    if(nextResult && nextResult.timedOut) return nextResult;
    return { done: !!nextResult.done, value: nextResult.value, timedOut:false };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function createEmptyStateElement(){
  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';
  wrapper.id = 'empty-state';
  wrapper.innerHTML = `
    <div class="empty-state-header">
      <div class="plan-pills">
        <span class="pill">Gói miễn phí</span>
        <span class="pill-sep">·</span>
        <button class="pill-upgrade">Nâng cấp</button>
      </div>
    </div>
    <div class="empty-state-greeting">
      <span id="greeting-emoji">☀️</span>
      <span id="greeting-text">Buổi sáng, bạn</span>
    </div>
    <div class="empty-state-subtitle">Viết gì đó hoặc nhập "/" để xem các lệnh</div>
  `;
  return wrapper;
}

function renderMessages(msgs){
  const el = document.getElementById('messages');
  const empty = document.getElementById('empty-state');
  const main = document.getElementById('main');
  if(!el) return;
  if(main){
    main.classList.toggle('composer-centered', msgs.length === 0);
  }
  if(msgs.length===0){
    el.innerHTML='';
    const welcome = empty || createEmptyStateElement();
    welcome.style.display = 'flex';
    el.appendChild(welcome);
    updateGreeting();
    return;
  }

  if(empty){ empty.style.display='none'; }
  el.innerHTML = msgs.map((m,i)=>renderMsg(m,i)).join('');
  applyCodeHandlers();
  scrollToBottom();
}

function renderMsg(m, idx){
  const isUser = m.role==='user';
  const displayText = m._display || (typeof m.content==='string' ? m.content : '[file]');
  const content = isUser ? escHtml(displayText) : renderMarkdown(typeof m.content==='string'?m.content:displayText);

  if(isUser){
    return `<div class="msg user"><div class="msg-user-stack"><div class="bubble">${content}</div><div class="msg-actions">
      <button class="msg-action" onclick="copyMsg(this,'${encodeURIComponent(typeof m.content==='string'?m.content:'')}')" aria-label="Sao chép" title="Sao chép"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
      <button class="msg-action" onclick="regenMsg(${idx})" aria-label="Tạo lại" title="Tạo lại"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg></button>
    </div></div></div>`;
  }

  const assistantAvatar = `<div class="avatar"><img src="assets/images/IconMae.png" alt="MaeAI" class="assistant-avatar-img"></div>`;
  return `<div class="msg assistant">${assistantAvatar}<div class="bubble">${content}</div></div>`;
}

function appendUserBubble(message, idx){
  const el = document.getElementById('messages');
  const empty = document.getElementById('empty-state');
  const main = document.getElementById('main');
  if(!el) return;
  if(main){
    main.classList.remove('composer-centered');
  }
  if(empty){ empty.style.display = 'none'; }
  const div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = `<div class="msg-user-stack"><div class="bubble">${escHtml(message._display || '')}</div><div class="msg-actions">
    <button class="msg-action" onclick="copyMsg(this,'${encodeURIComponent(message.content || '')}')" aria-label="Sao chép" title="Sao chép"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
    <button class="msg-action" onclick="regenMsg(${idx})" aria-label="Tạo lại" title="Tạo lại"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg></button>
  </div></div>`;
  el.appendChild(div);
}

function appendThinking(id){
  const el = document.getElementById('messages');
  const div = document.createElement('div');
  div.className='msg assistant'; div.id=id;
  div.innerHTML=`<div class="avatar"><img src="assets/images/IconMae.png" alt="MaeAI" class="assistant-avatar-img"></div><div class="bubble"><div class="thinking thinking-claude" aria-label="MaeAI đang trả lời" role="status"><img src="assets/images/IconMae.png" alt="MaeAI" class="thinking-mae-img"></div></div>`;
  el.appendChild(div); scrollToBottom();
}

function removeThinking(id){ document.getElementById(id)?.remove() }

function appendAssistantBubble(id, text){
  const el = document.getElementById('messages');
  const div = document.createElement('div');
  div.className='msg assistant'; div.id=id;
  div.innerHTML=`<div class="avatar"><img src="assets/images/IconMae.png" alt="MaeAI" class="assistant-avatar-img"></div><div class="bubble" id="bubble_${id}">${renderMarkdown(text)}</div>`;
  el.appendChild(div); scrollToBottom();
}

function updateAssistantBubble(id, text){
  const b = document.getElementById('bubble_'+id);
  if(b){ b.innerHTML = renderMarkdown(text); applyCodeHandlers(); scrollToBottom(); }
}

function finalizeAssistantBubble(id, text){
  updateAssistantBubble(id, text);
  applyCodeHandlers();
}

function appendErrorBubble(msg){
  const el = document.getElementById('messages');
  const div = document.createElement('div');
  div.className='msg assistant';
  div.innerHTML=`<div class="avatar"><img src="assets/images/IconMae.png" alt="MaeAI" class="assistant-avatar-img"></div><div class="bubble" style="border-color:var(--red);color:var(--red)">⚠️ ${escHtml(msg)}</div>`;
  el.appendChild(div);
}

// ─── MARKDOWN ─────────────────────────────────────────────────────────────────
function renderMarkdown(text){
  if(!text) return '';
  let html = escHtml(text);
  const mermaidBlocks = [];
  const codeBlocks = [];

  function normalizeCodeLanguage(rawLang){
    const raw = String(rawLang || '').trim().toLowerCase();
    const key = raw.startsWith('.') ? raw.slice(1) : raw;

    const map = {
      java: { id: 'java', label: 'Java (.java)' },
      swift: { id: 'swift', label: 'Swift (.swift)' },
      lua: { id: 'lua', label: 'Lua (.lua)' },
      gdscript: { id: 'plaintext', label: 'GDScript (.gd)' },
      gd: { id: 'plaintext', label: 'GDScript (.gd)' },
      py: { id: 'python', label: 'Python (.py)' },
      python: { id: 'python', label: 'Python (.py)' },
      c: { id: 'c', label: 'C (.c)' },
      h: { id: 'c', label: 'C (.h)' },
      'c++': { id: 'cpp', label: 'C++ (.cpp)' },
      cpp: { id: 'cpp', label: 'C++ (.cpp)' },
      cxx: { id: 'cpp', label: 'C++ (.cpp)' },
      cc: { id: 'cpp', label: 'C++ (.cc)' },
      hpp: { id: 'cpp', label: 'C++ (.hpp)' }
    };

    if(map[key]) return map[key];
    if(!key) return { id: 'plaintext', label: 'Code' };
    return { id: key, label: key };
  }

  // Mermaid blocks
  html = html.replace(/```mermaid\n?([\s\S]*?)```/gi, (_, code) => {
    const source = decodeHtmlEntities(String(code || '').trim());
    const idx = mermaidBlocks.push(source) - 1;
    return `@@MERMAID_${idx}@@`;
  });

  // Code blocks (protect with placeholders to avoid markdown mutations inside code)
  html = html.replace(/```\s*([\w.#+-]*)\s*\n([\s\S]*?)```/g, (_, lang, code) => {
    const normalized = normalizeCodeLanguage(lang);
    const l = normalized.id;
    const canRun = ['javascript','python','html'].includes(l);
    const runBtn = canRun ? `<button class="code-run" onclick="runCodeBlock(this)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>Chạy</button>` : '';
    const blockHtml = `<div class="code-block" data-lang="${l}"><div class="code-header"><span class="code-lang">${normalized.label}</span>${runBtn}<button class="code-copy" onclick="copyCode(this)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Sao chép</button></div><pre class="code-content"><code class="language-${l}">${String(code || '').trim()}</code></pre></div>`;
    const idx = codeBlocks.push(blockHtml) - 1;
    return `@@CODEBLOCK_${idx}@@`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // H3
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  // H2
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  // H1
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Auto heading patterns (Claude-like title lines)
  html = html.replace(/^(Slide\s+\d+\s*:\s*.+)$/gim, '<h2>$1</h2>');
  html = html.replace(/^(\d+\.\s+[^\n.!?]{8,})$/gm, '<h3>$1</h3>');
  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // HR
  html = html.replace(/^---$/gm, '<hr>');
  // UL
  html = html.replace(/^[*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>'+m+'</ul>');
  // OL
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // Links
  html = html.replace(/\[(.+?)\]\((https?:\/\/.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/@@CODEBLOCK_(\d+)@@/g, (_, indexText) => codeBlocks[Number(indexText)] || '');
  html = html.replace(/@@MERMAID_(\d+)@@/g, (_, indexText) => {
    const source = mermaidBlocks[Number(indexText)] || '';
    const encoded = encodeURIComponent(source);
    return `<div class="diagram-block"><div class="diagram-header"><span class="diagram-lang">mermaid</span><button class="code-copy" onclick="copyMermaid(this)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Sao chép</button></div><div class="mermaid-diagram" data-mermaid="${encoded}"></div></div>`;
  });
  if(!html.startsWith('<')) html = '<p>'+html+'</p>';
  return html;
}

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

function decodeHtmlEntities(input){
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(input || '');
  return textarea.value;
}

// ─── CODE HANDLERS ────────────────────────────────────────────────────────────
function applyCodeHandlers(){
  if(window.hljs && typeof window.hljs.highlightElement === 'function'){
    document.querySelectorAll('.code-block pre code').forEach((codeEl) => {
      if(codeEl.dataset.highlighted === 'yes') return;
      const className = Array.from(codeEl.classList).find(cls => cls.startsWith('language-')) || '';
      const language = className.slice('language-'.length).trim().toLowerCase();
      if(language && window.hljs.getLanguage && !window.hljs.getLanguage(language)){
        codeEl.className = 'language-plaintext';
        codeEl.dataset.lang = 'plaintext';
        return;
      }
      window.hljs.highlightElement(codeEl);
    });
  }
  renderMermaidDiagrams();
}

function renderMermaidDiagrams(){
  if(!window.mermaid) return;
  if(!window.__maeMermaidInited){
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'neutral',
      flowchart: { useMaxWidth: true, htmlLabels: true }
    });
    window.__maeMermaidInited = true;
  }

  const targets = Array.from(document.querySelectorAll('.mermaid-diagram[data-mermaid]:not([data-rendered="1"])'));
  targets.forEach((container) => {
    const raw = container.getAttribute('data-mermaid') || '';
    let source = raw;
    try {
      source = decodeURIComponent(raw);
    } catch {}
    source = decodeHtmlEntities(source);

    container.innerHTML = '';

    const mermaidNode = document.createElement('div');
    mermaidNode.className = 'mermaid';
    mermaidNode.textContent = source;
    container.appendChild(mermaidNode);

    window.mermaid.run({ nodes: [mermaidNode] }).then(() => {
      container.setAttribute('data-rendered', '1');
      container.removeAttribute('data-render-retry');
    }).catch((err) => {
      const errMsg = String(err?.message || err || '');
      const retryCount = Number(container.getAttribute('data-render-retry') || '0');

      // Reload/transient DOM timing issue: retry a few times before falling back.
      if((/Node cannot be found/i.test(errMsg) || /Cannot read properties/i.test(errMsg)) && retryCount < 3){
        container.setAttribute('data-render-retry', String(retryCount + 1));
        setTimeout(() => {
          container.removeAttribute('data-rendered');
          renderMermaidDiagrams();
        }, 120);
        return;
      }

      const fallback = document.createElement('div');
      fallback.className = 'mermaid-fallback';
      fallback.textContent = `Sơ đồ Mermaid bị lỗi cú pháp:\n${err?.message || 'Unknown error'}\n\n${source}`;
      container.innerHTML = '';
      container.appendChild(fallback);
    });
  });
}

function copyMermaid(btn){
  const container = btn.closest('.diagram-block')?.querySelector('.mermaid-diagram');
  if(!container) return;
  const raw = container.getAttribute('data-mermaid') || '';
  let source = raw;
  try {
    source = decodeURIComponent(raw);
  } catch {}

  navigator.clipboard.writeText(source).then(() => {
    btn.textContent = '✓ Copied';
    setTimeout(() => {
      btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Sao chép';
    }, 1800);
  });
}

function copyCode(btn){
  const code = btn.closest('.code-block').querySelector('.code-content').textContent;
  navigator.clipboard.writeText(code).then(()=>{ btn.textContent='✓ Copied'; setTimeout(()=>btn.innerHTML='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Sao chép',1800) });
}

function runCodeBlock(btn){
  const block = btn.closest('.code-block');
  const lang = block.dataset.lang;
  const code = block.querySelector('.code-content').textContent;
  let out = block.querySelector('.code-output');
  if(!out){ out = document.createElement('div'); out.className='code-output'; block.appendChild(out); }
  if(lang==='javascript'){
    out.style.display='block';
    try {
      let logs = [];
      const origLog = console.log;
      console.log = (...args) => { logs.push(args.map(a=>typeof a==='object'?JSON.stringify(a,null,2):String(a)).join(' ')); origLog(...args); };
      const result = eval(code);
      console.log = origLog;
      out.textContent = logs.length ? logs.join('\n') : (result !== undefined ? String(result) : '(Chạy thành công, không có output)');
      out.className='code-output ok';
    } catch(e){ out.textContent='Lỗi: '+e.message; out.className='code-output err'; }
  } else if(lang==='html'){
    const w = window.open('','_blank','width=800,height=600');
    w.document.write(code); w.document.close();
    out.style.display='block'; out.textContent='✓ Đã mở trong tab mới'; out.className='code-output ok';
  } else {
    out.style.display='block'; out.textContent='Chỉ hỗ trợ chạy JavaScript và HTML trong trình duyệt'; out.className='code-output';
  }
}

// ─── AGENTS ──────────────────────────────────────────────────────────────────
const agentInfo = {
  code:'Chế độ Code Agent: AI sẽ viết code chất lượng cao với giải thích chi tiết',
  web:'Chế độ Web: AI sẽ thông báo nếu cần thông tin thời gian thực',
  file:'Chế độ File: Hãy đính kèm file để AI phân tích',
  think:'Chế độ Suy nghĩ sâu: AI sẽ reasoning từng bước trước khi trả lời'
};

function toggleAgent(name){
  if(activeAgent===name){ activeAgent=null; document.getElementById('agent-'+name).classList.remove('active'); document.getElementById('agent-info').classList.remove('visible'); return; }
  if(activeAgent) document.getElementById('agent-'+activeAgent)?.classList.remove('active');
  activeAgent=name;
  document.getElementById('agent-'+name).classList.add('active');
  const info = document.getElementById('agent-info');
  document.getElementById('agent-info-text').textContent = agentInfo[name];
  info.classList.add('visible');
}

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────
function handleFileUpload(e){
  const files = Array.from(e.target.files);
  files.forEach(f=>addFile(f));
  e.target.value='';
}

function addFile(f){
  if(f.size > 5*1024*1024){ showToast('File quá lớn (tối đa 5MB)'); return; }
  const reader = new FileReader();
  if(f.type.startsWith('image/')){
    reader.onload=(ev)=>{ attachedFiles.push({name:f.name,type:'image',data:ev.target.result}); renderFilePreviews(); };
    reader.readAsDataURL(f);
  } else {
    reader.onload=(ev)=>{ attachedFiles.push({name:f.name,type:'text',data:ev.target.result}); renderFilePreviews(); };
    reader.readAsText(f);
  }
}

function handlePaste(e){
  const items = e.clipboardData?.items || [];
  let hasImage = false;
  for(let item of items){
    if(item.type.startsWith('image/')){
      hasImage = true;
      const blob = item.getAsFile();
      addFile(blob);
    }
  }
}

function renderFilePreviews(){
  const el=document.getElementById('file-preview');
  el.innerHTML=attachedFiles.map((f,i)=>{
    if(f.type==='image'){
      return `<div class="file-chip image-chip" title="${escHtml(f.name)}"><img src="${f.data}" alt="${escHtml(f.name)}"><button class="file-chip-del" onclick="removeFile(${i})" title="Xoá">×</button></div>`;
    } else {
      return `<div class="file-chip"><div class="file-chip-info"><span class="file-chip-icon">📄</span><span class="file-chip-name">${escHtml(f.name)}</span></div><button class="file-chip-del" onclick="removeFile(${i})" title="Xoá">×</button></div>`;
    }
  }).join('');
}

function removeFile(i){ attachedFiles.splice(i,1); renderFilePreviews(); }

// ─── ACTIONS ─────────────────────────────────────────────────────────────────
function sendSuggestion(text){ document.getElementById('user-input').value=text; sendMessage(); }

function clearMessages(){
  const chat=getCurrentChat();
  if(!chat) return;
  if(!confirm('Xoá toàn bộ tin nhắn?')) return;
  chat.messages=[]; saveChats(); renderMessages([]);
  showToast('Đã xoá tin nhắn');
}

function copyMsg(btn, encoded){
  const text=decodeURIComponent(encoded);
  navigator.clipboard.writeText(text).then(()=>{ btn.textContent='✓ Đã sao chép'; setTimeout(()=>btn.innerHTML='<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Sao chép',1500) });
}

function regenMsg(idx){
  const chat=getCurrentChat();
  if(!chat) return;
  chat.messages=chat.messages.slice(0,idx);
  saveChats(); renderMessages(chat.messages);
  streamAIResponse(chat);
}

function exportChat(){
  const chat=getCurrentChat();
  if(!chat||!chat.messages.length){ showToast('Không có tin nhắn để xuất'); return; }
  const md=chat.messages.map(m=>`**${m.role==='user'?'Bạn':'MaeAI'}**:\n${typeof m.content==='string'?m.content:m._display||''}`).join('\n\n---\n\n');
  const blob=new Blob([`# ${chat.title}\n\n${md}`],{type:'text/markdown'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`chat_${chat.id}.md`; a.click();
  showToast('Đã xuất chat!');
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function handleKey(e){
  if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendMessage(); }
}

function toggleAttachMenu(e){
  e?.stopPropagation?.();
  const menu = document.getElementById('attach-menu');
  if(!menu) return;
  attachMenuOpen = !attachMenuOpen;
  menu.classList.toggle('open', attachMenuOpen);
  menu.setAttribute('aria-hidden', String(!attachMenuOpen));
}

function closeAttachMenu(){
  const menu = document.getElementById('attach-menu');
  if(!menu) return;
  attachMenuOpen = false;
  menu.classList.remove('open');
  menu.setAttribute('aria-hidden', 'true');
}

function openFilePicker(e){
  e?.stopPropagation?.();
  closeAttachMenu();
  document.getElementById('file-input').click();
}

function toggleDiagramForm(e){
  e?.stopPropagation?.();
  const form = document.getElementById('diagram-form');
  const styleForm = document.getElementById('response-style-form');
  if(!form) return;
  if(styleForm){
    styleForm.classList.remove('open');
    styleForm.setAttribute('aria-hidden', 'true');
  }
  const isOpen = form.classList.toggle('open');
  form.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  closeAttachMenu();
}

function insertDiagramPrompt(){
  const typeEl = document.getElementById('diagram-type');
  const topicEl = document.getElementById('diagram-topic');
  const input = document.getElementById('user-input');
  if(!typeEl || !topicEl || !input) return;

  const diagramType = String(typeEl.value || 'flowchart');
  const topic = String(topicEl.value || '').trim() || 'quy trình tổng quát';
  const prompt = `Hãy vẽ 1 sơ đồ ${diagramType} bằng Mermaid về chủ đề: ${topic}.\n\nYêu cầu:\n- Trả về đúng 1 block \`\`\`mermaid\n- Sơ đồ rõ ràng, đặt tên node dễ hiểu\n- Dùng tiếng Việt cho label nếu phù hợp.`;

  input.value = input.value ? `${input.value}\n\n${prompt}` : prompt;
  autoResize(input);
  updateInputActionButtons();
  input.focus();
}

function toggleResponseStyleForm(e){
  e?.stopPropagation?.();
  const form = document.getElementById('response-style-form');
  const diagramForm = document.getElementById('diagram-form');
  if(!form) return;
  if(diagramForm){
    diagramForm.classList.remove('open');
    diagramForm.setAttribute('aria-hidden', 'true');
  }
  const isOpen = form.classList.toggle('open');
  form.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  closeAttachMenu();
}

function insertResponseStylePrompt(){
  const layoutEl = document.getElementById('style-layout');
  const toneEl = document.getElementById('style-tone');
  const input = document.getElementById('user-input');
  if(!layoutEl || !toneEl || !input) return;

  const layout = String(layoutEl.value || 'tier');
  const tone = String(toneEl.value || 'professional');

  const layoutMap = {
    tier: 'Bố cục dạng Tier 1, Tier 2, Tier 3. Mỗi tier có tiêu đề đậm và 3-6 card con ngắn gọn.',
    guide: 'Bố cục hướng dẫn từng bước, có tiêu đề lớn cho từng bước và checklist rõ ràng.',
    compare: 'Bố cục so sánh 2-3 phương án bằng bảng ngắn, rồi chốt khuyến nghị.'
  };

  const toneMap = {
    professional: 'Giọng văn chuyên nghiệp, súc tích, rõ ý.',
    friendly: 'Giọng văn thân thiện, dễ hiểu, vẫn giữ cấu trúc rõ.',
    technical: 'Giọng văn kỹ thuật, có chiều sâu và nêu rõ trade-off.'
  };

  const prompt = `Hãy trả lời đẹp như giao diện Claude với yêu cầu format sau:\n- ${layoutMap[layout] || layoutMap.tier}\n- ${toneMap[tone] || toneMap.professional}\n- Dùng Markdown rõ ràng: ##, ###, danh sách bullet thoáng\n- Thuật ngữ quan trọng để trong inline code\n- Mỗi khối thông tin ngắn gọn, dễ quét mắt\n- Nếu có roadmap thì chia mốc thời gian 1-2 tuần, 1-2 tháng, 3+ tháng.`;

  input.value = input.value ? `${input.value}\n\n${prompt}` : prompt;
  autoResize(input);
  updateInputActionButtons();
  input.focus();
}

function autoResize(el){
  el.style.height='auto';
  el.style.height=Math.min(el.scrollHeight,200)+'px';
  const charCount = document.getElementById('char-count');
  if(charCount){
    charCount.textContent = el.value.length + ' ký tự';
  }
  updateInputActionButtons();
}

function syncComposerModelPill(){
  const modelSelect = document.getElementById('model-select');
  if(!modelSelect) return;
}

function setVoiceWaitingState(){
  const voiceBtn = document.getElementById('voice-btn');
  if(!voiceBtn) return;
  voiceBtn.classList.add('ai-waiting');
  voiceBtn.setAttribute('aria-label', 'AI đang trả lời');
  voiceBtn.innerHTML = '<span class="voice-waiting" aria-hidden="true"><span></span><span></span><span></span></span>';
}

function stopCurrentResponse(){
  if(!isLoading) return;
  stopRequested = true;
  if(abortController){
    try { abortController.abort(); } catch {}
  }
}

function clearVoiceWaitingState(){
  const voiceBtn = document.getElementById('voice-btn');
  if(!voiceBtn) return;
  voiceBtn.classList.remove('ai-waiting');
}

function updateInputActionButtons(){
  const input = document.getElementById('user-input');
  const voiceBtn = document.getElementById('voice-btn');
  const sendBtn = document.getElementById('send-btn');
  
  if(!input || !voiceBtn || !sendBtn) return;
  
  if(isLoading){
    setVoiceWaitingState();
    voiceBtn.onclick = () => stopCurrentResponse();
    sendBtn.classList.remove('visible');
    return;
  }

  const hasText = input.value.trim().length > 0;

  const voiceMarkup = '<img src="assets/images/voicewave.png" alt="Nhập giọng nói" class="voice-icon">';
  const sendMarkup = '<svg viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16346272 C3.34915502,0.9 2.40734225,1.00636533 1.77946707,1.4776575 C0.994623095,2.10604706 0.837654326,3.0486314 1.15159189,3.98722575 L3.03521743,10.4282188 C3.03521743,10.5853161 3.34915502,10.7424135 3.50612381,10.7424135 L16.6915026,11.5279004 C16.6915026,11.5279004 17.1624089,11.5279004 17.1624089,12.0004256 C17.1624089,12.4744748 16.6915026,12.4744748 16.6915026,12.4744748 Z"/></svg>';

  // Keep the legacy send button hidden; voice button now morphs into send.
  sendBtn.classList.remove('visible');

  if(hasText){
    voiceBtn.classList.remove('listening');
    voiceBtn.setAttribute('aria-label', 'Gửi tin nhắn');
    if(voiceBtn.dataset.mode !== 'send'){
      voiceBtn.innerHTML = sendMarkup;
      voiceBtn.dataset.mode = 'send';
    }
    voiceBtn.onclick = () => sendMessage();
  } else {
    voiceBtn.setAttribute('aria-label', 'Nhập giọng nói');
    if(voiceBtn.dataset.mode !== 'voice'){
      voiceBtn.innerHTML = voiceMarkup;
      voiceBtn.dataset.mode = 'voice';
    }
    voiceBtn.onclick = () => toggleVoiceInput();
  }
}

function toggleVoiceInput(){
  const button = document.getElementById('voice-btn');
  const input = document.getElementById('user-input');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition){
    showToast('Trình duyệt không hỗ trợ nhập giọng nói');
    return;
  }

  if(!voiceRecognition){
    voiceRecognition = new SpeechRecognition();
    voiceRecognition.lang = 'vi-VN';
    voiceRecognition.interimResults = true;
    voiceRecognition.continuous = false;

    voiceRecognition.onresult = (event) => {
      let transcript = '';
      for(let i = event.resultIndex; i < event.results.length; i++){
        transcript += event.results[i][0].transcript;
      }
      input.value = transcript.trim();
      autoResize(input);
    };

    voiceRecognition.onend = () => {
      isListening = false;
      button.classList.remove('listening');
    };

    voiceRecognition.onerror = () => {
      isListening = false;
      button.classList.remove('listening');
      showToast('Không thể nhận giọng nói');
    };
  }

  if(isListening){
    voiceRecognition.stop();
    return;
  }

  try {
    isListening = true;
    button.classList.add('listening');
    voiceRecognition.start();
  } catch (err){
    isListening = false;
    button.classList.remove('listening');
  }
}

document.addEventListener('click', (event) => {
  const wrap = document.querySelector('.attach-wrap');
  if(!wrap || wrap.contains(event.target)) return;
  closeAttachMenu();
});

document.addEventListener('click', (event) => {
  if(!isMobileViewport()) return;

  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('menu-btn');
  if(!sidebar || !sidebar.classList.contains('open')) return;

  if(sidebar.contains(event.target) || menuBtn?.contains(event.target)) return;
  sidebar.classList.remove('open');
});

function scrollToBottom(){
  const el = document.getElementById('messages');
  if(!el) return;

  if(scrollFrameId){
    cancelAnimationFrame(scrollFrameId);
    scrollFrameId = null;
  }

  scrollFrameId = requestAnimationFrame(() => {
    // Input area is in normal flow, so only keep a light breathing space.
    const paddingBottom = 18;
    const targetTop = Math.max(0, el.scrollHeight - el.clientHeight - paddingBottom);
    const distance = Math.abs(targetTop - el.scrollTop);
    const shouldSmooth = distance > 140;

    el.scrollTo({ top: targetTop, behavior: shouldSmooth ? 'smooth' : 'auto' });
    scrollFrameId = null;
  });
}

function scheduleRestoreScrollToBottom(){
  restoreScrollTimers.forEach(timerId => clearTimeout(timerId));
  restoreScrollTimers = [];

  // First pass right after render, then a few delayed passes for async content.
  scrollToBottom();

  [90, 240, 520, 980].forEach((delay) => {
    const timerId = setTimeout(() => {
      const main = document.getElementById('main');
      if(main && main.classList.contains('composer-centered')) return;
      scrollToBottom();
    }, delay);
    restoreScrollTimers.push(timerId);
  });
}

function showToast(msg, dur=2500){
  const t=document.getElementById('toast'); t.textContent=msg;
  t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),dur);
}

function showError(msg){ showToast('⚠️ '+msg, 4000); }

function toggleSidebar(){
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;

  if(isMobileViewport()){
    sidebar.classList.toggle('open');
    return;
  }

  const next = !sidebar.classList.contains('collapsed');
  setSidebarCollapsedState(next);
}
