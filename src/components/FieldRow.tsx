import { Flex, Typography } from 'antd';
import type { ReactNode } from 'react';

interface FieldRowProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export const FieldRow = ({ label, hint, children }: FieldRowProps) => (
  <Flex vertical gap={6}>
    <Typography.Text type="secondary" className="text-xs">
      {label}
    </Typography.Text>
    {children}
    {hint ? (
      <Typography.Text type="secondary" className="text-xs">
        {hint}
      </Typography.Text>
    ) : null}
  </Flex>
);
