/* global d3, lucide */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const labels = {
    normal:'常规开发', loop:'循环研究', discussion:'讨论', planning:'规划', execution:'执行', review:'验收', complete:'收尾',
    active:'进行中', paused:'已暂停', stopped:'已停止', blocked:'受阻', completed:'已完成', planned:'待开展', cancelled:'已取消',
    pending:'等待接收', received:'已收到，处理中', failed:'处理失败', withdrawn:'已撤回', void:'已作废', adopted:'已纳入执行', 'needs-clarification':'需要澄清', cancel:'取消任务', reopen:'重开任务', correct:'修订结果',
    group:'任务组', task:'任务', experiment:'研究方向', unknown:'未定', supported:'有效', rejected:'无效', inconclusive:'证据不足',
    open:'待决定', resolved:'已决定', confirmed:'用户确认', experience:'AI 经验', superseded:'已替代', low:'低', medium:'中', high:'高',
    pause:'暂停', resume:'继续', stop:'停止', next:'下一轮', user:'用户', agent:'主会话',
    researcher:'狗头军师', implementer:'纯牛马', reviewer:'挑刺的', tester:'验货的', planner:'计划员', explorer:'放哨的', debugger:'改bug的', reporter:'报信的'
  };
  const navItems = [['overview','总览','layout-dashboard'],['tasks','任务与研究','git-fork'],['rounds','轮次记录','history'],['results','成果','table-2'],['knowledge','知识','book-open'],['reports','汇报','chart-no-axes-combined']];
  const state = {
    projects:[], board:null, projectId:'', view:'overview', taskView:'tree', query:'', statusFilter:'all', showArchived:false,
    knowledgeTier:'confirmed', knowledgeQuery:'', knowledgeHistory:false, audience:'owner', selectedNode:null,
    selectedRound:null, collapsed:new Set(), collapsedProject:null, transform:null, graphBounds:null, readOnly:false, error:'', loading:false,
    token:sessionStorage.getItem('ctbz-token') || '', authNeeded:false, busy:false, graphMovedAt:0, projectRequest:0,
    editContext:null, toastTimer:null, poll:null, fullBoard:null, scopeId:'*', artifacts:[], artifact:null, artifactId:null, artifactQuery:'', artifactSort:null, artifactPage:0, artifactLoading:false, artifactError:'', selectedRoundScope:null
  };
  const formattedDate = (value, full = false) => {
    if (!value) return '未记录';
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return String(value);
    return new Intl.DateTimeFormat('zh-CN', full ? {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'} : {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date);
  };
  const label = value => labels[value] || value || '未记录';
  const badge = value => `<span class="status-badge ${escape(value)}">${escape(label(value))}</span>`;
  const disabled = () => state.readOnly || state.busy ? ' disabled' : '';
  const currentProject = () => state.board?.project || {};
  const currentNodes = () => state.board?.nodes || [];
  const getNode = id => (state.fullBoard?.nodes || currentNodes()).find(node => node.id === id);
  const nodeName = id => getNode(id)?.title || id || '未指定';
  const textLines = value => String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const optionTags = (values, selected, empty) => `${empty !== undefined ? `<option value="">${escape(empty)}</option>` : ''}${values.map(value => `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(label(value))}</option>`).join('')}`;
  const newId = prefix => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  const roundNumber = () => state.selectedRound === null ? (currentProject().round || 0) : Number(state.selectedRound);
  const ranking = () => (state.board?.ranking || []).map(item => ({...getNode(item.id || item.nodeId || item.node?.id), ...item.node, ...item}));
  const pendingRequest = () => (state.board?.requests || []).find(request => ['pending','received'].includes(request.status));
  const pendingControl = () => Boolean(pendingRequest());
  const executionFields = ['status','result','evidence','model','owner','outcome','method','pitfalls','nextSteps'];
  const scopeTitle = id => state.fullBoard?.scopes?.find(scope => scope.id === (id ?? null))?.title || '默认任务';
  const scopeValue = () => state.scopeId === '*' ? null : state.scopeId;
  const roundTitle = round => round.nodeSnapshot?.title || (round.snapshotAvailable ? '未指定方向' : `${round.nodeId || '未指定方向'}（历史快照不可用）`);

  function selectScope(id) {
    state.scopeId = id === '*' ? '*' : id || null;
    state.selectedNode = null; state.selectedRound = null; state.selectedRoundScope = null; state.transform = null;
    state.query = ''; state.statusFilter = 'all'; state.artifactId = null; state.artifact = null;
    $('#detail-dialog').close(); $('#edit-dialog').close(); state.editContext = null;
    selectBoard(state.fullBoard); render(); rememberView();
    if (state.view === 'results') loadArtifacts(true);
  }

  function nodeScope(id, board = state.fullBoard) {
    const byId = new Map((board?.nodes || []).map(node => [node.id,node]));
    let node = byId.get(id);
    while (node) { if (node.work) return node.id; node = byId.get(node.parentId); }
    return null;
  }

  function selectBoard(board) {
    state.fullBoard = board;
    if (state.scopeId && state.scopeId !== '*' && !board.nodes.some(node => node.id === state.scopeId && node.work)) state.scopeId = null;
    const selected = board.scopes?.find(scope => scope.id === state.scopeId);
    const nodes = state.scopeId === '*' ? board.nodes : board.nodes.filter(node => nodeScope(node.id,board) === state.scopeId);
    const requests = (board.requests || []).filter(request => state.scopeId === '*' || (request.scopeId ?? null) === state.scopeId);
    const pending = requests.find(request => ['pending','received'].includes(request.status));
    const project = {...board.project, ...(selected || {}), id:board.project.id, title:selected?.title || board.project.title, control:{requestedAction:pending?.action || null,requestedAt:pending?.createdAt || null,acknowledgedAt:null}};
    const ids = new Set(nodes.map(node => node.id));
    const queue = board.ranking.filter(node => ids.has(node.id)).map(node => ({...node}));
    const ready = queue.filter(node => node.eligible), sum = ready.reduce((value,node) => value + node.score,0);
    for (const node of ready) node.share = sum ? node.score / sum * 100 : 100 / ready.length;
    const parents = new Set(nodes.map(node => node.parentId));
    const leaves = nodes.filter(node => node.kind !== 'group' && !node.archived && node.status !== 'cancelled' && !parents.has(node.id));
    const counts = status => leaves.filter(node => node.status === status).length;
    state.board = {...board,project,nodes,requests,ranking:queue,
      rounds:board.rounds.filter(round => state.scopeId === '*' || (round.scopeId ?? null) === state.scopeId),
      questions:board.questions.filter(question => state.scopeId === '*' || (question.scopeId ?? null) === state.scopeId),
      events:board.events.filter(event => state.scopeId === '*' || (event.data?.scopeId ?? null) === state.scopeId),
      stats:{total:leaves.length,completed:counts('completed'),active:counts('active'),blocked:counts('blocked'),planned:counts('planned'),progress:leaves.length ? counts('completed') / leaves.length * 100 : 0}};
  }

  function eventSummary(event) {
    const data = event.data || {};
    const names = {'project.init':'建立项目','project.update':'更新项目','node.upsert':'更新节点','question.upsert':'记录待决事项','question.resolve':'确认决定','knowledge.upsert':'记录经验','knowledge.confirm':'用户确认知识','knowledge.reject':'停用知识','round.start':'开始研究轮次','round.finish':'轮次收尾','heartbeat':'主会话检查点','task.sync':'同步任务'};
    if (event.type === 'control.request') return `请求${label(data.action)}`;
    if (event.type === 'control.ack') return `主会话已处理：${data.message || label(data.status)}`;
    if (event.type === 'note.add') return event.summary;
    const title = data.node?.title || data.entry?.title || data.question?.title || data.title || (data.nodeId ? nodeName(data.nodeId) : '') || data.summary || '';
    return names[event.type] ? `${names[event.type]}${title ? `：${title}` : ''}` : event.summary || event.type;
  }

  function refreshIcons() {
    if (window.lucide) lucide.createIcons({attrs:{'stroke-width':1.7}});
  }

  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { element.hidden = true; }, 4200);
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers);
    if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
    const response = await fetch(path, {...options, headers, cache:'no-store'});
    if (response.status === 401) {
      state.authNeeded = true;
      if (!$('#auth-dialog').open) $('#auth-dialog').showModal();
    }
    if (!response.ok) {
      let body;
      try { body = await response.json(); } catch { body = {}; }
      const error = new Error(body.error || `请求未完成（${response.status}）`);
      error.status = response.status;
      error.code = body.code;
      error.committed = body.committed === true;
      throw error;
    }
    state.authNeeded = false;
    return options.raw ? response : response.json();
  }

  function rememberView() {
    const params = new URLSearchParams({project:state.projectId, view:state.view});
    params.set('scope',state.scopeId ?? '');
    history.replaceState(null, '', `#${params.toString()}`);
    localStorage.setItem('ctbz-view', JSON.stringify({projectId:state.projectId,view:state.view,taskView:state.taskView,audience:state.audience}));
  }

  function restoreView() {
    try {
      const saved = JSON.parse(localStorage.getItem('ctbz-view') || '{}');
      for (const key of ['projectId','view','taskView','audience']) if (saved[key]) state[key] = saved[key];
      const params = new URLSearchParams(location.hash.slice(1));
      state.projectId = params.get('project') || state.projectId;
      state.view = params.get('view') || state.view;
      state.scopeId = params.has('scope') ? params.get('scope') || null : '*';
    } catch { /* A blocked storage area does not prevent browsing. */ }
    if (!navItems.some(([view]) => view === state.view)) state.view = 'overview';
    if (!['tree','table'].includes(state.taskView)) state.taskView = 'tree';
    if (!['owner','leader'].includes(state.audience)) state.audience = 'owner';
  }

  async function loadProjects() {
    const result = await api('/api/projects');
    state.projects = result.projects || [];
    state.readOnly = Boolean(result.readOnly);
    const select = $('#project-select');
    select.innerHTML = state.projects.length ? state.projects.map(project => `<option value="${escape(project.id)}">${project.isExample ? '[示例] ' : ''}${escape(project.title)}</option>`).join('') : '<option value="">没有项目</option>';
    if (!state.projects.some(project => project.id === state.projectId)) state.projectId = state.projects[0]?.id || '';
    select.value = state.projectId;
  }

  async function loadBoard({force = false} = {}) {
    if (!state.projectId) {
      render();
      return;
    }
    const projectId = state.projectId;
    const request = ++state.projectRequest;
    try {
      const board = await api(`/api/projects/${encodeURIComponent(projectId)}`);
      if (projectId !== state.projectId || request !== state.projectRequest || (state.board?.project.id === projectId && board.revision < state.board.revision)) return;
      const changed = force || !state.board || board.revision !== state.board.revision;
      const oldNode = state.selectedNode && getNode(state.selectedNode);
      selectBoard(board);
      if (state.collapsedProject !== projectId) {
        state.collapsed = new Set(board.nodes.filter(node => node.kind !== 'group' && board.nodes.some(child => child.parentId === node.id)).map(node => node.id));
        state.collapsedProject = projectId;
      }
      state.readOnly = Boolean(board.server?.readOnly);
      state.error = '';
      state.loading = false;
      if (changed) render();
      else renderBanner();
      if (changed && $('#detail-dialog').open && state.selectedNode && JSON.stringify(oldNode) !== JSON.stringify(getNode(state.selectedNode))) {
        const panel = $('#detail-dialog'), scroll = panel.scrollTop;
        const focusedAction = document.activeElement?.dataset.action;
        renderDetail(); panel.scrollTop = scroll;
        if (focusedAction) [...panel.querySelectorAll('[data-action]')].find(button => button.dataset.action === focusedAction)?.focus({preventScroll:true});
      }
      if (state.view === 'results') loadArtifacts();
    } catch (error) {
      if (request !== state.projectRequest) return;
      state.loading = false;
      state.error = error.message;
      if (!state.board) render();
      else renderBanner();
    }
  }

  async function start() {
    restoreView();
    renderNavigation();
    try {
      await loadProjects();
      await loadBoard({force:true});
      rememberView();
    } catch (error) {
      state.error = error.message;
      render();
    }
    state.poll = setInterval(() => {
      if (!document.hidden && !state.authNeeded && !state.busy) loadBoard();
    }, 3000);
  }

  function renderNavigation() {
    $('#navigation').innerHTML = navItems.map(([view,title,symbol]) => {
      const count = view === 'knowledge' ? state.board?.knowledge?.filter(entry => entry.status === 'active').length : view === 'rounds' ? state.board?.rounds?.length : null;
      return `<a href="#${view}" data-action="navigate" data-view="${view}" class="nav-link${state.view === view ? ' active' : ''}"${state.view === view ? ' aria-current="page"' : ''}>${icon(symbol)}<span>${title}</span>${count ? `<span class="nav-count number">${count}</span>` : ''}</a>`;
    }).join('');
  }

  function renderHeader() {
    if (!state.board) {
      $('#project-header').innerHTML = '<div class="header-title"><h1>项目工作台</h1></div>';
      return;
    }
    const project = currentProject();
    const request = project.control;
    const pending = pendingControl();
    const heartbeat = project.lastHeartbeat;
    const heartbeatAge = heartbeat ? Date.now() - new Date(heartbeat).valueOf() : Infinity;
    const heartbeatLabel = !heartbeat ? '主会话未报到' : heartbeatAge > 120000 ? `上次报到 ${formattedDate(heartbeat)}` : `主会话报到 ${formattedDate(heartbeat)}`;
    $('#project-header').innerHTML = `<div class="header-title"><div class="project-heading"><h1>${escape(project.title || '未命名项目')}</h1>${project.isExample ? '<span class="example-badge">示例</span>' : ''}</div><div class="header-meta"><span>${escape(label(project.mode))}</span><span class="separator"></span>${badge(project.status)}<span class="separator"></span><span>更新 ${escape(formattedDate(project.updatedAt))}</span><span class="separator"></span><span>${escape(heartbeatLabel)}</span></div></div>
      <div class="header-actions">${pending ? `<span class="status-badge pending">待确认：${escape(label(request.requestedAction))}</span>` : ''}
      ${project.mode === 'loop' ? `<button class="button" data-action="control" data-control="next"${disabled()}${pending ? ' disabled' : ''}>${icon('step-forward')}请求下一轮</button>` : ''}
      <button class="button" data-action="control" data-control="${project.status === 'paused' ? 'resume' : 'pause'}"${disabled()}${pending || project.status === 'completed' ? ' disabled' : ''}>${icon(project.status === 'paused' ? 'play' : 'pause')}${project.status === 'paused' ? '请求继续' : '请求暂停'}</button>
      <button class="icon-button bordered" data-action="project-edit" title="项目设置" aria-label="项目设置"${disabled()}>${icon('settings-2')}</button></div>`;
    document.title = `${project.title} · 草台班子`;
    const scopes = state.fullBoard.scopes || [{id:null,title:state.fullBoard.project.title}];
    const scope = scopes.find(item => item.id === state.scopeId);
    const current = pendingRequest();
    $('#project-header').insertAdjacentHTML('beforeend',`<div class="scope-strip"><label class="scope-label">工作范围<select id="scope-select" aria-label="工作范围"><option value="*"${state.scopeId === '*' ? ' selected' : ''}>项目全景</option>${scopes.map(item => `<option value="${escape(item.id || '')}"${state.scopeId === item.id ? ' selected' : ''}>${escape(item.id ? item.title : '默认任务')}</option>`).join('')}</select></label><button class="icon-button bordered" data-action="work-add" title="新增独立任务" aria-label="新增独立任务"${disabled()}>${icon('plus')}</button><div class="scope-facts"><span>负责会话：${escape(scope?.owner?.sessionId || '未登记')}</span><span>检查点：${escape(formattedDate(scope?.checkpoint?.at,true))}</span>${scope && scope.planRevision > (scope.checkpoint?.seenPlanRevision ?? 0) ? '<span class="status-badge pending">计划变更待主进程采用</span>' : scope?.checkpoint ? badge(scope.checkpoint.decisionStatus || 'adopted') : ''}${current ? `<span>${escape(label(current.status))}</span>${current.status === 'pending' ? `<button class="text-button" data-action="request-withdraw" data-id="${escape(current.id)}"${disabled()}>撤回请求</button>` : ''}` : ''}</div></div>`);
    if (['paused','stopped'].includes(project.status)) {
      const button = $('[data-action=control][data-control=pause]',$('#project-header'));
      if (button) {button.dataset.control = 'resume';button.innerHTML = `${icon('play')}请求继续`;}
    }
    if (state.scopeId === '*') $('#project-header').querySelectorAll('[data-action=control],[data-action=project-edit]').forEach(button => {button.disabled = true;button.title = '请先选择具体任务';});
  }

  function renderBanner() {
    const banner = $('#system-banner');
    const connection = $('#connection-state');
    connection.innerHTML = `<span class="connection-dot${state.error ? ' offline' : ''}"></span>${state.error ? '连接中断' : state.readOnly ? '只读连接' : '本地记录已连接'}`;
    if (state.error) {
      banner.className = 'system-banner error';
      banner.innerHTML = `${icon('wifi-off')}<span>读取失败：${escape(state.error)}${state.board ? '。当前显示最后一次读取的记录。' : ''}</span><button class="text-button" data-action="refresh">重试</button>`;
      banner.hidden = false;
    } else if (state.readOnly) {
      banner.className = 'system-banner';
      banner.innerHTML = `${icon('lock-keyhole')}<span>只读访问</span>`;
      banner.hidden = false;
    } else if (pendingControl()) {
      banner.className = 'system-banner';
      const request = pendingRequest();
      banner.innerHTML = `${icon('clock-3')}<span>${escape(label(request.action))}：${request.status === 'pending' ? '等待主进程检查点接收' : '主进程已收到，实际执行尚未确认'}。${escape(request.message || '')}</span>`;
      banner.hidden = false;
    } else {
      banner.hidden = true;
      banner.innerHTML = '';
    }
    refreshIcons();
  }

  function render() {
    const focused = document.activeElement;
    const focusId = focused?.id;
    const focusAction = focused?.dataset.action;
    const focusData = focused ? JSON.stringify({...focused.dataset}) : null;
    const selection = focused?.selectionStart !== undefined ? [focused.selectionStart, focused.selectionEnd] : null;
    const scroll = window.scrollY;
    renderNavigation();
    renderHeader();
    renderBanner();
    if (!state.board) {
      $('#content').innerHTML = emptyState(state.error ? '项目记录暂时无法读取' : '尚无项目记录', state.error ? 'cloud-off' : 'folder-open', state.error ? '<button class="button" data-action="refresh">重新连接</button>' : '');
      refreshIcons();
      return;
    }
    const views = {overview:renderOverview,tasks:renderTasks,rounds:renderRounds,results:renderResults,knowledge:renderKnowledge,reports:renderReports};
    $('#content').innerHTML = views[state.view]();
    if (state.view === 'overview') {
      $('#content').insertAdjacentHTML('afterbegin',renderExecutionContext());
      const closed = state.board.questions.filter(question => question.status === 'void');
      if (closed.length) $('#content').insertAdjacentHTML('beforeend',`<section class="section-rule"><details><summary class="details-summary">已作废问题（${closed.length}）</summary>${closed.map(questionMarkup).join('')}</details></section>`);
    }
    if (state.view === 'reports') {
      const decisions = state.board.questions.filter(question => question.status === 'resolved');
      if (decisions.length) $('.report-document').insertAdjacentHTML('beforeend',`<section class="report-section"><h3>已确认决定</h3><div class="table-scroll"><table class="data-table"><thead><tr><th>问题</th><th>决定</th><th>依据</th><th>确认时间</th></tr></thead><tbody>${decisions.map(question => {const selected = question.options.find(option => option.id === question.selectedOptionId);return `<tr><td>${escape(question.title)}</td><td>${escape(selected?.label || '')}${question.answer ? `<span class="cell-note">${escape(question.answer)}</span>` : ''}</td><td>${escape(selected?.reason || question.context)}</td><td>${escape(formattedDate(question.updatedAt))}</td></tr>`;}).join('')}</tbody></table></div></section>`);
      $('.report-document').insertAdjacentHTML('beforeend',`<section class="report-section"><h3>已登记成果</h3><button class="text-button" data-action="navigate" data-view="results">查看结果表与文件 ${icon('arrow-up-right')}</button></section>`);
      const roundSection = [...$('.report-document').querySelectorAll('.report-section')].find(section => $('h3',section)?.textContent === '逐轮结论');
      if (roundSection) [...roundSection.querySelectorAll('tbody tr')].forEach((row,index) => {row.children[1].textContent = roundTitle(state.board.rounds[index]);});
    }
    if (state.scopeId === '*') $('#tree-round')?.remove();
    if (state.view === 'knowledge') document.querySelectorAll('.knowledge-item').forEach(element => {
      const id = $('[data-action=knowledge-edit]',element)?.dataset.id;
      const entry = state.board.knowledge.find(item => item.id === id);
      if (entry?.supersedesId) $('.knowledge-meta',element).insertAdjacentHTML('beforeend',`<div>替代版本：${escape(state.board.knowledge.find(item => item.id === entry.supersedesId)?.title || entry.supersedesId)}</div>`);
    });
    const rankNote = $('.rank-note');
    if (rankNote && !ranking().some(node => node.eligible)) rankNote.textContent = '';
    if (state.view === 'tasks' && state.taskView === 'tree') renderTree();
    $('#content').querySelectorAll('.table-scroll').forEach(element => {element.tabIndex = 0; element.setAttribute('role','region'); element.setAttribute('aria-label',state.view === 'results' ? '成果表格' : '记录表格');});
    refreshIcons();
    if (focusId && !$('#edit-dialog').open && !$('#auth-dialog').open) {
      const replacement = document.getElementById(focusId);
      if (replacement) {
        replacement.focus({preventScroll:true});
        if (selection && typeof replacement.setSelectionRange === 'function') replacement.setSelectionRange(...selection);
      }
    } else if (focusAction && !$('#edit-dialog').open && !$('#detail-dialog').open && !$('#auth-dialog').open) {
      [...document.querySelectorAll('[data-action]')].find(element => JSON.stringify({...element.dataset}) === focusData)?.focus({preventScroll:true});
    }
    window.scrollTo({top:scroll,behavior:'instant'});
  }

  function emptyState(title, symbol = 'inbox', action = '', compact = false) {
    return `<div class="empty-state${compact ? ' compact' : ''}">${icon(symbol)}<h3>${escape(title)}</h3>${action}</div>`;
  }

  function renderExecutionContext() {
    const scopes = state.fullBoard.scopes || [];
    if (state.scopeId === '*') return `<section class="work-summary"><div class="section-heading"><h3>独立任务</h3><button class="text-button" data-action="work-add"${disabled()}>${icon('plus')}新增</button></div><div class="table-scroll"><table class="data-table"><thead><tr><th>任务</th><th>状态</th><th>负责会话</th><th>最近检查点</th><th>计划采用</th></tr></thead><tbody>${scopes.map(scope => `<tr><td><button class="table-title" data-action="scope-open" data-id="${escape(scope.id || '')}">${escape(scope.title || '默认任务')}</button></td><td>${badge(scope.status)}</td><td>${escape(scope.owner?.sessionId || '未登记')}</td><td>${escape(formattedDate(scope.checkpoint?.at))}</td><td>${scope.planRevision > (scope.checkpoint?.seenPlanRevision ?? 0) ? '待采用' : escape(label(scope.checkpoint?.decisionStatus || 'unknown'))}</td></tr>`).join('')}</tbody></table></div></section>`;
    const scope = scopes.find(item => item.id === state.scopeId);
    const changes = scope?.changes || [];
    const requests = [...(state.board.requests || [])].reverse().slice(0,8);
    return `${changes.length ? `<section class="work-summary"><div class="section-heading"><h3>等待主进程采用的变更</h3></div><ul class="change-list">${changes.slice(-8).map(change => `<li>${escape(change.summary)}<time>${escape(formattedDate(change.at))}</time></li>`).join('')}</ul></section>` : ''}${requests.length ? `<section class="work-summary"><div class="section-heading"><h3>操作回执</h3></div><div class="table-scroll"><table class="data-table"><thead><tr><th>请求</th><th>状态</th><th>执行反馈</th><th>提交时间</th></tr></thead><tbody>${requests.map(request => `<tr><td>${escape(label(request.action))}${request.nodeId ? `<span class="cell-note">${escape(nodeName(request.nodeId))}</span>` : ''}</td><td>${badge(request.status)}</td><td>${escape(request.message || (request.status === 'pending' ? '等待主进程检查点' : '尚无执行反馈'))}</td><td>${escape(formattedDate(request.createdAt))}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  }

  async function loadArtifacts(force = false) {
    if (!state.projectId) return;
    if (state.artifactLoading) {if (force) state.artifactReload = true;return;}
    state.artifactLoading = true;
    const projectId = state.projectId;
    try {
      const {artifacts} = await api(`/api/projects/${encodeURIComponent(projectId)}/artifacts`);
      if (projectId !== state.projectId) return;
      let changed = JSON.stringify(artifacts) !== JSON.stringify(state.artifacts) || force || Boolean(state.artifactError);
      state.artifacts = artifacts;
      const eligible = artifacts.filter(item => state.scopeId === '*' || (item.scopeId ?? null) === state.scopeId);
      if (!eligible.some(item => item.id === state.artifactId)) {state.artifactId = eligible[0]?.id || null;state.artifact = null;}
      if (state.artifactId && state.artifact?.id !== state.artifactId) {
        const requested = state.artifactId;
        const artifact = await api(`/api/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(requested)}`);
        if (projectId !== state.projectId || requested !== state.artifactId) return;
        state.artifact = artifact; state.artifactPage = 0;
        changed = true;
      }
      state.artifactError = '';
      if ((changed || force) && state.view === 'results') render();
    } catch (error) {if (projectId === state.projectId) {state.artifactError = error.message;if (state.view === 'results') render();}}
    finally {
      state.artifactLoading = false;
      if (state.artifactReload) {state.artifactReload = false;void loadArtifacts(true);}
    }
  }

  function renderResults() {
    const artifacts = state.artifacts.filter(item => state.scopeId === '*' || (item.scopeId ?? null) === state.scopeId);
    const artifact = artifacts.find(item => item.id === state.artifactId) && state.artifact;
    const heading = `<div class="view-heading"><h2>成果与结果表</h2><button class="icon-button bordered" data-action="artifacts-refresh" title="刷新成果" aria-label="刷新成果">${icon('refresh-cw')}</button></div>`;
    if (state.artifactError) return heading + `<div class="form-error">${escape(state.artifactError)}</div>`;
    if (!artifacts.length) return heading + emptyState('尚无已登记成果','table-2');
    const selector = `<div class="toolbar"><label class="artifact-selector">成果版本<select id="artifact-select" aria-label="成果版本">${artifacts.map(item => `<option value="${escape(item.id)}"${item.id === state.artifactId ? ' selected' : ''}>${escape(item.title)} · ${escape(item.version)}</option>`).join('')}</select></label>${artifact ? `<div class="button-row"><button class="button" data-action="artifact-download">${icon('download')}下载${artifact.format === 'table' ? ' JSON' : '文件'}</button>${artifact.table ? `<button class="icon-button bordered" data-action="artifact-download" data-format="csv" title="下载 CSV 表格" aria-label="下载 CSV 表格">${icon('file-spreadsheet')}</button>` : ''}</div>` : ''}</div>`;
    if (!artifact) return heading + selector + emptyState('正在读取成果','loader-circle');
    const metadata = `<div class="result-meta"><h3>${escape(artifact.title)}</h3><dl class="detail-grid">${field('版本',artifact.version)}${field('登记时间',formattedDate(artifact.createdAt,true))}${field('来源',artifact.source,true)}${field('统计口径',artifact.methodology || '随文件提供',true)}${artifact.baseline ? field('比较基准',artifact.baseline,true) : ''}${artifact.nodeId ? field('关联任务',nodeName(artifact.nodeId)) : ''}${field('所属轮次',artifact.round === null ? '未指定' : String(artifact.round))}</dl></div>`;
    if (!artifact.table) return heading + selector + metadata + `<p class="file-summary">${escape(artifact.filename)} · ${(artifact.bytes / 1024).toFixed(1)} KiB</p>`;
    const {columns,rows} = artifact.table;
    const query = state.artifactQuery.toLocaleLowerCase();
    const filtered = rows.filter(row => !query || columns.some(column => String(row[column.key] ?? '').toLocaleLowerCase().includes(query)));
    if (state.artifactSort) {
      const {key,descending} = state.artifactSort;
      filtered.sort((left,right) => {
        const a=left[key] ?? null, b=right[key] ?? null;
        if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
        const order = typeof a === 'number' && typeof b === 'number' ? a-b : String(a).localeCompare(String(b),'zh-CN',{numeric:true});
        return descending ? -order : order;
      });
    }
    const pages = Math.max(1,Math.ceil(filtered.length / 100));
    state.artifactPage = Math.min(state.artifactPage,pages-1);
    return heading + selector + metadata + `<div class="toolbar result-toolbar"><label class="search-field">${icon('search')}<input id="artifact-search" aria-label="筛选结果" placeholder="筛选结果" value="${escape(state.artifactQuery)}"></label><span class="count-label">${filtered.length} / ${rows.length} 行</span><div class="button-row"><button class="icon-button" data-action="artifact-page" data-step="-1" aria-label="上一页" title="上一页"${state.artifactPage === 0 ? ' disabled' : ''}>${icon('chevron-left')}</button><span class="page-number">${state.artifactPage+1} / ${pages}</span><button class="icon-button" data-action="artifact-page" data-step="1" aria-label="下一页" title="下一页"${state.artifactPage+1 >= pages ? ' disabled' : ''}>${icon('chevron-right')}</button></div></div><div class="table-scroll result-table"><table class="data-table"><thead><tr>${columns.map(column => `<th${column.type === 'number' ? ' class="numeric"' : ''} aria-sort="${state.artifactSort?.key === column.key ? state.artifactSort.descending ? 'descending' : 'ascending' : 'none'}"><button class="column-sort" data-action="artifact-sort" data-key="${escape(column.key)}">${escape(column.label)}${column.unit ? `<small>${escape(column.unit)}</small>` : ''}${icon(state.artifactSort?.key === column.key ? state.artifactSort.descending ? 'arrow-down' : 'arrow-up' : 'arrow-up-down')}</button></th>`).join('')}</tr></thead><tbody>${filtered.slice(state.artifactPage*100,(state.artifactPage+1)*100).map(row => `<tr>${columns.map(column => `<td${column.type === 'number' ? ' class="numeric"' : ''}>${row[column.key] === null ? '<span class="muted">未提供</span>' : escape(String(row[column.key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  async function downloadArtifact(format) {
    if (!state.artifact) return;
    const response = await api(`/api/projects/${encodeURIComponent(state.projectId)}/artifacts/${encodeURIComponent(state.artifactId)}/download${format === 'csv' ? '?format=csv' : ''}`,{raw:true});
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
    link.href = url;link.download = format === 'csv' ? `${state.artifact.id}.csv` : state.artifact.filename;
    document.body.append(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url),1000);
  }

  function taskTable(nodes, {scores = false, compact = false} = {}) {
    if (!nodes.length) return emptyState('暂无匹配任务', 'list-checks', '', true);
    return `<div class="table-scroll"><table class="data-table"><thead><tr><th>任务 / 研究方向</th><th>状态</th>${!compact ? '<th>负责人</th><th>结论</th>' : ''}${scores ? '<th class="numeric">评分</th>' : '<th>最近更新</th>'}</tr></thead><tbody>${nodes.map(node => `<tr${state.selectedNode === node.id ? ' class="selected"' : ''}><td class="title-cell"><button class="table-title" data-action="node-detail" data-id="${escape(node.id)}">${escape(node.title)}</button><span class="cell-note">${escape(node.parentId ? nodeName(node.parentId) : label(node.kind))}${node.archived ? ' · 已归档' : ''}</span></td><td class="nowrap">${badge(node.status)}</td>${!compact ? `<td>${escape(node.owner || '未分配')}${node.model ? `<span class="cell-note">${escape(node.model)}</span>` : ''}</td><td class="nowrap">${escape(label(node.outcome))}</td>` : ''}${scores ? `<td class="numeric">${Number(node.score || 0)}</td>` : `<td class="nowrap muted">${escape(formattedDate(node.updatedAt))}</td>`}</tr>`).join('')}</tbody></table></div>`;
  }

  function questionMarkup(question) {
    const selected = question.options?.find(option => option.id === question.selectedOptionId);
    const recommendation = question.options?.find(option => option.id === question.recommendedOptionId);
    const reason = question.history?.findLast(item => item.type === 'void')?.reason;
    return `<article class="decision-item"><div class="decision-title"><h3>${escape(question.title)}</h3>${badge(question.status)}</div>${question.context ? `<p>${escape(question.context)}</p>` : ''}${question.status === 'resolved' ? `<div class="decision-summary">${selected ? `<strong>${escape(selected.label)}</strong>` : ''}${question.answer ? `<p>${escape(question.answer)}</p>` : ''}</div>` : question.status === 'void' ? `<p class="muted">${escape(reason)}</p>` : `<div class="decision-summary muted">${recommendation ? `建议：${escape(recommendation.label)}` : `${question.options?.length || 0} 个待选方案`}</div>`}<button class="text-button" data-action="question-detail" data-id="${escape(question.id)}">${question.status === 'open' && !state.readOnly ? '查看方案并决定' : '查看记录'} ${icon('arrow-up-right')}</button></article>`;
  }

  function renderOverview() {
    const project = currentProject();
    const stats = state.board.stats || {};
    const openQuestions = state.board.questions.filter(question => question.status === 'open');
    const focusNodes = currentNodes().filter(node => !node.archived && ['active','blocked'].includes(node.status));
    const completed = currentNodes().filter(node => !node.archived && node.kind !== 'group' && node.status === 'completed').sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,5);
    const phases = ['discussion','planning','execution','review','complete'];
    const phaseIndex = phases.indexOf(project.phase);
    const progress = Number(stats.progress || 0);
    const percentage = progress;
    const events = [...state.board.events].reverse().slice(0,8).map(event => ({...event,summary:eventSummary(event)}));
    return `<div class="view-heading"><h2>项目总览</h2><div class="button-row"><button class="button" data-action="note-add"${disabled()}>${icon('notebook-pen')}记一笔</button><button class="button primary" data-action="node-add"${disabled()}>${icon('plus')}添加任务</button></div></div>
      <p class="goal-line">${escape(project.goal || '尚未记录项目目标')}</p>
      <div class="phase-track" aria-label="当前阶段：${escape(label(project.phase))}">${phases.map((phase,index) => `<span class="phase-step${index < phaseIndex ? ' done' : index === phaseIndex ? ' current' : ''}">${icon(index < phaseIndex ? 'circle-check' : index === phaseIndex ? 'circle-dot' : 'circle')}${label(phase)}</span>`).join('')}</div>
      <div class="stats-strip"><div class="stat"><span class="stat-label">任务完成</span><strong>${Number(stats.completed || 0)}<small>/ ${Number(stats.total || 0)}</small></strong><progress class="progress-line" aria-label="任务完成比例" value="${Math.min(100,Math.max(0,percentage))}" max="100"></progress></div><div class="stat"><span class="stat-label">进行中</span><strong>${Number(stats.active || 0)}</strong></div><div class="stat"><span class="stat-label">待开展</span><strong>${Number(stats.planned || 0)}</strong></div><div class="stat"><span class="stat-label">受阻</span><strong>${Number(stats.blocked || 0)}</strong></div><div class="stat"><span class="stat-label">待决定</span><strong>${openQuestions.length}</strong></div></div>
      ${project.mode === 'loop' ? `<div class="budget-strip"><span>当前第 <strong class="number">${project.round || 0}</strong> 轮</span><span>轮次上限：${project.budget?.maxRounds ?? '未设定'}</span><span>时间预算：${project.budget?.minutes ? `${project.budget.minutes} 分钟` : '未设定'}</span><span>可执行候选：${ranking().filter(item => item.eligible).length}</span></div>` : ''}
      <div class="overview-columns"><div><section><div class="section-heading"><h3>当前关注 <span class="count-label">${focusNodes.length}</span></h3><button class="text-button" data-action="navigate" data-view="tasks">全部任务 ${icon('arrow-right')}</button></div>${focusNodes.length ? taskTable(focusNodes,{compact:true}) : emptyState('当前没有进行中或受阻任务','list-checks','',true)}</section>
      <section class="section-rule"><div class="section-heading"><h3>待决事项 <span class="count-label">${openQuestions.length}</span></h3><button class="text-button" data-action="question-add"${disabled()}>${icon('plus')}新增决策</button></div>${openQuestions.length ? openQuestions.map(questionMarkup).join('') : emptyState('当前没有待决事项','circle-check','',true)}${state.board.questions.some(question => question.status === 'resolved') ? `<details><summary class="details-summary">已确认决定（${state.board.questions.filter(question => question.status === 'resolved').length}）</summary>${state.board.questions.filter(question => question.status === 'resolved').map(questionMarkup).join('')}</details>` : ''}</section>
      <section class="section-rule"><div class="section-heading"><h3>最近完成</h3></div>${completed.length ? taskTable(completed,{compact:true}) : emptyState('尚无已完成任务','check-check','',true)}</section></div>
      <aside class="overview-secondary"><div class="section-heading"><h3>项目动态</h3><span class="count-label">最近 ${events.length} 条</span></div>${events.length ? `<ol class="activity-list">${events.map(event => `<li class="activity-item"><div><p>${escape(event.summary || event.type)}</p><time datetime="${escape(event.at)}">${escape(formattedDate(event.at))} · ${escape(label(event.actor))}</time></div></li>`).join('')}</ol>` : emptyState('尚无动态','activity','',true)}<div class="section-rule"><div class="section-heading"><h3>知识积累</h3><button class="text-button" data-action="navigate" data-view="knowledge">查看 ${icon('arrow-right')}</button></div><div class="mini-facts"><span>用户确认 <strong class="number">${state.board.knowledge.filter(entry => entry.tier === 'confirmed' && entry.status === 'active').length}</strong></span><span>AI 经验 <strong class="number">${state.board.knowledge.filter(entry => entry.tier === 'experience' && entry.status === 'active').length}</strong></span></div></div></aside></div>`;
  }

  function filteredNodes() {
    const query = state.query.trim().toLocaleLowerCase();
    return currentNodes().filter(node => (state.showArchived || !node.archived) && (state.statusFilter === 'all' || node.status === state.statusFilter) && (!query || [node.title,node.description,node.owner,node.result,node.id].some(text => String(text || '').toLocaleLowerCase().includes(query))));
  }

  function renderTasks() {
    const nodes = filteredNodes();
    const eligible = ranking().filter(item => item.eligible);
    const ineligible = ranking().filter(item => !item.eligible);
    const rounds = state.board.rounds;
    return `<div class="view-heading"><div class="heading-with-count"><h2>${currentProject().mode === 'loop' ? '研究全景' : '任务全景'}</h2><span class="count-label">${currentNodes().filter(node => !node.archived).length} 个节点</span></div><button class="button primary" data-action="node-add"${disabled()}>${icon('plus')}${currentProject().mode === 'loop' ? '添加方向' : '添加任务'}</button></div>
      <div class="toolbar"><div class="toolbar-left"><div class="segmented" aria-label="展示方式"><button class="${state.taskView === 'tree' ? 'active' : ''}" data-action="task-view" data-view="tree" aria-pressed="${state.taskView === 'tree'}">${icon('git-fork')}树图</button><button class="${state.taskView === 'table' ? 'active' : ''}" data-action="task-view" data-view="table" aria-pressed="${state.taskView === 'table'}">${icon('table-2')}表格</button></div><label class="search-field">${icon('search')}<input id="task-search" type="search" placeholder="搜索任务" value="${escape(state.query)}" aria-label="搜索任务"></label><select id="task-status" aria-label="筛选任务状态"><option value="all">全部状态</option>${optionTags(['planned','active','completed','blocked','cancelled'],state.statusFilter)}</select></div><div class="toolbar-right"><label class="check-label"><input id="show-archived" type="checkbox"${state.showArchived ? ' checked' : ''}>包含归档</label>${rounds.length ? `<select id="tree-round" aria-label="高亮轮次"><option value="latest"${state.selectedRound === null ? ' selected' : ''}>当前轮次 · ${currentProject().round}</option>${[...rounds].reverse().map(round => `<option value="${round.number}"${state.selectedRound === round.number ? ' selected' : ''}>第 ${round.number} 轮</option>`).join('')}</select>` : ''}</div></div>
      <div class="research-layout"><section class="research-main">${state.taskView === 'table' ? taskTable(nodes,{scores:true}) : `<div class="graph-wrap"><svg id="tree-svg" class="tree-svg" role="group" aria-label="任务研究树" tabindex="0"></svg><span class="graph-results">${state.query || state.statusFilter !== 'all' ? `${nodes.length} 个匹配节点` : `第 ${roundNumber()} 轮 · ${currentProject().mode === 'loop' ? '研究方向' : '任务结构'}`}</span><div class="graph-tools"><button class="icon-button" data-action="zoom-out" title="缩小" aria-label="缩小">${icon('minus')}</button><span class="zoom-number" id="zoom-number">100%</span><button class="icon-button" data-action="zoom-in" title="放大" aria-label="放大">${icon('plus')}</button><span class="tool-divider"></span><button class="icon-button" data-action="tree-fit" title="适应画布" aria-label="适应画布">${icon('maximize')}</button><button class="icon-button" data-action="tree-expand" title="展开所有节点" aria-label="展开所有节点">${icon('unfold-vertical')}</button><button class="icon-button" data-action="tree-collapse" title="收起任务组" aria-label="收起任务组">${icon('fold-vertical')}</button></div></div><div class="graph-legend"><span class="legend-key"><i></i>待开展</span><span class="legend-key"><i class="earlier"></i>此前完成</span><span class="legend-key"><i class="current"></i>选定轮次完成</span><span class="legend-key"><i class="blocked"></i>受阻</span></div>`}</section>
      <aside class="research-rail"><div class="rail-heading"><h3>${currentProject().mode === 'loop' ? '下一步优先级' : '可开展任务'}</h3><span class="count-label">${eligible.length} 项</span></div><div class="rank-note">本轮相对优先级占比 · 共 100%</div>${eligible.length ? `<div class="queue-list">${eligible.map((node,index) => queueItem(node,index)).join('')}</div>` : emptyState('暂无可执行候选','list-ordered','',true)}${ineligible.length ? `<details open><summary class="details-summary">等待条件（${ineligible.length}）</summary>${ineligible.map((node,index) => queueItem(node,index,true)).join('')}</details>` : ''}</aside></div>`;
  }

  function queueItem(node,index,ineligible = false) {
    const share = Number(node.share || 0);
    return `<div class="queue-item${ineligible ? ' ineligible' : ''}"><span class="queue-number">${String(index + 1).padStart(2,'0')}</span><div><button class="table-title" data-action="node-detail" data-id="${escape(node.id || node.nodeId)}">${escape(node.title || nodeName(node.nodeId))}</button><div class="queue-score">${ineligible ? escape(node.blockedReason || '等待依赖') : `评分 ${Number(node.score || 0)}${node.owner ? ` · ${escape(node.owner)}` : ''}`}</div>${!ineligible && node.scoreReason ? `<span class="cell-note">${escape(node.scoreReason)}</span>` : ''}${!ineligible ? `<progress class="queue-bar" max="100" value="${Math.min(100,Math.max(0,share))}" aria-label="本轮优先级占比"></progress>` : ''}</div><span class="queue-share">${ineligible ? '等待' : `${share.toFixed(1)}%`}</span></div>`;
  }

  function fitNodeText(value, fontSize = 14, fontWeight = 600) {
    const context = document.createElement('canvas').getContext('2d');
    const text = String(value || '未命名');
    context.font = `${fontWeight} ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
    if (context.measureText(text).width <= 190) return text;
    const characters = Array.from(text);
    while (characters.length && context.measureText(`${characters.join('')}…`).width > 190) characters.pop();
    return `${characters.join('')}…`;
  }

  function renderTree() {
    const svg = $('#tree-svg');
    if (!svg || !window.d3) return;
    const visibleNodes = currentNodes().filter(node => state.showArchived || !node.archived);
    const matching = new Set(filteredNodes().map(node => node.id));
    const filtered = Boolean(state.query || state.statusFilter !== 'all');
    const included = new Set(matching);
    if (filtered) {
      for (const id of matching) {
        let parent = getNode(id)?.parentId;
        const seen = new Set();
        while (parent && !seen.has(parent)) { seen.add(parent); included.add(parent); parent = getNode(parent)?.parentId; }
      }
    }
    const entries = visibleNodes.filter(node => !filtered || included.has(node.id));
    if (!entries.length) {
      svg.innerHTML = '<text x="50%" y="48%" text-anchor="middle" fill="#636b75" font-size="13">暂无任务节点</text>';
      state.graphBounds = null;
      return;
    }
    const map = new Map(entries.map(node => [node.id,{...node,status:node.work?.status || node.status,children:[]}]));
    const root = {id:'__project__',title:currentProject().title,kind:'group',status:currentProject().status,synthetic:true,children:[]};
    for (const node of map.values()) {
      const parent = map.get(node.parentId);
      (parent || root).children.push(node);
    }
    const displayRoot = root.children.length === 1 && root.children[0].kind === 'group' ? root.children[0] : root;
    const hierarchy = d3.hierarchy(displayRoot, node => state.collapsed.has(node.id) && !filtered ? null : node.children);
    d3.tree().nodeSize([76,282])(hierarchy);
    const all = hierarchy.descendants();
    const minY = Math.min(...all.map(node => node.x));
    const maxY = Math.max(...all.map(node => node.x)) + 64;
    const maxX = Math.max(...all.map(node => node.y)) + 224;
    state.graphBounds = {minY,maxY,maxX};
    const paths = hierarchy.links().map(link => `<path d="M${link.source.y + 224},${link.source.x + 32}C${link.source.y + 253},${link.source.x + 32} ${link.target.y - 29},${link.target.x + 32} ${link.target.y},${link.target.x + 32}"></path>`).join('');
    const nodeMarkup = all.map(item => {
      const node = item.data;
      const current = node.status === 'completed' && node.completedRound !== null && Number(node.completedRound) === roundNumber() && (state.scopeId !== '*' || nodeScope(node.id) === state.selectedRoundScope);
      const meta = node.synthetic ? `${visibleNodes.length} 个节点 · ${label(currentProject().mode)}` : `${label(node.status)} · ${node.owner || label(node.kind)}`;
      const result = node.status === 'completed' ? `${label(node.outcome)}${node.completedRound ? ` · 第 ${node.completedRound} 轮` : ''}` : node.synthetic ? `${label(currentProject().phase)}` : `评分 ${node.score ?? 50}${node.dependsOn?.length ? ` · ${node.dependsOn.length} 项依赖` : ''}`;
      const caption = fitNodeText(node.children.length ? `${label(node.status)} · ${node.children.length} 个子方向` : node.status === 'completed' ? `${label(node.status)} · ${result}` : meta,11,400);
      const title = fitNodeText(node.title);
      return `<g class="tree-node ${escape(node.status)}${current ? ' current-round' : ''}${node.synthetic ? ' synthetic' : ''}${state.selectedNode === node.id ? ' selected' : ''}" transform="translate(${item.y},${item.x})"${node.synthetic ? '' : ` role="button" tabindex="0" aria-label="${escape(node.title)}，${escape(label(node.status))}" data-action="node-detail" data-id="${escape(node.id)}"`}><title>${escape(node.title)}${node.description ? `\n${escape(node.description)}` : ''}</title><rect class="node-body" width="224" height="64" rx="5"></rect><text class="node-title" x="14" y="25">${escape(title)}</text><text class="node-meta" x="14" y="47">${escape(caption.length > 27 ? `${caption.slice(0,25)}…` : caption)}</text>${node.children.length ? `<foreignObject x="212" y="20" width="25" height="26"><button xmlns="http://www.w3.org/1999/xhtml" class="collapse-button" data-action="tree-toggle" data-id="${escape(node.id)}" title="${state.collapsed.has(node.id) ? '展开' : '收起'} ${escape(node.title)}" aria-label="${state.collapsed.has(node.id) ? '展开' : '收起'} ${escape(node.title)}">${icon(state.collapsed.has(node.id) && !filtered ? 'plus' : 'minus')}</button></foreignObject>` : ''}</g>`;
    }).join('');
    svg.innerHTML = `<g id="tree-transform"><g class="tree-links">${paths}</g><g>${nodeMarkup}</g></g>`;
    if (!state.transform) fitTree(); else applyTransform();
    installGraphEvents(svg);
  }

  function fitTree() {
    const svg = $('#tree-svg');
    const bounds = state.graphBounds;
    if (!svg || !bounds) return;
    const {width,height} = svg.getBoundingClientRect();
    const scale = Math.min(1,(width - 60) / bounds.maxX,(height - 105) / (bounds.maxY - bounds.minY));
    state.transform = {x:(width - bounds.maxX * scale) / 2,y:(height - (bounds.maxY - bounds.minY) * scale) / 2 - bounds.minY * scale - 12,k:Math.max(Number.EPSILON,scale)};
    applyTransform();
  }

  function applyTransform() {
    const transform = state.transform;
    if (!transform) return;
    $('#tree-transform')?.setAttribute('transform', `translate(${transform.x},${transform.y}) scale(${transform.k})`);
    if ($('#zoom-number')) $('#zoom-number').textContent = `${Math.round(transform.k * 100)}%`;
  }

  function zoomGraph(multiplier,x,y) {
    const svg = $('#tree-svg');
    if (!svg || !state.transform) return;
    const rect = svg.getBoundingClientRect();
    x ??= rect.width / 2; y ??= rect.height / 2;
    const previous = state.transform.k;
    const next = Math.max(.00001,Math.min(2.5,previous * multiplier));
    state.transform.x = x - (x - state.transform.x) * next / previous;
    state.transform.y = y - (y - state.transform.y) * next / previous;
    state.transform.k = next;
    applyTransform();
  }

  function installGraphEvents(svg) {
    let drag = null;
    svg.onpointerdown = event => {
      if (event.button !== 0 || !state.transform || event.target.closest('button')) return;
      drag = {id:event.pointerId,x:event.clientX,y:event.clientY,original:{...state.transform},moved:false};
    };
    svg.onpointermove = event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) {
        drag.moved = true;
        svg.setPointerCapture(event.pointerId);
      }
      if (!drag.moved) return;
      svg.classList.add('dragging');
      state.transform.x = drag.original.x + dx; state.transform.y = drag.original.y + dy;
      applyTransform();
    };
    const finishDrag = () => { if (drag?.moved) state.graphMovedAt = Date.now(); drag = null; svg.classList.remove('dragging'); };
    svg.onpointerup = finishDrag;
    svg.onpointercancel = finishDrag;
    svg.onwheel = event => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomGraph(Math.exp(-event.deltaY * .002),event.clientX - rect.left,event.clientY - rect.top);
    };
    svg.onkeydown = event => {
      if (event.target !== svg || !state.transform) return;
      if (event.key === '+' || event.key === '=') zoomGraph(1.2);
      else if (event.key === '-') zoomGraph(1 / 1.2);
      else if (event.key === '0') fitTree();
      else if (event.key.startsWith('Arrow')) {
        state.transform.x += event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0;
        state.transform.y += event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0;
        applyTransform();
      } else return;
      event.preventDefault();
    };
  }

  function field(labelText,value,full = false) {
    return `<div class="detail-field${full ? ' full' : ''}"><dt>${escape(labelText)}</dt><dd>${escape(value || '未记录')}</dd></div>`;
  }

  function evidenceList(evidence = []) {
    return evidence.length ? `<ul class="evidence-list">${evidence.map(item => `<li>${icon('file-text')}<span>${escape(item)}</span></li>`).join('')}</ul>` : '<span class="muted">尚未记录证据</span>';
  }

  function renderDetail() {
    const node = getNode(state.selectedNode);
    if (!node) return;
    const candidate = ranking().find(item => item.id === node.id || item.nodeId === node.id);
    $('#detail-content').innerHTML = `<div class="dialog-heading"><h2 id="detail-title">${escape(node.title)}</h2><button class="icon-button" data-action="close-detail" title="关闭详情" aria-label="关闭详情">${icon('x')}</button></div><div class="detail-subhead">${badge(node.status)}<span>${escape(label(node.kind))}</span><span class="mono">${escape(node.id)}</span>${node.archived ? '<span>已归档</span>' : ''}</div>${node.description ? `<p class="detail-description">${escape(node.description)}</p>` : ''}<dl class="detail-grid">${field('负责人',node.owner)}${field('模型',node.model)}${field('父节点',node.parentId ? nodeName(node.parentId) : '项目根节点')}${field('结论',label(node.outcome))}${field('优先级评分',String(node.score ?? 50))}${field('本轮优先级占比',candidate?.eligible ? `${Number(candidate.share).toFixed(1)}%` : '不在可执行队列')}${field('评分依据',node.scoreReason,true)}${node.dependsOn?.length ? `<div class="detail-field full"><dt>依赖任务</dt><dd>${node.dependsOn.map(id => `<button class="text-button" data-action="node-detail" data-id="${escape(id)}">${escape(nodeName(id))}</button>`).join('<br>')}</dd></div>` : ''}${candidate && !candidate.eligible ? field('等待条件',candidate.blockedReason,true) : ''}${field('结果与结论',node.result,true)}<div class="detail-field full"><dt>证据</dt><dd>${evidenceList(node.evidence)}</dd></div>${field('方法',node.method,true)}${field('问题与教训',node.pitfalls,true)}${field('下一步',node.nextSteps,true)}${field('完成轮次',node.completedRound === null || node.completedRound === undefined ? '未记录' : `第 ${node.completedRound} 轮`)}${field('最近更新',formattedDate(node.updatedAt,true))}</dl><div class="detail-actions"><button class="button primary" data-action="node-edit" data-id="${escape(node.id)}"${disabled()}>${icon('square-pen')}编辑节点</button><button class="button" data-action="node-add" data-parent="${escape(node.id)}"${disabled()}>${icon('git-branch-plus')}添加子任务</button><button class="icon-button bordered" data-action="node-archive" data-id="${escape(node.id)}" title="${node.archived ? '取消归档' : '归档节点'}" aria-label="${node.archived ? '取消归档' : '归档节点'}"${disabled()}>${icon(node.archived ? 'archive-restore' : 'archive')}</button></div>`;
    if (node.execution) {
      const pending = (state.fullBoard.requests || []).find(request => (request.scopeId ?? null) === nodeScope(node.id) && ['pending','received'].includes(request.status));
      $('#detail-content').insertAdjacentHTML('beforeend',`<section class="section-rule"><h3>执行归属</h3><dl class="detail-grid">${field('会话',node.execution.sessionId)}${field('执行批次',node.execution.runId)}${field('任务编号',node.execution.taskId)}${field('采用的计划版本',String(node.execution.planRevision ?? '未记录'))}</dl><div class="detail-actions">${(['completed','cancelled'].includes(node.status) ? ['reopen','correct'] : ['cancel','correct']).map(control => `<button class="button" data-action="node-request" data-control="${control}" data-id="${escape(node.id)}"${disabled()}${pending ? ' disabled' : ''}>${icon(control === 'reopen' ? 'rotate-ccw' : control === 'cancel' ? 'square' : 'file-pen-line')}请求${label(control)}</button>`).join('')}</div>${pending ? `<p class="form-note">${escape(label(pending.action))}：${escape(label(pending.status))}</p>` : ''}</section>`);
    }
    refreshIcons();
  }

  function renderRounds() {
    const rounds = [...state.board.rounds].sort((a,b) => b.number - a.number);
    if (!rounds.length) return `<div class="view-heading"><h2>轮次记录</h2></div>${emptyState(currentProject().mode === 'loop' ? '尚未开始研究轮次' : '当前项目没有循环研究记录','history',currentProject().mode === 'loop' ? `<button class="button" data-action="control" data-control="next"${disabled()}${pendingControl() ? ' disabled' : ''}>${icon('step-forward')}请求第一轮</button>` : '')}`;
    const round = rounds.find(item => item.number === state.selectedRound && (item.scopeId ?? null) === state.selectedRoundScope) || rounds[0];
    const snapshot = round.rankingSnapshot || [];
    const completed = round.completedNodeSnapshots;
    const completedTable = completed === null || completed === undefined
      ? `<p class="muted">本轮历史快照不可用。</p>${(round.completedNodeIds || []).length ? `<p class="small">完成节点编号：${round.completedNodeIds.map(escape).join('、')}</p>` : ''}`
      : completed.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>任务</th><th>结论</th><th>本轮结果</th><th>证据</th></tr></thead><tbody>${completed.map(node => `<tr><td class="title-cell">${escape(node.title)}</td><td>${escape(label(node.outcome))}</td><td>${escape(node.result)}</td><td>${(node.evidence || []).map(escape).join('<br>')}</td></tr>`).join('')}</tbody></table></div>` : emptyState('本轮尚无完成结果','list-checks','',true);
    return `<div class="view-heading"><h2>轮次记录 <span class="count-label">${rounds.length} 轮</span></h2><button class="button" data-action="export" data-format="markdown" data-section="rounds">${icon('download')}导出轮次记录</button></div>
      <div class="round-layout"><nav class="round-list" aria-label="选择研究轮次">${rounds.map(item => `<button class="round-button${item === round ? ' active' : ''}" data-action="round-select" data-round="${item.number}" data-scope="${escape(item.scopeId || '')}" aria-pressed="${item === round}"><strong>第 ${item.number} 轮 · ${item.finishedAt ? '已收尾' : '进行中'}</strong>${state.scopeId === '*' ? `<span>${escape(scopeTitle(item.scopeId))}</span>` : ''}<span>${escape(formattedDate(item.startedAt))}</span><span>${escape(roundTitle(item))}</span></button>`).join('')}</nav>
      <section><div class="round-summary"><h3>第 ${round.number} 轮${round.finishedAt ? '' : ' · 进行中'}</h3><p>${escape(formattedDate(round.startedAt,true))}${round.finishedAt ? ` 至 ${escape(formattedDate(round.finishedAt,true))}` : ''}</p><p>${escape(roundTitle(round))}</p>${round.nodeId && getNode(round.nodeId) ? `<p><button class="text-button" data-action="node-detail" data-id="${escape(round.nodeId)}">查看节点当前记录 ${icon('arrow-up-right')}</button></p>` : ''}</div>
      <dl class="detail-grid">${field('本轮工作',round.summary,true)}${field('方法',round.method,true)}${field('问题与教训',round.pitfalls,true)}${field('结论',round.conclusion,true)}${field('下一步',round.nextSteps,true)}</dl>
      <section class="section-rule"><div class="section-heading"><h3>本轮完成 <span class="count-label">${round.completedNodeIds?.length || 0}</span></h3><button class="text-button" data-action="round-tree" data-round="${round.number}" data-scope="${escape(round.scopeId || '')}">在树上查看 ${icon('arrow-up-right')}</button></div>${completedTable}</section>
      <section class="section-rule"><div class="section-heading"><h3>开始时的候选排序</h3></div>${snapshot.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>顺序</th><th>研究方向</th><th class="numeric">评分</th><th class="numeric">占比</th><th>依据</th></tr></thead><tbody>${snapshot.map((item,index) => `<tr><td>${index + 1}</td><td class="title-cell">${escape(item.title || item.node?.title || item.id || item.nodeId)}</td><td class="numeric">${Number(item.score || 0)}</td><td class="numeric">${item.share === undefined ? '未记录' : `${Number(item.share).toFixed(1)}%`}</td><td>${escape(item.scoreReason || item.reason || '未记录')}</td></tr>`).join('')}</tbody></table></div>` : emptyState('本轮未记录候选快照','list-ordered','',true)}</section></section></div>`;
  }

  function renderKnowledge() {
    const tierCounts = tier => state.board.knowledge.filter(entry => entry.tier === tier && entry.status === 'active').length;
    const entries = state.board.knowledge.filter(entry => entry.tier === state.knowledgeTier && (state.knowledgeHistory || entry.status === 'active') && (!state.knowledgeQuery || [entry.title,entry.content,entry.scope,entry.source].some(value => String(value || '').toLocaleLowerCase().includes(state.knowledgeQuery.toLocaleLowerCase()))));
    return `<div class="view-heading"><h2>项目知识</h2><button class="button primary" data-action="knowledge-add"${disabled()}>${icon('plus')}新增经验</button></div><div class="tabs" role="tablist" aria-label="知识层级"><button role="tab" aria-selected="${state.knowledgeTier === 'confirmed'}" class="${state.knowledgeTier === 'confirmed' ? 'active' : ''}" data-action="knowledge-tier" data-tier="confirmed">用户确认<span class="count-label">${tierCounts('confirmed')}</span></button><button role="tab" aria-selected="${state.knowledgeTier === 'experience'}" class="${state.knowledgeTier === 'experience' ? 'active' : ''}" data-action="knowledge-tier" data-tier="experience">AI 经验<span class="count-label">${tierCounts('experience')}</span></button></div><div class="toolbar"><label class="search-field">${icon('search')}<input type="search" id="knowledge-search" placeholder="搜索知识" aria-label="搜索知识" value="${escape(state.knowledgeQuery)}"></label><label class="check-label"><input id="knowledge-history" type="checkbox"${state.knowledgeHistory ? ' checked' : ''}>包含停用记录</label></div>${entries.length ? `<div class="knowledge-list">${entries.sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(entry => `<article class="knowledge-item"><div class="knowledge-title"><h3>${escape(entry.title)}</h3>${entry.status !== 'active' ? badge(entry.status) : entry.tier === 'confirmed' ? badge('confirmed') : '<span class="status-badge">未经用户确认</span>'}</div><p class="knowledge-content">${escape(entry.content)}</p><div class="knowledge-meta"><div>适用范围：${escape(entry.scope || '未记录')}</div><div>来源：${escape(entry.source || '未记录')}${entry.sourceNodeIds?.length ? ` · ${entry.sourceNodeIds.map(id => `<button class="text-button" data-action="node-detail" data-id="${escape(id)}">${escape(nodeName(id))}</button>`).join('、')}` : ''}</div><div>置信度：${escape(label(entry.confidence))} · ${entry.confirmedAt ? `确认于 ${escape(formattedDate(entry.confirmedAt))}` : `记录于 ${escape(formattedDate(entry.createdAt))}`}</div></div><div class="knowledge-actions">${entry.tier === 'experience' && entry.status === 'active' ? `<button class="text-button" data-action="knowledge-confirm" data-id="${escape(entry.id)}"${disabled()}>${icon('badge-check')}确认为知识</button>` : ''}<button class="text-button" data-action="knowledge-edit" data-id="${escape(entry.id)}"${disabled()}>${entry.tier === 'confirmed' ? '提出修订' : '编辑'}</button>${entry.status === 'active' ? `<button class="text-button" data-action="knowledge-reject" data-id="${escape(entry.id)}"${disabled()}>${entry.tier === 'confirmed' ? '停用' : '不采纳'}</button>` : ''}</div></article>`).join('')}</div>` : emptyState(state.knowledgeQuery ? '没有匹配的知识' : state.knowledgeTier === 'confirmed' ? '尚无用户确认的知识' : '尚无 AI 经验记录','book-open',state.knowledgeTier === 'experience' && !state.readOnly ? '<button class="button" data-action="knowledge-add">新增经验</button>' : '')}`;
  }

  function renderReports() {
    const project = currentProject();
    const tasks = currentNodes().filter(node => node.kind !== 'group' && !node.archived);
    const completed = tasks.filter(node => node.status === 'completed');
    const blockers = tasks.filter(node => node.status === 'blocked');
    const questions = state.board.questions.filter(question => question.status === 'open');
    const evidenceNodes = completed.filter(node => node.evidence?.length);
    const stats = state.board.stats || {};
    const leader = state.audience === 'leader';
    return `<div class="view-heading"><h2>项目汇报</h2></div><div class="report-toolbar"><div class="segmented" aria-label="汇报受众"><button class="${!leader ? 'active' : ''}" data-action="report-audience" data-audience="owner" aria-pressed="${!leader}">${icon('user-round')}本人视角</button><button class="${leader ? 'active' : ''}" data-action="report-audience" data-audience="leader" aria-pressed="${leader}">${icon('users-round')}领导视角</button></div><div class="button-row"><button class="button" data-action="export" data-format="markdown">${icon('download')}Markdown</button><button class="button" data-action="export" data-format="json">${icon('braces')}JSON</button><button class="icon-button bordered" data-action="print" title="打印汇报" aria-label="打印汇报">${icon('printer')}</button></div></div><article class="report-document"><header class="report-title"><h2>${escape(project.title)}${project.isExample ? '（示例）' : ''}</h2><p>${leader ? '目标、成果、风险与待决事项' : '工作进度、方法、证据与后续行动'}</p><div class="report-meta"><span>截至 ${escape(formattedDate(project.updatedAt,true))}</span><span>${escape(label(project.mode))}</span><span>状态：${escape(label(project.status))}</span><span>任务完成 ${stats.completed || 0} / ${stats.total || 0}</span></div></header><section class="report-section"><h3>项目目标</h3><p>${escape(project.goal || '尚未记录')}</p></section><section class="report-section"><h3>成果与证据 <span class="count-label">${evidenceNodes.length}</span></h3>${evidenceNodes.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>任务 / 方向</th><th>结论</th><th>实际结果</th><th>证据来源</th></tr></thead><tbody>${evidenceNodes.map(node => `<tr><td class="title-cell"><button class="table-title" data-action="node-detail" data-id="${escape(node.id)}">${escape(node.title)}</button></td><td class="nowrap">${escape(label(node.outcome))}</td><td>${escape(node.result)}</td><td>${node.evidence.map(escape).join('<br>')}</td></tr>`).join('')}</tbody></table></div>` : emptyState('尚无附证据的完成结果','file-check-2','',true)}</section><section class="report-section"><h3>风险与阻塞 <span class="count-label">${blockers.length}</span></h3>${blockers.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>任务</th><th>当前问题</th><th>下一步</th><th>负责人</th></tr></thead><tbody>${blockers.map(node => `<tr><td class="title-cell">${escape(node.title)}</td><td>${escape(node.result || node.pitfalls || node.description || '未记录原因')}</td><td>${escape(node.nextSteps || '待确定')}</td><td>${escape(node.owner || '未分配')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">当前记录中没有受阻任务。</p>'}</section><section class="report-section"><h3>需要决定 <span class="count-label">${questions.length}</span></h3>${questions.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>待决事项</th><th>建议方案</th><th>依据</th></tr></thead><tbody>${questions.map(question => { const recommended = question.options?.find(option => option.id === question.recommendedOptionId); return `<tr><td class="title-cell"><button class="table-title" data-action="question-detail" data-id="${escape(question.id)}">${escape(question.title)}</button></td><td>${escape(recommended?.label || '未指定')}</td><td>${escape(recommended?.reason || question.context || '未记录')}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">当前没有待决事项。</p>'}</section>${!leader ? `<section class="report-section"><h3>任务与研究明细</h3>${taskTable(tasks,{scores:true})}</section><section class="report-section"><h3>方法与经验</h3>${completed.some(node => node.method || node.pitfalls) ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>任务</th><th>方法</th><th>问题与教训</th><th>下一步</th></tr></thead><tbody>${completed.filter(node => node.method || node.pitfalls).map(node => `<tr><td class="title-cell">${escape(node.title)}</td><td>${escape(node.method || '未记录')}</td><td>${escape(node.pitfalls || '未记录')}</td><td>${escape(node.nextSteps || '未记录')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">尚未记录方法与经验。</p>'}</section><section class="report-section"><h3>逐轮结论</h3>${state.board.rounds.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>轮次</th><th>研究方向</th><th>本轮结论</th><th>后续行动</th></tr></thead><tbody>${state.board.rounds.map(round => `<tr><td class="nowrap">第 ${round.number} 轮</td><td class="title-cell">${escape(round.nodeSnapshot?.title || (round.snapshotAvailable ? '未记录' : '旧轮次未保存名称快照'))}</td><td>${escape(round.conclusion || (round.finishedAt ? '未记录' : '进行中'))}</td><td>${escape(round.nextSteps || '未记录')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">暂无轮次记录。</p>'}</section>` : `<section class="report-section"><h3>接下来</h3>${taskTable(ranking().filter(item => item.eligible).slice(0,5),{compact:true})}</section>`}</article>`;
  }

  function openEditor(kind, id = '', extra = {}) {
    if (state.readOnly) return;
    state.editContext = {...extra,kind,id,scopeId:scopeValue()};
    const contents = editorContents(kind,id,extra);
    if (!contents) return;
    $('#edit-content').innerHTML = `<form id="edit-form" data-kind="${escape(kind)}" data-id="${escape(id)}" data-revision="${state.board.revision}"><div class="dialog-heading"><h2 id="edit-title">${contents.title}</h2><button type="button" class="icon-button" data-action="close-edit" title="关闭" aria-label="关闭">${icon('x')}</button></div>${contents.body}<div id="edit-error" class="form-error" role="alert" hidden></div><div class="form-footer"><button type="button" class="button" data-action="close-edit">取消</button><button type="submit" class="button primary" id="edit-submit">${contents.submit || '保存'}</button></div></form>`;
    const form = $('#edit-form');
    if (kind === 'node') {
      const existing = getNode(id);
      const parentSelect = $('[name=parentId]',form);
      const selectedScope = existing ? nodeScope(id) : extra.parentId ? nodeScope(extra.parentId) : scopeValue();
      for (const option of [...parentSelect.options]) {
        if (option.value ? nodeScope(option.value) !== selectedScope : selectedScope !== null) option.remove();
      }
      if (!existing && !extra.parentId && selectedScope) parentSelect.value = selectedScope;
      if (existing?.execution) {
        for (const key of [...executionFields,'parentId','kind']) {
          const input = form.elements.namedItem(key);
          if (input) input.disabled = true;
        }
        form.querySelector('.form-grid').insertAdjacentHTML('beforebegin','<p class="form-note execution-note">执行记录已绑定，结果由负责会话维护。</p>');
      }
      state.editContext.original = existing ? structuredClone(existing) : null;
    } else if (kind === 'question' && id) {
      const question = state.board.questions.find(item => item.id === id);
      if (!question || question.status !== 'open') { toast('这项问题已经关闭'); return; }
      $('#edit-title').textContent = '编辑待决事项';
      for (const key of ['title','context','recommendedOptionId']) form.elements.namedItem(key).value = question[key] || '';
      question.options.forEach((option,index) => {
        form.elements.namedItem(`option${index+1}`).value = option.label;
        form.elements.namedItem(`reason${index+1}`).value = option.reason;
        form.elements.namedItem(`recommendedOptionId`).options[index].value = option.id;
      });
      form.elements.namedItem('recommendedOptionId').value = question.recommendedOptionId;
      state.editContext.original = structuredClone(question);
    } else if (kind === 'knowledge') {
      const entry = state.board.knowledge.find(item => item.id === id);
      state.editContext.supersedesId = entry?.tier === 'confirmed' ? entry.id : entry?.supersedesId || null;
      if (state.editContext.supersedesId) form.querySelector('.form-grid').insertAdjacentHTML('beforebegin',`<p class="form-note">修订对象：${escape(entry?.title)}；用户确认后替代旧版。</p>`);
    } else if (kind === 'confirm') {
      const entry = state.board.knowledge.find(item => item.id === id);
      if (entry?.supersedesId) $('.confirm-check',form).insertAdjacentHTML('beforebegin',`<p class="form-note">本次确认将停用旧版：${escape(state.board.knowledge.find(item => item.id === entry.supersedesId)?.title || entry.supersedesId)}</p>`);
    }
    state.editContext.initialValues = Object.fromEntries(new FormData(form));
    if (kind === 'resolve') $('.form-footer',form).insertAdjacentHTML('afterend',`<div class="question-management"><button type="button" class="text-button" data-action="question-edit" data-id="${escape(id)}">${icon('square-pen')}编辑问题与方案</button><button type="button" class="text-button" data-action="question-void" data-id="${escape(id)}">${icon('archive-x')}作废问题</button></div>`);
    if (!$('#edit-dialog').open) $('#edit-dialog').showModal();
    refreshIcons();
    $('#edit-form input:not([type=hidden]):not(:disabled), #edit-form textarea:not(:disabled), #edit-form select:not(:disabled)')?.focus();
  }

  function editorContents(kind,id,extra) {
    const project = currentProject();
    if (kind === 'work') {
      const node = getNode(id), work = node?.work || {mode:'normal',goal:'',phase:'discussion',budget:{}};
      return {title:node ? '独立任务设置' : '新增独立任务',body:`<input type="hidden" name="id" value="${escape(id || newId('work'))}"><div class="form-grid"><label class="full">任务名称<input name="title" required maxlength="300" value="${escape(node?.title)}"></label><label class="full">目标<textarea name="goal" class="tall">${escape(work.goal)}</textarea></label><label class="full">说明<textarea name="description">${escape(node?.description)}</textarea></label><label>工作模式<select name="mode">${optionTags(['normal','loop'],work.mode)}</select></label><label>当前阶段<select name="phase">${optionTags(['discussion','planning','execution','review','complete'],work.phase)}</select></label><label>最大轮次<input type="number" name="maxRounds" min="1" step="1" value="${work.budget?.maxRounds ?? ''}"></label><label>时间预算（分钟）<input type="number" name="minutes" min="1" step="1" value="${work.budget?.minutes ?? ''}"></label></div>${node ? `<div class="section-rule"><button type="button" class="button danger" data-action="control" data-control="stop"${pendingControl() ? ' disabled' : ''}>${icon('square')}请求停止任务</button></div>` : ''}`};
    }
    if (kind === 'request') {
      const node = getNode(id), control = extra.control;
      if (!node) return null;
      return {title:`${label(control)}：${escape(node.title)}`,submit:'提交请求',body:`<input type="hidden" name="control" value="${escape(control)}"><label>原因<textarea name="reason" required class="tall"></textarea></label>${control === 'correct' ? `<div class="form-grid section-rule"><label>结论<select name="outcome">${optionTags(['unknown','supported','rejected','inconclusive'],node.outcome)}</select></label><label class="full">建议修订的结果<textarea name="result" class="tall">${escape(node.result)}</textarea></label><label class="full">建议修订的证据（每行一项）<textarea name="evidence">${escape((node.evidence || []).join('\n'))}</textarea></label></div>` : ''}`};
    }
    if (kind === 'void') return {title:'作废待决事项',submit:'确认作废',body:'<label>原因<textarea name="reason" required class="tall"></textarea></label>'};
    if (kind === 'node') {
      const existing = getNode(id);
      const node = existing || {id:newId('task'),parentId:extra.parentId || '',kind:project.mode === 'loop' ? 'experiment' : 'task',status:'planned',score:50,outcome:'unknown'};
      const terminal = existing && ['completed','cancelled'].includes(existing.status);
      return {title:existing ? '编辑节点' : extra.parentId ? '添加子任务' : project.mode === 'loop' ? '添加研究方向' : '添加任务',body:`<input type="hidden" name="id" value="${escape(node.id)}"><div class="form-grid"><label class="full">名称<input name="title" value="${escape(node.title)}" maxlength="300" required></label><label class="full">说明<textarea name="description">${escape(node.description)}</textarea></label><label>类型<select name="kind">${optionTags(['group','task','experiment'],node.kind)}</select></label><label>父节点<select name="parentId"><option value="">项目根节点</option>${currentNodes().filter(item => item.id !== node.id && !item.archived).map(item => `<option value="${escape(item.id)}"${item.id === node.parentId ? ' selected' : ''}>${escape(item.title)}</option>`).join('')}</select></label><label>状态<select name="status">${optionTags(['planned','active','completed','blocked','cancelled'],node.status)}</select></label><label>结论<select name="outcome">${optionTags(['unknown','supported','rejected','inconclusive'],node.outcome)}</select></label><label>负责人<input name="owner" value="${escape(node.owner)}" maxlength="200"></label><label>模型名称<input name="model" value="${escape(node.model)}" maxlength="200"></label><label>优先级评分<input type="number" name="score" min="0" max="100" step="1" value="${Number(node.score ?? 50)}" required></label><div class="form-note">完成时归入当前第 ${project.round || 0} 轮。</div><label class="full">评分依据<textarea name="scoreReason">${escape(node.scoreReason)}</textarea></label><label class="full">依赖节点编号（每行一项）<textarea name="dependsOn">${escape((node.dependsOn || []).join('\n'))}</textarea></label><label class="full">结果与结论<textarea name="result" class="tall">${escape(node.result)}</textarea></label><label class="full">证据（每行一项）<textarea name="evidence">${escape((node.evidence || []).join('\n'))}</textarea><p class="form-note">完成节点须有结果与证据；无效结论也可作为完成结果。</p></label><label class="full">方法<textarea name="method">${escape(node.method)}</textarea></label><label class="full">问题与教训<textarea name="pitfalls">${escape(node.pitfalls)}</textarea></label><label class="full">下一步<textarea name="nextSteps">${escape(node.nextSteps)}</textarea></label>${terminal ? '<label class="full">重新打开的原因<input name="reopenReason" maxlength="1000"><p class="form-note">变更已完成或已取消节点的状态时必填。</p></label>' : ''}</div>`};
    }
    if (kind === 'project') {
      return {title:'项目设置',body:`<div class="form-grid"><label class="full">项目名称<input name="title" required value="${escape(project.title)}" maxlength="300"></label><label class="full">目标<textarea name="goal" class="tall" required>${escape(project.goal)}</textarea></label><label>工作模式<select name="mode">${optionTags(['normal','loop'],project.mode)}</select></label><label>当前阶段<select name="phase">${optionTags(['discussion','planning','execution','review','complete'],project.phase)}</select></label><label>最大轮次<input type="number" name="maxRounds" min="1" step="1" value="${project.budget?.maxRounds ?? ''}"></label><label>时间预算（分钟）<input type="number" name="minutes" min="1" step="1" value="${project.budget?.minutes ?? ''}"></label></div><div class="section-rule"><button type="button" class="button danger" data-action="control" data-control="stop"${pendingControl() ? ' disabled' : ''}>${icon('square')}请求停止项目</button></div>`};
    }
    if (kind === 'question') {
      return {title:'新增待决事项',body:`<div class="form-grid"><label class="full">需要决定的问题<input name="title" maxlength="300" required></label><label class="full">背景与约束<textarea name="context" class="tall"></textarea></label><div class="full"><div class="section-heading"><h3>候选方案</h3></div>${[1,2,3].map(number => `<div class="option-edit"><label>方案 ${number}${number === 3 ? '（可选）' : ''}<input name="option${number}"${number < 3 ? ' required' : ''} maxlength="300"></label><label>依据与取舍<textarea name="reason${number}"${number < 3 ? ' required' : ''}></textarea></label></div>`).join('')}</div><label class="full">推荐方案<select name="recommendedOptionId"><option value="option-1">方案 1</option><option value="option-2">方案 2</option><option value="option-3">方案 3</option></select></label></div>`};
    }
    if (kind === 'resolve') {
      const question = state.board.questions.find(item => item.id === id);
      if (!question) return null;
      const resolved = question.status === 'resolved';
      return {title:escape(question.title),submit:resolved ? '更新决定' : '确认决定',body:`${question.context ? `<p class="detail-description">${escape(question.context)}</p>` : ''}<fieldset class="option-fieldset"><legend class="sr-only">候选方案</legend><div class="option-list">${question.options.map(option => `<label class="option-choice"><input type="radio" name="optionId" value="${escape(option.id)}"${question.selectedOptionId === option.id ? ' checked' : ''}><span><strong>${escape(option.label)}</strong>${question.recommendedOptionId === option.id ? '<span class="recommended">建议</span>' : ''}<small>${escape(option.reason)}</small></span></label>`).join('')}<label class="option-choice"><input type="radio" name="optionId" value=""${!question.selectedOptionId ? ' checked' : ''}><span><strong>其他决定</strong></span></label></div></fieldset><label>决定与补充<textarea name="answer" class="tall">${escape(question.answer)}</textarea></label>`};
    }
    if (kind === 'knowledge') {
      const original = state.board.knowledge.find(item => item.id === id);
      const entry = original?.tier === 'confirmed' ? {...original,id:newId('knowledge'),source:`${original.source || '项目知识'}；修订自：${original.title}`} : original || {id:newId('knowledge'),confidence:'medium',sourceNodeIds:[]};
      return {title:id ? '编辑知识记录' : '新增 AI 经验',body:`<input type="hidden" name="id" value="${escape(entry.id)}"><div class="form-grid"><label class="full">标题<input name="title" value="${escape(entry.title)}" maxlength="300" required></label><label class="full">内容<textarea name="content" class="tall" required>${escape(entry.content)}</textarea></label><label class="full">适用范围<textarea name="scope">${escape(entry.scope)}</textarea></label><label class="full">来源<input name="source" value="${escape(entry.source)}" maxlength="2000"></label><label class="full">关联任务编号（每行一项）<textarea name="sourceNodeIds">${escape((entry.sourceNodeIds || []).join('\n'))}</textarea></label><label>置信度<select name="confidence">${optionTags(['low','medium','high'],entry.confidence)}</select></label></div>`};
    }
    if (kind === 'confirm') {
      const entry = state.board.knowledge.find(item => item.id === id);
      if (!entry) return null;
      return {title:'确认项目知识',submit:'确认纳入知识',body:`<h3>${escape(entry.title)}</h3><p class="knowledge-confirm-content">${escape(entry.content)}</p><dl class="detail-grid">${field('适用范围',entry.scope,true)}${field('来源',entry.source,true)}</dl><label class="confirm-check"><input type="checkbox" name="confirmed" required>我已核对内容及适用范围，确认作为项目知识。</label>`};
    }
    if (kind === 'reject') {
      const entry = state.board.knowledge.find(item => item.id === id);
      if (!entry) return null;
      return {title:entry.tier === 'confirmed' ? '停用知识' : '不采纳经验',submit:'确认停用',body:`<h3>${escape(entry.title)}</h3><label class="spaced-label">原因<textarea name="reason" class="tall" required></textarea></label>`};
    }
    if (kind === 'note') return {title:'记录本次进展',submit:'保存记录',body:'<label>工作、方法、问题与结论<textarea name="text" class="tall" rows="8" required></textarea></label>'};
    return null;
  }

  async function mutate(action,payload,{expectedRevision = state.board.revision,form = null,success = '已保存'} = {}) {
    if (state.readOnly || state.busy) return false;
    state.busy = true;
    const submit = form ? $('[type="submit"]',form) : null;
    if (submit) { submit.disabled = true; submit.textContent = '保存中'; }
    try {
      const result = await api(`/api/projects/${encodeURIComponent(state.projectId)}/actions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload,expectedRevision})});
      selectBoard(result);
      state.readOnly = Boolean(result.server?.readOnly);
      state.error = '';
      state.busy = false;
      if (form) { $('#edit-dialog').close(); state.editContext = null; }
      render();
      if ($('#detail-dialog').open) renderDetail();
      toast(success);
      return true;
    } catch (error) {
      state.busy = false;
      if (error.committed) {
        await loadBoard();
        const message = '结构化记录已保存，但 Markdown 日志追加失败。请保留当前记录，由主会话修复日志。';
        if (form) {
          $('#edit-error').textContent = message;
          $('#edit-error').hidden = false;
          submit.textContent = '记录已保存';
        } else toast(message);
        return false;
      }
      if (error.status === 409 && (!error.code || error.code === 'REVISION_CONFLICT')) {
        await loadBoard();
        if (form) {
          const element = $('#edit-error');
          element.hidden = false;
          element.innerHTML = '记录已被其他会话更新。你的输入已保留，请核对最新记录。<div class="conflict-actions"><button type="button" class="text-button" data-action="show-latest">查看最新记录</button><button type="button" class="text-button" data-action="reload-editor">采用最新记录</button><button type="button" class="text-button" data-action="retry-editor">已核对，提交我的修改</button></div>';
          submit.textContent = '等待核对';
          form.dataset.conflict = 'true';
        } else toast('记录已更新，已重新读取。请核对后再次操作。');
      } else if (form) {
        $('#edit-error').textContent = error.message;
        $('#edit-error').hidden = false;
        submit.textContent = '重试保存';
      } else toast(error.message);
      if (submit) submit.disabled = form.dataset.conflict === 'true';
      return false;
    }
  }

  async function submitEditor(form) {
    const data = new FormData(form);
    const value = key => String(data.get(key) ?? '').trim();
    const kind = form.dataset.kind;
    const id = form.dataset.id;
    const revision = Number(form.dataset.revision);
    if (form.dataset.conflict === 'true') return;
    const initial = state.editContext?.initialValues || {};
    const changed = key => data.has(key) && String(initial[key] ?? '').trim() !== value(key);
    const changedFields = (object,mapping = {}) => Object.fromEntries(Object.entries(object).filter(([key]) => (mapping[key] || [key]).some(changed)));
    const budget = () => ({maxRounds:value('maxRounds') ? Number(value('maxRounds')) : null,minutes:value('minutes') ? Number(value('minutes')) : null});
    const scopeId = state.editContext?.scopeId ?? null;
    let action, payload;
    if (kind === 'node') {
      const node = {id:value('id'),title:value('title'),description:value('description'),kind:value('kind'),parentId:value('parentId') || null,status:value('status'),outcome:value('outcome'),owner:value('owner'),model:value('model'),score:Number(value('score')),scoreReason:value('scoreReason'),dependsOn:textLines(value('dependsOn')),result:value('result'),evidence:textLines(value('evidence')),method:value('method'),pitfalls:value('pitfalls'),nextSteps:value('nextSteps')};
      const old = state.editContext?.original;
      payload = {node:old ? {id:node.id,...changedFields(node)} : node}; action = 'node.upsert';
      if (old && !old.execution && ['completed','cancelled'].includes(old.status) && changed('status')) {
        if (!value('reopenReason')) { showFormError('请记录重新打开节点的原因。'); return; }
        if (['completed','cancelled'].includes(node.status)) { showFormError('重新打开时请选择待开展、进行中或受阻状态。'); return; }
        payload.reopen = true; payload.reason = value('reopenReason');
      }
      if (old && !old.execution && ['completed','cancelled'].includes(old.status) && !changed('status') && ['outcome','result','evidence','method','pitfalls','nextSteps'].some(changed)) {
        showFormError('历史结果需要先重新打开。请调整为待开展、进行中或受阻，并填写原因。'); return;
      }
      if (!old?.execution && node.status === 'completed' && (!node.result || !node.evidence.length)) { showFormError('完成节点需要结果与至少一项证据。'); return; }
    } else if (kind === 'project') {
      action = 'project.update';
      payload = changedFields({title:value('title'),goal:value('goal'),mode:value('mode'),phase:value('phase'),budget:budget()},{budget:['maxRounds','minutes']});
    } else if (kind === 'work') {
      action = 'work.upsert';
      const node = {title:value('title'),description:value('description')}, work = {goal:value('goal'),mode:value('mode'),phase:value('phase'),budget:budget()};
      payload = {node:{id:value('id'),...(id ? changedFields(node) : node)},work:id ? changedFields(work,{budget:['maxRounds','minutes']}) : work};
    } else if (kind === 'question') {
      const original = state.editContext?.original;
      const options = [1,2,3].filter(number => value(`option${number}`)).map(number => ({id:original?.options[number-1]?.id || `option-${number}`,label:value(`option${number}`),reason:value(`reason${number}`)}));
      if (options.some(option => !option.reason)) { showFormError('每个候选方案都需要依据与取舍。'); return; }
      if (!options.some(option => option.id === value('recommendedOptionId'))) { showFormError('推荐方案必须是已填写的候选方案。'); return; }
      const question = {title:value('title'),context:value('context'),options,recommendedOptionId:value('recommendedOptionId')};
      action = 'question.upsert'; payload = {question:{id:id || newId('decision'),...(id ? changedFields(question,{options:['option1','option2','option3','reason1','reason2','reason3']}) : {scopeId,...question})}};
    } else if (kind === 'resolve') {
      if (!value('optionId') && !value('answer')) { showFormError('请选择一个方案，或填写你的决定。'); return; }
      action = 'question.resolve'; payload = {id, ...(value('optionId') ? {optionId:value('optionId')} : {}),answer:value('answer')};
    } else if (kind === 'knowledge') {
      const entry = {title:value('title'),content:value('content'),source:value('source'),sourceNodeIds:textLines(value('sourceNodeIds')),scope:value('scope'),confidence:value('confidence')};
      action = 'knowledge.upsert'; payload = {entry:{id:value('id'),...(id === value('id') ? changedFields(entry) : entry),...(state.editContext?.supersedesId ? {supersedesId:state.editContext.supersedesId} : {})}};
    } else if (kind === 'request') {
      action = 'control.request'; payload = {scopeId:nodeScope(id),nodeId:id,action:value('control'),reason:value('reason')};
      if (value('control') === 'correct') {
        payload.changes = changedFields({outcome:value('outcome'),result:value('result'),evidence:textLines(value('evidence'))});
        if (!Object.keys(payload.changes).length) { showFormError('请填写需要修订的结果或证据。'); return; }
      }
    } else if (kind === 'void') { action = 'question.void'; payload = {id,reason:value('reason')};
    } else if (kind === 'confirm') { action = 'knowledge.confirm'; payload = {id}; }
    else if (kind === 'reject') { action = 'knowledge.reject'; payload = {id,reason:value('reason')}; }
    else if (kind === 'note') { action = 'note.add'; payload = {text:value('text'),scopeId}; }
    if (action) {
      const saved = await mutate(action,payload,{expectedRevision:revision,form,success:kind === 'confirm' ? '已纳入用户确认知识' : kind === 'resolve' ? '决定已记录，等待主进程采用' : kind === 'request' ? '请求已提交，等待主进程检查点' : '已保存'});
      if (saved && kind === 'work' && !id) selectScope(payload.node.id);
    }
  }

  function showFormError(message) {
    $('#edit-error').textContent = message;
    $('#edit-error').hidden = false;
  }

  async function downloadExport(format,section = 'all') {
    try {
      const parameters = new URLSearchParams({format,audience:section === 'rounds' ? 'owner' : state.audience,section});
      if (state.scopeId !== '*') parameters.set('scopeId',state.scopeId || '');
      const response = await api(`/api/projects/${encodeURIComponent(state.projectId)}/export?${parameters}`,{raw:true});
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CTBZ-${currentProject().id}-${state.audience}.${format === 'json' ? 'json' : 'md'}`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url),1000);
      toast('已导出项目记录');
    } catch (error) { toast(`导出失败：${error.message}`); }
  }

  function showQuestion(id) {
    const question = state.board.questions.find(item => item.id === id);
    if (!question) return;
    if (!state.readOnly && question.status === 'open') { openEditor('resolve',id); return; }
    $('#detail-content').innerHTML = `<div class="dialog-heading"><h2 id="detail-title">${escape(question.title)}</h2><button class="icon-button" data-action="close-detail" title="关闭详情" aria-label="关闭详情">${icon('x')}</button></div><div class="detail-subhead">${badge(question.status)}</div><p class="detail-description">${escape(question.context)}</p><div class="option-list">${question.options.map(option => `<div class="option-choice"><span><strong>${escape(option.label)}</strong>${option.id === question.selectedOptionId ? '<span class="recommended">已选择</span>' : option.id === question.recommendedOptionId ? '<span class="recommended">建议</span>' : ''}<small>${escape(option.reason)}</small></span></div>`).join('')}</div>${question.answer ? `<dl>${field('决定与补充',question.answer,true)}</dl>` : ''}<p class="small muted">更新于 ${escape(formattedDate(question.updatedAt,true))}</p>`;
    state.selectedNode = null;
    if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
    refreshIcons();
  }

  async function onAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    event.preventDefault();
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === 'navigate') {
      state.view = button.dataset.view; render(); rememberView(); window.scrollTo({top:0,behavior:'instant'});
      if (state.view === 'results') await loadArtifacts(true);
    } else if (action === 'scope-open') selectScope(id);
    else if (action === 'work-add') openEditor('work');
    else if (action === 'request-withdraw') await mutate('control.withdraw',{requestId:id},{success:'请求已撤回'});
    else if (action === 'artifacts-refresh') await loadArtifacts(true);
    else if (action === 'artifact-download') await downloadArtifact(button.dataset.format);
    else if (action === 'artifact-sort') {
      state.artifactSort = {key:button.dataset.key,descending:state.artifactSort?.key === button.dataset.key ? !state.artifactSort.descending : false}; render();
    } else if (action === 'artifact-page') { state.artifactPage += Number(button.dataset.step); render();
    } else if (action === 'refresh') {
      try { await loadProjects(); await loadBoard({force:true}); } catch (error) { state.error = error.message; renderBanner(); }
    } else if (action === 'authenticate') {
      $('#auth-dialog').showModal();
    } else if (action === 'close-auth') $('#auth-dialog').close();
    else if (action === 'forget-token') {
      state.token = ''; sessionStorage.removeItem('ctbz-token'); $('#auth-form').reset(); $('#auth-dialog').close(); await loadBoard({force:true});
    } else if (action === 'task-view') {
      state.taskView = button.dataset.view; render(); rememberView();
    } else if (action === 'node-detail') {
      if (Date.now() - state.graphMovedAt < 250) return;
      if (!getNode(id)) { toast('关联节点暂不可用'); return; }
      state.selectedNode = id; renderDetail();
      if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
      if (state.view === 'tasks' && state.taskView === 'tree') { renderTree(); refreshIcons(); }
    } else if (action === 'close-detail') $('#detail-dialog').close();
    else if (action === 'node-add') {
      if (state.scopeId === '*' && !button.dataset.parent) { toast('请先选择具体任务范围'); return; }
      openEditor('node','',{parentId:button.dataset.parent});
    } else if (action === 'node-edit') {
      if (getNode(id)?.work) { selectScope(id); openEditor('work',id); }
      else openEditor('node',id);
    }
    else if (action === 'node-request') openEditor('request',id,{control:button.dataset.control});
    else if (action === 'node-archive') {
      const node = getNode(id); if (node) await mutate('node.upsert',{node:{id,archived:!node.archived}},{success:node.archived ? '已取消归档' : '已归档，历史记录保留'});
    } else if (action === 'project-edit') openEditor(state.scopeId ? 'work' : 'project',state.scopeId || '');
    else if (action === 'question-add') {
      if (state.scopeId === '*') { toast('请先选择具体任务范围'); return; }
      openEditor('question');
    } else if (action === 'question-edit') openEditor('question',id);
    else if (action === 'question-void') openEditor('void',id);
    else if (action === 'question-detail') showQuestion(id);
    else if (action === 'knowledge-add') openEditor('knowledge');
    else if (action === 'knowledge-edit') openEditor('knowledge',id);
    else if (action === 'knowledge-confirm') openEditor('confirm',id);
    else if (action === 'knowledge-reject') openEditor('reject',id);
    else if (action === 'note-add') openEditor('note');
    else if (action === 'close-edit') { $('#edit-dialog').close(); state.editContext = null; }
    else if (action === 'reload-editor' && state.editContext) openEditor(state.editContext.kind,state.editContext.id,state.editContext);
    else if (action === 'retry-editor') {
      const form = $('#edit-form');
      form.dataset.revision = String(state.board.revision); delete form.dataset.conflict;
      await submitEditor(form);
    }
    else if (action === 'show-latest') {
      const context = state.editContext;
      const latest = ['node','work','request'].includes(context?.kind) ? getNode(context.id || $('[name=id]',$('#edit-form'))?.value) : context?.kind === 'project' ? currentProject() : ['knowledge','confirm','reject'].includes(context?.kind) ? state.board.knowledge.find(entry => entry.id === context.id) : state.board.questions.find(question => question.id === context.id);
      let preview = $('#conflict-preview');
      if (!preview) { preview = document.createElement('pre'); preview.id = 'conflict-preview'; preview.className = 'conflict-preview'; $('#edit-error').append(preview); }
      preview.textContent = latest ? JSON.stringify(latest,null,2) : '这项记录尚未写入。';
    } else if (action === 'control') {
      if (pendingControl() || state.scopeId === '*') return;
      const control = button.dataset.control;
      const success = await mutate('control.request',{action:control,scopeId:scopeValue()},{success:`已请求${label(control)}，等待主会话确认`});
      if (success && $('#edit-dialog').open) $('#edit-dialog').close();
    } else if (action === 'tree-toggle') {
      if (state.collapsed.has(id)) state.collapsed.delete(id); else state.collapsed.add(id);
      renderTree(); refreshIcons();
    } else if (action === 'tree-fit') fitTree();
    else if (action === 'tree-expand') { state.collapsed.clear(); state.transform = null; renderTree(); refreshIcons(); }
    else if (action === 'tree-collapse') { state.collapsed = new Set(currentNodes().filter(node => currentNodes().some(child => child.parentId === node.id)).map(node => node.id)); state.transform = null; renderTree(); refreshIcons(); }
    else if (action === 'zoom-in') zoomGraph(1.25);
    else if (action === 'zoom-out') zoomGraph(.8);
    else if (action === 'round-select') { state.selectedRound = Number(button.dataset.round); state.selectedRoundScope = button.dataset.scope || null; render(); }
    else if (action === 'round-tree') { if (state.scopeId === '*') selectScope(button.dataset.scope || null); state.selectedRound = Number(button.dataset.round); state.selectedRoundScope = button.dataset.scope || null; state.view = 'tasks'; state.taskView = 'tree'; render(); rememberView(); }
    else if (action === 'knowledge-tier') { state.knowledgeTier = button.dataset.tier; render(); }
    else if (action === 'report-audience') { state.audience = button.dataset.audience; render(); rememberView(); }
    else if (action === 'export') await downloadExport(button.dataset.format,button.dataset.section || 'all');
    else if (action === 'print') window.print();
  }

  document.addEventListener('click', event => { onAction(event).catch(error => toast(error.message)); });
  document.addEventListener('keydown', event => {
    const target = event.target.closest('.tree-node[role=button]');
    if (target && !event.target.closest('button') && ['Enter',' '].includes(event.key)) { event.preventDefault(); target.dispatchEvent(new MouseEvent('click',{bubbles:true})); }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'task-search') { state.query = event.target.value; state.transform = null; render(); }
    else if (event.target.id === 'knowledge-search') { state.knowledgeQuery = event.target.value; render(); }
    else if (event.target.id === 'artifact-search') { state.artifactQuery = event.target.value; state.artifactPage = 0; render(); }
  });
  document.addEventListener('change', async event => {
    const target = event.target;
    if (target.id === 'project-select') {
      state.projectId = target.value; state.board = null; state.fullBoard = null; state.scopeId = '*'; state.selectedNode = null; state.selectedRound = null; state.collapsed.clear(); state.transform = null; state.query = ''; state.statusFilter = 'all'; state.artifacts = []; state.artifact = null; state.artifactId = null; state.artifactError = '';
      $('#detail-dialog').close(); $('#edit-dialog').close(); state.editContext = null;
      $('#content').innerHTML = '<div class="loading-state"><div class="skeleton"></div><div class="skeleton"></div></div>';
      await loadBoard({force:true}); rememberView();
    } else if (target.id === 'scope-select') selectScope(target.value);
    else if (target.id === 'artifact-select') { state.artifactId = target.value; state.artifact = null; state.artifactQuery = ''; state.artifactSort = null; render(); await loadArtifacts(true); }
    else if (target.id === 'task-status') { state.statusFilter = target.value; state.transform = null; render(); }
    else if (target.id === 'show-archived') { state.showArchived = target.checked; state.transform = null; render(); }
    else if (target.id === 'tree-round') { state.selectedRound = target.value === 'latest' ? null : Number(target.value); render(); }
    else if (target.id === 'knowledge-history') { state.knowledgeHistory = target.checked; render(); }
  });
  document.addEventListener('submit', async event => {
    event.preventDefault();
    if (event.target.matches('#edit-form')) {
      try { await submitEditor(event.target); } catch (error) { showFormError(error.message); }
    } else if (event.target.matches('#auth-form')) {
      const form = event.target;
      const submit = $('[type=submit]',form);
      state.token = String(new FormData(form).get('token') || '').trim();
      submit.disabled = true;
      try {
        await loadProjects();
        sessionStorage.setItem('ctbz-token',state.token);
        $('#auth-dialog').close(); $('#auth-error').hidden = true;
        await loadBoard({force:true});
      } catch (error) { $('#auth-error').textContent = error.message; $('#auth-error').hidden = false; }
      finally { submit.disabled = false; }
    }
  });
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }
  window.addEventListener('online', () => loadBoard({force:true}));
  window.addEventListener('offline', () => { state.error = '网络连接已断开'; renderBanner(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !state.authNeeded) loadBoard(); });
  window.addEventListener('resize', () => { if (state.view === 'tasks' && state.taskView === 'tree') fitTree(); });
  start();
})();
