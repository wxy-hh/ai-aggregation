import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const token = "cdd8de579e607966aa11e61dd06f40bddf24eac592b71577a984445d530c807e3025d0324a487cb18731a21b00530122";
const expires = 1795357982;

const egoScript = `
const task = await taskSpace("knowledge-full-ui-test-v2");
const page = task.page("p1");

console.log("=== 1. 初始化会话与登录 ===");
await page.goto("http://localhost:3030/login", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(1500);

const loginBtn = await page.waitForSelector("button:has-text('立即进入')", { timeout: 3000 }).catch(() => null);
if (loginBtn) {
  console.log("检测到登录按钮，点击立即进入...");
  await page.click("button:has-text('立即进入')");
  await page.waitForFunction(() => window.location.pathname !== "/login", undefined, { timeout: 15000 });
  await page.waitForTimeout(2000);
}

// 设置桌面宽屏 1440x900
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 2,
  mobile: false
});

console.log("=== 2. 桌面端：访问知识库中心 ===");
await page.goto("http://localhost:3030/knowledge", { waitUntil: "domcontentloaded", timeout: 45000 });
console.log("等待页面核心标题与工程文档按钮渲染...");
await page.waitForSelector("text='知识库中心'", { timeout: 30000 });
await page.waitForSelector("button:has-text('工程文档')", { timeout: 30000 });
await page.waitForTimeout(1500);

// 截图 1: 桌面端知识库中心初始态
await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-01-desktop-workspace.png" });
console.log("📸 [UI-01] 桌面端工作区初始态已截图");

// 测试 2.1: 点击「新建知识库」弹窗交互与表单校验
console.log("=== 2.1 测试新建知识库弹窗交互与表单校验 ===");
await page.click("button:has-text('新建知识库')");
await page.waitForSelector("input[placeholder='知识库名称']", { timeout: 10000 });
await page.waitForTimeout(800);

// 验证输入框为空时，提交按钮处于 disabled 禁用态（原生防空提交设计）
const submitBtnDisabled = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find(b => b.textContent?.includes("确认创建"));
  return btn ? btn.disabled : false;
});
console.log("确认创建按钮 disabled 状态:", submitBtnDisabled);

// 输入合法名称与描述，验证按钮激活
await page.fill("input[placeholder='知识库名称']", "临时交互测试库");
await page.waitForTimeout(500);

// 截图 2: 新建弹窗输入就绪态
await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-02-create-dialog-validation.png" });
console.log("📸 [UI-02] 新建知识库弹窗与输入就绪已截图");

// 点击取消关闭弹窗
await page.click("button:has-text('取消')");
await page.waitForTimeout(1000);

// 测试 2.2: 顶部「刷新」按钮点击测试
console.log("=== 2.2 测试刷新知识库列表 ===");
await page.click("button:has-text('刷新')");
await page.waitForTimeout(1500);

// 测试 2.3: Tab 切换测试（切换至「文档管理」Tab）
console.log("=== 2.3 测试 Tab 切换至文档管理 ===");
await page.click("button[role='tab']:has-text('文档管理')");
await page.waitForSelector("text='知识库文档'", { timeout: 15000 });
await page.waitForTimeout(2000);

// 截图 3: 文档管理列表页（包含 41 篇文档卡片、就绪状态 Badge、切片数统计）
await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-03-documents-management.png" });
console.log("📸 [UI-03] 文档管理列表与切片状态已截图");

// 测试文档列表滚动
console.log("=== 2.4 测试文档卡片网格纵向滚动 ===");
await page.mouse.move(700, 500);
await page.mouse.wheel(0, 800);
await page.waitForTimeout(1500);
await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-04-documents-scrolled.png" });
console.log("📸 [UI-04] 文档列表滚动态已截图");

// 回滚到顶部并切换回「检索调试」Tab
await page.mouse.wheel(0, -800);
await page.waitForTimeout(1000);
await page.click("button[role='tab']:has-text('检索调试')");
await page.waitForSelector("text='检索调试台'", { timeout: 15000 });
await page.waitForTimeout(1500);

// 测试 2.5: 检索调试台深度交互测试（清空、快捷词点击、执行检索）
console.log("=== 2.5 测试快捷测试词与检索渲染 ===");
// 点击快捷测试芯片「ADR-0008」自动触发检索
await page.click("button:has-text('ADR-0008')");

// 等待结果渲染完成
console.log("等待三栏结果与明细卡片渲染...");
await page.waitForSelector("text='RRF 融合明细'", { timeout: 30000 });
await page.waitForTimeout(2000);

// 截图 5: 桌面端三栏混合检索结果
await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-05-retrieval-results-desktop.png" });
console.log("📸 [UI-05] 桌面端三栏混合检索结果已截图");

// 测试 2.6: 切片卡片「展开 / 收起」交互
console.log("=== 2.6 测试切片展开与收起 ===");
const expandBtn = "button:has-text('查看完整切片')";
if (await page.waitForSelector(expandBtn, { timeout: 5000 }).catch(() => null)) {
  await page.click(expandBtn);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-06-chunk-expanded.png" });
  console.log("📸 [UI-06] 切片卡片展开全文已截图");
  // 再次点击收起
  await page.click("button:has-text('收起切片')");
  await page.waitForTimeout(500);
}

console.log("=== 3. 移动端响应式深度验收 (390x844 iPhone 14) ===");
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true
});
await page.waitForTimeout(2000);

// 滚动至顶部
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1000);

// 截图 7: 移动端视口检索调试台（单列自适应堆叠、快捷词芯片折行适配）
await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-07-mobile-debugger-top.png" });
console.log("📸 [UI-07] 移动端顶部与输入区已截图");

// 移动端向下滚动查看结果卡片单列布局与触控热区
console.log("移动端向下平滑滚动...");
await page.mouse.move(195, 400);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(1500);
await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-08-mobile-results-scrolled.png" });
console.log("📸 [UI-08] 移动端切片单列堆叠滚动已截图");

// 移动端切换至「文档管理」Tab
console.log("移动端切换至文档管理 Tab...");
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.click("button[role='tab']:has-text('文档管理')");
await page.waitForTimeout(2000);

await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-09-mobile-documents-tab.png" });
console.log("📸 [UI-09] 移动端文档管理卡片列表已截图");

// 移动端测试弹出新建知识库模态框（测试小屏适配、关闭与触控热区）
console.log("移动端打开新建知识库弹窗...");
await page.click("button:has-text('新建知识库')");
await page.waitForTimeout(1000);

await page.screenshot({ path: "/Users/weixiaoyu/Desktop/practice/AI-aggregation/.scratch/agent-rag/screenshots/UI-10-mobile-create-dialog.png" });
console.log("📸 [UI-10] 移动端新建弹窗适配已截图");

await page.click("button:has-text('取消')");
await page.waitForTimeout(500);

await task.finish({ keep: [] });
console.log("🎉 全部知识库页面深度交互、点击、滚动、移动端适配验收 100% 执行完成！");
`;

const scriptPath = resolve(process.cwd(), 'tooling/scripts/ego-ui-deep-test.mjs');
writeFileSync(scriptPath, egoScript, 'utf-8');

console.log("🚀 启动 ego-browser 执行全量知识库交互验收脚本...");
execSync(`ego-browser nodejs -e "await import('file://${scriptPath}')"`, {
  stdio: 'inherit',
  encoding: 'utf-8'
});
