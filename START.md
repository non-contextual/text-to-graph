# 启动步骤

## 1. 配置 API Key

```bash
cd backend
cp .env.example .env
# 编辑 .env，填入你的 API Key 和 Base URL
```

## 2. 启动后端

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## 3. 启动前端

```bash
cd frontend
bun run dev
```

浏览器打开 http://localhost:5173
