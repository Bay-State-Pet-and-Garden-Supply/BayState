/**
 * ReviewingResultsView
 *
 * Alias for FinalizingResultsView with updated copy for the simplified pipeline.
 * Products in 'reviewing' status (previously 'finalizing') are awaiting final
 * admin approval before storefront publication.
 *
 * The underlying component is unchanged — only the status label and tab name
 * have changed from "Finalizing" to "Reviewing".
 */

import { FinalizingResultsView } from "./FinalizingResultsView";
export { FinalizingResultsView as ReviewingResultsView };
