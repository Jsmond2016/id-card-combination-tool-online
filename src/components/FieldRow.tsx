import { Flex, Typography } from 'antd';
import type { ReactNode } from 'react';

interface FieldRowProps {
  label: string;
  hint?: string;
  /**
   * 标签与控件同排（标签在左、控件在右）。
   * 用于开关这类窄控件：否则长标签会独占一整行，开关孤零零地挂在下一行。
   */
  inline?: boolean;
  children: ReactNode;
}

export const FieldRow = ({ label, hint, inline = false, children }: FieldRowProps) => (
  <Flex vertical gap={6}>
    {inline ? (
      <Flex align="center" justify="space-between" gap={12}>
        <Typography.Text type="secondary" className="text-xs">
          {label}
        </Typography.Text>
        <span className="shrink-0">{children}</span>
      </Flex>
    ) : (
      <>
        <Typography.Text type="secondary" className="text-xs">
          {label}
        </Typography.Text>
        {children}
      </>
    )}
    {hint ? (
      <Typography.Text type="secondary" className="text-xs">
        {hint}
      </Typography.Text>
    ) : null}
  </Flex>
);
