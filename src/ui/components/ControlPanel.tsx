import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ItemId } from '../../core/schema.ts';
import { BUNDLED_DATASETS } from '../datasets.ts';
import { saveUserRecipeSetJson } from '../persistence.ts';
import { useAppStore } from '../store/appStore.ts';
import { ExportPanel } from './ExportPanel.tsx';
import { ResolutionPanel } from './ResolutionPanel.tsx';

export function ControlPanel() {
  const recipeSet = useAppStore((s) => s.recipeSet);
  const datasetId = useAppStore((s) => s.datasetId);
  const targetItem = useAppStore((s) => s.targetItem);
  const targetQtyInput = useAppStore((s) => s.targetQtyInput);
  const error = useAppStore((s) => s.error);
  const loadRecipeSet = useAppStore((s) => s.loadRecipeSet);
  const setTargetItem = useAppStore((s) => s.setTargetItem);
  const setTargetQtyInput = useAppStore((s) => s.setTargetQtyInput);

  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSelectDataset(id: string): Promise<void> {
    const dataset = BUNDLED_DATASETS.find((d) => d.id === id);
    if (dataset === undefined) return;
    const json = await dataset.load();
    loadRecipeSet(dataset.id, json);
  }

  function loadUserJsonText(text: string): void {
    try {
      const json: unknown = JSON.parse(text);
      setJsonError(null);
      loadRecipeSet('user-provided', json);
      saveUserRecipeSetJson(text);
    } catch {
      setJsonError('JSON の構文が不正です');
    }
  }

  function handleLoadPastedJson(): void {
    loadUserJsonText(jsonInput);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setJsonInput(text);
      loadUserJsonText(text);
    };
    reader.readAsText(file);
    e.target.value = ''; // 同じファイルを続けて選び直せるようにする
  }

  const isBundled = datasetId !== null && BUNDLED_DATASETS.some((d) => d.id === datasetId);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        width: 320,
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      <section>
        <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>データセット</h2>
        <select
          value={datasetId ?? ''}
          onChange={(e) => {
            void handleSelectDataset(e.target.value);
          }}
        >
          <option value="" disabled>
            選択してください
          </option>
          {BUNDLED_DATASETS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>JSON を貼り付け / アップロード</h2>
        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          rows={6}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 11 }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
          <button type="button" onClick={handleLoadPastedJson}>
            読み込む
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            ファイルを選択
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
        {jsonError !== null && <p style={{ color: '#e06c75', fontSize: 12 }}>{jsonError}</p>}
      </section>

      {recipeSet !== null && (
        <section>
          <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>目標アイテム</h2>
          <select
            value={targetItem ?? ''}
            onChange={(e) => setTargetItem(e.target.value as ItemId)}
          >
            <option value="" disabled>
              選択してください
            </option>
            {recipeSet.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 8 }}>
            <label htmlFor="target-qty">
              数量（
              {recipeSet.profile.quantityMode === 'discrete' ? '個' : '毎秒'}）
            </label>
            <input
              id="target-qty"
              type="text"
              value={targetQtyInput}
              onChange={(e) => setTargetQtyInput(e.target.value)}
              style={{ display: 'block', marginTop: 4, width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <p style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
            {isBundled
              ? '同梱データセットのため、URL で現在の状態を共有できます。'
              : 'ユーザー投入データのため、共有リンクは無効です（URL には反映されません）。'}
          </p>
        </section>
      )}

      <ResolutionPanel />

      <ExportPanel />

      {error !== null && (
        <section>
          <p style={{ color: '#e06c75', fontSize: 12, whiteSpace: 'pre-wrap' }}>{error}</p>
        </section>
      )}
    </div>
  );
}
