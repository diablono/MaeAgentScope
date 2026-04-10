#!/bin/bash

# 1. Khởi chạy AgentScope Studio ở cổng 3000 (chạy ngầm)
as_studio --port 3000 --host 0.0.0.0 &

# 2. Đợi một lát để Studio khởi động xong
sleep 5

# 3. Khởi chạy FastAPI Server ở cổng do Railway cung cấp ($PORT)
# $PORT là cổng công khai mà website của bạn sẽ gọi vào
uvicorn api_server:app --host 0.0.0.0 --port ${PORT:-8000}
