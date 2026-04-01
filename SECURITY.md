# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| < main  | :x:                |

Only the `main` branch is actively supported with security updates. Please ensure you are running the latest version.

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Use GitHub Private Security Advisories**: Please submit vulnerability reports via [GitHub Security Advisories](https://github.com/OWNER/REPO/security/advisories/new) rather than public issues.

### What to Include

When reporting a vulnerability, please provide:

- **Description**: Clear description of the vulnerability
- **Affected Components**: Specific files, modules, or services impacted
- **Reproduction Steps**: Step-by-step instructions to reproduce the issue
- **Impact Assessment**: Potential security implications
- **Suggested Fix**: If you have recommendations for remediation

### Response Process

1. **Acknowledgment**: We will acknowledge receipt within 48 hours
2. **Assessment**: We will evaluate severity and impact within 5 business days
3. **Fix Development**: We will work on a fix for confirmed vulnerabilities
4. **Disclosure**: Coordinated disclosure timeline will be agreed upon with the reporter

## Scope

The following components are in scope for security reporting:

### Infrastructure & Platform

- Cloudflare Workers runtime and execution environment
- KV storage access patterns and data handling
- Webhook endpoints and payload processing

### Application Components

- 9-agent pipeline orchestration system
- Deal discovery and extraction agents
- Data processing and validation workers
- API endpoints and authentication flows

### Data Handling

- Deal data storage and transmission
- Source API integrations (ProductHunt, GitHub, Hacker News, RSS feeds)
- Inter-agent communication protocols
- Temporary state files and handoff data

### Out of Scope

- Third-party dependencies (report to respective projects)
- Infrastructure outside Cloudflare Workers platform
- Social engineering attacks

## Security Best Practices

This project follows these security principles:

- No secrets in code or environment variables in repository
- All bindings managed through Wrangler configuration
- Input validation on all external data sources
- Rate limiting on webhook and API endpoints
- Minimal privilege principle for storage access
