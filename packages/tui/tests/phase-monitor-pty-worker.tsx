import { render } from 'ink';
import React from 'react';
import { PhaseMonitor } from '../src/components/phase-monitor.js';

render(
  React.createElement(PhaseMonitor, {
    title: 'Goal PTY proof',
    phases: {
      build: {
        name: 'Build',
        status: 'running',
        completedTasks: 1,
        totalTasks: 2,
        startedAt: Date.now() - 1000,
        activeTasks: [{ taskId: 'task-2', title: 'Finish feature', agent: 'worker' }],
      },
    },
    runningPhaseIds: ['build'],
    elapsedMs: 1000,
    nowTick: Date.now(),
  }),
);

setTimeout(() => process.exit(0), 1500);
