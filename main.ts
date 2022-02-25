import path from 'path';
import { promises as fsPromises } from 'fs';
import * as fs from 'fs';
import * as crypto from 'crypto';

import yargs from 'yargs';
import { Promise as nodeId3 } from 'node-id3';
import walk from 'walkdir';

import { ArgumentsError } from './errors';

type LogFn = (msg: string) => void;

const getLogger = (verbose: boolean): LogFn => {
    return (msg: string): void => {
        if (verbose) {
            console.error('INFO:', msg);
        }
    };
};

interface Mp3 {
    artistName: string;
    albumName: string;
    trackName: string;
    trackNumber: number | undefined;
}

interface Move {
    source: string;
    target: string;
}

const inspectPossibleMp3 = async (filepath: string): Promise<Mp3 | undefined> => {
    const tags = await nodeId3.read(filepath);

    const artistName = tags.artist;
    const albumName = tags.album;
    const trackName = tags.title;
    const trackNumberRaw = tags.trackNumber;
    const trackNumber = typeof trackNumberRaw === 'string' ? parseInt(trackNumberRaw, 10) : undefined;

    if (typeof artistName === 'string' && typeof albumName === 'string' && typeof trackName === 'string') {
        return {
            artistName,
            albumName,
            trackName,
            trackNumber,
        };
    }

    return undefined;
};

class TargetExistsError extends Error {}

const safeRename = async (move: Move): Promise<void> => {
    const { source, target } = move;
    if (source === target) {
        return;
    }

    let targetExists = true;
    try {
        await fsPromises.access(target);
    } catch (err) {
        targetExists = false;
        // This is good, means we can move the file without clobbering
    }

    if (targetExists) {
        // TODO: do something different if the file hashes match
        throw new TargetExistsError('Target exists');
    }

    await fsPromises.mkdir(path.dirname(target), {
        recursive: true,
    });

    await fsPromises.rename(source, target);
};

const safeFilePartName = (name: string): string => {
    return name.replace(/\//g, '');
};

interface RunProps {
    verbose: boolean;
    targetDir: string;
}

interface Context {
    props: RunProps;
    logger: LogFn;
}

interface Plan {
    knownMoves: Record<string, string>;
    unknownMoves: Array<string>;
}

export const generatePlan = async (ctx: Context): Promise<Plan> => {
    const result = await walk.async(ctx.props.targetDir, { return_object: true });

    const filesOnly: Array<string> = [];

    for (const [filepath, stat] of Object.entries(result)) {
        if (stat.isFile()) {
            filesOnly.push(filepath);
        }
    }

    filesOnly.sort();

    const inspected: Record<string, Mp3 | undefined> = {};

    for (const filepath of filesOnly) {
        inspected[filepath] = await inspectPossibleMp3(filepath);
    }

    const knownMoves: Record<string, string> = {};
    const unknownMoves: Array<string> = [];

    for (const [filepath, mp3] of Object.entries(inspected)) {
        if (typeof mp3 === 'undefined') {
            unknownMoves.push(filepath);
        } else {
            const filename = typeof mp3.trackNumber === 'undefined' ? `${mp3.trackName}.mp3` : `${String(mp3.trackNumber).padStart(2, '0')} - ${mp3.trackName}.mp3`;
            knownMoves[filepath] = path.join(ctx.props.targetDir, safeFilePartName(mp3.artistName), safeFilePartName(mp3.albumName), safeFilePartName(filename));
        }
    }

    return {
        knownMoves,
        unknownMoves,
    };
};

const appendToFilenameHandleExtension = (filepath: string, append: string): string => {
    const parts = path.parse(filepath);
    return path.join(parts.dir, `${parts.name}${append}${parts.ext}`);
};

const handleUnmovableFiles = async (ctx: Context, files: UnmovableFiles): Promise<void> => {
    for (const fileSet of files.fileSets) {
        for (const unmovable of fileSet.unmovables) {
            const desired = fileSet.blocker.filepath;
            const desiredRelpath = path.relative(ctx.props.targetDir, desired);
            const unmovableDirectoryName = fileSet.blocker.hash === unmovable.hash ? '.duplicate' : '.unmovable';
            const newTargetPlain = path.join(ctx.props.targetDir, unmovableDirectoryName, desiredRelpath);
            const newTargetWithHash = appendToFilenameHandleExtension(newTargetPlain, `_${unmovable.hash}`);
            let appendInt: undefined | number = undefined;
            while (true) {
                try {
                    await safeRename({
                        source: unmovable.filepath,
                        target: typeof appendInt === 'undefined' ? newTargetWithHash : appendToFilenameHandleExtension(newTargetWithHash, `_${appendInt}`),
                    });
                } catch (err: unknown) {
                    if (err instanceof TargetExistsError) {
                        if (typeof appendInt === 'undefined') {
                            appendInt = 1;
                        } else {
                            appendInt++;
                        }
                        continue;
                    } else {
                        throw err;
                    }
                }
                break;
            }
        }
    }
};

const handleUnknownFile = async (ctx: Context, filepath: string): Promise<void> => {
    const relpath = path.relative(ctx.props.targetDir, filepath).replace(/^(\.unknown\/)+/, '');
    const target = path.join(ctx.props.targetDir, '.unknown', relpath);
    await safeRename({
        source: filepath,
        target,
    });
};

interface FileAndHash {
    filepath: string;
    hash: string;
}

interface UnmovableFileSet {
    blocker: FileAndHash;
    unmovables: Array<FileAndHash>;
}

const hashFile = (filepath: string, hashType = 'sha256'): Promise<string> => {
    return new Promise((res, rej) => {
        const sum = crypto.createHash(hashType);
        const stream = fs.createReadStream(filepath);
        stream.on('error', (err: Error) => {
            rej(err);
        });
        stream.on('data', (chunk: Buffer | string) => {
            sum.update(chunk);
        });
        stream.on('end', () => {
            res(sum.digest('hex'));
        });
    });
};

class UnmovableFiles {
    readonly _fileSets: Record<string, UnmovableFileSet>;

    constructor() {
        this._fileSets = {};
    }

    async addUnmovableFile(desiredPath: string, currentPath: string): Promise<void> {
        const toAdd = {
            filepath: currentPath,
            hash: await hashFile(currentPath),
        };
        const fileSet: UnmovableFileSet | undefined = this._fileSets[desiredPath];
        if (typeof fileSet === 'undefined') {
            this._fileSets[desiredPath] = {
                blocker: {
                    filepath: desiredPath,
                    hash: await hashFile(desiredPath),
                },
                unmovables: [toAdd],
            };
        } else {
            if (fileSet.blocker.filepath !== desiredPath) {
                throw new Error(`Retrieved fileset has a blocker for a different path, blocker.filepath=${fileSet.blocker.filepath}, desiredPath=${desiredPath}`);
            }
            fileSet.unmovables.push(toAdd);
        }
    }

    get fileSets(): Array<UnmovableFileSet> {
        return Object.values(this._fileSets);
    }

    get totalUnmovableFiles(): number {
        let count = 0;
        for (const fileSet of this.fileSets) {
            count += fileSet.unmovables.length;
        }
        return count;
    }
}

export const executePlan = async (ctx: Context, plan: Plan): Promise<void> => {
    ctx.logger(`Found ${Object.keys(plan.knownMoves).length} files`);

    const unmovable = new UnmovableFiles();

    for (const [source, target] of Object.entries(plan.knownMoves)) {
        try {
            await safeRename({
                source,
                target,
            });
        } catch (err) {
            if (err instanceof TargetExistsError) {
                await unmovable.addUnmovableFile(target, source);
            } else {
                throw err;
            }
        }
    }

    ctx.logger(`Found ${unmovable.totalUnmovableFiles} unmovable files`);
    await handleUnmovableFiles(ctx, unmovable);

    ctx.logger(`Found ${plan.unknownMoves.length} unknown files`);
    for (const filepath of plan.unknownMoves) {
        await handleUnknownFile(ctx, filepath);
    }
};

export const run = async (props: RunProps): Promise<void> => {
    const ctx = {
        logger: getLogger(props.verbose),
        props,
    };

    ctx.logger(`Starting targeting dir ${ctx.props.targetDir}`);

    const plan = await generatePlan(ctx);

    await executePlan(ctx, plan);

    ctx.logger('Done, exiting cleanly');
};

export const main = async (args: Array<string>): Promise<void> => {
    const parsedArgs = yargs
        .boolean('verbose')
        .describe('verbose', 'Be verbose')
        .usage('Usage: $0 <target> [...options]')
        .strict()
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .fail((msg: string, err: Error | null, yargsObj: yargs.Argv): void => {
            /* istanbul ignore next */
            if (err) throw err;
            throw new ArgumentsError(msg);
        })
        .parse(args);

    const positionalArgs: Array<string> = parsedArgs._.map((arg: string | number): string => `${arg}`);

    const targetDir: string | undefined = positionalArgs[0];

    if (!targetDir) {
        throw new ArgumentsError('Expected one positional argument, found none');
    }

    if (positionalArgs.length > 1) {
        throw new ArgumentsError(`Expected one positional argument, found ${positionalArgs.length}`);
    }

    await run({
        verbose: parsedArgs.verbose || false,
        targetDir: path.resolve(targetDir),
    });
};
