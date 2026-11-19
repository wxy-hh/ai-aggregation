
const task = await taskSpace("mobile-verified-pass");
const page = task.page("p1");

// 1. 设置移动端 390x844 视口 (iPhone 14)
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true
});

console.log("1. 访问知识库受保护路由 (触发重定向至登录)...");
await page.goto("http://localhost:3030/knowledge", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(1500);

// 如果在登录页，输入账号密码登录
if ((await page.url()).includes("/login")) {
  console.log("在登录页，输入用户名与密码...");
  await page.fill("input[placeholder*='用户名']", "xkfy");
  await page.fill("input[placeholder*='密码']", "Admin123456!");
  await page.click("button:has-text('立即进入')");
  console.log("等待登录并自动回跳至知识库中心...");
  await page.waitForFunction(() => window.location.pathname.includes("/knowledge"), undefined, { timeout: 15000 });
  await page.waitForTimeout(2000);
}

console.log("当前 URL:", await page.url());
await page.waitForSelector("text='知识库中心'", { timeout: 30000 });
await page.waitForTimeout(1500);

// 2. 移动端新建知识库模态框交互测试
console.log("2. 移动端点击「新建知识库」...");
await page.click("button:has-text('新建知识库')");
await page.waitForSelector("input[placeholder='知识库名称']", { timeout: 10000 });
await page.waitForTimeout(1000);

await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-10-mobile-create-dialog.png" });
console.log("📸 [UI-10] 移动端新建弹窗已截图");

// 关闭新建弹窗
await page.click("button:has-text('取消')");
await page.waitForTimeout(1000);

// 3. 移动端切换至「文档管理」Tab
console.log("3. 移动端切换至「文档管理」Tab...");
await page.click("button[role='tab']:has-text('文档管理')");
await page.waitForSelector("text='知识库文档'", { timeout: 15000 });
await page.waitForTimeout(2000);

await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-09-mobile-documents-tab.png" });
console.log("📸 [UI-09] 移动端文档管理卡片列表已截图");

// 4. 移动端纵向滚动查看文档列表流
console.log("4. 移动端向下平滑滚动文档流...");
await page.mouse.move(195, 400);
await page.mouse.wheel(0, 800);
await page.waitForTimeout(1500);

await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-11-mobile-documents-scrolled.png" });
console.log("📸 [UI-11] 移动端文档流滚动已截图");

// 5. 切换回「检索调试」Tab 并测试移动端检索交互
console.log("5. 切换回「检索调试」Tab 并执行连败熔断检索...");
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.click("button[role='tab']:has-text('检索调试')");
await page.waitForSelector("text='检索调试台'", { timeout: 15000 });
await page.waitForTimeout(1000);

// 点击快捷测试芯片「连败熔断」
await page.click("button:has-text('连败熔断')");
await page.waitForSelector("text='RRF 融合明细'", { timeout: 30000 });
await page.waitForTimeout(2000);

// 向下滚动查看移动端结果单列堆叠
await page.mouse.move(195, 400);
await page.mouse.wheel(0, 700);
await page.waitForTimeout(1500);

await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-08-mobile-results-scrolled.png" });
console.log("📸 [UI-08] 移动端结果单列堆叠已截图");

await task.finish({ keep: [] });
console.log("🎉 移动端全方位交互测试已全部成功通过！");
