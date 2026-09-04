import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Check, X, Users } from 'lucide-react';

const CharacterAvatar = ({ character, size = 'sm' }) => {
  const sizeClasses = {
    xs: 'h-5 w-5 text-[9px]',
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-8 w-8 text-xs',
    lg: 'h-10 w-10 text-sm',
  };
  const [imgError, setImgError] = useState(false);

  if (character.image_url && !imgError) {
    return (
      <img
        src={character.image_url}
        alt=""
        className={`${sizeClasses[size]} rounded-full object-cover border border-[var(--border-subtle)] shrink-0`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{
        background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
      }}
    >
      {character.name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
};

export const CharacterPicker = ({
  characters = [],
  selected = null,
  onSelect,
  multi = false,
  placeholder = 'Select character...',
  searchPlaceholder = 'Search characters...',
  maxVisible = 5,
  emptyMessage = 'No characters yet',
  disabled = false,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return characters;
    const q = query.toLowerCase();
    return characters.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.role?.toLowerCase().includes(q)
    );
  }, [characters, query]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const getSelectedCharacters = () => {
    if (multi && Array.isArray(selected)) {
      return characters.filter((c) => selected.includes(c.id));
    }
    if (!multi && selected) {
      return characters.filter((c) => c.id === selected);
    }
    return [];
  };

  const selectedChars = getSelectedCharacters();

  const handleSelect = (charId) => {
    if (multi) {
      const current = Array.isArray(selected) ? selected : [];
      const next = current.includes(charId)
        ? current.filter((id) => id !== charId)
        : [...current, charId];
      onSelect(next);
    } else {
      onSelect(selected === charId ? '' : charId);
      setOpen(false);
      setQuery('');
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onSelect(multi ? [] : '');
  };

  const renderTrigger = () => {
    if (multi) {
      return (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={disabled}
          className="w-full flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-2 py-1.5 text-left transition-all hover:border-[var(--accent)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Users className="h-3.5 w-3.5 text-[var(--text-dim)] shrink-0" />
          {selectedChars.length === 0 ? (
            <span className="text-[var(--text-dim)] text-xs">{placeholder}</span>
          ) : (
            <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
              {selectedChars.slice(0, 3).map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"
                >
                  {c.name}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(c.id);
                    }}
                    className="hover:text-[var(--accent-hover)]"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              {selectedChars.length > 3 && (
                <span className="text-[10px] text-[var(--text-dim)]">
                  +{selectedChars.length - 3} more
                </span>
              )}
            </div>
          )}
          {selectedChars.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)]"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </button>
      );
    }

    const selectedChar = selectedChars[0];
    return (
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={`w-full flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-left transition-all hover:border-[var(--accent)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed ${
          compact ? 'px-2 py-1' : 'px-2 py-1.5'
        }`}
      >
        {selectedChar ? (
          <>
            <CharacterAvatar character={selectedChar} size={compact ? 'xs' : 'sm'} />
            <span className="text-xs font-medium text-[var(--text-main)] truncate flex-1">
              {selectedChar.name}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)] shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <>
            <Users className="h-3.5 w-3.5 text-[var(--text-dim)] shrink-0" />
            <span className="text-xs text-[var(--text-dim)] flex-1">{placeholder}</span>
          </>
        )}
      </button>
    );
  };

  const renderDropdownItem = (char) => {
    const isSelected = multi
      ? Array.isArray(selected) && selected.includes(char.id)
      : selected === char.id;

    return (
      <button
        key={char.id}
        type="button"
        onClick={() => handleSelect(char.id)}
        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-all ${
          isSelected
            ? 'bg-[var(--accent-light)] border border-[var(--accent)]/30'
            : 'hover:bg-[var(--bg-hover)] border border-transparent'
        }`}
      >
        <CharacterAvatar character={char} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-[var(--text-main)] truncate">
            {char.name}
          </div>
          {char.role && (
            <div className="text-[10px] text-[var(--text-dim)] truncate">
              {char.role}
            </div>
          )}
        </div>
        {isSelected && (
          <Check className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
        )}
      </button>
    );
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {renderTrigger()}

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-2.5 py-2">
            <Search className="h-3.5 w-3.5 text-[var(--text-dim)] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-xs text-[var(--text-main)] focus:outline-none placeholder:text-[var(--text-dim)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-dim)]"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Character list */}
          <div
            className="overflow-y-auto py-1"
            style={{ maxHeight: `${maxVisible * 48 + 16}px` }}
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <Users className="h-6 w-6 text-[var(--text-dim)] mx-auto mb-1.5 opacity-50" />
                <p className="text-[11px] text-[var(--text-dim)]">
                  {characters.length === 0 ? emptyMessage : 'No matches found'}
                </p>
              </div>
            ) : (
              filtered.map((char) => renderDropdownItem(char))
            )}
          </div>

          {/* Footer hint */}
          {multi && Array.isArray(selected) && selected.length > 0 && (
            <div className="border-t border-[var(--border-subtle)] px-3 py-1.5 bg-[var(--bg-panel)]">
              <span className="text-[10px] text-[var(--text-dim)]">
                {selected.length} character{selected.length !== 1 ? 's' : ''} selected
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CharacterPicker;
