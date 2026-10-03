import type { ReactNode } from 'react';
import { Box } from './ink.js';

/** Main chat column beside the independent sidebar viewport. */
export function AppMainColumn({
  width,
  rows,
  children,
}: {
  width: number;
  rows: number;
  children: ReactNode;
}) {
  // A growing composer must clip history inside this column. If it grows
  // the shared row instead, the root's flex-end alignment clips the sidebar's
  // title and top border by the same number of rows.
  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      width={width}
      height={rows}
      overflowX="hidden"
      overflowY="hidden"
      justifyContent="flex-end"
    >
      {children}
    </Box>
  );
}
