import fs from 'node:fs';
import path from 'node:path';
import { callChat, config, validateTree, validateWidget, getApiKey, MODEL } from './test-real-model.mjs';
import { checkedCalls, renderedNodes, checkNativeCase, toolHistory, incorporatesSubmission, checkUpdatedTable } from './eval/assertions.mjs';

const results = {
  testedAt: new Date().toISOString(),
  model: MODEL,
  evaluationVersion: 2,
  evaluationScope: 'API routing, schema and requested component/data assertions; no browser execution',
  summary: { total: 0, passed: 0, failed: 0 },
  categories: {
    A_plainText: [],
    B_nativeComponents: [],
    C_customWidgets: [],
    D_multiTurnInteractions: [],
  },
};

function logHeader(title) {
  console.log('\n============================================================');
  console.log(`>>> ${title}`);
  console.log('============================================================');
}

// -----------------------------------------------------------------------------
// Category A: Plain text answers
// -----------------------------------------------------------------------------
const categoryAPrompts = [
  { id: 'A1', prompt: '什么是欧拉公式？请简述其数学意义。' },
  { id: 'A2', prompt: '解释一下什么是卡尔曼滤波，用通俗语言说明其基本原理。' },
  { id: 'A3', prompt: '牛顿第三定律的内容是什么？' },
  { id: 'A4', prompt: '请简要解释机械臂运动学中的奇异点概念。' },
];

async function runCategoryA() {
  logHeader('Category A: Plain Text Q&A (Expect NO UI tools)');
  for (const item of categoryAPrompts) {
    process.stdout.write(`[${item.id}] Prompt: "${item.prompt.slice(0, 30)}..." `);
    const start = Date.now();
    try {
      const msg = await callChat([{ role: 'user', content: item.prompt }]);
      const toolCalls = msg.tool_calls || [];
      const hasUiTool = toolCalls.some(tc => ['ui_render', 'ui_render_widget'].includes(tc.function.name));
      const passed = !hasUiTool && typeof msg.content === 'string' && msg.content.length > 20;
      
      const record = {
        id: item.id,
        prompt: item.prompt,
        toolCalls: toolCalls.map(tc => tc.function.name),
        textLength: (msg.content || '').length,
        textSnippet: (msg.content || '').slice(0, 100),
        passed,
        durationMs: Date.now() - start,
        error: passed ? null : (hasUiTool ? `Improperly called tool: ${toolCalls.map(t=>t.function.name).join(',')}` : 'Empty content'),
      };
      results.categories.A_plainText.push(record);
      results.summary.total++;
      if (passed) results.summary.passed++; else results.summary.failed++;
      console.log(passed ? `-> PASS (${record.durationMs}ms)` : `-> FAIL: ${record.error}`);
    } catch (err) {
      console.log(`-> ERROR: ${err.message}`);
      results.categories.A_plainText.push({ id: item.id, prompt: item.prompt, passed: false, error: err.message });
      results.summary.total++;
      results.summary.failed++;
    }
  }
}

// -----------------------------------------------------------------------------
// Category B: Native components (ui_render)
// -----------------------------------------------------------------------------
const categoryBPrompts = [
  { id: 'B1', title: 'Dashboard', prompt: '帮我生成一个2026年Q1公司业务运营监控看板，包含总收入、活跃用户、转化率、客单价等核心指标，并按不同业务线展示数据。' },
  { id: 'B2', title: 'Sortable Table', prompt: '请列出一份主流新能源汽车关键性能指标的对比表（包含车型、续航里程、零百加速、售价、电池容量），要求可以按列排序。' },
  { id: 'B3', title: 'Multi-series Chart', prompt: '对比分析过去四个季度（Q1-Q4）中，线上电商与线下门店在营收上的多系列对比柱状图。' },
  { id: 'B4', title: 'Interactive Form', prompt: '设计一个产品功能满意度与用户需求反馈表单，包含用户身份类型、评分滑块、改进意见分类以及是否接收后续邮件通知。' },
  { id: 'B5', title: 'Timeline', prompt: '梳理一份具身智能与大模型融合发展的关键技术里程碑时间线，展示代表性成果与阶段。' },
];

async function runCategoryB() {
  logHeader('Category B: Native Components (Expect ui_render)');
  for (const item of categoryBPrompts) {
    process.stdout.write(`[${item.id} - ${item.title}] Prompt: "${item.prompt.slice(0, 30)}..." `);
    const start = Date.now();
    try {
      const msg = await callChat([{ role: 'user', content: item.prompt }]);
      const toolCalls = msg.tool_calls || [];
      const renderCall = toolCalls.find(tc => tc.function.name === 'ui_render');
      let passed = false;
      let error = null;
      let validation = null;

      if (!renderCall) {
        error = toolCalls.length ? `Selected wrong tool: ${toolCalls.map(t=>t.function.name).join(',')}` : 'Did not call any UI tool';
      } else {
        try {
          const checked = checkedCalls(msg, config);
          const args = checked.find(c => c.call.id === renderCall.id).args;
          validation = validateTree(args);
          if (!validation.ok) {
            error = `validateTree failed: ${validation.errors.join('; ')}`;
          } else {
            error = checkNativeCase(item.id, args);
            passed = error === null;
          }
        } catch (e) {
          error = `JSON parse arguments error: ${e.message}`;
        }
      }

      const record = {
        id: item.id,
        title: item.title,
        prompt: item.prompt,
        toolCalled: renderCall ? 'ui_render' : (toolCalls[0]?.function?.name || 'none'),
        passed,
        validation,
        durationMs: Date.now() - start,
        error,
      };
      results.categories.B_nativeComponents.push(record);
      results.summary.total++;
      if (passed) results.summary.passed++; else results.summary.failed++;
      console.log(passed ? `-> PASS (${record.durationMs}ms, ${validation?.count} components)` : `-> FAIL: ${error}`);
    } catch (err) {
      console.log(`-> ERROR: ${err.message}`);
      results.categories.B_nativeComponents.push({ id: item.id, prompt: item.prompt, passed: false, error: err.message });
      results.summary.total++;
      results.summary.failed++;
    }
  }
}

// -----------------------------------------------------------------------------
// Category C: Custom Widget (ui_render_widget)
// -----------------------------------------------------------------------------
const categoryCPrompts = [
  { id: 'C1', title: '3D Sphere', prompt: '请用交互式 3D 形式展示三维球面 x²+y²+z²=2Rz，让我可以旋转缩放观察。' },
  { id: 'C2', title: 'Slider Plot', prompt: '画一个阻尼振动函数曲线，提供振幅、阻尼系数和角频率的滑动条，让我滑动控制曲线实时变化。' },
  { id: 'C3', title: 'Three.js 3D Scene', prompt: '使用 Three.js 做一个包含光影的可交互 3D 太阳系微型模型，行星公转且支持鼠标拖拽视角。' },
  { id: 'C4', title: 'Dynamic Simulator', prompt: '做一个单摆运动的动态物理模拟器，支持启动暂停和摆长重力参数调节。' },
];

async function runCategoryC() {
  logHeader('Category C: Custom Widget (Expect ui_render_widget or ui_render Plot)');
  for (const item of categoryCPrompts) {
    process.stdout.write(`[${item.id} - ${item.title}] Prompt: "${item.prompt.slice(0, 30)}..." `);
    const start = Date.now();
    try {
      const msg = await callChat([{ role: 'user', content: item.prompt }]);
      const toolCalls = msg.tool_calls || [];
      const widgetCall = toolCalls.find(tc => tc.function.name === 'ui_render_widget');
      const renderCall = toolCalls.find(tc => tc.function.name === 'ui_render');
      let passed = false;
      let error = null;
      let validation = null;
      let chosenTool = 'none';

      if (widgetCall) {
        chosenTool = 'ui_render_widget';
        try {
          const checked = checkedCalls(msg, config);
          const args = checked.find(c => c.call.id === widgetCall.id).args;
          const errors = validateWidget(args, config);
          if (errors.length) {
            error = `validateWidget failed: ${errors.join('; ')}`;
          } else {
            passed = true;
            validation = { ok: true, htmlLen: args.html?.length, cssLen: args.css?.length, jsExprCount: (args.jsExpressions || []).length };
          }
        } catch (e) {
          error = `JSON parse widget args error: ${e.message}`;
        }
      } else if (renderCall && item.id === 'C2') {
        chosenTool = 'ui_render';
        try {
          const checked = checkedCalls(msg, config);
          const args = checked.find(c => c.call.id === renderCall.id).args;
          const v = validateTree(args);
          if (v.ok && !checkNativeCase('C2', args)) {
            passed = true;
            validation = { ok: true, isPlotWithParams: true, count: v.count };
          } else {
            error = `ui_render used for C2 but without a rendered Plot with three sliders: ${Object.keys(v.types).join(',')}`;
          }
        } catch (e) {
          error = `JSON parse render args error: ${e.message}`;
        }
      } else {
        chosenTool = toolCalls[0]?.function?.name || 'none';
        error = `Did not call ui_render_widget (called: ${chosenTool})`;
      }

      const record = {
        id: item.id,
        title: item.title,
        prompt: item.prompt,
        toolCalled: chosenTool,
        passed,
        validation,
        durationMs: Date.now() - start,
        error,
      };
      results.categories.C_customWidgets.push(record);
      results.summary.total++;
      if (passed) results.summary.passed++; else results.summary.failed++;
      console.log(passed ? `-> PASS (${record.durationMs}ms, tool: ${chosenTool})` : `-> FAIL: ${error}`);
    } catch (err) {
      console.log(`-> ERROR: ${err.message}`);
      results.categories.C_customWidgets.push({ id: item.id, prompt: item.prompt, passed: false, error: err.message });
      results.summary.total++;
      results.summary.failed++;
    }
  }
}

// -----------------------------------------------------------------------------
// Category D: Multi-turn interactions
// -----------------------------------------------------------------------------
async function runCategoryD() {
  logHeader('Category D: Multi-turn Interaction Flow');
  
  // D1: Form Submission -> Agent reasons with submitted data
  process.stdout.write(`[D1 - Form Submit & Follow-up Reasoning] `);
  const startD1 = Date.now();
  try {
    const msg1 = await callChat([{ role: 'user', content: '请帮我生成一个销售预测配置表单，包含预测区域、预测季度数、预测情景（乐观/基准/保守）。' }]);
    const checked1 = checkedCalls(msg1, config);
    const form = checked1.find(c => c.name === 'ui_render' && renderedNodes(c.args).some(n => n.type === 'Form'));
    if (!form) throw new Error('Turn 1 did not render a valid Form');
    const tc1 = form.call;
    const messages = [
      ...toolHistory('请帮我生成一个销售预测配置表单，包含预测区域、预测季度数、预测情景（乐观/基准/保守）。', msg1, checked1),
      { role: 'user', content: '[Form submitted: region="APAC", quarters=4, scenario="Optimistic"] 请根据我填写的这些参数进行详细预测分析。' },
    ];
    const msg2 = await callChat(messages);
    const checked2 = msg2.tool_calls?.length ? checkedCalls(msg2, config) : [];
    const calls2 = msg2.tool_calls || [];
    const mentionsParameters = incorporatesSubmission(msg2, checked2);
    const passedD1 = mentionsParameters;

    const recordD1 = {
      id: 'D1',
      title: 'Form Submission Follow-up',
      turn1Tool: tc1?.function?.name,
      turn2Tool: calls2[0]?.function?.name || 'none',
      turn2MentionedParameters: mentionsParameters,
      passed: passedD1,
      durationMs: Date.now() - startD1,
      error: passedD1 ? null : 'Failed to incorporate form submission data in follow-up reasoning',
    };
    results.categories.D_multiTurnInteractions.push(recordD1);
    results.summary.total++;
    if (passedD1) results.summary.passed++; else results.summary.failed++;
    console.log(passedD1 ? `-> PASS (${recordD1.durationMs}ms)` : `-> FAIL: ${recordD1.error}`);
  } catch (err) {
    console.log(`-> ERROR: ${err.message}`);
    results.categories.D_multiTurnInteractions.push({ id: 'D1', passed: false, error: err.message });
    results.summary.total++;
    results.summary.failed++;
  }

  // D2: Iterative UI update (Keep context & update UI)
  process.stdout.write(`[D2 - Iterative UI Modification] `);
  const startD2 = Date.now();
  try {
    const turn1Prompt = '帮我生成一个展示三款手机（Model A, Model B, Model C）价格和电池容量的表格。';
    const msg1 = await callChat([{ role: 'user', content: turn1Prompt }]);
    const checked1 = checkedCalls(msg1, config);
    const initial = checked1.find(c => c.name === 'ui_render' && renderedNodes(c.args).some(n => n.type === 'Table'));
    if (!initial) throw new Error('Turn 1 did not render a valid Table');
    const tc1 = initial.call;
    const messages = [
      ...toolHistory(turn1Prompt, msg1, checked1),
      { role: 'user', content: '请在这个表格中增加一列“屏幕尺寸”，并将 Model A 的屏幕尺寸设为 6.1 寸，Model B 为 6.7 寸，Model C 为 6.5 寸。' },
    ];
    const msg2 = await callChat(messages);
    const checked2 = checkedCalls(msg2, config);
    const updated = checked2.find(c => c.name === 'ui_render' && checkUpdatedTable(initial.args, c.args));
    const tc2 = updated?.call;
    const passedD2 = !!updated;
    const errorD2 = passedD2 ? null : 'Updated table must retain prior columns and values and contain all three requested screen sizes';

    const recordD2 = {
      id: 'D2',
      title: 'Iterative UI Update',
      turn1Ok: !!tc1,
      turn2Tool: tc2 ? 'ui_render' : 'none',
      passed: passedD2,
      durationMs: Date.now() - startD2,
      error: errorD2,
    };
    results.categories.D_multiTurnInteractions.push(recordD2);
    results.summary.total++;
    if (passedD2) results.summary.passed++; else results.summary.failed++;
    console.log(passedD2 ? `-> PASS (${recordD2.durationMs}ms)` : `-> FAIL: ${errorD2}`);
  } catch (err) {
    console.log(`-> ERROR: ${err.message}`);
    results.categories.D_multiTurnInteractions.push({ id: 'D2', passed: false, error: err.message });
    results.summary.total++;
    results.summary.failed++;
  }
}

async function main() {
  const targetCategory = process.argv[2] || 'all';
  if (!['A', 'B', 'C', 'D', 'all'].includes(targetCategory)) throw new Error('Category must be A, B, C, D or all');
  getApiKey();
  console.log('Starting Real Model UI Selection & Quality Evaluation Suite...');
  console.log(`Target Model: ${MODEL} via official DeepSeek API`);
  console.log(`Target Category: ${targetCategory}`);
  
  const reportPath = path.resolve('docs/real-model-eval-report.json');
  // A partial run reports only its own cases; never mix old results into a new run.
  if (targetCategory === 'all' || targetCategory === 'A') await runCategoryA();
  if (targetCategory === 'all' || targetCategory === 'B') await runCategoryB();
  if (targetCategory === 'all' || targetCategory === 'C') await runCategoryC();
  if (targetCategory === 'all' || targetCategory === 'D') await runCategoryD();

  // Recompute summary across all categories in results
  results.summary = { total: 0, passed: 0, failed: 0 };
  for (const catKey of Object.keys(results.categories)) {
    for (const item of results.categories[catKey]) {
      results.summary.total++;
      if (item.passed) results.summary.passed++; else results.summary.failed++;
    }
  }
  
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
  
  console.log('\n============================================================');
  console.log(`Final Evaluation Summary:`);
  console.log(`Total: ${results.summary.total} | Passed: ${results.summary.passed} | Failed: ${results.summary.failed}`);
  console.log(`Pass Rate: ${((results.summary.passed / results.summary.total) * 100).toFixed(1)}%`);
  console.log(`Saved detailed report to: ${reportPath}`);
  console.log('============================================================\n');
  process.exitCode = results.summary.failed ? 1 : 0;
}

main().catch(err => { console.error(err.message); process.exitCode = 1; });
