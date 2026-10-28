import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rename, copyFile, lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Commit only fully prepared metadata outputs; restore prior files on caught failures.
 * Backups remain available when rollback itself fails. This does not claim
 * crash-atomicity across files or recover from process termination/power loss.
 */
export async function commitPreparedMetadataFiles(replacements, backupDirectory, io = { mkdir, lstat, copyFile, rename, rm }) {
  assert.ok(Array.isArray(replacements) && replacements.length, 'Prepared outputs are required.');
  const targets = new Set(), stagedPaths = new Set();
  for (const { staged, target } of replacements) {
    assert.ok(path.isAbsolute(staged) && path.isAbsolute(target) && staged !== target, 'Use separate absolute staged and target paths.');
    assert.ok(!targets.has(target) && !stagedPaths.has(staged), 'Prepared outputs must be unique.');
    targets.add(target); stagedPaths.add(staged);
    assert.ok((await io.lstat(staged)).isFile(), 'Prepared output must be a regular file.');
  }
  assert.ok([...targets].every(target => !stagedPaths.has(target)), 'A target cannot also be a staged input.');
  await io.mkdir(backupDirectory);
  const backups = [], committed = [];
  // Back up every prior target before the first replacement, including reports.
  for (const [index, replacement] of replacements.entries()) {
    const backup = path.join(backupDirectory, String(index));
    let exists = true;
    try {
      assert.ok((await io.lstat(replacement.target)).isFile(), 'Existing output must be a regular file.');
    } catch (error) { if (error.code === 'ENOENT') exists = false; else throw error; }
    if (exists) await io.copyFile(replacement.target, backup);
    backups.push({ ...replacement, backup: exists ? backup : null });
  }
  try {
    for (const replacement of backups) {
      await io.rename(replacement.staged, replacement.target);
      committed.push(replacement);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const replacement of committed.reverse()) {
      try {
        if (replacement.backup) await io.rename(replacement.backup, replacement.target);
        else await io.rm(replacement.target, { force: true });
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) {
      const failure = new AggregateError([error, ...rollbackErrors], `Metadata update rollback incomplete; recover prior files from ${backupDirectory}`, { cause: error });
      failure.retainedBackupDirectory = backupDirectory;
      throw failure;
    }
    throw error;
  }
  return { committed: committed.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Extend the released recordings with supplied audio. This does not compose,
  // synthesize or replace any of the existing score renders or original sources.
  const root = fileURLToPath(new URL('../', import.meta.url));
  const destination = path.join(root, 'public/assets/music/audio');
  const evidence = path.join(root, 'output/audio/soundtrack');
  const definitionPath = 'src/game/music-supplied-recordings.json';
  const supplied = JSON.parse(await readFile(path.join(root, definitionPath), 'utf8'));
  const manifestPath = path.join(destination, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.schema, 'sora-cars-soundtrack-audio-v1');
  const suppliedSlugs = new Set(supplied.map(song => song.file));
  const scores = manifest.tracks.filter(track => !suppliedSlugs.has(track.file));
  assert.ok(scores.length > 0, 'Export the synthesized score library before adding supplied recordings.');
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const sampleRate = 44100, channels = 2, targetLufs = -16, ceilingDbtp = -1.5;
  await mkdir(evidence, { recursive: true });
  function command(binary, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, { cwd: root }), stdout = [], stderr = [];
      child.stdout.on('data', chunk => stdout.push(chunk)); child.stderr.on('data', chunk => stderr.push(chunk));
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString() }) : reject(new Error(`${binary} exited ${code}: ${Buffer.concat(stderr)}`)));
    });
  }
  async function probe(file) {
    const result = JSON.parse((await command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).stdout.toString());
    return { stream: result.streams.find(stream => stream.codec_type === 'audio'), durationSeconds: Number(result.format.duration) };
  }
  async function loudness(file) {
    const result = await command('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-af', `loudnorm=I=${targetLufs}:TP=${ceilingDbtp}:LRA=11:print_format=json`, '-f', 'null', '-']);
    const match = result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/); assert.ok(match, 'loudness measurements available');
    const measured = JSON.parse(match[0]);
    return { integratedLufs: Number(measured.input_i), truePeakDbtp: Number(measured.input_tp), loudnessRangeLu: Number(measured.input_lra) };
  }
  async function info(file) {
    const bytes = await readFile(file);
    return { path: `/assets/music/audio/${path.basename(file)}`, bytes: bytes.length, sha256: sha(bytes) };
  }
  async function inspect(file, expectedSeconds) {
    const { stream, durationSeconds } = await probe(file);
    assert.equal(stream.channels, channels); assert.equal(Number(stream.sample_rate), sampleRate);
    assert.ok(Math.abs(durationSeconds - expectedSeconds) < .12, `${file}: full expected duration`);
    const pcm = (await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-'])).stdout;
    let peak = 0, power = 0, difference = 0, nonFinite = 0, lastPeak = 0;
    const sections = Array.from({ length: 8 }, () => ({ power: 0, count: 0 }));
    for (let offset = 0; offset < pcm.length; offset += 4) {
      const value = pcm.readFloatLE(offset); if (!Number.isFinite(value)) nonFinite++;
      peak = Math.max(peak, Math.abs(value)); power += value ** 2;
      const section = sections[Math.min(7, Math.floor(offset / pcm.length * 8))]; section.power += value ** 2; section.count++;
      if (offset % 8 === 0) difference += (value - pcm.readFloatLE(offset + 4)) ** 2;
      if (offset >= pcm.length - sampleRate * channels * 4 / 10) lastPeak = Math.max(lastPeak, Math.abs(value));
    }
    const rms = Math.sqrt(power / (pcm.length / 4)), stereoDifferenceRms = Math.sqrt(difference / (pcm.length / 8));
    assert.equal(nonFinite, 0); assert.ok(peak > .1 && peak < 1, `${file}: audible without digital clipping`);
    assert.ok(rms > .02); assert.ok(stereoDifferenceRms > .002);
    return { codec: stream.codec_name, durationSeconds, peak, rms, stereoDifferenceRms, sectionRms: sections.map(section => Math.sqrt(section.power / section.count)), last100msPeak: lastPeak, finite: true, decodedFrames: pcm.length / 8 };
  }
  async function verifyExistingScores() {
    for (const track of scores) for (const format of ['wav', 'mp3', 'preview']) {
      const file = track[format], bytes = await readFile(path.join(root, 'public', file.path));
      assert.equal(bytes.length, file.bytes, `${track.file}: original byte size`);
      assert.equal(sha(bytes), file.sha256, `${track.file}: original bytes must remain unchanged`);
    }
  }
  await verifyExistingScores();
  const ffmpegVersion = (await command('ffmpeg', ['-version'])).stdout.toString().split('\n')[0];
  const sourceHashes = {};
  for (const relative of [definitionPath, 'scripts/export-supplied-soundtrack.mjs']) sourceHashes[relative] = sha(await readFile(path.join(root, relative)));
  // A title correction must not transcode an existing lossy distribution copy.
  // Keep original conversion provenance separate from this metadata-only workflow.
  if (process.argv.includes('--metadata-only')) {
    const beforeManifest = JSON.parse(JSON.stringify(manifest));
    const updates = [], replacements = [];
    const staging = await mkdtemp(path.join(evidence, '.metadata-update-'));
    let retainBackups = false;
    try {
      const audioHash = async (file, codec) => (await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-c:a', codec, '-f', 'hash', '-hash', 'sha256', '-'])).stdout.toString().trim();
      for (const song of supplied) {
        const track = manifest.tracks.find(track => track.file === song.file);
        assert.ok(track, 'Metadata-only update requires an existing supplied recording.');
        assert.deepEqual(track.provenance.source, song.source, 'Source changes require a full supplied-recording export.');
        assert.equal(track.artist, song.artist); assert.equal(track.preview.startSeconds, song.previewStartSeconds);
        const source = await readFile(path.join(root, song.source.path));
        assert.equal(source.length, song.source.bytes); assert.equal(sha(source), song.source.sha256);
        const files = [];
        for (const format of ['wav', 'mp3', 'preview']) {
          const file = path.join(root, 'public', track[format].path), before = await info(file);
          assert.equal(before.bytes, track[format].bytes); assert.equal(before.sha256, track[format].sha256);
          const previous = JSON.parse((await command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).stdout);
          const pcm = await audioHash(file, 'pcm_f32le'), packets = await audioHash(file, 'copy');
          let prepared = file, changed = false;
          if (previous.format.tags?.title !== song.japanese) {
            const staged = path.join(staging, path.basename(file));
            await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', file, '-map', '0:a:0', '-map_metadata', '0', '-c:a', 'copy', '-metadata', `title=${song.japanese}`, staged]);
            assert.equal(await audioHash(staged, 'pcm_f32le'), pcm, 'Title update changed decoded audio.');
            assert.equal(await audioHash(staged, 'copy'), packets, 'Title update changed encoded audio.');
            const after = JSON.parse((await command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', staged])).stdout);
            assert.deepEqual(after.streams, previous.streams); assert.equal(after.format.duration, previous.format.duration);
            assert.deepEqual(after.format.tags, { ...previous.format.tags, title: song.japanese });
            replacements.push({ staged, target: file }); prepared = staged; changed = true;
          }
          const after = { ...await info(prepared), path: before.path };
          track[format] = { ...track[format], ...after };
          files.push({ format, before, after, decodedPcm: pcm, encodedPackets: packets, changed, reencoded: false });
        }
        track.title = song.name; track.japanese = song.japanese;
        updates.push({ file: song.file, title: song.japanese, files });
      }
      await verifyExistingScores();
      manifest.suppliedConversionSourceHashes ??= beforeManifest.suppliedSourceHashes;
      manifest.suppliedSourceHashes = sourceHashes;
      manifest.catalogUpdatedAt = new Date().toISOString();
      manifest.suppliedMetadataUpdate = { kind: 'title-only-no-reencoding', updatedAt: manifest.catalogUpdatedAt, sourceHashes, updates };
      const stagedManifest = path.join(staging, 'manifest.json'), stagedReport = path.join(staging, 'report.json');
      await writeFile(stagedManifest, JSON.stringify(manifest, null, 2) + '\n');
      await writeFile(stagedReport, JSON.stringify({ passed: true, ...manifest.suppliedMetadataUpdate, preservedScoreRecordings: scores.length, conversionSourceHashes: manifest.suppliedConversionSourceHashes }, null, 2) + '\n');
      replacements.push({ staged: stagedManifest, target: manifestPath }, { staged: stagedReport, target: path.join(evidence, 'supplied-metadata-update-report.json') });
      // No public file changes until every format and both JSON outputs are ready.
      // The success report is committed last, and rolls back with the media.
      await commitPreparedMetadataFiles(replacements, path.join(staging, 'backups'));
      console.log(JSON.stringify({ metadataOnly: true, recordings: updates.length, reencoded: false }));
    } catch (error) {
      retainBackups = Boolean(error?.retainedBackupDirectory);
      throw error;
    } finally {
      if (!retainBackups) await rm(staging, { recursive: true, force: true }).catch(error => console.error(`Metadata update staging cleanup failed: ${error.message}`));
    }
    process.exit(0);
  }
  const tracks = [];
  for (const song of supplied) {
    assert.match(song.file, /^[a-z0-9-]+$/); assert.equal(song.source.lossy, true);
    const source = path.join(root, song.source.path), bytes = await readFile(source);
    assert.equal(bytes.length, song.source.bytes); assert.equal(sha(bytes), song.source.sha256);
    assert.equal(sha(await readFile(path.join(root, 'public', song.source.publishedPath))), song.source.sha256, 'route copy preserves supplied source');
    const input = await probe(source);
    assert.equal(input.stream.codec_name, song.source.codec); assert.equal(Number(input.stream.sample_rate), song.source.sampleRate);
    assert.equal(input.stream.channels, song.source.channels); assert.equal(input.durationSeconds, song.source.durationSeconds);
    const before = await loudness(source), gainDb = Math.min(targetLufs - before.integratedLufs, ceilingDbtp - before.truePeakDbtp);
    assert.ok(Number.isFinite(gainDb)); assert.ok(song.previewStartSeconds >= 0 && song.previewStartSeconds + 30 <= input.durationSeconds);
    const index = scores.length + tracks.length;
    const tags = ['-metadata', `title=${song.japanese}`, '-metadata', `artist=${song.artist}`, '-metadata', 'album=SORA Cars — Original Soundtrack', '-metadata', `track=${index + 1}/${scores.length + supplied.length}`, '-metadata', 'date=2026', '-metadata', 'genre=Electronic', '-metadata', 'comment=Distribution conversion of supplied lossy AAC recording; not an original lossless master.'];
    const wav = path.join(destination, `${song.file}.wav`), mp3 = path.join(destination, `${song.file}.mp3`), preview = path.join(destination, `${song.file}-preview.mp3`);
    await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', source, '-map', '0:a:0', '-t', String(input.durationSeconds), '-af', `volume=${gainDb.toFixed(6)}dB,aresample=dither_method=triangular`, '-c:a', 'pcm_s16le', '-ar', String(sampleRate), '-ac', '2', ...tags, wav]);
    await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '320k', '-ar', String(sampleRate), '-id3v2_version', '3', ...tags, mp3]);
    await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', String(song.previewStartSeconds), '-i', wav, '-t', '30', '-af', 'afade=t=in:st=0:d=0.3,afade=t=out:st=27.3:d=2.5', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', String(sampleRate), ...tags, preview]);
    const validation = { wav: await inspect(wav, input.durationSeconds), mp3: await inspect(mp3, input.durationSeconds), preview: await inspect(preview, 30) };
    const after = await loudness(wav); assert.ok(after.truePeakDbtp <= -1.35);
    assert.equal(sha(await readFile(source)), song.source.sha256, 'supplied source remains unchanged');
    const entry = { index, file: song.file, title: song.name, japanese: song.japanese, artist: song.artist, bpm: song.bpm,
      durationSeconds: validation.wav.durationSeconds, sampleRate, channels, bitsPerSample: 16, ...after, peak: validation.wav.peak, rms: validation.wav.rms,
      wav: await info(wav), mp3: await info(mp3), preview: { ...await info(preview), durationSeconds: 30, startSeconds: song.previewStartSeconds },
      provenance: { kind: 'supplied-lossy-recording', source: song.source, note: 'User-supplied AAC recording. WAV is a decoded and resampled distribution copy of a lossy source, not an original lossless master. MP3 and preview are derived from that copy; no new composition or synthesized score is claimed.' },
      mastering: { gainDb, targetLufs, ceilingDbtp, input: before, ending: 'Full supplied duration retained; no additional loop or creative ending applied. Preview only has short fades.' },
    };
    tracks.push(entry);
    await writeFile(path.join(evidence, `${song.file}.json`), JSON.stringify({ ...entry, ffmpegVersion, sourceHashes, validation }, null, 2) + '\n');
    console.log(`${index + 1}/${scores.length + supplied.length} ${song.name}: ${entry.durationSeconds}s; ${after.integratedLufs} LUFS; ${after.truePeakDbtp} dBTP`);
  }
  await verifyExistingScores();
  const updated = { ...manifest, synthesizedSource: manifest.synthesizedSource ?? manifest.source,
    source: 'GameAudio score renders and user-supplied recordings; supplied tracks include separate source and conversion provenance.',
    catalogUpdatedAt: new Date().toISOString(), artist: 'SORA Cars', suppliedFfmpegVersion: ffmpegVersion, suppliedSourceHashes: sourceHashes, tracks: [...scores, ...tracks] };
  // A new conversion supersedes the earlier metadata-only transformation record.
  delete updated.suppliedMetadataUpdate;
  delete updated.suppliedConversionSourceHashes;
  await writeFile(manifestPath, JSON.stringify(updated, null, 2) + '\n');
  await writeFile(path.join(evidence, 'supplied-recordings-report.json'), JSON.stringify({ generatedAt: updated.catalogUpdatedAt, sourceHashes, ffmpegVersion, preservedScoreRecordings: scores.length, preservedScoreFiles: scores.length * 3, tracks }, null, 2) + '\n');
}
