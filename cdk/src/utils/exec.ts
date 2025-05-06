import { exec, spawnSync } from "child_process";
import * as os from 'os';

import * as fs from './file-system';
import { resolve, relative } from 'path';
import * as moment from 'moment-timezone';
import { logger } from './logger';
const pathHashes = {};

const hashRoot = '.build/hash';
fs.mkdir(hashRoot);

export function getFileSmash(path) {
    return  path.replace(/^\.\//, '').replace(/(\\|\/)/g, '-');
}

function getLastModified(path) {
    const pathlStat = fs.lstatSync(path);
    if(!pathlStat.isDirectory()) {
        return pathlStat.mtime.getTime();
    }

    const files = fs.readdirSync(path);
    const dates = files.map(x => {
        if(x.name == 'dist' || x.name == 'node_modules') {
            return;
        }
        const stats = fs.statSync(path + '/' + x);
        if(stats.isDirectory()) {
            return getLastModified(path + '/' + x);
        }
        return stats.mtime.getTime();
    }).filter(x => x? true : false);

    dates.sort();

    return dates[dates.length - 1];
}

export function folderUpdated(path) {
    if(!pathHashes[path]) {
        const filePath = resolve(hashRoot, getFileSmash(path));
        if(fs.existsSync(filePath)) {
            pathHashes[path] = fs.readFileSync(filePath).toString();
        } else {
            return true;
        }
    }

    const result = moment(getLastModified(path)).toString();
    return result != pathHashes[path];
}

export function writeCacheFile(sourcePath, memoryOnly) {
    pathHashes[sourcePath] = moment(getLastModified(sourcePath)).toString();
    if(!memoryOnly) {
        const filePath = resolve(hashRoot, getFileSmash(sourcePath));
        fs.writeFileSync(filePath, pathHashes[sourcePath]);
    }
}

export function execOnlyShowErrors(command: string, options: any = {}) {
    const buffer = [];
    try {
        logger.debug('execOnlyShowErrors', command, options);
        const osPlatform = os.platform();
        const proc = spawnSync(osPlatform === 'win32' ? 'cmd' : 'bash',
            [
                osPlatform === 'win32' ? '/c' : '-c',
                command,
            ], 
            { 
                stdio: [
                    'ignore', // ignore stdio
                    process.stderr, // redirect stdout to stderr
                    'inherit', // inherit stderr
                ], 
                env: { ...process.env}, 
                cwd: options.cwd ?? '.'
            });

        if (proc.status !== 0) {
            if (proc.stdout || proc.stderr) {
                throw new Error(`[Status ${proc.status}] stdout: ${proc.stdout?.toString().trim()}\n\n\nstderr: ${proc.stderr?.toString().trim()}`);
            }
            throw new Error(`${command} exited with status ${proc.status}`);
        }
        
        return proc;
    } catch (err) {
        logger.error('exec error');
        err.stdout && logger.error(err.stdout.toString());
        err.stderr && logger.error(err.stderr.toString());
        logger.debug('Working directory', process.cwd());
        throw new Error('Command failed');
    }
}

export interface CompileTypescriptOptions {
    compileFlags?: string;
    transpile_only?: string;
    outDir?: string;
    library?: string;
}

export function compileTypescript(sourceFolder, buildRoot, options: CompileTypescriptOptions = {}) {
    if(options.library) {
        const localOutDir = resolve(sourceFolder, options.outDir || '.');
        if(options.outDir) {
            logger.info('Removing outDir');
            fs.rmdir(localOutDir);
        }
        const outDir = resolve(process.cwd(), `${buildRoot}/${sourceFolder}`, options.outDir || '.');
        
        logger.debug('Compiling tsc', options.compileFlags, sourceFolder);
        execOnlyShowErrors(`npx tsc -d ${options.compileFlags || ''}`, { cwd: sourceFolder });
        
        logger.debug('Copying output');
        fs.copyFolder(localOutDir, outDir);
        logger.info('Finished copying');
    } else {
        const outDir = resolve(process.cwd(), buildRoot, sourceFolder, options.outDir || '.');
        const sourcePath = resolve(sourceFolder);
        const transpileOnly = options.transpile_only == 'true'? '--transpile-only' : '';

        const command = `npx tsc ${options.compileFlags || '' } --outDir ${outDir}` + transpileOnly;
        execOnlyShowErrors(command, { cwd: sourcePath });
    }
    logger.info('build complete', sourceFolder);
}

export function findTsConfigDir(dirPath) {
    const configPath = (dirPath || '.') + '/tsconfig.json';
    if(fs.existsSync(configPath)) {
        return dirPath;
    }

    if(dirPath == '') {
        return null;
    }

    const abPath = resolve(dirPath, '..');
    const relPath = relative(process.cwd(), abPath);
    return findTsConfigDir(relPath);
}
