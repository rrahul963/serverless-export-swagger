/**
 * The export swagger function.
 * This function will:
 * 1. get the stack outputs.
 * 2. look for api gateway name.
 * 3. call getExport endpoint to get the swagger.
 * 4. upload the swagger to specified S3 bucket.
 *
 * @param      {Object}  serverless  The serverless
 */
const exportApi = function exportApi(serverless) {
  let apiName = ''
  serverless.getProvider('aws').request(
    'CloudFormation',
    'describeStacks',
    {
      StackName: `${serverless.service.getServiceName()}-${serverless.getProvider('aws').getStage()}`,
    },
    serverless.getProvider('aws').getStage(),
    serverless.getProvider('aws').getRegion(),
  ).then((result) => {
    if (result) {
      const outputs = result.Stacks[0].Outputs
      outputs.forEach((output) => {
        if (output.OutputKey === 'ServiceEndpoint') {
          const [httpApiName] = output.OutputValue.split('.');
          [, apiName] = httpApiName.split('//')
        }
      })
      serverless.getProvider('aws').request(
        'APIGateway',
        'getExport',
        {
          exportType: 'swagger',
          restApiId: apiName,
          stageName: serverless.getProvider('aws').getStage(),
          accepts: 'application/json',
          parameters: {
            extensions: 'integrations',
          },
        },
        serverless.getProvider('aws').getStage(),
        serverless.getProvider('aws').getRegion(),
      ).then((r) => {
        if (r) {
          const settings = serverless.service.custom
          if ('swaggerDestinations' in settings) {
            if (
              's3BucketName' in settings.swaggerDestinations
              && 's3KeyName' in settings.swaggerDestinations
            ) {
              var acl = 'private';
              if ('acl' in settings.swaggerDestinations) {
                acl = settings.swaggerDestinations.acl;
              }
              serverless.getProvider('aws').request(
                'S3',
                'putObject',
                {
                  Body: r.body,
                  Bucket: settings.swaggerDestinations.s3BucketName,
                  Key: settings.swaggerDestinations.s3KeyName,
                  ACL: acl
                },
                serverless.getProvider('aws').getStage(),
                serverless.getProvider('aws').getRegion(),
              ).then((res) => {
                if (res) {
                  serverless.cli.log('File uploded to S3')
                } else {
                  serverless.cli.log('Failed to upload file to S3')
                }
              })
            }
          }
        }
      })
    }
  })
}

/**
 * The class that will be used as serverless plugin.
 */
class ExportSwagger {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.hooks = {
      'after:deploy:deploy': function () {
        exportApi(serverless)
      },
    }
  }
}

module.exports = ExportSwagger
