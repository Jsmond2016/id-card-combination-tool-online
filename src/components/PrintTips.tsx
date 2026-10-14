import { Alert, Card, Collapse, Flex } from 'antd';

const FAQ_ITEMS = [
  {
    key: 'scale',
    label: '打印出来尺寸不对（偏大或偏小）怎么办？',
    children:
      '打印对话框里的缩放选项必须选择「实际大小 / 100%」或「无缩放」，不要使用「适合页面 / 适合纸张」。若中间被缩放，身份证会比真卡小一圈。可在「排版设置」中打开打印校准尺，打印后量一下标尺是否为 50mm 来确认。',
  },
  {
    key: 'size',
    label: '88 × 56 mm 和 85.6 × 54 mm 应该选哪个？',
    children:
      '88 × 56 mm 是政务、银行等窗口沿用的身份证复印件规格，绝大多数场景选它即可；85.6 × 54 mm 与实体身份证完全等大，适合需要与原件逐项比对的场合。两者都不会超过标准复印件尺寸。',
  },
  {
    key: 'blur',
    label: '提示「分辨率偏低」是什么原因？',
    children:
      '手机照片被裁剪放大的倍数越大，单位面积可用的像素越少，打印出来就越模糊。出现该提示时，建议重新在光线均匀处平拍（让身份证占满画面），或把导出精度调为 150 DPI 以匹配实际像素。',
  },
  {
    key: 'privacy',
    label: '我的身份证照片会被保存吗？',
    children:
      '不会。裁剪、排版、合成、导出全部在你的浏览器内完成，页面不会向任何服务器发送图片；刷新或关闭页面后内容即被清空，也不会写入本地存储。',
  },
  {
    key: 'heic',
    label: '上传 iPhone 的 HEIC 照片失败怎么办？',
    children:
      '部分浏览器无法解码 HEIC/HEIF。请在手机相册中把照片导出或共享为 JPG（或对截图后再上传），即可正常使用。',
  },
];

export const PrintTips = () => (
  <Card title="打印须知">
    <Flex vertical gap={12}>
      <Alert
        type="warning"
        showIcon
        message="打印时请选择「实际大小 / 100%」"
        description="若使用「适合页面」，浏览器会把整页再次缩放，身份证尺寸会偏小。"
      />
      <Collapse ghost items={FAQ_ITEMS} />
    </Flex>
  </Card>
);
