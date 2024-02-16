# lambda-api-utils

This library contains the utilities for use with the [Lambda-Api](https://www.npmjs.com/package/lambda-api) to create rest endpoints in BFF services.

## Middleware

- Debug Logger
- Error Handling
- Serializer
- CORS
- forRole
- forOrganization

## JWT

- getClaims
- getUsername
- getUserGroups

## Connectors

- DynamoDB
- S3

## Mapper

A very simple read mapper for the DynamoDB Single Table pattern.
- Hide internal fields like pk and sk.
- Create an aggreate json object out of many rows

## Encryption

- encrypt
- decrypt (integrated with mapper)

## Examples

- see test cases

## Related Projects

- [aws-lambda-stream](https://www.npmjs.com/package/aws-lambda-stream)
- [aws-kms-ee](https://www.npmjs.com/package/aws-kms-ee)
