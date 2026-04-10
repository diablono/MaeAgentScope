#!/bin/bash

# 1. Tự động Rebranding Studio sang MaeAI
STUDIO_PATH=$(npm root -g)/@agentscope/studio/dist/public
if [ -d "$STUDIO_PATH" ]; then
    echo "Apply MaeAI Branding to Studio..."

    # Thay đổi tiêu đề
    sed -i 's/<title>AgentScope Studio<\/title>/<title>MaeAI Agent Studio<\/title>/g' "$STUDIO_PATH/index.html"

    # Copy theme CSS vào thư mục tài nguyên của Studio
    cp /app/assets/maeai-theme.css "$STUDIO_PATH/assets/maeai-theme.css"

    # Nhúng Google Fonts + Theme CSS + JS Rebranding (chỉ khi chưa nhúng)
    if ! grep -q "maeai-theme.css" "$STUDIO_PATH/index.html"; then
        sed -i 's|</head>|<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DynaPuff:wght@400;600\&family=JetBrains+Mono:wght@400;600\&family=Zen+Old+Mincho:wght@400;600\&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/maeai-theme.css"></head>|' "$STUDIO_PATH/index.html"
        sed -i '/<\/body>/i <script>setInterval(() => { document.querySelectorAll("*").forEach(el => { if (el.children.length === 0 \&\& el.textContent.trim() === "AgentScope Studio") el.textContent = "MaeAI Agent Studio"; if (el.children.length === 0 \&\& el.textContent.trim() === "AgentScope") el.textContent = "MaeAI"; }); }, 1000);<\/script>' "$STUDIO_PATH/index.html"
    fi
    echo "MaeAI Theme applied!"
fi

# Studio PHẢI chạy ở port 3000 (tách biệt với PORT Railway = 8080)
# Nếu không unset PORT, as_studio sẽ lấy PORT=8080 và xung đột với FastAPI
PORT_BACKUP=$PORT
unset PORT
as_studio --port 3000 --host 0.0.0.0 &
export PORT=$PORT_BACKUP

# 2. Đợi Studio khởi động (Tối đa 30 giây)
echo "Waiting for MaeAI Agent Studio to be ready on port 3000..."
MAX_RETRIES=30
COUNT=0
while ! curl -s http://127.0.0.1:3000 > /dev/null; do
    sleep 1
    COUNT=$((COUNT+1))
    if [ $COUNT -ge $MAX_RETRIES ]; then
        echo "Warning: Studio is taking too long to start, proceeding anyway..."
        break
    fi
done
echo "Studio is ready! Starting FastAPI Server..."

# 3. Khởi chạy FastAPI Server ở cổng do Railway cung cấp ($PORT)
# $PORT là cổng công khai mà website của bạn sẽ gọi vào
uvicorn api_server:app --host 0.0.0.0 --port ${PORT:-8000}
