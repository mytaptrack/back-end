import * as path from 'path';
import { Code, CodeConfig, ResourceBindOptions } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { 
    compileTypescript, execOnlyShowErrors, existsSync, folderUpdated, 
    hasFileUpdated, 
    hasFolderUpdated, 
    logger, mkdir, readFileSync, readdirSync, statSync 
} from '.';
import { getTsconfigCompilerOptions } from './utils/compile-utils';
import { CfnResource } from 'aws-cdk-lib';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';

export interface MttLambdaBundlingOptions {
  path: string;
}

const buildDir = './cdk.out/temp';

export class MttLambdaCode extends Code {
  private updated = true;
  private asset: Asset;
  private outputDirectory: string;

  constructor(private options: MttLambdaBundlingOptions) {
    super();
  }

  private getContent() {
    logger.info('Processing: ' + this.options.path);
    logger.debug('MttLambdaCode');
    const outputDirectory = path.resolve(buildDir, this.options.path).replace(/\.ts$/, '.js');
    this.outputDirectory = outputDirectory;
    logger.debug('Output target: ', outputDirectory);
    const sourceDir = path.join('..', this.options.path);
    
    if(hasFolderUpdated(sourceDir, buildDir)) {
      logger.debug('Getting tsconfig.json')
      const compilerOptions = getTsconfigCompilerOptions('../tsconfig.json');
      mkdir(outputDirectory);
      const files = readdirSync(sourceDir, true);
      logger.debug('compile files:', files, process.cwd());
      // Generate fileParams from the files with a space between each file name/path
      const fileParam = files.map(f => path.join(f.parentPath.slice(1), f.name)).join(' ');
      execOnlyShowErrors(`npx tsc ${compilerOptions} --outDir ${path.resolve(buildDir)} --rootDir . ${fileParam}`, { cwd: path.resolve('..')});
      this.updated = true;
    }
  }

  bindToResource(_resource: CfnResource, _options?: ResourceBindOptions) {
  }

  bind(scope: Construct): CodeConfig {
    this.getContent();
    if(!this.asset) {
      this.asset = new Asset(scope, 'Code', {
        path: this.outputDirectory,
        deployTime: true,
      });
    }
    return {
      s3Location: {
          bucketName: this.asset.s3BucketName,
          objectKey: this.asset.s3ObjectKey
      }
    };
  }
}