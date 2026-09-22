# AGENTS.md

## Project Overview

This repository contains the website for **Conciencia Alimentaria**, a personal educational project focused on food, nutrition, recipes, fermentation, and related topics.

The website complements the existing Conciencia Alimentaria YouTube channel.

YouTube remains an important distribution and discovery channel, while this website serves as an independent space where content can be organized, expanded, contextualized, and preserved.

The website may contain:

- videos also published on YouTube;
- embedded YouTube videos;
- written explanations accompanying videos;
- recipes;
- nutritional and food-related educational content;
- scientific or documentary sources when applicable;
- content available only on the website;
- future self-hosted or externally hosted videos.

The initial version should remain intentionally simple.

The current goal is to create a functional, responsive, maintainable MVP deployed through Vercel rather than prematurely building a complex publishing platform.

The application should evolve incrementally according to actual content and product needs.


## Product Principles

* Prioritize having a useful working website over designing a theoretically complete platform.
* Build incrementally from concrete requirements.
* Keep the first versions simple, static, and content-driven.
* Do not overengineer for hypothetical future requirements.
* Prefer improving the existing implementation over replacing it unnecessarily.
* Introduce infrastructure only when there is an actual need for it.
* Maintain a clear distinction between content, presentation, and interactive behavior.
* The website should be able to evolve without requiring an architectural redesign for ordinary additions such as new publications or categories.
* YouTube and the website are complementary. Do not assume that every website video must exist on YouTube or that every YouTube video must have an equivalent website publication.


## Existing Repository

This repository may originate from an existing Next.js project whose structure, components, configuration, or styles are being reused.

Before making changes:

* Inspect the existing implementation.
* Identify reusable components, configuration, utilities, layout patterns, and styles.
* Preserve useful technical foundations when they remain appropriate.
* Remove or replace branding, text, metadata, images, links, or content that belong to another project when they are no longer relevant.
* Do not preserve legacy content merely because it already exists.
* Do not perform broad unrelated refactors while adapting the project.
* Remove unused legacy code or assets only when their lack of use has been verified.


## Repository Principles

* Inspect the existing implementation and conventions before making changes.
* Preserve established architecture when it remains appropriate for this project.
* Make focused and incremental changes.
* Implement only what the current request requires.
* Prefer adapting existing code over creating parallel implementations.
* Reuse existing components, utilities, configuration, and patterns when appropriate.
* Prefer simple and explicit implementations over speculative abstractions.
* Do not introduce dependencies, architectural layers, or infrastructure without a concrete current need.
* Do not perform unrelated refactors or reorganizations.
* Do not modify unrelated files or features.
* When multiple valid implementations exist, prefer the simplest one that satisfies the current requirement cleanly.
* When a product assumption must be made, prefer a conservative implementation that can easily be changed later.


## Technology Stack

Current expected stack:

* Next.js with App Router
* React
* TypeScript
* Tailwind CSS
* ESLint
* Prettier
* npm
* Vercel

Use the versions and configuration actually present in the repository.

Do not replace the existing stack unless explicitly requested.


## Initial Application Scope

The initial website should remain a relatively small content-oriented application.

Expected initial capabilities may include:

* Home page.
* Site header and navigation.
* Introduction to Conciencia Alimentaria.
* Publication or video cards.
* Categorization of content.
* Individual publication pages.
* YouTube video embeds.
* Images associated with publications.
* Written descriptions or complementary information.
* Sources or references when supplied.
* Links to the Conciencia Alimentaria YouTube channel.
* Responsive layouts.
* Appropriate metadata for public pages.

Additional capabilities should be introduced only when requested.


## Architecture and Rendering

* Use Next.js App Router conventions.
* Prefer Server Components by default.
* Use Client Components only when browser APIs, interactive state, or event handlers require them.
* Keep `"use client"` boundaries as narrow as reasonably possible.
* Keep the initial application static and content-driven.
* Prefer static generation for publication pages when the available content model allows it.
* Store repeated publication data in typed structures when appropriate.
* Prefer a simple local data source for the MVP rather than introducing persistent infrastructure.
* Keep presentation components independent from the exact storage mechanism whenever doing so remains simple.
* Introduce hooks, services, stores, or additional architectural layers only when current behavior requires them.
* Do not create empty architectural layers for possible future functionality.
* Prefer local UI state when state is necessary.
* Do not introduce global state management without concrete cross-component requirements.


## Content Model

For the initial version, publication data may be stored using TypeScript data structures, JSON, Markdown, MDX, or another simple repository-based format already justified by the implementation.

Prefer a typed content model.

Possible publication properties may include, when actually required:

* `slug`
* `title`
* `summary`
* `category`
* `image`
* `youtubeId`
* `videoUrl`
* `publishedAt`
* `content`
* `sources`
* `tags`

Do not add fields simply because they might become useful someday.

The content model should support publications that:

* contain a YouTube video;
* contain no video;
* contain a video hosted outside YouTube;
* contain written content;
* combine video and written content.

Do not assume every publication uses the same media format.


## Routing

Use clear and stable public URLs.

Prefer semantic routes such as:

`/publicaciones/[slug]`

or another domain-oriented structure that is already established in the repository.

Do not expose implementation details in public URLs.

Use human-readable slugs.

Avoid introducing deeply nested route structures unless the content hierarchy actually requires them.


## Content & Media

### Images

* Store local website images under `public` using a coherent directory structure.
* Prefer domain-oriented folders such as `public/images` or `public/images/publicaciones` when useful.
* Use the Next.js `Image` component for local images whenever appropriate.
* Preserve image aspect ratios.
* Never stretch or distort images.
* Provide accurate `alt` text for informative images.
* Decorative images should use empty alternative text.
* Use responsive image sizing and appropriate `sizes` values.
* Do not rename, move, replace, or delete user-provided media without a concrete reason.

### YouTube videos

* Support responsive YouTube embeds.
* Preserve the intended video aspect ratio.
* Embeds must not overflow their containers.
* Provide an informative `title` for embedded frames.
* Do not autoplay videos unless explicitly requested.
* Avoid loading unnecessary video-related JavaScript.
* Store YouTube identifiers as data rather than duplicating large blocks of iframe markup when practical.
* Do not assume that YouTube is the canonical storage location for all future videos.

### Videos hosted outside YouTube

Directly hosted videos may be introduced later.

Unless explicitly requested:

* do not implement video hosting infrastructure;
* do not upload large video files into the Git repository;
* do not create a custom streaming backend;
* do not introduce Vercel Blob or another storage provider preemptively;
* do not implement transcoding or adaptive streaming infrastructure.

When direct video hosting becomes a current requirement, evaluate the appropriate storage and delivery mechanism for that requirement.


## Editorial and Scientific Content Integrity

Conciencia Alimentaria publishes educational content related to food and nutrition.

Code changes must not silently create or modify factual health, nutrition, medical, biochemical, or scientific claims.

### Content rules

* Do not invent nutritional facts.
* Do not invent scientific evidence.
* Do not invent references, citations, institutions, researchers, papers, URLs, or statistics.
* Do not fabricate health benefits for foods, nutrients, supplements, recipes, or dietary practices.
* Do not convert tentative or contextual claims into absolute statements.
* Do not strengthen existing claims beyond the wording supplied.
* Do not introduce medical diagnoses, treatment recommendations, or individualized medical advice.
* Do not automatically rewrite scientific content merely to make marketing copy sound stronger.

When factual content is provided by María Eugenia:

* preserve its intended meaning;
* preserve relevant qualifications and uncertainty;
* preserve supplied sources;
* do not silently substitute different scientific claims.

When factual content required by the UI has not yet been supplied, prefer an obvious placeholder rather than fabricated information.

UI placeholder copy must be clearly distinguishable from real publication content.


## Sources and References

When a publication contains sources:

* preserve the supplied source information accurately;
* keep source URLs intact unless explicitly asked to change them;
* do not generate fake references;
* present references in a readable and accessible way;
* external source links should clearly behave as links;
* use appropriate security attributes when opening external links in a new tab.

The exact citation style may remain simple unless a specific editorial format is requested.


## Language and Tone

The primary public language is Spanish unless explicitly requested otherwise.

Content should generally be:

* clear;
* understandable;
* respectful;
* educational;
* non-sensationalist;
* visually readable.

Do not turn educational content into exaggerated marketing copy.

Avoid clickbait language unless explicitly requested.

Do not introduce claims such as:

* "miracle food";
* "detox";
* "cure";
* "guaranteed";
* "100% healthy";
* "the healthiest";

unless such wording is explicitly supplied and appropriate to the requested content.

Code identifiers should continue using conventional English naming when appropriate.


## Naming and File Conventions

* Follow Next.js special file conventions such as `page.tsx`, `layout.tsx`, `loading.tsx`, and `not-found.tsx`.
* React components and their exported names use PascalCase.
* Component filenames should match their exported component names.
* Custom hooks use the `useX` naming convention.
* Types and interfaces use PascalCase.
* Use kebab-case for non-special-purpose folders when consistent with the repository.
* Prefer descriptive, domain-oriented names.
* Prefer names such as `PublicationCard`, `VideoEmbed`, or `PublicationGrid` over generic names such as `Card2`, `Component`, or `Box`.
* Avoid generic files such as `utils.ts`, `helpers.ts`, or `common.ts` unless their responsibility is genuinely shared and clearly defined.
* Colocate files that belong exclusively to one section or component.
* Existing repository conventions take precedence when they remain coherent.


## UI and Visual Direction

### General presentation

The website should communicate an identity appropriate for **Conciencia Alimentaria**.

The visual language should feel:

* approachable;
* calm;
* clear;
* educational;
* natural without relying on visual clichés;
* contemporary;
* readable.

Do not assume that generic "healthy food" imagery or green coloring is automatically appropriate.

Avoid unnecessary decorative overload.

Do not introduce a major visual redesign when the current task only requires a functional change.

As the project's visual identity becomes established:

* preserve approved typography;
* preserve approved colors;
* preserve spacing conventions;
* reuse components;
* reuse interaction patterns;
* avoid arbitrary visual values when an existing design token is available.


## UI, UX, and Accessibility

### Visual quality and consistency

* Provide a cohesive and approachable presentation.
* Maintain clear visual hierarchy.
* Keep content readable.
* Maintain balanced spacing and alignment.
* Avoid unnecessarily dense layouts.
* Keep publication cards visually consistent.
* Reuse established design tokens and patterns.
* Avoid isolated one-off styling when an existing pattern can satisfy the requirement.


### Responsive behavior

Responsive behavior is a project-wide invariant.

* Use a mobile-first approach.
* Support viewport widths from approximately `320px` through at least `1536px`.
* Support mobile, tablet, notebook, and desktop layouts.
* Prefer fluid layouts rather than device-specific implementations.
* Use existing Tailwind breakpoints when possible.
* Do not introduce arbitrary breakpoints without a content-driven reason.
* Prefer CSS and Tailwind responsive utilities over JavaScript viewport detection.
* Do not convert Server Components to Client Components merely to implement responsive layouts.
* Do not use `window.innerWidth` or user-agent detection when CSS can solve the problem.
* Prefer Grid, Flexbox, container constraints, and wrapping layouts.
* Avoid rigid dimensions that cause clipping.
* Preserve media aspect ratios.
* Publication cards must reflow coherently as available width changes.
* Multi-column layouts must reduce columns or stack when needed.
* Text must wrap without overlapping adjacent content.
* Page-level horizontal scrolling must not occur unless explicitly required.
* Do not hide page overflow merely to conceal a responsive defect.
* Navigation must remain usable on small screens.
* Videos, images, and embeds must remain fully contained within their layout.
* Do not remove essential information solely to fit smaller screens.
* Maintain semantic and keyboard order when visual layout changes.
* Layouts must remain usable with longer titles and descriptions.


### Responsive verification

For materially changed UI, inspect representative widths such as:

* `320px`
* `375px`
* `390px`
* `640px`
* `768px`
* `1024px`
* `1280px`
* `1536px`

Also inspect values near relevant breakpoint boundaries when a component changes layout there.

Verify:

* no unexpected horizontal overflow;
* no clipped or overlapping content;
* readable text;
* coherent spacing;
* appropriately scaled media;
* functional navigation;
* usable interactive controls;
* sensible layout transitions.

Use browser, rendering, screenshot, or available UI inspection tools when possible.

Do not claim visual verification unless it was actually performed.


### Semantic structure and accessibility

* Use semantic HTML.
* Use appropriate landmarks such as `header`, `nav`, `main`, `article`, `section`, `aside`, and `footer`.
* Use `article` where appropriate for individual publications.
* Maintain a logical heading hierarchy.
* Do not choose heading levels based solely on visual appearance.
* Use native interactive elements.
* Ensure interactive elements are keyboard accessible.
* Maintain predictable focus order.
* Provide visible focus states.
* Ensure touch targets are comfortably usable.
* Maintain sufficient color contrast.
* Do not communicate essential information by color alone.
* Provide meaningful alternative text for informative images.
* Use empty alternative text for decorative images.
* Ensure icon-only controls have accessible names.
* Preserve usability at increased browser zoom.
* Respect `prefers-reduced-motion`.
* Do not rely exclusively on hover for essential functionality.
* Avoid motion that interferes with reading or comprehension.


## Navigation

Navigation should reflect actual available content.

Do not create empty menu sections merely to suggest future functionality.

For the initial version, prefer a small number of meaningful destinations.

Potential navigation concepts may include:

* Inicio
* Publicaciones
* Recetas
* Nutrición
* Fermentación
* Videos
* Sobre Conciencia Alimentaria

Only implement categories or pages that currently have a concrete purpose.

Responsive navigation must remain keyboard accessible and usable without precise pointer input.


## SEO and Metadata

The website is public content and should use appropriate metadata.

Maintain:

* page titles;
* page descriptions;
* canonical URLs when appropriate;
* Open Graph metadata;
* social-sharing metadata;
* meaningful publication metadata.

Metadata must describe Conciencia Alimentaria rather than any legacy project from which this repository may have originated.

Individual publication pages should use metadata appropriate to their content when that information is available.

Do not invent publication summaries or factual metadata merely for SEO.

Prefer accurate metadata over keyword stuffing.

Do not add manipulative SEO techniques.


## Performance

Prefer the capabilities already provided by Next.js before adding optimization dependencies.

* Optimize local images with `next/image`.
* Avoid unnecessary client-side JavaScript.
* Keep Client Components focused.
* Avoid loading all video embeds eagerly when many videos appear on the same page.
* Avoid expensive animation libraries unless clearly justified.
* Avoid unnecessary third-party scripts.
* Do not sacrifice accessibility or content readability for minor performance gains.
* Prevent obvious layout shifts where practical.
* Keep the initial page reasonably lightweight.


## External Links

External links may include:

* YouTube;
* scientific publications;
* institutional sources;
* related resources.

Do not invent URLs.

Use URLs explicitly supplied by María Eugenia or verified within existing project content.

External links opening in a new browsing context should use the appropriate security relationship attributes.


## Privacy

The website should not expose private information.

Unless explicitly requested:

* do not publish personal addresses;
* do not publish private telephone numbers;
* do not expose credentials;
* do not expose private repository URLs;
* do not expose private files;
* do not expose environment secrets.

Do not add tracking technologies merely because they are commonly used on public websites.


## Secrets and Public Configuration

* Never commit credentials, tokens, private keys, or secrets.
* Do not expose sensitive values through client-side code.
* Do not expose secret values through `NEXT_PUBLIC_*`.
* Introduce environment variables only when a current feature requires them.
* Maintain `.env.example` without real secret values when environment variables are introduced.
* Never commit `.env` files containing credentials.


## Repository Privacy and Git

Do not change repository visibility unless explicitly requested.

Do not add an open-source license unless explicitly requested.

Do not publish or expose repository links merely because the website is public.

Large video files should not be committed to Git unless María Eugenia explicitly requests that storage strategy.


## Code Quality

* TypeScript strict mode is required.
* Avoid explicit `any`.
* Narrow unknown values safely.
* Keep components focused on rendering and interaction.
* Extract logic only when doing so improves clarity, reuse, or testability.
* Prefer clarity and maintainability over clever abstractions.
* Avoid unnecessary re-renders.
* Avoid duplicated state.
* Use framework capabilities before adding third-party dependencies.
* Maintain ESLint compliance.
* Maintain Prettier formatting.
* Do not suppress TypeScript or ESLint errors without a concrete documented reason.


## Dependencies

Before installing a dependency:

* determine whether the framework or existing repository already solves the problem;
* confirm that the dependency addresses a current requirement;
* avoid installing packages for trivial functionality;
* avoid overlapping libraries that solve the same problem.

Do not introduce UI frameworks, state managers, CMS SDKs, analytics systems, video platforms, or utility libraries without an actual requirement.


## Out of Scope

Unless explicitly requested, do not introduce:

* Authentication.
* Authorization.
* Login or logout.
* User accounts.
* Private user areas.
* A database.
* A CMS.
* An administrative panel.
* A custom backend.
* A custom API.
* Persistent application state.
* Global state-management libraries.
* Middleware without a concrete current requirement.
* Comment systems.
* User-generated content.
* Ratings.
* Likes.
* Social feeds.
* Newsletter infrastructure.
* Payments.
* Advertising systems.
* Behavioral analytics.
* Tracking cookies.
* Recommendation algorithms.
* Search infrastructure beyond what current content requires.
* Custom video streaming infrastructure.
* Video transcoding infrastructure.
* Infrastructure intended only for hypothetical future scale.
* Generic abstraction layers intended only for possible future reuse.


## Future Features

Future requirements may include features such as:

* additional content categories;
* search;
* filtering;
* Markdown or MDX content;
* direct video hosting;
* Vercel Blob or another media provider;
* a CMS;
* richer scientific references;
* related-publication recommendations;
* structured recipe data;
* structured metadata;
* analytics;
* additional publication formats.

Their possible future usefulness does not justify implementing them before they become actual requirements.

When implementing a current feature, avoid deliberately blocking obvious future evolution, but do not build that future functionality prematurely.


## Legacy Content

Because this project may reuse code from another application, legacy content may remain temporarily in the repository.

During relevant changes:

* identify content that clearly belongs to the previous application;
* replace legacy branding when encountered within the scope of the current work;
* verify whether legacy components or assets remain referenced before deleting them;
* do not preserve inaccurate metadata;
* do not perform repository-wide cleanup unless requested.

No public page should unintentionally expose legacy branding from another project once the corresponding area has been migrated to Conciencia Alimentaria.


## AGENTS.md Integrity

Do not modify, regenerate, replace, or rewrite this `AGENTS.md` file unless María Eugenia explicitly requests it.


## Validation

Before finalizing code changes:

* Inspect `package.json`.
* Use validation commands actually defined by the repository.
* Run validation proportional to the scope and risk of the change.
* Run linting for modified application code when available.
* Run a production build when changes affect routing, configuration, compilation, metadata, or shared application behavior.
* Run type-checking and tests when their scripts exist.
* Do not run nonexistent scripts.
* Do not claim that validation succeeded unless it was actually executed successfully.
* Report commands that fail or cannot be executed.
* Do not modify unrelated code merely to make unrelated validation pass.

Expected commands, when configured:

* Lint: `npm run lint`
* Type check: `npm run typecheck`
* Tests: `npm run test`
* Production build: `npm run build`


## Visual Review

When UI is materially changed:

* inspect desktop and mobile behavior;
* inspect intermediate widths when relevant;
* verify navigation;
* verify cards and publication grids;
* verify video embeds;
* verify image proportions;
* verify text wrapping;
* verify focus behavior;
* verify page-level overflow;
* verify metadata when page identity changes.

Do not state that a visual review was performed unless it actually was.


## Code Review

When `/review` is invoked or a code review is explicitly requested:

* Perform a read-only review unless fixes are also requested.
* Prioritize correctness, regressions, accessibility, privacy, security, content integrity, performance, and maintainability.
* Present findings in Spanish.
* Order findings by severity.
* Include precise file references.
* Explain the concrete impact of each finding.
* Keep code, identifiers, commands, API names, and literal error messages in their original language.
* Do not modify files during a read-only review.
* Create or update a Markdown review report only when explicitly requested.


## Deliverable Expectations

When completing an implementation:

* Briefly summarize the resulting behavior.
* Identify the principal files changed.
* Report validations actually executed and their outcomes.
* Mention unresolved limitations or assumptions.
* Report relevant responsive behavior when UI was modified.
* Do not claim checks, executions, visual verification, or results that were not actually performed.
