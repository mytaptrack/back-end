import { Code, LayerVersion } from "aws-cdk-lib/aws-lambda";
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { CfnResource } from "aws-cdk-lib";
import { IMttContext, copyFolder, execOnlyShowErrors, folderUpdated, hasFileUpdated, logger, lstatSync, readdirSync, rmdir, statSync, writeCacheFile, writeFileSync } from ".";
import path = require("path");

export interface MttLayerProps {
    id?: string;
    packageDir: string;
}

function getLatestTime(pathDir: string) {
    const files = readdirSync(pathDir);

    let retval: number = Number.MAX_VALUE;
    files.forEach(file => {
        const stat = lstatSync(path.join(pathDir, file.path, file.name));
        if(stat.ctimeMs > retval) {
            retval = stat.ctimeMs;
        }
    });

    return retval;
}

function packModule(pathDir: string) {
    const packPath = path.join(pathDir, 'package.json');
    logger.debug('Evaluating ', packPath);
    const pck = require(packPath);
    const fileName = pck.name.replace('@', '').replace(/\//g, '-') + ',tgz';
    const exportFile = path.join(pathDir, fileName);
    const fileExists = existsSync(exportFile);
    const stats = lstatSync(exportFile);
    const folderLatest = getLatestTime(path.join(pathDir, 'dist'));
    const packStat = lstatSync(path.join(pathDir, 'package.json'));
    const latest = packStat.ctimeMs < folderLatest ? folderLatest : packStat.ctimeMs;

    if(!fileExists || stats.ctimeMs < latest) {
        execOnlyShowErrors('npm pack', { cwd: pathDir });
    }

    return fileName;
}

function managePathFileJoin(pathDir: string, fileName: string) {
    if(fileName) {
        return path.join(pathDir, fileName);
    }
    return pathDir;
}

function cleanPackageLock(packages: any, addRelative: string, filePath: string) {
    const keys = [...Object.keys(packages)];
    keys.forEach(key => {
        if (packages[key].dependencies) {
            cleanPackageLock(packages[key].dependencies, addRelative, filePath);
        }

        if (packages[key].resolved?.startsWith('..')) {
            const fileName = packModule(path.join('..', packages[key].resolved));
            packages[key].resolved = managePathFileJoin(addRelative + '/' + packages[key].resolved, fileName);
        }

        if (key.startsWith('../')) {
            logger.debug('Replacing relative path', key);
            const vals = packages[key];
            const fileName = packModule(path.join('..', vals));
            packages[addRelative + '/' + key] = managePathFileJoin(vals, fileName);
            delete packages[key];
        } else if (packages[key].startsWith && packages[key].startsWith('file:')) {
            let val = packages[key];
            val = val.slice(5);
            
            const fileName = packModule(path.join('..', val));

            const newPath = 'file:' + addRelative + '/' + val;
            logger.debug('Fixing ', key, 'to path', newPath);
            packages[key] = managePathFileJoin(newPath, fileName);
        }
    });
}

export class MttLayer {
    layer: LayerVersion;

    constructor(context: IMttContext, props: MttLayerProps) {
        const layerName = props.id ?? 'StackLayer';
        const layerPath = './cdk.out/temp/' + layerName;
        const installDirectory = layerPath + '/nodejs';

        if (!existsSync(layerPath)) {
            mkdirSync(installDirectory, { recursive: true });
        }

        // Evaluating package and package-lock files for changes
        const packagePath = path.join(props.packageDir, 'package.json');
        const packageLockPath = path.join(props.packageDir, 'package-lock.json');
        const packageUpdated = hasFileUpdated(packagePath, installDirectory);
        const lockUpdated = hasFileUpdated(packageLockPath, installDirectory);
        const nodeModulesDirectory = path.join(installDirectory, 'node_modules');
        logger.debug('Node directory', nodeModulesDirectory);
        const modulesInstalled = !existsSync(nodeModulesDirectory);
        if (packageUpdated || lockUpdated || modulesInstalled) {
            logger.debug('Package eval', packageUpdated, lockUpdated, modulesInstalled);

            // Updating package and package-lock, and installing
            // dependencies.
            const addRelative = installDirectory.replace(/^\.\//, '').split('/').map(x => '..').join('/');

            logger.debug('Reading ', packagePath);
            const pck = require(packagePath);

            const outputPackageJson = path.join(installDirectory, 'package.json');

            logger.debug('fixing paths');
            cleanPackageLock(pck.dependencies, addRelative, packagePath);
            cleanPackageLock(pck.devDependencies, addRelative, packagePath);

            logger.debug('Writing new package.json file');
            writeFileSync(outputPackageJson, JSON.stringify(pck, null, 2));

            logger.debug('Reading ', packageLockPath);
            const lck = require(packageLockPath);
            const outputPackageLock = path.join(installDirectory, 'package-lock.json');
            cleanPackageLock(lck.packages, addRelative, outputPackageLock);
            logger.debug('Writing package-lock.json');
            writeFileSync(outputPackageLock, JSON.stringify(lck, null, 2));

            logger.info('Running npm ci in', path.resolve(installDirectory));
            execSync(`npm ci --omit dev --no-bin-links --ignore-scripts`, { cwd: path.resolve(installDirectory), stdio: 'inherit' });

            const mttModules = ['@mytaptrack/lib', '@mytaptrack/types'];
        }

        // Storing info for last update check
        writeCacheFile(packagePath, false);
        writeCacheFile(packageLockPath, false);

        this.layer = new LayerVersion(context.scope, `layerName`, {
        layerVersionName: `${context.stackName}-${props.id ?? 'StackLayer'}`,
        code: Code.fromAsset(path.join(layerPath, '..'))
    });
(this.layer.node.defaultChild as CfnResource).overrideLogicalId(props.id);
    }
}