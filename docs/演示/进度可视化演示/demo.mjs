#!/usr/bin/env node
/**
 * 进度可视化 2.4.0 演示脚本（幂等）：示例项目「电商风控策略上线」。
 *
 * 用法：node docs/演示/进度可视化演示/demo.mjs   （在仓库根目录执行）
 * 效果：清空本目录 .ctbz-record/ 后，用 dashboard CLI 顺序写入一组
 *       group + 8 task + 2 轮实验轮次 + 1 个待决问题 的演示数据。
 * 每步断言 exit 0，任何非 0 退出码立即抛错并打印 stderr。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const demoDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(demoDir, '..', '..', '..');
const cli = join(workspaceRoot, 'skills', 'ctbz', 'scripts', 'dashboard');
const recordPath = join(demoDir, '.ctbz-record', 'dashboard.json');

let payloadDir = null;
let payloadSeq = 0;

function run(label, args) {
  try {
    execFileSync(process.execPath, args, { cwd: workspaceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(`✓ ${label}`);
  } catch (error) {
    console.error(`✗ ${label}`);
    const stderr = error.stderr ? String(error.stderr).trim() : '';
    const stdout = error.stdout ? String(error.stdout).trim() : '';
    if (stderr) console.error(`stderr: ${stderr}`);
    if (stdout) console.error(`stdout: ${stdout}`);
    throw error;
  }
}

function writePayload(action, payload) {
  payloadSeq += 1;
  const file = join(payloadDir, `${String(payloadSeq).padStart(2, '0')}-${action.replace('.', '-')}.json`);
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}

function apply(label, action, payload) {
  const file = writePayload(action, payload);
  run(label, [cli, 'apply', '--workspace', demoDir, '--action', action, '--file', file]);
}

function readRecord() {
  return JSON.parse(readFileSync(recordPath, 'utf8'));
}

function assertSelected(expectedId) {
  const board = readRecord();
  const open = board.rounds.find((round) => round.finishedAt === null);
  const node = board.nodes.find((item) => item.id === expectedId);
  if (!open || open.nodeId !== expectedId) throw new Error(`round.start 未选中 ${expectedId}（实际：${open?.nodeId ?? '无进行中轮次'}）`);
  if (!node || node.status !== 'active') throw new Error(`${expectedId} 未被置为 active（实际：${node?.status ?? '缺失'}）`);
  console.log(`✓ 断言：第 ${open.number} 轮选中 ${expectedId} 且状态为 active`);
}

try {
  if (!existsSync(cli)) throw new Error(`未找到 dashboard CLI：${cli}`);

  // 1. 幂等起点：清空旧记录，重复运行不报错。
  rmSync(join(demoDir, '.ctbz-record'), { recursive: true, force: true });
  console.log('✓ 清理旧记录 .ctbz-record（幂等）');

  payloadDir = mkdtempSync(join(tmpdir(), 'ctbz-demo-payload-'));

  // 2. 初始化 loop 模式项目。
  run('init 项目「示例：电商风控策略上线」', [cli, 'init', '--workspace', demoDir, '--title', '示例：电商风控策略上线', '--goal', '上线反欺诈策略', '--mode', 'loop']);

  // 3. 顶层分组。
  apply('node.upsert plan（group）', 'node.upsert', {
    node: { id: 'plan', parentId: null, kind: 'group', title: '策略上线', status: 'active' },
  });

  // 4. 8 个任务：d1/d2 已完成为已完成态（completed 需带 result + evidence），d7 受阻，其余 planned。
  apply('node.upsert d1 数据准备（completed）', 'node.upsert', {
    node: {
      id: 'd1', parentId: 'plan', kind: 'task', title: '数据准备', status: 'completed', score: 60, scoreReason: '前置', dependsOn: [],
      result: '完成底层数据接入与清洗', evidence: ['数据质量抽查通过'],
    },
  });
  apply('node.upsert d2 特征衍生（completed）', 'node.upsert', {
    node: {
      id: 'd2', parentId: 'plan', kind: 'task', title: '特征衍生', status: 'completed', score: 70, dependsOn: [],
      result: '生成风控特征宽表', evidence: ['特征覆盖率报告'],
    },
  });
  apply('node.upsert d3 规则引擎（planned）', 'node.upsert', {
    node: { id: 'd3', parentId: 'plan', kind: 'task', title: '规则引擎', status: 'planned', dependsOn: ['d1', 'd2'], score: 80, scoreReason: '依赖已就绪，最高优先级' },
  });
  apply('node.upsert d4 离线回测（planned）', 'node.upsert', {
    node: { id: 'd4', parentId: 'plan', kind: 'task', title: '离线回测', status: 'planned', dependsOn: ['d3'], score: 75 },
  });
  apply('node.upsert d5 AB实验（planned）', 'node.upsert', {
    node: { id: 'd5', parentId: 'plan', kind: 'task', title: 'AB实验', status: 'planned', dependsOn: ['d4'], score: 70 },
  });
  apply('node.upsert d6 灰度放量（planned）', 'node.upsert', {
    node: { id: 'd6', parentId: 'plan', kind: 'task', title: '灰度放量', status: 'planned', dependsOn: ['d5'], score: 65 },
  });
  apply('node.upsert d7 监控告警（blocked）', 'node.upsert', {
    node: { id: 'd7', parentId: 'plan', kind: 'task', title: '监控告警', status: 'blocked', dependsOn: [], description: '等待风控平台埋点权限', score: 50 },
  });
  apply('node.upsert d8 全量上线（planned）', 'node.upsert', {
    node: { id: 'd8', parentId: 'plan', kind: 'task', title: '全量上线', status: 'planned', dependsOn: ['d6', 'd7'], score: 60 },
  });

  // 5. 第一轮：round.start 自动选中并激活 d3（不手工置 active）。
  apply('round.start 第 1 轮', 'round.start', {});
  assertSelected('d3');
  apply('node.upsert d3 → completed', 'node.upsert', {
    node: { id: 'd3', status: 'completed', result: '规则引擎开发完成并通过单测', evidence: ['单测全绿'] },
  });
  apply('round.finish 第 1 轮', 'round.finish', {
    summary: '完成规则引擎开发与联调',
    method: '规则 DSL 编排 + 单元测试回归',
    pitfalls: '规则优先级冲突需人工复核',
    conclusion: '规则引擎具备离线回测条件',
    nextSteps: '启动离线回测',
  });

  // 6. 第二轮：round.start 自动选中并激活 d4。
  apply('round.start 第 2 轮', 'round.start', {});
  assertSelected('d4');
  apply('node.upsert d4 → completed', 'node.upsert', {
    node: { id: 'd4', status: 'completed', result: '离线回测指标达标', evidence: ['回测报告'] },
  });
  apply('round.finish 第 2 轮', 'round.finish', {
    summary: '完成离线回测与指标核对',
    method: '历史样本回放 + 指标对比',
    pitfalls: '样本时间窗偏差需在结论中说明',
    conclusion: '策略指标达标，可进入实验阶段',
    nextSteps: '设计 AB 实验流量切分',
  });

  // 7. 待决问题。
  apply('question.upsert q1', 'question.upsert', {
    question: {
      id: 'q1', title: 'AB 实验流量切分比例', context: '首轮放量按 5% 还是 10% 起步',
      options: [
        { id: 'o1', label: '5% 灰度', reason: '风险低，观察周期短' },
        { id: 'o2', label: '10% 灰度', reason: '样本积累快' },
      ],
      recommendedOptionId: 'o1',
    },
  });

  console.log(`\n✓ 演示数据就绪：${recordPath}`);
  console.log(`下一步：node skills/ctbz/scripts/dashboard serve --workspace "${demoDir}" --port 18999`);
} catch (error) {
  console.error(`\n✗ 演示失败：${error.message}`);
  process.exitCode = 1;
} finally {
  if (payloadDir) rmSync(payloadDir, { recursive: true, force: true });
}
