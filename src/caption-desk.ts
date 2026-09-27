import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { batchStyles } from './batch-ui.css';
import {
  applyRules,
  BATCH_CATEGORY_META,
  cloneModel,
  composeBatchPreview,
  createBatchDraft,
  createInitialModel,
  mergeConfirmedSegments,
  normalizeNumbers,
  queueStats,
  refreshBatchDraft,
  scanBatchIssues,
  STORAGE_KEY,
  simulateLatency,
  submitBatch,
  toSrt,
  undoBatch,
  type BatchDraft,
  type BatchIssue,
  type BatchIssueCategory,
  type BatchItemStatus,
  type BatchPreviewRow,
  type BatchReport,
  type CaptionSegment,
  type ConnectionState,
  type DeskModel,
  type SegmentState,
  type ToastMessage,
} from './model';

const HISTORY_LIMIT = 80;

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function formatAge(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒前`;
}

function stateLabel(state: SegmentState): string {
  return {
    pending: '待确认',
    confirmed: '已确认',
    duplicate: '重复片段',
    stale: '过期修改',
    ignored: '已忽略',
  }[state];
}

function connectionLabel(state: ConnectionState): string {
  return { connected: '连接稳定', degraded: '延迟波动', offline: '离线校正' }[state];
}

const BATCH_CATEGORY_ORDER: BatchIssueCategory[] = ['punctuation', 'number', 'term', 'stale', 'duplicate'];

const BATCH_STATUS_META: Record<BatchItemStatus, { label: string; tagType: string }> = {
  applied: { label: '已自动改写', tagType: 'green' },
  checked: { label: '人工已核对', tagType: 'blue' },
  skipped: { label: '已跳过', tagType: 'gray' },
  conflict: { label: '冲突保留原文', tagType: 'red' },
};

/** 可勾选 = 可安全改写，或超时/重复（勾选表示人工已核对）；术语冲突不可勾选。 */
function isIssueCheckable(issue: BatchIssue): boolean {
  return !issue.blocked || issue.category === 'stale' || issue.category === 'duplicate';
}

@customElement('caption-desk')
export class CaptionDesk extends LitElement {
  static styles = [css`
    :host {
      display: block;
      min-height: 100vh;
      --caption-font-size: 18px;
      color: var(--cds-text-primary, #161616);
      background: var(--cds-background, #f4f4f4);
      font-family: "IBM Plex Sans", "PingFang SC", sans-serif;
    }

    * { box-sizing: border-box; }

    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto auto 1fr;
      background:
        linear-gradient(90deg, rgba(15,98,254,.025) 1px, transparent 1px),
        linear-gradient(rgba(15,98,254,.025) 1px, transparent 1px),
        var(--cds-background, #f4f4f4);
      background-size: 24px 24px;
    }

    .shell.dark {
      --cds-background: #161616;
      --cds-layer: #262626;
      --cds-layer-01: #262626;
      --cds-layer-02: #393939;
      --cds-field: #262626;
      --cds-text-primary: #f4f4f4;
      --cds-text-secondary: #c6c6c6;
      --cds-border-subtle: #393939;
      --cds-border-strong: #6f6f6f;
      color: #f4f4f4;
    }

    .topbar {
      min-height: 64px;
      padding: 8px 18px 8px 20px;
      display: grid;
      grid-template-columns: minmax(330px, 1fr) auto minmax(420px, 1fr);
      align-items: center;
      gap: 20px;
      background: #161616;
      color: #f4f4f4;
      border-bottom: 1px solid #393939;
      position: relative;
      z-index: 5;
    }

    .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .brand-mark {
      width: 38px; height: 38px; display: grid; place-items: center;
      border: 1px solid #78a9ff; color: #78a9ff; font: 600 11px/1 "IBM Plex Mono", monospace;
      clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
    }
    .brand-copy { min-width: 0; }
    .brand-copy strong { display: block; font-size: 15px; letter-spacing: .015em; white-space: nowrap; }
    .brand-copy span { display: block; color: #a8a8a8; font-size: 11px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .connection-pill {
      justify-self: center; display: flex; align-items: center; gap: 10px; padding: 8px 13px;
      min-width: 260px; background: #262626; border: 1px solid #525252;
    }
    .connection-dot { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: #42be65; box-shadow: 0 0 0 4px rgba(66,190,101,.13); }
    .connection-pill.degraded .connection-dot { background: #f1c21b; box-shadow: 0 0 0 4px rgba(241,194,27,.14); }
    .connection-pill.offline .connection-dot { background: #fa4d56; box-shadow: 0 0 0 4px rgba(250,77,86,.14); }
    .connection-copy { min-width: 0; }
    .connection-copy strong { display: block; font-size: 12px; }
    .connection-copy small { display: block; color: #c6c6c6; margin-top: 2px; font-size: 10px; }

    .header-actions { justify-self: end; display: flex; align-items: center; gap: 8px; }
    .header-actions cds-button { --cds-button-primary: #0f62fe; }

    .status-strip {
      min-height: 60px; padding: 8px 20px; display: grid; grid-template-columns: 1.5fr repeat(4, minmax(118px, .6fr)) auto;
      gap: 0; align-items: stretch; background: var(--cds-layer, #fff); border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0);
    }
    .status-cell { padding: 7px 16px; border-right: 1px solid var(--cds-border-subtle, #e0e0e0); display: flex; flex-direction: column; justify-content: center; }
    .status-cell:first-child { padding-left: 4px; }
    .status-cell:last-child { border-right: 0; }
    .status-cell strong { font-size: 20px; font-weight: 400; line-height: 1.05; font-variant-numeric: tabular-nums; }
    .status-cell span { margin-top: 3px; color: var(--cds-text-secondary, #525252); font-size: 10px; letter-spacing: .03em; }
    .status-cell.warning strong, .status-cell.warning span { color: #b28600; }
    .status-cell.danger strong, .status-cell.danger span { color: #da1e28; }
    .status-cell.hero strong { font-size: 14px; }
    .queue-track { width: 100%; height: 3px; margin-top: 6px; background: #e0e0e0; }
    .queue-track > span { display: block; height: 100%; background: #0f62fe; transition: width .3s ease; }
    .font-controls { min-width: 190px; padding: 7px 4px 7px 18px; display: flex; align-items: center; gap: 8px; }
    .font-controls label { color: var(--cds-text-secondary, #525252); font-size: 10px; }

    .workspace {
      min-height: 0; display: grid; grid-template-columns: minmax(390px, .95fr) minmax(430px, 1.05fr) minmax(370px, .9fr);
      gap: 1px; background: var(--cds-border-subtle, #e0e0e0); overflow: hidden;
    }

    .column { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--cds-background, #f4f4f4); }
    .column-head {
      min-height: 62px; padding: 11px 14px 9px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      background: var(--cds-layer, #fff); border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0);
    }
    .column-head h2 { margin: 0; font-size: 14px; font-weight: 600; }
    .column-head p { margin: 4px 0 0; color: var(--cds-text-secondary, #525252); font-size: 10px; }
    .column-body { min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-color: #8d8d8d transparent; }

    .segment-list { padding: 8px; display: flex; flex-direction: column; gap: 1px; }
    .segment-card {
      width: 100%; border: 0; border-left: 3px solid transparent; background: var(--cds-layer, #fff);
      color: inherit; text-align: left; padding: 11px 12px 10px 14px; cursor: pointer; position: relative;
    }
    .segment-card:hover { background: var(--cds-layer-hover, #e8e8e8); }
    .segment-card.selected { border-left-color: #0f62fe; background: var(--cds-layer-selected, #edf5ff); outline: 1px solid #78a9ff; }
    .segment-card.duplicate { border-left-color: #a56eff; }
    .segment-card.stale { border-left-color: #f1c21b; background: color-mix(in srgb, #fff 92%, #f1c21b 8%); }
    .segment-card.confirmed { border-left-color: #42be65; }
    .segment-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; }
    .segment-meta > span:first-child { color: var(--cds-text-secondary, #525252); font: 500 10px/1 "IBM Plex Mono", monospace; }
    .segment-state { font-size: 10px; color: #525252; }
    .segment-state.stale { color: #8d6e00; }
    .segment-state.duplicate { color: #6929c4; }
    .segment-state.confirmed { color: #198038; }
    .segment-text { margin: 0; font-size: var(--caption-font-size); line-height: 1.5; }
    .segment-corrected { margin: 6px 0 0; padding-left: 8px; border-left: 2px solid #42be65; color: #198038; font-size: calc(var(--caption-font-size) * .88); line-height: 1.45; }
    .segment-foot { display: flex; align-items: center; gap: 8px; margin-top: 8px; color: var(--cds-text-secondary, #525252); font-size: 10px; }
    .segment-foot b { color: #0f62fe; font-weight: 500; }
    .issue-note { margin-top: 8px; padding: 7px 8px; background: #fff8e1; border-left: 2px solid #f1c21b; color: #684e00; font-size: 10px; line-height: 1.45; }
    .duplicate-note { background: #f6f2ff; border-color: #a56eff; color: #491d8b; }

    .empty { padding: 48px 24px; text-align: center; color: var(--cds-text-secondary, #525252); }
    .empty strong { display: block; color: var(--cds-text-primary, #161616); margin-bottom: 6px; }
    .empty p { margin: 0; font-size: 11px; line-height: 1.5; }

    .editor-scroll { padding: 14px; overflow: auto; }
    .editor-card { background: var(--cds-layer, #fff); border: 1px solid var(--cds-border-subtle, #e0e0e0); }
    .editor-top { padding: 12px 14px; border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0); display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start; }
    .editor-time { color: #0f62fe; font: 500 12px/1.4 "IBM Plex Mono", monospace; }
    .editor-title { margin: 4px 0 0; font-size: 12px; color: var(--cds-text-secondary, #525252); }
    .editor-status { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .editor-form { padding: 14px; display: flex; flex-direction: column; gap: 13px; }
    .form-grid { display: grid; grid-template-columns: minmax(130px, .6fr) 1fr; gap: 12px; align-items: end; }
    .caption-input { min-height: 158px; --cds-body-compact-01-font-size: var(--caption-font-size); --cds-body-compact-02-font-size: var(--caption-font-size); }
    .edit-toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .edit-toolbar > span { margin-right: 5px; color: var(--cds-text-secondary, #525252); font-size: 10px; }
    .number-input { width: 110px; }
    .rule-suggestions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .rule-suggestions small { color: var(--cds-text-secondary, #525252); }
    .confirm-bar { padding: 12px 14px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--cds-border-subtle, #e0e0e0); background: var(--cds-layer-02, #f4f4f4); }
    .confirm-hint { color: var(--cds-text-secondary, #525252); font-size: 10px; line-height: 1.4; }
    .confirm-hint kbd { padding: 3px 5px; border: 1px solid var(--cds-border-strong, #8d8d8d); background: var(--cds-layer, #fff); color: var(--cds-text-primary, #161616); font: 10px/1 "IBM Plex Mono", monospace; }

    .inspector { padding: 12px 14px 20px; display: flex; flex-direction: column; gap: 14px; }
    .inspector-section { background: var(--cds-layer, #fff); border: 1px solid var(--cds-border-subtle, #e0e0e0); }
    .inspector-section-head { padding: 10px 12px; border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0); display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .inspector-section-head h3 { margin: 0; font-size: 12px; }
    .inspector-section-head span { color: var(--cds-text-secondary, #525252); font-size: 10px; }
    .rule-list { padding: 5px 0; }
    .rule-item { padding: 8px 10px; display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0); }
    .rule-item:last-child { border-bottom: 0; }
    .rule-item strong { display: block; font-size: 11px; }
    .rule-item p { margin: 3px 0 0; color: var(--cds-text-secondary, #525252); font-size: 10px; }
    .rule-item-actions { display: flex; gap: 3px; }
    .rule-form { padding: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .rule-form cds-text-input, .rule-form cds-button { width: 100%; }
    .rule-form .full { grid-column: 1 / -1; }
    .live-timeline { padding: 6px 0; }
    .live-item { padding: 8px 11px; border-left: 3px solid #42be65; margin: 0 10px 7px; background: var(--cds-layer-02, #f4f4f4); }
    .live-item time { color: #198038; font: 500 9px/1 "IBM Plex Mono", monospace; }
    .live-item p { margin: 5px 0 0; font-size: var(--caption-font-size); line-height: 1.45; }
    .live-item small { display: block; margin-top: 4px; color: var(--cds-text-secondary, #525252); font-size: 9px; }
    .delivery-status { margin: 0 10px 10px; padding: 9px 10px; background: #edf5ff; border-left: 3px solid #0f62fe; color: #0043ce; font-size: 10px; line-height: 1.45; }

    .toast-stack { position: fixed; right: 18px; bottom: 18px; z-index: 20; width: 380px; display: flex; flex-direction: column; gap: 8px; }
    cds-toast-notification { box-shadow: 0 8px 22px rgba(0,0,0,.18); }

    @media (max-width: 1280px) {
      .workspace { grid-template-columns: minmax(340px, .85fr) minmax(410px, 1fr) minmax(330px, .85fr); }
      .status-strip { grid-template-columns: 1.4fr repeat(4, minmax(100px, .55fr)); }
      .font-controls { display: none; }
    }

    @media (max-width: 980px) {
      .topbar { grid-template-columns: 1fr auto; }
      .connection-pill { grid-row: 2; grid-column: 1 / -1; justify-self: stretch; min-width: 0; }
      .workspace { grid-template-columns: 1fr; overflow: visible; }
      .column { min-height: 520px; }
      .shell { display: block; }
      .status-strip { grid-template-columns: repeat(4, 1fr); }
      .status-cell.hero { grid-column: 1 / -1; }
    }
  `, batchStyles];

  @state() private model: DeskModel = this.loadModel();
  @state() private dark = localStorage.getItem(`${STORAGE_KEY}-theme`) === 'dark';
  @state() private toasts: ToastMessage[] = [];
  @state() private ruleSource = '';
  @state() private ruleReplacement = '';
  @state() private ruleSpeaker = '';
  @state() private filter: 'active' | 'all' | 'attention' = 'active';
  @state() private showRuleForm = false;
  @state() private batchOpen = false;
  @state() private batchView: 'issues' | 'preview' | 'result' | 'history' = 'issues';
  @state() private batchDraft: BatchDraft | null = null;
  @state() private lastReport: BatchReport | null = null;
  private past: DeskModel[] = [];
  private future: DeskModel[] = [];
  private ticker?: number;

  connectedCallback(): void {
    super.connectedCallback();
    this.syncBatchDraft();
    window.addEventListener('keydown', this.handleShortcut);
    this.ticker = window.setInterval(() => {
      const next = simulateLatency(this.model);
      const changed = JSON.stringify(next.segments) !== JSON.stringify(this.model.segments) || next.connection !== this.model.connection;
      if (!changed) return;
      this.model = next;
      this.persist();
    }, 5_000);
  }

  disconnectedCallback(): void {
    window.removeEventListener('keydown', this.handleShortcut);
    if (this.ticker) window.clearInterval(this.ticker);
    super.disconnectedCallback();
  }

  private loadModel(): DeskModel {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DeskModel;
        if (parsed.segments?.length) return parsed;
      }
    } catch {
      // 损坏草稿会回退到演示数据。
    }
    return createInitialModel();
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...this.model, updatedAt: Date.now() }));
  }

  /** 草稿挂在模型上随本地存储保留；组件内镜像一份用于模态框渲染。 */
  private syncBatchDraft(): void {
    this.batchDraft = this.model.batchDraft ? structuredClone(this.model.batchDraft) : null;
  }

  private saveBatchDraft(): void {
    this.model = { ...this.model, batchDraft: this.batchDraft ? structuredClone(this.batchDraft) : null };
    this.persist();
  }

  private commit(label: string, update: (current: DeskModel) => DeskModel): void {
    const previous = cloneModel(this.model);
    const next = update(cloneModel(this.model));
    next.updatedAt = Date.now();
    this.past = [...this.past, previous].slice(-HISTORY_LIMIT);
    this.future = [];
    this.model = next;
    this.persist();
    if (label) this.pushToast('info', label, '已写入浏览器本地草稿');
  }

  private automatic(next: DeskModel): void {
    this.model = next;
    this.persist();
  }

  private undo(): void {
    const previous = this.past.pop();
    if (!previous) return this.pushToast('info', '没有可撤销的修改', '历史记录为空');
    this.future = [cloneModel(this.model), ...this.future].slice(0, HISTORY_LIMIT);
    this.model = previous;
    this.persist();
    this.syncBatchDraft();
  }

  private redo(): void {
    const next = this.future.shift();
    if (!next) return;
    this.past = [...this.past, cloneModel(this.model)].slice(-HISTORY_LIMIT);
    this.model = next;
    this.persist();
    this.syncBatchDraft();
  }

  private pushToast(kind: ToastMessage['kind'], title: string, subtitle: string): void {
    const toast = { id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind, title, subtitle };
    this.toasts = [toast, ...this.toasts].slice(0, 3);
    window.setTimeout(() => {
      this.toasts = this.toasts.filter((item) => item.id !== toast.id);
    }, 4_500);
  }

  private get selected(): CaptionSegment | undefined {
    return this.model.segments.find((item) => item.id === this.model.selectedId);
  }

  private get stats() {
    return queueStats(this.model);
  }

  private get pendingSegments(): CaptionSegment[] {
    const items = this.model.segments.filter((item) => {
      if (this.filter === 'active') return item.state === 'pending' || item.state === 'stale' || item.state === 'duplicate';
      if (this.filter === 'attention') return item.state === 'stale' || item.state === 'duplicate';
      return true;
    });
    return [...items].sort((a, b) => a.sequence - b.sequence);
  }

  private updateSelected(patch: Partial<CaptionSegment>, label = ''): void {
    const selected = this.selected;
    if (!selected) return;
    this.commit(label, (current) => ({
      ...current,
      segments: current.segments.map((item) => item.id === selected.id ? { ...item, ...patch, revision: item.revision + 1 } : item),
    }));
  }

  private selectSegment(id: string): void {
    this.model = { ...this.model, selectedId: id };
    this.persist();
  }

  private navigate(direction: number): void {
    const candidates = this.pendingSegments.length ? this.pendingSegments : [...this.model.segments].sort((a, b) => a.sequence - b.sequence);
    const index = candidates.findIndex((item) => item.id === this.model.selectedId);
    const next = candidates[Math.max(0, Math.min(candidates.length - 1, index + direction))];
    if (next) this.selectSegment(next.id);
  }

  private applyTerm(ruleId: string): void {
    const selected = this.selected;
    const rule = this.model.rules.find((item) => item.id === ruleId);
    if (!selected || !rule) return;
    const flags = rule.caseSensitive ? 'g' : 'gi';
    const expression = new RegExp(rule.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    if (!expression.test(selected.corrected)) {
      this.pushToast('warning', '当前字幕没有该术语', `${rule.source} → ${rule.replacement}`);
      return;
    }
    this.commit('应用术语替换', (current) => ({
      ...current,
      rules: current.rules.map((item) => item.id === rule.id ? { ...item, usageCount: item.usageCount + 1 } : item),
      segments: current.segments.map((item) => item.id === selected.id ? { ...item, corrected: item.corrected.replace(expression, rule.replacement), revision: item.revision + 1 } : item),
    }));
  }

  private applyInlineEdit(transform: (value: string) => string, label: string, cursorShift = 0): void {
    const selected = this.selected;
    if (!selected) return;
    const host = this.renderRoot.querySelector('cds-textarea');
    const textarea = host?.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement | undefined;
    let value = selected.corrected;
    let cursor = value.length;

    if (textarea) {
      value = `${value.slice(0, textarea.selectionStart)}${transform('')}${value.slice(textarea.selectionEnd)}`;
      cursor = textarea.selectionStart + transform('').length + cursorShift;
    } else {
      value = transform(value);
    }

    this.updateSelected({ corrected: value }, label);
    this.updateComplete.then(() => {
      const nextTextarea = this.renderRoot.querySelector('cds-textarea')?.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement | undefined;
      if (nextTextarea && textarea) {
        nextTextarea.focus();
        nextTextarea.setSelectionRange(cursor, cursor);
      }
    });
  }

  private insertPunctuation(mark: string): void {
    this.applyInlineEdit(() => mark, `插入${mark}`);
  }

  private wrapSelection(open: string, close: string): void {
    const host = this.renderRoot.querySelector('cds-textarea');
    const textarea = host?.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement | undefined;
    const selected = this.selected;
    if (!textarea || !selected) return;
    const selectedText = selected.corrected.slice(textarea.selectionStart, textarea.selectionEnd) || '重点';
    const value = `${selected.corrected.slice(0, textarea.selectionStart)}${open}${selectedText}${close}${selected.corrected.slice(textarea.selectionEnd)}`;
    this.updateSelected({ corrected: value }, '添加强调标点');
  }

  private normalizeCurrentNumbers(): void {
    const selected = this.selected;
    if (!selected) return;
    const normalized = normalizeNumbers(selected.corrected);
    if (normalized === selected.corrected) {
      this.pushToast('info', '没有需要规范化的数字', '已检查全角数字和中文数字');
      return;
    }
    this.updateSelected({ corrected: normalized, numberHints: normalized }, '规范化数字');
  }

  private confirmSelected(): void {
    const selected = this.selected;
    if (!selected) {
      this.pushToast('warning', '没有可确认的片段', '请先从待确认区选择字幕');
      return;
    }
    const { text, used } = applyRules(selected.corrected, this.model);
    const offline = this.model.connection === 'offline';
    const nextOrder = this.pendingSegments.filter((item) => item.id !== selected.id);
    this.commit('确认并送入直播区', (current) => ({
      ...current,
      segments: current.segments.map((item) => item.id === selected.id ? {
        ...item,
        corrected: text,
        state: 'confirmed',
        source: offline ? 'offline' : item.source,
        confirmedAt: Date.now(),
        staleReason: item.state === 'stale' ? item.staleReason : undefined,
        tags: used.length ? [...new Set([...item.tags, '术语已应用'])] : item.tags,
        revision: item.revision + 1,
      } : item),
      rules: current.rules.map((rule) => used.includes(rule.id) ? { ...rule, usageCount: rule.usageCount + 1 } : rule),
      selectedId: nextOrder[0]?.id ?? selected.id,
    }));
    this.pushToast(offline ? 'warning' : 'success', offline ? '已加入离线发件箱' : '字幕已进入直播区', offline ? '恢复连接后将按时间顺序合并' : `第 ${selected.sequence} 段已确认`);
  }

  private ignoreSelected(): void {
    const selected = this.selected;
    if (!selected) return;
    const next = this.pendingSegments.find((item) => item.id !== selected.id);
    this.commit('忽略问题片段', (current) => ({
      ...current,
      segments: current.segments.map((item) => item.id === selected.id ? { ...item, state: 'ignored', staleReason: '已人工忽略' } : item),
      selectedId: next?.id ?? selected.id,
    }));
  }

  private recoverDuplicate(): void {
    const selected = this.selected;
    if (!selected) return;
    this.commit('保留重复片段', (current) => ({
      ...current,
      segments: current.segments.map((item) => item.id === selected.id ? { ...item, state: 'pending', duplicateOf: undefined, staleReason: '重复提示已由校对员确认保留' } : item),
    }));
  }

  private setConnection(connection: ConnectionState): void {
    this.commit(connection === 'offline' ? '切换到离线校正' : connection === 'degraded' ? '模拟延迟波动' : '连接已恢复', (current) => ({
      ...current,
      connection,
      simulatedDelay: connection === 'connected' ? 0.8 : connection === 'degraded' ? 4.6 : current.simulatedDelay,
    }));
  }

  private mergeOffline(): void {
    const merged = mergeConfirmedSegments(this.model);
    this.past = [...this.past, cloneModel(this.model)].slice(-HISTORY_LIMIT);
    this.future = [];
    this.model = merged;
    this.persist();
    const outboxCount = this.model.segments.filter((item) => item.source === 'offline' && item.state === 'confirmed').length;
    this.pushToast('success', '离线队列已合并', `${outboxCount} 个片段仍标记为离线来源，过期修改会继续显示提示`);
  }

  private addRuleFromSelection(): void {
    const selected = this.selected;
    if (!selected) return;
    this.ruleSource = selected.corrected.length > 24 ? selected.corrected.slice(0, 24) : selected.corrected;
    this.ruleReplacement = selected.corrected;
    this.ruleSpeaker = selected.speaker;
    this.showRuleForm = true;
  }

  private addRule(): void {
    const source = this.ruleSource.trim();
    const replacement = this.ruleReplacement.trim();
    if (!source || !replacement) {
      this.pushToast('warning', '规则不完整', '原文和替换文本均不能为空');
      return;
    }
    this.commit('新增术语快捷规则', (current) => ({
      ...current,
      rules: [{
        id: `term-${Date.now().toString(36)}`,
        source,
        replacement,
        speaker: this.ruleSpeaker,
        enabled: true,
        caseSensitive: false,
        usageCount: 0,
        createdAt: Date.now(),
      }, ...current.rules],
    }));
    this.ruleSource = '';
    this.ruleReplacement = '';
    this.ruleSpeaker = '';
    this.showRuleForm = false;
  }

  private deleteRule(id: string): void {
    this.commit('删除术语规则', (current) => ({ ...current, rules: current.rules.filter((item) => item.id !== id) }));
  }

  private exportSrt(): void {
    const content = toSrt(this.model);
    if (!content) {
      this.pushToast('warning', '暂无已确认字幕', '先确认至少一个片段再导出');
      return;
    }
    const blob = new Blob([content], { type: 'application/x-subrip;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.model.eventName.replace(/[^\p{L}\p{N}-]+/gu, '-')}.srt`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.pushToast('success', 'SRT 已导出', `${toSrt(this.model).split('\n\n').length} 段字幕`);
  }

  private adjustFont(delta: number): void {
    const fontSize = Math.max(14, Math.min(28, this.model.fontSize + delta));
    this.automatic({ ...this.model, fontSize });
  }

  private toggleTheme(): void {
    this.dark = !this.dark;
    localStorage.setItem(`${STORAGE_KEY}-theme`, this.dark ? 'dark' : 'light');
  }

  // ── 质检批次 ───────────────────────────────────────────────

  private get batchIssues(): BatchIssue[] {
    return this.batchDraft?.issues ?? [];
  }

  private get currentBatchIssueCount(): number {
    return scanBatchIssues(this.model).length;
  }

  private get batchReports(): BatchReport[] {
    return this.model.batchReports ?? [];
  }

  /** 当前各待处理片段命中的问题组，用于在待确认卡片上显示批次风险标记。 */
  private get segmentIssueMap(): Map<string, BatchIssueCategory[]> {
    const map = new Map<string, BatchIssueCategory[]>();
    for (const issue of scanBatchIssues(this.model)) {
      const list = map.get(issue.segmentId) ?? [];
      if (!list.includes(issue.category)) list.push(issue.category);
      map.set(issue.segmentId, list);
    }
    return map;
  }

  private openBatch(): void {
    if (this.batchDraft) {
      // 重开未完成批次：以当前队列重新扫描，但保留已勾选状态
      this.batchDraft = refreshBatchDraft(structuredClone(this.batchDraft), this.model);
      this.saveBatchDraft();
    } else {
      this.batchDraft = createBatchDraft(this.model);
      this.saveBatchDraft();
    }
    this.batchView = 'issues';
    this.batchOpen = true;
  }

  private closeBatch(): void {
    this.batchOpen = false;
  }

  private rescanBatch(): void {
    if (!this.batchDraft) return;
    this.batchDraft = refreshBatchDraft(structuredClone(this.batchDraft), this.model);
    this.saveBatchDraft();
    this.pushToast('info', '批次已重新扫描', '新片段和最新校对结果已纳入，勾选状态已保留');
  }

  private discardBatch(): void {
    if (!this.batchDraft) return;
    this.batchDraft = null;
    this.saveBatchDraft();
    this.batchOpen = false;
    this.pushToast('info', '已放弃当前批次草稿', '批次问题未做任何改动');
  }

  private toggleIssue(issueId: string): void {
    if (!this.batchDraft) return;
    const issues = this.batchDraft.issues.map((issue) => (
      issue.id === issueId ? { ...issue, selected: !issue.selected } : issue
    ));
    this.batchDraft = { ...this.batchDraft, issues };
    this.saveBatchDraft();
  }

  private toggleGroup(category: BatchIssueCategory, value: boolean): void {
    if (!this.batchDraft) return;
    const issues = this.batchDraft.issues.map((issue) => (
      issue.category === category && isIssueCheckable(issue)
        ? { ...issue, selected: value }
        : issue
    ));
    this.batchDraft = { ...this.batchDraft, issues };
    this.saveBatchDraft();
  }

  private selectAllSafe(): void {
    if (!this.batchDraft) return;
    const issues = this.batchDraft.issues.map((issue) => ({ ...issue, selected: !issue.blocked }));
    this.batchDraft = { ...this.batchDraft, issues };
    this.saveBatchDraft();
  }

  private clearSelection(): void {
    if (!this.batchDraft) return;
    const issues = this.batchDraft.issues.map((issue) => ({ ...issue, selected: false }));
    this.batchDraft = { ...this.batchDraft, issues };
    this.saveBatchDraft();
  }

  private get batchPreviewRows(): BatchPreviewRow[] {
    if (!this.batchDraft) return [];
    return composeBatchPreview(this.batchDraft.issues, this.model.segments, this.model.rules);
  }

  private get batchPreviewStats() {
    const rows = this.batchPreviewRows;
    const issues = this.batchIssues;
    return {
      rewrite: rows.filter((row) => row.changed).length,
      checked: rows.filter((row) => row.checked).length,
      conflicts: rows.filter((row) => row.conflict).length,
      skipped: issues.filter((issue) => !issue.selected && !(issue.category === 'term' && issue.conflict)).length,
    };
  }

  private goPreview(): void {
    if (!this.batchDraft) return;
    if (!this.batchDraft.issues.some((issue) => issue.selected)) {
      this.pushToast('warning', '还没有勾选任何问题', '标点、数字、术语可整组勾选；超时和重复默认可勾选为“人工已核对”');
      return;
    }
    this.batchView = 'preview';
  }

  private backToIssues(): void {
    this.batchView = 'issues';
  }

  /** 预览确认后一次提交；不走普通逐段历史，使用批次自带的开始前快照整批撤销。 */
  private submitBatchNow(): void {
    if (!this.batchDraft) return;
    const { model, report } = submitBatch(this.model, structuredClone(this.batchDraft));
    this.past = [...this.past, cloneModel(this.model)].slice(-HISTORY_LIMIT);
    this.future = [];
    this.model = model;
    this.persist();
    this.batchDraft = null;
    this.lastReport = report;
    this.batchView = 'result';
    this.pushToast('success', '质检批次已提交', `自动改写 ${report.appliedCount} 项 · 已核对 ${report.checkedCount} 项 · 冲突 ${report.conflictCount} 项`);
  }

  private restoreBatch(model: DeskModel): void {
    this.model = model;
    this.persist();
    this.syncBatchDraft();
  }

  private undoLastBatch(): void {
    if (!this.lastReport) return;
    this.undoBatchReport(this.lastReport.id);
  }

  private undoBatchReport(reportId: string): void {
    const restored = undoBatch(this.model, reportId);
    if (!restored) {
      this.pushToast('warning', '该批次的撤销快照已不可用', '只保留最近一次批次的开始前快照；较早日历只能用 ⌘/Ctrl+Z 逐步撤销');
      return;
    }
    this.restoreBatch(restored);
    this.batchView = 'issues';
    this.batchOpen = true;
    this.pushToast('success', '已整批恢复到开始前', '改动与规则计数已还原，批次重新置为未完成草稿');
  }

  private openHistory(): void {
    this.batchView = 'history';
    this.batchOpen = true;
  }

  private formatDateTime(timestamp: number): string {
    return new Date(timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  private handleShortcut = (event: KeyboardEvent): void => {
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLocaleLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
      return;
    }
    if (modifier && event.key.toLocaleLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }
    if (modifier && event.key === 'Enter') {
      event.preventDefault();
      this.confirmSelected();
      return;
    }
    if (event.altKey && event.key.toLocaleLowerCase() === 'j') {
      event.preventDefault();
      this.navigate(1);
      return;
    }
    if (event.altKey && event.key.toLocaleLowerCase() === 'k') {
      event.preventDefault();
      this.navigate(-1);
      return;
    }
    const punctuation: Record<string, string> = { '1': '，', '2': '。', '3': '？', '4': '！' };
    if (modifier && punctuation[event.key]) {
      event.preventDefault();
      this.insertPunctuation(punctuation[event.key]);
    }
  };

  private renderPendingList() {
    const segments = this.pendingSegments;
    if (!segments.length) {
      return html`<div class="empty"><strong>待确认区已清空</strong><p>新的实时片段到达时会自动进入这里。</p></div>`;
    }
    const issueMap = this.segmentIssueMap;
    return html`
      <div class="segment-list">
        ${segments.map((item) => {
          const issues = issueMap.get(item.id) ?? [];
          return html`
          <button class="segment-card ${item.id === this.model.selectedId ? 'selected' : ''} ${item.state}" @click=${() => this.selectSegment(item.id)}>
            <div class="segment-meta">
              <span>${formatClock(item.startTime)} · #${String(item.sequence).padStart(3, '0')}</span>
              <span class="segment-state ${item.state}">${stateLabel(item.state)}</span>
            </div>
            <p class="segment-text">${item.original}</p>
            ${item.corrected !== item.original ? html`<p class="segment-corrected">${item.corrected}</p>` : nothing}
            ${issues.length ? html`<div class="segment-batch-tags">
              ${issues.map((category) => html`<span class="batch-pill ${category}">${BATCH_CATEGORY_META[category].label}</span>`)}
            </div>` : nothing}
            <div class="segment-foot">
              <span>${item.speaker}</span>
              <span>·</span>
              <span>${formatAge(item.receivedAt)}</span>
              ${item.revision > 0 ? html`<span>· <b>修改 ${item.revision} 次</b></span>` : nothing}
            </div>
            ${item.state === 'stale' && item.staleReason ? html`<div class="issue-note">${item.staleReason}。确认前请核对直播上下文。</div>` : nothing}
            ${item.state === 'duplicate' ? html`<div class="issue-note duplicate-note">${item.staleReason || '检测到重复片段'}，请保留或忽略。</div>` : nothing}
          </button>
        `;})}
      </div>
    `;
  }

  private renderEditor() {
    const item = this.selected;
    if (!item) {
      return html`<div class="empty"><strong>选择一条待确认字幕</strong><p>可以使用 Alt+J / Alt+K 在片段之间移动。</p></div>`;
    }
    const applicableRules = this.model.rules.filter((rule) => rule.enabled && (!rule.speaker || rule.speaker === item.speaker));
    return html`
      <div class="editor-scroll">
        <div class="editor-card">
          <div class="editor-top">
            <div>
              <div class="editor-time">${formatClock(item.startTime)} — ${formatClock(item.startTime + 7)}</div>
              <p class="editor-title">实时片段 #${String(item.sequence).padStart(3, '0')} · 到达于 ${formatAge(item.receivedAt)}</p>
            </div>
            <div class="editor-status">
              <cds-tag type=${item.state === 'stale' ? 'warm-gray' : item.state === 'duplicate' ? 'purple' : 'blue'} size="sm">${stateLabel(item.state)}</cds-tag>
              <cds-tag type="outline" size="sm">修改 ${item.revision} 次</cds-tag>
            </div>
          </div>
          <div class="editor-form">
            ${item.state === 'duplicate' ? html`
              <cds-inline-notification kind="warning" low-contrast title="重复片段提示" subtitle=${item.staleReason || '与已确认片段高度相似'}>
                <cds-button slot="action" size="sm" @click=${this.recoverDuplicate}>保留并继续校对</cds-button>
              </cds-inline-notification>
            ` : nothing}
            ${item.state === 'stale' ? html`
              <cds-inline-notification kind="warning" low-contrast title="过期修改" subtitle=${`${item.staleReason || '该片段已超过 90 秒未确认'}。请结合上下文确认，或忽略以避免污染直播区。`}></cds-inline-notification>
            ` : nothing}
            <div class="form-grid">
              <cds-select label-text="发言人" value=${item.speaker} @cds-select-selected=${(event: CustomEvent<{ value: string }>) => this.updateSelected({ speaker: event.detail.value }, '修改发言人')}>
                ${['主持人', '主讲人', '嘉宾 / 周然', '现场提问', '未知发言人'].map((speaker) => html`<cds-select-item value=${speaker}>${speaker}</cds-select-item>`)}
              </cds-select>
              <cds-number-input class="number-input" label="延迟（秒）" .value=${this.model.simulatedDelay} step="0.1" min="0" max="9" @input=${(event: Event) => this.automatic({ ...this.model, simulatedDelay: Number((event.currentTarget as any).value) })}></cds-number-input>
            </div>
            <cds-textarea
              class="caption-input"
              label-text="校对后的字幕文本"
              helper-text="Ctrl/⌘ + 1–4 快速插入标点；术语规则将从左到右自动应用"
              .value=${item.corrected}
              @input=${(event: Event) => this.updateSelected({ corrected: (event.currentTarget as any).value }, '')}
            ></cds-textarea>
            <div class="edit-toolbar">
              <span>快速标点</span>
              <cds-button kind="ghost" size="sm" @click=${() => this.insertPunctuation('，')}>，逗号</cds-button>
              <cds-button kind="ghost" size="sm" @click=${() => this.insertPunctuation('。')}>。句号</cds-button>
              <cds-button kind="ghost" size="sm" @click=${() => this.insertPunctuation('？')}>？问号</cds-button>
              <cds-button kind="ghost" size="sm" @click=${() => this.insertPunctuation('…')}>…省略</cds-button>
              <cds-button kind="ghost" size="sm" @click=${() => this.wrapSelection('（', '）')}>（）括注</cds-button>
              <cds-button kind="secondary" size="sm" @click=${this.normalizeCurrentNumbers}>规范化数字</cds-button>
            </div>
            <div class="rule-suggestions">
              <small>术语快捷替换</small>
              ${applicableRules.length ? applicableRules.map((rule) => html`
                <cds-button kind="tertiary" size="sm" @click=${() => this.applyTerm(rule.id)}>${rule.source} → ${rule.replacement}</cds-button>
              `) : html`<small>当前发言人的规则为空</small>`}
              <cds-button kind="ghost" size="sm" @click=${this.addRuleFromSelection}>＋ 从当前文本新建</cds-button>
            </div>
          </div>
          <div class="confirm-bar">
            <div class="confirm-hint"><kbd>⌘/Ctrl Enter</kbd> 确认并进入直播区 · <kbd>Alt J/K</kbd> 切换片段</div>
            <div>
              <cds-button kind="danger--tertiary" size="sm" @click=${this.ignoreSelected}>忽略片段</cds-button>
              <cds-button kind="primary" @click=${this.confirmSelected}>确认并送入直播区</cds-button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderBatchIssues() {
    const draft = this.batchDraft;
    if (!draft) return nothing;
    if (!draft.issues.length) {
      return html`<div class="empty"><strong>没有需要质检的风险项</strong><p>待确认区当前没有标点、数字、术语、超时或重复问题。</p></div>`;
    }
    const groups = BATCH_CATEGORY_ORDER
      .map((category) => ({ category, issues: draft.issues.filter((issue) => issue.category === category) }))
      .filter((group) => group.issues.length);

    return html`
      <div class="batch-summary">
        <strong>本批共 ${draft.issues.length} 个风险项 · 涉及 ${new Set(draft.issues.map((issue) => issue.segmentId)).size} 段</strong>
        <span>批次开始于 ${this.formatDateTime(draft.startedAt)}，勾选状态随本地草稿保存</span>
      </div>
      <div class="batch-toolbar">
        <cds-button kind="tertiary" size="sm" @click=${this.selectAllSafe}>勾选可安全改写项</cds-button>
        <cds-button kind="ghost" size="sm" @click=${this.clearSelection}>全部取消</cds-button>
        <cds-button kind="ghost" size="sm" @click=${this.rescanBatch}>重新扫描</cds-button>
        <span class="spacer"></span>
        <small>超时与重复默认跳过，勾选表示“人工已核对”；术语冲突保留原文不可自动改写</small>
      </div>
      ${groups.map(({ category, issues }) => {
        const checkable = issues.filter((issue) => isIssueCheckable(issue));
        const checkedCount = issues.filter((issue) => issue.selected).length;
        const allChecked = checkable.length > 0 && checkable.every((issue) => issue.selected);
        const meta = BATCH_CATEGORY_META[category];
        return html`
          <section class="batch-group">
            <header class="batch-group-head">
              <div>
                <strong>${meta.label} · ${issues.length} 项</strong>
                <p>${meta.hint}</p>
              </div>
              <div class="batch-group-count">
                ${checkable.length
                  ? html`<label class="batch-check"><input
                      type="checkbox"
                      .checked=${allChecked}
                      .indeterminate=${checkedCount > 0 && !allChecked}
                      @change=${(event: Event) => this.toggleGroup(category, (event.currentTarget as HTMLInputElement).checked)}
                    /> 整组勾选（${checkedCount}/${checkable.length}）</label>`
                  : html`整组 ${checkedCount}/${issues.length} 已核对`}
              </div>
            </header>
            ${issues.map((issue) => this.renderBatchIssue(issue))}
          </section>
        `;
      })}
    `;
  }

  private renderBatchIssue(issue: BatchIssue) {
    const checkable = isIssueCheckable(issue);
    return html`
      <div class="batch-item ${issue.blocked ? 'blocked' : ''} ${issue.conflict ? 'has-conflict' : ''}">
        <label class="batch-check">
          <input
            type="checkbox"
            ?disabled=${!checkable}
            .checked=${issue.selected}
            @change=${() => this.toggleIssue(issue.id)}
          />
        </label>
        <div>
          <div class="batch-item-meta">
            <button type="button" @click=${() => this.selectSegment(issue.segmentId)}>#${String(issue.sequence).padStart(3, '0')}</button>
            <span>${formatClock(issue.startTime)}</span>
            <span>${issue.speaker}</span>
            <span>${BATCH_CATEGORY_META[issue.category].label}</span>
            ${issue.ruleIds.length ? html`<span>规则 ${issue.ruleIds.length} 条</span>` : nothing}
          </div>
          <p class="batch-item-text">${issue.before}</p>
          ${issue.after ? html`<p class="batch-item-after">${issue.after}</p>` : nothing}
          <p class="batch-item-text" style="font-size:11px;color:var(--cds-text-secondary,#525252);margin-top:3px;">${issue.summary}</p>
          ${issue.conflict && issue.category === 'term' ? html`<div class="batch-conflict">${issue.conflict}</div>` : nothing}
          ${issue.conflict && issue.category !== 'term' ? html`<div class="batch-skip-note">${issue.conflict}</div>` : nothing}
          ${(issue.category === 'stale' || issue.category === 'duplicate') && !issue.selected
            ? html`<div class="batch-skip-note">默认跳过；勾选仅标记“人工已核对”，内容改写仍以同段标点 / 数字 / 术语勾选项为准。</div>` : nothing}
        </div>
      </div>
    `;
  }

  private renderBatchPreview() {
    const rows = this.batchPreviewRows;
    const stats = this.batchPreviewStats;
    const conflicts = rows.filter((row) => row.conflict);
    const ruleChips = this.batchDraft
      ? this.model.rules.filter((rule) => this.batchDraft!.issues.some((issue) => issue.selected && issue.ruleIds.includes(rule.id)))
      : [];
    return html`
      <div class="batch-preview-stats">
        <span><b>${stats.rewrite}</b> 段将自动改写</span>
        <span><b>${stats.checked}</b> 段仅标记人工核对</span>
        <span><b>${stats.conflicts}</b> 段术语冲突保留原文</span>
        <span><b>${stats.skipped}</b> 个问题跳过</span>
      </div>
      ${ruleChips.length ? html`<p class="batch-note">将套用的术语规则：</p><div class="batch-rule-stats">
        ${ruleChips.map((rule) => html`<span class="batch-rule-chip">${rule.source} → ${rule.replacement}</span>`)}
      </div>` : nothing}
      ${conflicts.length ? html`
        <div class="batch-conflict" style="margin-bottom:12px;">
          ${conflicts.length} 段命中多条术语规则，本次提交保留原内容，请提交后到编辑台逐段处理。
        </div>` : nothing}
      ${rows.map((row) => html`
        <article class="batch-preview-row">
          <header>
            <span>#${String(row.sequence).padStart(3, '0')}</span>
            <span>${row.speaker}</span>
            ${row.changed ? html`<cds-tag type="green" size="sm">自动改写</cds-tag>` : nothing}
            ${row.checked ? html`<cds-tag type="blue" size="sm">人工已核对</cds-tag>` : nothing}
            ${row.conflict ? html`<cds-tag type="red" size="sm">冲突保留</cds-tag>` : nothing}
          </header>
          <div class="batch-preview-body">
            <p>原文：${row.before}</p>
            ${row.changed ? html`<p class="after">改后：${row.after}</p>` : html`<p class="note">${row.conflict ?? '内容保持不变'}</p>`}
          </div>
        </article>
      `)}
    `;
  }

  private renderBatchResult() {
    const report = this.lastReport;
    if (!report) return nothing;
    const conflictItems = report.items.filter((item) => item.status === 'conflict');
    return html`
      <div class="batch-done-head">
        <div><strong>${report.appliedCount}</strong><span>自动改写项</span></div>
        <div><strong>${report.checkedCount}</strong><span>人工已核对</span></div>
        <div><strong>${report.skippedCount}</strong><span>跳过项</span></div>
        <div><strong>${report.conflictCount}</strong><span>术语冲突</span></div>
      </div>
      ${report.ruleStats.length ? html`
        <p class="batch-note">规则命中次数：</p>
        <div class="batch-rule-stats">
          ${report.ruleStats.map((stat) => html`
            <span class="batch-rule-chip">${stat.source} → ${stat.replacement} · 命中 ${stat.hits} 处 / ${stat.appliedSegments} 段${stat.conflicts ? ` · ${stat.conflicts} 段冲突未套用` : ''}</span>
          `)}
        </div>` : nothing}
      ${conflictItems.length ? html`
        <div class="batch-conflict">
          ${conflictItems.map((item) => html`<div>#${String(item.sequence).padStart(3, '0')}：${item.note}</div>`)}
        </div>` : nothing}
      <p class="batch-note">提交于 ${this.formatDateTime(report.submittedAt)}。改动明细与冲突原因可在“批次回看”中随时查看；撤销会整批恢复到开始前。</p>
    `;
  }

  private renderBatchHistory() {
    const reports = this.batchReports;
    if (!reports.length) {
      return html`<div class="empty"><strong>还没有已提交的质检批次</strong><p>提交后这里会展示改动、规则命中次数和冲突原因。</p></div>`;
    }
    return html`
      ${reports.map((report) => {
        const statusMeta = BATCH_STATUS_META;
        return html`
          <details class="batch-report">
            <summary>
              <strong>批次 ${this.formatDateTime(report.submittedAt)}</strong>
              <span>改写 ${report.appliedCount} · 核对 ${report.checkedCount} · 跳过 ${report.skippedCount} · 冲突 ${report.conflictCount}</span>
              <span>
                ${report.undoneAt
                  ? html`<cds-tag type="warm-gray" size="sm">已于 ${this.formatDateTime(report.undoneAt)} 撤销</cds-tag>`
                  : this.model.batchUndo?.reportId === report.id
                    ? html`
                        <cds-button
                          kind="danger--tertiary"
                          size="sm"
                          @click=${(event: Event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            this.undoBatchReport(report.id);
                          }}
                        >整批撤销</cds-button>
                      `
                    : html`<cds-tag type="gray" size="sm">快照已被新批次覆盖</cds-tag>`}
              </span>
            </summary>
            <div class="batch-report-body">
              <div class="batch-preview-stats">
                ${(Object.keys(report.counts) as BatchIssueCategory[]).map((category) => html`
                  <span><b>${report.counts[category]}</b> ${BATCH_CATEGORY_META[category].label}</span>
                `)}
              </div>
              ${report.ruleStats.length ? html`<p class="batch-note">规则命中：</p><div class="batch-rule-stats">
                ${report.ruleStats.map((stat) => html`
                  <span class="batch-rule-chip">${stat.source} → ${stat.replacement} · ${stat.hits} 处 / ${stat.appliedSegments} 段${stat.conflicts ? ` · 冲突 ${stat.conflicts}` : ''}</span>
                `)}
              </div>` : nothing}
              ${report.items.map((item) => html`
                <div class="batch-report-item ${item.status}">
                  <div class="batch-report-item-head">
                    <span>#${String(item.sequence).padStart(3, '0')}</span>
                    <span>${BATCH_CATEGORY_META[item.category].label}</span>
                    <cds-tag type=${statusMeta[item.status].tagType} size="sm">${statusMeta[item.status].label}</cds-tag>
                    <span>${item.summary}</span>
                  </div>
                  <p class="batch-item-text">${item.before}</p>
                  ${item.after && item.after !== item.before ? html`<p class="batch-item-after">${item.after}</p>` : nothing}
                  ${item.note ? html`<p class="batch-note">${item.note}</p>` : nothing}
                </div>
              `)}
            </div>
          </details>
        `;
      })}
    `;
  }

  private renderBatchModal() {
    if (!this.batchOpen) return nothing;
    const heading = {
      issues: this.batchDraft ? '质检批次 · 问题分组' : '质检批次',
      preview: '质检批次 · 提交前预览',
      result: '批次已提交',
      history: '批次回看',
    }[this.batchView];

    return html`
      <cds-modal size="lg" open @cds-modal-closed=${this.closeBatch}>
        <cds-modal-header>
          <cds-modal-heading>${heading}</cds-modal-heading>
        </cds-modal-header>
        <cds-modal-body style="max-height:62vh;overflow:auto;">
          ${this.batchView === 'issues' ? this.renderBatchIssues() : nothing}
          ${this.batchView === 'preview' ? this.renderBatchPreview() : nothing}
          ${this.batchView === 'result' ? this.renderBatchResult() : nothing}
          ${this.batchView === 'history' ? this.renderBatchHistory() : nothing}
        </cds-modal-body>
        <cds-modal-footer>
          ${this.batchView === 'issues' ? html`
            <cds-modal-footer-button kind="danger--tertiary" @click=${this.discardBatch}>放弃草稿</cds-modal-footer-button>
            <cds-modal-footer-button kind="secondary" @click=${this.closeBatch}>稍后处理</cds-modal-footer-button>
            <cds-modal-footer-button kind="primary" @click=${this.goPreview}
              ?disabled=${!this.batchDraft?.issues.some((issue) => issue.selected)}>预览批次</cds-modal-footer-button>
          ` : nothing}
          ${this.batchView === 'preview' ? html`
            <cds-modal-footer-button kind="secondary" @click=${this.backToIssues}>返回修改</cds-modal-footer-button>
            <cds-modal-footer-button kind="primary" @click=${this.submitBatchNow}>确认并一次提交</cds-modal-footer-button>
          ` : nothing}
          ${this.batchView === 'result' ? html`
            <cds-modal-footer-button kind="secondary" @click=${() => { this.batchView = 'history'; }}>批次回看</cds-modal-footer-button>
            <cds-modal-footer-button kind="danger--tertiary" @click=${this.undoLastBatch}>整批撤销</cds-modal-footer-button>
            <cds-modal-footer-button kind="primary" @click=${this.closeBatch}>完成值守</cds-modal-footer-button>
          ` : nothing}
          ${this.batchView === 'history' ? html`
            <cds-modal-footer-button kind="primary" @click=${this.closeBatch}>关闭</cds-modal-footer-button>
          ` : nothing}
        </cds-modal-footer>
      </cds-modal>
    `;
  }

  private renderInspector() {
    const item = this.selected;
    const confirmed = this.model.segments.filter((segment) => segment.state === 'confirmed').sort((a, b) => a.startTime - b.startTime);
    return html`
      <div class="inspector">
        <section class="inspector-section">
          <div class="inspector-section-head">
            <h3>术语快捷规则</h3>
            <span>${this.model.rules.filter((rule) => rule.enabled).length} 条启用</span>
          </div>
          <div class="rule-list">
            ${this.model.rules.map((rule) => html`
              <div class="rule-item">
                <div>
                  <strong>${rule.source} → ${rule.replacement}</strong>
                  <p>${rule.speaker || '全部发言人'} · 已使用 ${rule.usageCount} 次</p>
                </div>
                <div class="rule-item-actions">
                  <cds-button kind="ghost" size="sm" @click=${() => this.applyTerm(rule.id)}>应用</cds-button>
                  <cds-button kind="danger--ghost" size="xs" @click=${() => this.deleteRule(rule.id)}>删除</cds-button>
                </div>
              </div>
            `)}
          </div>
          ${this.showRuleForm ? html`
            <div class="rule-form">
              <cds-text-input label-text="原文" .value=${this.ruleSource} @input=${(event: Event) => { this.ruleSource = (event.currentTarget as any).value; }}></cds-text-input>
              <cds-text-input label-text="替换为" .value=${this.ruleReplacement} @input=${(event: Event) => { this.ruleReplacement = (event.currentTarget as any).value; }}></cds-text-input>
              <cds-text-input class="full" label-text="仅对某发言人应用（可空）" .value=${this.ruleSpeaker} @input=${(event: Event) => { this.ruleSpeaker = (event.currentTarget as any).value; }}></cds-text-input>
              <cds-button class="full" size="sm" kind="primary" @click=${this.addRule}>保存规则</cds-button>
            </div>
          ` : html`
            <div style="padding: 10px;"><cds-button kind="tertiary" size="sm" @click=${() => { this.showRuleForm = true; }}>＋ 新增术语规则</cds-button></div>
          `}
        </section>

        <section class="inspector-section">
          <div class="inspector-section-head">
            <h3>直播区时间线</h3>
            <span>${confirmed.length} 段已确认</span>
          </div>
          <div class="live-timeline">
            ${confirmed.length ? confirmed.slice(-12).reverse().map((segment) => html`
              <article class="live-item">
                <time>${formatClock(segment.startTime)} · ${segment.speaker}</time>
                <p>${segment.corrected}</p>
                ${segment.source === 'offline' ? html`<small>离线来源 · 恢复后合并</small>` : nothing}
              </article>
            `) : html`<div class="empty"><strong>直播区等待内容</strong><p>确认一块字幕后，它会从这里进入实时输出。</p></div>`}
          </div>
          ${this.stats.offline > 0 ? html`<div class="delivery-status">离线发件箱有 ${this.stats.offline} 段待合并。恢复连接后按时间顺序提交，不会覆盖已确认内容。</div>` : nothing}
        </section>

        <section class="inspector-section">
          <div class="inspector-section-head">
            <h3>当前片段上下文</h3>
            <span>${item ? `#${item.sequence}` : '未选择'}</span>
          </div>
          <div style="padding: 12px; line-height: 1.5; font-size: 11px;">
            ${item ? html`
              <div><strong>原始字幕：</strong>${item.original}</div>
              <div style="margin-top: 8px;"><strong>修改前校正：</strong>${item.corrected}</div>
              <div style="margin-top: 8px; color: var(--cds-text-secondary);">${item.tags.length ? `标签：${item.tags.join('、')}` : '尚未应用术语标签'}</div>
            ` : html`<span>请选择片段以查看上下文。</span>`}
          </div>
        </section>
      </div>
    `;
  }

  render() {
    const stats = this.stats;
    const backlogRatio = Math.min(100, stats.backlog * 8);
    return html`
      <div class="shell ${this.dark ? 'dark' : ''}" style=${`--caption-font-size: ${this.model.fontSize}px`}>
        <header class="topbar">
          <div class="brand">
            <div class="brand-mark">CC</div>
            <div class="brand-copy">
              <strong>LiveCaption Desk</strong>
              <span>${this.model.eventName} · ${this.model.eventDate}</span>
            </div>
          </div>
          <div class="connection-pill ${this.model.connection}">
            <span class="connection-dot"></span>
            <div class="connection-copy">
              <strong>${connectionLabel(this.model.connection)} · ${this.model.simulatedDelay.toFixed(1)} 秒延迟</strong>
              <small>${this.model.connection === 'offline' ? '仍可编辑，确认内容进入离线发件箱' : `待确认队列 ${stats.pending} 段 · 最近自动保存 ${new Date(this.model.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}</small>
            </div>
          </div>
          <div class="header-actions">
            <cds-button kind="ghost" size="sm" @click=${this.toggleTheme}>${this.dark ? '浅色界面' : '深色值守'}</cds-button>
            <cds-button kind="ghost" size="sm" @click=${this.undo}>撤销</cds-button>
            <cds-button kind="ghost" size="sm" @click=${this.redo}>重做</cds-button>
            <cds-button kind="primary" size="sm" @click=${this.exportSrt}>导出 SRT</cds-button>
          </div>
        </header>

        <section class="status-strip">
          <div class="status-cell hero">
            <strong>${this.model.connection === 'offline' ? '离线校正中，确认后暂存发件箱' : stats.backlog > 8 ? '队列积压，建议优先处理过期片段' : '队列节奏正常，可以继续逐段确认'}</strong>
            <span>待确认 ${stats.pending} · 过期 ${stats.stale} · 重复 ${stats.duplicate} · 离线待合并 ${stats.offline}</span>
            <div class="queue-track"><span style=${`width:${backlogRatio}%`}></span></div>
          </div>
          <div class="status-cell"><strong>${stats.pending}</strong><span>待确认片段</span></div>
          <div class="status-cell warning"><strong>${stats.oldestWaitSeconds}s</strong><span>最长等待时间</span></div>
          <div class="status-cell danger"><strong>${stats.stale + stats.duplicate}</strong><span>需要明确处理</span></div>
          <div class="status-cell"><strong>${this.model.simulatedDelay.toFixed(1)}s</strong><span>当前流延迟</span></div>
          <div class="font-controls">
            <label>字幕字号</label>
            <cds-button kind="ghost" size="sm" @click=${() => this.adjustFont(-1)}>A−</cds-button>
            <strong>${this.model.fontSize}</strong>
            <cds-button kind="ghost" size="sm" @click=${() => this.adjustFont(1)}>A＋</cds-button>
          </div>
        </section>

        <main class="workspace">
          <section class="column">
            <div class="column-head">
              <div>
                <h2>待确认区</h2>
                <p>按收到顺序排列，重复和过期内容不会被静默覆盖</p>
              </div>
              <cds-dropdown value=${this.filter} @cds-dropdown-selected=${(event: CustomEvent<{ item: { value: string } }>) => { this.filter = event.detail.item.value as typeof this.filter; }}>
                <cds-dropdown-item value="active">仅需处理</cds-dropdown-item>
                <cds-dropdown-item value="attention">异常优先</cds-dropdown-item>
                <cds-dropdown-item value="all">全部片段</cds-dropdown-item>
              </cds-dropdown>
            </div>
            <div class="column-body">${this.renderPendingList()}</div>
          </section>

          <section class="column">
            <div class="column-head">
              <div>
                <h2>校对编辑台</h2>
                <p>标点、专有名词、发言人和数字均可在确认前修改</p>
              </div>
              <div class="head-actions">
                <cds-tag type="green" size="sm">本地草稿</cds-tag>
                <cds-button kind="secondary" size="sm" @click=${this.openHistory}>批次回看</cds-button>
                <cds-button class="batch-entry" kind="primary" size="sm" @click=${this.openBatch}>
                  质检批次
                  <span class=${`batch-entry-count ${this.currentBatchIssueCount ? '' : 'zero'}`}>${this.currentBatchIssueCount}</span>
                </cds-button>
                ${this.batchDraft ? html`<span class="batch-draft-dot">● 有未完成批次</span>` : nothing}
              </div>
            </div>
            <div class="column-body" style=${`font-size:${this.model.fontSize}px`}>${this.renderEditor()}</div>
          </section>

          <section class="column">
            <div class="column-head">
              <div>
                <h2>规则与直播区</h2>
                <p>确认后进入直播输出；离线内容恢复后统一合并</p>
              </div>
              ${this.model.connection === 'offline'
                ? html`<cds-button kind="primary" size="sm" @click=${this.mergeOffline}>恢复并合并</cds-button>`
                : html`<cds-button kind="danger--tertiary" size="sm" @click=${() => this.setConnection('offline')}>模拟断线</cds-button>`}
            </div>
            <div class="column-body">${this.renderInspector()}</div>
          </section>
        </main>

        <div class="toast-stack">
          ${this.toasts.map((toast) => html`
            <cds-toast-notification
              kind=${toast.kind}
              title=${toast.title}
              subtitle=${toast.subtitle}
              @cds-notification-closed=${() => { this.toasts = this.toasts.filter((item) => item.id !== toast.id); }}
            ></cds-toast-notification>
          `)}
        </div>

        ${this.renderBatchModal()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'caption-desk': CaptionDesk;
  }
}
