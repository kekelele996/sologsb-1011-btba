export type ConnectionState = 'connected' | 'degraded' | 'offline';
export type SegmentState = 'pending' | 'confirmed' | 'duplicate' | 'stale' | 'ignored';
export type SegmentSource = 'live' | 'offline' | 'manual';

export interface CaptionSegment {
  id: string;
  sequence: number;
  startTime: number;
  receivedAt: number;
  confirmedAt?: number;
  speaker: string;
  original: string;
  corrected: string;
  numberHints: string;
  source: SegmentSource;
  state: SegmentState;
  duplicateOf?: string;
  staleReason?: string;
  revision: number;
  tags: string[];
}

export interface TermRule {
  id: string;
  source: string;
  replacement: string;
  speaker: string;
  enabled: boolean;
  caseSensitive: boolean;
  usageCount: number;
  createdAt: number;
}

export type QcIssueKind = 'punctuation' | 'number' | 'term' | 'stale' | 'duplicate';

export interface QcIssue {
  id: string;
  kind: QcIssueKind;
  segmentId: string;
  sequence: number;
  speaker: string;
  before: string;
  after: string;
  detail: string;
  ruleIds: string[];
  conflict: boolean;
  auto: boolean;
  selected: boolean;
}

export interface QcChange {
  segmentId: string;
  sequence: number;
  before: string;
  after: string;
  kinds: QcIssueKind[];
}

export interface QcRuleHit {
  ruleId: string;
  source: string;
  replacement: string;
  count: number;
}

export interface QcSkip {
  segmentId: string;
  sequence: number;
  kind: QcIssueKind;
  reason: string;
}

export interface QcBatchReport {
  changes: QcChange[];
  ruleHits: QcRuleHit[];
  conflicts: QcSkip[];
  acknowledged: QcSkip[];
  skipped: QcSkip[];
  appliedAt: number;
}

export interface QcBatch {
  id: string;
  createdAt: number;
  status: 'open' | 'committed';
  issues: QcIssue[];
  report?: QcBatchReport;
}

export interface DeskModel {
  eventName: string;
  eventDate: string;
  segments: CaptionSegment[];
  rules: TermRule[];
  selectedId: string;
  connection: ConnectionState;
  simulatedDelay: number;
  fontSize: number;
  nextSequence: number;
  autoStream: boolean;
  lastMergedAt?: number;
  qcBatch?: QcBatch | null;
  updatedAt: number;
}

export interface ToastMessage {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  subtitle: string;
}

const now = Date.now();
export const STORAGE_KEY = 'sologsb-1011-live-caption-desk-v1';

function segment(
  id: string,
  sequence: number,
  startTime: number,
  speaker: string,
  original: string,
  corrected = original,
  state: SegmentState = 'pending',
): CaptionSegment {
  return {
    id,
    sequence,
    startTime,
    receivedAt: now - (100 - sequence) * 8_000,
    confirmedAt: state === 'confirmed' ? now - (100 - sequence) * 7_000 : undefined,
    speaker,
    original,
    corrected,
    numberHints: '',
    source: 'live',
    state,
    revision: 0,
    tags: [],
  };
}

const seededSegments: CaptionSegment[] = [
  segment('seg-1', 1, 0, '主持人', '欢迎大家来到二零二六年产品发布会。', '欢迎大家来到2026年产品发布会。', 'confirmed'),
  segment('seg-2', 2, 7, '主讲人', '今天我们会介绍三个模块,首先是实时协作。', '今天我们会介绍三个模块，首先是实时协作。', 'confirmed'),
  segment('seg-3', 3, 15, '主讲人', '延迟和质量监测会帮助我们保持字幕稳定。', '延迟和质量监测会帮助我们保持字幕稳定。', 'confirmed'),
  segment('seg-4', 4, 24, '嘉宾 / 周然', '我们使用 studio cloud 作为演示环境。', '我们使用 Studio Cloud 作为演示环境。', 'pending'),
  segment('seg-5', 5, 34, '嘉宾 / 周然', '每分钟大约会收到一百二十个片段。', '每分钟大约会收到120个片段。', 'pending'),
  segment('seg-6', 6, 43, '主持人', '如果主持人提到 co pilot,需要统一大小写。', '如果主持人提到 Co-Pilot，需要统一大小写。', 'pending'),
  segment('seg-7', 7, 52, '主持人', '这个例子会演示五G网络下的字幕恢复。', '这个例子会演示5G网络下的字幕恢复。', 'pending'),
];

const duplicate: CaptionSegment = {
  ...segment('seg-8', 8, 61, '主讲人', '今天我们重点讨论字幕队列。', '今天我们重点讨论字幕队列。', 'duplicate'),
  source: 'live',
  duplicateOf: 'seg-2',
  staleReason: '与第 2 段高度相似',
};

export function createInitialModel(): DeskModel {
  return {
    eventName: '新品发布会现场字幕',
    eventDate: new Date(now).toISOString().slice(0, 10),
    segments: [...seededSegments, duplicate],
    rules: [
      { id: 'term-1', source: 'co pilot', replacement: 'Co-Pilot', speaker: '', enabled: true, caseSensitive: false, usageCount: 4, createdAt: now - 86_400_000 },
      { id: 'term-2', source: 'studio cloud', replacement: 'Studio Cloud', speaker: '', enabled: true, caseSensitive: false, usageCount: 7, createdAt: now - 43_200_000 },
      { id: 'term-3', source: '五G', replacement: '5G', speaker: '', enabled: true, caseSensitive: true, usageCount: 2, createdAt: now - 3_600_000 },
    ],
    selectedId: 'seg-4',
    connection: 'connected',
    simulatedDelay: 1.8,
    fontSize: 18,
    nextSequence: 9,
    autoStream: true,
    qcBatch: null,
    updatedAt: now,
  };
}

export function cloneModel(model: DeskModel): DeskModel {
  return structuredClone(model);
}

const FULLWIDTH_DIGITS: Record<string, string> = { '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9' };

function chineseNumberToInt(raw: string): number {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!/[十百千万]/u.test(raw)) return Number([...raw].map((char) => digits[char] ?? 0).join(''));
  let total = 0;
  let section = 0;
  let number = 0;
  for (const char of raw) {
    if (digits[char] !== undefined) {
      number = digits[char];
    } else if (char === '十') {
      section += (number || 1) * 10;
      number = 0;
    } else if (char === '百') {
      section += (number || 1) * 100;
      number = 0;
    } else if (char === '千') {
      section += (number || 1) * 1000;
      number = 0;
    } else if (char === '万') {
      total += (section + number) * 10_000;
      section = 0;
      number = 0;
    }
  }
  return total + section + number;
}

export function normalizeNumbers(text: string): string {
  return text
    .replace(/[０-９]/g, (char) => FULLWIDTH_DIGITS[char] ?? char)
    .replace(/([零〇一二两三四五六七八九十百千万]+)/gu, (match) => String(chineseNumberToInt(match)))
    .replace(/(?<=\d)[，,](?=\d{3}\b)/g, ',');
}

export function normalizeNumbersSafe(text: string): string {
  return text
    .replace(/[０-９]/g, (char) => FULLWIDTH_DIGITS[char] ?? char)
    .replace(/([零〇一二两三四五六七八九十百千万]{2,})/gu, (match) => String(chineseNumberToInt(match)))
    .replace(/(?<=\d)[，,](?=\d{3}\b)/g, ',');
}

export function normalizePunctuation(text: string): string {
  return text
    .replace(/([，。！？；：])(?=[^\s，。！？；：])/gu, '$1')
    .replace(/\s+([，。！？；：])/gu, '$1')
    .replace(/([,;:!?])(?=[^\s,;:!?])/g, (match) => ({ ',': '，', ';': '；', ':': '：', '!': '！', '?': '？' }[match] ?? match));
}

export function applyRules(text: string, model: DeskModel): { text: string; used: string[] } {
  let next = text;
  const used: string[] = [];
  for (const rule of model.rules.filter((item) => item.enabled)) {
    if (!rule.source || !next) continue;
    const flags = rule.caseSensitive ? 'g' : 'gi';
    const expression = new RegExp(rule.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    if (expression.test(next)) {
      next = next.replace(expression, rule.replacement);
      used.push(rule.id);
    }
  }
  return { text: normalizePunctuation(next), used };
}

function ruleExpression(rule: TermRule): RegExp {
  return new RegExp(rule.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), rule.caseSensitive ? 'g' : 'gi');
}

export function ruleMatches(rule: TermRule, text: string): boolean {
  if (!rule.source || !text) return false;
  return ruleExpression(rule).test(text);
}

export function applyTermRule(rule: TermRule, text: string): string {
  return text.replace(ruleExpression(rule), rule.replacement);
}

function ruleAppliesToSpeaker(rule: TermRule, speaker: string): boolean {
  return rule.enabled && (!rule.speaker || rule.speaker === speaker);
}

export function scanQcIssues(model: DeskModel): QcIssue[] {
  const issues: QcIssue[] = [];
  for (const segment of model.segments) {
    if (segment.state === 'confirmed' || segment.state === 'ignored') continue;
    const base = {
      segmentId: segment.id,
      sequence: segment.sequence,
      speaker: segment.speaker,
      before: segment.corrected,
    };
    if (segment.state === 'stale') {
      issues.push({ ...base, id: `${segment.id}-stale`, kind: 'stale', after: segment.corrected, detail: segment.staleReason || '片段等待超过 90 秒未确认', ruleIds: [], conflict: false, auto: false, selected: false });
      continue;
    }
    if (segment.state === 'duplicate') {
      issues.push({ ...base, id: `${segment.id}-duplicate`, kind: 'duplicate', after: segment.corrected, detail: segment.staleReason || '与已有片段高度相似', ruleIds: [], conflict: false, auto: false, selected: false });
      continue;
    }
    const punctuation = normalizePunctuation(segment.corrected);
    if (punctuation !== segment.corrected) {
      issues.push({ ...base, id: `${segment.id}-punctuation`, kind: 'punctuation', after: punctuation, detail: '存在可规范化的中英文标点或多余空格', ruleIds: [], conflict: false, auto: true, selected: true });
    }
    const numbers = normalizeNumbersSafe(segment.corrected);
    if (numbers !== segment.corrected) {
      issues.push({ ...base, id: `${segment.id}-number`, kind: 'number', after: numbers, detail: '存在可规范化的全角数字或中文数字', ruleIds: [], conflict: false, auto: true, selected: true });
    }
    const matched = model.rules.filter((rule) => ruleAppliesToSpeaker(rule, segment.speaker) && ruleMatches(rule, segment.corrected));
    if (matched.length > 1) {
      issues.push({
        ...base,
        id: `${segment.id}-term-conflict`,
        kind: 'term',
        after: segment.corrected,
        detail: `命中 ${matched.length} 条术语规则（${matched.map((rule) => `${rule.source} → ${rule.replacement}`).join('、')}），无法安全自动改写，已保留原内容`,
        ruleIds: matched.map((rule) => rule.id),
        conflict: true,
        auto: false,
        selected: false,
      });
    } else if (matched.length === 1) {
      const [rule] = matched;
      const replaced = applyTermRule(rule, segment.corrected);
      if (replaced !== segment.corrected) {
        issues.push({ ...base, id: `${segment.id}-term`, kind: 'term', after: replaced, detail: `命中术语规则 ${rule.source} → ${rule.replacement}`, ruleIds: [rule.id], conflict: false, auto: true, selected: true });
      }
    }
  }
  return issues;
}

export function createQcBatch(model: DeskModel): QcBatch {
  return {
    id: `qc-${Date.now().toString(36)}`,
    createdAt: Date.now(),
    status: 'open',
    issues: scanQcIssues(model),
  };
}

export function computeQcOutcome(model: DeskModel): QcBatchReport {
  const report: QcBatchReport = { changes: [], ruleHits: [], conflicts: [], acknowledged: [], skipped: [], appliedAt: Date.now() };
  const batch = model.qcBatch;
  if (!batch || batch.status !== 'open') return report;
  const byId = new Map(model.segments.map((segment) => [segment.id, segment]));
  const autoBySegment = new Map<string, QcIssue[]>();
  for (const issue of batch.issues) {
    const segment = byId.get(issue.segmentId);
    if (issue.kind === 'stale' || issue.kind === 'duplicate') {
      const entry = { segmentId: issue.segmentId, sequence: issue.sequence, kind: issue.kind, reason: issue.detail };
      if (issue.selected) {
        report.acknowledged.push(entry);
      } else {
        report.skipped.push({ ...entry, reason: `${issue.detail}（${issue.kind === 'stale' ? '超时' : '重复'}项默认跳过，需人工处理）` });
      }
      continue;
    }
    if (issue.conflict) {
      report.conflicts.push({ segmentId: issue.segmentId, sequence: issue.sequence, kind: 'term', reason: issue.detail });
      continue;
    }
    if (!issue.selected) continue;
    if (!segment || segment.state !== 'pending') {
      report.skipped.push({ segmentId: issue.segmentId, sequence: issue.sequence, kind: issue.kind, reason: '片段已确认或状态变化，跳过该项' });
      continue;
    }
    autoBySegment.set(issue.segmentId, [...(autoBySegment.get(issue.segmentId) ?? []), issue]);
  }
  const ruleHitMap = new Map<string, QcRuleHit>();
  for (const [segmentId, issues] of autoBySegment) {
    const segment = byId.get(segmentId);
    if (!segment) continue;
    let text = segment.corrected;
    const kinds: QcIssueKind[] = [];
    const termIssue = issues.find((issue) => issue.kind === 'term');
    if (termIssue) {
      const rule = model.rules.find((item) => item.id === termIssue.ruleIds[0]);
      if (rule && ruleAppliesToSpeaker(rule, segment.speaker) && ruleMatches(rule, text)) {
        const replaced = applyTermRule(rule, text);
        if (replaced !== text) {
          text = replaced;
          kinds.push('term');
          const hit = ruleHitMap.get(rule.id) ?? { ruleId: rule.id, source: rule.source, replacement: rule.replacement, count: 0 };
          hit.count += 1;
          ruleHitMap.set(rule.id, hit);
        }
      }
    }
    if (issues.some((issue) => issue.kind === 'punctuation')) {
      const normalized = normalizePunctuation(text);
      if (normalized !== text) {
        text = normalized;
        kinds.push('punctuation');
      }
    }
    if (issues.some((issue) => issue.kind === 'number')) {
      const normalized = normalizeNumbersSafe(text);
      if (normalized !== text) {
        text = normalized;
        kinds.push('number');
      }
    }
    if (text !== segment.corrected) {
      report.changes.push({ segmentId, sequence: segment.sequence, before: segment.corrected, after: text, kinds });
    }
  }
  report.ruleHits = [...ruleHitMap.values()];
  return report;
}

export function applyQcBatch(model: DeskModel): DeskModel {
  const batch = model.qcBatch;
  if (!batch || batch.status !== 'open') return model;
  const report = computeQcOutcome(model);
  const changeById = new Map(report.changes.map((change) => [change.segmentId, change]));
  const acknowledgedIds = new Set(report.acknowledged.map((entry) => entry.segmentId));
  const ruleUsage = new Map(report.ruleHits.map((hit) => [hit.ruleId, hit.count]));
  const segments = model.segments.map((segment) => {
    const change = changeById.get(segment.id);
    const acknowledged = acknowledgedIds.has(segment.id);
    if (!change && !acknowledged) return segment;
    return {
      ...segment,
      corrected: change ? change.after : segment.corrected,
      tags: [...new Set([...segment.tags, ...(change ? ['批次自动校正'] : []), ...(acknowledged ? ['批次已知晓'] : [])])],
      revision: segment.revision + 1,
    };
  });
  return {
    ...model,
    segments,
    rules: model.rules.map((rule) => ruleUsage.has(rule.id) ? { ...rule, usageCount: rule.usageCount + (ruleUsage.get(rule.id) ?? 0) } : rule),
    qcBatch: { ...batch, status: 'committed', report },
    updatedAt: Date.now(),
  };
}

export function isDuplicate(candidate: CaptionSegment, existing: CaptionSegment[]): CaptionSegment | undefined {
  const normalize = (value: string) => value.replace(/[\s，。！？；：,.;:!?]/g, '').toLocaleLowerCase();
  const candidateText = normalize(candidate.corrected || candidate.original);
  return existing.find((segmentItem) => {
    if (segmentItem.id === candidate.id || segmentItem.state === 'ignored') return false;
    const text = normalize(segmentItem.corrected || segmentItem.original);
    if (!candidateText || !text) return false;
    return text === candidateText || (Math.abs(segmentItem.startTime - candidate.startTime) < 12 && (text.includes(candidateText) || candidateText.includes(text)));
  });
}

export function mergeConfirmedSegments(model: DeskModel): DeskModel {
  const seen: string[] = [];
  const segments = model.segments
    .map((item) => ({ ...item }))
    .sort((a, b) => a.sequence - b.sequence || a.startTime - b.startTime)
    .map((item): CaptionSegment => {
      if (item.source === 'offline' && item.state === 'confirmed') {
        item.source = item.confirmedAt && Date.now() - item.confirmedAt > 90_000 ? 'offline' : 'live';
        item.staleReason = Date.now() - item.receivedAt > 90_000 ? `离线恢复后合并，原始片段已延迟 ${Math.round((Date.now() - item.receivedAt) / 1000)} 秒` : undefined;
        if (item.staleReason) item.state = 'stale';
      }
      const duplicate = isDuplicate(item, seen.map((id) => model.segments.find((segmentItem) => segmentItem.id === id)).filter(Boolean) as CaptionSegment[]);
      if (duplicate && item.state !== 'confirmed') {
        item.state = 'duplicate';
        item.duplicateOf = duplicate.id;
      }
      if (item.state !== 'ignored') seen.push(item.id);
      return item;
    });

  return {
    ...model,
    segments,
    connection: 'connected',
    simulatedDelay: Math.max(0.8, model.simulatedDelay - 0.7),
    lastMergedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function queueStats(model: DeskModel) {
  const pending = model.segments.filter((item) => item.state === 'pending');
  const stale = model.segments.filter((item) => item.state === 'stale');
  const duplicate = model.segments.filter((item) => item.state === 'duplicate');
  const offline = model.segments.filter((item) => item.source === 'offline' && item.state === 'confirmed');
  return {
    pending: pending.length,
    stale: stale.length,
    duplicate: duplicate.length,
    offline: offline.length,
    backlog: pending.length + stale.length + duplicate.length + offline.length,
    oldestWaitSeconds: pending.length ? Math.max(...pending.map((item) => Math.round((Date.now() - item.receivedAt) / 1000))) : 0,
  };
}

export function createLiveSegment(sequence: number): CaptionSegment {
  const speakers = ['主持人', '主讲人', '嘉宾 / 周然', '现场提问'];
  const samples = [
    '接下来请产品团队介绍新的工作流。',
    '请注意屏幕右侧的实时队列状态。',
    '在弱网环境下我们会保留未确认片段。',
    '如果网络恢复,系统会按照时间顺序自动合并。',
    '这段字幕包含二零二五年的项目数据。',
    '大家可以在会后查看完整回放和术语表。',
  ];
  const start = Math.max(0, sequence * 9 - 10);
  return {
    id: `seg-live-${sequence}-${Date.now().toString(36)}`,
    sequence,
    startTime: start,
    receivedAt: Date.now(),
    speaker: speakers[(sequence - 1) % speakers.length],
    original: samples[(sequence - 1) % samples.length],
    corrected: samples[(sequence - 1) % samples.length],
    numberHints: '',
    source: 'live',
    state: 'pending',
    revision: 0,
    tags: [],
  };
}

export function simulateLatency(model: DeskModel): DeskModel {
  if (model.connection === 'offline') return model;
  const step = model.connection === 'degraded' ? 0.7 : model.simulatedDelay > 2.8 ? -0.3 : 0.15;
  const delay = Math.max(0.7, Math.min(8.9, Number((model.simulatedDelay + step).toFixed(1))));
  const applyStream = model.autoStream && Math.random() > 0.68;
  let nextSequence = model.nextSequence;
  let segments = model.segments;
  if (applyStream) {
    const candidate = createLiveSegment(model.nextSequence);
    const duplicate = isDuplicate(candidate, segments);
    segments = [...segments, duplicate ? { ...candidate, state: 'duplicate', duplicateOf: duplicate.id, staleReason: `与第 ${duplicate.sequence} 段重复` } : candidate];
    nextSequence += 1;
  }
  const pendingCutoff = Date.now() - 90_000;
  segments = segments.map((item) => item.state === 'pending' && item.receivedAt < pendingCutoff
    ? { ...item, state: 'stale', staleReason: `片段已等待 ${Math.round((Date.now() - item.receivedAt) / 1000)} 秒` }
    : item);
  return {
    ...model,
    segments,
    nextSequence,
    simulatedDelay: delay,
    connection: delay > 4.2 ? 'degraded' : model.connection,
    updatedAt: Date.now(),
  };
}

export function toSrt(model: DeskModel): string {
  const stamp = (seconds: number, separator = ',') => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.round((seconds - Math.floor(seconds)) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}${separator}${String(millis).padStart(3, '0')}`;
  };
  return model.segments
    .filter((item) => item.state === 'confirmed')
    .sort((a, b) => a.startTime - b.startTime)
    .map((item, index) => `${index + 1}\n${stamp(item.startTime)} --> ${stamp(item.startTime + 7)}\n[${item.speaker}] ${item.corrected}\n`)
    .join('\n');
}
