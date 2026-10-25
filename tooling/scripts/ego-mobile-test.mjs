
const task = await taskSpace("mobile-inspect-clean");
const page = task.page("p1");

console.log("1. 访问首页并注入完整的 Session 与 LocalStorage...");
await page.goto("http://localhost:3030/login", { waitUntil: "domcontentloaded" });

await page.cdp("Network.setCookie", {
  name: "refresh_token",
  value: "cdd8de579e607966aa11e61dd06f40bddf24eac592b71577a984445d530c807e3025d0324a487cb18731a21b00530122",
  domain: "localhost",
  path: "/",
  httpOnly: true,
  expires: 1795357982
});

await page.cdp("Network.setCookie", {
  name: "auth_kind",
  value: "user",
  domain: "localhost",
  path: "/",
  expires: 1795357982
});

// 注入客户端持久化认证状态
await page.evaluate(() => {
  localStorage.setItem("ai-app-auth", JSON.stringify({
    state: {
      user: {
        id: "cmrswotmx0000zi9kvk8za9bt",
        username: "xkfy",
        email: "admin_qa@test.internal",
        role: "admin",
        memorySearchEnabled: true
      },
      isAuthenticated: true
    },
    version: 1
  }));
});

// 设置移动端 390x844 视口
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true
});

console.log("2. 移动端直达知识库中心...");
await page.goto("http://localhost:3030/knowledge", { waitUntil: "domcontentloaded" });
await page.waitForSelector("text='知识库中心'", { timeout: 30000 });
await page.waitForTimeout(2000);

console.log("3. 移动端测试弹出新建知识库模态框...");
await page.click("button:has-text('新建知识库')");
await page.waitForSelector("input[placeholder='知识库名称']", { timeout: 10000 });
await page.waitForTimeout(1000);

await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-10-mobile-create-dialog.png" });
console.log("📸 [UI-10] 移动端新建弹窗已截图");

// 关闭弹窗
await page.click("button:has-text('取消')");
await page.waitForTimeout(1000);

// 点击切换至「文档管理」Tab
console.log("4. 移动端切换至「文档管理」Tab...");
await page.click("button[role='tab']:has-text('文档管理')");
await page.waitForSelector("text='知识库文档'", { timeout: 15000 });
await page.waitForTimeout(2000);

await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-09-mobile-documents-tab.png" });
console.log("📸 [UI-09] 移动端文档管理已截图");

// 移动端向下滚动查看文档卡片流
console.log("5. 移动端文档流滚动...");
await page.mouse.move(195, 400);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(1500);

await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-11-mobile-documents-scrolled.png" });
console.log("📸 [UI-11] 移动端文档流滚动已截图");

await task.finish({ keep: [] });
console.log("🎉 移动端专项验证全部顺利完成！");
