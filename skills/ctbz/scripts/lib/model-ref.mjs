// Discovery uses raw provider IDs; ZCode profiles require an encoded provider segment.
export function normalizeModelRef(value) {
  if (typeof value !== 'string' || /\s/.test(value)) throw Error('模型引用格式无效');
  const match = /^custom:(.+):([^:]+)$/.exec(value);
  if (!match) throw Error('模型引用格式无效');
  const provider = match[1].replace(/%3a/gi, ':').replace(/:/g, '%3A');
  return `custom:${provider}:${match[2]}`;
}

export function modelProvider(value) {
  return normalizeModelRef(value).split(':')[1].replace(/%3A/g, ':');
}

export function candidateModelRef(candidate) {
  const ref = normalizeModelRef(candidate.key);
  if (candidate.providerId !== undefined || candidate.modelId !== undefined) {
    if (typeof candidate.providerId !== 'string' || !candidate.providerId || /\s/.test(candidate.providerId) ||
        typeof candidate.modelId !== 'string' || !candidate.modelId || /[:\s]/.test(candidate.modelId)) {
      throw Error('候选渠道或模型 ID 无效：模型 ID 不支持裸冒号');
    }
    if (ref !== normalizeModelRef(`custom:${candidate.providerId}:${candidate.modelId}`)) {
      throw Error('候选模型引用与渠道/模型元数据不一致');
    }
  }
  return ref;
}
