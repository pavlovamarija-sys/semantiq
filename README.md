# SemantIQ

### AI-Powered Translation & Language Workflow Platform

**SemantIQ** is a modern translation management platform that combines artificial intelligence, human expertise, terminology management, document processing, and collaborative workflows in one environment.

Designed for professional translators, translation agencies, language service providers, and organizations managing multilingual content, SemantIQ helps streamline complex translation processes while maintaining consistency, quality, and human control.

> **AI assists. The translator has the final word.**

## About the Platform

Professional translation involves much more than converting text between languages. It requires consistent terminology, accurate interpretation of context, careful document handling, collaboration, and quality assurance.

SemantIQ brings these processes together in a unified workspace.

Rather than replacing professional translators, the platform uses AI to support their work, reduce repetitive tasks, and make relevant linguistic knowledge more accessible.

Its underlying principle is **human-in-the-loop translation**: AI provides assistance, while translators review, refine, and approve the final output.

## Key Features

### AI-Assisted Translation

- AI-supported translation of professional documents.
- Context-aware translation workflows.
- Integration of terminology and reference materials.
- Human review and refinement of AI-generated translations.
- Support for consistency across documents and projects.

### Translation Project Management

- Create and organize translation projects.
- Manage source documents and associated resources.
- Track project progress, activity, and deadlines.
- Maintain structured relationships between projects, documents, and translators.

### Document Processing

- Upload and manage translation documents.
- Convert PDF documents into editable DOCX files.
- Reconstruct document layouts, tables, headings, and other structural elements where possible.
- Prepare complex documents for translation and editing.

### Terminology Management

- Create and maintain centralized terminology resources.
- Organize terms and reference sources.
- Support consistent terminology across projects.
- Make terminology available to AI-assisted translation workflows.

### Knowledge Base

- Organize linguistic and domain-specific reference materials.
- Maintain reusable translation knowledge.
- Support contextual information retrieval.
- Build institutional knowledge that can be reused across projects.

### Translator Management

- Maintain translator profiles and contact information.
- Manage language combinations.
- Record translation rates.
- Calculate net rates using configurable tax settings.
- Support translator communication and administrative workflows.

### Workspace and Collaboration

- Centralize translation-related documents and resources.
- Support structured translation and review workflows.
- Organize work across projects and translators.
- Provide a foundation for collaborative translation processes.

### Authentication and Data Security

- Supabase authentication and password recovery.
- Secure user sessions.
- User-scoped project and document access.
- PostgreSQL Row Level Security (RLS).

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS |
| Backend | Next.js server-side functionality |
| Database | PostgreSQL |
| Authentication | Supabase Auth |
| File Storage | Supabase Storage |
| Security | Row Level Security |
| AI Integration | Large Language Models (LLMs) |
| Development | Git, GitHub, VS Code |

## Platform Architecture

SemantIQ follows a modular architecture with separate components for:

- **User Interface:** Dashboard, translation workspace, documents, terminology, and translator management.
- **Application Logic:** Project operations, validation, and workflow orchestration.
- **Data Management:** PostgreSQL database with structured relationships.
- **Document Storage:** Secure storage of source files and generated artifacts.
- **AI Services:** Translation assistance and context-aware processing.
- **Document Processing:** Conversion and reconstruction of uploaded documents.

The architecture is designed to support future expansion into additional languages, specialized translation domains, and advanced AI workflows.

## Getting Started

### Prerequisites

- Node.js and npm
- Git
- A configured Supabase project
- Required environment variables

### Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/semantiq.git
cd semantiq
```

Install dependencies:

```bash
npm install
```

Configure your local environment variables and start the development server:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

**Security:** Never commit passwords, API keys, service-role credentials, or local environment files.

## Development Roadmap

Planned improvements include:

- Translation Memory (TM) integration.
- Semantic search across approved translations.
- AI-assisted terminology extraction.
- Automated translation quality assurance.
- Document-level consistency checks.
- Advanced translation review and approval workflows.
- Improved translator collaboration and task assignment.
- Support for additional language pairs.
- Integration with external translation tools and services.
- Domain-specific AI adaptation and fine-tuning using validated translation datasets.
- Translation quality evaluation and performance analytics.

## Potential Use Cases

SemantIQ is designed to support translation workflows across different industries and content types, including:

- Legal and regulatory documentation.
- Technical documentation.
- Business and corporate communication.
- Financial and administrative documents.
- Institutional and public-sector content.
- Specialized professional translation projects.

## Project Status

**Under active development**

SemantIQ is an evolving software platform. Core application modules are being developed, tested, and expanded incrementally.

The long-term goal is to build a comprehensive AI-assisted translation environment that connects language technology with professional translation expertise.

## Language Support

The initial implementation focuses on English-to-Macedonian translation, with a Macedonian-language user interface.

The platform is intended to support additional language pairs in future development.

## License

**Proprietary — All rights reserved.**

The source code is not licensed for public use, modification, distribution, or commercial exploitation without explicit permission from the repository owner.
