import { SchemaProps, ISchema, IGraphqlApi, SchemaBindOptions, ISchemaConfig } from "aws-cdk-lib/aws-appsync";
import { readFileSync, existsSync, logger } from '..';
import { join, resolve } from 'path';

export class AppsyncSchema implements ISchema {
    constructor(private options: SchemaProps) {
    }

    bind(api: IGraphqlApi, _options?: SchemaBindOptions): ISchemaConfig {
        const definition =  this.loadSchema(this.options.filePath);

        return {
            apiId: api.apiId,
            definition
        };
    }

    loadSchema(schemaPath: string, paths: string[] = []) {
        let content = '';
        if(existsSync(schemaPath)) {
            content = readFileSync(schemaPath).toString();
        } else {
            logger.error('Could not find schema file', schemaPath);
            logger.debug(resolve(schemaPath));
            throw new Error('Could not file schema file');
        }
        
        const imports = content.match(/\#include +\".*\"/g);
        logger.info("Checking includes", imports);
        if(imports) {
            imports.forEach(imp => {
                logger.info("Resolving import", imp);
                const importPath = join(schemaPath, '..', imp.match(/#include +\"(.*)\"/)[1]);
                logger.info('Include path', importPath);
                if(!existsSync(importPath)) {
                    logger.error('Could not find import file', importPath);
                    return;
                }
                const subContent = this.loadSchema(importPath);
                content = content.replace(imp, subContent);
                paths.push(importPath);
            });
        }
        return content
    }
}