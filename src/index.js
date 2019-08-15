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

const uploadSwaggerToS3 = async function uploadSwaggerToS3(swagger, bucket, key, acl, region, creds) {
  const s3 = new AWS.S3({
    credentials: creds,
    region,
  })
  const putObjectParams = {
    Body: swagger.body,
    Bucket: bucket,
    Key: key,
  }
  const putObjectAclParams = {
    Bucket: bucket,
    Key: key,
    ACL: acl,
  }
  const deleteObject = {
    Bucket: bucket,
    Key: key,
  }
  await s3.putObject(putObjectParams).promise().then(object => s3.putObjectAcl(putObjectAclParams).promise()
    // eslint-disable-next-line no-unused-vars
    .then(_ => object)
    // eslint-disable-next-line no-unused-vars
    .catch(err => s3.deleteObject(deleteObject).then(_ => Promise.reject(err))))
}

const getBucketKeyAndAcl = function getBucketAndKey(serverless) {
  const bucket = serverless.service.custom.swaggerDestinations.s3BucketName
  const key = serverless.service.custom.swaggerDestinations.s3KeyName
  const acl = serverless.service.custom.swaggerDestinations.acl ? serverless.service.custom.swaggerDestinations.acl : 'private'
  if (!bucket || !key) {
    throw new Error('ExportSwagger: Bucket name and key are required fields')
  }
  return { bucket, key, acl }
};

const exportApi = async function exportApi(serverless) {
  const provider = serverless.getProvider('aws')
  const awsCredentials = provider.getCredentials().credentials
  const region = provider.getRegion()
  const stage = provider.getStage()
  const serviceName = serverless.service.getServiceName()
  const { bucket, key, acl } = getBucketKeyAndAcl(serverless)
  const apiName = await getApiName(serviceName, stage, region, awsCredentials)
  const swagger = await getSwagger(apiName, stage, region, awsCredentials)
  await uploadSwaggerToS3(swagger, bucket, key, acl, region, awsCredentials)
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
