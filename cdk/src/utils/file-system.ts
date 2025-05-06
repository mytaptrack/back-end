/***************
 * This file contains file system interactions to centralize how the system interacts 
 * with the operating system to allow for more generic solutions when needed.
 */
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
// import * as archiver from 'archiver';

export function mkdir(folderPath) {
    if(!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

export function rmdir(sourceDir) {
    if(!fs.existsSync(sourceDir)) {
        return;
    }

    const results = fs.readdirSync(sourceDir, { withFileTypes: true });
    for(let f of results) {
        const sourceSub = path.resolve(sourceDir, f.name);
        
        if(f.isDirectory()) {
            rmdir(sourceSub);
        } else {
            if(fs.existsSync(sourceSub)) {
                fs.unlinkSync(sourceSub);
            }
        }
    }
    fs.rmdirSync(sourceDir);
}

export function syncFolder(sourceDir, outDir, excludeArray = []) {
    if(!fs.existsSync(outDir) || excludeArray.find(x => sourceDir.endsWith(x))) {
        mkdir(outDir);
    }

    const results = fs.readdirSync(sourceDir, { withFileTypes: true });
    for(let f of results) {
        if(excludeArray.find(x => f.name.endsWith(x))) {
            continue;
        }
        const sourceSub = path.resolve(sourceDir, f.name);
        const destSub = path.resolve(outDir, f.name);
        
        if(f.isDirectory() || f.isSymbolicLink()) {
            copyFolder(sourceSub, destSub);
        } else {
            const sourceStat = fs.lstatSync(sourceSub);
            const destStat: any = fs.existsSync(destSub)? fs.lstatSync(destSub) : {} as any;
            if(sourceStat.size === destStat.size && sourceStat.mtimeMs === destStat.mtimeMs) {
                continue;
            }
            if(fs.existsSync(destSub)) {
                fs.unlinkSync(destSub);
            }
            fs.copyFileSync(sourceSub, destSub);
            fs.utimesSync(destSub, sourceStat.atime, sourceStat.mtime);
        }
    }
}

export function copyFolder(sourceDir, outDir, excludeArray = []) {
    if(!fs.existsSync(outDir) || excludeArray.find(x => sourceDir.endsWith(x))) {
        mkdir(outDir);
    }

    const results = fs.readdirSync(sourceDir, { withFileTypes: true });
    for(let f of results) {
        if(excludeArray.find(x => f.name.endsWith(x))) {
            continue;
        }
        const sourceSub = path.resolve(sourceDir, f.name);
        const destSub = path.resolve(outDir, f.name);
        
        if(f.isDirectory() || f.isSymbolicLink()) {
            copyFolder(sourceSub, destSub);
        } else {
            if(fs.existsSync(destSub)) {
                fs.unlinkSync(destSub);
            }
            fs.copyFileSync(sourceSub, destSub);
        }
    }
}


// function archiveDirectory(destFile, sourceDirectory) {
//     if(fs.existsSync(destFile)) {
//         logger.debug('Deleting dest file', destFile);
//         fs.unlinkSync(destFile);
//     }

//     logger.debug('Creating streams', destFile, sourceDirectory);
//     const output = fs.createWriteStream(destFile);
//     const archive = archiver('zip');

//     return new Promise<void>((resolve, reject) => {
//         logger.debug('Setting up event listeners');
//         output.on('close', () => {
//             logger.debug('closing file', destFile);
//             resolve();
//         });
//         archive.on('error', (err) => {
//             logger.error(err);
//             reject(err);
//         });

//         logger.debug('Piping zip output');
//         archive.pipe(output);
//         archive.directory(sourceDirectory, false);

//         logger.debug('Finalizing zip file');
//         archive.finalize();
//     });
// }

export function touch(filename) {
    const time = new Date();
    fs.utimesSync(filename, time, time);
}

export function hasFileUpdated(filePath: string, installDir: string, sourceRoot: string = '.') {
    const sourcePath = path.join(sourceRoot, filePath);
    const sourceExists = existsSync(sourcePath); 
    const sourceStats = sourceExists? statSync(sourcePath) : { ctimeMs: 0 };
    logger.debug('Source Check', sourcePath, ' Exists', sourceExists, ' Stats', sourceStats);
    
    const otherFile = path.join(installDir, filePath).replace(/\.ts$/, '.js');
    const otherExists = existsSync(otherFile);
    const destStats = otherExists? statSync(otherFile) : { ctimeMs: 0 };
    logger.debug('Dest Check', otherFile, ' Exists', otherExists, ' Stats', destStats);
    if(sourceStats.ctimeMs > destStats.ctimeMs) {
        return true;
    }
    return false;
}

export function hasFolderUpdated(source, buildDir): boolean {
    const result = readdirSync(source);
    
    const updatedItem = result.find(f => {
      if(f.isFile()) {
        return hasFileUpdated(path.join(source, f.name), buildDir);
      }
  
      return hasFolderUpdated(path.join(source, f.name), buildDir);
    });
  
    return updatedItem != undefined;
  }

export const existsSync = fs.existsSync;
export const writeFileSync = fs.writeFileSync;
export const readFileSync = fs.readFileSync;
export const watch = fs.watch;
export const watchFile = fs.watchFile;
export const statSync = fs.statSync;
export const copyFileSync = fs.copyFileSync;
export const unlinkSync = fs.unlinkSync;
export const lstatSync = fs.lstatSync;
export const readdirSync = (dirPath: string, recursive: boolean = false) => { return fs.readdirSync(dirPath, { withFileTypes: true, recursive }); };
export const symlinkSync = fs.symlinkSync;
