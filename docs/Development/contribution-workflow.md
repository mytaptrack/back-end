# Contribution Workflow

This document outlines the Git workflow, branch naming conventions, pull request procedures, and testing requirements for contributing to MyTapTrack.

## Git Workflow

### Branching Strategy

We use a **Git Flow** inspired branching strategy with the following branches:

#### Main Branches
- **`main`**: Production-ready code, always deployable
- **`develop`**: Integration branch for features, represents the latest development state

#### Supporting Branches
- **`feature/*`**: New features and enhancements
- **`bugfix/*`**: Bug fixes for development branch
- **`hotfix/*`**: Critical fixes for production
- **`release/*`**: Preparation for production releases

### Branch Naming Conventions

#### Feature Branches
```
feature/[ticket-number]-[short-description]
feature/MTT-123-user-authentication
feature/MTT-456-device-data-export
feature/add-graphql-subscriptions
```

#### Bug Fix Branches
```
bugfix/[ticket-number]-[short-description]
bugfix/MTT-789-login-error-handling
bugfix/MTT-101-device-sync-timeout
bugfix/fix-memory-leak-lambda
```

#### Hotfix Branches
```
hotfix/[ticket-number]-[short-description]
hotfix/MTT-999-critical-security-patch
hotfix/MTT-888-database-connection-fix
```

#### Release Branches
```
release/[version]
release/1.2.0
release/2.0.0-beta.1
```

## Development Workflow

### 1. Starting New Work

#### For Features
```bash
# Start from develop branch
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/MTT-123-user-authentication

# Push branch to remote
git push -u origin feature/MTT-123-user-authentication
```

#### For Bug Fixes
```bash
# Start from develop branch (or main for hotfixes)
git checkout develop
git pull origin develop

# Create bugfix branch
git checkout -b bugfix/MTT-456-login-error-handling

# Push branch to remote
git push -u origin bugfix/MTT-456-login-error-handling
```

### 2. Development Process

#### Making Changes
```bash
# Make your changes
# Edit files, add features, fix bugs

# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat: implement user authentication with Cognito

- Add Cognito user pool configuration
- Implement login/logout functionality
- Add JWT token validation middleware
- Update API endpoints to require authentication

Closes MTT-123"
```

#### Commit Message Format
Follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(auth): add Cognito user authentication
fix(api): resolve timeout issue in device sync
docs(readme): update installation instructions
test(user): add unit tests for user service
refactor(lambda): optimize cold start performance
chore(deps): update AWS SDK to latest version
```

#### Keeping Branch Updated
```bash
# Regularly sync with develop
git checkout develop
git pull origin develop
git checkout feature/MTT-123-user-authentication
git merge develop

# Or use rebase for cleaner history
git rebase develop
```

### 3. Testing Requirements

#### Before Committing
```bash
# Run linting
npm run lint

# Run type checking
npm run type-check

# Run unit tests
npm run test

# Run integration tests
npm run test:integration

# Build all projects
make build
```

#### Automated Testing
All branches must pass:
- ESLint and Prettier checks
- TypeScript compilation
- Unit tests with minimum 80% coverage
- Integration tests
- Security scans

### 4. Pull Request Process

#### Creating Pull Request

1. **Push your branch**:
```bash
git push origin feature/MTT-123-user-authentication
```

2. **Create PR via GitHub/GitLab**:
   - Navigate to repository
   - Click "New Pull Request"
   - Select your branch as source, `develop` as target
   - Fill out PR template

#### Pull Request Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Related Issues
Closes #123
Related to #456

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] New tests added for new functionality

## Checklist
- [ ] Code follows project coding standards
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No hardcoded secrets or credentials
- [ ] Error handling implemented
- [ ] Logging added where appropriate
- [ ] Performance considerations addressed

## Screenshots (if applicable)
Add screenshots or GIFs demonstrating the changes.

## Additional Notes
Any additional information reviewers should know.
```

#### PR Requirements

**Before Creating PR:**
- [ ] All tests pass locally
- [ ] Code follows coding standards
- [ ] Documentation updated
- [ ] Self-review completed
- [ ] Branch is up to date with target branch

**PR Must Include:**
- [ ] Clear description of changes
- [ ] Link to related issues/tickets
- [ ] Test coverage for new functionality
- [ ] Updated documentation if needed
- [ ] Screenshots/demos for UI changes

### 5. Code Review Process

#### Review Guidelines

**For Authors:**
- Provide clear PR description
- Respond to feedback promptly
- Make requested changes in new commits
- Squash commits before merging (if requested)

**For Reviewers:**
- Review within 24 hours
- Provide constructive feedback
- Test changes locally if needed
- Approve only when satisfied with quality

#### Review Checklist

**Code Quality:**
- [ ] Code is readable and well-structured
- [ ] Follows established patterns and conventions
- [ ] No code duplication
- [ ] Appropriate error handling
- [ ] Proper logging implemented

**Functionality:**
- [ ] Changes work as described
- [ ] Edge cases considered
- [ ] No breaking changes (unless intentional)
- [ ] Performance implications considered

**Testing:**
- [ ] Adequate test coverage
- [ ] Tests are meaningful and comprehensive
- [ ] All tests pass
- [ ] Manual testing completed

**Security:**
- [ ] No hardcoded secrets
- [ ] Input validation implemented
- [ ] Authentication/authorization proper
- [ ] No security vulnerabilities introduced

**Documentation:**
- [ ] Code is self-documenting
- [ ] Complex logic explained
- [ ] API documentation updated
- [ ] README updated if needed

### 6. Merging Process

#### Merge Requirements
- [ ] At least one approval from team member
- [ ] All CI checks pass
- [ ] Branch is up to date with target
- [ ] No merge conflicts
- [ ] All conversations resolved

#### Merge Strategies

**Feature Branches → Develop:**
- Use "Squash and Merge" for clean history
- Ensure commit message follows conventions
- Delete feature branch after merge

**Develop → Main (Release):**
- Use "Merge Commit" to preserve history
- Create release tag
- Update changelog

**Hotfixes → Main:**
- Use "Merge Commit"
- Also merge back to develop
- Create patch release tag

#### Post-Merge Actions
```bash
# After merge, clean up local branches
git checkout develop
git pull origin develop
git branch -d feature/MTT-123-user-authentication

# Clean up remote tracking branches
git remote prune origin
```

## Release Process

### 1. Preparing Release

#### Create Release Branch
```bash
# From develop branch
git checkout develop
git pull origin develop
git checkout -b release/1.2.0
```

#### Update Version Numbers
```bash
# Update package.json versions
npm version minor  # or major/patch

# Update changelog
# Update documentation
# Final testing
```

#### Release Testing
- Deploy to staging environment
- Run full test suite
- Perform manual testing
- Security scan
- Performance testing

### 2. Release Deployment

#### Merge to Main
```bash
# Create PR from release/1.2.0 to main
# After approval and merge:
git checkout main
git pull origin main
git tag -a v1.2.0 -m "Release version 1.2.0"
git push origin v1.2.0
```

#### Deploy to Production
```bash
# Deploy using CI/CD pipeline
# Monitor deployment
# Verify functionality
```

#### Merge Back to Develop
```bash
# Merge main back to develop
git checkout develop
git merge main
git push origin develop
```

## Hotfix Process

### 1. Create Hotfix
```bash
# From main branch
git checkout main
git pull origin main
git checkout -b hotfix/MTT-999-critical-security-patch
```

### 2. Fix and Test
```bash
# Make necessary changes
# Test thoroughly
# Update version (patch)
```

### 3. Deploy Hotfix
```bash
# Create PR to main
# After approval, merge and tag
git checkout main
git pull origin main
git tag -a v1.2.1 -m "Hotfix version 1.2.1"
git push origin v1.2.1

# Deploy to production immediately
# Merge back to develop
git checkout develop
git merge main
git push origin develop
```

## Testing Procedures

### Unit Testing

#### Test Structure
```typescript
// user-service.test.ts
describe('UserService', () => {
  let userService: UserService;
  let mockRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    mockRepository = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };
    userService = new UserService(mockRepository);
  });

  describe('createUser', () => {
    it('should create user with valid data', async () => {
      // Arrange
      const userData = { email: 'test@example.com', name: 'Test User' };
      const expectedUser = { id: '123', ...userData };
      mockRepository.create.mockResolvedValue(expectedUser);

      // Act
      const result = await userService.createUser(userData);

      // Assert
      expect(result).toEqual(expectedUser);
      expect(mockRepository.create).toHaveBeenCalledWith(userData);
    });

    it('should throw error for invalid email', async () => {
      // Arrange
      const userData = { email: 'invalid-email', name: 'Test User' };

      // Act & Assert
      await expect(userService.createUser(userData)).rejects.toThrow('Invalid email');
    });
  });
});
```

#### Running Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test user-service.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="createUser"
```

### Integration Testing

#### API Testing
```typescript
// user-api.integration.test.ts
describe('User API Integration', () => {
  beforeAll(async () => {
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestData();
  });

  it('should create and retrieve user', async () => {
    // Create user
    const createResponse = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', name: 'Test User' })
      .expect(201);

    const userId = createResponse.body.id;

    // Retrieve user
    const getResponse = await request(app)
      .get(`/api/users/${userId}`)
      .expect(200);

    expect(getResponse.body.email).toBe('test@example.com');
  });
});
```

### End-to-End Testing

#### System Tests
```bash
# Run system tests against deployed environment
cd system-tests/
npm run test:dev     # Test against dev environment
npm run test:staging # Test against staging environment
```

### Test Coverage Requirements

- **Unit Tests**: Minimum 80% code coverage
- **Integration Tests**: All API endpoints covered
- **Critical Paths**: 100% coverage for critical business logic
- **Error Scenarios**: All error conditions tested

## Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '16'
        cache: 'npm'
    
    - name: Install dependencies
      run: make install-deps
    
    - name: Lint
      run: npm run lint
    
    - name: Type check
      run: npm run type-check
    
    - name: Build
      run: make build
    
    - name: Test
      run: npm run test:coverage
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
```

### Quality Gates

All PRs must pass:
- [ ] Linting (ESLint)
- [ ] Type checking (TypeScript)
- [ ] Unit tests (80% coverage minimum)
- [ ] Integration tests
- [ ] Security scan
- [ ] Build success

## Environment Management

### Development Environments

#### Local Development
```bash
# Set up local environment
make set-env STAGE=dev
make deploy
```

#### Feature Branch Testing
```bash
# Deploy feature branch to isolated environment
make set-env STAGE=feature-MTT-123
make deploy
```

#### Staging Environment
- Automatic deployment from `develop` branch
- Used for integration testing
- Mirrors production configuration

#### Production Environment
- Manual deployment from `main` branch
- Requires approval process
- Monitored and alerted

### Configuration Management

#### Environment Variables
```bash
# Development
STAGE=dev
NODE_ENV=development
LOG_LEVEL=debug

# Staging
STAGE=staging
NODE_ENV=production
LOG_LEVEL=info

# Production
STAGE=prod
NODE_ENV=production
LOG_LEVEL=warn
```

## Troubleshooting Common Issues

### Git Issues

#### Merge Conflicts
```bash
# When conflicts occur during merge/rebase
git status  # See conflicted files
# Edit files to resolve conflicts
git add .
git commit  # Complete merge
# Or: git rebase --continue  # Continue rebase
```

#### Accidentally Committed to Wrong Branch
```bash
# Move commits to correct branch
git log --oneline -n 5  # Find commit hashes
git checkout correct-branch
git cherry-pick <commit-hash>
git checkout wrong-branch
git reset --hard HEAD~1  # Remove commit from wrong branch
```

#### Need to Update PR After Review
```bash
# Make changes based on review
# Commit changes
git add .
git commit -m "address review comments"
git push origin feature/branch-name
# PR will automatically update
```

### Testing Issues

#### Tests Failing Locally
```bash
# Clear cache and reinstall
npm run clean
npm install
npm run build
npm test
```

#### Coverage Below Threshold
```bash
# Check coverage report
npm run test:coverage
open coverage/lcov-report/index.html
# Add tests for uncovered code
```

### Build Issues

#### TypeScript Errors
```bash
# Check specific errors
npm run type-check
# Fix type issues
# Rebuild
npm run build
```

#### Dependency Issues
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
make build
```

## Best Practices Summary

### Git Best Practices
1. **Commit Often**: Make small, focused commits
2. **Clear Messages**: Use conventional commit format
3. **Stay Updated**: Regularly sync with develop branch
4. **Clean History**: Squash commits before merging
5. **Branch Naming**: Use descriptive, consistent names

### Code Review Best Practices
1. **Review Promptly**: Respond within 24 hours
2. **Be Constructive**: Provide helpful feedback
3. **Test Changes**: Verify functionality locally
4. **Check Everything**: Code, tests, documentation
5. **Approve Carefully**: Only when truly satisfied

### Testing Best Practices
1. **Test First**: Write tests before or with code
2. **Cover Edge Cases**: Test error conditions
3. **Keep Tests Fast**: Unit tests should run quickly
4. **Isolate Tests**: Each test should be independent
5. **Meaningful Names**: Test names should describe behavior

### Documentation Best Practices
1. **Keep Updated**: Update docs with code changes
2. **Be Clear**: Write for your future self
3. **Include Examples**: Show how to use features
4. **Document Decisions**: Explain why, not just what
5. **Review Regularly**: Ensure accuracy over time