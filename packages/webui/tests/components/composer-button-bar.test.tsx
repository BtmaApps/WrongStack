import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposerButtonBar } from '../../src/components/ChatInput/composer-button-bar';
import { useLocalPrefs } from '../../src/stores/local-prefs';

vi.mock('../../src/i18n', () => ({
  useAppTranslation: () => ({
    t: (k: string, opts?: any) => {
      if (typeof opts === 'string') return opts;
      if (opts && typeof opts === 'object' && 'defaultValue' in opts) return opts.defaultValue;
      return k;
    },
  }),
}));

describe('ComposerButtonBar component', () => {
  const mockToggleSpeech = vi.fn();
  const defaultProps = {
    imagePickerRef: { current: null },
    disabled: false,
    topicCheckBusy: false,
    clientConnected: true,
    isLoading: false,
    chatStarted: true,
    input: 'Hello world',
    pendingImages: [],
    addImageFiles: vi.fn(),
    handleStopAndEdit: vi.fn(),
    handleAbort: vi.fn(),
    handleBtw: vi.fn(),
    handleSteer: vi.fn(),
    handleAddQueue: vi.fn(),
    updatePrefs: vi.fn(),
    t: (k: string, opts?: any) => opts?.defaultValue ?? k,
    isListening: false,
    isSpeechSupported: true,
    onToggleSpeech: mockToggleSpeech,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders speech recognition mic button when supported', () => {
    render(<ComposerButtonBar {...defaultProps} />);

    const micBtn = screen.getByTitle('Voice input (Speech to text)');
    expect(micBtn).toBeDefined();

    fireEvent.click(micBtn);
    expect(mockToggleSpeech).toHaveBeenCalledTimes(1);
  });

  it('renders listening active state when isListening is true', () => {
    render(<ComposerButtonBar {...defaultProps} isListening={true} />);

    const stopListeningBtn = screen.getByTitle('Listening... (Click to stop)');
    expect(stopListeningBtn).toBeDefined();
  });

  describe('send-mode buttons by chrome level', () => {
    it('full: btw, steer and queue all render once the chat has started', () => {
      useLocalPrefs.setState({ chromeLevel: 'full' });
      render(<ComposerButtonBar {...defaultProps} />);
      expect(screen.queryByTestId('send-btw')).not.toBeNull();
      expect(screen.queryByTestId('send-steer')).not.toBeNull();
      expect(screen.queryByTestId('send-queue')).not.toBeNull();
      useLocalPrefs.setState({ chromeLevel: 'calm' });
    });

    it('calm + idle: btw and steer (both identical to Send) are hidden, queue stays', () => {
      useLocalPrefs.setState({ chromeLevel: 'calm' });
      render(<ComposerButtonBar {...defaultProps} />);
      expect(screen.queryByTestId('send-btw')).toBeNull();
      expect(screen.queryByTestId('send-steer')).toBeNull();
      expect(screen.queryByTestId('send-queue')).not.toBeNull();
      expect(screen.getByTestId('send-submit')).toBeDefined();
    });

    it('calm + running: steer comes back to interrupt the run', () => {
      useLocalPrefs.setState({ chromeLevel: 'calm' });
      render(<ComposerButtonBar {...defaultProps} isLoading />);
      expect(screen.queryByTestId('send-btw')).toBeNull();
      const steer = screen.getByTestId('send-steer');
      fireEvent.click(steer);
      expect(defaultProps.handleSteer).toHaveBeenCalledTimes(1);
    });
  });
});
