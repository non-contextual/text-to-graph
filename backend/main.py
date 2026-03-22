import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Any
from openai import OpenAI
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

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
)
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

EXTRACT_PROMPT = """你是一个顶级知识图谱构建专家。你的任务是对用户提供的文本进行**穷尽式**实体关系抽取，构建尽可能完整的知识图谱。

输出格式：只输出一个合法 JSON 对象，不加任何 markdown、代码块或说明文字：
{"nodes":[{"id":"n1","label":"实体名","type":"实体类型"}],"edges":[{"source":"n1","target":"n2","label":"关系"}]}

实体类型：Person（人物）、Organization（组织/国家/机构）、Location（地点）、Event（事件）、Concept（概念/政策/法律）、Product（产品/技术）、Other

抽取要求（严格执行）：
1. **数量**：文本中每一个有意义的实体都必须抽取，短文至少15个节点，长文至少40个节点
2. **人物**：所有提及的人名，无论主次，全部抽取
3. **组织**：所有国家、政府机构、国际组织、公司等，全部抽取
4. **事件**：所有历史事件、条约、战争、谈判、危机等，全部抽取
5. **概念**：重要政策、法案、制裁措施、外交立场等，全部抽取
6. **关系**：穷举所有节点之间的关系，每个节点平均至少有2条边
7. 关系描述简洁，不超过8个字
8. 每个实体只出现一次，id 连续编号（n1, n2, n3...）
9. 输出必须是可直接 JSON.parse 的纯文本"""

INFER_PROMPT = """你是一名顶级战略分析师和情报专家。你将收到一份知识图谱数据（实体与关系列表），请对其进行深度推断分析。

输出要求：
1. **核心节点分析**：识别图谱中的权力中心和关键枢纽节点
2. **关系链路**：找出最重要的影响路径和传导链
3. **隐含模式**：识别非显而易见的结构性规律
4. **推断与预测**：基于图谱结构，推断可能的发展走向或潜在风险
5. **关键洞察**：3-5条高价值的非表面结论

格式：结构化中文报告，每条洞察注明依据节点/关系。语言专业、简练、有力。"""


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
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": EXTRACT_PROMPT},
                {"role": "user", "content": input.text},
            ],
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="LLM 返回格式错误")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/infer")
async def infer(input: GraphInput):
    graph_text = (
        f"【节点列表】\n{json.dumps(input.nodes, ensure_ascii=False)}\n\n"
        f"【关系列表】\n{json.dumps(input.edges, ensure_ascii=False)}"
    )

    def generate():
        try:
            stream = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": INFER_PROMPT},
                    {"role": "user", "content": graph_text},
                ],
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta
                # R1 思考链（reasoning_content）
                think = getattr(delta, "reasoning_content", None)
                if think:
                    yield f"data: {json.dumps({'type': 'think', 'text': think}, ensure_ascii=False)}\n\n"
                # 正式回答（content）
                if delta.content:
                    yield f"data: {json.dumps({'type': 'answer', 'text': delta.content}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/health")
async def health():
    return {"status": "ok"}
