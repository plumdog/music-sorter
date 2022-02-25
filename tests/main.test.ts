import { run, main } from '../main';
import * as tmp from 'tmp';
import * as pathlib from 'path';
import * as fs from 'fs';
import { Promise as nodeId3 } from 'node-id3';

tmp.setGracefulCleanup();

const verboseTests = false;

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
            verbose: verboseTests,
            targetDir: dir.name,
        });

        expect(fs.existsSync(pathlib.join(dir.name, 'a', 'b', '01 - c.mp3'))).toEqual(true);

        expect(fs.existsSync(pathlib.join(dir.name, 'a_b_c1.mp3'))).toEqual(false);

        fs.rmdirSync(dir.name, { recursive: true });
    });

    test('one file, no track number', async () => {
        const dir = tmp.dirSync();

        fs.writeFileSync(
            pathlib.join(dir.name, 'a_b_c1.mp3'),
            await nodeId3.write(
                {
                    artist: 'a',
                    album: 'b',
                    title: 'c',
                    // no track number
                },
                sampleMp3,
            ),
        );

        await run({
            verbose: verboseTests,
            targetDir: dir.name,
        });

        expect(fs.readdirSync(pathlib.join(dir.name, 'a', 'b'))).toEqual(['c.mp3']);
        expect(fs.existsSync(pathlib.join(dir.name, 'a_b_c1.mp3'))).toEqual(false);

        fs.rmdirSync(dir.name, { recursive: true });
    });

    test('one file, ', async () => {
        const dir = tmp.dirSync();

        fs.mkdirSync(pathlib.join(dir.name, 'a'));
        fs.mkdirSync(pathlib.join(dir.name, 'a', 'b'));
        fs.writeFileSync(
            pathlib.join(dir.name, 'a', 'b', '01 - c.mp3'),
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
            verbose: verboseTests,
            targetDir: dir.name,
        });

        expect(fs.readdirSync(pathlib.join(dir.name, 'a', 'b'))).toEqual(['01 - c.mp3']);

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
            verbose: verboseTests,
            targetDir: dir.name,
        });

        expect(fs.existsSync(pathlib.join(dir.name, 'a', 'b', '01 - c.mp3'))).toEqual(true);
        expect(fs.existsSync(pathlib.join(dir.name, 'a', 'b', '02 - d.mp3'))).toEqual(true);

        expect(fs.existsSync(pathlib.join(dir.name, 'a_b_c1.mp3'))).toEqual(false);
        expect(fs.existsSync(pathlib.join(dir.name, 'a_b_d2.mp3'))).toEqual(false);

        fs.rmdirSync(dir.name, { recursive: true });
    });

    test('two files, same target, same hash', async () => {
        const dir = tmp.dirSync();

        const fileContent = await nodeId3.write(
            {
                artist: 'a',
                album: 'b',
                title: 'c',
                trackNumber: '1',
            },
            sampleMp3,
        );

        fs.writeFileSync(pathlib.join(dir.name, 'a_b_c1.mp3'), fileContent);

        fs.writeFileSync(pathlib.join(dir.name, 'a_b_c1_again.mp3'), fileContent);

        await run({
            verbose: verboseTests,
            targetDir: dir.name,
        });

        expect(fs.readdirSync(pathlib.join(dir.name, 'a', 'b'))).toEqual(['01 - c.mp3']);
        expect(fs.readdirSync(pathlib.join(dir.name, '.duplicate', 'a', 'b'))).toEqual(['01 - c_c67329ed29fa99331131220769cdb5d937468caf1ffb32b9e10b0288580a8517.mp3']);

        fs.rmdirSync(dir.name, { recursive: true });
    });

    test('three files, same target, same hash', async () => {
        const dir = tmp.dirSync();

        const fileContent = await nodeId3.write(
            {
                artist: 'a',
                album: 'b',
                title: 'c',
                trackNumber: '1',
            },
            sampleMp3,
        );

        fs.writeFileSync(pathlib.join(dir.name, 'a_b_c1.mp3'), fileContent);

        fs.writeFileSync(pathlib.join(dir.name, 'a_b_c1_again.mp3'), fileContent);

        fs.writeFileSync(pathlib.join(dir.name, 'a_b_c1_again2.mp3'), fileContent);

        await run({
            verbose: verboseTests,
            targetDir: dir.name,
        });

        expect(fs.existsSync(pathlib.join(dir.name, 'a', 'b', '01 - c.mp3'))).toEqual(true);
        expect(fs.readdirSync(pathlib.join(dir.name, '.duplicate', 'a', 'b'))).toEqual([
            '01 - c_c67329ed29fa99331131220769cdb5d937468caf1ffb32b9e10b0288580a8517.mp3',
            '01 - c_c67329ed29fa99331131220769cdb5d937468caf1ffb32b9e10b0288580a8517_1.mp3',
        ]);

        fs.rmdirSync(dir.name, { recursive: true });
    });

    test('four files, same target, same hash', async () => {
        const dir = tmp.dirSync();

        const fileContent = await nodeId3.write(
            {
                artist: 'a',
                album: 'b',
                title: 'c',
                trackNumber: '1',
            },
            sampleMp3,
        );

        fs.writeFileSync(pathlib.join(dir.name, 'a_b_c1.mp3'), fileContent);
        fs.writeFileSync(pathlib.join(dir.name, 'a_b_c1_again.mp3'), fileContent);
        fs.writeFileSync(pathlib.join(dir.name, 'a_b_c1_again2.mp3'), fileContent);
        fs.writeFileSync(pathlib.join(dir.name, 'a_b_c1_again3.mp3'), fileContent);

        await run({
            verbose: verboseTests,
            targetDir: dir.name,
        });

        expect(fs.existsSync(pathlib.join(dir.name, 'a', 'b', '01 - c.mp3'))).toEqual(true);
        expect(fs.readdirSync(pathlib.join(dir.name, '.duplicate', 'a', 'b'))).toEqual([
            '01 - c_c67329ed29fa99331131220769cdb5d937468caf1ffb32b9e10b0288580a8517.mp3',
            '01 - c_c67329ed29fa99331131220769cdb5d937468caf1ffb32b9e10b0288580a8517_1.mp3',
            '01 - c_c67329ed29fa99331131220769cdb5d937468caf1ffb32b9e10b0288580a8517_2.mp3',
        ]);

        fs.rmdirSync(dir.name, { recursive: true });
    });

    test('two files, same target, different hash', async () => {
        const dir = tmp.dirSync();

        fs.writeFileSync(
            pathlib.join(dir.name, 'a_b_c1.mp3'),
            await nodeId3.write(
                {
                    artist: 'a',
                    album: 'b',
                    title: 'c',
                    trackNumber: '1',
                    genre: 'A',
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
                    genre: 'B',
                },
                sampleMp3,
            ),
        );

        await run({
            verbose: verboseTests,
            targetDir: dir.name,
        });

        expect(fs.readdirSync(pathlib.join(dir.name, 'a', 'b'))).toEqual(['01 - c.mp3']);
        const unmovableFiles = fs.readdirSync(pathlib.join(dir.name, '.unmovable', 'a', 'b'));
        expect(['01 - c_86605500d1fdc0f08790ce0f86744893657fc6c4c7fcdc326b33c3eaf320923f.mp3']).toEqual(unmovableFiles);

        fs.rmdirSync(dir.name, { recursive: true });
    });

    test('three files, same target, different hash', async () => {
        const dir = tmp.dirSync();

        fs.writeFileSync(
            pathlib.join(dir.name, 'a_b_c1.mp3'),
            await nodeId3.write(
                {
                    artist: 'a',
                    album: 'b',
                    title: 'c',
                    trackNumber: '1',
                    genre: 'A',
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
                    genre: 'B',
                },
                sampleMp3,
            ),
        );

        fs.writeFileSync(
            pathlib.join(dir.name, 'a_b_c1_again2.mp3'),
            await nodeId3.write(
                {
                    artist: 'a',
                    album: 'b',
                    title: 'c',
                    trackNumber: '1',
                    genre: 'C',
                },
                sampleMp3,
            ),
        );

        await run({
            verbose: verboseTests,
            targetDir: dir.name,
        });

        expect(fs.existsSync(pathlib.join(dir.name, 'a', 'b', '01 - c.mp3'))).toEqual(true);
        const unmovableFiles = fs.readdirSync(pathlib.join(dir.name, '.unmovable', 'a', 'b'));
        expect(['01 - c_4ed21b7fe1ac8b2a8242e332fea7a38c7284567e48d080aff43d23eeb413f21b.mp3', '01 - c_86605500d1fdc0f08790ce0f86744893657fc6c4c7fcdc326b33c3eaf320923f.mp3']).toEqual(unmovableFiles);

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
            verbose: verboseTests,
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

        await main([...(verboseTests ? ['--verbose'] : []), dir.name]);

        expect(fs.existsSync(pathlib.join(dir.name, 'a', 'b', '01 - c.mp3'))).toEqual(true);

        expect(fs.existsSync(pathlib.join(dir.name, 'a_b_c1.mp3'))).toEqual(false);

        fs.rmdirSync(dir.name, { recursive: true });
    });

    test('no arg', async () => {
        await expect(main(['--verbose'])).rejects.toEqual(new Error('UnknownError: Expected one positional argument, found none'));
    });

    test('two args', async () => {
        await expect(main(['--verbose', 'arg1', 'arg2'])).rejects.toEqual(new Error('UnknownError: Expected one positional argument, found 2'));
    });

    test('bad args', async () => {
        await expect(main(['--this-is-not-a-valid-argument'])).rejects.toEqual(new Error('UnknownError: Unknown arguments: this-is-not-a-valid-argument, thisIsNotAValidArgument'));
    });
});
