# Sử dụng image hỗ trợ cả Python và Node.js
FROM nikolaik/python-nodejs:python3.11-nodejs20

WORKDIR /app

# Cài đặt thư viện Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Cài đặt AgentScope Studio
RUN npm install -g @agentscope/studio

# Copy mã nguồn
COPY . .

# Cấp quyền thực thi cho file start.sh
RUN chmod +x start.sh

# Railway API port
ENV PORT 8080
EXPOSE 8080

# Chạy script khởi động
CMD ["./start.sh"]
