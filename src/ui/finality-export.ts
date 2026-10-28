import { GAME_SETTLEMENT_FILE_ROLES_V1, type GameSettlementFileSinkV1, type GameSettlementReceiptV1 } from '@iroha/iroha-js/game-settlement';
import { SETTLEMENT_DESCRIPTOR_FILE } from '../chain/finality';

type DirectoryPicker = (options: { id: string; mode: 'readwrite'; startIn: 'downloads' }) => Promise<FileSystemDirectoryHandle>;
type ExportWindow = Window & { showDirectoryPicker?: DirectoryPicker };
export interface SettlementDirectoryExport {
  readonly folder: string;
  readonly sink: GameSettlementFileSinkV1;
  publish(receipt: GameSettlementReceiptV1): Promise<void>;
  /** False after publication has started; waits for its actual result, never claims rollback. */
  abort(): Promise<boolean>;
}
export function supportsFinalityDirectoryExport(): boolean {
  return typeof window !== 'undefined' && typeof (window as ExportWindow).showDirectoryPicker === 'function';
}
const cancelled = () => new DOMException('検証ファイルの保存を中止しました。 / Verification export cancelled.', 'AbortError');
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
async function requireMissing(find: () => Promise<unknown>) {
  try { await find(); } catch (error) { if (missing(error)) return; throw error; }
  throw new Error('Verification export refuses to replace an existing file or folder.');
}
/** Private means unpublished: a random owned folder has no usable descriptor until commit.
 * Writable close replaces one file's buffered contents (WHATWG FS §2.5); no directory-wide
 * atomicity, crash durability, external-writer exclusion or post-close rollback is promised.
 */
export async function selectFinalityDirectory(options: { signal: AbortSignal; isCurrent: () => boolean; onProgress?: (completed: number, total: number) => void; onCommitting?: () => void }): Promise<SettlementDirectoryExport> {
  const { signal, isCurrent } = options;
  let phase: 'files' | 'ready' | 'publishing' | 'committing' | 'complete' | 'failed' = 'files';
  let stopped = false;
  const check = () => { if (stopped || signal.aborted || !isCurrent()) throw cancelled(); };
  check();
  if (!supportsFinalityDirectoryExport()) throw new Error('このブラウザーでは保存できません。フォルダー保存対応のデスクトップブラウザーを使ってください。 / A desktop browser with folder saving support is required.');
  const parent = await (window as ExportWindow).showDirectoryPicker!.call(window, { id: 'sora-cars-finality', mode: 'readwrite', startIn: 'downloads' });
  check();
  const folder = `sora-cars-finality-${crypto.randomUUID()}`;
  await requireMissing(() => parent.getDirectoryHandle(folder)); check();
  const directory = await parent.getDirectoryHandle(folder, { create: true });
  let stream: FileSystemWritableFileStream | undefined, pending: Promise<void> | undefined, barrier: Promise<void> | undefined;
  let publication: Promise<void> | undefined, cleanup: Promise<void> | undefined, index = 0, failure: unknown;
  const sizes = new Map<string, number>();
  const remove = () => cleanup ??= (async () => {
    if (stream) { const owned = stream; stream = undefined; await owned.abort(); }
    try { await parent.removeEntry(folder, { recursive: true }); }
    catch (error) { if (!missing(error)) throw new Error(`未完成のフォルダーを削除できませんでした。手動で削除してください: ${folder} / Incomplete folder cleanup failed.`, { cause: error }); }
  })();
  const open = async (name: string) => {
    check(); await requireMissing(() => directory.getFileHandle(name)); check();
    const handle = await directory.getFileHandle(name, { create: true }); check();
    stream = await handle.createWritable(); check();
  };
  const run = (operation: () => Promise<void>) => {
    if (pending || barrier || phase !== 'files') return Promise.reject(new Error('Settlement writes must be awaited in order before quiescence.'));
    const work = (async () => { try { check(); await operation(); check(); } catch (error) { failure = error; throw error; } })();
    pending = work;
    return work.finally(() => { if (pending === work) pending = undefined; });
  };
  const quiesce = () => barrier ??= (async () => {
    await pending?.catch(() => {});
    if (stream) { const owned = stream; stream = undefined; try { await owned.abort(); } catch (error) { failure ??= error; } }
    if (failure) throw failure;
    check();
    if (index !== GAME_SETTLEMENT_FILE_ROLES_V1.length) throw new Error('Seven completed native files are required.');
    phase = 'ready';
  })();
  const sink: GameSettlementFileSinkV1 = {
    writePart: (role, bytes, taskSignal) => run(async () => {
      if (taskSignal.aborted) throw taskSignal.reason;
      if (role !== GAME_SETTLEMENT_FILE_ROLES_V1[index] || bytes.length === 0 || bytes.length > 65_536) throw new Error('Invalid native role or chunk sequence.');
      if (!stream) await open(`${role}.nrt`);
      await stream!.write(new Uint8Array(bytes));
      sizes.set(role, (sizes.get(role) ?? 0) + bytes.length);
    }),
    finishPart: (role, taskSignal) => run(async () => {
      if (taskSignal.aborted) throw taskSignal.reason;
      if (role !== GAME_SETTLEMENT_FILE_ROLES_V1[index] || !stream || !sizes.get(role)) throw new Error('Invalid native role completion.');
      await stream.close(); stream = undefined; index++;
      options.onProgress?.(index, GAME_SETTLEMENT_FILE_ROLES_V1.length);
    }), quiesce,
  };
  const abort = async () => {
    if (phase === 'committing' || phase === 'complete') { await publication; return false; }
    stopped = true;
    await publication?.catch(() => {}); await pending?.catch(() => {}); await barrier?.catch(() => {});
    await remove(); phase = 'failed'; return true;
  };
  if (signal.aborted || !isCurrent()) { await abort(); throw cancelled(); }
  return { folder, sink, abort, publish(receipt) {
    if (publication || phase !== 'ready') return Promise.reject(new Error('Settlement publication requires completed, quiescent files.'));
    publication = (async () => {
      try {
        await barrier; check();
        if (receipt.assurance !== 'endpoint-reported' || receipt.publicationState !== 'files-complete-unpublished' || receipt.descriptorText !== JSON.stringify(receipt.descriptor) + '\n'
          || receipt.descriptor.format !== 'iroha.game.certified-settlement-files' || receipt.descriptor.version !== 1
          || Object.keys(receipt.descriptor.files).join() !== GAME_SETTLEMENT_FILE_ROLES_V1.join()
          || GAME_SETTLEMENT_FILE_ROLES_V1.some(role => receipt.descriptor.files[role].file !== `${role}.nrt` || receipt.descriptor.files[role].bytes !== sizes.get(role))) throw new Error('Descriptor does not match the completed native files.');
        phase = 'publishing'; await open(SETTLEMENT_DESCRIPTOR_FILE);
        await stream!.write(new TextEncoder().encode(receipt.descriptorText)); check();
        // Linearization boundary: no await or callback between ownership check and close.
        // Cancellation before here discards the buffered descriptor. Once close starts,
        // wait for physical completion and report its outcome; cancellation cannot undo it.
        phase = 'committing'; const commit = stream!.close();
        try { options.onCommitting?.(); } catch { /* UI observers cannot detach physical commit ownership. */ }
        await commit; stream = undefined; phase = 'complete';
      } catch (error) {
        phase = 'failed';
        try { await remove(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], `Export failed; cleanup also failed for ${folder}.`); }
        throw error;
      }
    })();
    return publication;
  } };
}
