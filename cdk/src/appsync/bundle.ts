import * as path from 'path';
import { Code, CodeConfig } from 'aws-cdk-lib/aws-appsync';
import { Construct } from 'constructs';
import { compileTypescript, execOnlyShowErrors, existsSync, folderUpdated, hasFileUpdated, hasFolderUpdated, logger, mkdir, readFileSync, statSync } from '..';
import { getTsconfigCompilerOptions } from '../utils/compile-utils';

interface MttAppsyncBundlingOptions {
  path: string;
}

const buildDir = './cdk.out/temp';

export class MttAppsyncCode extends Code {
  private content: string;
  constructor(private options: MttAppsyncBundlingOptions) {
    super();
  }

  private getContent() {
    logger.info('Processing', this.options.path);
    if(hasFileUpdated(this.options.path, buildDir)) {
      logger.debug('Getting tsconfig.json')

      execOnlyShowErrors(`npx tsc --module esnext --moduleResolution node --rootDir . --outDir ${buildDir} ${this.options.path}`);
      this.content = '';
    }

    if(!this.content) {
      const outputFile = path.resolve(buildDir, this.options.path).replace(/\.ts$/, '.js');
      logger.debug('Reading file', outputFile);
      this.content = readFileSync(outputFile).toString();
      if(!this.content) {
        logger.error('Could not find compiled content');
        throw new Error('Content could not be found');
      }
    }
    return this.content;
  }

  bind(scope: Construct): CodeConfig {
    return {
      inlineCode: this.getContent()
    };
  }
}