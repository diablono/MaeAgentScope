import os
import asyncio
import agentscope
from agentscope.agent import ReActAgent
from agentscope.model import OpenAIChatModel
from agentscope.formatter import OpenAIChatFormatter
from agentscope.message import Msg

async def main():
    # 1. Khoi tao AgentScope va ket noi toi Studio dang chay o cong 3000
    agentscope.init(
        project="Groq_Demo",
        name="Llama_Run",
        studio_url="http://localhost:3000"
    )

    # 2. Cau hinh Model Groq truc tiep
    # Su dung llama-3.1-8b-instant de dam bao model dang hoat dong
    groq_model = OpenAIChatModel(
        model_name="llama-3.1-8b-instant",
        api_key=os.getenv("GROQ_API_KEY"),
        client_kwargs={
            "base_url": "https://api.groq.com/openai/v1"
        }
    )

    # 3. Tao Agent su dung ReActAgent
    assistant = ReActAgent(
        name="GroqRobot",
        sys_prompt="You are a funny robot assistant. You love to make jokes about humans.",
        model=groq_model,
        formatter=OpenAIChatFormatter()
    )

    print("Sending message to Agent via Groq...")

    # 4. Gui tin nhan dau tien
    msg = Msg("User", "Hello Robot! Tell me something interesting about humans.", "user")
    
    # Chay agent
    response = await assistant(msg)

    print("\n[Robot Response]:")
    print(response.content)
    print("\nCheck Studio UI at: http://localhost:3000/overview")

if __name__ == "__main__":
    asyncio.run(main())
