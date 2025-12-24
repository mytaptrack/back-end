#!/bin/sh
set -e

echo "Waiting for DynamoDB..."
until curl -s http://dynamodb-local:8000 > /dev/null 2>&1; do
  sleep 1
done

echo "Waiting for RabbitMQ..."
until curl -s http://rabbitmq:15672 > /dev/null 2>&1; do
  sleep 1
done

echo "Initializing DynamoDB tables..."
npm run container:init-tables

echo "Starting GraphQL server..."
npm run container:start
