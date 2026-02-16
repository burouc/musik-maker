import React, { useState } from 'react';
import type { Pattern } from '../types';

interface PatternSelectorProps {
  patterns: Pattern[];
  activePatternId: string;
  onSelectPattern: (patternId: string) => void;
  onAddPattern: () => void;
  onDeletePattern: (patternId: string) => void;
  onDuplicatePattern: (patternId: string) => void;
  onRenamePattern: (patternId: string, name: string) => void;
}

const PatternSelector = React.memo<PatternSelectorProps>(
  function PatternSelector({
    patterns,
    activePatternId,
    onSelectPattern,
    onAddPattern,
    onDeletePattern,
    onDuplicatePattern,
    onRenamePattern,
  }) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const startRename = (pattern: Pattern) => {
      setEditingId(pattern.id);
      setEditName(pattern.name);
    };

    const commitRename = () => {
      if (editingId && editName.trim()) {
        onRenamePattern(editingId, editName.trim());
      }
      setEditingId(null);
    };

    return (
      <div className="pattern-selector">
        <div className="pattern-selector-label">Patterns</div>
        <div className="pattern-list">
          {patterns.map((pattern) => (
            <div
              key={pattern.id}
              className={`pattern-chip${
                pattern.id === activePatternId ? ' active' : ''
              }`}
              style={
                {
                  '--pattern-color': pattern.color,
                } as React.CSSProperties
              }
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-pattern-id', pattern.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onSelectPattern(pattern.id)}
            >
              <span
                className="pattern-color-dot"
                style={{ background: pattern.color }}
              />
              {editingId === pattern.id ? (
                <input
                  className="pattern-rename-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className="pattern-name"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(pattern);
                  }}
                >
                  {pattern.name}
                </span>
              )}
              {pattern.id === activePatternId && (
                <div className="pattern-actions">
                  <button
                    className="pattern-action-btn"
                    title="Duplicate"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicatePattern(pattern.id);
                    }}
                  >
                    +
                  </button>
                  {patterns.length > 1 && (
                    <button
                      className="pattern-action-btn delete"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePattern(pattern.id);
                      }}
                    >
                      x
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          <button className="pattern-add-btn" onClick={onAddPattern}>
            + New
          </button>
        </div>
      </div>
    );
  },
);

export default PatternSelector;
