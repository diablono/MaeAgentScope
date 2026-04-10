import os
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agentscope.agent import ReActAgent
from agentscope.model import OpenAIChatModel, GeminiChatModel
from agentscope.formatter import OpenAIMultiAgentFormatter, GeminiMultiAgentFormatter
from agentscope.pipeline import MsgHub
from agentscope.message import Msg
import agentscope

app = FastAPI(title="AgentScope Multi-Model API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Lấy API Keys từ môi trường ---
GROQ_KEY = os.getenv("GROQ_API_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
STUDIO_URL = os.getenv("STUDIO_URL", "http://localhost:3000")

# --- Khởi tạo 2 Model hoàn toàn khác nhau ---
groq_model = OpenAIChatModel(
    model_name="llama-3.1-8b-instant",
    api_key=GROQ_KEY,
    client_kwargs={"base_url": "https://api.groq.com/openai/v1"}
)

gemini_model = GeminiChatModel(
    model_name="gemini-1.5-flash",
    api_key=GEMINI_KEY
)

# --- Định nghĩa 2 Agent với Model riêng biệt ---
# 1. Coder (Sử dụng Groq)
coder_agent = ReActAgent(
    name="Coder_Groq",
    sys_prompt="You are a speed-focused Python programmer using Groq Llama 3.",
    model=groq_model,
    formatter=OpenAIMultiAgentFormatter()
)

# 2. Reviewer (Sử dụng Gemini)
reviewer_agent = ReActAgent(
    name="Reviewer_Gemini",
    sys_prompt="You are a careful code reviewer using Google Gemini 1.5.",
    model=gemini_model,
    formatter=GeminiMultiAgentFormatter()
)

@app.on_event("startup")
async def startup_event():
    agentscope.init(
        project="Hybrid_Model_Project",
        name="ProductionRun",
        studio_url=STUDIO_URL
    )

class ChatRequest(BaseModel):
    message: str
    target: str # 'coder' hoặc 'reviewer'

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        # Lựa chọn Agent & Model dựa trên yêu cầu từ Website
        if request.target.lower() == "multi":
            msg = Msg("User", f"Đề bài: {request.message}", "user")
            async with MsgHub(participants=[coder_agent, reviewer_agent], announcement=msg):
                res_coder = await coder_agent()
                res_reviewer = await reviewer_agent()
                
            combined = f"### 💡 Kết quả từ Team Multi-Agent\n\n#### 👨‍💻 Coder (Llama 3.1):\n{res_coder.content}\n\n---\n\n#### 🕵️‍♂️ Reviewer (Gemini 1.5):\n{res_reviewer.content}"
            return {
                "agent_name": "Multi-Agent Team",
                "model": "Hybrid (Groq + Gemini)",
                "response": combined
            }
        elif request.target.lower() == "coder":
            agent = coder_agent
            model_info = "Groq (Llama 3.1)"
            msg = Msg("User", request.message, "user")
            response = await agent(msg)
            return {
                "agent_name": agent.name,
                "model": model_info,
                "response": response.content
            }
        elif request.target.lower() == "reviewer":
            agent = reviewer_agent
            model_info = "Gemini (1.5 Flash)"
            msg = Msg("User", request.message, "user")
            response = await agent(msg)
            return {
                "agent_name": agent.name,
                "model": model_info,
                "response": response.content
            }
        else:
            raise HTTPException(status_code=400, detail="Vui lòng chọn 'coder', 'reviewer', hoặc 'multi'")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def home():
    return {"message": "API sẵn sàng", "options": ["coder (Groq)", "reviewer (Gemini)"]}
