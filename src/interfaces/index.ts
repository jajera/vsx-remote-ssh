/**
 * Core interfaces for VSX Remote SSH extension
 */

// SSH interfaces
export * from './ssh';

// File system interfaces  
export * from './filesystem';

// Terminal interfaces - import specific types to avoid conflicts with SSH exports
import {
  TerminalSession,
  TerminalState
} from './terminal';

export {
  TerminalSession,
  TerminalState
};

// Configuration interfaces
export * from './configuration';

// Extension interfaces
export * from './extension';