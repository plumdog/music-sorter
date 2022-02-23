import { run, main } from '../main';
import * as tmp from 'tmp';
import * as pathlib from 'path';
import * as fs from 'fs';
import { Promise as nodeId3 } from 'node-id3';

tmp.setGracefulCleanup();

// From https://github.com/mathiasbynens/small/blob/master/mp3.mp3
const sampleMp3 = Buffer.from('/+MYxAAAAANIAAAAAExBTUUzLjk4LjIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'base64');

describe('run', () => {
    test('one file', async () => {
        const dir = tmp.dirSync();

        fs.writeFileSync(
            pathlib.join(dir.name, 'a_b_c1.mp3'),
            await nodeId3.write(
                {
                    artist: 'a',
                    album: 'b',
                    title: 'c',
                    trackNumber: '1',
                },
                sampleMp3,
            ),
        );

        await run({
            verbose: true,
            targetDir: dir.name,
        });

        expect(fs.existsSync(pathlib.join(dir.name, 'a', 'b', '01 - c.mp3'))).toEqual(true);

        expect(fs.existsSync(pathlib.join(dir.name, 'a_b_c1.mp3'))).toEqual(false);

        fs.rmdirSync(dir.name, { recursive: true });
    });

    test('two files', async () => {
        const dir = tmp.dirSync();

        fs.writeFileSync(
            pathlib.join(dir.name, 'a_b_c1.mp3'),
            await nodeId3.write(
                {
                    artist: 'a',
                    album: 'b',
                    title: 'c',
                    trackNumber: '1',
                },
                sampleMp3,
            ),
        );

        fs.writeFileSync(
            pathlib.join(dir.name, 'a_b_d2.mp3'),
            await nodeId3.write(
                {
                    artist: 'a',
                    album: 'b',
                    title: 'd',
                    trackNumber: '2',
                },
                sampleMp3,
            ),
        );

        await run({
            verbose: true,
            targetDir: dir.name,
        });

        expect(fs.existsSync(pathlib.join(dir.name, 'a', 'b', '01 - c.mp3'))).toEqual(true);
        expect(fs.existsSync(pathlib.join(dir.name, 'a', 'b', '02 - d.mp3'))).toEqual(true);

        expect(fs.existsSync(pathlib.join(dir.name, 'a_b_c1.mp3'))).toEqual(false);
        expect(fs.existsSync(pathlib.join(dir.name, 'a_b_d2.mp3'))).toEqual(false);

        fs.rmdirSync(dir.name, { recursive: true });
    });

    test('two files, same target', async () => {
        const dir = tmp.dirSync();

        fs.writeFileSync(
            pathlib.join(dir.name, 'a_b_c1.mp3'),
            await nodeId3.write(
                {
                    artist: 'a',
                    album: 'b',
                    title: 'c',
                    trackNumber: '1',
                },
                sampleMp3,
            ),
        );

        fs.writeFileSync(
            pathlib.join(dir.name, 'a_b_c1_again.mp3'),
            await nodeId3.write(
                {
                    artist: 'a',
                    album: 'b',
                    title: 'c',
                    trackNumber: '1',
                },
                sampleMp3,
            ),
        );

        await run({
            verbose: true,
            targetDir: dir.name,
        });

        expect(fs.existsSync(pathlib.join(dir.name, 'a', 'b', '01 - c.mp3'))).toEqual(true);
        expect(fs.existsSync(pathlib.join(dir.name, '.unmovable', 'a_b_c1_again.mp3'))).toEqual(true);

        fs.rmdirSync(dir.name, { recursive: true });
    });

    test('files without required metadata', async () => {
        const dir = tmp.dirSync();

        fs.writeFileSync(
            pathlib.join(dir.name, 'a_b_unknown.mp3'),
            await nodeId3.write(
                {
                    artist: 'a',
                    album: 'b',
                    // no title
                    trackNumber: '1',
                },
                sampleMp3,
            ),
        );

        await run({
            verbose: true,
            targetDir: dir.name,
        });

        expect(fs.existsSync(pathlib.join(dir.name, '.unknown', 'a_b_unknown.mp3'))).toEqual(true);

        fs.rmdirSync(dir.name, { recursive: true });
    });
});

describe('main', () => {
    test('simple', async () => {
        const dir = tmp.dirSync();

        fs.writeFileSync(
            pathlib.join(dir.name, 'a_b_c1.mp3'),
            await nodeId3.write(
                {
                    artist: 'a',
                    album: 'b',
                    title: 'c',
                    trackNumber: '1',
                },
                sampleMp3,
            ),
        );

        await main(['--verbose', dir.name]);

        expect(fs.existsSync(pathlib.join(dir.name, 'a', 'b', '01 - c.mp3'))).toEqual(true);

        expect(fs.existsSync(pathlib.join(dir.name, 'a_b_c1.mp3'))).toEqual(false);

        fs.rmdirSync(dir.name, { recursive: true });
    });

    test('no arg', async () => {
        await expect(main(['--verbose'])).rejects.toEqual(new Error('UnknownError: Expected one positional argument'));
    });

    test('bad args', async () => {
        await expect(main(['--this-is-not-a-valid-argument'])).rejects.toEqual(new Error('UnknownError: Unknown arguments: this-is-not-a-valid-argument, thisIsNotAValidArgument'));
    });
});
