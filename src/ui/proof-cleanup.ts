/** A cleanup failure does not release ownership of other still-pending writes.
 * The UI may bound observation time separately; this promise tracks actual settlement.
 */
export async function completeOwnedCleanup(tasks: readonly (Promise<unknown> | undefined)[]): Promise<void> {
  const settled = await Promise.allSettled(tasks);
  const errors = settled.filter(result => result.status === 'rejected').map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, 'Owned proof cleanup was incomplete.', { cause: errors[0] });
}
