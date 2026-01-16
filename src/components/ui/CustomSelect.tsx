import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption<T = string | number> {
  value: T;
  label: string;
}

interface CustomSelectProps<T = string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

export function CustomSelect<T extends string | number>({
  value,
  options,
  onChange,
  disabled = false,
  className = '',
  placeholder = 'Select...',
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<DropdownPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4, 
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePositionUpdate = () => updatePosition();

    window.addEventListener('scroll', handlePositionUpdate, true);
    window.addEventListener('resize', handlePositionUpdate);

    return () => {
      window.removeEventListener('scroll', handlePositionUpdate, true);
      window.removeEventListener('resize', handlePositionUpdate);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: T) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const renderDropdown = () => {
    if (!isOpen || !position) return null;

    return createPortal(
      <div
        ref={dropdownRef}
        className="fixed z-[9999] py-1 rounded-lg bg-[#1a1a2e] border border-white/10 shadow-xl shadow-black/50 overflow-hidden"
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
        }}
      >
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => handleSelect(option.value)}
            className={`
              w-full flex items-center justify-between gap-2
              px-4 py-2.5 text-left
              transition-colors
              ${
                option.value === value
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-primary hover:bg-white/10'
              }
            `}
          >
            <span>{option.label}</span>
            {option.value === value && <Check className="w-4 h-4" />}
          </button>
        ))}
      </div>,
      document.body
    );
  };

  return (
    <div className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-2
          px-4 py-2.5 rounded-lg
          bg-white/5 border border-white/10
          text-primary text-left
          focus:outline-none focus:border-purple-500/50
          transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'}
          ${isOpen ? 'border-purple-500/50' : ''}
        `}
      >
        <span className={selectedOption ? '' : 'text-muted'}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {renderDropdown()}
    </div>
  );
}

export default CustomSelect;
