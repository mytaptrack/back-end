# Configuration

These files contain the configurations for the mytaptrack environments. Configurations have an inheritance approach which allows for a base level configuration which can be overwritten by environment specific and region specific configurations.

File Inheritance:
1. config.yml
2. **{environment}**.yml
3. **{environment}**.**{aws region}**.yml

## Sections
Configurations are broken into three sections:
- Environment Specific
- Global
- Calculated

These three configurations work together in order to ensure the program is fully configured and help resolve circular decencies between components.

These configurations exist in the configuration folder, as well as in the AWS Parameter Store.

# Global configuration
```bash
config.yml
```
This configuration file contains the global configurations which will be overwritten by the environment specific configurations.

### Environment Specific
```bash
dev.yml
test.yml
prod.yml
```

Environment specific configurations operate under a standard root node in the yml file named **env**. This makes it possible to compare different configuration files without the need to resolve expected differences. When the values are written to the AWS Parameter Store, it will be written with the environment name as the replacement for **env**.

### Region Specific
```bash
dev.us-west-2.yml
```

This configuration overwrites all other configurations provided. It allows region specific configurations to be applied.
