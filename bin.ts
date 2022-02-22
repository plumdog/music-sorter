#!/usr/bin/env node

import { main } from './main';
import { ApplicationError } from './errors';

main(process.argv.slice(2))
    .then(() => {
        process.exit(0);
    })
    .catch((err: Error) => {
        if (err instanceof ApplicationError) {
            console.error(err.message);
            process.exit(err.exitCode);
        } else {
            console.error('Unhandled error', err);
            process.exit(255);
        }
    });
