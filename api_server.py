import os
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agentscope.agent import ReActAgent
from agentscope.model import OpenAIChatModel, GeminiChatModel
from agentscope.formatter import OpenAIMultiAgentFormatter, GeminiMultiAgentFormatter
from agentscope.pipeline import MsgHub
from agentscope.message import Msg
import agentscope

logger = logging.getLogger("maeai")

# --- Lấy API Keys từ môi trường ---
GROQ_KEY  = os.getenv("GROQ_API_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
# Studio chạy nội bộ ở port 3000 (tách biệt với PORT của Railway)
STUDIO_URL = os.getenv("STUDIO_URL", "http://127.0.0.1:3000")

# --- Khởi tạo Models ---
groq_model = OpenAIChatModel(
    model_name="llama-3.1-8b-instant",
    api_key=GROQ_KEY,
    client_kwargs={"base_url": "https://api.groq.com/openai/v1"}
)

gemini_model = GeminiChatModel(
    model_name="gemini-1.5-flash",
    api_key=GEMINI_KEY
)

# --- Định nghĩa Agents ---
coder_agent = ReActAgent(
    name="Coder_Groq",
    sys_prompt="You are a speed-focused Python programmer using Groq Llama 3.",
    model=groq_model,
    formatter=OpenAIMultiAgentFormatter()
)

reviewer_agent = ReActAgent(
    name="Reviewer_Gemini",
    sys_prompt="You are a careful code reviewer using Google Gemini 1.5.",
    model=gemini_model,
    formatter=GeminiMultiAgentFormatter()
)

planner_agent = ReActAgent(
    name="Strategic_Planner",
    sys_prompt="""You are a Strategic Planner. When giving advice, always format your response as a professional Dashboard:
1. Use Markdown Tables for data.
2. Use Task Lists [ ] [x] for action plans.
3. Use Callouts (e.g., > [!IMPORTANT]) for key notes.
Present everything as if it's a high-level UI summary.""",
    model=gemini_model,
    formatter=GeminiMultiAgentFormatter()
)

# --- Lifespan Event Handler (thay thế on_event deprecated) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Kết nối tới Studio nếu có — KHÔNG crash nếu Studio chưa sẵn sàng
    try:
        agentscope.init(
            project="MaeAI_Agent_Studio",
            name=f"Production_Run_{os.getenv('RAILWAY_SERVICE_ID', 'Local')}",
            studio_url=STUDIO_URL
        )
        logger.info(f"✅ Kết nối Studio thành công tại {STUDIO_URL}")
    except Exception as e:
        logger.warning(f"⚠️  Studio không kết nối được ({e}) — tiếp tục không có Studio")

    yield  # ← Ứng dụng chạy ở đây

    # Cleanup khi shutdown (nếu cần)
    logger.info("MaeAI API Server đang tắt...")

# --- Khởi tạo FastAPI với lifespan ---
app = FastAPI(title="MaeAI Agent API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    target: str  # 'coder', 'reviewer', 'planner', 'multi'

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        target = request.target.lower()

        if target == "multi":
            msg = Msg("User", f"Đề bài: {request.message}", "user")
            async with MsgHub(participants=[coder_agent, reviewer_agent], announcement=msg):
                res_coder   = await coder_agent()
                res_reviewer = await reviewer_agent()
            combined = (
                f"### 💡 Kết quả từ Team Multi-Agent\n\n"
                f"#### 👨‍💻 Coder (Llama 3.1):\n{res_coder.content}\n\n---\n\n"
                f"#### 🕵️‍♂️ Reviewer (Gemini 1.5):\n{res_reviewer.content}"
            )
            return {"agent_name": "Multi-Agent Team", "model": "Hybrid (Groq + Gemini)", "response": combined}

        elif target == "coder":
            msg = Msg("User", request.message, "user")
            response = await coder_agent(msg)
            return {"agent_name": coder_agent.name, "model": "Groq (Llama 3.1)", "response": response.content}

        elif target == "reviewer":
            msg = Msg("User", request.message, "user")
            response = await reviewer_agent(msg)
            return {"agent_name": reviewer_agent.name, "model": "Gemini (1.5 Flash)", "response": response.content}

        elif target == "planner":
            msg = Msg("User", request.message, "user")
            response = await planner_agent(msg)
            return {"agent_name": planner_agent.name, "model": "Gemini (Strategic Dashboard)", "response": response.content}

        else:
            raise HTTPException(status_code=400, detail="target phải là: 'coder', 'reviewer', 'planner', hoặc 'multi'")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def home():
    return {
        "status": "MaeAI API sẵn sàng 🚀",
        "agents": ["coder (Groq Llama 3.1)", "reviewer (Gemini 1.5)", "planner (Gemini)", "multi (Coder+Reviewer)"],
        "studio": STUDIO_URL
    }

@app.get("/health")
def health():
    return {"ok": True}
