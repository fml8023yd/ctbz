// T4 存根：ZCode profile 注册链已退役。原模块导出 highest/initialize/selectProfile 不再提供实现。
// 角色改由 subagent 实例的 persona / toolFilter / agentOptions 表达；派发走 workflow。
const retired = (name) => () => {
  throw Error(
    `dsh 版不支持 ZCode profile 注册链：${name} 已退役。角色改由 subagent 实例的 persona / toolFilter / agentOptions 表达；派发走 workflow。`
  );
};

export const highest = retired("highest");
export const initialize = retired("initialize");
export const selectProfile = retired("selectProfile");
