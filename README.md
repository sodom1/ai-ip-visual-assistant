# AI IP 视觉设定助手 DeepSeek 部署版

这是一个可以部署到 Vercel 的最小可用版本。

用户打开网页后，可以在聊天窗口输入文化 IP 想法。前端页面会把消息发送到 `/api/chat`，后端接口 `api/chat.js` 会调用 DeepSeek，并把回复显示回页面。

## 文件说明

- `index.html`：用户看到的聊天页面。
- `api/chat.js`：Vercel 后端接口，用来调用 DeepSeek。
- `package.json`：让 Vercel 识别这是一个 Node 项目。

## Vercel 环境变量

进入 Vercel 项目：

`Settings` -> `Environment Variables`

添加：

| Name | Value |
| --- | --- |
| `DEEPSEEK_API_KEY` | 你的 DeepSeek API Key |
| `DEEPSEEK_MODEL` | `deepseek-chat` |

注意：

- 不要再填写 `ANTHROPIC_API_KEY`，那是 Claude/Anthropic 用的。
- 不要把 DeepSeek API Key 写进 `index.html`。
- 不要把 DeepSeek API Key 上传到 GitHub。
- 添加环境变量后，需要重新 Deploy 一次。

## 本地测试

如果你只是打开 `index.html`，页面能看到，但 AI 接口不能正常工作。因为 `/api/chat` 需要 Vercel 或本地 Node 服务来运行。

最简单的做法是直接部署到 Vercel 后测试。

## 使用流程

1. 把这个文件夹上传到 GitHub。
2. 在 Vercel 里 Import 这个 GitHub 项目。
3. 在 Vercel 的 Environment Variables 里添加 `DEEPSEEK_API_KEY`。
4. Deploy。
5. 打开 Vercel 生成的网址，就可以使用 AI IP 视觉设定助手。
