import os
import re
import json
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Any
import litellm
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# LiteLLM global config — supports OpenAI, Anthropic, Gemini, Ollama, etc.
litellm.api_key  = os.getenv("LLM_API_KEY")  or os.getenv("OPENAI_API_KEY")
litellm.api_base = os.getenv("LLM_BASE_URL") or os.getenv("OPENAI_BASE_URL")
MODEL = os.getenv("LLM_MODEL") or os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Suppress litellm verbose logging
litellm.set_verbose = False

EXTRACT_PROMPT = """你是一个知识图谱构建专家。请对用户文本进行完整的实体关系抽取。

【输出格式 — 严格遵守】
只输出一个 JSON 对象，不加任何前缀、后缀、注释或 markdown 代码块：
{"nodes":[{"id":"n1","label":"实体名","type":"类型"}],"edges":[{"source":"n1","target":"n2","label":"关系"}]}

实体类型（只能使用这7种）：
Person | Organization | Location | Event | Concept | Product | Other

抽取规则：
1. 穷尽抽取：每个有意义的实体都必须出现，短文≥15节点，长文≥40节点
2. 人物：所有人名，主次无论
3. 组织：国家、政府、机构、公司、联盟
4. 事件：历史事件、条约、战争、谈判、危机
5. 概念：政策、法案、制裁、外交立场
6. 关系：每个节点平均≥2条边，描述≤8字
7. id 连续编号：n1, n2, n3…
8. 输出必须可以被 JSON.parse() 直接解析，不允许出现任何非 JSON 内容"""

INFER_PROMPT = """你是一名顶级战略分析师。你将收到一份知识图谱数据，请进行深度推断分析。

【输出格式】
使用 Markdown 结构化报告，包含以下章节：

## 核心枢纽
识别图谱中的权力中心和关键节点，说明其影响力来源。

## 关键链路
找出最重要的影响路径和传导链，用"A → B → C"形式表示。

## 隐含模式
识别非显而易见的结构性规律或隐性联盟。

## 推断与预测
基于图谱结构，推断可能的发展走向或潜在风险。

## 关键洞察
3-5条高价值结论，每条注明依据的节点或关系。

语言要求：专业、简练、有力。每条洞察必须有具体依据，不能泛泛而谈。"""


def extract_json(raw: str) -> dict:
    """从 LLM 输出中提取 JSON，处理各种格式偏差。"""
    # 去除首尾空白
    text = raw.strip()

    # 去除 markdown 代码块
    text = re.sub(r'^```(?:json)?\s*\n?', '', text)
    text = re.sub(r'\n?```\s*$', '', text)
    text = text.strip()

    # 尝试直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 尝试提取第一个完整的 {...} 块
    match = re.search(r'\{[\s\S]*\}', text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise json.JSONDecodeError("No valid JSON found in LLM response", text, 0)


async def call_llm_with_retry(messages: list, max_retries: int = 2) -> dict:
    """调用 LLM 并在 JSON 解析失败时自动重试。"""
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            response = litellm.completion(model=MODEL, messages=messages)
            raw = response.choices[0].message.content.strip()
            return extract_json(raw)
        except json.JSONDecodeError as e:
            last_error = e
            if attempt < max_retries:
                await asyncio.sleep(2 ** attempt)  # 1s, 2s
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=500, detail=f"LLM 返回格式错误（重试 {max_retries} 次后失败）：{last_error}")


class TextInput(BaseModel):
    text: str


class GraphInput(BaseModel):
    nodes: List[Any]
    edges: List[Any]


@app.post("/analyze")
async def analyze(input: TextInput):
    if not input.text.strip():
        raise HTTPException(status_code=400, detail="文本不能为空")
    if len(input.text) > 50000:
        raise HTTPException(status_code=400, detail="文本过长，请控制在 50000 字符以内")

    messages = [
        {"role": "system", "content": EXTRACT_PROMPT},
        {"role": "user", "content": input.text},
    ]
    return await call_llm_with_retry(messages)


@app.post("/infer")
async def infer(input: GraphInput):
    graph_text = (
        f"【节点列表】\n{json.dumps(input.nodes, ensure_ascii=False)}\n\n"
        f"【关系列表】\n{json.dumps(input.edges, ensure_ascii=False)}"
    )

    def generate():
        try:
            stream = litellm.completion(
                model=MODEL,
                messages=[
                    {"role": "system", "content": INFER_PROMPT},
                    {"role": "user", "content": graph_text},
                ],
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta
                # R1 推理链（DeepSeek / 兼容模型）
                think = getattr(delta, "reasoning_content", None)
                if think:
                    yield f"data: {json.dumps({'type': 'think', 'text': think}, ensure_ascii=False)}\n\n"
                # 正式回答
                if delta.content:
                    yield f"data: {json.dumps({'type': 'answer', 'text': delta.content}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/health")
async def health():
    return {"status": "ok"}
