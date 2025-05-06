# API Service

## Overview

This repository contains the data storage components as well as the api and processing layers for the mytaptrack solution.

## Prerequisites
- Node.js 16+
- AWS CDK

## Project Structure
| Type | Folder | Description |
|:---:|:---:|:---:|
| NodeJS Module | /cdk | A NodeJS module which centralizes how AWS resources are created |
| NodeJS Module | /lib | A NodeJS module which contains the data access layer and utilities used by the rest of the system |
| AWS Stack | /core | Contains all the core components including databases, event bridge, data lake storage, and cognito user pool |
| AWS Stack | /api | This folder contains the website apis, the graphql apis and the devices apis |
| AWS Stack | /data-prop | This is the compute layer for data propagation through the system |
| Tests | /system-tests | A set of system tests to validate the system's operational capabilities |

## Local Development

### Installation

To install dependencies run the command
```bash
make install
```

To set specific configurations run the command with the **{variable name}**=**{value}**

Example:
```bash
make install STAGE=test
```

### Installation Variables
| Variable Name | Default | Description |
|:---:|:---:|
| STAGE | dev | The environment name which to deploy |
| CONFIG_PATH | ../config | The absolute or project relative path the the configuration directory to use |
| AWS_REGION | Default Region | Overwrites the default region with the one specified |

## Scripts
| Script Name | Description |
|:---:|:---:|
| configure | Creates the basic configuration files for deloying mytaptrack |
| install | Gets dependencies, builds all the projects, and deploys all the code to AWS |
| deploy | Leverages all existing dependencies and projects and deploys the code to AWS |
| test | Builds and executes the system tests against the configured environment |
| clean | Cleans all build directories and artifacts |

## References
- [Configuration Documentation](./config/README.md)
- [Core Components](./core/README.md)
- [API Components](./api/README.md)
- [Data Prop](./data-prop/README.md)
- [Lib](./lib/README.md)
- [System Tests](./lib/README.md)

## License
[Mozilla Public License Version 2.0](./LICENSE)
