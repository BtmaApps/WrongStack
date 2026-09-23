import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { markdownComponents } from '../../src/components/MessageBubble/utils';

import { i18n } from '../../src/i18n';

describe('markdownComponents table renderer', () => {
  // Pin the language before rendering: the component renders t()-derived
  // labels, and an unpinned translator can race initialization into raw keys.
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  it('wraps table inside an overflow-x-auto container', () => {
    const TableComp = markdownComponents.table;
    const TheadComp = markdownComponents.thead;
    const TbodyComp = markdownComponents.tbody;
    const TrComp = markdownComponents.tr;
    const ThComp = markdownComponents.th;
    const TdComp = markdownComponents.td;

    const { container } = render(
      <TableComp>
        <TheadComp>
          <TrComp>
            <ThComp>Header 1</ThComp>
            <ThComp>Header 2</ThComp>
          </TrComp>
        </TheadComp>
        <TbodyComp>
          <TrComp>
            <TdComp>Data 1</TdComp>
            <TdComp>Data 2</TdComp>
          </TrComp>
        </TbodyComp>
      </TableComp>,
    );

    const wrapper = container.querySelector('.overflow-x-auto');
    expect(wrapper).toBeTruthy();
    expect(screen.getByText('Header 1')).toBeDefined();
    expect(screen.getByText('Data 1')).toBeDefined();
  });
});
