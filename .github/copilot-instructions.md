# ImageTrimmer

For user-facing workflows, tool behavior, keyboard shortcuts, and export
guidance, see the [ImageTrimmer user guide](../docs/PROJECT_GUIDE.md). Keep this
guide focused on helping users operate the app; implementation requirements
belong in these Copilot instructions and the source code.

## Purpose and scope

Build a lightweight Vue 3 image editor for basic cropping, scaling/resizing,
and simple color adjustments. Keep the interface approachable and focused on
these operations. Do not introduce advanced editing tools, layers, accounts,
or backend services unless explicitly requested.

## UX and design workflow

- At the start of every new feature, involve
  [App UX Designer](./agents/app-ux-designer.agent.md) to define the user flow,
  interface, and acceptance criteria before implementation. For features with
  no user-facing impact, a brief assessment is sufficient.
- Also involve App UX Designer before refactoring or redesigning the UX or
  visual design of an existing feature, including layouts, controls, navigation,
  and responsive behavior.
- If App UX Designer is already the active agent, continue there rather than
  invoking another instance. It owns design decisions and delegates all coding
  to [Vue 3 Senior Developer](./agents/vue3-senior-developer.agent.md).
- App UX Designer must never implement code itself, including CSS-only tweaks,
  prototypes, tests, configuration, or fixes discovered during design review.
  Hand implementation and every subsequent coding correction to Vue 3 Senior
  Developer. If that agent cannot be invoked, stop at the design brief and
  explain the blocker; do not code as a fallback.
- Keep design-only requests design-only. If the required agent is unavailable,
  explain the limitation rather than silently skipping the design step.

## Stack and implementation

- Use Vue 3 single-file components with the Composition API and
  `<script setup lang="ts">`.
- Vue component and composable files must not exceed 500 lines. If a file
  would exceed this limit, split components into smaller focused components
  and composable logic into smaller composables or focused utilities.
- Keep TypeScript types explicit at image-processing boundaries; avoid `any`.
- Use the existing Vite setup and npm scripts. Prefer browser APIs for image
  processing; add dependencies only when they provide a clear benefit.
- Separate image transformations and coordinate calculations from UI
  components so they can be tested independently.
- Process images locally in the browser by default. Do not upload images or
  image metadata without an explicit requirement.

## Editing behavior

- Preserve the original image so adjustments can be reset without accumulating
  quality loss.
- Distinguish source-image pixel coordinates from preview/display coordinates.
  Cropping and export must remain accurate at different preview sizes.
- Validate crop bounds and resize dimensions; prevent empty crops and invalid
  or zero-sized output. Preserve aspect ratio by default when resizing.
- Keep previews consistent with exported results, including the order of crop,
  resize, and color adjustments.
- Handle image loading, decoding, processing, and export failures with clear
  user-facing feedback. Never silently discard edits.
- Release object URLs and other image resources when no longer needed. Avoid
  unnecessary full-resolution processing during continuous UI interactions.

## Interface

- Provide labeled controls, keyboard-accessible actions, and visible focus
  states. Do not rely on color alone to convey state.
- Disable image-dependent actions until an image is ready, and communicate
  loading or processing states.

## Responsive design

- Optimize for desktop screens as the primary target. Mobile device optimization
  is not a priority.
- Ensure the interface remains usable on smaller desktop screens (including
  laptop displays and narrower browser windows). Use media queries, layout
  adjustments, and component resizing where appropriate to maintain functionality
  and readability.
- Test the interface at various desktop viewport widths to confirm that controls
  remain accessible and the preview canvas scales appropriately without breaking
  the user experience.

## Validation

- Run `npm run build` after code changes; it includes TypeScript checking and
  the production build. Use `npm run dev` for interactive validation.
- Tests use Node.js's built-in `node:test` runner. When changing image behavior,
  prioritize crop coordinate conversion, resize dimensions/aspect ratios, reset
  behavior, and preview/export consistency.
- Verify image-related changes with landscape and portrait images,
  transparency, and invalid inputs as applicable.

### Git: never commit or push without permission

If multiple files have been edited, first ask: "Should the files be committed as one commit or in related commits?"

**Never** run `git commit` or `git push` (or any equivalent) on your own — not even when you have permission to execute commands without confirmation. Always ask the user first and wait for an explicit "yes" before committing or pushing. This applies to every branch, every change, and every situation, no exceptions.

Do not ask the user to provide or approve a commit message. Infer a concise, appropriate commit message from the changes.

When asking for permission or gathering additional information needed for the commit:
- Use the `vscode_askQuestions` tool to present options and collect structured user input
- Offer predefined options for commit grouping, target branch, or push destination when applicable
- Clearly describe what will happen and why you need confirmation
- Wait for the user's response before proceeding with the git operation

After a commit is successfully created, the next action must be a `vscode_askQuestions` call asking whether to push the commit(s). Do not end the turn with a status-only message or run `git push` before receiving the user's answer. Use predefined yes/no options to make this as simple as possible, and only push after an explicit yes.

If a push to GitHub over HTTPS is blocked because Git is not authenticated:
- Ask the user to authenticate through Git Credential Manager.
- Run `git credential-manager github login` in an interactive terminal so the user can complete sign-in. If the agent's terminal cannot open interactive authentication, ask the user to run the command in their own terminal.
- Wait for authentication to complete before retrying the authorized push. Authentication does not replace the explicit permission required to push.
- Never ask the user to paste passwords or access tokens into chat or store them in repository files.
