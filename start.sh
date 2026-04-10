#!/bin/bash

# 1. Tự động Rebranding Studio sang MaeAI
STUDIO_PATH=$(npm root -g)/@agentscope/studio/dist/public
if [ -d "$STUDIO_PATH" ]; then
    echo "Apply MaeAI Branding to Studio..."
    sed -i 's/<title>AgentScope Studio<\/title>/<title>MaeAI Agent Studio<\/title>/g' "$STUDIO_PATH/index.html"
    # Nhúng script đổi text động
    sed -i '/<\/body>/i <script>setInterval(() => { document.querySelectorAll("*").forEach(el => { if (el.children.length === 0 && el.textContent.trim() === "AgentScope Studio") el.textContent = "MaeAI Agent Studio"; if (el.children.length === 0 && el.textContent.trim() === "AgentScope") el.textContent = "MaeAI"; }); }, 1000);<\/script>' "$STUDIO_PATH/index.html"
fi

as_studio --port 3000 --host 0.0.0.0 &

# 2. Đợi một lát để Studio khởi động xong
sleep 5

# 3. Khởi chạy FastAPI Server ở cổng do Railway cung cấp ($PORT)
# $PORT là cổng công khai mà website của bạn sẽ gọi vào
uvicorn api_server:app --host 0.0.0.0 --port ${PORT:-8000}
