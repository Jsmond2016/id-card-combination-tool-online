import { useMemoizedFn } from 'ahooks';
import { Alert, Card, Flex, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { A4, RULER_MAJOR_TICK_MM, RULER_TICK_MM } from '@/constants/idCard';
import type { ProjectModel } from '@/hooks/useProject';
import { useIdCardStore } from '@/stores/useIdCardStore';
import type { FaceKind, FaceOffset } from '@/types/idCard';
import { resolveSnap } from '@/utils/alignment';
import type { SnapGuide } from '@/utils/alignment';
import { clampFacePosition, findPlacedFace } from '@/utils/geometry';

/** 预览参考标尺的厚度（px，仅屏幕显示，不参与导出） */
const RULER_SIZE_PX = 18;
/** 吸附参考线的颜色 */
const GUIDE_COLOR = '#f5222d';

interface DragSession {
  kind: FaceKind;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  startOffset: FaceOffset;
}

/** 拖动过程中的临时反馈：命中的参考线 + 标尺上高亮的区间 */
interface DragFeedback {
  guides: SnapGuide[];
  spanX: [number, number];
  spanY: [number, number];
}

interface RulerTick {
  positionMm: number;
  major: boolean;
}

const buildTicks = (totalMm: number): RulerTick[] => {
  const ticks: RulerTick[] = [];
  for (let positionMm = 0; positionMm <= totalMm; positionMm += RULER_TICK_MM) {
    ticks.push({ positionMm, major: positionMm % RULER_MAJOR_TICK_MM === 0 });
  }
  return ticks;
};

const HORIZONTAL_TICKS = buildTicks(A4.widthMm);
const VERTICAL_TICKS = buildTicks(A4.heightMm);

const toPercent = (valueMm: number, totalMm: number): string => `${(valueMm / totalMm) * 100}%`;

interface A4PreviewProps {
  model: ProjectModel;
}

export const A4Preview = ({ model }: A4PreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const [feedback, setFeedback] = useState<DragFeedback | null>(null);
  const patchFace = useIdCardStore((state) => state.patchFace);
  const faces = useIdCardStore((state) => state.faces);
  const showRuler = useIdCardStore((state) => state.layout.showPreviewRuler);

  const { preset, plan, basePlan, activeKinds, previewPxPerMm, composeAt } = model;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rendered = composeAt(previewPxPerMm);
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(rendered, 0, 0);
  }, [composeAt, previewPxPerMm]);

  // 参考线画在独立的叠加画布上，避免污染导出用到的纸张画布
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) {
      return;
    }
    const widthPx = Math.round(A4.widthMm * previewPxPerMm);
    const heightPx = Math.round(A4.heightMm * previewPxPerMm);
    overlay.width = widthPx;
    overlay.height = heightPx;
    const context = overlay.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, widthPx, heightPx);
    if (!feedback) {
      return;
    }
    context.save();
    context.strokeStyle = GUIDE_COLOR;
    context.lineWidth = 1;
    context.setLineDash([5, 4]);
    feedback.guides.forEach((guide) => {
      context.beginPath();
      if (guide.axis === 'x') {
        const x = Math.round(guide.positionMm * previewPxPerMm) + 0.5;
        context.moveTo(x, 0);
        context.lineTo(x, heightPx);
      } else {
        const y = Math.round(guide.positionMm * previewPxPerMm) + 0.5;
        context.moveTo(0, y);
        context.lineTo(widthPx, y);
      }
      context.stroke();
    });
    context.restore();
  }, [feedback, previewPxPerMm]);

  const toMm = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    return {
      xMm: ((event.clientX - rect.left) / rect.width) * A4.widthMm,
      yMm: ((event.clientY - rect.top) / rect.height) * A4.heightMm,
    };
  };

  const findFaceAt = (xMm: number, yMm: number): FaceKind | null => {
    const hit = plan.placed.find(
      (placed) =>
        xMm >= placed.xMm &&
        xMm <= placed.xMm + preset.widthMm &&
        yMm >= placed.yMm &&
        yMm <= placed.yMm + preset.heightMm,
    );
    return hit ? hit.kind : null;
  };

  const handlePointerDown = useMemoizedFn((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = toMm(event);
    if (!point) {
      return;
    }
    const kind = findFaceAt(point.xMm, point.yMm);
    const base = kind ? findPlacedFace(basePlan, kind) : undefined;
    if (!kind || !base) {
      return;
    }
    dragRef.current = {
      kind,
      startX: point.xMm,
      startY: point.yMm,
      baseX: base.xMm,
      baseY: base.yMm,
      startOffset: faces[kind].offset,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  });

  const handlePointerMove = useMemoizedFn((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const session = dragRef.current;
    if (!session) {
      return;
    }
    const point = toMm(event);
    if (!point) {
      return;
    }
    const raw = clampFacePosition(
      session.baseX + session.startOffset.xMm + (point.xMm - session.startX),
      session.baseY + session.startOffset.yMm + (point.yMm - session.startY),
      preset,
    );
    // 吸附到页面中心 / 安全边距 / 另一面位的边缘与中心
    const snapped = resolveSnap({
      xMm: raw.xMm,
      yMm: raw.yMm,
      size: preset,
      others: plan.placed.filter((placed) => placed.kind !== session.kind),
      otherSize: preset,
    });
    const target = clampFacePosition(snapped.xMm, snapped.yMm, preset);
    // 若吸附结果恰好被安全区钳制掉，则不再显示该轴的参考线，避免"线到了、图没到"
    const guides = snapped.guides.filter((guide) =>
      guide.axis === 'x' ? target.xMm === snapped.xMm : target.yMm === snapped.yMm,
    );
    setFeedback({
      guides,
      spanX: [target.xMm, target.xMm + preset.widthMm],
      spanY: [target.yMm, target.yMm + preset.heightMm],
    });
    patchFace(session.kind, {
      offset: { xMm: target.xMm - session.baseX, yMm: target.yMm - session.baseY },
    });
  });

  const endDrag = useMemoizedFn(() => {
    dragRef.current = null;
    setFeedback(null);
  });

  return (
    <Card
      title="A4 预览（所见即打印结果）"
      extra={
        <Typography.Text type="secondary" className="text-xs">
          {preset.label} · 已放置 {activeKinds.length} 个面位
        </Typography.Text>
      }
    >
      <Flex vertical gap={12} align="center">
        {plan.overflow ? (
          <Alert
            type="warning"
            showIcon
            className="w-full"
            message="当前版式超出 A4 安全区"
            description="请减小规格、份数、正反面间距，或调整位置微调。"
          />
        ) : null}

        <div className="w-full max-w-[440px]">
          {showRuler ? (
            <div className="flex">
              <div className="shrink-0" style={{ height: RULER_SIZE_PX, width: RULER_SIZE_PX }} />
              <div className="relative flex-1 bg-gray-50" style={{ height: RULER_SIZE_PX }}>
                {HORIZONTAL_TICKS.map((tick) => (
                  <span
                    key={tick.positionMm}
                    className={`absolute bottom-0 w-px bg-gray-400 ${tick.major ? 'h-2' : 'h-1'}`}
                    style={{ left: toPercent(tick.positionMm, A4.widthMm) }}
                  />
                ))}
                {HORIZONTAL_TICKS.filter((tick) => tick.major).map((tick) => (
                  <span
                    key={`label-${tick.positionMm}`}
                    className="absolute top-px -translate-x-1/2 text-[9px] leading-none text-gray-500"
                    style={{ left: toPercent(tick.positionMm, A4.widthMm) }}
                  >
                    {tick.positionMm}
                  </span>
                ))}
                {feedback ? (
                  <span
                    className="absolute inset-y-0 bg-blue-500/25"
                    style={{
                      left: toPercent(feedback.spanX[0], A4.widthMm),
                      width: toPercent(feedback.spanX[1] - feedback.spanX[0], A4.widthMm),
                    }}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex">
            {showRuler ? (
              <div
                className="relative shrink-0 self-stretch bg-gray-50"
                style={{ width: RULER_SIZE_PX }}
              >
                {VERTICAL_TICKS.map((tick) => (
                  <span
                    key={tick.positionMm}
                    className={`absolute right-0 h-px bg-gray-400 ${tick.major ? 'w-2' : 'w-1'}`}
                    style={{ top: toPercent(tick.positionMm, A4.heightMm) }}
                  />
                ))}
                {VERTICAL_TICKS.filter((tick) => tick.major).map((tick) => (
                  <span
                    key={`label-${tick.positionMm}`}
                    className="absolute left-px -translate-y-1/2 text-[9px] leading-none text-gray-500"
                    style={{ top: toPercent(tick.positionMm, A4.heightMm) }}
                  >
                    {tick.positionMm}
                  </span>
                ))}
                {feedback ? (
                  <span
                    className="absolute inset-x-0 bg-blue-500/25"
                    style={{
                      top: toPercent(feedback.spanY[0], A4.heightMm),
                      height: toPercent(feedback.spanY[1] - feedback.spanY[0], A4.heightMm),
                    }}
                  />
                ) : null}
              </div>
            ) : null}

            <div className="relative min-w-0 flex-1">
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="block w-full cursor-grab touch-none rounded border border-solid border-gray-300 bg-white shadow-sm active:cursor-grabbing"
              />
              <canvas
                ref={overlayRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            </div>
          </div>
        </div>

        <Typography.Text type="secondary" className="text-center text-xs">
          {activeKinds.length === 0
            ? '上传图片后，这里会实时显示 A4 排版效果。'
            : '可直接拖动纸上的身份证调整位置；靠近页面中心、安全边距或另一面位的边缘时会自动吸附对齐，尺寸不会被拖动改变。'}
        </Typography.Text>
      </Flex>
    </Card>
  );
};
