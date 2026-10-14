import { useEventListener, useMemoizedFn } from 'ahooks';
import { App as AntdApp, Card, Col, Flex, Row, Typography } from 'antd';

import { A4Preview } from '@/components/A4Preview';
import { AppHeader } from '@/components/AppHeader';
import { ExportPanel } from '@/components/ExportPanel';
import { FaceCard } from '@/components/FaceCard';
import { LayoutPanel } from '@/components/LayoutPanel';
import { PrintTips } from '@/components/PrintTips';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { UploadPanel } from '@/components/UploadPanel';
import { WatermarkPanel } from '@/components/WatermarkPanel';
import { useFaceEditor } from '@/hooks/useFaceEditor';
import { useProject } from '@/hooks/useProject';
import { useIdCardStore } from '@/stores/useIdCardStore';
import { FACE_ORDER } from '@/types/idCard';
import type { FaceKind } from '@/types/idCard';
import { releaseImage } from '@/utils/image';

export default function HomePage() {
  const { message } = AntdApp.useApp();
  const model = useProject();
  const faces = useIdCardStore((state) => state.faces);
  const resetAll = useIdCardStore((state) => state.resetAll);

  const frontEditor = useFaceEditor('front');
  const backEditor = useFaceEditor('back');
  const editors: Record<FaceKind, ReturnType<typeof useFaceEditor>> = {
    front: frontEditor,
    back: backEditor,
  };

  const handleResetAll = useMemoizedFn(() => {
    FACE_ORDER.forEach((kind) => {
      const objectUrl = faces[kind].source?.objectUrl;
      if (objectUrl) {
        releaseImage(objectUrl);
      }
    });
    resetAll();
    message.success('已清空全部内容。');
  });

  // 支持直接粘贴截图：优先填入尚未上传的面位
  useEventListener(
    'paste',
    (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }
      const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile();
      if (!file) {
        return;
      }
      const targetKind: FaceKind | null = faces.front.source
        ? faces.back.source
          ? null
          : 'back'
        : 'front';
      if (!targetKind) {
        message.info('正反面都已有图片，请用卡片上的「重新上传」替换。');
        return;
      }
      event.preventDefault();
      void editors[targetKind].handleSelectFile(file);
    },
    { target: document },
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto max-w-[1440px] p-4 lg:p-6">
        <Flex vertical gap={16}>
          <AppHeader hasContent={model.hasContent} onResetAll={handleResetAll} />
          <PrivacyNotice />

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={11} xl={9}>
              <Flex vertical gap={16}>
                <Card title="第一步：上传身份证正反面">
                  <Flex vertical gap={12}>
                    {FACE_ORDER.map((kind) =>
                      faces[kind].source ? (
                        <FaceCard key={kind} kind={kind} />
                      ) : (
                        <UploadPanel key={kind} kind={kind} />
                      ),
                    )}
                    <Typography.Text type="secondary" className="text-xs">
                      截图后也可在页面任意位置按 Ctrl / ⌘ + V 粘贴，会自动填入空的面位。
                    </Typography.Text>
                  </Flex>
                </Card>

                <LayoutPanel />
                <WatermarkPanel />
                <ExportPanel model={model} />
              </Flex>
            </Col>

            <Col xs={24} lg={13} xl={15}>
              <Flex vertical gap={16} className="lg:sticky lg:top-6">
                <A4Preview model={model} />
                <PrintTips />
              </Flex>
            </Col>
          </Row>
        </Flex>
      </div>
    </div>
  );
}
