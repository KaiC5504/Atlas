import { useState, useCallback, useEffect, useRef } from 'react';
import { GripVertical, Eye, EyeOff } from 'lucide-react';
import { type NavigationItemId, NAVIGATION_ITEMS } from '../config/navigationItems';

interface DraggableNavListProps {
  items: NavigationItemId[];
  hiddenItems: Set<NavigationItemId>;
  onReorder: (newOrder: NavigationItemId[]) => void;
  onToggleVisibility: (itemId: NavigationItemId) => void;
  disabled?: boolean;
}

export function DraggableNavList({ items, hiddenItems, onReorder, onToggleVisibility, disabled }: DraggableNavListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverHalf, setHoverHalf] = useState<'top' | 'bottom'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (draggedIndex === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const mouseY = e.clientY;

      const itemCenters: { index: number; center: number }[] = [];

      for (let i = 0; i < items.length; i++) {
        if (i === draggedIndex) continue;

        const itemEl = itemRefs.current.get(i);
        if (!itemEl) continue;

        const rect = itemEl.getBoundingClientRect();
        itemCenters.push({
          index: i,
          center: rect.top + rect.height / 2,
        });
      }

      if (itemCenters.length === 0) return;

      itemCenters.sort((a, b) => a.center - b.center);

      //Check Cursor
      let foundIndex: number = itemCenters[0].index;
      let foundHalf: 'top' | 'bottom' = 'top';

      for (let i = 0; i < itemCenters.length; i++) {
        if (mouseY < itemCenters[i].center) {
          foundIndex = itemCenters[i].index;
          foundHalf = 'top';
          break;
        }
        foundIndex = itemCenters[i].index;
        foundHalf = 'bottom';
      }

      setHoverIndex(foundIndex);
      setHoverHalf(foundHalf);
    };

    const handleMouseUp = () => {
      if (draggedIndex === null || hoverIndex === null) {
        setDraggedIndex(null);
        setHoverIndex(null);
        return;
      }

      let targetPos: number;
      if (hoverHalf === 'top') {
        targetPos = hoverIndex;
      } else {
        targetPos = hoverIndex + 1;
      }

      // Adjust for removal of dragged item
      if (draggedIndex < targetPos) {
        targetPos -= 1;
      }

      if (targetPos !== draggedIndex) {
        const newOrder = [...items];
        const [removed] = newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetPos, 0, removed);
        onReorder(newOrder);
      }

      setDraggedIndex(null);
      setHoverIndex(null);
    };

    const handleSelectStart = (e: Event) => e.preventDefault();

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectstart', handleSelectStart);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectstart', handleSelectStart);
    };
  }, [draggedIndex, hoverIndex, hoverHalf, items, onReorder]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      if (disabled) return;
      e.preventDefault();
      setDraggedIndex(index);
      setHoverIndex(null);
    },
    [disabled]
  );

  const isDragging = draggedIndex !== null;

  // Determine drop indicator
  const getIndicatorPosition = (index: number): 'above' | 'below' | null => {
    if (!isDragging || hoverIndex === null || draggedIndex === null) return null;

    if (index === draggedIndex) return null;

    if (index === hoverIndex) {
      return hoverHalf === 'top' ? 'above' : 'below';
    }

    return null;
  };

  return (
    <div ref={containerRef} className={`space-y-1 select-none ${disabled ? 'cursor-not-allowed' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}>
      {items.map((itemId, index) => {
        const item = NAVIGATION_ITEMS[itemId];
        const Icon = item.icon;
        const isBeingDragged = draggedIndex === index;
        const indicatorPosition = getIndicatorPosition(index);
        const isHidden = hiddenItems.has(itemId);
        const isSettings = itemId === 'settings';

        return (
          <div key={itemId} className="relative">
            {indicatorPosition === 'above' && (
              <div className="absolute -top-[3px] left-0 right-0 h-[3px] bg-accent-primary rounded-full z-10 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
            )}

            <div
              ref={el => {
                if (el) {
                  itemRefs.current.set(index, el);
                } else {
                  itemRefs.current.delete(index);
                }
              }}
              onMouseDown={e => handleMouseDown(e, index)}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-lg
                border transition-all duration-150
                ${disabled
                  ? 'bg-white/5 border-white/10 opacity-50 cursor-not-allowed'
                  : isBeingDragged
                    ? 'bg-accent-primary/20 border-accent-primary shadow-lg shadow-accent-primary/25 scale-[1.02] cursor-grabbing'
                    : isDragging
                      ? 'bg-white/3 border-white/5 opacity-60 cursor-grabbing'
                      : 'bg-white/5 border-white/10 cursor-grab hover:bg-white/8 hover:border-white/15'
                }
                ${isHidden ? 'opacity-50' : ''}
              `}
              style={{
                position: 'relative',
                zIndex: isBeingDragged ? 20 : 1,
              }}
            >
              <GripVertical
                size={16}
                className={`shrink-0 transition-colors duration-150 ${
                  isBeingDragged ? 'text-accent-primary' : 'text-text-muted'
                }`}
              />
              <Icon
                size={18}
                className={`shrink-0 transition-colors duration-150 ${
                  isBeingDragged ? 'text-white' : 'text-text-secondary'
                }`}
              />
              <span
                className={`text-sm truncate transition-colors duration-150 ${
                  isBeingDragged ? 'text-white font-medium' : 'text-text-primary'
                }`}
              >
                {item.label}
              </span>
              {item.isDeveloperOnly && (
                <span className="text-xs text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded">
                  Dev
                </span>
              )}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  if (!isSettings && !disabled) {
                    onToggleVisibility(itemId);
                  }
                }}
                onMouseDown={e => e.stopPropagation()}
                disabled={disabled || isSettings}
                className={`
                  ml-auto p-1 rounded transition-colors cursor-pointer
                  ${isSettings
                    ? 'text-text-muted/30 cursor-not-allowed'
                    : isHidden
                      ? 'text-text-muted hover:text-text-secondary hover:bg-white/5'
                      : 'text-green-400 hover:text-green-300 hover:bg-white/5'
                  }
                `}
                title={isSettings ? 'Settings is always visible' : isHidden ? 'Show in sidebar' : 'Hide from sidebar'}
              >
                {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {indicatorPosition === 'below' && (
              <div className="absolute -bottom-[3px] left-0 right-0 h-[3px] bg-accent-primary rounded-full z-10 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
            )}
          </div>
        );
      })}
    </div>
  );
}
