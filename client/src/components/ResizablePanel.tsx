import { useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import PanelDivider from './PanelDivider';

interface ResizablePanelProps {
  children: ReactNode;
  defaultHeight: number;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
  showDivider?: boolean;
}

export default function ResizablePanel({
  children,
  defaultHeight,
  minHeight = 60,
  maxHeight = 1200,
  className = '',
  showDivider = true,
}: ResizablePanelProps) {
  const [height, setHeight] = useState(defaultHeight);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback((delta: number) => {
    setHeight(prev => {
      const next = prev + delta;
      return Math.max(minHeight, Math.min(maxHeight, next));
    });
  }, [minHeight, maxHeight]);

  return (
    <>
      <div
        ref={panelRef}
        className={`resizable-panel ${className}`}
        style={{ height, minHeight, maxHeight }}
      >
        {children}
      </div>
      {showDivider && <PanelDivider onResize={handleResize} />}
    </>
  );
}
