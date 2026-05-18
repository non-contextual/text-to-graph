# INTELHUB

> 其他语言：[English](./README.md) · 简体中文
>
> **粘贴任意文本。几秒内得到一个可交互的知识图谱。**

为分析师、记者、研究者打造，让你理解复杂的实体关系，不用花 20 分钟手动画图。

![input screen](docs/screenshot-input.png)

---

## 它做什么

1. **抽取**：喂任意文本（新闻、情报报告、研究论文）。LLM 自动抽出所有实体和关系。
2. **可视化**：渲染一张可交互的力图。拖节点、缩放、点击查看关系。
3. **推理**：按 INFERENCE 按钮生成战略分析报告：权力中心、影响路径、隐藏模式、预测。

![graph view](docs/screenshot-graph.png)

兼容任何 OpenAI-compatible API：DeepSeek、Qwen、GPT-4o、Ollama 跑的本地模型等。

---

## 快速开始

**后端**
```bash
cd backend
cp .env.example .env
# 编辑 .env，填入 API key 和 base URL
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**前端**
```bash
cd frontend
cp .env.example .env   # 可选：如果后端跑在别处，改 VITE_API_URL
bun run dev            # 或: npm run dev / npx vite
```

打开 `http://localhost:5173`

---

## 配置

**`backend/.env`**
```env
OPENAI_API_KEY=your-key-here
OPENAI_BASE_URL=https://api.deepseek.com/v1   # 任意 OpenAI-compatible 端点
OPENAI_MODEL=deepseek-reasoner                # 支持 R1 风格推理链
ALLOWED_ORIGINS=http://localhost:5173         # 多个用逗号分隔
```

**`frontend/.env`**（可选）
```env
VITE_API_URL=http://localhost:8000
```

### 测试通过的模型
- DeepSeek R1 / V3
- GPT-4o / GPT-4o-mini
- Qwen 2.5

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + Vite + D3.js |
| 后端 | FastAPI + OpenAI SDK |
| 图 | D3 力模拟 |
| 样式 | 自定义 CSS, Share Tech Mono |

---

## 许可

MIT
