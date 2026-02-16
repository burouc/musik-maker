import React, { useState, useCallback, useRef } from 'react';
import type { AutomationLane, AutomationTarget } from '../types';

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
        {!collapsed && availableTargets.length > 0 && (
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
  onToggle,
  onRemove,
  onClear,
  onSetPoint,
  onRemovePoint,
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);

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
  }, [lane, totalWidth, arrangementLength, measureStepToX, currentMeasure, currentStep, isPlaying, playbackMode]);

  // Redraw on changes
  React.useEffect(() => {
    drawCurve();
  }, [drawCurve]);

  // Mouse handlers for drawing automation
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (e.button === 2) {
      // Right-click: remove nearest point
      e.preventDefault();
      const { measure, step } = xToMeasureStep(x);
      // Find closest point within a threshold
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

    // Left-click: add/update point
    setDrawing(true);
    const { measure, step } = xToMeasureStep(x);
    const value = 1 - y / LANE_HEIGHT;
    onSetPoint(measure, step, value);
  }, [xToMeasureStep, measureStepToX, lane.points, onSetPoint, onRemovePoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = Math.max(0, Math.min(LANE_HEIGHT, e.clientY - rect.top));
    const { measure, step } = xToMeasureStep(x);
    const value = 1 - y / LANE_HEIGHT;
    onSetPoint(measure, step, value);
  }, [drawing, xToMeasureStep, onSetPoint]);

  const handleMouseUp = useCallback(() => {
    setDrawing(false);
  }, []);

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
          style={{ width: totalWidth, height: LANE_HEIGHT }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
});

export default AutomationLanes;
