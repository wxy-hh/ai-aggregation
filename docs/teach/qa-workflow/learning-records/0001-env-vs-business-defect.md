# 0001: 环境异常不是业务缺陷，严禁盲目修改业务代码

在真实浏览器自动化验收中，当页面出现「白屏、报错、按钮无反应或超时」时，必须严格执行「前置探活 → 页面抓包 → 独立隔离探针」的三层诊断链，严禁把连接拒绝、网络阻断或账号欠费误判为业务 Bug。

## Status
active

## Evidence
在 Candidate 01 重构中，浏览器验收阶段多次出现 `No output generated`。Agent 并未盲目怀疑新编写的 `tool-pipeline.ts`，而是通过抓包截获 SSE 报文、编写独立探针脚本 `probe-ark.mts` 绕过所有新代码直接调用火山引擎，最终精确证明了当时存在：① 本机代理引起的 `*.volces.com` TLS 阻断；② 模型账号欠费（`AccountOverdueError 403`）。当网络和账号恢复后，重构代码一次性全通。

## Implications
- 每次打开浏览器前，必须用 `curl -s -o /dev/null -w "%{http_code}" http://localhost:3030` 探活。
- 当上游接口报错时，先用独立探针验证第三方连通性，防止对已经写好的正确代码进行灾难性乱改。
