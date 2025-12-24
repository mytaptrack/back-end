#!/usr/bin/env node

// Start both GraphQL server and RabbitMQ consumer for local development
import { spawn } from 'child_process';
import { join } from 'path';

const processes: any[] = [];

function startProcess(name: string, script: string, color: string) {
  console.log(`Starting ${name}...`);
  
  const process = spawn('npm', ['run', script], {
    cwd: __dirname,
    stdio: 'pipe'
  });

  process.stdout.on('data', (data) => {
    console.log(`\x1b[${color}m[${name}]\x1b[0m ${data.toString().trim()}`);
  });

  process.stderr.on('data', (data) => {
    console.error(`\x1b[${color}m[${name}]\x1b[0m ${data.toString().trim()}`);
  });

  process.on('close', (code) => {
    console.log(`\x1b[${color}m[${name}]\x1b[0m Process exited with code ${code}`);
  });

  processes.push(process);
  return process;
}

async function start() {
  console.log('Starting MyTapTrack GraphQL API with RabbitMQ consumer...');
  
  // Start GraphQL server
  startProcess('GraphQL', 'graphql:start', '36'); // Cyan
  
  // Wait a bit for GraphQL to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Start RabbitMQ consumer
  startProcess('RabbitMQ', 'rabbitmq:consumer', '33'); // Yellow
  
  console.log('\n✓ All services started');
  console.log('GraphQL API: http://localhost:4000/graphql');
  console.log('Press Ctrl+C to stop all services\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down all services...');
  processes.forEach(p => p.kill('SIGINT'));
  process.exit(0);
});

start().catch(console.error);
