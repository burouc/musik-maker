import { useCallback, useRef, useEffect, useState } from 'react';

interface PanelDividerProps {
  onResize: (delta: number) => void;
  direction?: 'horizontal' | 'vertical';
}

export default function PanelDivider({ onResize, direction = 'vertical' }: PanelDividerProps) {
  const [dragging, setDragging] = useState(false);
  const lastPos = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    lastPos.current = direction === 'vertical' ? e.clientY : e.clientX;
    setDragging(true);
  }, [direction]);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const current = direction === 'vertical' ? e.clientY : e.clientX;
      const delta = current - lastPos.current;
      if (delta !== 0) {
        onResize(delta);
        lastPos.current = current;
      }
    };

    const onMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'vertical' ? 'row-resize' : 'col-resize';

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [dragging, direction, onResize]);

  return (
    <div
      className={`panel-divider ${direction} ${dragging ? 'active' : ''}`}
      onMouseDown={onMouseDown}
    >
      <div className="panel-divider-handle" />
    </div>
  );
}
