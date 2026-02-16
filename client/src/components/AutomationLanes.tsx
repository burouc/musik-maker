import React, { useState, useCallback, useRef } from 'react';
import type { AutomationLane, AutomationTarget } from '../types';

/** Drawing tool mode for automation lanes */
type DrawMode = 'point' | 'freehand' | 'line' | 'erase';

interface AutomationLanesProps {
  lanes: AutomationLane[];
  arrangementLength: number;
  currentMeasure: number;
  currentStep: number;
  isPlaying: boolean;
  playbackMode: 'pattern' | 'song';
  onAddLane: (target: AutomationTarget) => void;
  onRemoveLane: (laneId: string) => void;
  onToggleLane: (laneId: string) => void;
  onSetPoint: (laneId: string, measure: number, step: number, value: number) => void;
  onRemovePoint: (laneId: string, measure: number, step: number) => void;
  onClearLane: (laneId: string) => void;
}

const AVAILABLE_TARGETS: { value: AutomationTarget; label: string }[] = [
  { value: 'masterVolume', label: 'Master Volume' },
  { value: 'masterFilterCutoff', label: 'Filter Cutoff' },
  { value: 'masterFilterResonance', label: 'Filter Resonance' },
  { value: 'masterReverbDecay', label: 'Reverb Decay' },
  { value: 'masterReverbDamping', label: 'Reverb Damping' },
  { value: 'masterDelayFeedback', label: 'Delay Feedback' },
  { value: 'masterDelayMix', label: 'Delay Mix' },
];

/** Cell width must match arrangement grid (48px cell + 2px gap) */
const CELL_WIDTH = 48;
const CELL_GAP = 2;
const BAR_GROUP_MARGIN = 4;
const LANE_HEIGHT = 80;
const STEPS_PER_MEASURE = 16;

const DRAW_MODE_LABELS: Record<DrawMode, string> = {
  point: 'Pt',
  freehand: 'Draw',
  line: 'Line',
  erase: 'Erase',
};

const DRAW_MODE_TITLES: Record<DrawMode, string> = {
  point: 'Point mode: click to add/move points',
  freehand: 'Freehand mode: click and drag to draw curves',
  line: 'Line mode: click start point, then click end point to draw a line',
  erase: 'Erase mode: click or drag to remove points',
};

const AutomationLanes = React.memo<AutomationLanesProps>(function AutomationLanes({
  lanes,
  arrangementLength,
  currentMeasure,
  currentStep,
  isPlaying,
  playbackMode,
  onAddLane,
  onRemoveLane,
  onToggleLane,
  onSetPoint,
  onRemovePoint,
  onClearLane,
}) {
  const [selectedTarget, setSelectedTarget] = useState<AutomationTarget>('masterVolume');
  const [collapsed, setCollapsed] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>('point');

  const usedTargets = new Set(lanes.map((l) => l.target));
  const availableTargets = AVAILABLE_TARGETS.filter((t) => !usedTargets.has(t.value));

  const handleAddLane = useCallback(() => {
    if (availableTargets.length > 0) {
      const target = availableTargets.find((t) => t.value === selectedTarget)
        ? selectedTarget
        : availableTargets[0].value;
      onAddLane(target);
    }
  }, [selectedTarget, availableTargets, onAddLane]);

  const measures = Array.from({ length: arrangementLength }, (_, i) => i);

  return (
    <div className="automation-lanes">
      <div className="automation-header">
        <div className="automation-title" onClick={() => setCollapsed(!collapsed)}>
          Automation {collapsed ? '+' : '-'}
        </div>
        {!collapsed && (
          <div className="automation-header-controls">
            <div className="automation-draw-mode-group">
              {(Object.keys(DRAW_MODE_LABELS) as DrawMode[]).map((mode) => (
                <button
                  key={mode}
                  className={`automation-draw-mode-btn${drawMode === mode ? ' active' : ''}`}
                  onClick={() => setDrawMode(mode)}
                  title={DRAW_MODE_TITLES[mode]}
                >
                  {DRAW_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
            {availableTargets.length > 0 && (
              <div className="automation-add-controls">
                <select
                  className="automation-target-select"
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value as AutomationTarget)}
                >
                  {availableTargets.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <button className="automation-add-btn" onClick={handleAddLane}>
                  + Lane
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!collapsed && lanes.map((lane) => (
        <AutomationLaneRow
          key={lane.id}
          lane={lane}
          measures={measures}
          arrangementLength={arrangementLength}
          currentMeasure={currentMeasure}
          currentStep={currentStep}
          isPlaying={isPlaying}
          playbackMode={playbackMode}
          drawMode={drawMode}
          onToggle={() => onToggleLane(lane.id)}
          onRemove={() => onRemoveLane(lane.id)}
          onClear={() => onClearLane(lane.id)}
          onSetPoint={(m, s, v) => onSetPoint(lane.id, m, s, v)}
          onRemovePoint={(m, s) => onRemovePoint(lane.id, m, s)}
        />
      ))}
    </div>
  );
});

interface AutomationLaneRowProps {
  lane: AutomationLane;
  measures: number[];
  arrangementLength: number;
  currentMeasure: number;
  currentStep: number;
  isPlaying: boolean;
  playbackMode: string;
  drawMode: DrawMode;
  onToggle: () => void;
  onRemove: () => void;
  onClear: () => void;
  onSetPoint: (measure: number, step: number, value: number) => void;
  onRemovePoint: (measure: number, step: number) => void;
}

const AutomationLaneRow = React.memo<AutomationLaneRowProps>(function AutomationLaneRow({
  lane,
  measures,
  arrangementLength,
  currentMeasure,
  currentStep,
  isPlaying,
  playbackMode,
  drawMode,
  onToggle,
  onRemove,
  onClear,
  onSetPoint,
  onRemovePoint,
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const lastDrawPos = useRef<{ x: number; y: number } | null>(null);
  // Line mode: the anchor point for the pending line
  const lineAnchor = useRef<{ measure: number; step: number; value: number } | null>(null);
  const [linePreview, setLinePreview] = useState<{ x: number; y: number } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Calculate total canvas width to match arrangement grid
  const totalWidth = measures.reduce((acc, m) => {
    let w = CELL_WIDTH;
    if (m > 0) w += CELL_GAP;
    if (m % 4 === 0 && m > 0) w += BAR_GROUP_MARGIN;
    return acc + w;
  }, 0);

  // Convert pixel X to (measure, step) within the canvas
  const xToMeasureStep = useCallback((x: number): { measure: number; step: number } => {
    let accX = 0;
    for (let m = 0; m < arrangementLength; m++) {
      let cellStart = accX;
      if (m > 0) cellStart += CELL_GAP;
      if (m % 4 === 0 && m > 0) cellStart += BAR_GROUP_MARGIN;
      const cellEnd = cellStart + CELL_WIDTH;
      if (x >= cellStart && x < cellEnd) {
        const fraction = (x - cellStart) / CELL_WIDTH;
        const step = Math.round(fraction * (STEPS_PER_MEASURE - 1));
        return { measure: m, step };
      }
      accX = cellEnd;
    }
    return { measure: arrangementLength - 1, step: STEPS_PER_MEASURE - 1 };
  }, [arrangementLength]);

  // Convert (measure, step) to pixel X
  const measureStepToX = useCallback((measure: number, step: number): number => {
    let accX = 0;
    for (let m = 0; m < measure; m++) {
      accX += CELL_WIDTH;
      if (m < arrangementLength - 1) accX += CELL_GAP;
      if ((m + 1) % 4 === 0 && m + 1 < arrangementLength) accX += BAR_GROUP_MARGIN;
    }
    // Add bar-start margin for this measure
    if (measure % 4 === 0 && measure > 0) accX += BAR_GROUP_MARGIN;
    if (measure > 0) accX += CELL_GAP;
    // Step offset within the cell
    accX += (step / (STEPS_PER_MEASURE - 1 || 1)) * CELL_WIDTH;
    return accX;
  }, [arrangementLength]);

  // Convert (measure, step) to a linear index for interpolation
  const toLinear = (measure: number, step: number): number =>
    measure * STEPS_PER_MEASURE + step;

  // Convert linear index back to (measure, step)
  const fromLinear = (idx: number): { measure: number; step: number } => ({
    measure: Math.floor(idx / STEPS_PER_MEASURE),
    step: idx % STEPS_PER_MEASURE,
  });

  // Interpolate freehand points between two positions, filling every step
  const interpolateAndSet = useCallback(
    (x1: number, y1: number, x2: number, y2: number) => {
      const ms1 = xToMeasureStep(x1);
      const ms2 = xToMeasureStep(x2);
      const v1 = 1 - y1 / LANE_HEIGHT;
      const v2 = 1 - y2 / LANE_HEIGHT;
      const lin1 = toLinear(ms1.measure, ms1.step);
      const lin2 = toLinear(ms2.measure, ms2.step);

      if (lin1 === lin2) {
        onSetPoint(ms2.measure, ms2.step, v2);
        return;
      }

      const start = Math.min(lin1, lin2);
      const end = Math.max(lin1, lin2);
      for (let i = start; i <= end; i++) {
        const t = (i - lin1) / (lin2 - lin1);
        const value = v1 + t * (v2 - v1);
        const { measure, step } = fromLinear(i);
        if (measure < arrangementLength) {
          onSetPoint(measure, step, value);
        }
      }
    },
    [xToMeasureStep, onSetPoint, arrangementLength],
  );

  // Erase points near a pixel position
  const eraseNear = useCallback(
    (x: number, y: number) => {
      for (const pt of lane.points) {
        const px = measureStepToX(pt.measure, pt.step);
        const py = (1 - pt.value) * LANE_HEIGHT;
        const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
        if (dist < 14) {
          onRemovePoint(pt.measure, pt.step);
        }
      }
    },
    [lane.points, measureStepToX, onRemovePoint],
  );

  // Draw the automation curve
  const drawCurve = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalWidth * dpr;
    canvas.height = LANE_HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, totalWidth, LANE_HEIGHT);

    // Draw background grid lines per measure
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    let accX = 0;
    for (let m = 0; m < arrangementLength; m++) {
      if (m > 0) accX += CELL_GAP;
      if (m % 4 === 0 && m > 0) accX += BAR_GROUP_MARGIN;
      if (m % 4 === 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      }
      ctx.beginPath();
      ctx.moveTo(accX + 0.5, 0);
      ctx.lineTo(accX + 0.5, LANE_HEIGHT);
      ctx.stroke();
      accX += CELL_WIDTH;
    }

    // Draw current playback position
    if (isPlaying && playbackMode === 'song' && currentMeasure >= 0) {
      const px = measureStepToX(currentMeasure, currentStep);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 0.5, 0);
      ctx.lineTo(px + 0.5, LANE_HEIGHT);
      ctx.stroke();
    }

    // Draw hover crosshair
    if (hoverPos && !drawing) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hoverPos.x, 0);
      ctx.lineTo(hoverPos.x, LANE_HEIGHT);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, hoverPos.y);
      ctx.lineTo(totalWidth, hoverPos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw value label
      const hoverValue = Math.round((1 - hoverPos.y / LANE_HEIGHT) * 100);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '10px monospace';
      const labelX = hoverPos.x + 6;
      const labelY = hoverPos.y > 14 ? hoverPos.y - 4 : hoverPos.y + 14;
      ctx.fillText(`${hoverValue}%`, labelX, labelY);
    }

    // Draw line-mode preview
    if (drawMode === 'line' && lineAnchor.current && linePreview) {
      const anchorX = measureStepToX(lineAnchor.current.measure, lineAnchor.current.step);
      const anchorY = (1 - lineAnchor.current.value) * LANE_HEIGHT;
      ctx.strokeStyle = 'rgba(78,205,196,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY);
      ctx.lineTo(linePreview.x, linePreview.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (lane.points.length === 0) return;

    // Draw the automation line
    const color = lane.enabled ? '#4ecdc4' : 'rgba(78,205,196,0.3)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    // Extend to start
    const firstPt = lane.points[0];
    const startX = 0;
    const startY = (1 - firstPt.value) * LANE_HEIGHT;
    ctx.moveTo(startX, startY);

    for (const pt of lane.points) {
      const px = measureStepToX(pt.measure, pt.step);
      const py = (1 - pt.value) * LANE_HEIGHT;
      ctx.lineTo(px, py);
    }

    // Extend to end
    const lastPt = lane.points[lane.points.length - 1];
    const endY = (1 - lastPt.value) * LANE_HEIGHT;
    ctx.lineTo(totalWidth, endY);
    ctx.stroke();

    // Fill area under curve
    ctx.lineTo(totalWidth, LANE_HEIGHT);
    ctx.lineTo(0, LANE_HEIGHT);
    ctx.closePath();
    ctx.fillStyle = lane.enabled
      ? 'rgba(78,205,196,0.08)'
      : 'rgba(78,205,196,0.03)';
    ctx.fill();

    // Draw point handles
    for (const pt of lane.points) {
      const px = measureStepToX(pt.measure, pt.step);
      const py = (1 - pt.value) * LANE_HEIGHT;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = lane.enabled ? '#4ecdc4' : 'rgba(78,205,196,0.5)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw line-mode anchor point highlight
    if (drawMode === 'line' && lineAnchor.current) {
      const ax = measureStepToX(lineAnchor.current.measure, lineAnchor.current.step);
      const ay = (1 - lineAnchor.current.value) * LANE_HEIGHT;
      ctx.beginPath();
      ctx.arc(ax, ay, 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [lane, totalWidth, arrangementLength, measureStepToX, currentMeasure, currentStep, isPlaying, playbackMode, hoverPos, drawing, drawMode, linePreview]);

  // Redraw on changes
  React.useEffect(() => {
    drawCurve();
  }, [drawCurve]);

  // Get canvas-local coordinates from mouse event
  const getCanvasPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: Math.max(0, Math.min(LANE_HEIGHT, e.clientY - rect.top)),
    };
  }, []);

  // Mouse handlers for drawing automation
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPos(e);

    // Right-click always removes nearest point regardless of mode
    if (e.button === 2) {
      e.preventDefault();
      let closest: { m: number; s: number; dist: number } | null = null;
      for (const pt of lane.points) {
        const px = measureStepToX(pt.measure, pt.step);
        const py = (1 - pt.value) * LANE_HEIGHT;
        const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
        if (dist < 12 && (!closest || dist < closest.dist)) {
          closest = { m: pt.measure, s: pt.step, dist };
        }
      }
      if (closest) {
        onRemovePoint(closest.m, closest.s);
      }
      return;
    }

    if (drawMode === 'point') {
      setDrawing(true);
      const { measure, step } = xToMeasureStep(x);
      const value = 1 - y / LANE_HEIGHT;
      onSetPoint(measure, step, value);
    } else if (drawMode === 'freehand') {
      setDrawing(true);
      lastDrawPos.current = { x, y };
      const { measure, step } = xToMeasureStep(x);
      const value = 1 - y / LANE_HEIGHT;
      onSetPoint(measure, step, value);
    } else if (drawMode === 'line') {
      const { measure, step } = xToMeasureStep(x);
      const value = 1 - y / LANE_HEIGHT;

      if (!lineAnchor.current) {
        // First click: set anchor
        lineAnchor.current = { measure, step, value };
        onSetPoint(measure, step, value);
      } else {
        // Second click: draw line from anchor to here
        const anchor = lineAnchor.current;
        const anchorX = measureStepToX(anchor.measure, anchor.step);
        const anchorY = (1 - anchor.value) * LANE_HEIGHT;
        interpolateAndSet(anchorX, anchorY, x, y);
        lineAnchor.current = null;
        setLinePreview(null);
      }
    } else if (drawMode === 'erase') {
      setDrawing(true);
      eraseNear(x, y);
    }
  }, [drawMode, getCanvasPos, xToMeasureStep, measureStepToX, lane.points, onSetPoint, onRemovePoint, interpolateAndSet, eraseNear]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPos(e);

    // Update hover position for crosshair
    setHoverPos({ x, y });

    // Line mode preview
    if (drawMode === 'line' && lineAnchor.current) {
      setLinePreview({ x, y });
    }

    if (!drawing) return;

    if (drawMode === 'point') {
      const { measure, step } = xToMeasureStep(x);
      const value = 1 - y / LANE_HEIGHT;
      onSetPoint(measure, step, value);
    } else if (drawMode === 'freehand') {
      const prev = lastDrawPos.current;
      if (prev) {
        interpolateAndSet(prev.x, prev.y, x, y);
      } else {
        const { measure, step } = xToMeasureStep(x);
        const value = 1 - y / LANE_HEIGHT;
        onSetPoint(measure, step, value);
      }
      lastDrawPos.current = { x, y };
    } else if (drawMode === 'erase') {
      eraseNear(x, y);
    }
  }, [drawing, drawMode, getCanvasPos, xToMeasureStep, onSetPoint, interpolateAndSet, eraseNear]);

  const handleMouseUp = useCallback(() => {
    setDrawing(false);
    lastDrawPos.current = null;
  }, []);

  const handleMouseLeave = useCallback(() => {
    setDrawing(false);
    lastDrawPos.current = null;
    setHoverPos(null);
    setLinePreview(null);
  }, []);

  // Cursor style based on draw mode
  const cursorStyle: React.CSSProperties = {
    width: totalWidth,
    height: LANE_HEIGHT,
    cursor:
      drawMode === 'erase' ? 'not-allowed' :
      drawMode === 'freehand' ? 'crosshair' :
      drawMode === 'line' && lineAnchor.current ? 'crosshair' :
      'default',
  };

  return (
    <div className={`automation-lane-row${lane.enabled ? '' : ' disabled'}`}>
      <div className="automation-lane-label">
        <button
          className={`automation-enable-btn${lane.enabled ? ' active' : ''}`}
          onClick={onToggle}
          title={lane.enabled ? 'Disable' : 'Enable'}
        >
          {lane.enabled ? 'ON' : 'OFF'}
        </button>
        <span className="automation-lane-name">{lane.name}</span>
        <div className="automation-lane-actions">
          <button
            className="automation-clear-btn"
            onClick={onClear}
            title="Clear all points"
          >
            CLR
          </button>
          <button
            className="automation-remove-btn"
            onClick={onRemove}
            title="Remove lane"
          >
            x
          </button>
        </div>
      </div>
      <div className="automation-lane-canvas-wrapper" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="automation-lane-canvas"
          style={cursorStyle}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
});

export default AutomationLanes;
