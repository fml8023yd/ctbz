/* CTBZ 看板图表纯函数：classic script，零 import/export、零 DOM 依赖，供浏览器与 node 测试双用。 */
(function (root) {
  function ganttDomain(nodes) {
    const at = (n) => Date.parse(n.createdAt);
    const ts = nodes.filter((n) => !n.archived).flatMap((n) => [Date.parse(n.createdAt), Date.parse(n.updatedAt)]).filter((t) => !Number.isNaN(t));
    if (!ts.length) return { t0: 0, t1: 86400000, empty: true };
    let t0 = Math.min(...ts), t1 = Math.max(...ts);
    if (t1 - t0 < 86400000) { t0 -= 43200000; t1 += 43200000; }
    return { t0, t1, empty: false };
  }
  function ganttRows(nodes, domain) {
    const { t0, t1 } = domain;
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return [];      // 域非法直接空返回，防 NaN
    const span = t1 - t0, W = 960, padL = 160, padR = 40;
    const x = (t) => padL + (t - t0) / span * (W - padL - padR);
    return nodes.filter((n) => !n.archived).map((n, i) => {
      const a = Date.parse(n.createdAt), b = Date.parse(n.updatedAt);
      const ok = (t) => Number.isFinite(t);
      const ea = ok(a) ? a : t0, eb = ok(b) ? b : (ok(a) ? a : t0);               // 无效时间戳回落，不产生 NaN
      const left = x(ea), right = x(eb);
      return { id: n.id, title: n.title, status: n.status, y: i * 30, x: left, width: Math.max(6, right - left), start: n.createdAt, end: n.updatedAt, invalidTime: !ok(a) || !ok(b) };
    });
  }
  function depsLayers(nodes) {
    const ids = new Set(nodes.map((n) => n.id));
    const deps = new Map(nodes.map((n) => [n.id, (n.dependsOn || []).filter((d) => ids.has(d))]));
    const dependents = new Map(nodes.map((n) => [n.id, []]));
    for (const n of nodes) for (const d of deps.get(n.id)) dependents.get(d).push(n.id);
    const layer = new Map(), invalid = [];
    const remaining = new Map(nodes.map((n) => [n.id, deps.get(n.id).length]));   // Kahn 入度计数
    let frontier = nodes.filter((n) => remaining.get(n.id) === 0).map((n) => n.id);
    let depth = 0;
    while (frontier.length) {                          // 两阶段：先分层本层，再递减后继入度
      for (const id of frontier) layer.set(id, depth);
      const next = [];
      for (const id of frontier) for (const dn of dependents.get(id)) {
        if (layer.has(dn)) continue;
        remaining.set(dn, remaining.get(dn) - 1);
        if (remaining.get(dn) === 0) next.push(dn);    // 仅当全部依赖已分层才入队 → 链式保序
      }
      frontier = next; depth++;
    }
    for (const n of nodes) if (!layer.has(n.id)) { invalid.push(n.id); layer.set(n.id, depth); }  // 环内节点统一落 depth 层（非 depth+1）
    return { layer, depth, invalid };
  }
  function depsEdges(nodes) {
    const ids = new Set(nodes.map((n) => n.id));
    return nodes.flatMap((n) => (n.dependsOn || []).filter((d) => ids.has(d)).map((d) => ({ from: d, to: n.id })));
  }
  function milestoneItems(board) {
    const at = (v) => (v ? Date.parse(v) : null);
    const items = [];
    if (board.project && board.project.createdAt) items.push({ at: board.project.createdAt, label: '项目建立', kind: 'project' });
    for (const r of board.rounds || []) {
      if (r.startedAt) items.push({ at: r.startedAt, label: `第 ${r.number} 轮开始`, kind: 'round' });
      if (r.finishedAt) items.push({ at: r.finishedAt, label: `第 ${r.number} 轮收尾`, kind: 'round' });  // 进行中轮 finishedAt=null，此处自然跳过
    }
    for (const n of board.nodes || []) if (n.status === 'completed' && n.kind !== 'group' && n.updatedAt) items.push({ at: n.updatedAt, label: `✓ ${n.title}`, kind: 'node' });
    return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }
  root.CTBZGraphMath = { ganttDomain, ganttRows, depsLayers, depsEdges, milestoneItems };
})(typeof window !== 'undefined' ? window : globalThis);
