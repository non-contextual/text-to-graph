# TODOS

## 前端请求超时
**What:** 为 `/analyze` 和 `/infer` 的 fetch 调用加超时处理。
**Why:** 当前如果 LLM API 响应慢或挂起，用户会看到永远转圈的加载状态，没有任何错误提示。
**How:** `/analyze` 用 `AbortController` 设 30s 超时，`/infer`（流式）设 120s。超时后展示 ERR 信息。
**Depends on:** 无
