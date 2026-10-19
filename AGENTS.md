# EU Acquis AI Translation Platform — Codex Guidelines

## 1. Product Mission

Build a professional AI-assisted translation platform specialised initially in the translation of the **EU Acquis**.

This is NOT a generic AI translator.

The platform is intended for professional translators, reviewers, legal linguists, public administrations, ministries, EU-integration bodies, and organisations translating EU legislation and related legal documents.

The system must optimise for:

1. legal accuracy
2. terminology consistency
3. consistency with existing EU legislation
4. structural fidelity
5. traceability
6. reviewer control
7. efficient professional translation workflows

AI assists the translator. It does not replace professional review.

---

## 2. Initial Scope

The first version concentrates exclusively on EU Acquis and EU-related legal translation.

Do NOT prematurely add:

- general-purpose translation
- marketing translation
- literary translation
- casual text translation
- unrelated AI writing tools
- unnecessary document-management features
- features outside the professional legal translation workflow

Design the architecture so additional translation domains can be added later without rewriting the core system.

---

## 3. Core Translation Principle

Translation must NOT be treated as:

source text → LLM → translated text

The intended workflow is:

source document
→ document analysis
→ structural segmentation
→ terminology identification
→ retrieval of relevant EU references
→ retrieval of previously approved translations
→ AI translation
→ terminology/consistency validation
→ human review
→ approved translation
→ reusable translation memory / knowledge

Context retrieval is part of translation generation.

---

## 4. Authoritative Sources

The system should be designed around authoritative linguistic and legal resources.

Priority should generally be:

1. Official EU legal texts / Official Journal
2. EUR-Lex multilingual versions
3. IATE terminology
4. approved organisation-specific terminology
5. approved previous translations
6. translation memory
7. other validated reference material
8. general model knowledge

Never silently substitute model knowledge for available authoritative terminology.

Every retrieved reference should retain provenance.

Where possible store:

- source
- document identifier
- CELEX number
- language
- document title
- document type
- date/version
- URL/reference
- retrieval timestamp
- relevant article/segment
- terminology source
- approval status

---

## 5. Legal Document Structure

Legal structure is data and must not be destroyed during extraction or translation.

Preserve elements such as:

- document title
- preamble
- recitals
- chapters
- titles
- sections
- articles
- paragraphs
- points
- subpoints
- annexes
- tables
- footnotes
- references
- numbering

Never flatten an entire legal document into an unstructured string.

Use stable segment identifiers.

Example:

document
  └── chapter
      └── article
          └── paragraph
              └── segment

Translation, review and validation should operate primarily on segments while retaining surrounding context.

---

## 6. Context-Aware Translation

Never translate legal segments completely in isolation when contextual information exists.

For every translation request, the translation engine should eventually be able to consider:

- current segment
- previous segment
- next segment
- article context
- document title
- document type
- relevant definitions
- terminology matches
- translation-memory matches
- related EUR-Lex passages
- previously approved translations

The exact context strategy may evolve, but the architecture must support it.

---

## 7. Terminology

Terminology consistency is a first-class product requirement.

A terminology entry should be capable of storing:

- source term
- target term
- source language
- target language
- definition
- domain
- subdomain
- source
- reliability/status
- context
- notes
- forbidden/deprecated alternatives
- organisation-specific preference

Do not assume that the most common dictionary translation is the correct legal equivalent.

Terminology decisions must be reusable across the document and future translations.

The application should eventually detect:

- inconsistent terminology
- prohibited terminology
- untranslated terminology
- multiple translations of the same concept
- conflicts between AI output and approved terminology

---

## 8. Translation Memory

Approved human translations are valuable data.

Design translation memory as a core domain concept rather than an afterthought.

A translation-memory unit should be able to contain:

- source segment
- target segment
- language pair
- document
- document type
- legal domain
- approval status
- translator/reviewer information where appropriate
- creation/update timestamp
- similarity metadata

AI-generated translations must NOT automatically become trusted translation-memory entries.

Only approved/finalised translations should be eligible for trusted reuse.

---

## 9. Retrieval / RAG

Use retrieval when authoritative or previously approved information can improve translation quality.

Retrieval should eventually support:

- terminology search
- exact translation-memory matches
- fuzzy translation-memory matches
- semantic retrieval
- EUR-Lex parallel passages
- related legislation
- organisation-specific reference documents

Retrieved context must carry its source.

Do not dump large amounts of unrelated retrieved text into prompts.

Prefer the smallest highly relevant context necessary.

---

## 10. AI Translation

AI calls must be implemented behind a dedicated service abstraction.

Do not scatter direct model/API calls throughout UI components or route handlers.

Preferred conceptual structure:

UI
→ application/service layer
→ translation pipeline
→ retrieval/context layer
→ AI provider

The AI provider must be replaceable.

Do not tightly couple the application to one model unless technically necessary.

Translation prompts should be versioned and centrally managed.

Where appropriate use structured outputs instead of parsing free-form AI responses.

---

## 11. AI Must Not Invent

For legal translation:

- do not invent terminology sources
- do not invent CELEX numbers
- do not invent legal references
- do not invent EUR-Lex matches
- do not claim a term came from IATE unless retrieved from IATE data
- do not claim a translation is official unless verified
- do not fabricate confidence based on no evidence

If authoritative evidence is unavailable, represent that uncertainty explicitly.

---

## 12. Translation Confidence and Evidence

Do not present arbitrary AI confidence percentages.

Prefer evidence-based indicators such as:

- terminology match found
- exact TM match
- fuzzy TM match
- EUR-Lex parallel text found
- approved internal translation found
- no authoritative reference found
- terminology conflict detected

Users should be able to understand WHY a translation or terminology suggestion was made.

---

## 13. Human Review

Human review is a core workflow.

The UI should eventually allow a reviewer to:

- view source and target side by side
- edit translation
- accept/reject AI suggestions
- inspect terminology
- inspect retrieved references
- compare alternative translations
- see consistency warnings
- add reviewer notes
- approve segments
- approve documents

Never design a workflow where AI output becomes final without an explicit review/approval state.

---

## 14. Auditability

Important actions should eventually be traceable.

The data model should allow us to know:

- original source text
- AI-generated translation
- model/provider used
- prompt version
- retrieved references
- terminology used
- human edits
- reviewer
- approval state
- timestamps

Do not overwrite important historical information when an audit trail is required.

---

## 15. Versioning

Legal texts and translations can change.

Design for versioning from the beginning.

Relevant entities may need:

- source document version
- translation version
- terminology version
- prompt version
- model information
- review version

Never assume that a document identifier alone uniquely represents its textual state.

---

## 16. Security and Confidentiality

Assume uploaded documents may be confidential.

Therefore:

- never expose service-role/database secrets to the client
- never expose AI API keys
- validate authentication server-side
- use least-privilege database access
- implement appropriate RLS where applicable
- validate file types and sizes
- sanitise user-controlled input where required
- do not log full confidential document content unnecessarily
- do not send documents to external services unless required by the defined workflow

Security shortcuts are not acceptable merely because the application is an MVP.

---

## 17. Architecture

Prefer clear separation of concerns.

Suggested layers:

### Presentation
Pages, components, editor, review interface.

### Application
Translation workflows and use cases.

### Domain
Documents, segments, terminology, translations, reviews, translation memory.

### Infrastructure
Database, storage, AI providers, EUR-Lex integrations, terminology sources, embeddings.

Avoid putting business logic directly inside React components.

Avoid giant service files.

Prefer small, testable modules with clear responsibilities.

---

## 18. Technology

Initial preferred stack:

- Next.js
- TypeScript
- React
- Tailwind CSS
- Supabase
- PostgreSQL
- pgvector where semantic retrieval is needed
- server-side AI integrations

Use the existing stack unless there is a strong technical reason to introduce another dependency.

Before adding a package:

1. determine whether the existing stack already solves the problem;
2. prefer maintained and widely adopted libraries;
3. avoid unnecessary dependencies.

---

## 19. Database

Use PostgreSQL/Supabase as the source of truth.

Database design should reflect domain entities rather than UI screens.

Likely entities include:

- users
- organisations
- projects
- documents
- document_versions
- document_segments
- translations
- translation_versions
- terminology_entries
- translation_memory_units
- references
- translation_evidence
- review_comments
- approvals
- AI_runs

Do not create all tables prematurely.

Introduce them as functionality requires them while preserving the overall domain model.

Use migrations for schema changes.

Never manually change production schema without a migration.

---

## 20. TypeScript

Use strict TypeScript.

Avoid `any` unless genuinely unavoidable and documented.

Prefer:

- explicit domain types
- Zod validation at external boundaries
- typed database interactions
- typed structured AI responses
- small interfaces

External data must never be trusted merely because TypeScript expects a type.

Validate runtime data.

---

## 21. Error Handling

Do not hide errors.

User-facing errors should be understandable.

Internal errors should provide enough context for debugging without leaking secrets.

Differentiate between:

- user input errors
- document-processing errors
- retrieval errors
- AI-provider errors
- database errors
- authentication/authorization errors

A failed AI call must not corrupt translation state.

---

## 22. Performance

Legal documents can be large.

Do not assume an entire document should be processed in one request.

Prefer:

- segmentation
- batching
- background processing where appropriate
- resumable processing
- explicit processing states

Avoid unnecessary repeated embeddings or AI calls.

Cache deterministic/reusable results where appropriate.

---

## 23. Cost Awareness

AI and embedding calls have cost.

Before making an AI call, consider whether the result:

- already exists
- can be retrieved
- can be cached
- can be computed deterministically
- needs the full context being sent

Do not optimise prematurely, but do not design obviously wasteful pipelines.

---

## 24. Testing

Critical domain logic should be testable independently of the UI.

Prioritise tests for:

- segmentation
- terminology matching
- translation-memory matching
- document parsing
- validation
- permissions
- translation pipeline logic

AI behaviour itself should not be the only thing a test verifies.

Mock provider calls where appropriate.

---

## 25. UI/UX

The product is a professional work environment.

Design should be:

- clean
- restrained
- information-dense where useful
- readable for long working sessions
- keyboard-friendly
- desktop-first initially
- accessible

Avoid a generic chatbot interface as the primary translation experience.

The core translation workspace should eventually resemble a professional CAT/legal translation environment more than a conversational AI app.

---

## 26. UX Priority

When designing a feature, optimise for:

translator speed
+ legal accuracy
+ reviewability
+ transparency

Do not prioritise visual novelty over professional usability.

---

## 27. Codex Working Method

Before implementing a substantial feature:

1. inspect the existing architecture;
2. identify the relevant existing files;
3. understand the current data flow;
4. propose the smallest coherent implementation;
5. reuse existing patterns;
6. implement;
7. validate types/build/tests;
8. report what changed.

Do not rewrite working architecture unnecessarily.

Do not create duplicate utilities or services when an equivalent already exists.

---

## 28. Change Discipline

For every task:

- modify only files necessary for the requested feature
- preserve unrelated working behaviour
- do not perform unsolicited redesigns
- do not rename unrelated files
- do not remove existing functionality without explicit instruction
- avoid broad refactoring unless required

If a requested change conflicts with existing architecture, explain the conflict before performing a large rewrite.

---

## 29. No Fake Functionality

Never create UI elements that imply functionality that does not exist.

Examples:

Do not display:

"98% terminology accuracy"

unless it is genuinely calculated.

Do not display:

"Verified with EUR-Lex"

unless verification actually occurred.

Do not display:

"IATE match"

unless an IATE match was retrieved.

Mock data is acceptable during development only when clearly identified as mock data.

---

## 30. Development Philosophy

Build vertically.

Prefer completing:

upload
→ extraction
→ segmentation
→ translation
→ review
→ approval

for a simple document before building many disconnected features.

Each milestone should produce a usable improvement to the translation workflow.

---

## 31. MVP Principle

The MVP should prove one thing exceptionally well:

**A professional translator can translate an EU legal document faster with AI while retaining control, terminology consistency, legal structure and traceability.**

Features that do not materially contribute to proving this should normally wait.

---

## 32. Initial Language Strategy

Do not hard-code the architecture around a single language pair.

Source and target languages must be explicit data fields.

The first implemented language pair may be limited for development and evaluation, but the underlying system must support additional languages without schema redesign.

---

## 34. MVP Architecture and Initial Workflow

For V1, the application will focus on a complete end-to-end EU Acquis translation workflow.

### Initial Language Pair

The first implemented language pair will be:

- Source: English
- Target: Macedonian

The underlying architecture must remain multilingual.

Do not hard-code English or Macedonian into the domain model, database structure, translation pipeline, or reusable application logic.

Source and target languages must be represented explicitly as data so that additional language pairs can be introduced later without redesigning the core architecture.

### V1 Workflow

The initial end-to-end workflow is:

Upload EU document
→ Extract text and document structure
→ Segment into translation units
→ Retrieve relevant terminology
→ Retrieve relevant EU and previously approved translation context
→ Generate AI translation
→ Run terminology and consistency checks
→ Human review
→ Approve translation
→ Make approved translation available for future reuse

The first objective is to make this complete workflow function reliably before expanding the product with unrelated features.

### Core Translation Workspace

The primary translation workspace should eventually provide:

- source segment
- editable target segment
- surrounding document context
- terminology matches
- translation-memory matches when available
- relevant EU reference material
- AI translation suggestion
- translation evidence and provenance
- validation and consistency warnings
- segment review status
- approval status

The workspace should be designed for professional translators and reviewers rather than as a generic chatbot interface.

### Core Architectural Unit

The document segment is the central working and translation unit of the application.

A segment must retain its relationship to the original legal document and its structural context.

Conceptually:

Project
→ Document
→ Document Version
→ Document Structure
→ Segment
→ Translation
→ Translation Version

A segment may belong to structures such as:

- title
- chapter
- section
- article
- paragraph
- point
- subpoint
- recital
- annex
- table
- heading
- footnote

Do not flatten a legal document into a collection of unrelated text strings.

Every segment must have a stable identifier and sufficient structural information to reconstruct its position within the document.

Translations, AI suggestions, terminology evidence, retrieved references, reviewer changes, and approval states should be associated with stable segment identifiers where appropriate.

### Initial Domain Model

The initial domain should be centred around:

Project
→ Document
→ Document Version
→ Document Segment
→ Translation
→ Translation Version

Supporting translation evidence and terminology may be associated with this workflow.

The responsibilities of these concepts are:

**Project**

Represents a translation assignment and defines its source and target languages.

**Document**

Represents the logical legal or EU-related document being translated.

**Document Version**

Represents a specific textual state of a document. Do not assume that a document identifier alone uniquely identifies its textual content.

**Document Segment**

Represents a stable translation unit while retaining its position and relationship to the legal document structure.

**Translation**

Represents the target-language translation associated with a source segment.

**Translation Version**

Represents a particular state of a translation, allowing AI output, human revisions, and later reviewed versions to remain distinguishable rather than silently overwriting one another.

### Translation Evidence

The architecture should allow a translation or translation version to retain evidence used during generation or validation.

Potential evidence may include:

- IATE terminology
- EUR-Lex parallel text
- official EU legal texts
- approved internal terminology
- previously approved translations
- exact translation-memory matches
- fuzzy translation-memory matches
- related legislation

Evidence must retain provenance.

Do not claim that evidence came from IATE, EUR-Lex, an official EU source, translation memory, or another authoritative resource unless that evidence was actually retrieved from that source.

### Terminology

Terminology is part of the translation workflow rather than an isolated feature.

The architecture should allow terminology entries to contain, where relevant:

- source term
- target term
- source language
- target language
- definition
- domain
- context
- source
- source reference
- status

Terminology decisions should be reusable across segments and documents.

Do not automatically treat an AI-generated term as approved terminology.

### Translation Versioning

Do not overwrite meaningful translation states when they are required for traceability.

The architecture should be capable of distinguishing between:

AI-generated translation
→ translator-edited translation
→ reviewer-edited translation
→ approved translation

The exact versioning implementation may evolve as the review workflow is developed.

Do not build unnecessary versioning complexity before it is required, but do not design the initial data model in a way that makes translation history impossible.

### Approval and Future Reuse

AI-generated translations must not automatically become trusted reusable translations.

Only translations that have passed the required human review or approval state may later become eligible for trusted reuse, including future translation-memory functionality.

Approval must therefore remain distinct from AI generation.

### V1 Development Rule

Do not begin by building a large UI or many isolated screens.

First establish the domain model and end-to-end architecture required for:

document
→ segment
→ translation
→ review
→ approval

Then build the professional translation interface on top of that architecture.

Develop vertically rather than creating many disconnected features.

A small working pipeline is preferable to a large collection of incomplete modules.

### Scope Control

Do not create speculative database entities or infrastructure merely because they may be useful in the future.

In particular, do not initially create full systems for:

- translation memory
- organisations
- teams
- reviewer assignments
- billing
- subscriptions
- notifications
- workflow engines
- CAT-tool integrations
- TMX/TBX import
- large-scale EUR-Lex ingestion
- vector search
- embeddings

These features may be introduced when an implemented use case requires them.

However, do not make architectural decisions that unnecessarily prevent their later addition.

### Architectural Principle

The application must not be designed as:

source text
→ LLM
→ translated text

It must evolve around:

source document
→ structured document
→ translation segment
→ authoritative context and terminology
→ AI-assisted translation
→ validation
→ human review
→ approval
→ trusted reusable knowledge

When implementation simplicity conflicts with preservation of legal structure, terminology provenance, translation traceability, or human reviewer control, preserve those professional translation requirements.

---

## V1 Coordinator Translation Workflow

The primary workflow is document/package based, not segment based.

1. Translation coordinator receives a package containing many CELEX numbers.
2. CELEX numbers are captured by screenshot recognition or manual entry.
3. The app downloads the official EU PDF documents.
4. The coordinator converts PDFs to editable DOCX using the existing PDF→DOCX workflow.
5. The coordinator clicks Translate on a DOCX.
6. The app automatically translates the COMPLETE legal act to MK1:
   - preserve document/legal structure
   - segment internally
   - use document + neighboring context
   - retrieve only trusted approved TM
   - generate with the validated GPT-5.6 legal translation pipeline
   - persist provenance/evidence
   - run deterministic segment and document-level QA
   - detect omissions, additions and legal-anchor inconsistencies
7. Translation is an automatic whole-document operation. The coordinator must not manually generate individual segments.
8. MK1 is AI-generated working translation and is never trusted/approved knowledge.
9. After complete translation and QA, generate for that legal act:
   - Trados Studio project file
   - SDLXLIFF with EN source + MK1 target
   - working EN↔MK1 Translation Memory
10. The translator receives these files and performs professional revision/editing in Trados Studio to produce MK2.

Important:

- The single-segment workspace is supporting/internal functionality, not the primary V1 workflow.
- Internal segmentation remains central technically but should not dictate the coordinator UX.
- Working MK1 TM must remain separate from approved/trusted TM.
- Do not auto-approve AI output.
- MK2 import/reconciliation and later learning workflow are subsequent phases, not required for this V1 milestone.
- Architecture decisions should optimize this end-to-end coordinator workflow.

## 35. Decision Rule

Whenever there is a choice between:

**a simpler generic AI solution**

and

**a solution preserving legal translation structure, terminology, provenance and reviewer control**

choose the second.

This principle takes precedence throughout development.

---

## 36. Legacy Translation Corpus

The platform will be initialised with at least 5,000 pages of existing approved EN→MK EU Acquis translations.

These translations are authoritative reusable knowledge, not ordinary AI-generated content.

Build toward a corpus ingestion pipeline:

EN source + approved MK translation
→ document matching
→ structure extraction
→ bilingual segment alignment
→ alignment confidence and validation
→ approved translation units
→ terminology and recurring legal phrase extraction
→ provenance

Preserve:

- source document
- target document
- document identifiers and CELEX numbers where available
- segment context
- alignment provenance
- approval status

Never automatically treat uncertain alignments as trusted translation-memory entries.

The approved bilingual corpus should become the primary foundation for future MK1 generation through exact and fuzzy translation-memory retrieval, approved terminology, similar approved legal passages, and contextual retrieval.

Do not assume fine-tuning is the first solution. Build a clean aligned corpus and benchmark retrieval-based translation first. Fine-tuning may be evaluated later against a held-out benchmark.

---

## 37. Translation Page and Workload

For workload and assignment purposes:

**1 translation page = 1,500 characters excluding spaces.**

Distinguish translation pages from physical PDF pages.

Store exact character counts and calculated translation-page values. Assignment boundaries should respect legal and segment boundaries rather than splitting sentences solely to reach exactly 1,500 characters.

---

## 38. Translation Document Management

The platform is also a translation document-management system.

Preserve the original source file as immutable evidence.

Support a future workflow:

PDF or source document
→ structure and layout extraction
→ editable working document
→ segmentation
→ workload calculation
→ assignment to translators
→ AI translation
→ review
→ approval
→ final DOCX preserving source structure and layout as faithfully as possible

Preserve headings, articles, paragraphs, numbering, lists, tables, footnotes, cross-references, and other legally relevant structure wherever technically possible.

### Translator Assignments

Documents can be divided among translators by workload while preserving segment and legal boundaries.

Assignments must track:

- translator
- assigned segment or range
- character count excluding spaces
- translation-page equivalent
- status
- review and approval lifecycle
- provenance

The document remains one controlled document even when multiple translators work on different assignments.

---

## 39. MK1 and Trados Review Workflow

The AI-generated first translation is **MK1**.

The intended workflow is:

approved corpus and translation memory + terminology + EU and legal context
→ AI-generated MK1
→ working EN↔MK1 translation memory
→ Trados-compatible review package
→ translator reviews and edits MK1 in Trados
→ reviewed translation imported back
→ quality assurance and approval
→ approved translation
→ trusted reusable translation memory

The working MK1 translation memory must remain distinct from the trusted approved translation memory.

AI-generated MK1 must never automatically become approved institutional translation memory.

Preserve the relationship:

source segment → MK1 → human revision → approved translation

Design interoperability around standard CAT exchange formats and Trados compatibility. Do not invent proprietary exchange formats when established standards are suitable. Exact Trados package, bilingual, translation-memory, and terminology formats must be researched and validated before implementation.

---

## 40. Translation Knowledge Hierarchy

For future translation generation, prioritise:

1. exact approved translation-memory matches
2. high-confidence fuzzy approved translation-memory matches
3. approved terminology
4. similar approved EU Acquis passages
5. authoritative EU sources such as EUR-Lex and IATE
6. document-local legal context
7. model generation

AI should not freely regenerate text when an authoritative approved translation already provides the appropriate equivalent.

---

## 41. Evaluation

Create future evaluation architecture around a held-out approved EN→MK benchmark.

Evaluate:

- terminology accuracy
- omissions and additions
- numbers and legal references
- structural preservation
- consistency
- similarity to approved translations where appropriate
- human post-editing effort

Fine-tuning should only be adopted if evaluation shows meaningful improvement over the retrieval and translation-memory-based architecture.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
