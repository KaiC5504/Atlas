import { useState, useRef } from 'react';
import { Download, Upload, FileJson, FileSpreadsheet, Check, AlertCircle } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import type { GachaAccount, GachaHistory, UigfExport } from '../../types/gacha';
import { getGameDisplayName } from '../../types/gacha';

// Helper to write file using Tauri's fs API
async function writeFileToPath(path: string, content: string): Promise<void> {
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  await writeTextFile(path, content);
}

interface GachaExportProps {
  accounts: GachaAccount[];
  history: GachaHistory | null;
  onExport: (accounts: GachaAccount[]) => Promise<UigfExport>;
  onImport: (data: UigfExport) => Promise<void>;
}

export function GachaExport({ accounts, history, onExport, onImport }: GachaExportProps) {
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleAccount = (uid: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedAccounts(new Set(accounts.map((a) => `${a.game}:${a.uid}`)));
  };

  const selectNone = () => {
    setSelectedAccounts(new Set());
  };

  const handleExportUigf = async () => {
    if (selectedAccounts.size === 0) {
      setMessage({ type: 'error', text: 'Please select at least one account to export' });
      return;
    }

    setIsExporting(true);
    setMessage(null);

    try {
      const accountsToExport = accounts.filter(
        (a) => selectedAccounts.has(`${a.game}:${a.uid}`)
      );

      const uigfData = await onExport(accountsToExport);

      const filePath = await save({
        defaultPath: `atlas_gacha_export_${Date.now()}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      if (filePath) {
        await writeFileToPath(filePath, JSON.stringify(uigfData, null, 2));
        setMessage({ type: 'success', text: `Exported ${accountsToExport.length} account(s) to UIGF format` });
      }
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Export failed' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCsv = async () => {
    if (!history) {
      setMessage({ type: 'error', text: 'No history loaded to export' });
      return;
    }

    setIsExporting(true);
    setMessage(null);

    try {
      const headers = ['ID', 'Time', 'Name', 'Type', 'Rarity', 'Banner', 'UID'];
      const rows = history.records.map((r) => [
        r.id,
        r.time,
        r.name,
        r.item_type,
        r.rank_type,
        r.gacha_type,
        r.uid,
      ]);

      const csvContent = [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(','))
        .join('\n');

      const filePath = await save({
        defaultPath: `gacha_${history.game}_${history.uid}_${Date.now()}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });

      if (filePath) {
        await writeFileToPath(filePath, csvContent);
        setMessage({ type: 'success', text: `Exported ${history.records.length} records to CSV` });
      }
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Export failed' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setMessage(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text) as UigfExport;

      // Validate UIGF format
      if (!data.info?.version?.startsWith('v4')) {
        throw new Error('Invalid UIGF format. Only v4.0 is supported.');
      }

      await onImport(data);

      const accountCount =
        (data.hk4e?.length || 0) + (data.hkrpg?.length || 0) + (data.nap?.length || 0);

      setMessage({ type: 'success', text: `Imported ${accountCount} account(s)` });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Import failed' });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Message */}
      {message && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Export Section */}
      <div className="card">
        <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
          <Download className="w-5 h-5" />
          Export
        </h3>

        {/* Account Selection */}
        {accounts.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-secondary">Select accounts to export:</span>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Select All
                </button>
                <span className="text-text-tertiary">|</span>
                <button
                  onClick={selectNone}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Select None
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {accounts.map((account) => {
                const key = `${account.game}:${account.uid}`;
                const isSelected = selectedAccounts.has(key);
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-500/10 border border-indigo-500/20'
                        : 'bg-white/5 border border-white/10 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleAccount(key)}
                      className="w-4 h-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-text-primary">
                        {getGameDisplayName(account.game)}
                      </div>
                      <div className="text-sm text-text-tertiary">
                        UID: {account.uid} • {account.total_records} records
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Export Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportUigf}
            disabled={isExporting || accounts.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white rounded-lg transition-colors"
          >
            <FileJson className="w-4 h-4" />
            Export UIGF (JSON)
          </button>
          <button
            onClick={handleExportCsv}
            disabled={isExporting || !history}
            className="flex items-center gap-2 px-4 py-2 glass border border-white/10 hover:bg-white/10 disabled:opacity-50 text-text-primary rounded-lg transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Current Account (CSV)
          </button>
        </div>
      </div>

      {/* Import Section */}
      <div className="card">
        <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Import
        </h3>

        <p className="text-sm text-text-secondary mb-4">
          Import gacha history from UIGF v4.0 format. This is compatible with exports from Starward,
          Paimon.moe, and other UIGF-compliant apps.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />

        <button
          onClick={handleImportClick}
          disabled={isImporting}
          className="flex items-center gap-2 px-4 py-2 glass border border-white/10 hover:bg-white/10 disabled:opacity-50 text-text-primary rounded-lg transition-colors"
        >
          <FileJson className="w-4 h-4" />
          {isImporting ? 'Importing...' : 'Import UIGF (JSON)'}
        </button>
      </div>
    </div>
  );
}
