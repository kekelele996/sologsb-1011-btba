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

export type BatchIssueCategory = 'punctuation' | 'number' | 'term' | 'stale' | 'duplicate';

export interface BatchIssue {
  id: string;
  category: BatchIssueCategory;
  segmentId: string;
  sequence: number;
  startTime: number;
  speaker: string;
  before: string;
  after?: string;
  summary: string;
  conflict?: string;
  ruleIds: string[];
  /** 超时、重复和术语冲突不会被自动改写，只能勾选“人工已核对”。 */
  blocked: boolean;
  selected: boolean;
}

export type BatchItemStatus = 'applied' | 'checked' | 'skipped' | 'conflict';

export interface BatchReportItem {
  issueId: string;
  category: BatchIssueCategory;
  segmentId: string;
  sequence: number;
  summary: string;
  status: BatchItemStatus;
  before: string;
  after?: string;
  note?: string;
}

export interface BatchRuleStat {
  ruleId: string;
  source: string;
  replacement: string;
  hits: number;
  appliedSegments: number;
  conflicts: number;
}

export interface BatchReport {
  id: string;
  startedAt: number;
  submittedAt: number;
  undoneAt?: number;
  counts: Record<BatchIssueCategory, number>;
  appliedCount: number;
  checkedCount: number;
  skippedCount: number;
  conflictCount: number;
  ruleStats: BatchRuleStat[];
  items: BatchReportItem[];
}

export interface BatchPreviewRow {
  segmentId: string;
  sequence: number;
  speaker: string;
  before: string;
  after: string;
  changed: boolean;
  /** 该段的超时/重复问题被勾选为“人工已核对”。 */
  checked: boolean;
  checkedOnly: boolean;
  conflict?: string;
}

export interface BatchDraftSnapshot {
  segments: CaptionSegment[];
  rules: TermRule[];
  issues: BatchIssue[];
}

export interface BatchDraft {
  id: string;
  startedAt: number;
  issues: BatchIssue[];
  /** 批次开始时的内容快照，供整批撤销恢复。 */
  snapshot: BatchDraftSnapshot;
}

export interface BatchUndoSnapshot {
  reportId: string;
  snapshot: BatchDraftSnapshot;
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
  batchDraft?: BatchDraft | null;
  batchReports?: BatchReport[];
  /** 最近一次提交的开始前快照，用于重开页面后仍能整批恢复。 */
  batchUndo?: BatchUndoSnapshot | null;
  lastMergedAt?: number;
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

// 质检批次演示片段：seg-9 同段命中两条术语规则（冲突），seg-10 含全角与中文数字，seg-11 已超时。
const batchDemoSegments: CaptionSegment[] = [
  { ...segment('seg-9', 9, 70, '主讲人', '下一场演示会用到 co pilot 和 studio cloud,大家注意听,细节很多。'), receivedAt: now - 26_000 },
  { ...segment('seg-10', 10, 79, '嘉宾 / 周然', '本场演示已经持续了４５分钟,在线人数突破一万二千人。'), receivedAt: now - 41_000 },
  { ...segment('seg-11', 11, 88, '主持人', '稍后我们会回答大家关心的问题,请稍等。', '稍后我们会回答大家关心的问题,请稍等。', 'stale'), receivedAt: now - 240_000, staleReason: '片段已等待 240 秒' },
];

export function createInitialModel(): DeskModel {
  return {
    eventName: '新品发布会现场字幕',
    eventDate: new Date(now).toISOString().slice(0, 10),
    segments: [...seededSegments, duplicate, ...batchDemoSegments],
    rules: [
      { id: 'term-1', source: 'co pilot', replacement: 'Co-Pilot', speaker: '', enabled: true, caseSensitive: false, usageCount: 4, createdAt: now - 86_400_000 },
      { id: 'term-2', source: 'studio cloud', replacement: 'Studio Cloud', speaker: '', enabled: true, caseSensitive: false, usageCount: 7, createdAt: now - 43_200_000 },
      { id: 'term-3', source: '五G', replacement: '5G', speaker: '', enabled: true, caseSensitive: true, usageCount: 2, createdAt: now - 3_600_000 },
    ],
    selectedId: 'seg-4',
    connection: 'connected',
    simulatedDelay: 1.8,
    fontSize: 18,
    nextSequence: 12,
    autoStream: true,
    batchDraft: null,
    batchReports: [],
    batchUndo: null,
    updatedAt: now,
  };
}

export function cloneModel(model: DeskModel): DeskModel {
  return structuredClone(model);
}

const fullWidthDigitMap: Record<string, string> = { '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9' };
const chineseDigits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function chineseNumber(raw: string): number {
  if (!/[十百千万]/u.test(raw)) return Number([...raw].map((char) => chineseDigits[char] ?? 0).join(''));
  let total = 0;
  let section = 0;
  let number = 0;
  for (const char of raw) {
    if (chineseDigits[char] !== undefined) {
      number = chineseDigits[char];
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

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeNumbers(text: string): string {
  return text
    .replace(/[０-９]/g, (char) => fullWidthDigitMap[char] ?? char)
    .replace(/([零〇一二两三四五六七八九十百千万]+)/gu, (match) => String(chineseNumber(match)))
    .replace(/(?<=\d)[，,](?=\d{3}\b)/g, ',');
}

/**
 * 批次只自动套用可安全改写的数字规则：
 * 全角数字转半角、千分位逗号统一，以及明确带“十/百/千/万”位的中文数字；
 * 孤立的“一/二/三”等量词式数字不做转换，避免把“三个模块”改成“3个模块”。
 */
export function safeNumberRewrite(text: string): string {
  return text
    .replace(/[０-９]/g, (char) => fullWidthDigitMap[char] ?? char)
    .replace(/[零〇一二两三四五六七八九]*[十百千万][零〇一二两三四五六七八九十百千万]*/gu, (match) => (
      match.length > 1 ? String(chineseNumber(match)) : match
    ))
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
    const expression = new RegExp(escapeRegExp(rule.source), flags);
    if (expression.test(next)) {
      next = next.replace(expression, rule.replacement);
      used.push(rule.id);
    }
  }
  return { text: normalizePunctuation(next), used };
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

export const BATCH_STALE_MS = 90_000;

export const BATCH_CATEGORY_META: Record<BatchIssueCategory, { label: string; hint: string }> = {
  punctuation: { label: '标点', hint: '半角标点转全角、去除标点前多余空格' },
  number: { label: '数字', hint: '全角数字转半角、千分位统一、带位数的中文数字转阿拉伯数字' },
  term: { label: '术语', hint: '命中已启用术语规则；同一段命中多条规则时整段保留原文并标记冲突' },
  stale: { label: '超时', hint: `等待超过 ${BATCH_STALE_MS / 1000} 秒未确认，默认跳过；勾选仅标记“人工已核对”` },
  duplicate: { label: '重复', hint: '与队列中其他片段高度相似，默认跳过；勾选仅标记“人工已核对”' },
};

function termHitCount(rule: TermRule, text: string): number {
  const expression = new RegExp(escapeRegExp(rule.source), rule.caseSensitive ? 'g' : 'gi');
  return (text.match(expression) ?? []).length;
}

/** 扫描待确认/超时/重复片段，把风险归类为五个质检批次问题组。 */
export function scanBatchIssues(model: DeskModel): BatchIssue[] {
  const issues: BatchIssue[] = [];
  const candidates = model.segments.filter(
    (item) => item.state === 'pending' || item.state === 'stale' || item.state === 'duplicate',
  );
  const nowMs = Date.now();

  for (const segmentItem of candidates) {
    const text = segmentItem.corrected;
    const base = {
      segmentId: segmentItem.id,
      sequence: segmentItem.sequence,
      startTime: segmentItem.startTime,
      speaker: segmentItem.speaker,
      before: text,
    };

    const punctuationAfter = normalizePunctuation(text);
    if (punctuationAfter !== text) {
      issues.push({
        ...base,
        id: `punctuation:${segmentItem.id}`,
        category: 'punctuation',
        after: punctuationAfter,
        summary: '标点规范化（半角转全角）',
        ruleIds: [],
        blocked: false,
        selected: true,
      });
    }

    const numberAfter = safeNumberRewrite(text);
    if (numberAfter !== text) {
      issues.push({
        ...base,
        id: `number:${segmentItem.id}`,
        category: 'number',
        after: numberAfter,
        summary: '数字安全规范化（全角 / 带位数的中文数字）',
        ruleIds: [],
        blocked: false,
        selected: true,
      });
    }

    const applicableRules = model.rules
      .filter((rule) => rule.enabled && rule.source && (!rule.speaker || rule.speaker === segmentItem.speaker))
      .map((rule) => ({ rule, hits: termHitCount(rule, text) }))
      .filter((entry) => entry.hits > 0 && ruleReplaces(entry.rule, text));

    if (applicableRules.length > 1) {
      const detail = applicableRules.map((entry) => `${entry.rule.source} → ${entry.rule.replacement}`).join('；');
      const conflictReason = `该段同时命中 ${applicableRules.length} 条术语规则（${detail}），自动改写无法保证顺序正确，已整段保留原内容，请逐条人工处理。`;
      // 冲突段上的标点、数字安全改写也一并停用，确保整段保持原内容。
      for (const issue of issues) {
        if (issue.segmentId === segmentItem.id && issue.category !== 'term') {
          issue.blocked = true;
          issue.selected = false;
          issue.conflict = `同段命中多条术语规则，整段保留原内容：${detail}`;
        }
      }
      issues.push({
        ...base,
        id: `term:${segmentItem.id}`,
        category: 'term',
        summary: `同段命中 ${applicableRules.length} 条术语规则`,
        conflict: conflictReason,
        ruleIds: applicableRules.map((entry) => entry.rule.id),
        blocked: true,
        selected: false,
      });
    } else if (applicableRules.length === 1) {
      const { rule, hits } = applicableRules[0];
      const expression = new RegExp(escapeRegExp(rule.source), rule.caseSensitive ? 'g' : 'gi');
      issues.push({
        ...base,
        id: `term:${segmentItem.id}`,
        category: 'term',
        after: text.replace(expression, rule.replacement),
        summary: `${rule.source} → ${rule.replacement}（${hits} 处）`,
        ruleIds: [rule.id],
        blocked: false,
        selected: true,
      });
    }

    const waitSeconds = Math.round((nowMs - segmentItem.receivedAt) / 1000);
    const isStale = segmentItem.state === 'stale'
      || (segmentItem.state === 'pending' && nowMs - segmentItem.receivedAt > BATCH_STALE_MS);
    if (isStale) {
      issues.push({
        ...base,
        id: `stale:${segmentItem.id}`,
        category: 'stale',
        summary: segmentItem.staleReason || `片段已等待 ${waitSeconds} 秒`,
        ruleIds: [],
        blocked: true,
        selected: false,
      });
    }

    if (segmentItem.state === 'duplicate') {
      issues.push({
        ...base,
        id: `duplicate:${segmentItem.id}`,
        category: 'duplicate',
        summary: segmentItem.staleReason || '与已有片段高度相似',
        ruleIds: [],
        blocked: true,
        selected: false,
      });
    }
  }

  return issues;
}

function ruleReplaces(rule: TermRule, text: string): boolean {
  const expression = new RegExp(escapeRegExp(rule.source), rule.caseSensitive ? 'g' : 'gi');
  return text.replace(expression, rule.replacement) !== text;
}

/** 创建新批次：扫描问题并保存开始时快照。 */
export function createBatchDraft(model: DeskModel): BatchDraft {
  const issues = scanBatchIssues(model);
  return {
    id: `batch-${Date.now().toString(36)}`,
    startedAt: Date.now(),
    issues,
    snapshot: {
      segments: clonePlain(model.segments),
      rules: clonePlain(model.rules),
      issues: clonePlain(issues),
    },
  };
}

/** 刷新批次问题清单（新片段到达/内容变化），保留校对员已有勾选。 */
export function refreshBatchDraft(draft: BatchDraft, model: DeskModel): BatchDraft {
  const fresh = scanBatchIssues(model);
  return { ...draft, issues: mergeIssueSelections(fresh, draft.issues) };
}

/** 从开始前快照恢复批次草稿（整批撤销后回到未完成状态）。 */
export function rehydrateBatchDraft(snapshot: BatchDraftSnapshot): BatchDraft {
  return {
    id: `batch-restored-${Date.now().toString(36)}`,
    startedAt: Date.now(),
    issues: clonePlain(snapshot.issues),
    snapshot: clonePlain(snapshot),
  };
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 重新扫描时沿用旧草稿里的勾选状态，未完成项不会因为刷新而丢失。 */
export function mergeIssueSelections(fresh: BatchIssue[], previous: BatchIssue[]): BatchIssue[] {
  const selectedById = new Map(previous.map((issue) => [issue.id, issue.selected]));
  return fresh.map((issue) => {
    // 术语冲突项（含同段被停用的标点/数字）强制不可勾选；超时/重复保留人工核对标记。
    if (issue.blocked && issue.category !== 'stale' && issue.category !== 'duplicate') {
      return { ...issue, selected: false };
    }
    return selectedById.has(issue.id) ? { ...issue, selected: selectedById.get(issue.id)! } : issue;
  });
}

/**
 * 按 术语 → 数字 → 标点 的顺序把同段勾选的规则叠加到一份文本上，
 * 避免每条问题各自保存的“改后文本”互相覆盖。
 * 同段命中多条术语规则（冲突）时整段保留原内容，不做任何自动改写。
 */
function composeSegmentText(
  text: string,
  related: BatchIssue[],
  rules: TermRule[],
): { text: string; termRuleHits: Map<string, number> } {
  const termRuleHits = new Map<string, number>();
  const hasConflict = related.some((issue) => issue.category === 'term' && issue.conflict);
  if (hasConflict) return { text, termRuleHits };

  let next = text;
  const termIssue = related.find((issue) => issue.category === 'term');

  if (termIssue?.selected && !termIssue.blocked) {
    const rule = rules.find((item) => item.id === termIssue.ruleIds[0]);
    if (rule) {
      const expression = new RegExp(escapeRegExp(rule.source), rule.caseSensitive ? 'g' : 'gi');
      const hits = (next.match(expression) ?? []).length;
      next = next.replace(expression, rule.replacement);
      if (hits) termRuleHits.set(rule.id, hits);
    }
  }
  if (related.some((issue) => issue.category === 'number' && issue.selected && !issue.blocked)) {
    next = safeNumberRewrite(next);
  }
  if (related.some((issue) => issue.category === 'punctuation' && issue.selected && !issue.blocked)) {
    next = normalizePunctuation(next);
  }
  return { text: next, termRuleHits };
}

/** 生成预览表：每段一行，展示原文到改后文，或仅核对 / 冲突保留。 */
export function composeBatchPreview(issues: BatchIssue[], segments: CaptionSegment[], rules: TermRule[]): BatchPreviewRow[] {
  const rows: BatchPreviewRow[] = [];
  for (const segmentId of new Set(issues.map((issue) => issue.segmentId))) {
    const segmentItem = segments.find((item) => item.id === segmentId);
    if (!segmentItem) continue;
    const related = issues.filter((issue) => issue.segmentId === segmentId);
    const conflict = related.find((issue) => issue.conflict && issue.category === 'term');
    const text = conflict
      ? segmentItem.corrected
      : composeSegmentText(segmentItem.corrected, related, rules).text;
    const checked = !conflict
      && related.some((issue) => issue.selected && (issue.category === 'stale' || issue.category === 'duplicate'));
    const checkedOnly = checked && text === segmentItem.corrected;
    if (text !== segmentItem.corrected || checkedOnly || conflict) {
      rows.push({
        segmentId,
        sequence: segmentItem.sequence,
        speaker: segmentItem.speaker,
        before: segmentItem.corrected,
        after: text,
        changed: text !== segmentItem.corrected,
        checked,
        checkedOnly,
        conflict: conflict?.conflict,
      });
    }
  }
  return rows.sort((a, b) => a.sequence - b.sequence);
}

/** 一次提交整个批次：套用已勾选的安全改写，超时/重复仅打核对标记，冲突保留原文。 */
export function submitBatch(model: DeskModel, draft: BatchDraft): { model: DeskModel; report: BatchReport } {
  const submittedAt = Date.now();
  const segments = model.segments.map((item) => ({ ...item }));
  const rules = model.rules;
  const items: BatchReportItem[] = [];
  const termHits = new Map<string, number>();
  const termSegments = new Map<string, number>();
  const termConflicts = new Map<string, number>();
  const counts: Record<BatchIssueCategory, number> = { punctuation: 0, number: 0, term: 0, stale: 0, duplicate: 0 };

  for (const issue of draft.issues) counts[issue.category] += 1;

  for (const segmentId of new Set(draft.issues.map((issue) => issue.segmentId))) {
    const segmentItem = segments.find((item) => item.id === segmentId);
    const related = draft.issues.filter((issue) => issue.segmentId === segmentId);
    if (!segmentItem) {
      for (const issue of related) {
        items.push({ issueId: issue.id, category: issue.category, segmentId, sequence: issue.sequence, summary: issue.summary, status: 'skipped', before: issue.before, note: '片段已不在队列中' });
      }
      continue;
    }

    const before = segmentItem.corrected;
    const segmentHasConflict = related.some((issue) => issue.conflict);
    const { text, termRuleHits } = composeSegmentText(before, related, rules);
    for (const [ruleId, hits] of termRuleHits) {
      termHits.set(ruleId, (termHits.get(ruleId) ?? 0) + hits);
      termSegments.set(ruleId, (termSegments.get(ruleId) ?? 0) + 1);
    }

    if (text !== before) {
      segmentItem.corrected = text;
      segmentItem.revision += 1;
      segmentItem.tags = [...new Set([...segmentItem.tags, '批次已校对'])];
    }
    if (related.some((issue) => issue.selected && (issue.category === 'stale' || issue.category === 'duplicate'))) {
      segmentItem.tags = [...new Set([...segmentItem.tags, '批次已核对'])];
    }

    for (const issue of related) {
      const common = { issueId: issue.id, category: issue.category, segmentId, sequence: issue.sequence, summary: issue.summary, before };
      if (issue.category === 'stale' || issue.category === 'duplicate') {
        items.push(issue.selected
          ? { ...common, status: 'checked', after: before, note: '人工已核对，内容保持不变' }
          : { ...common, status: 'skipped', note: issue.category === 'stale' ? '超时项默认跳过，未改动内容' : '重复项默认跳过，未改动内容' });
      } else if (issue.category === 'term' && issue.conflict) {
        for (const ruleId of issue.ruleIds) termConflicts.set(ruleId, (termConflicts.get(ruleId) ?? 0) + 1);
        items.push({ ...common, status: 'conflict', after: before, note: issue.conflict });
      } else if (segmentHasConflict) {
        items.push({ ...common, status: 'skipped', note: '所在段命中多条术语规则，已整段保留原内容' });
      } else if (issue.selected) {
        items.push({ ...common, status: 'applied', after: text });
      } else {
        items.push({ ...common, status: 'skipped', note: '未勾选，保持原内容' });
      }
    }
  }

  const referencedRuleIds = new Set([...termHits.keys(), ...termConflicts.keys()]);
  const ruleStats: BatchRuleStat[] = rules
    .filter((rule) => referencedRuleIds.has(rule.id))
    .map((rule) => ({
      ruleId: rule.id,
      source: rule.source,
      replacement: rule.replacement,
      hits: termHits.get(rule.id) ?? 0,
      appliedSegments: termSegments.get(rule.id) ?? 0,
      conflicts: termConflicts.get(rule.id) ?? 0,
    }));

  const nextRules = rules.map((rule) => (termHits.has(rule.id)
    ? { ...rule, usageCount: rule.usageCount + (termHits.get(rule.id) ?? 0) }
    : rule));

  const report: BatchReport = {
    id: draft.id,
    startedAt: draft.startedAt,
    submittedAt,
    counts,
    appliedCount: items.filter((item) => item.status === 'applied').length,
    checkedCount: items.filter((item) => item.status === 'checked').length,
    skippedCount: items.filter((item) => item.status === 'skipped').length,
    conflictCount: items.filter((item) => item.status === 'conflict').length,
    ruleStats,
    items,
  };

  const next: DeskModel = {
    ...model,
    segments,
    rules: nextRules,
    batchDraft: null,
    batchReports: [report, ...(model.batchReports ?? [])].slice(0, 20),
    batchUndo: { reportId: report.id, snapshot: clonePlain(draft.snapshot) },
    updatedAt: submittedAt,
  };
  return { model: next, report };
}

/** 整批撤销：恢复到该批次开始前的片段、规则内容，并把批次重新置为未完成草稿。 */
export function undoBatch(model: DeskModel, reportId: string): DeskModel | null {
  const undo = model.batchUndo;
  const report = (model.batchReports ?? []).find((item) => item.id === reportId);
  if (!undo || !report || undo.reportId !== reportId) return null;

  const segments = clonePlain(undo.snapshot.segments);
  const rules = clonePlain(undo.snapshot.rules);
  const draft = rehydrateBatchDraft(undo.snapshot);
  const batchReports = (model.batchReports ?? []).map((item) => (
    item.id === reportId ? { ...item, undoneAt: Date.now() } : item
  ));

  return {
    ...model,
    segments,
    rules,
    batchDraft: draft,
    batchReports,
    batchUndo: null,
    updatedAt: Date.now(),
  };
}
