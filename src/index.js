const AWS = require('aws-sdk')

const getApiName = async function getApiName(serviceName, stage, region, creds) {
  const cfn = new AWS.CloudFormation({
    credentials: creds,
    region,
  })
  let apiName = ''
  const stack = await cfn.describeStacks({
    StackName: `${serviceName}-${stage}`,
  }).promise()
  if (stack) {
    const outputs = stack.Stacks[0].Outputs
    outputs.forEach((output) => {
      if (output.OutputKey === 'ServiceEndpoint') {
        const [httpApiName] = output.OutputValue.split('.');
        [, apiName] = httpApiName.split('//')
      }
    })
  }
  return apiName
}

const getSwagger = async function getSwagger(apiName, stage, region, creds) {
  const ag = new AWS.APIGateway({
    credentials: creds,
    region,
  })
  const swagger = await ag.getExport({
    exportType: 'swagger',
    restApiId: apiName,
    stageName: stage,
    accepts: 'application/json',
    parameters: {
      extensions: 'integrations',
    },
  }).promise()
  return swagger
}

const uploadSwaggerToS3 = async function uploadSwaggerToS3(swagger, bucket, key, region, creds) {
  const s3 = new AWS.S3({
    credentials: creds,
    region,
  })
  await s3.putObject({
    Body: swagger.body,
    Bucket: bucket,
    Key: key,
  }).promise()
}

const getBucketAndKey = function getBucketAndKey(serverless) {
  const bucket = serverless.service.custom.swaggerDestinations.s3BucketName
  const key = serverless.service.custom.swaggerDestinations.s3KeyName
  if (!bucket || !key) {
    throw new Error('ExportSwagger: Bucket name and key are required fields')
  }
  return { bucket, key }
};

const exportApi = async function exportApi(serverless) {
  const provider = serverless.getProvider('aws')
  const awsCredentials = provider.getCredentials().credentials
  const region = provider.getRegion()
  const stage = provider.getStage()
  const serviceName = serverless.service.getServiceName()
  const { bucket, key } = getBucketAndKey(serverless)
  const apiName = await getApiName(serviceName, stage, region, awsCredentials)
  const swagger = await getSwagger(apiName, stage, region, awsCredentials)
  serverless.cli.log('ExportSwagger: File upload to s3...')
  await uploadSwaggerToS3(swagger, bucket, key, region, awsCredentials)
  serverless.cli.consoleLog('ExportSwagger: File uploaded to s3.')
}

/**
 * The class that will be used as serverless plugin.
 */
class ExportSwagger {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.hooks = {
      'after:deploy:deploy': async function () {
        await exportApi(serverless)
      },
    }
  }
}

module.exports = ExportSwagger
