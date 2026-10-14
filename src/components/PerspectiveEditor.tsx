import { useSize } from 'ahooks';
import { Typography } from 'antd';
import { useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { getSpecPreset } from '@/constants/idCard';
import { useIdCardStore } from '@/stores/useIdCardStore';
import type { CropPoint, FaceKind, Quad, SourceImage } from '@/types/idCard';
import { applyEdgeOffset, constrainQuadCorner, resolveFaceQuad } from '@/utils/rectify';

/** 角点顺序与 Quad 一致：左上 / 右上 / 右下 / 左下 */
const CORNER_LABELS = ['左上', '右上', '右下', '左下'] as const;

const toPointsAttribute = (points: readonly CropPoint[]): string =>
  points.map((point) => `${point.x},${point.y}`).join(' ');

const averagePoint = (points: readonly CropPoint[]): CropPoint =>
  points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x / points.length,
      y: accumulator.y + point.y / points.length,
    }),
    { x: 0, y: 0 },
  );

interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface DisplayModel {
  view: ViewTransform;
  /** 用户标定的四角（显示坐标） */
  quad: CropPoint[];
  /** 施加边缘微调后实际参与采样的四角（显示坐标） */
  effective: CropPoint[];
  centroid: CropPoint;
  maskPath: string;
}

/** 图片以 contain 铺满容器，这里算好「源图像素坐标 → 显示坐标」的换算与遮罩路径 */
function buildDisplayModel(
  source: SourceImage,
  size: { width: number; height: number },
  quad: Quad,
  edgeOffsetPercent: number,
): DisplayModel {
  const scale = Math.min(size.width / source.width, size.height / source.height);
  const view: ViewTransform = {
    scale,
    offsetX: (size.width - source.width * scale) / 2,
    offsetY: (size.height - source.height * scale) / 2,
  };
  const toDisplay = (point: CropPoint): CropPoint => ({
    x: view.offsetX + point.x * scale,
    y: view.offsetY + point.y * scale,
  });
  const displayQuad = quad.map(toDisplay);
  const outline = displayQuad.map((point) => `${point.x} ${point.y}`).join(' L');
  return {
    view,
    quad: displayQuad,
    effective: applyEdgeOffset(quad, edgeOffsetPercent).map(toDisplay),
    centroid: averagePoint(displayQuad),
    maskPath: `M0 0 H${size.width} V${size.height} H0 Z M${outline} Z`,
  };
}

interface QuadHandleProps {
  point: CropPoint;
  label: string;
  inward: CropPoint;
  onPointerDown: (event: ReactPointerEvent<SVGGElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGGElement>) => void;
}

/** 单个可拖拽角点：22px 透明命中区保证移动端也能稳定按住 */
const QuadHandle = ({
  point,
  label,
  inward,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: QuadHandleProps) => {
  const length = Math.hypot(inward.x, inward.y) || 1;
  return (
    <g
      transform={`translate(${point.x} ${point.y})`}
      className="cursor-grab"
      style={{ pointerEvents: 'all' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <circle r={22} fill="transparent" />
      <circle r={8} fill="#1668dc" stroke="#ffffff" strokeWidth={2} />
      <text
        x={(inward.x / length) * 22}
        y={(inward.y / length) * 22}
        fontSize={11}
        fontWeight={600}
        fill="#e2e8f0"
        stroke="rgba(15,23,42,0.92)"
        strokeWidth={3.5}
        strokeLinejoin="round"
        paintOrder="stroke"
        textAnchor="middle"
        dominantBaseline="middle"
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  );
};

interface PerspectiveEditorProps {
  kind: FaceKind;
}

/**
 * 四点定位视图（R22）：把四个角点拖到身份证的四个角上。
 *
 * 覆盖层（暗化遮罩、连线、手柄）是纯预览元素，只用于定位，不参与导出；
 * 导出链路只消费四个角点的像素坐标。角点按象限约束移动，因此四边形永远凸且不自交。
 */
export const PerspectiveEditor = ({ kind }: PerspectiveEditorProps) => {
  const face = useIdCardStore((state) => state.faces[kind]);
  const preset = useIdCardStore((state) => getSpecPreset(state.layout.specId));
  const patchFace = useIdCardStore((state) => state.patchFace);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<number | null>(null);
  const size = useSize(containerRef);
  const source = face.source;
  const aspect = preset.widthMm / preset.heightMm;
  const edgeOffsetPercent = face.rectify.edgeOffsetPercent;

  const quad = useMemo(
    () => (source ? resolveFaceQuad(face.rectify.quad, source.width, source.height, aspect) : null),
    [source, face.rectify.quad, aspect],
  );

  const model = useMemo(() => {
    if (!source || !quad || !size?.width || !size?.height) {
      return null;
    }
    return buildDisplayModel(source, size, quad, edgeOffsetPercent);
  }, [source, quad, size, edgeOffsetPercent]);

  const moveCorner = (index: number, clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container || !model || !quad || !source) {
      return;
    }
    const bounds = container.getBoundingClientRect();
    const point = {
      x: (clientX - bounds.left - model.view.offsetX) / model.view.scale,
      y: (clientY - bounds.top - model.view.offsetY) / model.view.scale,
    };
    patchFace(kind, {
      rectify: {
        ...face.rectify,
        quad: constrainQuadCorner(quad, index, point, source.width, source.height),
      },
    });
  };

  const handlePointerDown = (index: number) => (event: ReactPointerEvent<SVGGElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = index;
    moveCorner(index, event.clientX, event.clientY);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGGElement>) => {
    const index = draggingRef.current;
    if (index === null) {
      return;
    }
    moveCorner(index, event.clientX, event.clientY);
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGGElement>) => {
    if (draggingRef.current === null) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingRef.current = null;
  };

  if (!source || !model) {
    return (
      <div
        ref={containerRef}
        className="relative h-[340px] w-full overflow-hidden rounded bg-gray-800"
      />
    );
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="relative h-[340px] w-full overflow-hidden rounded bg-gray-800"
      >
        <img
          src={source.objectUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full touch-none select-none object-contain"
        />
        <svg className="absolute inset-0 h-full w-full touch-none select-none">
          <path
            d={model.maskPath}
            fill="rgba(15,23,42,0.55)"
            fillRule="evenodd"
            pointerEvents="none"
          />
          <polygon
            points={toPointsAttribute(model.effective)}
            fill="none"
            stroke="#60a5fa"
            strokeDasharray="6 4"
            strokeWidth={1.5}
            pointerEvents="none"
          />
          <polygon
            points={toPointsAttribute(model.quad)}
            fill="none"
            stroke="#f8fafc"
            strokeWidth={2}
            pointerEvents="none"
          />
          {model.quad.map((point, index) => (
            <QuadHandle
              key={CORNER_LABELS[index]}
              point={point}
              label={CORNER_LABELS[index]}
              inward={{ x: model.centroid.x - point.x, y: model.centroid.y - point.y }}
              onPointerDown={handlePointerDown(index)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          ))}
        </svg>
      </div>
      <Typography.Text type="secondary" className="mt-2 block text-xs">
        把四个角点拖到身份证的四个角上。四边形之外的内容会被丢弃并填成白纸，所以不必刻意避开背景。
      </Typography.Text>
    </div>
  );
};
