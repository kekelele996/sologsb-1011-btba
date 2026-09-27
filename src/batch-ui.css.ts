import { css } from 'lit';

export const batchStyles = css`
/* 质检批次模态框与回看样式 */

.segment-batch-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
.batch-pill {
  padding: 2px 7px;
  font-size: 10px;
  line-height: 1.5;
  border: 1px solid currentColor;
  border-radius: 2px;
}
.batch-pill.punctuation { color: #0f62fe; background: #edf5ff; }
.batch-pill.number { color: #007d79; background: #d9fbf4; }
.batch-pill.term { color: #8a3ffc; background: #f6f2ff; }
.batch-pill.stale { color: #8d6e00; background: #fff8e1; }
.batch-pill.duplicate { color: #6929c4; background: #f6f2ff; }

.batch-entry { position: relative; }
.batch-entry .batch-entry-count {
  position: absolute;
  top: -7px;
  right: -9px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  display: grid;
  place-items: center;
  background: #fa4d56;
  color: #fff;
  border-radius: 9px;
  font: 600 10px/1 "IBM Plex Mono", monospace;
}
.batch-entry .batch-entry-count.zero { background: #393939; }
.batch-draft-dot { color: #f1c21b; font-size: 10px; }

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.batch-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: var(--cds-layer-02, #f4f4f4);
  border: 1px solid var(--cds-border-subtle, #e0e0e0);
  margin-bottom: 10px;
}
.batch-summary strong { font-size: 13px; }
.batch-summary span { color: var(--cds-text-secondary, #525252); font-size: 11px; }

.batch-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.batch-toolbar .spacer { flex: 1; }
.batch-toolbar small { color: var(--cds-text-secondary, #525252); font-size: 10px; }

.batch-group {
  border: 1px solid var(--cds-border-subtle, #e0e0e0);
  background: var(--cds-layer, #fff);
  margin-bottom: 10px;
}
.batch-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  background: var(--cds-layer-02, #f4f4f4);
  border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0);
}
.batch-group-head strong { font-size: 12px; }
.batch-group-head p { margin: 2px 0 0; color: var(--cds-text-secondary, #525252); font-size: 10px; line-height: 1.4; }
.batch-group-count { color: var(--cds-text-secondary, #525252); font-size: 10px; white-space: nowrap; }

.batch-item {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 4px;
  padding: 9px 12px;
  border-top: 1px solid var(--cds-border-subtle, #e0e0e0);
}
.batch-group .batch-item:first-of-type { border-top: 0; }
.batch-item.blocked { background: color-mix(in srgb, var(--cds-layer, #fff) 96%, #f1c21b 4%); }
.batch-item.has-conflict { background: color-mix(in srgb, var(--cds-layer, #fff) 95%, #fa4d56 5%); }
.batch-check {
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
  cursor: pointer;
}
.batch-check input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #0f62fe;
  cursor: pointer;
}
.batch-check input:disabled { cursor: not-allowed; }

.batch-item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  color: var(--cds-text-secondary, #525252);
  font: 500 10px/1.3 "IBM Plex Mono", monospace;
}
.batch-item-meta button {
  border: 0;
  background: none;
  padding: 0;
  color: #0f62fe;
  font: inherit;
  cursor: pointer;
}
.batch-item-meta button:hover { text-decoration: underline; }
.batch-item-text {
  margin: 5px 0 0;
  font-size: 13px;
  line-height: 1.5;
}
.batch-item-after {
  margin: 4px 0 0;
  padding-left: 8px;
  border-left: 2px solid #42be65;
  color: #198038;
  font-size: 12px;
  line-height: 1.5;
}
.batch-conflict {
  margin-top: 7px;
  padding: 7px 9px;
  background: #fff1f1;
  border-left: 2px solid #fa4d56;
  color: #a2191f;
  font-size: 11px;
  line-height: 1.5;
}
.batch-skip-note {
  margin-top: 6px;
  color: #8d6e00;
  font-size: 10px;
  line-height: 1.45;
}

.batch-preview-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 10px 0 12px;
}
.batch-preview-stats span {
  padding: 6px 10px;
  border: 1px solid var(--cds-border-subtle, #e0e0e0);
  font-size: 11px;
  background: var(--cds-layer, #fff);
}
.batch-preview-stats b { font-weight: 600; }
.batch-preview-row {
  border: 1px solid var(--cds-border-subtle, #e0e0e0);
  background: var(--cds-layer, #fff);
  margin-bottom: 8px;
}
.batch-preview-row header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 7px 10px;
  border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0);
  background: var(--cds-layer-02, #f4f4f4);
}
.batch-preview-row header span { font: 500 10px/1.3 "IBM Plex Mono", monospace; color: var(--cds-text-secondary, #525252); }
.batch-preview-body { padding: 8px 10px 9px; }
.batch-preview-body p { margin: 0 0 4px; font-size: 12px; line-height: 1.5; }
.batch-preview-body .after { color: #198038; }
.batch-preview-body .note { color: var(--cds-text-secondary, #525252); font-size: 10px; }

.batch-done-head {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--cds-border-subtle, #e0e0e0);
  border: 1px solid var(--cds-border-subtle, #e0e0e0);
  margin: 10px 0;
}
.batch-done-head div { background: var(--cds-layer, #fff); padding: 10px; text-align: center; }
.batch-done-head strong { display: block; font-size: 20px; font-weight: 400; font-variant-numeric: tabular-nums; }
.batch-done-head span { color: var(--cds-text-secondary, #525252); font-size: 10px; }

.batch-rule-stats { display: flex; flex-direction: column; gap: 6px; margin: 8px 0 12px; }
.batch-rule-chip {
  align-self: flex-start;
  padding: 5px 9px;
  border: 1px solid #a6c8ff;
  background: #edf5ff;
  color: #0043ce;
  font-size: 11px;
}
.batch-note { margin: 4px 0; color: var(--cds-text-secondary, #525252); font-size: 10px; line-height: 1.5; }

.batch-report {
  border: 1px solid var(--cds-border-subtle, #e0e0e0);
  background: var(--cds-layer, #fff);
  margin-bottom: 8px;
}
.batch-report > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  cursor: pointer;
  list-style: none;
}
.batch-report > summary::-webkit-details-marker { display: none; }
.batch-report > summary::before { content: '▸'; color: var(--cds-text-secondary, #525252); font-size: 10px; }
.batch-report[open] > summary::before { content: '▾'; }
.batch-report > summary strong { font-size: 12px; }
.batch-report > summary span { color: var(--cds-text-secondary, #525252); font-size: 10px; }
.batch-report-body { padding: 4px 12px 12px; border-top: 1px solid var(--cds-border-subtle, #e0e0e0); }
.batch-report-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0);
}
.batch-report-item:last-child { border-bottom: 0; }
.batch-report-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
  font-size: 10px;
  color: var(--cds-text-secondary, #525252);
}
.batch-report-item-head span:last-child { color: inherit; }
.batch-report-item.skipped .batch-item-text { color: var(--cds-text-secondary, #525252); }
`;
