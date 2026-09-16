import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { BreadcrumbContextMenu } from '../../src/components/FileExplorer/FileExplorerModals';

afterEach(cleanup);

function Fixture() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <div role="dialog" aria-hidden="true" inert>
        Parked memory panel
      </div>
      <div id="ws-file-tree" role="tree" tabIndex={0}>
        Files
      </div>
      {open && (
        <BreadcrumbContextMenu
          contextMenu={{
            x: 0,
            y: 0,
            crumb: { absPath: '/project/src', relPath: 'src' },
          }}
          onClose={() => setOpen(false)}
          copyToClipboard={() => {}}
          handleStartCreate={() => {}}
          handleShellOpen={() => {}}
        />
      )}
    </>
  );
}

it('returns focus to the file tree when a parked dialog exists', async () => {
  render(<Fixture />);
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tree')));
});
