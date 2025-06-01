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
    goto :exit
)

:: Process the target
if "%1"=="install" (
    call :install_deps
    call :build
    call :configure_env
    call :SET_ENV
    call :deploy
    goto :exit
)

if "%1"=="env-setup" (
    call :install_deps
    call :SET_ENV
    goto :exit
)

if "%1"=="set-env" (
    call :SET_ENV
    goto :exit
)

if "%1"=="install-deps" (
    call :install_deps
    goto :exit
)

if "%1"=="build" (
    call :build
    goto :exit
)

if "%1"=="deploy" (
    call :install_deps
    call :DEPLOY_CORE
    call :deploy_data_prop
    call :DEPLOY_GRAPHQL
    call :deploy_api
    call :deploy_device_api
    goto :exit
)

if "%1"=="deploy-core" (
    call :DEPLOY_CORE
    goto :exit
)

if "%1"=="deploy-graphql" (
    call :DEPLOY_GRAPHQL
    goto :exit
)

if "%1"=="deploy-api" (
    call :DEPLOY_API
    goto :exit
)

if "%1"=="deploy-device" (
    call :deploy_device_api
    goto :exit
)

if "%1"=="deploy-data-prop" (
    call :deploy_data_prop
    goto :exit
)

if "%1"=="install-graphql" (
    call :install_graphql
    goto :exit
)

if "%1"=="update-env" (
    call :update_env
    goto :exit
)

if "%1"=="configure" (
    call :install_deps
    call :configure_env
    goto :exit
)

if "%1"=="configure-env" (
    call :configure_env
    goto :exit
)

if "%1"=="unit_tests" (
    goto :unit_tests
    goto :exit
)

if "%1"=="test" (
    goto :test
    goto :exit
)

if "%1"=="clean" (
    goto :clean
    goto :exit
)

rem Uninstall stacks
if "%1"=="uninstall" (
    goto :uninstall
    goto :exit
)

echo Unknown target: %1
echo Run without arguments to see available targets
goto :exit

:SET_ENV
    echo Setting environment...
    cd utils
    call npm ci
    call npm run set-env %STAGE%
    EXIT /B

:install_deps
    echo Installing dependencies...
    cd cdk
    call npm ci
    call npm run build
    cd ..
    cd lib
    call npm ci
    call npm run build
    cd ..
    cd core
    call npm ci
    cd ..
    cd api
    call npm ci
    cd ..
    cd data-prop
    call npm ci
    cd ..
    cd system-tests
    call npm ci
    cd ..
    EXIT /B

:build
    echo Building services...
    cd lib
    call npm run build
    cd ..
    cd utils
    call npm run set-env %STAGE%
    cd ..
    EXIT /B

:DEPLOY_CORE
    echo Deploying core service...
    REM cd core
    cd core
    call cdk deploy
    cd ..
    EXIT /B

:DEPLOY_GRAPHQL
    echo Deploying GraphQL service...
    cd api
    call cdk deploy graphql
    cd ..
    EXIT /B

:DEPLOY_API
    echo Deploying API...
    cd api
    call cdk deploy api
    cd ..
    EXIT /B

:deploy_device_api
    echo Deploying device api...
    cd api
    call npm ci
    call cdk deploy device
    cd ..
    EXIT /B

:deploy_data_prop
    echo Deploying data propagation service...
    cd data-prop
    call npm ci
    call cdk deploy
    cd ..
    EXIT /B

:install_graphql
    echo Installing GraphQL service...
    cd api
    call cdk deploy graphql
    cd ..
    EXIT /B

:update_env
    echo Updating environment configurations...
    cd core
    call npm ci
    call npm run set-env %STAGE%
    cd ..
    EXIT /B

:configure_env
    echo Configuring environment...
    cd utils
    call npm ci
    call npm run setup-env
    cd ..
    EXIT /B

:unit_tests
    echo Running unit tests...
    cd lib
    call npm test
    cd ..
    cd core
    call npm test
    cd ..
    cd api
    call npm test
    cd ..
    cd data-prop
    call npm test
    cd ..
    EXIT /B

:test
    echo Running system tests...
    cd system-tests
    call npm run envSetup
    call npm test
    cd ..
    EXIT /B

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
    EXIT /B

:uninstall
    cd data-prop
    npx cdk destroy
    cd ..
    cd api
    npx cdk destroy --all
    cd ..
    cd core
    npx cdk destroy
    cd ..
    EXIT /B

:exit
   echo "Process complete"
