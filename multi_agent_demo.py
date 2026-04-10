import os
import asyncio
import agentscope
from agentscope.agent import ReActAgent
from agentscope.model import OpenAIChatModel
from agentscope.formatter import OpenAIMultiAgentFormatter
from agentscope.pipeline import MsgHub
from agentscope.message import Msg

async def main():
    agentscope.init(
        project="Multi_Agent_Demo",
        name="Coder_Tester_Run",
        studio_url="http://localhost:3000"
    )

    groq_model = OpenAIChatModel(
        model_name="llama-3.1-8b-instant",
        api_key=os.getenv("GROQ_API_KEY"),
        client_kwargs={
            "base_url": "https://api.groq.com/openai/v1"
        }
    )

    coder = ReActAgent(
        name="Coder",
        sys_prompt="You are an expert Python programmer. Write concise and efficient code without extra explanations. Keep it short.",
        model=groq_model,
        formatter=OpenAIMultiAgentFormatter()
    )

    tester = ReActAgent(
        name="Tester",
        sys_prompt="You are a strict QA engineer. Your job is to review the code provided and point out exactly 1 edge case or bug. Don't write too much text.",
        model=groq_model,
        formatter=OpenAIMultiAgentFormatter()
    )

    print("Starting Multi-Agent conversation...")

    task_announcement = Msg(
        "system",
        "Task: Coder, please write a Python function to calculate the N-th Fibonacci number. Then Tester, please review that code.",
        "system"
    )

    async with MsgHub(
        participants=[coder, tester],
        announcement=task_announcement
    ) as hub:
        
        await coder()
        await tester()

    print("\nConversation finished. Check Studio UI at: http://localhost:3000/overview")

if __name__ == "__main__":
    asyncio.run(main())
