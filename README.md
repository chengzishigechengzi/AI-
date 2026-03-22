# AI 可用性测试

这是一个基于原生 `HTML + CSS + JavaScript + Node.js` 的可用性测试工作台，包含：

- 首页
- 页面测试
- 流程测试
- 用户画像管理
- 历史记录
- 本地 AI 代理转发

## 本地启动

```powershell
cd "D:\小妹的文件\ai可用性测试"
npm start
```

启动后访问：

- `http://localhost:3000`

健康检查：

- `http://localhost:3000/api/health`

## 生产部署方式

当前项目最适合部署成一个 Node 服务：

- 静态资源：由 `ai-proxy-server.js` 直接托管
- AI 请求：前端通过同域名下的 `/api/ai` 调用服务端代理

也就是说，线上只需要启动：

```bash
node ai-proxy-server.js
```

## Render 部署

当前仓库已经包含 Render Blueprint 文件：

- [render.yaml](/D:/小妹的文件/ai可用性测试/render.yaml)

你可以直接在 Render 里：

1. 连接 GitHub 仓库
2. 选择 `Blueprint`
3. 导入当前仓库里的 `render.yaml`
4. 在环境变量里补上 `REMOTE_AI_API_KEY`
5. 点击部署

部署完成后先检查：

- `/api/health`

再验证：

- 页面测试生成
- 页面测试追问
- 流程测试生成
- 流程测试追问
- 历史记录查看

## 生产环境变量

推荐线上通过环境变量配置 AI，不要直接提交真实密钥。

必填：

- `PORT`
- `REMOTE_AI_ENDPOINT`
- `REMOTE_AI_API_KEY`

可选：

- `REMOTE_AI_API_KEY_HEADER`
- `REMOTE_AI_AUTH_SCHEME`
- `REMOTE_AI_MODEL`

火山 Ark 示例：

```bash
PORT=3000
REMOTE_AI_ENDPOINT=https://ark.cn-beijing.volces.com/api/v3/chat/completions
REMOTE_AI_API_KEY=your-real-api-key
REMOTE_AI_AUTH_SCHEME=Bearer
REMOTE_AI_MODEL=doubao-seed-2-0-pro-260215
```

如果你本地调试想继续用文件配置，可以复制：

- [local-ai.config.example.json](/D:/小妹的文件/ai可用性测试/local-ai.config.example.json)

为：

- `local-ai.config.json`

这个真实配置文件已经被 git 忽略，不会默认提交。

## 上线前检查

1. 确认 `index.html` 中 AI 接口是同域路径 `/api/ai`
2. 确认服务端已配置真实 `REMOTE_AI_*` 环境变量
3. 确认服务器开放了运行端口
4. 部署后先检查 `/api/health`
5. 再分别验证：
   - 页面测试生成
   - 页面测试追问
   - 流程测试生成
   - 流程测试追问
   - 历史记录查看

## 当前启动命令

```json
{
  "scripts": {
    "start": "node ai-proxy-server.js"
  }
}
```

## 说明

- 线上部署时，前端会自动请求同域 `/api/ai`
- 不建议把真实 AI 密钥写进前端
- 推荐部署到支持长期运行 Node 进程的平台，例如云服务器、宝塔、Railway、Render、Vercel Node Serverless 适配层或公司内部 Node 容器
