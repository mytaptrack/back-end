@echo off
setlocal enabledelayedexpansion

:: Windows command file equivalent of Makefile
:: Usage: build.cmd [target]

if "%1"=="" (
    echo Available targets:
    echo   install         - Full installation and deployment
    echo   install-graphql - Install only GraphQL service
    echo   install-deps    - Install dependencies for all services
    echo   build           - Build all services
    echo   deploy          - Deploy all services
    echo   test            - Run tests
    echo   update-env      - Update environment configurations
    echo   clean           - Clean build artifacts
    echo   env-setup       - Setup environment
    echo   set-env         - Set environment variables
    echo   configure       - Configure environment
    echo   configure-env   - Configure environment settings
    echo   unit_tests      - Run unit tests
    echo   deploy-core     - Deploy core service
    echo   deploy-graphql  - Deploy GraphQL service
    echo   deploy-api      - Deploy API service
    echo   deploy-device   - Deploy device service
    echo   deploy-data-prop - Deploy data propagation service
    echo   uninstall       - Uninstalls all AWS components and data
    exit /b 0
)

:: Process the target
if "%1"=="install" (
    call :install_deps
    call :build
    call :configure_env
    call :set_env
    call :deploy
    exit /b 0
)

if "%1"=="env-setup" (
    call :install_deps
    call :set_env
    exit /b 0
)

if "%1"=="set-env" (
    call :set_env
    exit /b 0
)

:set_env
    echo Setting environment...
    cdk core && npm run setenv
    exit /b 0

if "%1"=="install-deps" (
    call :install_deps
    exit /b 0
)

if "%1"=="build" (
    call :build
    exit /b 0
)

if "%1"=="deploy" (
    call :deploy-core
    call :deploy-data-prop
    call :deploy-graphql
    call :deploy-api
    call :deploy-device
    exit /b 0
)

if "%1"=="deploy-core" (
    call :deploy_core
    exit /b 0
)

if "%1"=="deploy-graphql" (
    call :deploy_graphql
    exit /b 0
)

if "%1"=="deploy-api" (
    call :deploy_api
    exit /b 0
)

if "%1"=="deploy-device" (
    call :deploy_device_api
    exit /b 0
)

if "%1"=="deploy-data-prop" (
    call :deploy_data_prop
    exit /b 0
)

if "%1"=="install-graphql" (
    call :install_graphql
    exit /b 0
)

if "%1"=="update-env" (
    call :update_env
    exit /b 0
)

if "%1"=="configure" (
    call :install_deps
    call :configure_env
    exit /b 0
)

if "%1"=="configure-env" (
    call :configure_env
    exit /b 0
)

if "%1"=="unit_tests" (
    goto :unit_tests
    exit /b 0
)

if "%1"=="test" (
    goto :test
    exit /b 0
)

if "%1"=="clean" (
    goto :clean
    exit /b 0
)

rem Uninstall stacks
if "%1"=="uninstall" (
    goto :uninstall
)

:install_deps
    echo Installing dependencies...
    cd cdk && npm ci && npm run build
    cd ..
    cd lib && npm ci && npm run build
    cd ..
    cd core && npm ci
    cd ..
    cd api && npm ci
    cd ..
    cd data-prop && npm ci
    cd ..
    cd system-tests && npm ci
    cd ..

:build
    echo Building services...
    cd lib && npm run build
    cd ..
    cd core && npm run setenv %STAGE%
    cd ..

:deploy_core
    echo Deploying core service...
    rem cd core && cdk deploy
    rem cd ..

:deploy_graphql
    echo Deploying GraphQL service...
    rem cd api && cdk deploy graphql
    rem cd ..

:deploy_api
    echo Deploying API...
    rem cd api && cdk deploy api
    rem cd ..

:deploy_device_api
    echo Deploying device api...
    rem cd api && cdk deploy device
    rem cd ..

:deploy_data_prop
    echo Deploying data propagation service...
    rem cd data-prop && cdk deploy
    rem cd ..

:install_graphql
    echo Installing GraphQL service...
    cd api && npm i
    cd ..
    cd api && cdk deploy graphql
    cd ..

:update_env
    echo Updating environment configurations...
    cd core && npm i && npm run setenv
    cd ..

:configure_env
    echo Configuring environment...
    cd core && npm run setup-env
    cd ..

:unit_tests
    echo Running unit tests...
    cd lib && npm test
    cd ..
    cd core && npm test
    cd ..
    cd api && npm test
    cd ..
    cd data-prop && npm test
    cd ..

:test
    echo Running system tests...
    cd system-tests && npm run envSetup && npm test
    cd ..

:clean
    echo Cleaning build artifacts...
    cd lib && rmdir /s /q node_modules
    cd ..
    cd core && rmdir /s /q node_modules
    cd ..
    cd api && rmdir /s /q node_modules
    cd ..
    cd data-prop && rmdir /s /q node_modules
    cd ..

:: Delete JS maps and declaration files
for /r %%i in (*.js.map) do del "%%i"
for /r %%i in (*.d.ts) do del "%%i"

:: Delete cdk.out directories
for /d /r . %%d in (cdk.out) do if exist "%%d" rmdir /s /q "%%d"
exit /b 0

:uninstall
    cd data-prop
    cdk destroy
    cd ..
    cd api
    cdk destroy --all
    cd ..
    cd core
    cdk destroy
    cd ..

echo Unknown target: %1
echo Run without arguments to see available targets
exit /b 1
