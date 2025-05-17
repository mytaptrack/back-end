import { DescribeParametersCommand, DeleteParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

async function deleteEnvironment(env: string) {
    const ssm = new SSMClient();
    let token;

    do {
        const params = await ssm.send(new DescribeParametersCommand({
            ParameterFilters: [{
                Key: 'Name',
                Option: 'BeginsWith',
                Values: [`/${env}/`]
            }],
            NextToken: token
        }));
        token = params.NextToken;

        console.log('Params', params);

        if(params.Parameters?.filter(x => x.Name)?.length > 0) {
            await ssm.send(new DeleteParametersCommand({
                Names: params.Parameters.filter(x => x.Name).map(x => x.Name)
            }));
        }
    } while (token);
}

if(process.argv.length < 3) {
    console.log("Usage: npm del-env <environment>");
    process.exit(1);
}

deleteEnvironment(process.argv[2]);
