import path from 'path';
import { promises as fs } from 'fs';

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

const safeRename = async (source: string, target: string): Promise<void> => {
    if (source === target) {
        return;
    }

    let targetExists = true;
    try {
        await fs.access(target);
    } catch (err) {
        targetExists = false;
        // This is good, means we can move the file without clobbering
    }

    if (targetExists) {
        // TODO: do something different if the file hashes match
        throw new TargetExistsError('Target exists');
    }

    await fs.mkdir(path.dirname(target), {
        recursive: true,
    });

    await fs.rename(source, target);
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

export const executePlan = async (ctx: Context, plan: Plan): Promise<void> => {
    const unmovable: Array<string> = [];

    for (const [source, target] of Object.entries(plan.knownMoves)) {
        try {
            await safeRename(source, target);
        } catch (err) {
            if (err instanceof TargetExistsError) {
                unmovable.push(source);
            } else {
                throw err;
            }
        }
    }

    ctx.logger(`Found ${unmovable.length} unmovable files`);

    for (const filepath of unmovable) {
        const relpath = path.relative(ctx.props.targetDir, filepath).replace(/^(\.unmovable\/)+/, '');
        const target = path.join(ctx.props.targetDir, '.unmovable', relpath);
        await safeRename(filepath, target);
    }

    ctx.logger(`Found ${plan.unknownMoves.length} unknown files`);

    for (const filepath of plan.unknownMoves) {
        const relpath = path.relative(ctx.props.targetDir, filepath).replace(/^(\.unknown\/)+/, '');
        const target = path.join(ctx.props.targetDir, '.unknown', relpath);
        await safeRename(filepath, target);
    }
};

export const run = async (props: RunProps): Promise<void> => {
    const ctx = {
        logger: getLogger(props.verbose),
        props,
    };

    ctx.logger(`Starting targeting dir ${ctx.props.targetDir}`);

    const plan = await generatePlan(ctx);

    ctx.logger(`Found ${Object.keys(plan.knownMoves).length} files`);

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

    if (positionalArgs.length !== 1) {
        throw new ArgumentsError('Expected one positional argument');
    }

    const targetDir: string = positionalArgs[0];

    await run({
        verbose: parsedArgs.verbose || false,
        targetDir: path.resolve(targetDir),
    });
};
