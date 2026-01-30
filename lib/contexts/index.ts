/**
 * Test Run Manager Context exports
 * 
 * Provides centralized state management for test runs including:
 * - Current test run tracking
 * - Historical runs management
 * - Test SKU list with localStorage persistence
 * - WebSocket integration for real-time updates
 * 
 * @example
 * ```tsx
 * import { TestRunManagerProvider, useTestRunManager } from '@/lib/contexts';
 * 
 * function App() {
 *   return (
 *     <TestRunManagerProvider>
 *       <TestLabComponent />
 *     </TestRunManagerProvider>
 *   );
 * }
 * 
 * function TestLabComponent() {
 *   const { testSkus, addSku, removeSku, startTest } = useTestRunManager();
 *   // ...
 * }
 * ```
 */

export {
  TestRunManagerProvider,
  useTestRunManager,
  TestRunManagerContext,
} from './TestRunManagerContext';

export type {
  TestSku,
  TestSkuType,
  TestSkuStatus,
  CurrentTestRun,
  TestRunManagerState,
  TestRunManagerActions,
  TestRunManagerContextValue,
  TestRunManagerProviderProps,
} from './TestRunManagerContext';
