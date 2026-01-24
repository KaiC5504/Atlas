import { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import type { GachaRecord, GachaGame, GachaType } from '../../types/gacha';
import {
  getGachaTypeName,
  getGachaTypes,
  getRarityColor,
  getRarityBgColor,
} from '../../types/gacha';
import { CustomSelect } from '../ui/CustomSelect';

interface GachaRecordsTableProps {
  game: GachaGame;
  records: GachaRecord[];
}

const ITEMS_PER_PAGE = 50;

export function GachaRecordsTable({ game, records }: GachaRecordsTableProps) {
  const [search, setSearch] = useState('');
  const [rarityFilter, setRarityFilter] = useState<string>('all');
  const [bannerFilter, setBannerFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const gachaTypes = getGachaTypes(game);

  // Filter and search records
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      // Search filter
      if (search && !record.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }

      // Rarity filter
      if (rarityFilter !== 'all' && record.rank_type !== rarityFilter) {
        return false;
      }

      // Banner filter
      if (bannerFilter !== 'all' && record.gacha_type !== bannerFilter) {
        return false;
      }

      return true;
    });
  }, [records, search, rarityFilter, bannerFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRecords.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRecords, currentPage]);

  // Reset page when filters change
  const handleFilterChange = (setter: (val: string) => void) => (value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => handleFilterChange(setSearch)(e.target.value)}
            className="w-full pl-9 pr-4 py-2 glass border border-white/10 rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Rarity Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-text-tertiary" />
          <CustomSelect
            value={rarityFilter}
            onChange={handleFilterChange(setRarityFilter)}
            options={[
              { value: 'all', label: 'All Rarities' },
              { value: '5', label: '5-Star' },
              { value: '4', label: '4-Star' },
              { value: '3', label: '3-Star' },
            ]}
            className="min-w-[140px]"
          />
        </div>

        {/* Banner Filter */}
        <CustomSelect
          value={bannerFilter}
          onChange={handleFilterChange(setBannerFilter)}
          options={[
            { value: 'all', label: 'All Banners' },
            ...gachaTypes.map((type: GachaType) => ({
              value: type.id,
              label: type.name,
            })),
          ]}
          className="min-w-[160px]"
        />
      </div>

      {/* Results Count */}
      <div className="text-sm text-text-secondary">
        Showing {paginatedRecords.length} of {filteredRecords.length} records
        {filteredRecords.length !== records.length && (
          <span className="text-text-tertiary"> (filtered from {records.length} total)</span>
        )}
      </div>

      {/* Table */}
      <div className="glass-elevated rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Type</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-text-secondary">Rarity</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Banner</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {paginatedRecords.map((record) => (
                <tr key={record.id} className="hover:bg-surface-base/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`font-medium ${getRarityColor(record.rank_type)}`}>
                      {record.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {record.item_type}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold ${getRarityColor(record.rank_type)} ${getRarityBgColor(record.rank_type)}`}>
                      {record.rank_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-sm">
                    {getGachaTypeName(game, record.gacha_type)}
                  </td>
                  <td className="px-4 py-3 text-text-tertiary text-sm">
                    {record.time}
                  </td>
                </tr>
              ))}
              {paginatedRecords.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-text-secondary">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 glass border border-white/10 rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (currentPage <= 3) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = currentPage - 2 + i;
                }
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === page
                        ? 'bg-indigo-600 text-white'
                        : 'glass border border-white/10 hover:bg-white/10 text-text-secondary'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 glass border border-white/10 rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
